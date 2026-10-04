// 換臉的決策：挑哪一格載入、載完之後點亮誰熄掉誰。
// 抽出來的理由是這段邏輯原本埋在 web/renderer.js 裡，需要 DOM 與真實網路才跑得到，
// 因而完全沒有測試覆蓋——臉會消失的問題就是從這裡出去的。
// 本檔案屬於純函式層，不讀檔、不連線、不碰 DOM（架構約束 A1、A11）。

// 常數定義
const FIRST_SLOT = 0
const NO_SLOT = null // 「這一格不用動」，與格號 0 區分
const MIN_SLOT_COUNT = 1

// 功能函數定義

// 格號必須是落在範圍內的整數，否則一律退回第一格
const normalizeSlot = (slot, slotCount) => {
  if (!Number.isInteger(slot) || slot < FIRST_SLOT || slot >= slotCount) return FIRST_SLOT
  return slot
}

// 挑出這一次要把新表情載進哪一格。
// 首次繪製沒有舊臉要保留，直接用目前這一格；之後一律換到另一格，
// 這樣舊臉在新臉載好之前都還留在畫面上。
export const pickFaceSlot = ({ activeSlot, slotCount, hasPainted } = {}) => {
  const count = Number.isInteger(slotCount) && slotCount >= MIN_SLOT_COUNT ? slotCount : MIN_SLOT_COUNT
  const active = normalizeSlot(activeSlot, count)
  if (hasPainted !== true) return active
  return count - 1 - active
}

// 載入結果出來之後，決定畫面要怎麼變。
//
// loaded 為 false 時回傳「哪一格都不要動」：新臉沒load成功就把舊臉熄掉的話，
// 兩張臉會同時看不見，臉的位置變成一個洞，背景直接透出來。
// 停在上一個表情雖然不精確，但永遠比沒有臉好。
export const planFaceSwap = ({ activeSlot, nextSlot, hasPainted, loaded } = {}) => {
  const painted = hasPainted === true
  if (loaded !== true) {
    return { show: NO_SLOT, hide: NO_SLOT, activeSlot, hasPainted: painted }
  }
  return {
    show: nextSlot,
    // 首次繪製時沒有舊臉，不必熄任何一格
    hide: painted ? activeSlot : NO_SLOT,
    activeSlot: nextSlot,
    hasPainted: true
  }
}
