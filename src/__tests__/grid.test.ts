import { describe, expect, it } from "vitest";
import { colLetter, validateValue } from "@/lib/grid";

describe("colLetter", () => {
  it("单字母列", () => {
    expect(colLetter(1)).toBe("A");
    expect(colLetter(26)).toBe("Z");
  });
  it("双字母列", () => {
    expect(colLetter(27)).toBe("AA");
    expect(colLetter(52)).toBe("AZ");
    expect(colLetter(53)).toBe("BA");
  });
  it("三字母列", () => {
    expect(colLetter(703)).toBe("AAA");
  });
  it("非法输入返回占位", () => {
    expect(colLetter(0)).toBe("?");
  });
});

describe("validateValue", () => {
  it("EAN-13 接受 12/13 位数字", () => {
    expect(validateValue("750103131130", "ean13")).toBe("ok");
    expect(validateValue("7501031311301", "ean13")).toBe("ok");
    expect(validateValue("75010313113", "ean13")).toBe("warn");
    expect(validateValue("75010313113a", "ean13")).toBe("warn");
  });
  it("EAN-8 接受 7/8 位数字", () => {
    expect(validateValue("1234567", "ean8")).toBe("ok");
    expect(validateValue("12345678", "ean8")).toBe("ok");
    expect(validateValue("123456", "ean8")).toBe("warn");
  });
  it("UPC-A 接受 11/12 位数字", () => {
    expect(validateValue("01234567890", "upca")).toBe("ok");
    expect(validateValue("012345678905", "upca")).toBe("ok");
  });
  it("ITF-14 只接受 14 位数字", () => {
    expect(validateValue("15400141288764", "itf14")).toBe("ok");
    expect(validateValue("1540014128876", "itf14")).toBe("warn");
  });
  it("ITF 只接受数字", () => {
    expect(validateValue("1234", "itf")).toBe("ok");
    expect(validateValue("12a4", "itf")).toBe("warn");
  });
  it("Code39 接受大写字母数字与有限符号", () => {
    expect(validateValue("ABC-123", "code39")).toBe("ok");
    expect(validateValue("ABC_123", "code39")).toBe("warn");
  });
  it("CODE128 接受可打印 ASCII，拒绝中文", () => {
    expect(validateValue("ABC-123_xyz", "code128")).toBe("ok");
    expect(validateValue("中文", "code128")).toBe("warn");
  });
  it("QR 接受中文与长文本上限", () => {
    expect(validateValue("你好 Tauri", "qr")).toBe("ok");
    expect(validateValue("あ".repeat(2954), "qr")).toBe("warn");
  });
  it("空值告警", () => {
    expect(validateValue("", "code128")).toBe("warn");
    expect(validateValue("   ", "code128")).toBe("warn");
  });
});
