/**
 * Generates the PWA install icons required by Chrome/Edge/Safari.
 *
 * WHY THIS EXISTS
 * The site previously declared its icons as square sizes ("192x192",
 * "512x512") but pointed them at NON-SQUARE raster files:
 *   - App-icon.webp           3508x2480 (landscape)  - despite the .webp name it
 *                                                    is actually a PNG
 *   - Maish-logo-light-mode.webp  594x420 (landscape)
 * A browser that trusts the declared sizes gets a stretched icon, and
 * Chrome refuses to fire `beforeinstallprompt` when it cannot validate a
 * square 192px and 512px icon. That is why the install banner never appeared.
 *
 * So we render real, genuinely square PNGs from the existing brand SVG
 * instead. Committing the binaries keeps the build free of an image
 * dependency; re-run `npm run generate:icons` after editing the SVG.
 *
 * sharp is already a devDependency (used for SEO image work).
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceSvg = path.join(root, 'public/images/icons/maskable-icon.svg');
const outDir = path.join(root, 'public/icons');

// "any" icons get transparent padding-free artwork; maskable icons must keep
// their content inside the inner 80% safe zone or Android crops the edges.
const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-192-maskable.png', size: 192, maskable: true },
  { file: 'icon-512-maskable.png', size: 512, maskable: true },
  // Apple touch icon: iOS ignores the manifest and reads this instead.
  { file: 'apple-touch-icon.png', size: 180, maskable: false },
];

const svg = await fs.readFile(sourceSvg, 'utf8');

/**
 * Each icon is a solid brand-coloured square with the existing brand SVG
 * centred on it. Maskable variants shrink the artwork further so Android's
 * circular mask never crops the logo (the safe zone is the inner 80%).
 */
const renderSquare = async (size, maskable, outPath) => {
  const artwork = Math.round(size * (maskable ? 0.78 : 0.86));
  const offset = Math.round((size - artwork) / 2);

  const artworkPng = await sharp(Buffer.from(svg))
    .resize(artwork, artwork)
    .png()
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: '#d84a1b',
    },
  })
    .composite([{ input: artworkPng, left: offset, top: offset }])
    .png({ compressionLevel: 9 })
    .toFile(outPath);
};

await fs.mkdir(outDir, { recursive: true });

for (const target of targets) {
  const outPath = path.join(outDir, target.file);
  await renderSquare(target.size, target.maskable, outPath);

  const meta = await sharp(outPath).metadata();
  console.log(
    `${target.file}  ${meta.width}x${meta.height}  ${meta.format}` +
      `${meta.width === meta.height ? '  square OK' : '  NOT SQUARE'}`,
  );
}

console.log(`\nWrote ${targets.length} square install icons to public/icons/`);