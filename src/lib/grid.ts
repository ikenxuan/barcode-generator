/** 1-based 列号转 Excel 列字母（1 -> A, 27 -> AA） */
export function colLetter(col: number): string {
  let n = col;
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out || "?";
}

/** 行内校验：按码制约束快速判断，给预览列提供状态 */
export function validateValue(
  value: string,
  format: string,
): "ok" | "warn" {
  const v = value.trim();
  if (!v) return "warn";
  const digits = /^\d+$/.test(v);
  switch (format) {
    case "ean13":
      return digits && (v.length === 12 || v.length === 13) ? "ok" : "warn";
    case "ean8":
      return digits && (v.length === 7 || v.length === 8) ? "ok" : "warn";
    case "upca":
      return digits && (v.length === 11 || v.length === 12) ? "ok" : "warn";
    case "itf14":
      return digits && v.length === 14 ? "ok" : "warn";
    case "itf":
      return digits ? "ok" : "warn";
    case "qr":
      return v.length <= 2953 ? "ok" : "warn";
    case "code39":
      return /^[0-9A-Z\-. $/+%]+$/.test(v.toUpperCase()) ? "ok" : "warn";
    default:
      return /^[\x20-\x7E]+$/.test(v) ? "ok" : "warn"; // CODE128: 可打印 ASCII
  }
}
