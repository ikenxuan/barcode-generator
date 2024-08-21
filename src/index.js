const JsBarcode = require('jsbarcode');
const { createCanvas } = require("canvas");
const ExcelJS = require('exceljs');
const sharp = require('sharp');

// 加载Excel文件
async function generateBarcodes() {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile('./1.xlsx');
  const worksheet = workbook.getWorksheet(1); // 获取第一个工作表

  // 设置单元格列宽（B列）
  worksheet.getColumn(2).width = 30; // 根据图片宽度调整

  let barcodeCount = 0;

  for (let i = 1; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);
    const cellValue = row.getCell(1).value; // 获取A列的内容

    if (cellValue) {
      const barcodeValue = cellValue.toString();

      // 设置A列文字垂直居中
      row.getCell(1).alignment = {
        vertical: 'middle', // 居中
        horizontal: 'center' // 可选：上下左右对齐
      };

      // 创建Canvas并生成条形码
      const canvas = createCanvas(200, 80); // 根据需要设置Canvas大小
      const ctx = canvas.getContext('2d');

      // 填充白色背景，避免透明
      // ctx.fillStyle = '#ffffff';
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
        tl: { col: 1, row: i - 1 }, // 插入到B列（A列之后）
        br: { col: 2, row: i }, // 覆盖B列
        editAs: 'oneCell', // 图片随单元格调整大小
      });

      barcodeCount++;
    }
  }

  console.log(`已生成 ${barcodeCount} 个条形码。`);

  // 保存新的Excel文件
  await workbook.xlsx.writeFile('output.xlsx');
}

// 调用异步函数
generateBarcodes().catch(err => console.error(err));
