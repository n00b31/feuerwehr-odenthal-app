import sharp from "sharp";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const source = await readFile(new URL("../public/icon.svg", import.meta.url), "utf8");
// SVG rasterizers do not universally support CSS custom properties.
const vars = Object.fromEntries([...source.matchAll(/--(cp-[\w-]+):([^;}]+)/g)].map((match) => [match[1], match[2]]));
const svg = Buffer.from(source.replace(/var\(--(cp-[\w-]+)\)/g, (_, key) => vars[key]));
await mkdir(new URL("../public/icons", import.meta.url), { recursive: true });
for (const [file, size] of [["icon-192", 192], ["icon-512", 512], ["maskable-512", 512], ["apple-touch-icon", 180]]) {
  const icon = file.startsWith("maskable") ? Buffer.from(svg.toString().replace('rx="100"', "")) : svg;
  await sharp(icon).resize(size, size).png().toFile(fileURLToPath(new URL(`../public/icons/${file}.png`, import.meta.url)));
}
