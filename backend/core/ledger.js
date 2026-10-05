// 照抄自 cost_down（戒飲存）commit 9fc08b2 的 netlify_deploy/core/ledger.js，不得修改；要更新時照 backend/SOURCE.md 重抄
// 雙帳統計（純函式層）
// 省錢與熱量是兩本獨立的帳，分別回答不同問題（見 docs/DESIGN-v2.md 第三節）
// 約束 A1／A4：本檔不取用瀏覽器 API，也不自行取得今天的日期

// ===== 常數定義 =====

const DRINK_TYPE = 'drink'
const RESIST_TYPE = 'resist'

// 別人請客的判定值：實付金額恰好為 0（不是免費飲料，是有人替你付了）
const TREATED_PRICE = 0

// ===== 功能函數定義 =====

// 月份鍵，例如 '2026-08'
const monthKeyOf = (dateStr) => String(dateStr || '').slice(0, 7)

// 取數值欄位，非有限數字時視為 0
const numberOf = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

// 是不是一筆「喝了」的紀錄
// v1 舊紀錄沒有 type 欄位，只要有 drinkId 就視為喝了（與既有 index.html 的判定一致，避免退化）
const isDrink = (log) => log.type === DRINK_TYPE || (log.type === undefined && log.drinkId !== undefined)

// 取某月的全部飲用紀錄
const drinkLogsInMonth = (logs, monthKey) =>
  (Array.isArray(logs) ? logs : []).filter((log) => isDrink(log) && monthKeyOf(log.date) === monthKey)

// 省錢帳：只算 price > 0 的紀錄（別人請客不算你省下或花掉的錢）
export const moneySpentInMonth = (logs, monthKey) =>
  drinkLogsInMonth(logs, monthKey)
    .map((log) => numberOf(log.price))
    .filter((price) => price > 0)
    .reduce((sum, price) => sum + price, 0)

// 熱量帳：算全部 type === 'drink' 的紀錄，含 price === 0（別人請客）
export const kcalInMonth = (logs, monthKey) =>
  drinkLogsInMonth(logs, monthKey).reduce((sum, log) => sum + numberOf(log.kcal), 0)

// 別人請客的杯數與熱量，供 UI 單獨呈現「自欺缺口」
export const treatedInMonth = (logs, monthKey) => {
  const treated = drinkLogsInMonth(logs, monthKey).filter((log) => numberOf(log.price) === TREATED_PRICE)
  return {
    cups: treated.length,
    kcal: treated.reduce((sum, log) => sum + numberOf(log.kcal), 0)
  }
}

// 防灌水額度：飲用杯數含請客（耦合表 K1）
// monthlyQuota 是行為基準（以前每月喝幾杯），不是金錢基準——喝了就是喝了，不管誰付錢
export const drankCupsInMonth = (logs, monthKey) => drinkLogsInMonth(logs, monthKey).length

// 某月忍住次數，供防灌水公式使用
export const resistCupsInMonth = (logs, monthKey) =>
  (Array.isArray(logs) ? logs : [])
    .filter((log) => log.type === RESIST_TYPE && monthKeyOf(log.date) === monthKey).length
