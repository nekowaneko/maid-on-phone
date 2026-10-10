// 盤前均線核心純函式模組
// 負責計算均線、八種排列判定、交易日推算與追蹤輸入校驗。
// 遵守架構約束：純函式不連線、不讀檔、不碰環境變數、不依賴系統時鐘（架構約束 A1、A39、V24）。

// 常數定義
const MS_PER_DAY = 24 * 60 * 60 * 1000
const MAX_PREV_DAYS_SEARCH = 15
const MIN_INPUT_CHARS = 1
const MAX_INPUT_CHARS = 40

// 功能函數定義

/**
 * 將數值四捨五入至指定小數位數（0.5 進位）
 * @param {number} value 數值
 * @param {number} digits 小數位數
 * @returns {number}
 */
export const roundTo = (value, digits = 2) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0
  const factor = 10 ** digits
  return Math.round((value + Number.EPSILON) * factor) / factor
}

/**
 * 計算陣列最後 n 筆的平均值
 * @param {Array<number>} closes 收盤價陣列（由舊到新）
 * @param {number} n 週期筆數
 * @returns {number|null}
 */
export const averageLast = (closes, n) => {
  if (!Array.isArray(closes) || closes.length < n || n <= 0) return null
  const slice = closes.slice(closes.length - n).map((val) => Number(val))
  if (slice.some((val) => !Number.isFinite(val))) return null // 含非數字的收盤價不算平均
  return slice.reduce((acc, val) => acc + val, 0) / n
}

/**
 * 依 5、20、60 日均線判定排列種類
 * @param {number} m5 5 日均線
 * @param {number} m20 20 日均線
 * @param {number} m60 60 日均線
 * @param {object} contract 均線契約物件
 * @returns {string} 排列種類代號
 */
export const classify = (m5, m20, m60, contract) => {
  const roundDigits = contract?.classify?.roundDigits ?? 2
  const r5 = roundTo(m5, roundDigits)
  const r20 = roundTo(m20, roundDigits)
  const r60 = roundTo(m60, roundDigits)

  const tieKind = contract?.classify?.tie ?? 'T'
  if (r5 === r20 || r5 === r60 || r20 === r60) {
    return tieKind
  }

  const items = [
    { label: '5', val: r5 },
    { label: '20', val: r20 },
    { label: '60', val: r60 }
  ]
  items.sort((a, b) => b.val - a.val)
  const orderKey = items.map((item) => item.label).join('>')

  return contract?.classify?.byOrder?.[orderKey] ?? tieKind
}

/**
 * 計算單檔標的的均線與種類
 * @param {Array<number>} closes 收盤價陣列（由舊到新）
 * @param {object} contract 均線契約物件
 * @returns {{kind: string, ma: Array<number>|null}}
 */
export const computeStock = (closes, contract) => {
  const minCloses = contract?.minCloses ?? 60
  const insufficientKind = contract?.classify?.insufficient ?? 'N'

  if (!Array.isArray(closes) || closes.length < minCloses) {
    return { kind: insufficientKind, ma: null }
  }

  const roundDigits = contract?.classify?.roundDigits ?? 2
  const a5 = averageLast(closes, 5)
  const a20 = averageLast(closes, 20)
  const a60 = averageLast(closes, 60)
  if (a5 === null || a20 === null || a60 === null) return { kind: insufficientKind, ma: null } // 收盤價不合格當資料不足

  const m5 = roundTo(a5, roundDigits)
  const m20 = roundTo(a20, roundDigits)
  const m60 = roundTo(a60, roundDigits)
  const kind = classify(m5, m20, m60, contract)

  return { kind, ma: [m5, m20, m60] }
}

/**
 * 取得指定種類的規則描述文字
 * @param {string} kind 排列種類
 * @param {object} lines 台詞設定物件
 * @returns {string}
 */
export const descFor = (kind, lines) => lines?.desc?.[kind] ?? ''

/**
 * 計算多頭、空頭與其他種類之檔數統計
 * @param {Array<object>} items 項目清單
 * @returns {{u: number, d: number, m: number}}
 */
export const countKinds = (items = []) => {
  let u = 0
  let d = 0
  let m = 0

  for (const item of items) {
    if (!item || item.pending || item.failed || !item.kind) continue
    if (item.kind === 'U') {
      u += 1
    } else if (item.kind === 'D') {
      d += 1
    } else {
      m += 1
    }
  }

  return { u, d, m }
}

/**
 * 判斷指定日期是否為交易日（排除週末與休市日）
 * @param {string} dateKey 日期字串 YYYY-MM-DD
 * @param {Array<string>} closedDates 休市日清單
 * @returns {boolean}
 */
export const isTradingDay = (dateKey, closedDates = []) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  const dayOfWeek = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  if (dayOfWeek === 0 || dayOfWeek === 6) return false
  if (Array.isArray(closedDates) && closedDates.includes(dateKey)) return false
  return true
}

/**
 * 往前推算最近一個交易日（不含基準日）
 * @param {string} dateKey 基準日期 YYYY-MM-DD
 * @param {Array<string>} closedDates 休市日清單
 * @returns {string} 最近交易日 YYYY-MM-DD
 */
export const prevTradingDay = (dateKey, closedDates = []) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  const baseMs = Date.UTC(y, m - 1, d)

  for (let offset = 1; offset <= MAX_PREV_DAYS_SEARCH; offset += 1) {
    const candidateDate = new Date(baseMs - offset * MS_PER_DAY).toISOString().slice(0, 10)
    if (isTradingDay(candidateDate, closedDates)) {
      return candidateDate
    }
  }

  throw new Error('NO_PREV_TRADING_DAY')
}

/**
 * 組裝推播用的 ma 欄位 JSON 字串（維持固定鍵值順序）
 * @param {string} date 報告日期 YYYY-MM-DD
 * @param {string} asOf 資料收盤日期 YYYY-MM-DD
 * @param {object} counts 檔數統計 { u, d, m }
 * @param {string} status 報告狀態
 * @returns {string} JSON 字串
 */
export const buildMaPayload = (date, asOf, counts, status) =>
  JSON.stringify({
    date: date || '',
    asOf: asOf || '',
    u: counts?.u ?? 0,
    d: counts?.d ?? 0,
    m: counts?.m ?? 0,
    status: status || ''
  })

/**
 * 校驗新增追蹤標的之輸入內容
 * @param {string} raw 使用者輸入字串
 * @param {Array<object>} rows 證交所全部標的清單 [{ code, name }]
 * @param {Array<string>} active 目前追蹤中標的代號陣列
 * @param {number} limit 追蹤上限檔數
 * @param {object} contract 契約物件
 * @returns {{ok: true, code: string, name: string}|{ok: false, error: string}}
 */
export const validateWatchInput = (raw, rows, active = [], limit, contract) => {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (trimmed.length < MIN_INPUT_CHARS || trimmed.length > MAX_INPUT_CHARS) {
    return { ok: false, error: 'format' }
  }

  const found = (rows || []).find((r) => r && (r.code === trimmed || r.name === trimmed))
  if (!found) {
    return { ok: false, error: 'notFound' }
  }

  if (Array.isArray(active) && active.includes(found.code)) {
    return { ok: false, error: 'duplicate', code: found.code, name: found.name }
  }

  const maxLimit = limit ?? contract?.limit ?? 10
  if (Array.isArray(active) && active.length >= maxLimit) {
    return { ok: false, error: 'limit', code: found.code, name: found.name }
  }

  return { ok: true, code: found.code, name: found.name }
}
