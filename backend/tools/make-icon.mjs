// 產生「加到手機桌面」時看到的那顆 icon：米色底，正中央一顆愛心。
//
// 為什麼是自己畫點陣圖而不是放一張 SVG：iOS 的 apple-touch-icon 只吃點陣圖，
// Android 的 maskable 也是照著點陣圖去裁，SVG 兩邊都不保證會被採用。
//
// 這支只用 Node 標準庫（node:zlib 做 deflate），沒有任何相依套件，
// 也不連外。PNG 就是「簽章 + IHDR + IDAT + IEND」四段，自己組比裝一個編碼器省事。
//
// 愛心用經典的隱函數畫：(x² + y² − 1)³ − x²y³ ≤ 0 的區域就是一顆心，
// 尖端朝下。每個像素取 4×4 個樣本算覆蓋率，邊緣才不會有鋸齒。
//
// 用法：node tools/make-icon.mjs
// 產出：assets/icons/ 底下四張 PNG。素材是產生出來的，改參數重跑就會全部更新。

import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 常數定義
const OUTPUT_DIR = fileURLToPath(new URL('../assets/icons/', import.meta.url))
const BACKGROUND = [0xec, 0xe2, 0xcf] // 與 style.css 的 --bg 同一個米色
const HEART = [0xd2, 0x59, 0x6b] // 暖紅，跟米色底放在一起還看得清楚
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const BIT_DEPTH = 8
const COLOR_TYPE_RGB = 2
const SAMPLES = 4 // 每個像素每軸取幾個樣本
const HEART_HALF_WIDTH = 1.13 // 隱函數畫出來的心，半寬大約是這個數
const HEART_SHIFT = -0.13 // 心的外框在垂直方向不對稱，往下挪這麼多才會置中
const CHANNELS = 3
const FILTER_NONE = 0
// 要產生哪幾張。ratio 是愛心佔整張圖的比例。
// maskable 那張要留給系統去裁圓角或裁成圓形，所以心畫得比較小，確保怎麼裁都不會被切到。
const TARGETS = [
  { name: 'icon-32.png', size: 32, ratio: 0.72 },
  { name: 'icon-180.png', size: 180, ratio: 0.62 },
  { name: 'icon-192.png', size: 192, ratio: 0.62 },
  { name: 'icon-512.png', size: 512, ratio: 0.62 },
  { name: 'icon-maskable-512.png', size: 512, ratio: 0.42 }
]

// 功能函數定義

// CRC32 查表，PNG 每一段結尾都要附一個
const CRC_TABLE = Array.from({ length: 256 }, (unused, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  }
  return value >>> 0
})

const crc32 = (buffer) => {
  let value = 0xffffffff
  for (const byte of buffer) {
    value = CRC_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
  }
  return (value ^ 0xffffffff) >>> 0
}

// 組出一段 PNG chunk：長度、型別、內容、CRC
const chunk = (type, data) => {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

// 這個點在不在心裡面
const isInsideHeart = (x, y) => {
  const radial = x * x + y * y - 1
  return radial * radial * radial - x * x * y * y * y <= 0
}

// 這個像素被心蓋住多少（0 到 1）。取樣點取在每個子格的中心，邊緣才會平順。
const heartCoverage = (px, py, center, half) => {
  let hits = 0
  for (let sy = 0; sy < SAMPLES; sy += 1) {
    for (let sx = 0; sx < SAMPLES; sx += 1) {
      const sampleX = px + (sx + 0.5) / SAMPLES
      const sampleY = py + (sy + 0.5) / SAMPLES
      const x = ((sampleX - center) / half) * HEART_HALF_WIDTH
      const y = ((center - sampleY) / half) * HEART_HALF_WIDTH + HEART_SHIFT
      if (isInsideHeart(x, y)) hits += 1
    }
  }
  return hits / (SAMPLES * SAMPLES)
}

// 依覆蓋率把底色與心的顏色混起來
const blend = (coverage, channel) => Math.round(BACKGROUND[channel] * (1 - coverage) + HEART[channel] * coverage)

// 畫出一張圖的原始像素，每一列前面補一個 filter 位元組（0 = 不做預測）
const renderRaster = (size, ratio) => {
  const center = size / 2
  const half = (size * ratio) / 2
  const raster = Buffer.alloc(size * (1 + size * CHANNELS))
  let cursor = 0
  for (let py = 0; py < size; py += 1) {
    raster[cursor] = FILTER_NONE
    cursor += 1
    for (let px = 0; px < size; px += 1) {
      const coverage = heartCoverage(px, py, center, half)
      raster[cursor] = blend(coverage, 0)
      raster[cursor + 1] = blend(coverage, 1)
      raster[cursor + 2] = blend(coverage, 2)
      cursor += CHANNELS
    }
  }
  return raster
}

const encodePng = (size, ratio) => {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = BIT_DEPTH
  header[9] = COLOR_TYPE_RGB
  // 後面三個位元組分別是壓縮法、過濾法、交錯法，PNG 目前都只有 0 一種
  return Buffer.concat([
    SIGNATURE,
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(renderRaster(size, ratio), { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

mkdirSync(OUTPUT_DIR, { recursive: true })
for (const target of TARGETS) {
  const png = encodePng(target.size, target.ratio)
  writeFileSync(join(OUTPUT_DIR, target.name), png)
  console.log(`  ${target.name}　${target.size}×${target.size}　${png.length} 位元組`)
}
console.log('icon 已產生於 assets/icons/。')
