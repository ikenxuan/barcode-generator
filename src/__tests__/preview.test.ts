// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { FORMAT_LABELS, DEFAULT_STYLE } from "@/lib/types";
import { renderBarcodeSvg } from "@/lib/preview";

describe("renderBarcodeSvg", () => {
  it("CODE128 生成 SVG 字符串", () => {
    const svg = renderBarcodeSvg("ABC-123", "code128", DEFAULT_STYLE);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });
  it("无效数据返回 null（EAN13 短数字）", () => {
    expect(renderBarcodeSvg("123", "ean13", DEFAULT_STYLE)).toBeNull();
  });
  it("QR 走独立路径返回 null", () => {
    expect(renderBarcodeSvg("anything", "qr", DEFAULT_STYLE)).toBeNull();
  });
});

describe("FORMAT_LABELS 覆盖全部码制", () => {
  it("8 种码制都有标签", () => {
    expect(Object.keys(FORMAT_LABELS)).toHaveLength(8);
  });
});

describe("DEFAULT_STYLE", () => {
  it("默认样式与旧版工具行为一致（显示文字）", () => {
    expect(DEFAULT_STYLE.showText).toBe(true);
    expect(DEFAULT_STYLE.height).toBe(80);
    expect(DEFAULT_STYLE.xdim).toBe(2);
  });
});
