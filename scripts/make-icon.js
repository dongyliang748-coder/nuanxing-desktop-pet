/**
 * 从精灵表第一帧裁出暖星的脸，生成 Windows 图标 assets/icon.ico。
 * ICO 里直接嵌 PNG（Windows Vista 起支持），不依赖任何图像库。
 *
 * 用法：electron make-icon.js   （注意先 unset ELECTRON_RUN_AS_NODE）
 */
'use strict';

const { app, nativeImage } = require('electron');
const path = require('path');
const fs = require('fs');

function buildIco(png, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: 1 = icon
  header.writeUInt16LE(1, 4); // image count
  header.writeUInt8(size >= 256 ? 0 : size, 6); // width（256 记作 0）
  header.writeUInt8(size >= 256 ? 0 : size, 7); // height
  header.writeUInt8(0, 8); // palette colors
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // color planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

app.whenReady().then(() => {
  const assets = path.join(__dirname, '..', 'assets');
  const sheet = nativeImage.createFromPath(path.join(assets, 'spritesheet.png'));
  if (sheet.isEmpty()) {
    console.error('精灵表读取失败');
    app.exit(1);
    return;
  }

  // 单元格 192x208，人物居中站在底部；取下半部的正方形，保证头和脚都完整
  const frame = sheet.crop({ x: 0, y: 16, width: 192, height: 192 });
  const png = frame.resize({ width: 256, height: 256, quality: 'best' }).toPNG();
  const out = path.join(assets, 'icon.ico');
  fs.writeFileSync(out, buildIco(png, 256));
  console.log('图标已生成：', out, `${Math.round(png.length / 1024)}KB`);
  app.quit();
});
