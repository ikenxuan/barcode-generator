const JsBarcode = require('jsbarcode');
const { createCanvas }  = require('canvas');
const ExcelJS  = require('exceljs');
const sharp  = require('sharp');
const readline  = require('readline');

// 使用 readline 接收用户输入
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});
console.log('© 2024 ikenxuan. barcode-generator. GPL-3.0')
console.log(`版权所有 © 2024-${new Date().getFullYear()} ikenxuan。条形码生成器，在 GPL-3.0 许可条款下发布。\n\n`)
console.log('请先将需要生成条形码的 Excel 文件重命名为: 1.xlsx')
rl.question('请输入需要生成条形码的列（默认: A）: ', async dataColumn => {
  dataColumn = dataColumn.toUpperCase() || 'A';
  rl.question('请输入条形码图片的列（默认: B）: ', async outputColumn => {
    outputColumn = outputColumn.toUpperCase() || 'B';
    rl.close() // 关闭 readline 接口
    console.log(`执行操作: 将 ${dataColumn} 列的所有内容生成条形码图片并嵌入到 ${outputColumn} 列...`)
    await generateBarcodes(dataColumn, outputColumn);

    // 等待用户输入任意键后退出
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => {
      process.stdin.setRawMode(false);
      process.stdin.pause();
      rl.close();
      process.exit(0);
    });

    console.log('按任意键退出...');
  });
});

// 加载Excel文件
async function generateBarcodes (dataColumn, outputColumn) {
  if (dataColumn === '') dataColumn = 'A';
  if (outputColumn === '') outputColumn = 'B';
  try {
    const convertColumnToIndex = (column) => {
      let index = 0;
      let length = column.length;

      for (let i = 0; i < length; i++) {
        index += (26 ** (length - i - 1)) * (column.charCodeAt(i) - 'A'.charCodeAt(0) + 1);
      }

      return index; // Excel列索引从1开始，JavaScript数组索引从0开始
    }
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile('./1.xlsx');
    const worksheet = workbook.getWorksheet(1); // 获取第一个工作表

    // 设置单元格列宽
    worksheet.getColumn(convertColumnToIndex(outputColumn)).width = 30;

    let barcodeCount = 0;

    for (let i = 1; i <= worksheet.rowCount; i++) {
      const row = worksheet.getRow(i);
      const cellValue = row.getCell(convertColumnToIndex(dataColumn)).value; // 获取原始数据列的内容

      if (cellValue) {
        const barcodeValue = cellValue.toString();

        // 设置A列文字垂直居中
        row.getCell(convertColumnToIndex(dataColumn)).alignment = {
          vertical: 'middle', // 居中
          horizontal: 'center' // 可选：上下左右对齐
        };

        // 创建Canvas并生成条形码
        const canvas = createCanvas(200, 80); // 根据需要设置Canvas大小
        const ctx = canvas.getContext('2d');

        // 填充白色背景，避免透明
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // 生成条形码
        JsBarcode(canvas, barcodeValue, {
          format: "CODE128", // 设置条形码格式
          height: 80, // 设置条形码高度
          width: 2, // 设置条形码宽度
          font: "Microsoft YaHei", // 字体微软雅黑
          fontSize: 35,
          displayValue: true, // 显示条形码下方的文本
          lineColor: "#000000", // 确保条形码线条为黑色
          background: "transparent", // 背景设置为透明，避免覆盖填充的白色
        });

        // 将Canvas转换为PNG Buffer
        const pngBuffer = await sharp(canvas.toBuffer('image/png'))
          .png()
          .toBuffer();

        // 插入图片到Excel
        const imageId = workbook.addImage({
          buffer: pngBuffer,
          extension: 'png',
        });

        // 设置行高，以适应图片高度
        worksheet.getRow(i).height = 60; // 根据图片高度调整

        // 定位并调整图片的大小，使其与单元格对齐
        worksheet.addImage(imageId, {
          tl: { col: convertColumnToIndex(outputColumn), row: i - 1 }, // 插入到B列（A列之后）
          br: { col: convertColumnToIndex(outputColumn) - 1, row: i }, // 覆盖B列
          editAs: 'oneCell', // 图片随单元格调整大小
        });

        barcodeCount++;
      }
    }

    console.log(`已在当前目录保存为 output.xlsx，共计生成 ${barcodeCount} 个条形码。\n\n`);

    // 保存新的Excel文件
    await workbook.xlsx.writeFile('output.xlsx');
  } catch (error) {
    console.error('发生错误:', error);
  }
}