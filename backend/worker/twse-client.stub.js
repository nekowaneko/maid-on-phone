// 測試專用證交所用戶端 Stub 模組
// 模擬證交所 API 回應，不發送真實網路請求，精確記錄呼叫歷史。

/**
 * 建立證交所測試專用 Stub
 * @param {object} options 初始化選項
 * @param {object} options.all 全市場預設資料 { asOf, rows }
 * @param {object} options.months 月份資料對照表 { [code]: { [yyyymm]: [{ date, close }] } }
 * @param {object} options.closed 休市日對照表 { [year]: ['YYYY-MM-DD', ...] }
 * @param {boolean} options.fail 是否模擬整體伺服器錯誤
 * @param {Array<string>} options.failCodes 指定模擬失敗之股票代號清單
 * @returns {object}
 */
export const createTwseStub = ({ all = null, months = {}, closed = {}, fail = false, failCodes = [] } = {}) => {
  const calls = []

  return {
    calls,

    /**
     * 取得全市場標的清單
     * @returns {Promise<{asOf: string, rows: Array<object>}>}
     */
    async listAll() {
      calls.push({ method: 'listAll' })
      if (fail) {
        throw new Error('TWSE_500')
      }
      return all
        ? { asOf: all.asOf || '', rows: (all.rows || []).map((r) => ({ ...r })) }
        : { asOf: '', rows: [] }
    },

    /**
     * 取得指定月份收盤價清單
     * @param {string} code 股票代號
     * @param {string} yyyymm 年月
     * @returns {Promise<Array<object>>}
     */
    async getMonth(code, yyyymm) {
      calls.push({ method: 'getMonth', code, yyyymm })
      if (fail || (Array.isArray(failCodes) && failCodes.includes(code))) {
        throw new Error('TWSE_500')
      }
      const data = months?.[code]?.[yyyymm]
      return data ? data.map((r) => ({ ...r })) : []
    },

    /**
     * 取得指定年份休市日清單
     * @param {number|string} year 年份
     * @returns {Promise<Array<string>>}
     */
    async listClosedDates(year) {
      calls.push({ method: 'listClosedDates', year })
      if (fail) {
        throw new Error('TWSE_500')
      }
      const list = closed?.[String(year)]
      return list ? [...list] : []
    }
  }
}
