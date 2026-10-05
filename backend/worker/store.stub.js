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

// 複製一筆戒飲紀錄（配料清單另外複製，避免共用同一個陣列）
const copyLog = (log) => ({ ...log, toppingIds: Array.isArray(log.toppingIds) ? [...log.toppingIds] : [] })

export const createStore = (env) => {
  const settings = new Map()
  const daily = new Map()
  const drinkLogs = [] // M2 戒飲紀錄，撤銷只標記 undone
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
    pruneRequests,
    // 新增一筆戒飲紀錄（存複本，呼叫端之後改動傳入的物件不影響儲存內容）
    addDrinkLog: async (log) => {
      drinkLogs.push(copyLog({ ...log, undone: false }))
    },
    // 全部未撤銷的紀錄，依記錄時間排序（同一時間依寫入順序）
    listDrinkLogs: async () =>
      drinkLogs
        .filter((log) => !log.undone)
        .sort((a, b) => a.createdAt - b.createdAt)
        .map(copyLog),
    // 找一筆紀錄（含已撤銷）；找不到回 null
    findDrinkLog: async (id) => {
      const found = drinkLogs.find((log) => log.id === id)
      return found ? copyLog(found) : null
    },
    // 標記撤銷：找不到或已撤銷回 false
    markDrinkUndone: async (id) => {
      const found = drinkLogs.find((log) => log.id === id)
      if (!found || found.undone) return false
      found.undone = true
      return true
    }
  }
}
