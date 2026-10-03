//! 多格式表格读取：xlsx / xlsm / xls / xlsb / ods 走 calamine，
//! csv 走 csv crate。统一转换为字符串矩阵（保留原始行列位置）。

use calamine::{Data, Reader, open_workbook_auto};
use std::io::BufReader;

/// 源文件类别：xlsx 走原文件就地改写，其余格式重建新工作簿输出
pub fn is_xlsx(path: &str) -> bool {
    std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.eq_ignore_ascii_case("xlsx"))
        .unwrap_or(false)
}

pub const SUPPORTED_EXTENSIONS: &[&str] = &["xlsx", "xlsm", "xls", "xlsb", "ods", "csv"];

pub struct SourceSheet {
    pub name: String,
    pub rows: Vec<Vec<String>>,
}

pub struct SourceBook {
    pub path: String,
    pub sheets: Vec<SourceSheet>,
}

impl SourceBook {
    pub fn sheet(&self, index: usize) -> Result<&SourceSheet, String> {
        self.sheets
            .get(index)
            .ok_or_else(|| format!("工作表索引 {index} 不存在"))
    }
}

/// 读取任意受支持格式的整个工作簿为字符串矩阵。
pub fn read_source(path: &str) -> Result<SourceBook, String> {
    if !std::path::Path::new(path).exists() {
        return Err(format!("文件不存在: {path}"));
    }
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();

    if ext == "csv" {
        return read_csv(path);
    }
    read_calamine(path)
}

fn read_calamine(path: &str) -> Result<SourceBook, String> {
    let mut book = open_workbook_auto(path).map_err(|e| format!("打开文件失败: {e}"))?;
    let names = book.sheet_names();
    if names.is_empty() {
        return Err("文件中没有工作表".into());
    }
    let mut sheets = Vec::with_capacity(names.len());
    for name in &names {
        let range = book
            .worksheet_range(name)
            .map_err(|e| format!("读取工作表「{name}」失败: {e}"))?;
        let (start_row, start_col) = range.start().unwrap_or((0u32, 0u32));
        let height = range.height() as u32;
        let width = range.width().max(1) as u32;
        let total_rows = start_row + height;
        let total_cols = start_col + width;
        let mut rows = vec![vec![String::new(); total_cols as usize]; total_rows as usize];
        for (i, row) in range.rows().enumerate() {
            for (j, cell) in row.iter().enumerate() {
                rows[(start_row + i as u32) as usize][(start_col + j as u32) as usize] = cell_to_string(cell);
            }
        }
        sheets.push(SourceSheet {
            name: name.clone(),
            rows,
        });
    }
    Ok(SourceBook {
        path: path.to_string(),
        sheets,
    })
}

fn read_csv(path: &str) -> Result<SourceBook, String> {
    let file = std::fs::File::open(path).map_err(|e| format!("打开文件失败: {e}"))?;
    let mut reader = csv::ReaderBuilder::new()
        .has_headers(false)
        .flexible(true)
        .from_reader(BufReader::new(file));
    let mut rows: Vec<Vec<String>> = Vec::new();
    let mut width = 0usize;
    for record in reader.records() {
        let record = record.map_err(|e| format!("CSV 解析失败: {e}"))?;
        let mut row: Vec<String> = Vec::with_capacity(record.len());
        for field in record.iter() {
            row.push(field.to_string());
        }
        width = width.max(row.len());
        rows.push(row);
    }
    // 补齐为规整矩阵
    for row in rows.iter_mut() {
        row.resize(width, String::new());
    }
    if rows.is_empty() {
        return Err("CSV 文件为空".into());
    }
    let name = std::path::Path::new(path)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("Sheet1")
        .to_string();
    Ok(SourceBook {
        path: path.to_string(),
        sheets: vec![SourceSheet { name, rows }],
    })
}

/// 单元格值转字符串：整数浮点不带 .0，其余按显示形式。
fn cell_to_string(cell: &Data) -> String {
    match cell {
        Data::Empty => String::new(),
        Data::String(s) => s.clone(),
        Data::Float(f) => {
            if f.fract() == 0.0 && f.abs() < 1e15 {
                format!("{}", *f as i64)
            } else {
                format!("{f}")
            }
        }
        Data::Int(i) => format!("{i}"),
        Data::Bool(b) => {
            if *b {
                "TRUE".into()
            } else {
                "FALSE".into()
            }
        }
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn cell_to_string_formats() {
        assert_eq!(cell_to_string(&Data::Float(690123.0)), "690123");
        assert_eq!(cell_to_string(&Data::Float(1.5)), "1.5");
        assert_eq!(cell_to_string(&Data::Int(42)), "42");
        assert_eq!(cell_to_string(&Data::Bool(true)), "TRUE");
        assert_eq!(cell_to_string(&Data::Empty), "");
    }

    #[test]
    fn csv_roundtrip() {
        let path = "target/test-readers.csv";
        std::fs::write(
            path,
            "编号,数量\nSKU-001,10\nSKU-002,22\n\"含,逗号\",1\n",
        )
        .unwrap();
        let book = read_source(path).unwrap();
        assert_eq!(book.sheets.len(), 1);
        assert_eq!(book.sheets[0].rows.len(), 4);
        assert_eq!(book.sheets[0].rows[1][0], "SKU-001");
        assert_eq!(book.sheets[0].rows[1][1], "10");
        assert_eq!(book.sheets[0].rows[3][0], "含,逗号");
    }
}
