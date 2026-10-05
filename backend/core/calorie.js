// 照抄自 cost_down（戒飲存）commit 9fc08b2 的 netlify_deploy/core/calorie.js，不得修改；要更新時照 backend/SOURCE.md 重抄
// 組合式熱量計算（純函式層）
// 約束 A1／A4：本檔不取用瀏覽器 API，也不自行取得今天的日期

// ===== 常數定義 =====

// 四捨五入級距。法定標示誤差 ±20%，個位數沒有意義（見 drink-model.json 的 _note）
const ROUND_TO = 10

// 總和大於 0 但四捨五入後歸零時的下限（耦合表 K3：無糖純茶仍須 > 0）
const MIN_ROUNDED_KCAL = 10

// 查表值仍是佔位符時的樣式，例如 "<TODO:官方公告值>"
const TODO_PATTERN = /^<TODO:.*>$/

// 熱量欄位名稱沿用 Open Food Facts nutriments 慣例
const KCAL_FIELD = 'energy-kcal'

// 查無容量時採用的係數（大杯 700ml 為基準）
const DEFAULT_SIZE_FACTOR = 1

// 查無糖度時採用的係數。寧可高估不低估，方向與耦合表 K2 一致
const DEFAULT_SUGAR_FACTOR = 1

// ===== 功能函數定義 =====

// 以 id 取清單中的項目，查無回傳 null
const findById = (list, id) => (Array.isArray(list) ? list : []).find((item) => item.id === id) || null

// 取項目的熱量值，查無或非數字時視為 0
const kcalOf = (item) => {
  const value = item ? Number(item[KCAL_FIELD]) : 0
  return Number.isFinite(value) ? value : 0
}

// 取項目的係數，查無或非數字時用 fallback
const factorOf = (item, fallback) => {
  const value = item ? Number(item.factor) : NaN
  return Number.isFinite(value) ? value : fallback
}

// 先加總再一次四捨五入（耦合表 K3），總和為正時不得被抹成 0
const roundKcal = (total) => {
  const rounded = Math.round(total / ROUND_TO) * ROUND_TO
  return total > 0 && rounded <= 0 ? MIN_ROUNDED_KCAL : rounded
}

// 拆解計算過程，供 UI 顯示「糖 240 + 基底 170 + 珍珠 160」
// spec: { baseId, sugarLevelId, sizeId, toppingIds: string[] }
// 回傳 { sugar, base, toppings, total }，各項皆為未四捨五入的原始值
export const explainKcal = (spec, model) => {
  const sizeFactor = factorOf(findById(model.sizes, spec.sizeId), DEFAULT_SIZE_FACTOR)
  const sugarFactor = factorOf(findById(model.sugarLevels, spec.sugarLevelId), DEFAULT_SUGAR_FACTOR)
  const sugar = kcalOf(model.sugarBaseline) * sugarFactor * sizeFactor  // 糖隨糖度與容量縮放
  const base = kcalOf(findById(model.bases, spec.baseId)) * sizeFactor  // 基底隨容量縮放
  const toppings = (spec.toppingIds || [])
    .reduce((sum, id) => sum + kcalOf(findById(model.toppings, id)), 0)  // 配料不隨容量縮放
  return { sugar, base, toppings, total: sugar + base + toppings }
}

// 依組合式模型計算單杯熱量，回傳已四捨五入至 10 的整數
export const calcKcal = (spec, model) => roundKcal(explainKcal(spec, model).total)

// 星巴克查表。查無或值仍為 <TODO:...> 佔位時回傳 null，不得回傳 0
export const lookupTableKcal = (itemId, table) => {
  const item = findById(table?.items, itemId)
  if (!item) return null
  const raw = item[KCAL_FIELD]
  if (typeof raw === 'string' && TODO_PATTERN.test(raw)) return null  // 佔位符未填，回 null 讓呼叫端改用組合式估算
  const value = Number(raw)
  return Number.isFinite(value) && value > 0 ? value : null
}
