import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
const source = fileURLToPath(new URL("../public/branding/feuerwehr-odenthal-flamme.png", import.meta.url));
const { data } = await sharp(source).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const background = { r: data[0], g: data[1], b: data[2], alpha: 1 };
await mkdir(new URL("../public/icons", import.meta.url), { recursive: true });
for (const [file, size] of [["icon-192", 192], ["icon-512", 512], ["maskable-512", 512], ["apple-touch-icon", 180], ["favicon-32", 32]]) {
  const inset = Math.round(size * (file === "maskable-512" ? .16 : .14));
  await sharp(source)
    .resize(size - inset * 2, size - inset * 2, { fit: "contain", background })
    .extend({ top: inset, bottom: inset, left: inset, right: inset, background })
    .png({ compressionLevel: 9 })
    .toFile(fileURLToPath(new URL(`../public/icons/${file}.png`, import.meta.url)));
}
