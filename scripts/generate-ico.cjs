// Creates favicon.ico with 16x16 and 32x32 PNG images embedded
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, '../public/VahanSetu_Final_Logo.png');
const OUT = path.join(__dirname, '../public/favicon.ico');

async function buildIco() {
  const [buf16, buf32] = await Promise.all([
    sharp(SRC).resize(16, 16, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer(),
    sharp(SRC).resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } }).png().toBuffer(),
  ]);

  const images = [buf16, buf32];
  const count = images.length;
  const headerSize = 6;
  const dirSize = 16 * count;
  let offset = headerSize + dirSize;

  // ICO header
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);   // reserved
  header.writeUInt16LE(1, 2);   // type: 1 = ICO
  header.writeUInt16LE(count, 4);

  // Directory entries
  const dirs = images.map((buf, i) => {
    const size = i === 0 ? 16 : 32;
    const dir = Buffer.alloc(16);
    dir.writeUInt8(size, 0);     // width (0 = 256)
    dir.writeUInt8(size, 1);     // height
    dir.writeUInt8(0, 2);        // color count
    dir.writeUInt8(0, 3);        // reserved
    dir.writeUInt16LE(1, 4);     // planes
    dir.writeUInt16LE(32, 6);    // bit count
    dir.writeUInt32LE(buf.length, 8);
    dir.writeUInt32LE(offset, 12);
    offset += buf.length;
    return dir;
  });

  fs.writeFileSync(OUT, Buffer.concat([header, ...dirs, ...images]));
  console.log('✓ favicon.ico');
}

buildIco().catch(err => { console.error(err); process.exit(1); });
