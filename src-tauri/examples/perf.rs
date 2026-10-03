//! 性能测试：对 testdata/ 下的巨型表格跑完整生成管线，分阶段计时。
//!
//! 用法：
//!   cargo run --release --example perf -- <文件> [数据行数上限] [--png]
//!
//! 例：
//!   cargo run --release --example perf -- testdata/big.xlsx 20000
//!   cargo run --release --example perf -- testdata/big.csv 20000 --png

use std::time::Instant;

use bargen_lib::commands::{read_sheet, read_workbook, run_generate};
use bargen_lib::model::{
    BarcodeFormat, BarcodeStyle, GenerateRequest, ProgressEvent, SheetRequest,
};
use tauri::ipc::{Channel, InvokeResponseBody};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("用法: perf <文件> [数据行数上限] [--png]");
        std::process::exit(1);
    }
    let path = args[1].clone();
    // 数据行数上限（表头之后的行）；缺省 = 全部
    let limit: Option<u32> = args.get(2).and_then(|s| s.parse().ok());
    let png_mode = args.iter().any(|a| a == "--png");

    let channel = Channel::<ProgressEvent>::new(|_: InvokeResponseBody| Ok(()));

    // 输出位置基于输入文件的目录，任意 cwd 均可运行
    let input_dir = std::path::Path::new(&path)
        .parent()
        .map(|d| d.to_path_buf())
        .unwrap_or_default();
    let out_xlsx = input_dir.join("perf-out.xlsx");
    let out_png_dir = input_dir.join("perf-png");

    let size_mb = std::fs::metadata(&path)
        .map(|m| m.len() as f64 / 1024.0 / 1024.0)
        .unwrap_or(0.0);
    println!("=== 文件: {path} ({size_mb:.1} MB) ===");

    // 阶段 1：read_workbook（表清单元数据）
    let t = Instant::now();
    let info = tauri::async_runtime::block_on(read_workbook(path.clone()))
        .expect("read_workbook 失败");
    println!(
        "read_workbook : {:>8.2?}  {} 个工作表",
        t.elapsed(),
        info.sheets.len()
    );

    // 阶段 2：read_sheet（前端表格展示路径）
    let t = Instant::now();
    let sheet = tauri::async_runtime::block_on(read_sheet(SheetRequest {
        path: path.clone(),
        sheet_index: 0,
    }))
    .expect("read_sheet 失败");
    println!(
        "read_sheet    : {:>8.2?}  {} 行 x {} 列",
        t.elapsed(),
        sheet.row_count,
        sheet.col_count
    );

    // 阶段 3：完整生成（表头占第 1 行，数据自第 2 行起取 limit 行）
    let end_row = match limit {
        Some(n) => n + 1,
        None => sheet.row_count,
    }
    .min(sheet.row_count);
    let req = GenerateRequest {
        input_path: path.clone(),
        output_path: Some(out_xlsx.to_string_lossy().into_owned()),
        sheet_index: 0,
        data_column: 1,
        output_column: Some(2),
        start_row: 2,
        end_row: Some(end_row),
        format: BarcodeFormat::Code128,
        style: BarcodeStyle::default(),
        png_output_dir: png_mode.then(|| out_png_dir.to_string_lossy().into_owned()),
        edits: vec![],
    };
    let mode = if png_mode { "png" } else { "excel" };

    let t = Instant::now();
    let result = run_generate(req, mode.to_string(), channel).expect("generate 失败");
    println!(
        "generate({mode}) : {:>8.2?}  数据 {} 行 / 成功 {} / 失败 {}（含并行渲染+嵌入+保存）",
        t.elapsed(),
        result.total_rows,
        result.success,
        result.failed.len()
    );

    let out = std::path::Path::new(&result.output_path);
    if out.is_dir() {
        let count = std::fs::read_dir(out).map(|d| d.count()).unwrap_or(0);
        println!("输出目录      : {} 个 PNG", count);
    } else if out.exists() {
        let mb = std::fs::metadata(out).map(|m| m.len()).unwrap_or(0) as f64 / 1024.0 / 1024.0;
        println!("输出文件      : {mb:.1} MB");
    }
}
