const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// 1. Decode src PNG
const srcBuf = fs.readFileSync(path.join(__dirname, '../frontend/public/cfr-mark.png'));

let idatChunks = [];
let offset = 8;
while (offset < srcBuf.length) {
  const len = srcBuf.readUInt32BE(offset);
  const type = srcBuf.toString('ascii', offset + 4, offset + 8);
  if (type === 'IDAT') idatChunks.push(srcBuf.slice(offset + 8, offset + 8 + len));
  offset += 12 + len;
}
const raw = zlib.inflateSync(Buffer.concat(idatChunks));
const srcW = 182;
const srcH = 195;
const bpp = 4;
const stride = 1 + srcW * bpp;
const srcPixels = Buffer.alloc(srcW * srcH * bpp);

for (let y = 0; y < srcH; y++) {
  const filter = raw[y * stride];
  const rowStart = y * stride + 1;
  const prevRowStart = (y - 1) * srcW * bpp;
  const curRowStart = y * srcW * bpp;

  for (let x = 0; x < srcW * bpp; x++) {
    const rawByte = raw[rowStart + x];
    const a = x >= bpp ? srcPixels[curRowStart + x - bpp] : 0;
    const b = y > 0 ? srcPixels[prevRowStart + x] : 0;
    const c = (x >= bpp && y > 0) ? srcPixels[prevRowStart + x - bpp] : 0;
    let val = 0;
    if (filter === 0) val = rawByte;
    else if (filter === 1) val = (rawByte + a) & 0xff;
    else if (filter === 2) val = (rawByte + b) & 0xff;
    else if (filter === 3) val = (rawByte + Math.floor((a + b) / 2)) & 0xff;
    else if (filter === 4) {
      const p = a + b - c;
      const pa = Math.abs(p - a);
      const pb = Math.abs(p - b);
      const pc = Math.abs(p - c);
      let pr = c;
      if (pa <= pb && pa <= pc) pr = a;
      else if (pb <= pc) pr = b;
      val = (rawByte + pr) & 0xff;
    }
    srcPixels[curRowStart + x] = val;
  }
}

// 2. Resample function onto a square target with 1/4 clear space padding
function renderSquareIcon(targetSize) {
  const dstBuf = Buffer.alloc(targetSize * (1 + targetSize * 4));
  // Artwork should occupy ~75% of target size (1/4 W clear space)
  const artTargetSize = Math.floor(targetSize * 0.75);
  const scale = artTargetSize / Math.max(srcW, srcH);
  const drawnW = Math.round(srcW * scale);
  const drawnH = Math.round(srcH * scale);
  const offsetX = Math.floor((targetSize - drawnW) / 2);
  const offsetY = Math.floor((targetSize - drawnH) / 2);

  for (let y = 0; y < targetSize; y++) {
    dstBuf[y * (1 + targetSize * 4)] = 0; // Filter 0
    for (let x = 0; x < targetSize; x++) {
      const dstIdx = y * (1 + targetSize * 4) + 1 + x * 4;
      const artX = x - offsetX;
      const artY = y - offsetY;

      if (artX >= 0 && artX < drawnW && artY >= 0 && artY < drawnH) {
        // Nearest neighbor / sampling into src
        const srcX = Math.min(srcW - 1, Math.max(0, Math.floor(artX / scale)));
        const srcY = Math.min(srcH - 1, Math.max(0, Math.floor(artY / scale)));
        const srcIdx = (srcY * srcW + srcX) * 4;

        dstBuf[dstIdx] = srcPixels[srcIdx];         // R: 0x1E
        dstBuf[dstIdx + 1] = srcPixels[srcIdx + 1]; // G: 0x1B
        dstBuf[dstIdx + 2] = srcPixels[srcIdx + 2]; // B: 0x16
        dstBuf[dstIdx + 3] = srcPixels[srcIdx + 3]; // A
      } else {
        // Transparent
        dstBuf[dstIdx] = 0;
        dstBuf[dstIdx + 1] = 0;
        dstBuf[dstIdx + 2] = 0;
        dstBuf[dstIdx + 3] = 0;
      }
    }
  }

  return buildPng(dstBuf, targetSize, targetSize);
}

// Simple CRC32 & PNG Builder
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) | 0;
}

function buildPng(rawBuf, w, h) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  function makeChunk(type, data) {
    const len = data.length;
    const buf = Buffer.alloc(12 + len);
    buf.writeUInt32BE(len, 0);
    buf.write(type, 4, 4, 'ascii');
    data.copy(buf, 8);
    const crc = crc32(buf.slice(4, 8 + len));
    buf.writeInt32BE(crc, 8 + len);
    return buf;
  }

  const compressed = zlib.deflateSync(rawBuf);
  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Generate all target favicons and icons
const targets = [
  { file: 'frontend/public/favicon-16x16.png', size: 16 },
  { file: 'frontend/public/favicon-32x32.png', size: 32 },
  { file: 'frontend/public/apple-touch-icon.png', size: 180 },
  { file: 'frontend/public/icon-192.png', size: 192 },
  { file: 'frontend/public/icon-512.png', size: 512 },
];

for (const t of targets) {
  const outPath = path.join(__dirname, '..', t.file);
  const png = renderSquareIcon(t.size);
  fs.writeFileSync(outPath, png);
  console.log(`Generated ${t.file} (${t.size}x${t.size}) - ${png.length} bytes`);
}

