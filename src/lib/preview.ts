import JsBarcode from "jsbarcode";
import QRCode from "qrcode";
import type { BarcodeFormat, BarcodeStyle } from "./types";

/**
 * 网格内即时预览：与 Rust 生产引擎同参数、同规范渲染，
 * 视觉一致；大图预览弹窗中另展示 Rust 渲染的真实输出。
 */
export function renderBarcodeSvg(
  value: string,
  format: BarcodeFormat,
  style: BarcodeStyle,
): string | null {
  try {
    if (format === "qr") return null; // QR 走 dataURL 路径
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    JsBarcode(svg, value, {
      format: jsFormat(format),
      height: style.height,
      width: style.xdim,
      fontSize: style.fontSize,
      font: "system-ui, sans-serif",
      displayValue: style.showText,
      lineColor: style.foreground,
      background: style.background,
      margin: 0,
    });
    return svg.outerHTML;
  } catch {
    return null;
  }
}

export async function renderQrDataUrl(
  value: string,
  style: BarcodeStyle,
): Promise<string | null> {
  try {
    return await QRCode.toDataURL(value, {
      width: Math.max(120, style.height * 2),
      margin: 1,
      color: { dark: style.foreground, light: style.background },
    });
  } catch {
    return null;
  }
}

function jsFormat(format: BarcodeFormat): string {
  switch (format) {
    case "ean13":
      return "EAN13";
    case "ean8":
      return "EAN8";
    case "upca":
      return "UPC";
    case "code39":
      return "CODE39";
    case "itf":
      return "ITF";
    case "itf14":
      return "ITF14";
    default:
      return "CODE128";
  }
}
