const sharp = require('sharp');
const path = require('path');

const SRC = path.join(__dirname, '../public/VahanSetu_Final_Logo.png');
const OUT = path.join(__dirname, '../public');

// Padding ratio for maskable icons (safe zone = center 80%)
const MASKABLE_PAD = 0.15;

async function resize(size, outFile, maskable = false) {
  const img = sharp(SRC);
  if (maskable) {
    const inner = Math.round(size * (1 - MASKABLE_PAD * 2));
    await img
      .resize(inner, inner, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .extend({
        top: Math.round(size * MASKABLE_PAD),
        bottom: Math.round(size * MASKABLE_PAD),
        left: Math.round(size * MASKABLE_PAD),
        right: Math.round(size * MASKABLE_PAD),
        background: { r: 255, g: 255, b: 255, alpha: 1 },
      })
      .png()
      .toFile(path.join(OUT, outFile));
  } else {
    await img
      .resize(size, size, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .png()
      .toFile(path.join(OUT, outFile));
  }
  console.log(`✓ ${outFile} (${size}x${size})`);
}

async function main() {
  await resize(16,  'favicon-16x16.png');
  await resize(32,  'favicon-32x32.png');
  await resize(64,  'pwa-64x64.png');
  await resize(180, 'apple-touch-icon.png');
  await resize(192, 'pwa-192x192.png');
  await resize(192, 'pwa-192x192-maskable.png', true);
  await resize(512, 'pwa-512x512.png');
  await resize(512, 'pwa-512x512-maskable.png', true);
  console.log('\nSab icons ban gaye!');
}

main().catch(err => { console.error(err); process.exit(1); });
