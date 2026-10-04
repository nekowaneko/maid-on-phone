// 時間差分級：把「距離上次對話過了幾分鐘」換算成一句要注入提示詞的情境提示。
// 分級表由 config/time-gap-tiers.json 提供，本檔案不硬編任何級距。

// 常數定義
const MILLISECONDS_PER_MINUTE = 60000
const NO_LIMIT = null // 分級表最後一項的 maxMinutes 為 null，代表無上限
const EMPTY_HINT = ''

// 功能函數定義

// 分鐘數正規化：非數字、負數、無限大一律視為 0 分鐘（等同剛剛才聊過）
const normalizeMinutes = (minutes) => {
  const value = Number(minutes)
  return Number.isFinite(value) && value > 0 ? value : 0
}

// 這一級距有沒有涵蓋這個分鐘數
const tierCovers = (tier, minutes) => {
  const limit = tier?.maxMinutes
  if (limit === NO_LIMIT || limit === undefined) return true
  return minutes <= Number(limit)
}

// 分鐘數 → 分級表中對應的那一筆；找不到（例如空表）回傳 null
export const pickTier = (minutes, tiers) => {
  const list = Array.isArray(tiers) ? tiers : []
  const value = normalizeMinutes(minutes)
  return list.find((tier) => tierCovers(tier, value)) ?? null
}

// 分鐘數 → 要注入提示詞的一句話
export const buildTimeGapHint = (minutes, tiers) => {
  const tier = pickTier(minutes, tiers)
  return typeof tier?.hint === 'string' ? tier.hint : EMPTY_HINT
}

// 兩個毫秒時間戳的間隔換算成分鐘，供前端算出距離上次對話多久
export const minutesBetween = (fromMs, toMs) => {
  const from = Number(fromMs)
  const to = Number(toMs)
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0
  return Math.max(0, (to - from) / MILLISECONDS_PER_MINUTE)
}
