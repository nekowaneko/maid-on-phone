// 試穿間：拿正式的 renderer 與正式的 config/emotion-map.json 疊圖，
// 只多給兩排按鈕切換服裝與表情。用途是肉眼驗收素材對齊，不是產品功能。
//
// 換服裝的做法：直接改 body 那一層的 src。renderer.js 只把 face 當動態圖層
// （見 renderer.js 的 DYNAMIC_LAYER_KEY），要讓正式畫面也能換裝的話得動它，
// 但檢視頁不值得為此改產品程式，所以這裡就近抓 DOM。

import { createRenderer } from './renderer.js'

// 常數定義
const CONFIG_URL = new URL('../config/emotion-map.json', import.meta.url)
const ASSET_BASE = new URL('../', import.meta.url) // 設定檔的路徑以專案根目錄為基準
const BODY_LAYER_ID = 'layer-body' // renderer.js 給固定圖層的 id 是 `layer-${key}`
const PICK_STYLE_NAME = 'tryon-pick'
const PRESSED = 'aria-pressed'

// 功能函數定義

// 設定檔裡的檔名換算成瀏覽器可用的網址
const toAssetUrl = (root, file) => new URL(`${root}/${file}`, ASSET_BASE).href

// 造一排按鈕：entries 是 [鍵, 顯示名稱]，按下去就呼叫 onPick 並更新反白狀態
const renderPicks = (container, entries, initialKey, onPick) => {
  const buttons = new Map()
  const highlight = (activeKey) => {
    buttons.forEach((button, key) => button.setAttribute(PRESSED, String(key === activeKey)))
  }
  entries.forEach(([key, label]) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = PICK_STYLE_NAME
    button.textContent = label
    button.addEventListener('click', () => {
      onPick(key)
      highlight(key)
    })
    buttons.set(key, button)
    container.appendChild(button)
  })
  highlight(initialKey)
}

// 把「鍵 → 檔名」的對照表配上顯示名稱；沒給名稱就直接顯示鍵
const toEntries = (source, names) =>
  Object.keys(source ?? {}).map((key) => [key, names?.[key] ?? key])

// 啟動
const config = await (await fetch(CONFIG_URL)).json()
const renderer = createRenderer(document.getElementById('character'), config)

const bodyLayer = document.getElementById(BODY_LAYER_ID)
const wearOutfit = (key) => {
  const file = config.outfits?.[key]
  // 設定檔漏了這一套就什麼都不做，讓身上維持前一套，不要換成空圖變成一個洞
  if (typeof file !== 'string' || file.length === 0) {
    console.warn(`設定檔找不到這套服裝的素材：${key}`)
    return
  }
  bodyLayer.src = toAssetUrl(config.assetRoot, file)
}

renderPicks(
  document.getElementById('outfit-picks'),
  toEntries(config.outfits, config.outfitNames),
  config.defaultOutfit,
  wearOutfit
)

renderPicks(
  document.getElementById('emotion-picks'),
  toEntries(config.emotionMap, config.displayNames),
  config.defaultEmotion,
  (key) => renderer.setEmotion(key)
)

renderer.setEmotion(config.defaultEmotion)
