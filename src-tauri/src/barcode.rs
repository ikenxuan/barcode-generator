//! 条码渲染：barcoders 负责各码制的编码规范，本模块负责把编码后的
//! 1/0 模块流绘制成位图（静区、守卫条加长、ITF-14 保护框、人读文字），
//! 最终输出 PNG 字节。

use std::io::Cursor;
use std::sync::OnceLock;

use ab_glyph::{Font, FontRef, PxScale, ScaleFont};
use image::{ImageBuffer, ImageFormat, Rgba, RgbaImage};
use imageproc::drawing::{draw_text_mut, text_size};

use crate::model::{BarcodeFormat, BarcodeStyle};

/// 打包进二进制的 Noto Sans 静态字重（OFL 许可，见 fonts/OFL.txt），
/// 保证任何机器上渲染结果一致。不用变量字体 —— ab_glyph 对变量字体
/// 的字形轮廓渲染不可靠，会出现文字静默丢失。
static FONT_DATA: &[u8] = include_bytes!("../fonts/NotoSans-Regular.ttf");

fn font() -> &'static FontRef<'static> {
    static FONT: OnceLock<FontRef<'static>> = OnceLock::new();
    FONT.get_or_init(|| FontRef::try_from_slice(FONT_DATA).expect("内置字体解析失败"))
}

/// 渲染为 PNG 字节。
pub fn render_png(data: &str, format: BarcodeFormat, style: &BarcodeStyle) -> Result<Vec<u8>, String> {
    let img = render_image(data, format, style)?;
    let mut bytes = Vec::new();
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut Cursor::new(&mut bytes), ImageFormat::Png)
        .map_err(|e| format!("PNG 编码失败: {e}"))?;
    Ok(bytes)
}

/// 渲染为 RGBA 位图（导出 PNG 与预览共用）。
pub fn render_image(
    data: &str,
    format: BarcodeFormat,
    style: &BarcodeStyle,
) -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>, String> {
    if data.trim().is_empty() {
        return Err("数据为空".into());
    }
    if format == BarcodeFormat::Qr {
        return render_qr(data, style);
    }

    let modules = encode(data, format)?;
    let xdim = style.xdim.max(1);
    let bar_h = style.height.max(10);
    let quiet = 10 * xdim; // 左右静区（按规范 10 个窄条宽度）
    // 四周透明边距：图片以 TwoCellAnchor 拉伸铺满单元格，
    // 边距区域不填充背景，单元格网格线/边框得以透出
    const EDGE_MARGIN: u32 = 3;

    // 文字区高度与守卫条加长量
    let (text_gap, text_h) = text_metrics(style);
    let guard_ext = if style.show_text && text_h > 0 { text_h } else { 0 };
    let body_h = bar_h + if style.show_text { text_gap + text_h } else { 0 };
    let width = quiet * 2 + modules.len() as u32 * xdim;
    let total_w = width + EDGE_MARGIN * 2;
    let total_h = body_h + EDGE_MARGIN * 2;

    let mut img = RgbaImage::from_pixel(total_w, total_h, Rgba([0, 0, 0, 0]));
    // 背景只填充内部区域，四周留透明
    fill_rect(&mut img, EDGE_MARGIN, EDGE_MARGIN, width, body_h, style.background_color());

    // 条：普通条画到 bar_h，守卫条加长到文字区底部
    for (i, &m) in modules.iter().enumerate() {
        if m != 1 {
            continue;
        }
        let x = EDGE_MARGIN + quiet + i as u32 * xdim;
        let h = if format.is_ean_family() && is_guard(format, i as u32) {
            bar_h + guard_ext
        } else {
            bar_h
        };
        fill_rect(&mut img, x, EDGE_MARGIN, xdim, h, style.foreground_color());
    }

    // ITF-14 保护框：条区顶部与底部各一条通宽横杠
    if format == BarcodeFormat::Itf14 {
        let t = (2 * xdim).max(2);
        fill_rect(&mut img, EDGE_MARGIN, EDGE_MARGIN, width, t, style.foreground_color());
        fill_rect(&mut img, EDGE_MARGIN, EDGE_MARGIN + bar_h - t, width, t, style.foreground_color());
    }

    // 人读文字
    if style.show_text && text_h > 0 {
        let layout = TextLayout {
            style,
            quiet,
            xdim,
            bar_h,
            text_gap,
        };
        draw_human_readable(data, format, &layout, EDGE_MARGIN, &mut img);
    }

    Ok(img)
}

fn text_metrics(style: &BarcodeStyle) -> (u32, u32) {
    if !style.show_text || style.font_size == 0 {
        return (0, 0);
    }
    let fs = style.font_size;
    let gap = (fs / 4).max(4);
    let text_h = (fs as f32 * 1.35).round() as u32;
    (gap, text_h)
}

/// EAN/UPC 家族的守卫条位置（模块索引区间）。
fn is_guard(format: BarcodeFormat, module: u32) -> bool {
    match format {
        BarcodeFormat::Ean13 | BarcodeFormat::Upca => {
            (0..3).contains(&module) || (45..50).contains(&module) || (92..95).contains(&module)
        }
        BarcodeFormat::Ean8 => {
            (0..3).contains(&module) || (32..37).contains(&module) || (64..67).contains(&module)
        }
        _ => false,
    }
}

fn fill_rect(img: &mut RgbaImage, x: u32, y: u32, w: u32, h: u32, color: Rgba<u8>) {
    let iw = img.width();
    let ih = img.height();
    for py in y..(y + h).min(ih) {
        for px in x..(x + w).min(iw) {
            img.put_pixel(px, py, color);
        }
    }
}

/// 把人读文字画到条码下方。普通码制单行居中；
/// EAN/UPC 家族按规范分段定位，首尾数字落在静区内。
/// 人读文字的布局参数（避免长参数列表）
struct TextLayout<'a> {
    style: &'a BarcodeStyle,
    quiet: u32,
    xdim: u32,
    bar_h: u32,
    text_gap: u32,
}

fn draw_human_readable(
    data: &str,
    format: BarcodeFormat,
    layout: &TextLayout,
    edge: u32,
    img: &mut RgbaImage,
) {
    let BarcodeStyle { font_size, .. } = layout.style;
    let quiet = layout.quiet;
    let xdim = layout.xdim;
    let bar_h = layout.bar_h;
    let text_gap = layout.text_gap;
    let scale = PxScale::from(*font_size as f32);
    let color = layout.style.foreground_color();
    let y_top = (edge + bar_h + text_gap) as i32;
    let font = font();

    // 缩放后的行高（像素）—— ascent_unscaled() 返回的是字体单位（如 1069），
    // 直接当像素用会把文字画出图片外（曾经的人读文字丢失 bug）
    let scaled = font.as_scaled(scale);
    let draw_centered = |text: &str, cx: i32, y: i32, img: &mut RgbaImage| {
        if text.is_empty() {
            return;
        }
        let (tw, th) = text_size(scale, font, text);
        let x = cx - tw as i32 / 2;
        // y 以文字顶部对齐，向下修正字体内上方的空隙
        let line_h = scaled.ascent() + scaled.descent();
        let cap_offset = (line_h - th as f32).max(0.0) / 2.0;
        draw_text_mut(img, color, x, y + cap_offset as i32, scale, font, text);
    };

    let digits = normalized_text(data, format);

    match format {
        BarcodeFormat::Ean13 => {
            // d0 在左静区；d1..d6 在左半 6 组下；d7..d12 在右半 6 组下
            if let Some(d) = digits.chars().next() {
                draw_centered(&d.to_string(), (quiet / 2) as i32, y_top, img);
            }
            for (i, ch) in digits.chars().skip(1).take(12).enumerate() {
                let group = i as u32; // 0..5 左半，6..11 右半
                let base = if group < 6 { 3 } else { 50 };
                let g = group % 6;
                let cx = (edge + quiet + (base + 7 * g + 3) * xdim) as i32;
                draw_centered(&ch.to_string(), cx, y_top, img);
            }
        }
        BarcodeFormat::Ean8 => {
            for (i, ch) in digits.chars().enumerate() {
                let base = if i < 4 { 3 } else { 37 };
                let g = (i % 4) as u32;
                let cx = (edge + quiet + (base + 7 * g + 3) * xdim) as i32;
                draw_centered(&ch.to_string(), cx, y_top, img);
            }
        }
        BarcodeFormat::Upca => {
            // d0 在左静区（编号系统位）；d1..d5 左半 g=1..5；d6..d10 右半 g=0..4；d11 右静区
            if let Some(d) = digits.chars().next() {
                draw_centered(&d.to_string(), (quiet / 2) as i32, y_top, img);
            }
            for i in 1..=5usize {
                if let Some(ch) = digits.chars().nth(i) {
                    let cx = (edge + quiet + (3 + 7 * i as u32 + 3) * xdim) as i32;
                    draw_centered(&ch.to_string(), cx, y_top, img);
                }
            }
            for g in 0..5usize {
                if let Some(ch) = digits.chars().nth(6 + g) {
                    let cx = (edge + quiet + (50 + 7 * g as u32 + 3) * xdim) as i32;
                    draw_centered(&ch.to_string(), cx, y_top, img);
                }
            }
            if let Some(d) = digits.chars().nth(11) {
                let right_quiet_cx = (edge + quiet + 95 * xdim + quiet / 2) as i32;
                draw_centered(&d.to_string(), right_quiet_cx, y_top, img);
            }
        }
        _ => {
            let (tw, _) = text_size(scale, font, &digits);
            let cx = width_center(img.width(), edge + quiet, tw) as i32;
            draw_centered(&digits, cx, y_top, img);
        }
    }
}

fn width_center(total_w: u32, quiet: u32, text_w: u32) -> u32 {
    let left = quiet;
    let right = total_w - quiet;
    left + (right - left).saturating_sub(text_w) / 2 + text_w / 2
}

/// 展示用文字：补全校验位、CODE39 转大写。
fn normalized_text(data: &str, format: BarcodeFormat) -> String {
    match format {
        BarcodeFormat::Code39 => data.to_uppercase(),
        BarcodeFormat::Ean13 => {
            let digits: String = data.chars().filter(|c| c.is_ascii_digit()).collect();
            if digits.len() == 12 {
                format!("{digits}{}", ean_check_digit(&digits, false))
            } else {
                digits
            }
        }
        BarcodeFormat::Ean8 => {
            let digits: String = data.chars().filter(|c| c.is_ascii_digit()).collect();
            if digits.len() == 7 {
                format!("{digits}{}", ean_check_digit(&digits, true))
            } else {
                digits
            }
        }
        BarcodeFormat::Upca => {
            let digits: String = data.chars().filter(|c| c.is_ascii_digit()).collect();
            if digits.len() == 11 {
                format!("{digits}{}", upc_check_digit(&digits))
            } else {
                digits
            }
        }
        _ => data.to_string(),
    }
}

/// EAN-13 / EAN-8 校验位（weight 从左起交替 1/3 或 3/1）。
fn ean_check_digit(first_digits: &str, ean8: bool) -> char {
    let weights: Vec<u32> = (0..)
        .map(|i| if (i % 2 == 0) != ean8 { 3 } else { 1 })
        .take(first_digits.len())
        .collect();
    let sum: u32 = first_digits
        .chars()
        .zip(weights)
        .map(|(c, w)| c.to_digit(10).unwrap_or(0) * w)
        .sum();
    char::from_digit((10 - sum % 10) % 10, 10).unwrap_or('0')
}

/// UPC-A 校验位（奇数位 weight 3）。
fn upc_check_digit(first_11: &str) -> char {
    let sum: u32 = first_11
        .chars()
        .enumerate()
        .map(|(i, c)| c.to_digit(10).unwrap_or(0) * if i % 2 == 0 { 3 } else { 1 })
        .sum();
    char::from_digit((10 - sum % 10) % 10, 10).unwrap_or('0')
}

/// 各码制编码，返回 1/0 模块流（1 = 条）。
pub fn encode(data: &str, format: BarcodeFormat) -> Result<Vec<u8>, String> {
    match format {
        BarcodeFormat::Code128 => encode_code128(data),
        BarcodeFormat::Ean13 => barcoders::sym::ean13::EAN13::new(data)
            .map(|b| b.encode())
            .map_err(|e| format!("EAN-13 编码失败: {e}（需要 12 或 13 位数字）")),
        BarcodeFormat::Ean8 => barcoders::sym::ean8::EAN8::new(data)
            .map(|b| b.encode())
            .map_err(|e| format!("EAN-8 编码失败: {e}（需要 7 或 8 位数字）")),
        BarcodeFormat::Upca => {
            // UPC-A 编码等价于首位补 0 的 EAN-13（barcoders 由 EAN13 覆盖）
            let digits: String = data.chars().filter(|c| c.is_ascii_digit()).collect();
            let as_ean = match digits.len() {
                11 => format!("0{digits}"),
                12 => format!("0{}", &digits[..11]),
                _ => return Err("UPC-A 编码失败（需要 11 或 12 位数字）".into()),
            };
            barcoders::sym::ean13::EAN13::new(as_ean)
                .map(|b| b.encode())
                .map_err(|e| format!("UPC-A 编码失败: {e}"))
        }
        BarcodeFormat::Code39 => barcoders::sym::code39::Code39::new(data)
            .map(|b| b.encode())
            .map_err(|e| format!("Code39 编码失败: {e}（仅大写字母、数字与 -.$/+% 空格）")),
        BarcodeFormat::Itf => barcoders::sym::tf::TF::interleaved(data)
            .map(|b| b.encode())
            .map_err(|e| format!("ITF 编码失败: {e}（仅数字）")),
        BarcodeFormat::Itf14 => {
            let digits = data.trim();
            if digits.len() != 14 || !digits.chars().all(|c| c.is_ascii_digit()) {
                return Err("ITF-14 需要 14 位数字（GTIN-14）".into());
            }
            barcoders::sym::tf::TF::interleaved(digits)
                .map(|b| b.encode())
                .map_err(|e| format!("ITF-14 编码失败: {e}"))
        }
        BarcodeFormat::Qr => unreachable!("QR 走独立渲染路径"),
    }
}

/// QR 码：模块尺寸取 max(xdim, 3) 保证可扫，四周 4 模块静区，不渲染文字。
fn render_qr(data: &str, style: &BarcodeStyle) -> Result<ImageBuffer<Rgba<u8>, Vec<u8>>, String> {
    let code = qrcode::QrCode::new(data.as_bytes()).map_err(|e| format!("QR 编码失败: {e}"))?;
    let size = code.width() as u32;
    let colors = code.to_colors();
    let module = style.xdim.max(3);
    let quiet = 4 * module;
    let dim = size * module + quiet * 2;

    let mut img = RgbaImage::from_pixel(dim, dim, style.background_color());
    for (i, &c) in colors.iter().enumerate() {
        if c != qrcode::Color::Dark {
            continue;
        }
        let mx = (i as u32 % size) * module + quiet;
        let my = (i as u32 / size) * module + quiet;
        fill_rect(&mut img, mx, my, module, module, style.foreground_color());
    }
    Ok(img)
}

impl BarcodeStyle {
    pub fn foreground_color(&self) -> Rgba<u8> {
        Rgba(parse_hex(&self.foreground).unwrap_or([0, 0, 0, 255]))
    }

    pub fn background_color(&self) -> Rgba<u8> {
        Rgba(parse_hex(&self.background).unwrap_or([255, 255, 255, 255]))
    }
}

fn parse_hex(s: &str) -> Option<[u8; 4]> {
    let s = s.trim().trim_start_matches('#');
    let parse = |t: &str| u8::from_str_radix(t, 16).ok();
    match s.len() {
        6 => Some([parse(&s[0..2])?, parse(&s[2..4])?, parse(&s[4..6])?, 255]),
        8 => Some([
            parse(&s[0..2])?,
            parse(&s[2..4])?,
            parse(&s[4..6])?,
            parse(&s[6..8])?,
        ]),
        3 => Some([
            parse(&s[0..1])? * 17,
            parse(&s[1..2])? * 17,
            parse(&s[2..3])? * 17,
            255,
        ]),
        _ => None,
    }
}


/// CODE128 自动码集选择：barcoders 2.0 的 parse 不自动添加 START 码，
/// 这里按数据特征前置 START-C / START-B / START-A（等价 JsBarcode 的 auto），
/// 扫描出的内容与原始数据一致。
fn encode_code128(data: &str) -> Result<Vec<u8>, String> {
    let all_digits = !data.is_empty() && data.chars().all(|c| c.is_ascii_digit());
    let candidates: Vec<String> = if all_digits {
        if data.len().is_multiple_of(2) {
            vec![format!("Ć{data}")]
        } else {
            // 奇数位数字：C 集编码前 n-1 位，B 集收尾
            let (head, tail) = data.split_at(data.len() - 1);
            vec![format!("Ć{head}Ɓ{tail}"), format!("Ɓ{data}")]
        }
    } else {
        vec![format!("Ɓ{data}"), format!("À{data}")]
    };
    for candidate in candidates {
        if let Ok(b) = barcoders::sym::code128::Code128::new(&candidate) {
            return Ok(b.encode());
        }
    }
    Err("CODE128 编码失败：数据包含无法编码的字符（仅支持 ASCII）".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn code128_renders() {
        let style = BarcodeStyle::default();
        let png = render_png("ABC-123456", BarcodeFormat::Code128, &style).unwrap();
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    }

    #[test]
    fn ean13_auto_checksum() {
        let style = BarcodeStyle::default();
        // 12 位输入自动补校验位
        let png = render_png("750103131130", BarcodeFormat::Ean13, &style).unwrap();
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    }

    #[test]
    fn qr_renders() {
        let style = BarcodeStyle::default();
        let png = render_png("你好 Tauri", BarcodeFormat::Qr, &style).unwrap();
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    }

    #[test]
    fn invalid_data_reports_error() {
        let style = BarcodeStyle::default();
        assert!(render_png("abc", BarcodeFormat::Ean13, &style).is_err());
    }

    #[test]
    fn text_pixels_present_when_show_text() {
        // 回归保护：显示文字开启时，条区下方的文字区必须有前景色像素
        //（曾因 ab_glyph + 变量字体渲染失败导致文字静默丢失）
        let style = BarcodeStyle::default();
        let img = render_image("1234567890", BarcodeFormat::Code128, &style).unwrap();
        let (w, h) = (img.width(), img.height());
        // 文字区 = 条高(80) + gap(4) 之后到图片底部的带状区域
        let mut dark = 0;
        for y in 88..h - 2 {
            for x in 0..w {
                if img.get_pixel(x, y)[0] < 64 && img.get_pixel(x, y)[3] > 128 {
                    dark += 1;
                }
            }
        }
        assert!(dark > 60, "文字区应有深色像素，实际 {dark}");
    }

    #[test]
    fn edge_margin_is_transparent() {
        // 边距区域必须透明，让单元格网格线/边框透出
        let style = BarcodeStyle::default();
        let img = render_image("1234567890", BarcodeFormat::Code128, &style).unwrap();
        let corner = *img.get_pixel(0, 0);
        assert_eq!(corner[3], 0, "左上角应透明");
        let corner_br = *img.get_pixel(img.width() - 1, img.height() - 1);
        assert_eq!(corner_br[3], 0, "右下角应透明");
    }

    #[test]
    fn itf14_bearer_bars() {
        let style = BarcodeStyle::default();
        let png = render_png("15400141288764", BarcodeFormat::Itf14, &style).unwrap();
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    }
}



