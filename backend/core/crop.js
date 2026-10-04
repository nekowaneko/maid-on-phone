// 背景圖裁切的幾何計算：要從原圖切下哪一塊、那一塊還能往哪裡滑、
// 放大縮小之後變成哪一塊、切完要輸出多大。
//
// 本檔案屬於純函式層，不讀檔、不連線，也不碰畫面與瀏覽器儲存（架構約束 A1、A11）。
// 繪圖、觸控事件、影像編碼全部留在 web/，這裡只回答數字問題，
// 所以同一組算式在瀏覽器與測試裡跑出來的結果一定一樣。
//
// 座標一律以「原圖像素」為單位，滑動位置則用 0..1 的比例表示：
// 0 是貼齊左（上）緣，1 是貼齊右（下）緣，0.5 是置中。
// 用比例而不用像素，換一張解析度不同的圖時滑動位置才不必重算。
//
// 縮放倍率也是無單位的比例：1 代表剛好蓋滿畫面（看得到最多內容的那一種切法），
// 2 代表裁切框縮到一半、畫面上放大兩倍。刻意不允許小於 1，
// 因為那會讓裁切框超出原圖，貼上去就會露出空白邊。

// 常數定義
const OFFSET_MIN = 0
const OFFSET_MAX = 1
const OFFSET_CENTER = 0.5
const ZOOM_MIN = 1 // 剛好蓋滿畫面，也就是不放大
const HALF = 0.5 // 取中點用
const MIN_SIZE = 1 // 輸出尺寸至少 1 像素，繪圖介面不接受 0
const NO_SIZE = { width: 0, height: 0 }
const NO_RECT = { x: 0, y: 0, width: 0, height: 0 }
const NO_SLACK = { x: 0, y: 0 }
const FULL_SCALE = 1
const ZERO = 0

// 功能函數定義

// 只認有限的正數；寬高或比例是 0、負數、NaN 都代表這張圖還不能拿來算
const isPositive = (value) => typeof value === 'number' && Number.isFinite(value) && value > ZERO

// 把滑動位置夾回 0..1；壞掉的輸入一律當成置中，畫面不會因此空掉
export const clampOffset = (value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return OFFSET_CENTER
  return Math.min(OFFSET_MAX, Math.max(OFFSET_MIN, value))
}

// 把倍率夾進 1..maxZoom。壞掉的輸入或沒給上限一律當成 1，
// 也就是退回「剛好蓋滿」那一種切法，絕不會切出空白邊。
export const clampZoom = (zoom, maxZoom) => {
  const upper = isPositive(maxZoom) && maxZoom > ZOOM_MIN ? maxZoom : ZOOM_MIN
  if (typeof zoom !== 'number' || !Number.isFinite(zoom)) return ZOOM_MIN
  return Math.min(upper, Math.max(ZOOM_MIN, zoom))
}

// 幾何函式內部用的倍率把關：只擋下限與壞掉的型別。
// 上限屬於規則（跟原圖解析度與設定檔有關），由呼叫端先用 clampZoom 夾好再傳進來。
const usableZoom = (zoom) =>
  typeof zoom === 'number' && Number.isFinite(zoom) && zoom > ZOOM_MIN ? zoom : ZOOM_MIN

// 在原圖裡塞得下、長寬比又剛好等於畫面比例的最大矩形有多大，再除以倍率縮小。
// 倍率為 1 時這就是「滿版不留白」的那一塊；倍率越大，切下來的範圍越小、貼上去看起來越大。
export const coverCropSize = (sourceWidth, sourceHeight, targetAspect, zoom) => {
  if (!isPositive(sourceWidth) || !isPositive(sourceHeight) || !isPositive(targetAspect)) return { ...NO_SIZE }
  const scale = usableZoom(zoom)
  // 原圖比畫面寬 → 高度吃滿，寬度由比例決定；反之則寬度吃滿
  if (sourceWidth / sourceHeight > targetAspect) {
    return { width: (sourceHeight * targetAspect) / scale, height: sourceHeight / scale }
  }
  return { width: sourceWidth / scale, height: sourceWidth / targetAspect / scale }
}

// 裁切框在原圖裡還剩多少可以滑（像素）。某一軸是 0 就代表那個方向已經滿版，滑不動。
// 手機直式畫面配上橫幅照片、且沒有放大時，通常只有 x 有得滑；一放大兩軸就都有得滑了。
export const cropSlack = (sourceWidth, sourceHeight, targetAspect, zoom) => {
  const size = coverCropSize(sourceWidth, sourceHeight, targetAspect, zoom)
  if (size.width === ZERO) return { ...NO_SLACK }
  return {
    x: Math.max(ZERO, sourceWidth - size.width),
    y: Math.max(ZERO, sourceHeight - size.height)
  }
}

// 依目前的滑動位置與倍率，算出實際要從原圖切下來的矩形
export const computeCropRect = (sourceWidth, sourceHeight, targetAspect, offsetX, offsetY, zoom) => {
  const size = coverCropSize(sourceWidth, sourceHeight, targetAspect, zoom)
  if (size.width === ZERO) return { ...NO_RECT }
  const slack = cropSlack(sourceWidth, sourceHeight, targetAspect, zoom)
  return {
    x: slack.x * clampOffset(offsetX),
    y: slack.y * clampOffset(offsetY),
    width: size.width,
    height: size.height
  }
}

// 手指滑了幾個像素 → 新的滑動位置。
// slack 是「這個方向總共能滑幾個像素」，用哪一種座標系都可以，只要跟 deltaPixels 同一種。
// slack 為 0（滑不動）時位置原封不動，也就不會除以零。
export const shiftOffset = (offset, deltaPixels, slackPixels) => {
  const current = clampOffset(offset)
  if (!isPositive(slackPixels)) return current
  const delta = typeof deltaPixels === 'number' && Number.isFinite(deltaPixels) ? deltaPixels : ZERO
  return clampOffset(current + delta / slackPixels)
}

// 換倍率之後要把滑動位置改成多少，才能讓原本在正中央的那一點留在正中央。
// 少了這一步，放大時畫面會自己往邊上飄，使用者得再滑一次把想看的地方拉回來。
// 一律以單一軸為單位呼叫（x 傳寬、y 傳高），兩軸互不影響。
export const rezoomOffset = (sourceLength, oldCropLength, newCropLength, offset) => {
  const current = clampOffset(offset)
  if (!isPositive(sourceLength) || !isPositive(oldCropLength) || !isPositive(newCropLength)) return current
  const newSlack = sourceLength - newCropLength
  // 新的裁切框剛好吃滿這一軸，位置只有置中一種可能，同時也避免除以零
  if (newSlack <= ZERO) return OFFSET_CENTER
  const center = (sourceLength - oldCropLength) * current + oldCropLength * HALF
  return clampOffset((center - newCropLength * HALF) / newSlack)
}

// 裁切完要存成多大。等比縮到不超過上限，原圖本來就比上限小就不放大，
// 免得把一張小圖硬撐大之後檔案變大、畫質又沒變好。
export const outputSize = (cropWidth, cropHeight, maxWidth) => {
  if (!isPositive(cropWidth) || !isPositive(cropHeight)) return { ...NO_SIZE }
  const scale = isPositive(maxWidth) ? Math.min(FULL_SCALE, maxWidth / cropWidth) : FULL_SCALE
  return {
    width: Math.max(MIN_SIZE, Math.round(cropWidth * scale)),
    height: Math.max(MIN_SIZE, Math.round(cropHeight * scale))
  }
}
