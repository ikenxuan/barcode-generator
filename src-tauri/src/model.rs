//! 前后端共享的数据模型（serde 序列化为 camelCase）。

use serde::{Deserialize, Serialize};

/// 条码码制。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum BarcodeFormat {
    Code128,
    Ean13,
    Ean8,
    Upca,
    Code39,
    Itf,
    Itf14,
    Qr,
}

impl BarcodeFormat {
    /// 该码制是否为 EAN/UPC 家族（守卫条加长、分段文字布局）。
    pub fn is_ean_family(&self) -> bool {
        matches!(self, Self::Ean13 | Self::Ean8 | Self::Upca)
    }
}

/// 条码渲染样式。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BarcodeStyle {
    /// 条高（像素）。
    pub height: u32,
    /// 窄条模块宽度（像素）。
    pub xdim: u32,
    /// 人读文字字号（像素），0 表示不渲染文字。
    pub font_size: u32,
    /// 是否在条码下方渲染人读文字。
    pub show_text: bool,
    /// 前景色（#RRGGBB）。
    pub foreground: String,
    /// 背景色（#RRGGBB）。
    pub background: String,
}

impl Default for BarcodeStyle {
    fn default() -> Self {
        Self {
            height: 80,
            xdim: 2,
            font_size: 18,
            show_text: true,
            foreground: "#000000".into(),
            background: "#FFFFFF".into(),
        }
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetMeta {
    pub index: usize,
    pub name: String,
    pub row_count: u32,
    pub col_count: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkbookInfo {
    pub path: String,
    pub sheets: Vec<SheetMeta>,
}

/// 工作表全量数据（用于前端表格展示）。
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetData {
    pub row_count: u32,
    pub col_count: u32,
    /// rows[r][c] 对应第 r+1 行、第 c+1 列（字符串形式）。
    pub rows: Vec<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetRequest {
    pub path: String,
    pub sheet_index: usize,
}

/// 用户在预览表格里做的单元格级编辑，生成前先应用到数据。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetEdit {
    pub row: u32,
    pub col: u32,
    pub value: String,
}

/// 生成请求（写回 Excel 与导出 PNG 共用）。
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateRequest {
    pub input_path: String,
    /// 输出 xlsx 路径；导出 PNG 模式下忽略。
    pub output_path: Option<String>,
    pub sheet_index: usize,
    /// 1-based 列号。
    pub data_column: u32,
    /// 1-based 列号；导出 PNG 模式下忽略。
    pub output_column: Option<u32>,
    /// 1-based 起始行（含）。
    pub start_row: u32,
    /// 1-based 结束行（含）；None 表示到最后。
    pub end_row: Option<u32>,
    pub format: BarcodeFormat,
    pub style: BarcodeStyle,
    /// 导出 PNG 的目标目录。
    pub png_output_dir: Option<String>,
    /// 预览表格中的单元格编辑（按发生顺序），生成前应用。
    #[serde(default)]
    pub edits: Vec<SheetEdit>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressEvent {
    pub stage: String,
    pub current: u32,
    pub total: u32,
    pub message: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RowError {
    pub row: u32,
    pub value: String,
    pub error: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateResult {
    /// 参与处理的行数（数据列非空）。
    pub total_rows: u32,
    pub success: u32,
    pub failed: Vec<RowError>,
    pub output_path: String,
    /// true = 源文件无法被 umya 原样改写（如非标准命名空间的 xlsx），
    /// 已自动降级为「读取数据 + 重建新工作簿」输出，原文件的复杂格式不会保留。
    #[serde(default)]
    pub degraded: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRequest {
    pub data: String,
    pub format: BarcodeFormat,
    pub style: BarcodeStyle,
}
