/** 与 Rust 端 model.rs 对应的共享类型（serde camelCase） */

export type BarcodeFormat =
  | "code128"
  | "ean13"
  | "ean8"
  | "upca"
  | "code39"
  | "itf"
  | "itf14"
  | "qr";

export interface BarcodeStyle {
  height: number;
  xdim: number;
  fontSize: number;
  showText: boolean;
  foreground: string;
  background: string;
}

export const DEFAULT_STYLE: BarcodeStyle = {
  height: 80,
  xdim: 2,
  fontSize: 18,
  showText: true,
  foreground: "#000000",
  background: "#FFFFFF",
};

export interface SheetMeta {
  index: number;
  name: string;
  rowCount: number;
  colCount: number;
}

export interface WorkbookInfo {
  path: string;
  sheets: SheetMeta[];
}

export interface SheetData {
  rowCount: number;
  colCount: number;
  rows: string[][];
}

export interface SheetRequest {
  path: string;
  sheetIndex: number;
}

/** 预览表格中的单元格编辑，生成前按序应用到数据 */
export interface SheetEdit {
  row: number;
  col: number;
  value: string;
}

export interface GenerateRequest {
  inputPath: string;
  outputPath?: string;
  sheetIndex: number;
  dataColumn: number;
  outputColumn?: number;
  startRow: number;
  endRow?: number;
  format: BarcodeFormat;
  style: BarcodeStyle;
  pngOutputDir?: string;
  edits?: SheetEdit[];
}

export interface ProgressEvent {
  stage: string;
  current: number;
  total: number;
  message: string;
}

export interface RowError {
  row: number;
  value: string;
  error: string;
}

export interface GenerateResult {
  totalRows: number;
  success: number;
  failed: RowError[];
  outputPath: string;
  /** 源文件无法原样改写时自动降级为重建输出（原格式不保留） */
  degraded: boolean;
}

export interface PreviewRequest {
  data: string;
  format: BarcodeFormat;
  style: BarcodeStyle;
}

export const FORMAT_LABELS: Record<BarcodeFormat, string> = {
  code128: "CODE 128",
  ean13: "EAN-13",
  ean8: "EAN-8",
  upca: "UPC-A",
  code39: "Code 39",
  itf: "ITF",
  itf14: "ITF-14",
  qr: "QR 码",
};

/** 各码制的位数约束提示（用于行内校验） */
export const FORMAT_HINTS: Partial<Record<BarcodeFormat, string>> = {
  ean13: "12 或 13 位数字",
  ean8: "7 或 8 位数字",
  upca: "11 或 12 位数字",
  itf14: "14 位数字（GTIN-14）",
  code39: "大写字母、数字与 -.$/+% 空格",
};
