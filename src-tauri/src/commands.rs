//! Tauri 命令层：参数校验、进度上报、结果汇总。
//! CPU/IO 密集的工作放入 spawn_blocking，避免阻塞主线程。

use base64::Engine as _;
use rayon::prelude::*;
use tauri::async_runtime::spawn_blocking;
use tauri::ipc::Channel;

use crate::barcode;
use crate::excel;
use crate::model::*;
use crate::readers;

/// 打开工作簿，返回工作表清单（所有支持的格式统一走 readers）。
#[tauri::command]
pub async fn read_workbook(path: String) -> Result<WorkbookInfo, String> {
    spawn_blocking(move || {
        let source = readers::read_source(&path)?;
        let sheets = source
            .sheets
            .iter()
            .enumerate()
            .map(|(i, s)| SheetMeta {
                index: i,
                name: s.name.clone(),
                row_count: s.rows.len() as u32,
                col_count: s.rows.first().map(|r| r.len()).unwrap_or(0) as u32,
            })
            .collect();
        Ok(WorkbookInfo { path, sheets })
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

/// 读取某个工作表的全量数据。
#[tauri::command]
pub async fn read_sheet(req: SheetRequest) -> Result<SheetData, String> {
    spawn_blocking(move || {
        let source = readers::read_source(&req.path)?;
        let sheet = source.sheet(req.sheet_index)?;
        let rows = sheet.rows.clone();
        Ok(SheetData {
            row_count: rows.len() as u32,
            col_count: rows.first().map(|r| r.len()).unwrap_or(0) as u32,
            rows,
        })
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

/// 单张真实输出预览（Rust 引擎渲染，即写进 Excel 的原图）。
#[tauri::command]
pub async fn render_preview(req: PreviewRequest) -> Result<String, String> {
    spawn_blocking(move || {
        let png = barcode::render_png(&req.data, req.format, &req.style)?;
        let encoded = base64::engine::general_purpose::STANDARD.encode(png);
        Ok(encoded)
    })
    .await
    .map_err(|e| format!("任务失败: {e}"))?
}

#[derive(Debug)]
struct RowJob {
    row: u32,
    value: String,
}

/// 生成条形码：
/// - mode = excel：嵌入输出列并另存 xlsx（xlsx 源就地改写，其余格式重建新工作簿）
/// - mode = png：批量导出独立 PNG 文件
#[tauri::command]
pub async fn generate(
    req: GenerateRequest,
    mode: String,
    on_progress: Channel<ProgressEvent>,
) -> Result<GenerateResult, String> {
    spawn_blocking(move || run_generate(req, mode, on_progress))
        .await
        .map_err(|e| format!("任务失败: {e}"))?
}

/// 源数据：xlsx 就地改写（umya 工作簿），其余格式为字符串矩阵
enum Source {
    InPlace {
        book: Box<umya_spreadsheet::Workbook>,
        sheet_index: usize,
    },
    Matrix(Vec<Vec<String>>),
}

pub fn run_generate(
    req: GenerateRequest,
    mode: String,
    on_progress: Channel<ProgressEvent>,
) -> Result<GenerateResult, String> {
    let png_mode = mode == "png";
    let out_col = req.output_column.unwrap_or(2);
    if !png_mode && out_col == req.data_column {
        return Err("输出列不能与数据列相同".into());
    }
    if req.data_column == 0 {
        return Err("数据列号从 1 开始".into());
    }

    let send = |stage: &str, current: u32, total: u32, message: &str| {
        let _ = on_progress.send(ProgressEvent {
            stage: stage.to_string(),
            current,
            total,
            message: message.to_string(),
        });
    };

    send("open", 0, 1, "正在打开文件…");
    let is_xlsx_source = readers::is_xlsx(&req.input_path);
    let mut degraded = false;
    let (source, jobs, total) = if !png_mode && is_xlsx_source {
        // xlsx 就地改写：需要 umya 打开原簿（大文件的固定开销）
        // umya 对少数非标准结构的 xlsx 兼容不足（如前缀命名空间），
        // 失败时自动降级为「calamine 读数据 + 重建新工作簿」，保证功能不中断
        match prepare_in_place(&req) {
            Ok(v) => v,
            Err(_) => {
                degraded = true;
                prepare_from_matrix(&req)?
            }
        }
    } else {
        // 其余情况（含 PNG 导出）：calamine 读取，快得多
        prepare_from_matrix(&req)?
    };

    if total == 0 {
        return Err("指定范围内没有数据".into());
    }

    // 并行渲染
    send("render", 0, total, "正在渲染条形码…");
    let style = req.style.clone();
    let format = req.format;
    let rendered: Vec<(u32, String, Result<Vec<u8>, String>)> = jobs
        .into_par_iter()
        .map(|job| {
            let result = barcode::render_png(&job.value, format, &style);
            (job.row, job.value, result)
        })
        .collect();

    if png_mode {
        run_png_export(req, rendered, total, &send)
    } else {
        run_excel_embed(req, out_col, source, rendered, total, degraded, &send)
    }
}

type Rendered = Vec<(u32, String, Result<Vec<u8>, String>)>;

/// xlsx 源：就地改写。先应用单元格编辑，再从工作簿收集数据行。
fn prepare_in_place(
    req: &GenerateRequest,
) -> Result<(Source, Vec<RowJob>, u32), String> {
    let mut book = excel::open(&req.input_path)?;
    {
        let ws = book
            .sheet_mut(req.sheet_index)
            .map_err(|e| format!("工作表不存在: {e}"))?;
        for edit in &req.edits {
            if edit.row >= 1 && edit.col >= 1 {
                ws.cell_mut((edit.col, edit.row)).set_value(edit.value.clone());
            }
        }
        let (max_col, max_row) = ws.highest_column_and_row();
        if req.data_column > max_col {
            return Err(format!(
                "数据列 {} 超出范围（当前表共 {max_col} 列）",
                excel::column_letter(req.data_column)
            ));
        }
        let end_row = req.end_row.unwrap_or(max_row).min(max_row);
        let start_row = req.start_row.max(1);
        if start_row > end_row {
            return Err("起始行不能大于结束行".into());
        }
        let mut jobs = Vec::new();
        for r in start_row..=end_row {
            let value = ws
                .cell((req.data_column, r))
                .map(|cell| cell.cell_value().value().to_string())
                .unwrap_or_default();
            if !value.trim().is_empty() {
                jobs.push(RowJob { row: r, value });
            }
        }
        let total = jobs.len() as u32;
        Ok((Source::InPlace { book: Box::new(book), sheet_index: req.sheet_index }, jobs, total))
    }
}

/// 非 xlsx 源：calamine/csv 读取为矩阵，应用编辑后收集数据行。
fn prepare_from_matrix(
    req: &GenerateRequest,
) -> Result<(Source, Vec<RowJob>, u32), String> {
    let source_book = readers::read_source(&req.input_path)?;
    let sheet = source_book.sheet(req.sheet_index)?;
    let mut rows = sheet.rows.clone();
    excel::apply_edits_to_matrix(&mut rows, &req.edits);

    let max_row = rows.len() as u32;
    let max_col = rows.first().map(|r| r.len()).unwrap_or(0) as u32;
    if req.data_column > max_col {
        return Err(format!(
            "数据列 {} 超出范围（当前表共 {max_col} 列）",
            excel::column_letter(req.data_column)
        ));
    }
    let end_row = req.end_row.unwrap_or(max_row).min(max_row);
    let start_row = req.start_row.max(1);
    if start_row > end_row {
        return Err("起始行不能大于结束行".into());
    }
    let mut jobs = Vec::new();
    for r in start_row..=end_row {
        let value = rows
            .get((r - 1) as usize)
            .and_then(|row| row.get((req.data_column - 1) as usize))
            .cloned()
            .unwrap_or_default();
        if !value.trim().is_empty() {
            jobs.push(RowJob { row: r, value });
        }
    }
    let total = jobs.len() as u32;
    Ok((Source::Matrix(rows), jobs, total))
}

fn run_excel_embed(
    req: GenerateRequest,
    out_col: u32,
    source: Source,
    rendered: Rendered,
    total: u32,
    degraded: bool,
    send: &dyn Fn(&str, u32, u32, &str),
) -> Result<GenerateResult, String> {
    send("embed", 0, total, "正在写入工作表…");
    let mut failed = Vec::new();
    let mut success: u32 = 0;
    let mut max_png_w: u32 = 0;
    let mut max_png_h: u32 = 0;

    // 非 xlsx 源：先把矩阵写进新工作簿（输出文件名补 .xlsx 后缀）
    let mut book = match source {
        Source::InPlace { mut book, sheet_index } => {
            let output_path = normalize_output(&req)?;
            if same_file(&req.input_path, &output_path) {
                return Err("输出文件不能覆盖源文件，请换一个文件名".into());
            }
            let _ = book.sheet_mut(sheet_index).map_err(|e| e.to_string());
            (book, sheet_index, output_path)
        }
        Source::Matrix(rows) => {
            let output_path = normalize_output(&req)?;
            let sheet_name = std::path::Path::new(&req.input_path)
                .file_stem()
                .and_then(|s| s.to_str())
                .map(sanitize_sheet_name)
                .unwrap_or_else(|| "Sheet1".into());
            let book = excel::build_workbook(&sheet_name, &rows)?;
            (Box::new(book), 0usize, output_path)
        }
    };
    let output_path = book.2.clone();

    let ws = book
        .0
        .sheet_mut(book.1)
        .map_err(|e| format!("工作表不存在: {e}"))?;

    for (i, (row, value, result)) in rendered.iter().enumerate() {
        match result {
            Ok(png_bytes) => {
                let (w, h) = png_dimensions(png_bytes);
                max_png_w = max_png_w.max(w);
                max_png_h = max_png_h.max(h);
                excel::embed_png(ws, out_col, *row, png_bytes, w, h);
                // 数据列内容居中
                let align = ws.style_mut((req.data_column, *row)).alignment_mut();
                align.set_horizontal(umya_spreadsheet::structs::HorizontalAlignmentValues::Center);
                align.set_vertical(umya_spreadsheet::structs::VerticalAlignmentValues::Center);
                success += 1;
            }
            Err(e) => failed.push(RowError {
                row: *row,
                value: value.clone(),
                error: e.clone(),
            }),
        }
        if (i as u32 + 1).is_multiple_of(20) || i as u32 + 1 == total {
            send("embed", i as u32 + 1, total, "正在写入工作表…");
        }
    }

    // 列宽/行高按图片尺寸适配
    if success > 0 {
        let width_chars = (max_png_w as f64 / 7.0 + 1.5).round().clamp(12.0, 120.0);
        ws.column_dimension_mut(&excel::column_letter(out_col))
            .set_width(width_chars);
        let row_height_pt = (max_png_h as f64 * 0.75 + 4.0).clamp(15.0, 409.0);
        for (row, _, result) in &rendered {
            if result.is_ok() {
                ws.row_dimension_mut(*row).set_height(row_height_pt);
            }
        }
    }

    send("save", 0, 1, "正在保存文件…");
    excel::write(&book.0, &output_path)?;
    excel::fix_drawing_rids(&output_path)?;

    Ok(GenerateResult {
        total_rows: total,
        success,
        failed,
        output_path,
        degraded,
    })
}

/// 输出文件名规范化：无后缀补 .xlsx，非 xlsx 后缀报错（输出只可能是 xlsx）。
fn normalize_output(req: &GenerateRequest) -> Result<String, String> {
    let mut path = req.output_path.clone().unwrap_or_else(|| "output.xlsx".into());
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    match ext {
        None => path.push_str(".xlsx"),
        Some(e) if e == "xlsx" => {}
        Some(e) => return Err(format!("输出只能是 .xlsx（当前给了 .{e}）")),
    }
    Ok(path)
}

fn sanitize_sheet_name(raw: &str) -> String {
    let cleaned: String = raw
        .chars()
        .map(|c| match c {
            c if ['[', ']', ':', '*', '?', '/'].contains(&c) || c == char::from_u32(92).unwrap() => '_',
            c => c,
        })
        .take(31)
        .collect();
    if cleaned.is_empty() {
        "Sheet1".into()
    } else {
        cleaned
    }
}

fn run_png_export(
    req: GenerateRequest,
    rendered: Rendered,
    total: u32,
    send: &dyn Fn(&str, u32, u32, &str),
) -> Result<GenerateResult, String> {
    let dir = req.png_output_dir.clone().ok_or("缺少 PNG 输出目录")?;
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建输出目录失败: {e}"))?;

    send("save", 0, total, "正在写出 PNG…");
    let mut failed = Vec::new();
    let mut success: u32 = 0;
    for (i, (row, value, result)) in rendered.iter().enumerate() {
        match result {
            Ok(bytes) => {
                let name = safe_filename(value, *row);
                let path = std::path::Path::new(&dir).join(format!("{name}.png"));
                if let Err(e) = std::fs::write(&path, bytes) {
                    failed.push(RowError {
                        row: *row,
                        value: value.clone(),
                        error: format!("写文件失败: {e}"),
                    });
                } else {
                    success += 1;
                }
            }
            Err(e) => failed.push(RowError {
                row: *row,
                value: value.clone(),
                error: e.clone(),
            }),
        }
        if (i as u32 + 1).is_multiple_of(20) || i as u32 + 1 == total {
            send("save", i as u32 + 1, total, "正在写出 PNG…");
        }
    }

    Ok(GenerateResult {
        total_rows: total,
        success,
        failed,
        output_path: dir,
        degraded: false,
    })
}

fn png_dimensions(png: &[u8]) -> (u32, u32) {
    // PNG IHDR: 8 字节签名 + 4 长度 + 4 类型 + 宽高各 4 字节（大端）
    if png.len() >= 24 {
        let w = u32::from_be_bytes([png[16], png[17], png[18], png[19]]);
        let h = u32::from_be_bytes([png[20], png[21], png[22], png[23]]);
        (w, h)
    } else {
        (0, 0)
    }
}

fn safe_filename(value: &str, row: u32) -> String {
    let forbidden: [char; 9] = ['/', char::from_u32(92).unwrap(), ':', '*', '?', '"', '<', '>', '|'];
    let cleaned: String = value
        .trim()
        .chars()
        .map(|c| {
            if forbidden.contains(&c) || (c as u32) < 32 {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned: String = cleaned.chars().take(60).collect();
    if cleaned.is_empty() {
        format!("row-{row}")
    } else {
        format!("{row:04}-{cleaned}")
    }
}

fn same_file(a: &str, b: &str) -> bool {
    match (std::fs::canonicalize(a), std::fs::canonicalize(b)) {
        (Ok(pa), Ok(pb)) => pa == pb,
        _ => a == b,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tauri::ipc::{Channel, InvokeResponseBody};

    fn noop_channel() -> Channel<ProgressEvent> {
        Channel::new(|_: InvokeResponseBody| Ok(()))
    }

    /// 构造 xlsx 源文件：A1 表头，A2..A10 数据（第 6 行为非法数据）
    fn make_source(path: &str) {
        let mut book = umya_spreadsheet::new_file();
        let ws = book.sheet_mut(0).unwrap();
        ws.cell_mut((1, 1)).set_value("编号");
        for i in 2..=10 {
            let v: String = if i == 6 {
                "中文数据".to_string() // CODE128 无法编码 → 应计入 failed
            } else {
                format!("SKU-{i:04}")
            };
            ws.cell_mut((1, i)).set_value(v);
        }
        std::fs::create_dir_all(std::path::Path::new(path).parent().unwrap()).unwrap();
        umya_spreadsheet::writer::xlsx::write(&book, path).unwrap();
    }

    #[test]
    fn excel_generation_end_to_end() {
        let src = "target/test-src-excel.xlsx";
        let out = "target/test-out.xlsx";
        let _ = std::fs::remove_file(out);
        make_source(src);

        let req = GenerateRequest {
            input_path: src.into(),
            output_path: Some(out.into()),
            sheet_index: 0,
            data_column: 1,
            output_column: Some(2),
            start_row: 2,
            end_row: None,
            format: BarcodeFormat::Code128,
            style: BarcodeStyle::default(),
            png_output_dir: None,
            edits: vec![],
        };
        let result = run_generate(req, "excel".into(), noop_channel()).unwrap();
        assert_eq!(result.total_rows, 9);
        assert_eq!(result.success, 8, "9 行数据、1 行无法编码");
        assert_eq!(result.failed.len(), 1);
        assert_eq!(result.failed[0].row, 6);

        let book = umya_spreadsheet::reader::xlsx::read(out).unwrap();
        let ws = book.sheet(0).unwrap();
        for r in 2..=10 {
            let has = ws.image((2, r)).is_some();
            if r == 6 {
                assert!(!has, "第 6 行不应有插图");
            } else {
                assert!(has, "第 {r} 行应有插图");
            }
        }
    }

    #[test]
    fn png_export_end_to_end() {
        let src = "target/test-src-png.xlsx";
        let dir = "target/test-png";
        let _ = std::fs::remove_dir_all(dir);
        make_source(src);

        let req = GenerateRequest {
            input_path: src.into(),
            output_path: None,
            sheet_index: 0,
            data_column: 1,
            output_column: None,
            start_row: 2,
            end_row: None,
            format: BarcodeFormat::Code128,
            style: BarcodeStyle::default(),
            png_output_dir: Some(dir.into()),
            edits: vec![],
        };
        let result = run_generate(req, "png".into(), noop_channel()).unwrap();
        assert_eq!(result.success, 8);
        let count = std::fs::read_dir(dir).unwrap().count();
        assert_eq!(count, 8);
        assert!(std::path::Path::new(dir).join("0002-SKU-0002.png").exists());
    }

    #[test]
    fn csv_source_builds_new_xlsx() {
        // CSV 源 → 重建新工作簿输出 xlsx
        let csv = "target/test-src-e2e.csv";
        let out = "target/test-csv-out.xlsx";
        let _ = std::fs::remove_file(out);
        std::fs::write(csv, "编号\nSKU-A1\nSKU-A2\n\n").unwrap();

        let req = GenerateRequest {
            input_path: csv.into(),
            output_path: Some(out.into()),
            sheet_index: 0,
            data_column: 1,
            output_column: Some(2),
            start_row: 2,
            end_row: None,
            format: BarcodeFormat::Code128,
            style: BarcodeStyle::default(),
            png_output_dir: None,
            edits: vec![],
        };
        let result = run_generate(req, "excel".into(), noop_channel()).unwrap();
        assert_eq!(result.total_rows, 2, "空行应被跳过");
        assert_eq!(result.success, 2);

        let book = umya_spreadsheet::reader::xlsx::read(out).unwrap();
        let ws = book.sheet(0).unwrap();
        assert_eq!(ws.cell((1, 1)).unwrap().cell_value().value(), "编号");
        assert_eq!(ws.cell((1, 2)).unwrap().cell_value().value(), "SKU-A1");
        assert!(ws.image((2, 2)).is_some());
        assert!(ws.image((2, 3)).is_some());
    }

    #[test]
    fn cell_edits_applied_before_generation() {
        // SetCell 编辑应在生成前生效
        let src = "target/test-src-edits.xlsx";
        let out = "target/test-edits-out.xlsx";
        let _ = std::fs::remove_file(out);
        make_source(src);

        let req = GenerateRequest {
            input_path: src.into(),
            output_path: Some(out.into()),
            sheet_index: 0,
            data_column: 1,
            output_column: Some(2),
            start_row: 2,
            end_row: Some(2),
            format: BarcodeFormat::Code128,
            style: BarcodeStyle::default(),
            png_output_dir: None,
            edits: vec![SheetEdit {
                row: 2,
                col: 1,
                value: "EDITED-999".into(),
            }],
        };
        let result = run_generate(req, "excel".into(), noop_channel()).unwrap();
        assert_eq!(result.success, 1);

        let book = umya_spreadsheet::reader::xlsx::read(out).unwrap();
        let ws = book.sheet(0).unwrap();
        assert_eq!(
            ws.cell((1, 2)).unwrap().cell_value().value(),
            "EDITED-999",
            "编辑值应写入输出文件"
        );
        assert!(ws.image((2, 2)).is_some());
    }

    #[test]
    fn non_xlsx_output_extension_rejected() {
        let csv = "target/test-src-ext.csv";
        std::fs::write(csv, "编号\nSKU-A1\n").unwrap();
        let req = GenerateRequest {
            input_path: csv.into(),
            output_path: Some("target/bad-name.xlsx.txt".into()),
            sheet_index: 0,
            data_column: 1,
            output_column: Some(2),
            start_row: 1,
            end_row: None,
            format: BarcodeFormat::Code128,
            style: BarcodeStyle::default(),
            png_output_dir: None,
            edits: vec![],
        };
        let err = run_generate(req, "excel".into(), noop_channel()).unwrap_err();
        assert!(err.contains("只能是 .xlsx"));
    }

    /// 在运行时生成「前缀命名空间」结构的 xlsx：workbook.xml 使用 x: 前缀
    /// 而非默认命名空间 —— 模拟部分 WPS/第三方工具的产物（umya 读不出其工作表）。
    /// 测试夹具不入 git，每次现场生成到 target/。
    fn write_prefixed_ns_xlsx(path: &str) {
        use std::io::Write as _;
        let file = std::fs::File::create(path).unwrap();
        let mut zw = zip::ZipWriter::new(file);
        let opts: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default();

        let content_types = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>"#;
        let root_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>"#;
        // 前缀命名空间的 workbook.xml（复现 umya 兼容性缺陷的关键）
        let workbook = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<x:workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:x="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><x:sheets><x:sheet xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" name="Sheet1" sheetId="1" r:id="rId1" /></x:sheets></x:workbook>"#;
        let workbook_rels = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>"#;
        let styles = r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font/></fonts><fills count="1"><fill/></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf/></cellXfs></styleSheet>"#;

        let mut sheet = String::from(r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>"#);
        sheet.push_str(r#"<row r="1"><c r="A1" t="inlineStr"><is><t>商品编号</t></is></c></row>"#);
        for i in 2..=10u32 {
            sheet.push_str(&format!(
                r#"<row r="{i}"><c r="A{i}"><v>{}</v></c></row>"#,
                690000000000u64 + i as u64 * 137
            ));
        }
        sheet.push_str("</sheetData></worksheet>");

        for (name, data) in [
            ("[Content_Types].xml", content_types),
            ("_rels/.rels", root_rels),
            ("xl/workbook.xml", workbook),
            ("xl/_rels/workbook.xml.rels", workbook_rels),
            ("xl/styles.xml", styles),
            ("xl/worksheets/sheet1.xml", sheet.as_str()),
        ] {
            zw.start_file(name, opts).unwrap();
            zw.write_all(data.as_bytes()).unwrap();
        }
        zw.finish().unwrap();
    }

    #[test]
    fn prefixed_ns_xlsx_falls_back_to_rebuild() {
        let src = "target/test-prefixed-src.xlsx";
        write_prefixed_ns_xlsx(src);
        let out = "target/test-prefixed-out.xlsx";
        let _ = std::fs::remove_file(out);
        let req = GenerateRequest {
            input_path: src.into(),
            output_path: Some(out.into()),
            sheet_index: 0,
            data_column: 1,
            output_column: Some(2),
            start_row: 2,
            end_row: None,
            format: BarcodeFormat::Code128,
            style: BarcodeStyle::default(),
            png_output_dir: None,
            edits: vec![],
        };
        let result = run_generate(req, "excel".into(), noop_channel()).unwrap();
        assert_eq!(result.total_rows, 9, "A 列数字编号应全部生成");
        assert_eq!(result.success, 9);
        assert!(result.degraded, "应标记为降级输出");

        let book = umya_spreadsheet::reader::xlsx::read(out).unwrap();
        let ws = book.sheet(0).unwrap();
        assert!(ws.image((2, 2)).is_some(), "B2 应有插图");
        assert_eq!(
            ws.cell((1, 1)).unwrap().cell_value().value(),
            "商品编号",
            "表头应保留"
        );
    }

    #[test]
    fn rejects_overwriting_source() {
        let src = "target/test-src-overwrite.xlsx";
        make_source(src);
        let req = GenerateRequest {
            input_path: src.into(),
            output_path: Some(src.into()),
            sheet_index: 0,
            data_column: 1,
            output_column: Some(2),
            start_row: 2,
            end_row: None,
            format: BarcodeFormat::Code128,
            style: BarcodeStyle::default(),
            png_output_dir: None,
            edits: vec![],
        };
        let err = run_generate(req, "excel".into(), noop_channel()).unwrap_err();
        assert!(err.contains("不能覆盖源文件"));
    }
}
