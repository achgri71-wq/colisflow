/**
 * Builds Y4M videos with a single barcode/QR code, for Chrome's fake camera
 * (--use-file-for-fake-video-capture). Portrait 720x960 matches a phone held
 * upright and the scanner's 3:4 view, so the aiming ROI sees the whole symbol.
 */
import fs from 'node:fs'
import path from 'node:path'
import { BarcodeFormat, Code128Reader, QRCodeWriter } from '@zxing/library'

const WIDTH = 720
const HEIGHT = 960
const FRAMES = 12

const OUT = path.join(
  'C:\\Users\\AbdErrahmane\\AppData\\Local\\Temp\\opencode',
  'colisflow-fake-camera',
)
fs.mkdirSync(OUT, { recursive: true })

const CODE39_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%'
const CODE39_ENCODINGS = [
  0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064, 0x109,
  0x049, 0x148, 0x019, 0x118, 0x058, 0x00d, 0x10c, 0x04c, 0x01c, 0x103, 0x043,
  0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016, 0x181, 0x0c1, 0x1c0,
  0x091, 0x190, 0x0d0, 0x085, 0x184, 0x0c4, 0x0a8, 0x0a2, 0x08a, 0x02a,
]
const ASTERISK = 0x094
const CODE128_PATTERNS = Code128Reader.CODE_PATTERNS

const VALUE = 'DH123456789'

function blank() {
  return new Uint8Array(WIDTH * HEIGHT).fill(255)
}

function drawBars(luma, modules, moduleWidth) {
  const barHeight = Math.round(HEIGHT * 0.42)
  const startY = Math.round((HEIGHT - barHeight) / 2)
  const totalWidth = modules.length * moduleWidth
  if (totalWidth > WIDTH - 80) {
    throw new Error(`symbol too wide: ${totalWidth}px`)
  }
  const startX = Math.round((WIDTH - totalWidth) / 2)
  for (let module = 0; module < modules.length; module += 1) {
    if (!modules[module]) continue
    for (let x = 0; x < moduleWidth; x += 1) {
      const px = startX + module * moduleWidth + x
      for (let y = startY; y < startY + barHeight; y += 1) {
        luma[y * WIDTH + px] = 0
      }
    }
  }
}

function code39Modules(value) {
  const chars = `*${value.toUpperCase()}*`
  const modules = []
  const push = (black, count) => {
    for (let i = 0; i < count; i += 1) modules.push(black)
  }
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]
    const encoding =
      char === '*' ? ASTERISK : CODE39_ENCODINGS[CODE39_ALPHABET.indexOf(char)]
    for (let bit = 8; bit >= 0; bit -= 1) {
      push(bit % 2 === 0, ((encoding >> bit) & 1) === 1 ? 3 : 1)
    }
    if (index < chars.length - 1) push(false, 1)
  }
  return modules
}

function code128Modules(value) {
  const values = [104]
  for (const char of value) values.push(char.charCodeAt(0) - 32)
  let checksum = values[0]
  for (let index = 1; index < values.length; index += 1) {
    checksum += values[index] * index
  }
  values.push(checksum % 103, 106)

  const modules = []
  for (const value of values) {
    const pattern = CODE128_PATTERNS[value]
    for (let index = 0; index < pattern.length; index += 1) {
      for (let count = 0; count < pattern[index]; count += 1) {
        modules.push(index % 2 === 0)
      }
    }
  }
  return modules
}

function drawQr(luma, text) {
  const size = 360
  const matrix = new QRCodeWriter().encode(
    text,
    BarcodeFormat.QR_CODE,
    size,
    size,
    new Map(),
  )
  const module = Math.max(1, Math.floor(size / matrix.getWidth()))
  const total = matrix.getWidth() * module
  const startX = Math.round((WIDTH - total) / 2)
  const startY = Math.round((HEIGHT - total) / 2)
  for (let y = 0; y < matrix.getHeight(); y += 1) {
    for (let x = 0; x < matrix.getWidth(); x += 1) {
      if (!matrix.get(x, y)) continue
      for (let dy = 0; dy < module; dy += 1) {
        for (let dx = 0; dx < module; dx += 1) {
          luma[(startY + y * module + dy) * WIDTH + (startX + x * module + dx)] = 0
        }
      }
    }
  }
}

function writeY4m(file, luma) {
  const chroma = (WIDTH * HEIGHT) / 4
  const frame = Buffer.alloc(WIDTH * HEIGHT + chroma * 2)
  frame.set(luma.subarray(0, WIDTH * HEIGHT), 0)
  frame.fill(128, WIDTH * HEIGHT)
  const header = Buffer.from(
    `YUV4MPEG2 W${WIDTH} H${HEIGHT} F30:1 Ip A1:1 C420jpeg\n`,
    'ascii',
  )
  const parts = [header]
  for (let index = 0; index < FRAMES; index += 1) {
    parts.push(Buffer.from('FRAME\n', 'ascii'), frame)
  }
  fs.writeFileSync(file, Buffer.concat(parts))
  console.log(`${path.basename(file)}: ${(fs.statSync(file).size / 1e6).toFixed(1)} MB`)
}

const code128 = blank()
drawBars(code128, code128Modules(VALUE), 3)
writeY4m(path.join(OUT, 'code128.y4m'), code128)

const code39 = blank()
drawBars(code39, code39Modules(VALUE), 3)
writeY4m(path.join(OUT, 'code39.y4m'), code39)

const qr = blank()
drawQr(qr, 'https://app.sendit.ma/deliveries/DH987654321')
writeY4m(path.join(OUT, 'qr.y4m'), qr)


