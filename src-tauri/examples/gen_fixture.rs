//! 一次性工具：生成 ~50MB 的巨型测试表格（保留在 testdata/ 下，不进 git）。
//!
//! 用法：
//!   cargo run --release --example gen_fixture            // 生成 testdata/big.xlsx + big.csv
//!   cargo run --release --example gen_fixture -- 200000  // 指定 xlsx 行数
//!
//! 内容设计：A 列为全表唯一的 16 位数字编码（条码数据列），
//! 其余列为随机字母词组与金额，保证压缩率接近真实业务表格。

use std::env;

/// 简单可复现的伪随机（xorshift），避免引入 rand
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }
    fn word(&mut self) -> String {
        const SYL: [&str; 12] = [
            "ba", "co", "de", "fi", "gu", "ha", "ki", "lo", "me", "ni", "po", "ru",
        ];
        let n = 2 + (self.next() % 3) as usize;
        (0..n)
            .map(|_| SYL[(self.next() as usize) % SYL.len()])
            .collect()
    }
    fn code16(&mut self) -> String {
        // 16 位数字：随机数让 zip 压缩率降到接近真实场景
        (0..16)
            .map(|_| char::from(b'0' + (self.next() % 10) as u8))
            .collect()
    }
}

fn main() {
    let xlsx_rows: u32 = env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(500_000);
    std::fs::create_dir_all("testdata").unwrap();

    let t0 = std::time::Instant::now();
    gen_xlsx(xlsx_rows);
    println!("big.xlsx: {xlsx_rows} rows in {t0:?}");

    let t1 = std::time::Instant::now();
    gen_csv(600_000);
    println!("big.csv: 600000 rows in {t1:?}");

    for f in ["testdata/big.xlsx", "testdata/big.csv"] {
        let size = std::fs::metadata(f).unwrap().len() as f64 / 1024.0 / 1024.0;
        println!("{f}: {size:.1} MB");
    }
}

fn gen_xlsx(rows: u32) {
    use rust_xlsxwriter::{Format, Workbook};
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    let mut wb = Workbook::new();
    let bold = Format::new().set_bold();
    let sheet = wb.add_worksheet();
    for (c, h) in ["商品编码", "商品名称", "规格", "分类", "供应商", "仓库", "单位", "单价", "库存数量", "更新日期", "备注", "批次"]
        .iter()
        .enumerate()
    {
        sheet.write_with_format(0, c as u16, *h, &bold).unwrap();
    }
    for i in 1u32..=rows {
        let r = i; // 表头占第 0 行
        sheet.write(r, 0, rng.code16()).unwrap();
        sheet.write(r, 1, format!("{}{}商品", rng.word(), rng.word())).unwrap();
        sheet.write(r, 2, format!("{}*{}*{}", 1 + rng.next() % 90, 1 + rng.next() % 90, 1 + rng.next() % 40)).unwrap();
        sheet.write(r, 3, rng.word()).unwrap();
        sheet.write(r, 4, format!("供应商{}", 1 + rng.next() % 500)).unwrap();
        let wi = (rng.next() % 8) as usize;
        sheet.write(r, 5, &"ABCDEFGH"[wi..wi + 1]).unwrap();
        sheet.write(r, 6, if rng.next().is_multiple_of(3) { "件" } else { "箱" }).unwrap();
        sheet.write(r, 7, format!("{:.2}", (rng.next() % 1_000_000) as f64 / 100.0)).unwrap();
        sheet.write(r, 8, (rng.next() % 10_000) as u32).unwrap();
        sheet.write(r, 9, format!("2026-{:02}-{:02}", 1 + rng.next() % 12, 1 + rng.next() % 28)).unwrap();
        sheet.write(r, 10, format!("备注{}{}", rng.word(), rng.next() % 1000)).unwrap();
        sheet.write(r, 11, format!("PC{}", rng.next() % 100000)).unwrap();
    }
    let _ = sheet.set_freeze_panes(1, 0);
    wb.save("testdata/big.xlsx").unwrap();
}

fn gen_csv(rows: u32) {
    use std::io::Write;
    let mut rng = Rng(0xDEAD_BEEF_CAFE_BABE);
    let mut f = std::io::BufWriter::new(std::fs::File::create("testdata/big.csv").unwrap());
    writeln!(f, "商品编码,商品名称,规格,分类,供应商,单位,单价,库存数量,批次").unwrap();
    for _ in 0..rows {
        let product = format!("{}{}商品", rng.word(), rng.word());
        let spec = format!("{}*{}*{}", 1 + rng.next() % 90, 1 + rng.next() % 90, 1 + rng.next() % 40);
        let supplier = format!("供应商{}", 1 + rng.next() % 500);
        let price = format!("{:.2}", (rng.next() % 1_000_000) as f64 / 100.0);
        let unit = if rng.next().is_multiple_of(3) { "件" } else { "箱" };
        let batch = format!("PC{}", rng.next() % 100000);
        let warehouse: String = "ABCDEFGH".chars().nth((rng.next() % 8) as usize).unwrap().to_string();
        writeln!(
            f,
            "{},{},{},{},{},{},{},{},{}",
            rng.code16(),
            product,
            spec,
            rng.word(),
            supplier,
            unit,
            price,
            rng.next() % 10_000,
            batch,
        )
        .unwrap();
        let _ = warehouse;
    }
    f.flush().unwrap();
}
