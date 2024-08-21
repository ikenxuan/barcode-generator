# Excel的条形码生成器

## 使用

1. 在release中下载最新的发行版（.exe文件）
2. 放在和你 Excel 文件的 **同级目录下**
3. 将 Excel 文件重命名为 `1.xlsx`
4. 运行你下载到的 `.exe可执行文件`
5. 运行成功后，会在当前目录生成 `output.xlsx`

## 警告
可执行文件对传入的 Excel 文件有强制性要求！

**传入的Excel 文件中，第一列是必须是需要生成条形码对应的文字**
生成成功后的 `output.xlsx` 会在第二列中生成对应的条形码。
* 目前的条形码只能悬浮于表格之上，可随意拖动，无法嵌入，这是由于上游库的限制，没有对应的方法可以将图片嵌入表格。

## 开发构建

1. 安装依赖

开发环境中的 `canvas` 依赖安装程度过于困难，可以参考 [WIKI](https://github.com/Automattic/node-canvas/wiki/Installation%3A-Windows)

```bash
yarn install
```
---
* 调试
```bash
yarn app
```

* 编译
```bash
yarn build
```
