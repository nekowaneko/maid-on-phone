// 圖層疊合渲染：依設定檔的 zOrder 疊出角色，並在表情變動時只換掉臉部那一層。
// 臉部保留兩張圖輪流交叉淡入，等新的一張可以顯示了才交換，避免硬切與換上白圖。
// 換素材、換圖層順序都只要動 config/emotion-map.json，這支程式不必改。

import { emotionToAssetPath, layerToAssetPath } from '../core/emotion.js'
import { pickFaceSlot, planFaceSwap } from '../core/face-swap.js'

// 常數定義
const IMAGE_TAG = 'img'
const LAYER_STYLE_NAME = 'layer' // 對應 style.css 的 .layer
const DYNAMIC_LAYER_KEY = 'face' // zOrder 中唯一由表情決定的圖層，其餘都是固定素材
const FACE_SLOTS = [0, 1] // 臉部的兩個輪替位置：一張淡出、一張淡入
const ASSET_BASE = new URL('../', import.meta.url) // 設定檔裡的路徑以專案根目錄為基準
const HIDDEN = 'hidden'
const VISIBLE = 'visible'
const OPAQUE = '1'
const TRANSPARENT = '0'
const EMPTY_TEXT = ''
const ASYNC_DECODING = 'async' // 預載只是要進快取，不必卡住主執行緒解碼
const DECODE_TIMEOUT_MS = 400 // 解碼等太久就先放行，畫面不能因為這個卡住
// 載入結果分三種：逾時只是「還沒好」，跟素材真的壞掉不是同一件事。
// 兩者混為一談的話，慢一點的網路會讓還在載的臉被當成壞掉而藏起來。
const LOAD_OK = 'ok'
const LOAD_FAILED = 'failed'
const LOAD_PENDING = 'pending'

// 功能函數定義

// 把設定檔裡的相對路徑換算成瀏覽器可用的網址
const toAssetUrl = (source) => new URL(source, ASSET_BASE).href

// 讓某一層留白，並留下繁體中文警告；其餘圖層照常顯示
// 同一張圖已經留白就不再重複警告：解碼失敗與 error 事件會各觸發一次
const blankLayer = (image, reason) => {
  if (image.style.visibility === HIDDEN) return
  image.style.visibility = HIDDEN
  console.warn(reason)
}

// 換上素材；路徑是空的就讓這一層留白，不阻斷其他圖層
const applySource = (image, source) => {
  if (typeof source !== 'string' || source.length === 0) {
    blankLayer(image, '找不到對應的圖層素材，該層留白。')
    return
  }
  image.style.visibility = VISIBLE
  image.src = toAssetUrl(source)
}

// 圖片是否已經有內容可以顯示
const isUsable = (image) => image.complete && image.naturalWidth > 0

// 等這張圖可以顯示。decode() 能避免換上還沒解碼的圖，但頁面沒有實際繪製時
// （分頁被切到背景、視窗被遮住）它可能永遠不會回來，所以同時等 load 事件
// 與一個上限，先到的算數。這條路徑一旦卡住，整條表情切換鏈都會停擺。
const waitForImage = (image) =>
  new Promise((resolve) => {
    let settled = false
    const finish = (result) => {
      if (settled) return
      settled = true
      resolve(result)
    }
    image.addEventListener('load', () => finish(LOAD_OK), { once: true })
    // 只有 error 事件代表素材真的有問題，這時才該讓該層留白
    image.addEventListener('error', () => finish(LOAD_FAILED), { once: true })
    image.decode().then(
      () => finish(LOAD_OK),
      // decode 被新的 src 打斷也會走到這裡，那不是失敗，所以退回 pending
      () => finish(isUsable(image) ? LOAD_OK : LOAD_PENDING)
    )
    // 逾時代表「還沒好」：不動畫面，讓它在背景繼續載完，下次切換就會是熱的
    setTimeout(() => finish(isUsable(image) ? LOAD_OK : LOAD_PENDING), DECODE_TIMEOUT_MS)
  })

// 換上素材並等它可以顯示，回報 LOAD_OK / LOAD_FAILED / LOAD_PENDING
const loadSource = async (image, source) => {
  if (typeof source !== 'string' || source.length === 0) {
    blankLayer(image, '找不到對應的圖層素材，該層留白。')
    return LOAD_FAILED
  }
  image.src = toAssetUrl(source)
  const result = await waitForImage(image)
  if (result === LOAD_FAILED) {
    blankLayer(image, `圖層素材載入失敗，該層留白：${source}`)
    return LOAD_FAILED
  }
  // 還在載的圖不動它的 visibility，維持現狀就好
  if (result === LOAD_OK) image.style.visibility = VISIBLE
  return result
}

// 建立一個圖層用的 img 元素
const createLayerImage = (key, zIndex) => {
  const image = document.createElement(IMAGE_TAG)
  image.id = `layer-${key}`
  image.className = LAYER_STYLE_NAME
  image.alt = EMPTY_TEXT // 純裝飾圖層，不需要替代文字
  image.style.zIndex = String(zIndex)
  image.addEventListener('error', () => {
    // 素材檔缺失時只讓這一層消失，畫面其他部分照常運作
    blankLayer(image, `圖層素材載入失敗，該層留白：${image.getAttribute('src')}`)
  })
  return image
}

// 開機就把每一張臉抓進瀏覽器快取。
// 臉部素材原本是「第一次用到該表情才去抓」，所以任何表情的第一次出現都是冷啟動，
// 一旦超過 DECODE_TIMEOUT_MS 就會被判定成還沒好，那一次的表情就白白跳過。
// 少見的表情（例如困擾）幾乎每次都撞上這條路徑，看起來就像它壞掉了。
// 這裡走設定檔迭代，不寫死任何表情名稱（架構約束 A5）。
const preloadFaces = (config) => {
  const emotionMap = config?.emotionMap
  if (emotionMap === null || typeof emotionMap !== 'object') return
  Object.keys(emotionMap).forEach((emotion) => {
    const source = emotionToAssetPath(emotion, config)
    if (typeof source !== 'string' || source.length === 0) return
    // 只是要觸發下載，不放進 DOM；載不起來也不影響畫面，交給換臉當下的處理
    const image = document.createElement(IMAGE_TAG)
    image.decoding = ASYNC_DECODING
    image.src = toAssetUrl(source)
  })
}

// 建立渲染器：一次把所有圖層放好，之後只換臉
export const createRenderer = (container, config) => {
  const zOrder = Array.isArray(config?.zOrder) ? config.zOrder : []
  const faceSlots = []
  let activeSlot = FACE_SLOTS[0]
  let hasPainted = false // 是否已經成功畫出過一張臉；首次繪製不做交叉淡入
  let wantedEmotion = EMPTY_TEXT // 最後一次被要求切換的表情，用來作廢過期的切換
  let swapChain = Promise.resolve() // 切換一律排隊，同一時間只會有一次解碼在進行

  zOrder.forEach((key, index) => {
    const zIndex = index + 1
    if (key === DYNAMIC_LAYER_KEY) {
      // 兩張臉共用同一個 z-index 與 .layer 的 inset 座標系，交換時不會有半個像素的位移
      FACE_SLOTS.forEach((slot) => {
        const image = createLayerImage(`${key}-${slot}`, zIndex)
        image.style.opacity = TRANSPARENT
        faceSlots.push(image)
        container.appendChild(image)
      })
      return
    }
    const image = createLayerImage(key, zIndex)
    container.appendChild(image)
    applySource(image, layerToAssetPath(key, config))
  })

  // 固定圖層排好之後才預載臉：先讓畫面有東西，再去抓等一下才會用到的素材
  preloadFaces(config)

  // 把新表情放進閒置那張，解碼完成後才交換不透明度。
  // 一定要排隊執行：兩次切換若同時進行，會算出同一個目標位置而互相打斷對方的
  // decode()，被取消的那次還會把已經換好的圖藏起來，臉就整個不見了。
  const swapFace = async (emotion) => {
    // 排隊等待期間又被要求換成別的表情，這一次就整個跳過
    if (wantedEmotion !== emotion) return
    const nextSlot = pickFaceSlot({ activeSlot, slotCount: faceSlots.length, hasPainted })
    const loaded = (await loadSource(faceSlots[nextSlot], emotionToAssetPath(emotion, config))) === LOAD_OK
    // 沒載成功就什麼都不動：舊臉留在畫面上，比兩張臉都熄掉變成一個洞好
    const plan = planFaceSwap({ activeSlot, nextSlot, hasPainted, loaded })
    if (plan.show !== null) faceSlots[plan.show].style.opacity = OPAQUE
    if (plan.hide !== null) faceSlots[plan.hide].style.opacity = TRANSPARENT
    activeSlot = plan.activeSlot
    hasPainted = plan.hasPainted
  }

  // 表情切換一律走 core/emotion.js 的解析結果，這裡不自行判斷情緒
  const setEmotion = (emotion) => {
    if (faceSlots.length === 0 || emotion === wantedEmotion) return
    wantedEmotion = emotion
    // 接在前一次之後執行；loadSource 自己吞掉錯誤，所以這條鏈不會斷
    swapChain = swapChain.then(() => swapFace(emotion))
  }

  return { setEmotion, layerKeys: [...zOrder] }
}
