// 背景圖的規則層：說明文字合不合格、裁切後的檔案有沒有超過單張上限、
// 清單怎麼排、目前選中的那一張還在不在、刪掉之後剩下哪些、這張圖最多能放大到幾倍。
//
// 本檔案屬於純函式層，不讀檔也不連線（架構約束 A1），
// 限制值由呼叫端把 config/background.json 解析後傳進來，這裡不自帶任何數字上限。
// IndexedDB 的開關與讀寫在 web/background-store.js，那一支不做判斷，判斷全在這裡。

// 常數定義
const EMPTY_TEXT = ''
const BYTES_PER_KB = 1024
const BYTES_PER_MB = 1048576
const MB_DECIMALS = 1
const UNKNOWN_SIZE_TEXT = '未知大小'
const EMPTY_IMAGE_MESSAGE = '裁切後沒有拿到圖片內容，請再試一次。'
const ID_PREFIX = 'bg-'
const ID_RADIX = 36
const ID_WIDTH = 6
const ID_SPACE = 2176782336 // 36 的 6 次方，剛好填滿 ID_WIDTH 個字元
const ZOOM_MIN = 1 // 不放大，也就是剛好蓋滿畫面的那一種切法
const PAD_CHAR = '0'
const ZERO = 0

// 功能函數定義

// 只認有限的數字，其餘（null、undefined、NaN、字串）一律當作沒有這個值
const toNumberOrNull = (value) => {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

// 把位元組數講成人看得懂的大小，用在清單與超標訊息上
export const describeBytes = (byteLength) => {
  const bytes = toNumberOrNull(byteLength)
  if (bytes === null || bytes < ZERO) return UNKNOWN_SIZE_TEXT
  if (bytes >= BYTES_PER_MB) return `${(bytes / BYTES_PER_MB).toFixed(MB_DECIMALS)} MB`
  if (bytes >= BYTES_PER_KB) return `${Math.round(bytes / BYTES_PER_KB)} KB`
  return `${Math.round(bytes)} B`
}

// 說明文字的檢查。回傳 { ok, errors, label }，label 是修剪過的版本，存檔就用它。
// 之所以一定要有文字：清單裡只看縮圖很難認出哪張是哪張。
export const validateLabel = (label, settings) => {
  const text = typeof label === 'string' ? label.trim() : EMPTY_TEXT
  const errors = []
  const min = toNumberOrNull(settings?.minLabelChars)
  const max = toNumberOrNull(settings?.maxLabelChars)
  if (min !== null && text.length < min) {
    errors.push(`說明文字至少要 ${min} 個字，之後在清單裡才認得出這張是什麼。`)
  }
  if (max !== null && text.length > max) {
    errors.push(`說明文字最多 ${max} 個字，目前 ${text.length} 個字。`)
  }
  return { ok: errors.length === ZERO, errors, label: text }
}

// 單張上限的檢查。上限沒設（或設成非數字）就代表不限制，這裡不自行代入預設值。
export const validateBytes = (byteLength, settings) => {
  const bytes = toNumberOrNull(byteLength)
  if (bytes === null || bytes <= ZERO) return { ok: false, errors: [EMPTY_IMAGE_MESSAGE] }
  const max = toNumberOrNull(settings?.maxBytes)
  if (max !== null && max > ZERO && bytes > max) {
    return {
      ok: false,
      errors: [
        `裁切後的圖片有 ${describeBytes(bytes)}，超過單張上限 ${describeBytes(max)}。` +
          '換一張畫面單純一點的圖，或把裁切範圍拉小一些。'
      ]
    }
  }
  return { ok: true, errors: [] }
}

// 產生一筆紀錄的編號。時間戳在前，清單即使不排序也大致照順序，
// 後面補一段亂數，同一毫秒連續存兩張也不會撞號。
export const createRecordId = (createdAt, seed) => {
  const stamp = Math.trunc(toNumberOrNull(createdAt) ?? ZERO)
  const raw = toNumberOrNull(seed) ?? ZERO
  const fraction = Math.abs(raw) % 1
  const suffix = Math.floor(fraction * ID_SPACE).toString(ID_RADIX).padStart(ID_WIDTH, PAD_CHAR)
  return `${ID_PREFIX}${stamp}-${suffix}`
}

// 整理成要存進 IndexedDB 的形狀。多餘的欄位一律丟掉，
// 存進去的東西跟這裡列出來的一模一樣，日後讀出來才不會有驚喜。
export const createRecord = (input) => ({
  id: String(input?.id ?? EMPTY_TEXT),
  label: typeof input?.label === 'string' ? input.label.trim() : EMPTY_TEXT,
  createdAt: toNumberOrNull(input?.createdAt) ?? ZERO,
  bytes: toNumberOrNull(input?.bytes) ?? ZERO,
  width: toNumberOrNull(input?.width) ?? ZERO,
  height: toNumberOrNull(input?.height) ?? ZERO
})

// 新的排前面。回傳新陣列，不動到傳進來的那一份。
export const sortByNewest = (records) => {
  if (!Array.isArray(records)) return []
  return [...records].sort((left, right) => (toNumberOrNull(right?.createdAt) ?? ZERO) - (toNumberOrNull(left?.createdAt) ?? ZERO))
}

// 找出某一筆；找不到回傳 null，呼叫端就知道這個編號已經不存在了
export const findRecord = (records, id) => {
  if (!Array.isArray(records) || typeof id !== 'string' || id.length === ZERO) return null
  return records.find((record) => record?.id === id) ?? null
}

// 選取狀態的收斂：選中的那一張若已經不在清單裡（例如換了瀏覽器），就當作沒選。
// 「選擇」按鈕能不能按，一律問這個結果，不另外記一份狀態。
export const resolveSelection = (records, id) => (findRecord(records, id) === null ? null : id)

// 目前的選取是否足以按下「選擇」
export const canApply = (records, id) => resolveSelection(records, id) !== null

// 目前的選取是否足以按下「刪除」。條件跟「選擇」一樣是真的選到一張，
// 但兩顆按鈕各問各的：日後任一邊要加條件（例如禁止刪掉正在用的那張）都不會牽動另一邊。
export const canDelete = (records, id) => resolveSelection(records, id) !== null

// 刪掉某一筆之後的清單。回傳新陣列，不動到傳進來的那一份；
// 那個編號本來就不在裡面時，回傳的內容跟原本一樣，呼叫端不必先檢查存不存在。
export const removeRecord = (records, id) => {
  if (!Array.isArray(records)) return []
  if (typeof id !== 'string' || id.length === ZERO) return [...records]
  return records.filter((record) => record?.id !== id)
}

// 這張圖最多能放大到幾倍。兩道限制取嚴格的那一個：
//   一是設定檔給的倍率上限 maxZoom；
//   二是畫質保護——裁切框不得小於 minCropWidth 個原圖像素，
//      否則一路放大之後存下來的會是一張放大糊掉的圖。
// coverWidth 指倍率為 1（剛好蓋滿畫面）時裁切框的寬度，由呼叫端從幾何層算好傳進來。
// 兩個限制值任一個沒設就只用另一個，這裡同樣不自帶預設數字。
export const resolveMaxZoom = (coverWidth, settings) => {
  const configured = toNumberOrNull(settings?.maxZoom)
  const limit = configured !== null && configured > ZOOM_MIN ? configured : ZOOM_MIN
  const width = toNumberOrNull(coverWidth)
  const minWidth = toNumberOrNull(settings?.minCropWidth)
  if (width === null || width <= ZERO || minWidth === null || minWidth <= ZERO) return limit
  return Math.max(ZOOM_MIN, Math.min(limit, width / minWidth))
}
