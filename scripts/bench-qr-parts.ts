import {
  BarcodeFormat,
  BinaryBitmap,
  Code128Reader,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatOneDReader,
  QRCodeWriter,
  RGBLuminanceSource,
} from '@zxing/library'
import { BarcodeDecoder, LINEAR_FORMATS } from '../src/lib/scanner.ts'

const W = 480
const H = 640
const CODE128 = BarcodeFormat.CODE_128

const CODE39_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%'
const CODE39_ENCODINGS = [
  0x034, 0x121, 0x061, 0x160, 0x031, 0x130, 0x070, 0x025, 0x124, 0x064, 0x109,
  0x049, 0x148, 0x019, 0x118, 0x058, 0x00d, 0x10c, 0x04c, 0x01c, 0x103, 0x043,
  0x142, 0x013, 0x112, 0x052, 0x007, 0x106, 0x046, 0x016, 0x181, 0x0c1, 0x1c0,
  0x091, 0x190, 0x0d0, 0x085, 0x184, 0x0c4, 0x0a8, 0x0a2, 0x08a, 0x02a,
]
const ASTERISK = 0x094
const CODE128_PATTERNS = Code128Reader.CODE_PATTERNS

function blank(): Uint8ClampedArray {
  return new Uint8ClampedArray(W * H).fill(255)
}

function drawBars(luma: Uint8ClampedArray, modules: boolean[], moduleWidth: number) {
  const barHeight = Math.round(H * 0.4)
  const startY = Math.round((H - barHeight) / 2)
  const startX = Math.round((W - modules.length * moduleWidth) / 2)
  for (let module = 0; module < modules.length; module += 1) {
    if (!modules[module]) continue
    for (let x = 0; x < moduleWidth; x += 1) {
      for (let y = startY; y < startY + barHeight; y += 1) {
        luma[y * W + startX + module * moduleWidth + x] = 0
      }
    }
  }
}

function code39Modules(value: string): boolean[] {
  const chars = `*${value.toUpperCase()}*`
  const modules: boolean[] = []
  const push = (black: boolean, count: number) => {
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

function code128Modules(value: string): boolean[] {
  const values = [104]
  for (const char of value) values.push(char.charCodeAt(0) - 32)
  let checksum = values[0]
  for (let index = 1; index < values.length; index += 1) {
    checksum += values[index] * index
  }
  values.push(checksum % 103, 106)
  const modules: boolean[] = []
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

function qrLuma(text: string): Uint8ClampedArray {
  const luma = blank()
  const matrix = new QRCodeWriter().encode(text, BarcodeFormat.QR_CODE, 300, 300, new Map())
  const moduleSize = 6
  const side = matrix.getWidth() * moduleSize
  const x0 = Math.floor((W - side) / 2)
  const y0 = Math.floor((H - side) / 2)
  for (let y = 0; y < matrix.getHeight(); y += 1) {
    for (let x = 0; x < matrix.getWidth(); x += 1) {
      if (!matrix.get(x, y)) continue
      for (let dy = 0; dy < moduleSize; dy += 1) {
        for (let dx = 0; dx < moduleSize; dx += 1) {
          luma[(y0 + y * moduleSize + dy) * W + (x0 + x * moduleSize + dx)] = 0
        }
      }
    }
  }
  return luma
}

const otherHints = new Map<DecodeHintType, unknown>([
  [DecodeHintType.POSSIBLE_FORMATS, LINEAR_FORMATS.filter((f) => f !== CODE128)],
])
const others = new MultiFormatOneDReader(otherHints)
const decoder = new BarcodeDecoder()
const code128Only = new BarcodeDecoder([CODE128])

function measure(
  label: string,
  luma: Uint8ClampedArray,
  decode: (source: RGBLuminanceSource) => unknown,
) {
  const source = new RGBLuminanceSource(luma, W, H)
  const safe = (input: RGBLuminanceSource) => {
    try {
      return decode(input)
    } catch {
      return null
    }
  }
  for (let i = 0; i < 5; i += 1) safe(source)
  const times: number[] = []
  let hits = 0
  for (let i = 0; i < 30; i += 1) {
    const started = performance.now()
    if (safe(source)) hits += 1
    times.push(performance.now() - started)
  }
  times.sort((a, b) => a - b)
  console.log(
    `${label.padEnd(42)} ${times[15].toFixed(2).padStart(8)} ms  hits ${hits}/30`,
  )
}

const blankLuma = blank()
const code39Luma = blank()
drawBars(code39Luma, code39Modules('DH123456789'), 3)
const code128Luma = blank()
drawBars(code128Luma, code128Modules('DH123456789'), 3)
const qr = qrLuma('https://app.sendit.ma/deliveries/DH987654321')

const realWarn = console.warn
console.warn = () => {}

for (const [name, luma] of [
  ['blank', blankLuma],
  ['code39', code39Luma],
  ['qr', qr],
] as const) {
  console.log(`\n[${name}]`)
  measure('linear full chain (interleaved)', luma, (s) => decoder.decodeLinear(s))
  measure('linear Code 128 only', luma, (s) => code128Only.decodeLinear(s))
  measure('other 1D formats only', luma, (s) =>
    others.decode(new BinaryBitmap(new HybridBinarizer(s)), otherHints),
  )
  measure('matrix pass', luma, (s) => decoder.decodeMatrix(s))
}

console.warn = realWarn
