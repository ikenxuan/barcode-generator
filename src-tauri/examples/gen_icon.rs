//! 一次性工具：生成条码风格的应用图标源图（1024x1024，圆角透明底）。
//! 运行：cargo run --example gen_icon

use image::{Rgba, RgbaImage};

fn main() {
    let size = 1024u32;
    let radius = 224u32; // iOS 风格圆角
    let mut img = RgbaImage::from_pixel(size, size, Rgba([0, 0, 0, 0]));

    // 白底圆角卡片
    for y in 0..size {
        for x in 0..size {
            if in_rounded(x, y, size, radius) {
                img.put_pixel(x, y, Rgba([255, 255, 255, 255]));
            }
        }
    }

    // 条码条：左对齐区域的黑条，宽度按节奏变化
    let bars = [3, 1, 2, 1, 4, 2, 1, 2, 3, 1, 1, 2, 4, 1, 2, 2, 1, 3, 1, 2, 1, 4, 1, 1];
    let accent_at = 11; // 中间一根用品牌蓝
    let margin_x = 160u32;
    let top = 220u32;
    let bottom = 700u32;
    let unit = 26u32;
    let mut x = margin_x;
    for (i, &w) in bars.iter().enumerate() {
        let color = if i == accent_at {
            Rgba([0, 113, 227, 255])
        } else {
            Rgba([29, 29, 31, 255])
        };
        for dx in 0..w * unit {
            for y in top..bottom {
                let px = x + dx;
                if px < size - margin_x && in_rounded(px, y, size, radius) {
                    img.put_pixel(px, y, color);
                }
            }
        }
        x += w * unit;
        // 条间距
        for dx in 0..unit {
            let px = x + dx;
            let _ = px;
        }
        x += unit;
    }

    // 底部一行小字块：条码人读区示意
    let y0 = 760u32;
    let y1 = 806u32;
    let mut bx = margin_x;
    let digits = [2, 3, 2, 2, 3, 2];
    for d in digits {
        for dx in 0..d * 18 {
            for y in y0..y1 {
                let px = bx + dx;
                if px < size - margin_x && in_rounded(px, y, size, radius) {
                    img.put_pixel(px, y, Rgba([29, 29, 31, 255]));
                }
            }
        }
        bx += d * 18 + 18;
    }

    img.save("icons/appicon.png").expect("保存图标失败");
    println!("icons/appicon.png written");
}

fn in_rounded(x: u32, y: u32, size: u32, r: u32) -> bool {
    let (cx, cy) = (r as i64, r as i64);
    let (fx, fy) = (x as i64, y as i64);
    let corners = [
        (cx, cy),
        (size as i64 - cx, cy),
        (cx, size as i64 - cy),
        (size as i64 - cx, size as i64 - cy),
    ];
    let inside_margin = fx >= r as i64 && fx < (size - r) as i64 || fy >= r as i64 && fy < (size - r) as i64;
    if inside_margin {
        return true;
    }
    // 四角圆
    for (qx, qy) in corners {
        let dx = fx - qx;
        let dy = fy - qy;
        if dx * dx + dy * dy <= r as i64 * r as i64 {
            return true;
        }
    }
    false
}
