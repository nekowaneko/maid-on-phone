// 更換服裝的抽屜：從 config/emotion-map.json 的 outfits 列出幾套，挑一套換上。
//
// 開關方式與卡片外型都跟更換背景圖那個抽屜完全一樣（.drawer + is-open + aria-hidden、
// .pick-card 那一組），沒有另外發明視覺語言。差別只有兩點：服裝是內建素材，
// 所以沒有上傳也沒有刪除；縮圖不必存起來，直接從素材本身裁一塊畫出來。
//
// 這一支不認識任何服裝名稱，也不寫死檔名。要加一套衣服只要動設定檔。

import { layerToAssetPath } from '../core/emotion.js'

// 常數定義
const ASSET_BASE = new URL('../', import.meta.url) // 設定檔的路徑以專案根目錄為基準
const CURRENT_STORAGE_KEY = 'companion:outfit'
const BODY_LAYER_KEY = 'body' // 換裝換的就是這一層，其餘圖層不動
const BODY_LAYER_ID = `layer-${BODY_LAYER_KEY}` // renderer.js 給固定圖層的 id
const OPEN_CLASS = 'is-open'
const PICKED_CLASS = 'is-picked'
const CARD_CLASS = 'pick-card'
const CARD_THUMB_CLASS = 'pick-card-thumb'
const CARD_TEXT_CLASS = 'pick-card-text'
const CARD_LABEL_CLASS = 'pick-card-label'
const CARD_META_CLASS = 'pick-card-meta'
const ARIA_HIDDEN = 'aria-hidden'
const ARIA_PRESSED = 'aria-pressed'
const TRUE_TEXT = 'true'
const FALSE_TEXT = 'false'
const EMPTY_TEXT = ''
const DIV_TAG = 'div'
const PARAGRAPH_TAG = 'p'
const BUTTON_TAG = 'button'
const BUTTON_TYPE = 'button'
const CANVAS_TAG = 'canvas'
const CANVAS_CONTEXT = '2d'
const NOTE_TEXT = '點一下先選起來，按「選擇」才會換上。'
const EMPTY_LIST_TEXT = '設定檔裡沒有列出任何服裝。'
const IN_USE_TEXT = '使用中'
// 縮圖：從素材上裁下領口到腰際這一塊。整張全身縮到 48 x 84 之後衣服只剩幾個像素，
// 分不出哪套是哪套；裁腰部以上才看得出領型與顏色。
const THUMB_CROP = { x: 280, y: 245, width: 240, height: 420 }
const THUMB_SCALE = 2 // 畫布做 2 倍，在高解析度螢幕上不會糊掉
const THUMB_WIDTH = 48
const THUMB_HEIGHT = 84

// 元素
const openButton = document.getElementById('outfit-open')
const listElement = document.getElementById('outfit-list')
const closeButton = document.getElementById('outfit-close')
const listBodyElement = document.getElementById('outfit-list-body')
const noteElement = document.getElementById('outfit-note')
const applyButton = document.getElementById('outfit-apply')

// 狀態
const state = {
  config: null,
  keys: [],
  selectedKey: EMPTY_TEXT,
  currentKey: EMPTY_TEXT
}

// 功能函數定義

const toAssetUrl = (source) => new URL(source, ASSET_BASE).href

// 某一套服裝的素材路徑；設定檔沒有這一套就回傳空字串
const outfitToAssetPath = (key, config) => {
  const outfits = config?.outfits ?? {}
  const file = typeof key === 'string' && Object.hasOwn(outfits, key) ? outfits[key] : null
  return file ? `${config?.assetRoot ?? EMPTY_TEXT}/${file}` : EMPTY_TEXT
}

const outfitName = (key, config) => config?.outfitNames?.[key] ?? key

// 選不到有效的那一套時退回預設值，再退回清單第一套，絕不讓身體那層開天窗
const resolveKey = (key, config, keys) => {
  if (keys.includes(key)) return key
  if (keys.includes(config?.defaultOutfit)) return config.defaultOutfit
  return keys[0] ?? EMPTY_TEXT
}

const openDrawer = () => {
  listElement.classList.add(OPEN_CLASS)
  listElement.setAttribute(ARIA_HIDDEN, FALSE_TEXT)
}

const closeDrawer = () => {
  listElement.classList.remove(OPEN_CLASS)
  listElement.setAttribute(ARIA_HIDDEN, TRUE_TEXT)
}

// 記住現在穿的是哪一套，重新整理之後才會自己穿回來
const writeCurrentKey = (key) => {
  try {
    window.localStorage.setItem(CURRENT_STORAGE_KEY, key)
  } catch (error) {
    console.warn('目前的服裝記不起來，重新整理之後會回到預設那一套。')
  }
}

const readCurrentKey = () => {
  try {
    return window.localStorage.getItem(CURRENT_STORAGE_KEY) ?? EMPTY_TEXT
  } catch (error) {
    return EMPTY_TEXT
  }
}

// 把某一套換到身體那一層。素材缺失時不動，舊的那套留在畫面上，比變成一個洞好。
const wearOutfit = (key) => {
  const layer = document.getElementById(BODY_LAYER_ID)
  const source = outfitToAssetPath(key, state.config)
  if (layer === null || source === EMPTY_TEXT) {
    console.warn(`找不到這套服裝的素材，維持原樣：${key}`)
    return false
  }
  layer.src = toAssetUrl(source)
  state.currentKey = key
  return true
}

// 縮圖：直接從素材裁一塊畫出來，不另外準備預覽圖，換素材時預覽自動跟著換
const createThumbnail = (source) => {
  const canvas = document.createElement(CANVAS_TAG)
  canvas.className = CARD_THUMB_CLASS
  canvas.width = THUMB_WIDTH * THUMB_SCALE
  canvas.height = THUMB_HEIGHT * THUMB_SCALE
  const context = canvas.getContext(CANVAS_CONTEXT)
  const image = new Image()
  image.addEventListener('load', () => {
    const { x, y, width, height } = THUMB_CROP
    context.drawImage(image, x, y, width, height, 0, 0, canvas.width, canvas.height)
  })
  // 載不到就讓縮圖留白，卡片與文字照常顯示，還是選得動
  image.addEventListener('error', () => console.warn(`服裝縮圖載入失敗：${source}`))
  image.src = toAssetUrl(source)
  return canvas
}

// 一張卡片：縮圖在左、名稱與狀態在右。整張卡片就是按鈕，手機上比較好點。
const createCard = (key) => {
  const card = document.createElement(BUTTON_TAG)
  card.type = BUTTON_TYPE
  const picked = key === state.selectedKey
  card.className = picked ? `${CARD_CLASS} ${PICKED_CLASS}` : CARD_CLASS
  card.setAttribute(ARIA_PRESSED, picked ? TRUE_TEXT : FALSE_TEXT)
  const source = outfitToAssetPath(key, state.config)
  card.appendChild(createThumbnail(source))
  const text = document.createElement(DIV_TAG)
  text.className = CARD_TEXT_CLASS
  const label = document.createElement(PARAGRAPH_TAG)
  label.className = CARD_LABEL_CLASS
  // 一律走 textContent，設定檔裡的名稱不會被當成標記解讀
  label.textContent = outfitName(key, state.config)
  const meta = document.createElement(PARAGRAPH_TAG)
  meta.className = CARD_META_CLASS
  meta.textContent = key === state.currentKey ? IN_USE_TEXT : state.config.outfits[key]
  text.appendChild(label)
  text.appendChild(meta)
  card.appendChild(text)
  card.addEventListener('click', () => {
    state.selectedKey = key
    renderList()
  })
  return card
}

const renderList = () => {
  listBodyElement.textContent = EMPTY_TEXT
  if (state.keys.length === 0) {
    const hint = document.createElement(PARAGRAPH_TAG)
    hint.className = CARD_META_CLASS
    hint.textContent = EMPTY_LIST_TEXT
    listBodyElement.appendChild(hint)
    applyButton.disabled = true
    return
  }
  state.keys.forEach((key) => listBodyElement.appendChild(createCard(key)))
  // 已經穿在身上的那套不必再按一次「選擇」
  applyButton.disabled = state.selectedKey === EMPTY_TEXT || state.selectedKey === state.currentKey
}

const openList = () => {
  openDrawer()
  noteElement.textContent = NOTE_TEXT
  // 預設就停在現在穿的那一套，一眼看得出是哪一套
  state.selectedKey = state.currentKey
  renderList()
}

// 右上角的 ✕ 是取消：關起來就好，衣服維持原樣
const cancelList = () => closeDrawer()

const applySelected = () => {
  if (!wearOutfit(state.selectedKey)) return
  writeCurrentKey(state.selectedKey)
  closeDrawer()
}

// 設定檔沒列服裝就把按鈕收起來，不留一顆點了沒反應的按鈕在畫面上
const disableFeature = () => {
  openButton.hidden = true
}

// 啟動：讀設定 → 接上抽屜 → 把上次穿的那套穿回來
export const setupOutfit = (config) => {
  state.config = config
  state.keys = Object.keys(config?.outfits ?? {})
  if (state.keys.length === 0) {
    disableFeature()
    return
  }
  // renderer.js 是照 layers.body 擺上第一張的，這裡再依記住的那套覆蓋一次。
  // 兩者不一致時以記住的為準，否則重新整理就會變回預設那套。
  state.currentKey = resolveKey(readCurrentKey(), config, state.keys)
  const initial = outfitToAssetPath(state.currentKey, config)
  if (initial !== layerToAssetPath(BODY_LAYER_KEY, config)) wearOutfit(state.currentKey)
  openButton.addEventListener('click', openList)
  closeButton.addEventListener('click', cancelList)
  applyButton.addEventListener('click', applySelected)
}
