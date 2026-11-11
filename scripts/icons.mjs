import sharp from 'sharp'
import { mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const source = join(root, 'public', 'icon.svg')
const outDir = join(root, 'public', 'icons')

await mkdir(outDir, { recursive: true })

const sizes = [192, 512]
for (const size of sizes) {
  await sharp(source).resize(size, size).png().toFile(join(outDir, `icon-${size}.png`))
}

// Maskable icons need their artwork inside the central safe zone (80% width).
// Render the mark smaller and centre it on a solid background so Android's
// circular/squircle masks never clip the parcel or the scan brackets.
const safeSize = 410
const maskableMark = await sharp(source).resize(safeSize, safeSize).png().toBuffer()
await sharp({
  create: {
    width: 512,
    height: 512,
    channels: 4,
    background: { r: 6, g: 10, b: 18, alpha: 1 },
  },
})
  .composite([{ input: maskableMark, top: 51, left: 51 }])
  .png()
  .toFile(join(outDir, 'maskable-512.png'))
await sharp(source).resize(180, 180).png().toFile(join(root, 'public', 'apple-touch-icon.png'))
await sharp(source).resize(64, 64).png().toFile(join(root, 'public', 'favicon-64.png'))

console.log('Icons generated.')
