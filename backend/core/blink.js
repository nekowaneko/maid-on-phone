// 眨眼的等待時間與條件。本檔案屬於純函式層，隨機數由呼叫端傳入。

// 常數定義
const RANDOM_MIN = 0
const RANDOM_MAX_EXCLUSIVE = 1 - Number.EPSILON // 夾回 [0,1) 的上界
const LIVE_STATE = 'live'

// 功能函數定義

// 把亂數夾回 [0,1)；不是有限數字時視為 0
const clampRandom = (random) => {
  if (typeof random !== 'number' || !Number.isFinite(random)) return RANDOM_MIN
  return Math.min(Math.max(random, RANDOM_MIN), RANDOM_MAX_EXCLUSIVE)
}

// 依亂數（0 以上、小於 1，超出範圍就夾回）算出下一次眨眼的等待毫秒數，落在 [minIntervalMs, maxIntervalMs]，四捨五入成整數
export const nextBlinkDelay = (random, blinkConfig) => {
  const { minIntervalMs, maxIntervalMs } = blinkConfig
  return Math.round(minIntervalMs + clampRandom(random) * (maxIntervalMs - minIntervalMs))
}

// 現在可不可以眨眼：只有「通話中」、目前表情是預設表情、而且沒有正在逐字說話時才可以
export const canBlink = ({ state, emotion, defaultEmotion, speaking }) =>
  state === LIVE_STATE && emotion === defaultEmotion && speaking === false
