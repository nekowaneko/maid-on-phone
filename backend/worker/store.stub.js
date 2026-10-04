// 記憶體儲存層：介面與 worker/store.js 完全相同，驗收與本機預覽全程走這一支。
// 每次 createStore 都回傳一組全新的容器，測試之間不會互相污染，
// 重啟也就跟著歸零，剛好方便重測用量面板。

// 常數定義
const REQUEST_RETENTION_MS = 120000 // 請求時間戳保留兩分鐘，只夠算每分鐘請求數
const EMPTY_DAILY = { requests: 0, promptTokens: 0, outputTokens: 0 }

// 功能函數定義

// 取出某一天的計數列，沒有就先補一列零
const ensureDaily = (daily, dateKey) => {
  if (!daily.has(dateKey)) daily.set(dateKey, { ...EMPTY_DAILY })
  return daily.get(dateKey)
}

export const createStore = (env) => {
  const settings = new Map()
  const daily = new Map()
  let requestTimes = []

  // 兩分鐘以前的時間戳沒有用處，順手丟掉，免得無限長大
  const pruneRequests = async (beforeMs) => {
    requestTimes = requestTimes.filter((ts) => ts > beforeMs)
  }

  return {
    readSetting: async (key) => (settings.has(key) ? settings.get(key) : null),
    writeSetting: async (key, value) => {
      settings.set(key, value)
    },
    deleteSetting: async (key) => {
      settings.delete(key)
    },
    recordRequest: async (dateKey, nowMs) => {
      ensureDaily(daily, dateKey).requests += 1
      requestTimes.push(nowMs)
      await pruneRequests(nowMs - REQUEST_RETENTION_MS)
    },
    addTokens: async (dateKey, promptTokens, outputTokens) => {
      const row = ensureDaily(daily, dateKey)
      row.promptTokens += Number(promptTokens) || 0
      row.outputTokens += Number(outputTokens) || 0
    },
    readDaily: async (dateKey) => ({ ...(daily.get(dateKey) ?? EMPTY_DAILY) }),
    countRequestsSince: async (sinceMs) => requestTimes.filter((ts) => ts > sinceMs).length,
    pruneRequests
  }
}
