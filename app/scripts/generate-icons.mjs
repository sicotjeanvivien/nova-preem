// Generates the app icons from the logo of the mockups (four-pointed star, accent on dark).
// Run with `pnpm icons`; the PNG files are committed.
import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

const BACKGROUND = "#0D0F14";
const ACCENT = "#46E3C8";
const STAR = "M12 2l2.6 7.4L22 12l-7.4 2.6L12 22l-2.6-7.4L2 12l7.4-2.6z";

/** The star in a 24×24 box, scaled to `scale` of the icon and centred. */
function iconSvg({ size, scale, radius }) {
  const starSize = size * scale;
  const offset = (size - starSize) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius}" fill="${BACKGROUND}"/>
  <g transform="translate(${offset} ${offset}) scale(${starSize / 24})">
    <path d="${STAR}" fill="none" stroke="${ACCENT}" stroke-width="1.6" stroke-linejoin="round"/>
  </g>
</svg>`;
}

async function png(path, options) {
  await writeFile(path, await sharp(Buffer.from(iconSvg(options))).png().toBuffer());
}

await mkdir("public/icons", { recursive: true });
// "any" icons: rounded tile. Maskable: full-bleed tile, star inside the 80 % safe zone.
await png("public/icons/icon-192.png", { size: 192, scale: 0.62, radius: 42 });
await png("public/icons/icon-512.png", { size: 512, scale: 0.62, radius: 112 });
await png("public/icons/icon-maskable-512.png", { size: 512, scale: 0.5, radius: 0 });
await png("public/apple-touch-icon.png", { size: 180, scale: 0.6, radius: 0 });
await writeFile("public/favicon.svg", iconSvg({ size: 64, scale: 0.7, radius: 14 }));
console.log("Icons written to public/");
