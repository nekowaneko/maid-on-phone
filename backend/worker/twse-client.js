// 證交所 API 客戶端模組
// 全專案唯一連線至 twse.com.tw 的模組（架構約束 A40、V31）。
// 提供取得全市場標的清單、單檔月份收盤價與休市日曆。

// 常數定義
const ROC_YEAR_OFFSET = 1911

// 功能函數定義

/**
 * 民國或非標準日期字串轉換為西元 YYYY-MM-DD
 * @param {string|number} rawDate 原始日期字串或數字
 * @returns {string} 西元日期 YYYY-MM-DD，無法解析時回傳空字串
 */
const rocToGregorian = (rawDate) => {
  if (rawDate === null || rawDate === undefined) return ''
  const s = String(rawDate).trim()

  // 形式 1: 115/09/01 或 115-09-01
  const slashMatch = s.match(/^(\d{2,3})[/-](\d{1,2})[/-](\d{1,2})$/)
  if (slashMatch) {
    const year = Number(slashMatch[1]) + ROC_YEAR_OFFSET
    const month = String(Number(slashMatch[2])).padStart(2, '0')
    const day = String(Number(slashMatch[3])).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  // 形式 2: 1151008 (7 碼民國數字)
  if (/^\d{7}$/.test(s)) {
    const year = Number(s.slice(0, 3)) + ROC_YEAR_OFFSET
    const month = s.slice(3, 5)
    const day = s.slice(5, 7)
    return `${year}-${month}-${day}`
  }

  // 形式 3: 20261008 (8 碼西元數字)
  if (/^\d{8}$/.test(s)) {
    const year = s.slice(0, 4)
    const month = s.slice(4, 6)
    const day = s.slice(6, 8)
    return `${year}-${month}-${day}`
  }

  // 形式 4: 2026-10-08 (標準西元 ISO 日期)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s
  }

  return ''
}

/**
 * 解析收盤價為數值，無效數值回傳 null
 * @param {string|number} val 收盤價原始資料
 * @returns {number|null}
 */
const parseClosePrice = (val) => {
  if (typeof val === 'number') {
    return Number.isNaN(val) ? null : val
  }
  if (typeof val !== 'string') {
    return null
  }
  const cleaned = val.replace(/,/g, '').trim()
  if (cleaned === '' || cleaned === '--') {
    return null
  }
  const num = Number(cleaned)
  return Number.isNaN(num) ? null : num
}

/**
 * 建立證交所 API 用戶端實例
 * @param {Function} fetchImpl fetch 實作函式
 * @param {object} defaults 預設設定（包含 twseAllUrl、twseDayUrl、twseHolidayUrl 等）
 * @returns {object}
 */
export const createTwseClient = (fetchImpl = fetch, defaults = {}) => {
  const allUrl = defaults.twseAllUrl
  const dayUrl = defaults.twseDayUrl
  const holidayUrl = defaults.twseHolidayUrl
  const keepWords = defaults.holidayKeepWords || ['開始交易', '最後交易']

  return {
    /**
     * 取得全市場標的清單與最新收盤資訊
     * @returns {Promise<{asOf: string, rows: Array<{code: string, name: string, close: number}>}>}
     */
    async listAll() {
      let res
      try {
        res = await fetchImpl(allUrl, { method: 'GET' })
      } catch {
        throw new Error('TWSE_NETWORK')
      }

      if (!res.ok) {
        throw new Error(`TWSE_${res.status}`)
      }

      let data
      try {
        data = await res.json()
      } catch {
        throw new Error('TWSE_FORMAT')
      }

      let rawRows = null
      let asOf = ''

      if (Array.isArray(data)) {
        rawRows = data
      } else if (data && typeof data === 'object' && Array.isArray(data.rows)) {
        rawRows = data.rows
        if (data.asOf) asOf = rocToGregorian(data.asOf) || String(data.asOf)
      } else {
        throw new Error('TWSE_FORMAT')
      }

      const rows = []
      for (const item of rawRows) {
        if (!item || typeof item !== 'object') continue
        const code = String(item.Code || item.code || '').trim()
        const name = String(item.Name || item.name || '').trim()
        const close = parseClosePrice(item.ClosingPrice || item.closingPrice || item.Close || item.close)
        if (code && name && close !== null) {
          rows.push({ code, name, close })
          if (!asOf && (item.Date || item.date)) {
            asOf = rocToGregorian(item.Date || item.date)
          }
        }
      }

      return { asOf, rows }
    },

    /**
     * 取得指定標的在指定月份之每日收盤價清單（由舊到新）
     * @param {string} code 股票代號
     * @param {string} yyyymm 西元年月（例如 202610）
     * @returns {Promise<Array<{date: string, close: number}>>}
     */
    async getMonth(code, yyyymm) {
      const url = `${dayUrl}?date=${yyyymm}01&stockNo=${code}&response=json`
      let res
      try {
        res = await fetchImpl(url, { method: 'GET' })
      } catch {
        throw new Error('TWSE_NETWORK')
      }

      if (!res.ok) {
        throw new Error(`TWSE_${res.status}`)
      }

      let data
      try {
        data = await res.json()
      } catch {
        throw new Error('TWSE_FORMAT')
      }

      if (!data || typeof data !== 'object') {
        throw new Error('TWSE_FORMAT')
      }

      if (data.stat !== 'OK') {
        return []
      }

      if (!Array.isArray(data.data)) {
        return []
      }

      let closeColIndex = 6
      if (Array.isArray(data.fields)) {
        const found = data.fields.findIndex((f) => typeof f === 'string' && f.includes('收盤價'))
        if (found !== -1) closeColIndex = found
      }

      const rows = []
      for (const row of data.data) {
        let dateRaw = ''
        let closeRaw = null

        if (Array.isArray(row)) {
          dateRaw = row[0]
          closeRaw = row[closeColIndex]
        } else if (row && typeof row === 'object') {
          dateRaw = row.date || row.Date
          closeRaw = row.close || row.Close || row.ClosingPrice
        }

        const date = rocToGregorian(dateRaw)
        const close = parseClosePrice(closeRaw)
        if (date && close !== null) {
          rows.push({ date, close })
        }
      }

      rows.sort((a, b) => a.date.localeCompare(b.date))
      return rows
    },

    /**
     * 取得指定西元年份之證交所休市日清單
     * @param {number|string} year 西元年份
     * @returns {Promise<Array<string>>} 西元日期字串陣列
     */
    async listClosedDates(year) {
      let res
      try {
        res = await fetchImpl(holidayUrl, { method: 'GET' })
      } catch {
        throw new Error('TWSE_NETWORK')
      }

      if (!res.ok) {
        throw new Error(`TWSE_${res.status}`)
      }

      let data
      try {
        data = await res.json()
      } catch {
        throw new Error('TWSE_FORMAT')
      }

      if (!Array.isArray(data)) {
        throw new Error('TWSE_FORMAT')
      }

      const targetYearStr = String(year)
      const closedDates = []

      for (const item of data) {
        if (!item || typeof item !== 'object') continue
        const date = rocToGregorian(item.Date || item.date)
        if (!date || !date.startsWith(`${targetYearStr}-`)) {
          continue
        }

        const name = String(item.Name || item.name || '')
        const desc = String(item.Description || item.description || '')
        const shouldKeep = keepWords.some((w) => name.includes(w) || desc.includes(w))
        if (!shouldKeep) {
          closedDates.push(date)
        }
      }

      return Array.from(new Set(closedDates)).sort()
    }
  }
}
