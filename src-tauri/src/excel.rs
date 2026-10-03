//! Excel I/O：umya-spreadsheet v3 读写现有 xlsx，保留原格式、支持插图。

use std::io::Read;
use umya_spreadsheet::reader;
use umya_spreadsheet::structs::drawing::spreadsheet::{
    EditAsValues, MarkerType, TwoCellAnchor,
};
use umya_spreadsheet::structs::Image;
use umya_spreadsheet::writer;

use crate::model::{SheetData, SheetMeta, WorkbookInfo};

pub fn open(path: &str) -> Result<umya_spreadsheet::Workbook, String> {
    if !std::path::Path::new(path).exists() {
        return Err(format!("文件不存在: {path}"));
    }
    reader::xlsx::read(path).map_err(|e| format!("打开 Excel 失败: {e}"))
}

pub fn workbook_info(book: &umya_spreadsheet::Workbook, path: &str) -> WorkbookInfo {
    let sheets = (0..book.sheet_count())
        .filter_map(|i| {
            let ws = book.sheet(i).ok()?;
            let (col, row) = ws.highest_column_and_row();
            Some(SheetMeta {
                index: i,
                name: ws.name().to_string(),
                row_count: row,
                col_count: col,
            })
        })
        .collect();
    WorkbookInfo {
        path: path.to_string(),
        sheets,
    }
}

/// 读取整个工作表为字符串矩阵（供前端表格展示）。
pub fn read_sheet(
    book: &umya_spreadsheet::Workbook,
    index: usize,
) -> Result<SheetData, String> {
    let ws = book
        .sheet(index)
        .map_err(|e| format!("工作表不存在: {e}"))?;
    let (max_col, max_row) = ws.highest_column_and_row();
    let mut rows = Vec::with_capacity(max_row as usize);
    for r in 1..=max_row {
        let mut row = Vec::with_capacity(max_col as usize);
        for c in 1..=max_col {
            let v = ws
                .cell((c, r))
                .map(|cell| cell.cell_value().value().to_string())
                .unwrap_or_default();
            row.push(v);
        }
        rows.push(row);
    }
    Ok(SheetData {
        row_count: max_row,
        col_count: max_col,
        rows,
    })
}

/// 把 PNG 嵌入到指定单元格（1-based 列行号），铺满整格。
pub fn embed_png(
    ws: &mut umya_spreadsheet::structs::Worksheet,
    col: u32,
    row: u32,
    png: &[u8],
    width_px: u32,
    height_px: u32,
) {
    // TwoCellAnchor：from = 输出单元格左上，to = 下一行同列右上。
    // 与旧版 exceljs 行为一致 —— 图片严格约束在单元格内，
    // 避免 OneCellAnchor 的 ext 尺寸在部分渲染器（WPS 等）下被错误放大。
    // 图片本体走 new_image_with_dimensions 的完整配置（拉伸/几何/非可视属性），
    // 手工组装会漏字段导致 Excel 报「已删除的部件: 绘图形状」。
    let mut from = MarkerType::default();
    from.set_coordinate(cell_coordinate(col, row));
    let mut to = MarkerType::default();
    to.set_coordinate(cell_coordinate(col + 1, row + 1));

    let mut staged = Image::default();
    staged.new_image_with_dimensions(
        height_px,
        width_px,
        &format!("barcode-{col}-{row}.png"),
        png.to_vec(),
        from.clone(),
    );
    let mut picture = staged
        .one_cell_anchor()
        .and_then(|a| a.picture())
        .cloned()
        .expect("staged picture must exist");
    // cNvPr id 需全局唯一，否则 Excel 可能提示修复
    picture
        .non_visual_picture_properties_mut()
        .non_visual_drawing_properties_mut()
        .set_id((row << 8) | col);

    let mut anchor = TwoCellAnchor::default();
    anchor.set_from_marker(from);
    anchor.set_to_marker(to);
    anchor.set_edit_as(EditAsValues::OneCell);
    anchor.set_picture(picture);

    let mut image = Image::default();
    image.set_two_cell_anchor(anchor);
    ws.add_image(image);
}

/// 用字符串矩阵构建一个新工作簿（非 xlsx 源格式走这里，输出标准 xlsx）。
pub fn build_workbook(
    sheet_name: &str,
    rows: &[Vec<String>],
) -> Result<umya_spreadsheet::Workbook, String> {
    let mut book = umya_spreadsheet::new_file();
    {
        let ws = book
            .sheet_mut(0)
            .map_err(|e| format!("初始化工作表失败: {e}"))?;
        ws.set_name(sheet_name);
        for (r, row) in rows.iter().enumerate() {
            for (c, value) in row.iter().enumerate() {
                if value.is_empty() {
                    continue;
                }
                ws.cell_mut(((c + 1) as u32, (r + 1) as u32)).set_value(value.clone());
            }
        }
    }
    Ok(book)
}

/// 应用单元格编辑到字符串矩阵。
pub fn apply_edits_to_matrix(rows: &mut [Vec<String>], edits: &[crate::model::SheetEdit]) {
    for edit in edits {
        if edit.row >= 1 && edit.col >= 1 {
            let r = (edit.row - 1) as usize;
            let c = (edit.col - 1) as usize;
            if r < rows.len() && c < rows[r].len() {
                rows[r][c] = edit.value.clone();
            }
        }
    }
}

fn cell_coordinate(col: u32, row: u32) -> String {
    format!("{}{row}", column_letter(col))
}

/// 1-based 列号转 Excel 列字母（1 -> A, 27 -> AA）。
pub fn column_letter(mut col: u32) -> String {
    let mut out = Vec::new();
    while col > 0 {
        let rem = ((col - 1) % 26) as u8;
        out.push(b'A' + rem);
        col = (col - 1) / 26;
    }
    out.reverse();
    String::from_utf8(out).unwrap()
}

pub fn write(book: &umya_spreadsheet::Workbook, path: &str) -> Result<(), String> {
    writer::xlsx::write(book, path).map_err(|e| format!("保存 Excel 失败: {e}"))
}

/// 修复 umya 的 rId 错位 bug：当 pageSetup 有打印参数（paperSize 等）但无
/// 打印机对象时，worksheet XML 里 drawing 占用 rId2，而 rels 文件只分配了
/// rId1 —— Excel 会报「已删除的部件: 绘图形状」。此函数把 rels 里 drawing
/// 关系的 Id 对齐到 XML 实际引用的值。
pub fn fix_drawing_rids(path: &str) -> Result<(), String> {
    let file = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;

    // 收集 (sheet xml 名, rels 名) 对
    let mut pairs: Vec<(String, String)> = Vec::new();
    for i in 0..zip.len() {
        let name = match zip.by_index_raw(i) {
            Ok(f) => f.name().to_string(),
            Err(_) => continue,
        };
        if name.starts_with("xl/worksheets/sheet") && name.ends_with(".xml") {
            let base = name.rsplit('/').next().unwrap_or_default().to_string();
            pairs.push((name, format!("xl/worksheets/_rels/{base}.rels")));
        }
    }

    let mut fixes: Vec<(String, String)> = Vec::new();
    for (xml_name, rels_name) in &pairs {
        let xml = match zip.by_name(xml_name) {
            Ok(f) => String::from_utf8_lossy(&read_entry(f)).into_owned(),
            Err(_) => continue,
        };
        let Some(referenced) = extract_drawing_rid(&xml) else {
            continue;
        };
        let rels = match zip.by_name(rels_name) {
            Ok(f) => String::from_utf8_lossy(&read_entry(f)).into_owned(),
            Err(_) => continue,
        };
        match extract_drawing_rel_id(&rels) {
            Some(current) if current != referenced => {
                fixes.push((rels_name.clone(), rels.replace(
                    &format!("Id=\"{current}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing\""),
                    &format!("Id=\"{referenced}\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing\""),
                )));
            }
            _ => {}
        }
    }
    drop(zip);

    if fixes.is_empty() {
        return Ok(());
    }
    rewrite_zip_entries(path, &fixes)
}

fn read_entry(mut f: zip::read::ZipFile) -> Vec<u8> {
    let mut buf = Vec::new();
    f.read_to_end(&mut buf).ok();
    buf
}

fn extract_drawing_rid(xml: &str) -> Option<String> {
    const TAG: &str = "<drawing r:id=\"";
    let idx = xml.find(TAG)?;
    let rest = &xml[idx + TAG.len()..];
    let end = rest.find('"')?;
    Some(rest[..end].to_string())
}

fn extract_drawing_rel_id(rels: &str) -> Option<String> {
    const TYPE_MARK: &str = "relationships/drawing";
    let idx = rels.find(TYPE_MARK)?;
    let before = &rels[..idx];
    const ID_MARK: &str = "Id=\"";
    let start = before.rfind(ID_MARK)? + ID_MARK.len();
    let end = before[start..].find('"')? + start;
    Some(before[start..end].to_string())
}

/// 重建 zip：替换指定 entry 内容
fn rewrite_zip_entries(path: &str, fixes: &[(String, String)]) -> Result<(), String> {
    let src = std::fs::File::open(path).map_err(|e| e.to_string())?;
    let tmp_path = format!("{path}.fix-tmp");
    let dst = std::fs::File::create(&tmp_path).map_err(|e| e.to_string())?;
    let mut ar = zip::ZipArchive::new(src).map_err(|e| e.to_string())?;
    let mut zw = zip::ZipWriter::new(dst);
    for i in 0..ar.len() {
        let mut f = ar.by_index(i).map_err(|e| e.to_string())?;
        let name = f.name().to_string();
        let opts: zip::write::SimpleFileOptions = zip::write::SimpleFileOptions::default()
            .compression_method(zip::CompressionMethod::Deflated);
        let replaced = fixes.iter().find(|(n, _)| *n == name);
        if let Some((_, data)) = replaced {
            zw.start_file(name, opts).map_err(|e| e.to_string())?;
            std::io::Write::write_all(&mut zw, data.as_bytes()).map_err(|e| e.to_string())?;
        } else {
            let mut buf = Vec::new();
            f.read_to_end(&mut buf).map_err(|e| e.to_string())?;
            zw.start_file(name, opts).map_err(|e| e.to_string())?;
            std::io::Write::write_all(&mut zw, &buf).map_err(|e| e.to_string())?;
        }
    }
    zw.finish().map_err(|e| e.to_string())?;
    std::fs::rename(&tmp_path, path).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn column_letters() {
        assert_eq!(column_letter(1), "A");
        assert_eq!(column_letter(26), "Z");
        assert_eq!(column_letter(27), "AA");
        assert_eq!(column_letter(52), "AZ");
    }
}
