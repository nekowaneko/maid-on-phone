// 表情解析：抽出開頭的方括號標籤、比對對照表、換算成圖層素材路徑。
// 本檔案屬於純函式層，零外部相依，可在無網路、無憑證的環境下完整測試。

// 常數定義
// 設定檔缺失時的最後防線。這是全專案唯一允許硬編的表情名稱，
// 其餘所有表情一律從 config/emotion-map.json 讀入，換素材時不必改程式。
const FALLBACK_EMOTION = 'neutral'
const TAG_SCAN_LIMIT = 40 // 只在前 40 個字元內找開頭標籤
// 半形全形括號都收，與 core/stream-parser.js 的判定保持一致
const LEADING_TAG_PATTERN = /^\s*[[［]([a-z_]+)[\]］]/
const PATH_SEPARATOR = '/'
const EMPTY_PATH = ''

// 功能函數定義

// 從文字開頭抽出標籤名，找不到回傳 null
export const extractLeadingTag = (text) => {
  if (typeof text !== 'string') return null
  const matched = text.slice(0, TAG_SCAN_LIMIT).match(LEADING_TAG_PATTERN)
  return matched ? matched[1] : null
}

// 決定要退回哪個表情：優先用設定檔給的預設值，缺了才動用最後防線常數
const resolveDefaultEmotion = (defaultEmotion) =>
  typeof defaultEmotion === 'string' && defaultEmotion.length > 0 ? defaultEmotion : FALLBACK_EMOTION

// 標籤不在對照表裡就退回預設表情，絕不開天窗
export const resolveEmotion = (tag, emotionMap, defaultEmotion) => {
  const safeMap = emotionMap ?? {}
  const known = typeof tag === 'string' && Object.hasOwn(safeMap, tag)
  return known ? tag : resolveDefaultEmotion(defaultEmotion)
}

// 從對照表取出某個表情對應的素材檔名，沒有就回傳 null
const lookupEmotionFile = (emotion, config) => {
  const map = config?.emotionMap ?? {}
  return typeof emotion === 'string' && Object.hasOwn(map, emotion) ? map[emotion] : null
}

// 把素材根目錄與檔名接成路徑；根目錄沒設定就直接用檔名
const joinAssetPath = (root, file) =>
  typeof root === 'string' && root.length > 0 ? root + PATH_SEPARATOR + file : file

// 依情緒鍵取得該圖層的檔案路徑；表情查不到就退回預設表情的素材
export const emotionToAssetPath = (emotion, config) => {
  const file = lookupEmotionFile(emotion, config) ?? lookupEmotionFile(config?.defaultEmotion, config)
  // 素材真的不存在時回傳空字串，由呼叫端讓該圖層留白，不阻斷整個畫面
  return file ? joinAssetPath(config?.assetRoot, file) : EMPTY_PATH
}

// 依固定圖層鍵（後髮、貓耳、身體、瀏海）取得素材路徑
export const layerToAssetPath = (layerKey, config) => {
  const layers = config?.layers ?? {}
  const file = typeof layerKey === 'string' && Object.hasOwn(layers, layerKey) ? layers[layerKey] : null
  return file ? joinAssetPath(config?.assetRoot, file) : EMPTY_PATH
}

// 組合：直接把一段文字解析成應該顯示的表情
export const parseFirstEmotion = (text, emotionMap, defaultEmotion) =>
  resolveEmotion(extractLeadingTag(text), emotionMap, defaultEmotion)
