# 条码生成器 bargen

读取表格文件的数据列，批量生成条形码图片并嵌入到指定输出列，另存为 xlsx。
基于 **Tauri 2 + Rust** 的桌面应用，提供可视化操作界面。

## 功能

- **可视化表格面板**：拖入文件即可，所有工作表以标签页呈现，行内实时预览条码
- **点表头选列**：在表头上点击「数据」「输出」标签完成列映射，也可以在设置面板输入列号
- **Excel / WPS 式表格操作**：双击编辑单元格、右键菜单（复制 / 粘贴 / 清空）、
  从 Excel/WPS 复制区域后直接 Ctrl+V 批量粘贴、Delete 清空、Ctrl+Z / Ctrl+Y 撤销重做、
  方向键导航、列宽拖拽；编辑会随生成写入输出文件（源文件永不改动）
- **多格式输入**：xlsx / xlsm / xls / xlsb / ods / csv（凡 Excel 能打开的常见格式）；
  输出统一为 xlsx
- **多码制支持**：CODE 128（自动码集）/ EAN-13 / EAN-8 / UPC-A / Code 39 / ITF / ITF-14 / QR 码，
  行内校验提示格式不符
- **样式自定义**：条高、条宽、字号、显隐文字、前景/背景色
- **行范围**：跳过表头或只处理指定区间
- **批量导出 PNG**：把每行条码导出为独立 PNG 文件
- **真实预览**：大图预览由 Rust 引擎渲染，即写进 Excel 的原图
- **进度反馈**：渲染、写入、保存各阶段实时进度
- **设置记忆**：列选择、样式、主题等偏好跨会话保留；深色模式

## 架构

```
前端 React 19 + Vite + Tailwind v4 + HeroUI v3
  ├─ AG Grid（表格面板、单元格编辑、点表头选列）
  ├─ HeroUI v3（Select/Switch/Slider/ColorPicker/Modal/Tabs/Dropdown/ProgressBar 等全套组件）
  ├─ JsBarcode / qrcode（网格内即时缩略预览，与 Rust 引擎同规范同参数）
  └─ Motion（进度卡出入场动效）
        │ Tauri IPC（只传参数与进度事件，不传图片）
Rust 后端
  ├─ calamine + csv：多格式读取（xls/xlsx/xlsm/xlsb/ods/csv）
  ├─ umya-spreadsheet：写 xlsx（xlsx 源就地改写保留原格式；其余格式重建新工作簿）
  ├─ barcoders：各码制编码规范实现
  └─ image / imageproc / ab_glyph：位图渲染与人读文字（内置 Noto Sans，OFL）
```

条码图片全部由 Rust 渲染（rayon 并行），万行级表格秒级完成；预览与最终输出
由同一套参数驱动，保证所见即所得。

## 使用

1. 到 [Releases](https://github.com/ikenxuan/barcode-generator/releases) 下载对应平台安装包
2. 打开程序，拖入或选择表格文件
3. 在表头点击「数据」「输出」标签（或右侧面板输入列号），按需调整格式与样式
4. 点击「生成条形码」，完成后可直接打开输出文件所在位置

## 开发构建

包管理器使用 pnpm（>= 10），Rust 工具链 stable。

```bash
pnpm install

# 开发调试（带热重载）
pnpm app          # 即 tauri dev

# 测试
pnpm test:rust    # Rust 单元测试 + 端到端管线测试
pnpm test         # 前端单测（vitest）

# 构建前端 / 打安装包
pnpm build
pnpm tauri build
```

## 性能测试

生成 ~50MB 的巨型测试表格（保留在 `testdata/`，已 gitignore）：

```bash
cd src-tauri
cargo run --release --example gen_fixture          # 生成 big.xlsx (500k 行) + big.csv (600k 行)
```

跑分（分阶段计时：读取 → 表格展示 → 生成）：

```bash
cargo run --release --example perf -- testdata/big.xlsx 20000        # xlsx 就地改写 2 万行
cargo run --release --example perf -- testdata/big.xlsx 50000        # 5 万行
cargo run --release --example perf -- testdata/big.csv  20000        # csv 重建路径
cargo run --release --example perf -- testdata/big.xlsx 20000 --png  # 批量导出 PNG
```

实测参考（Windows 笔记本，release 构建；big.xlsx 44MB/50 万行、big.csv 51MB/60 万行）：

| 场景 | 读取 | 表格展示 | 生成 2 万行 | 输出 |
|---|---|---|---|---|
| xlsx 就地改写 | 2.8s | 3.1s | 32.5s | 54.8MB xlsx |
| csv 重建新簿 | 0.4s | 0.7s | 28.5s | 50.4MB xlsx |
| xlsx 导出 PNG | 0.4s | 0.7s | 见下 | 2 万张 PNG |

xlsx 就地改写有 ~30s 固定开销（umya 加载 50 万行的簿），边际成本约 1.1ms/行；
日常几万行以内的表格全程秒级。PNG 导出已绕过 umya 直接用 calamine 读取。

实测参考（Windows 笔记本，release 构建；big.xlsx 44MB/50 万行、big.csv 51MB/60 万行）：

| 场景 | 读取 | 表格展示 | 生成 2 万行 | 输出 |
|---|---|---|---|---|
| xlsx 就地改写 | 2.8s | 3.1s | 32.5s | 54.8MB xlsx |
| csv 重建新簿 | 0.4s | 0.7s | 28.5s | 50.4MB xlsx |
| xlsx 导出 PNG | 0.4s | 0.7s | 见下 | 2 万张 PNG |

xlsx 就地改写有 ~30s 固定开销（umya 加载 50 万行的簿），边际成本约 1.1ms/行；
日常几万行以内的表格全程秒级。PNG 导出已绕过 umya 直接用 calamine 读取。

## 发版

```bash
pnpm release
```

流程：前置守卫（main 分支、工作区干净、与远端同步）→ bumpp 交互式选版本并
同步 `tauri.conf.json` / `Cargo.toml` → 提交 `chore: release vX.Y.Z` 并打 tag
→ 推送留给人工：`git push origin HEAD --follow-tags`。tag 推上去后
GitHub Actions 自动跑测试并构建全平台安装包发布 Release。

CI 行为：
- **push tag `v*`**：测试门禁 → 构建全平台安装包（含便携版 exe）→ 发布
  GitHub Release，CI 摘要写入全部产物的下载链接
- **push main**：测试门禁 → 构建全平台安装包作为 workflow artifacts 保存，
  CI 摘要写入各产物的下载链接（保留 90 天）
- **PR**：只跑测试门禁

## 许可

MIT。`src-tauri/fonts/NotoSans-Variable.ttf` 来自 Google Noto Fonts，
遵循 SIL Open Font License 1.1（见 `src-tauri/fonts/OFL.txt`）。
