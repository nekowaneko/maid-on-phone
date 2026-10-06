// M2 戒飲記錄的純函式：草稿驗證與熱量（resolveDraft）、時段（slotOf）、統計（statsOf）、
// 台詞數字檢查（checkScriptNumbers）、匯出格式（toBackupLog）、設定驗證（validateDrinkSettings）、
// 每日詢問時機（shouldAsk），以及語言模型回覆的 JSON 擷取與預設台詞的佔位符填入。
// 本檔案屬於純函式層：不讀時間、不讀檔、不連線，時間與設定一律由呼叫端傳進來（架構約束 A32）。
// 熱量只由照抄的 calorie.js 算出，語言模型給的任何數字都不會進到這裡的輸出（架構約束 A30）。

import { calcKcal, lookupTableKcal } from './calorie.js'
import { drankCupsInMonth, resistCupsInMonth } from './ledger.js'

// 常數定義
const DRINK_TYPE = 'drink'
const RESIST_TYPE = 'resist'
const SOURCE_MODEL = 'model'
const SOURCE_TABLE = 'table'
const KIND_CONFIRM = 'confirm'
const KIND_CHOOSE = 'choose'
const FIELD_STARBUCKS = 'starbucks'
const FIELD_BASE = 'base'
const FIELD_SIZE = 'size'
const FIELD_SUGAR = 'sugar'
const FIELD_TOPPING = 'topping'
const ASSUMED_SIZE = 'size'
const ASSUMED_SUGAR = 'sugar'
const DEFAULT_SIZE_ID = 'L' // 沒說大小當大杯（§7.1 Q13）
const DEFAULT_SUGAR_ID = 'full' // 沒說甜度當全糖
const DEFAULT_ICE_ID = 'normal' // 沒說冰量當正常冰，不影響熱量
const MAX_NAME_CHARS = 30 // 品名最多留 30 字，避免語言模型塞一長串進台詞
// 時段的小時界線，照抄戒飲存 index.html 的 SLOT_HOUR_BOUNDS（§7.1 Q6）
const SLOT_BOUNDS = [
  { before: 11, slot: 'morning' },
  { before: 13, slot: 'lunch' },
  { before: 17, slot: 'afternoon' },
  { before: 20, slot: 'dinner' }
]
const LAST_SLOT = 'latenight'
const MINUTE_MS = 60000
const DAY_MS = 86400000
const DAYS_PER_WEEK = 7
const MONDAY_SHIFT = 6 // getUTCDay() 星期日為 0；(day + 6) % 7 得到距離星期一幾天
const UNDO_DAYS = 7 // 可以撤銷今天往回 6 天（含今天）共 7 天的紀錄（§7.1 Q8）
const PERCENT_BASE = 100
const MAX_PERCENT = 100
const MONTH_KEY_LENGTH = 7 // 'YYYY-MM'
const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const ASK_TIME_PATTERN = /^([01]\d|2[0-3]):00$/ // 每日詢問只能設整點（§4.1.5）
const HOUR_DIGITS = 2
// 表情標籤：半形與全形括號都算，與串流解析模組的認定一致（標籤只由小寫英文與底線組成）
const TAG_PATTERN = /[[［][a-z_]+[\]］]/g
const NUMBER_PATTERN = /\d[\d,]*/g // 阿拉伯數字串，可含千分位逗號
const COMMA_PATTERN = /,/g
const FULLWIDTH_DIGIT_PATTERN = /[０-９]/g // 全形數字先換成半形再檢查，避免繞過
const FULLWIDTH_ZERO = 0xff10
const ASCII_ZERO = 0x30
const PLACEHOLDER_PATTERN = /\{([A-Za-z]+)\}/g
const EMPTY_TEXT = ''
const OPEN_BRACE = '{'
const CLOSE_BRACE = '}'
const QUOTE = '"'
const BACKSLASH = '\\'
// 語言模型解析結果只取這九個欄位，其餘（例如 kcal、calories）一律丟棄（架構約束 A30）
export const PARSE_FIELDS = ['isDrink', 'name', 'starbucksId', 'baseId', 'sizeId', 'sugarLevelId', 'iceId', 'toppingIds', 'price']
// 設定的五個欄位與中文名稱，順序即驗證與報錯的順序（§4.1.7）
const SETTING_RULES = [
  { key: 'subscriptionName', label: '訂閱名稱' },
  { key: 'monthlyFee', label: '月費', min: 1, max: 100000 },
  { key: 'resistValue', label: '忍住一杯的入帳金額', min: 0, max: 10000 },
  { key: 'monthlyQuota', label: '每月額度', min: 0, max: 300 },
  { key: 'askTime', label: '每天詢問時間' }
]
const NAME_MIN_CHARS = 1
const NAME_MAX_CHARS = 30
const SETTINGS_ERROR_PREFIX = '設定值不正確：'

// 功能函數定義

// 以 Unicode 字元計算長度
const countChars = (text) => Array.from(text).length

// 是不是一般物件（不是陣列、不是 null）
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

// 非空字串原樣回傳，其餘一律當成 null（沒說）
const textOrNull = (value) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : null)

// 0 以上的整數才算價格，其餘當成沒說（§4.1.2 第 4 步）
const priceOrNull = (value) => (Number.isInteger(value) && value >= 0 ? value : null)

// 品名：非空字串才留，最多 30 字
const nameOrNull = (value) => {
  const text = textOrNull(value)
  return text === null ? null : Array.from(text).slice(0, MAX_NAME_CHARS).join(EMPTY_TEXT)
}

// 配料清單：不是陣列當成空陣列；只留字串、去掉重複（§7.2）
const normalizeToppings = (value) =>
  Array.isArray(value) ? [...new Set(value.filter((id) => typeof id === 'string' && id.length > 0))] : []

// 以 id 在清單中找項目
const findIn = (list, id) => (Array.isArray(list) ? list : []).find((item) => item?.id === id) ?? null

// 清單項目轉成候選 { id, name }，順序與清單相同
const toCandidates = (list) => (Array.isArray(list) ? list : []).map((item) => ({ id: item.id, name: item.name }))

// 把任意輸入整理成草稿的固定形狀（不改傳入的物件）
export const normalizeDraft = (raw) => {
  const source = isPlainObject(raw) ? raw : {}
  return {
    name: nameOrNull(source.name),
    starbucksId: textOrNull(source.starbucksId),
    baseId: textOrNull(source.baseId),
    sizeId: textOrNull(source.sizeId),
    sugarLevelId: textOrNull(source.sugarLevelId),
    iceId: textOrNull(source.iceId),
    toppingIds: normalizeToppings(source.toppingIds),
    price: priceOrNull(source.price)
  }
}

// 從語言模型的解析物件只取九個欄位（A30），其餘欄位不會出現在回傳值
export const pickParseFields = (parsed) => {
  const source = isPlainObject(parsed) ? parsed : {}
  return Object.fromEntries(PARSE_FIELDS.map((key) => [key, Object.hasOwn(source, key) ? source[key] : null]))
}

// 從 start（一個 {）往後找與它配對的 }，略過字串裡的括號；找不到回 -1
const matchBrace = (text, start) => {
  let depth = 0
  let inString = false
  for (let i = start; i < text.length; i += 1) {
    const ch = text[i]
    if (inString) {
      if (ch === BACKSLASH) i += 1 // 跳脫字元連同下一個字一起略過
      else if (ch === QUOTE) inString = false
    } else if (ch === QUOTE) inString = true
    else if (ch === OPEN_BRACE) depth += 1
    else if (ch === CLOSE_BRACE) {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

// 取語言模型回覆中第一個 { 到與它配對的 } 解析成物件；失敗或不是物件回 null（§7.2）
export const parseLlmJson = (text) => {
  if (typeof text !== 'string') return null
  const start = text.indexOf(OPEN_BRACE)
  if (start < 0) return null
  const end = matchBrace(text, start)
  if (end < 0) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1))
    return isPlainObject(parsed) ? parsed : null
  } catch (error) {
    return null
  }
}

// 星巴克表上有數值的品項（查得到熱量的才能當候選）
const tableCandidates = (table) =>
  (Array.isArray(table?.items) ? table.items : [])
    .filter((item) => lookupTableKcal(item.id, table) !== null)
    .map((item) => ({ id: item.id, name: item.name }))

// 星巴克查表（§4.1.2 第 0 步）：查得到就用官方值、其餘組合欄位清空；查不到請使用者從表上選
const resolveStarbucks = (draft, model, table) => {
  const kcal = lookupTableKcal(draft.starbucksId, table)
  if (kcal === null) {
    return {
      kind: KIND_CHOOSE,
      draft: { ...draft, starbucksId: null },
      field: FIELD_STARBUCKS,
      candidates: tableCandidates(table)
    }
  }
  const item = findIn(table.items, draft.starbucksId)
  const iceId = findIn(model?.iceLevels, draft.iceId) ? draft.iceId : null // 冰量合法才留，不影響熱量
  return {
    kind: KIND_CONFIRM,
    draft: { ...draft, name: item.name, baseId: null, sizeId: null, sugarLevelId: null, iceId, toppingIds: [] },
    kcal,
    source: SOURCE_TABLE,
    assumed: []
  }
}

// 第一個不在清單上的欄位（依 base、size、sugar、topping 的順序）；全部合法回 null
const firstInvalidField = (draft, model) => {
  if (!findIn(model?.bases, draft.baseId)) return { field: FIELD_BASE, key: 'baseId', list: model?.bases }
  if (!findIn(model?.sizes, draft.sizeId)) return { field: FIELD_SIZE, key: 'sizeId', list: model?.sizes }
  if (!findIn(model?.sugarLevels, draft.sugarLevelId)) {
    return { field: FIELD_SUGAR, key: 'sugarLevelId', list: model?.sugarLevels }
  }
  const badTopping = draft.toppingIds.find((id) => !findIn(model?.toppings, id))
  if (badTopping !== undefined) return { field: FIELD_TOPPING, key: 'toppingIds', list: model?.toppings, badTopping }
  return null
}

// 請使用者選的草稿：把不在清單的那個值換成 null（配料則移除那一個），其餘維持使用者原本說的
const chooseDraft = (draft, invalid) =>
  invalid.field === FIELD_TOPPING
    ? { ...draft, toppingIds: draft.toppingIds.filter((id) => id !== invalid.badTopping) }
    : { ...draft, [invalid.key]: null }

// 草稿 → 複述（confirm）或請使用者選（choose）（§4.1.2 resolveDraft，純函式）
export const resolveDraft = (rawDraft, model, table) => {
  const draft = normalizeDraft(rawDraft)
  if (draft.starbucksId !== null) return resolveStarbucks(draft, model, table)
  const assumed = []
  if (draft.sizeId === null) assumed.push(ASSUMED_SIZE)
  if (draft.sugarLevelId === null) assumed.push(ASSUMED_SUGAR)
  const filled = {
    ...draft,
    sizeId: draft.sizeId ?? DEFAULT_SIZE_ID,
    sugarLevelId: draft.sugarLevelId ?? DEFAULT_SUGAR_ID,
    iceId: findIn(model?.iceLevels, draft.iceId) ? draft.iceId : DEFAULT_ICE_ID
  }
  const invalid = firstInvalidField(filled, model)
  if (invalid) {
    return { kind: KIND_CHOOSE, draft: chooseDraft(draft, invalid), field: invalid.field, candidates: toCandidates(invalid.list) }
  }
  const kcal = calcKcal(
    { baseId: filled.baseId, sizeId: filled.sizeId, sugarLevelId: filled.sugarLevelId, toppingIds: filled.toppingIds },
    model
  )
  const name = filled.name ?? findIn(model.bases, filled.baseId).name // 沒說品名用基底名稱
  return { kind: KIND_CONFIRM, draft: { ...filled, name }, kcal, source: SOURCE_MODEL, assumed }
}

// 台北時間（或指定時差）的小時
export const localHourOf = (nowMs, utcOffsetMinutes) =>
  new Date(nowMs + (Number(utcOffsetMinutes) || 0) * MINUTE_MS).getUTCHours()

// 小時 → 時段：<11 上午、<13 午餐、<17 下午、<20 晚餐、其餘宵夜
export const slotOf = (hour) => SLOT_BOUNDS.find((bound) => hour < bound.before)?.slot ?? LAST_SLOT

// 'YYYY-MM-DD' → 該日 UTC 零點的毫秒；格式不對回 NaN
const dateKeyMs = (dateKey) => {
  const matched = DATE_KEY_PATTERN.exec(String(dateKey))
  if (!matched) return NaN
  return Date.UTC(Number(matched[1]), Number(matched[2]) - 1, Number(matched[3]))
}

// 毫秒（UTC 零點）→ 'YYYY-MM-DD'
const msToDateKey = (ms) => new Date(ms).toISOString().slice(0, 10)

// 本週一的日期（週從星期一開始）
export const weekStartKey = (todayKey) => {
  const ms = dateKeyMs(todayKey)
  const shift = (new Date(ms).getUTCDay() + MONDAY_SHIFT) % DAYS_PER_WEEK
  return msToDateKey(ms - shift * DAY_MS)
}

// 兩個日期相差幾天（later − earlier）
const daysBetween = (earlierKey, laterKey) => Math.round((dateKeyMs(laterKey) - dateKeyMs(earlierKey)) / DAY_MS)

// 未撤銷的紀錄
const activeLogs = (logs) => (Array.isArray(logs) ? logs : []).filter((log) => !log?.undone)

// 常喝品項的平均熱量（照抄戒飲存 avgKcal）；沒有品項時為 0
const averageKcal = (drinks) => {
  const list = (Array.isArray(drinks) ? drinks : []).map((d) => Number(d?.kcal)).filter((n) => Number.isFinite(n))
  return list.length === 0 ? 0 : list.reduce((sum, n) => sum + n, 0) / list.length
}

// 統計（§4.1.3）：只算未撤銷的紀錄；「沒喝」全部入帳，monthlyQuota 不參與任何計算
export const statsOf = (logs, settings, todayKey) => {
  const active = activeLogs(logs)
  const monthKey = String(todayKey).slice(0, MONTH_KEY_LENGTH)
  const mondayKey = weekStartKey(todayKey)
  const weekCups = active.filter((log) => log.type === DRINK_TYPE && log.date >= mondayKey && log.date <= todayKey).length
  const monthResists = resistCupsInMonth(active, monthKey)
  const savedCups = monthResists
  const monthSavedMoney = Math.round(savedCups * (Number(settings?.resistValue) || 0))
  const fee = Number(settings?.monthlyFee) || 0
  const paybackPct = fee > 0 ? Math.min(MAX_PERCENT, Math.round((monthSavedMoney / fee) * PERCENT_BASE)) : 0
  return {
    weekCups,
    monthCups: drankCupsInMonth(active, monthKey),
    monthResists,
    savedCups,
    monthSavedMoney,
    paybackPct,
    monthSavedKcal: Math.round(savedCups * averageKcal(settings?.drinks))
  }
}

// 現在這個時段能不能按「沒喝」：同時段已有沒喝 → 不能（§4.1.3）
export const canResist = (logs, todayKey, slot) =>
  !activeLogs(logs).some(
    (log) => log.date === todayKey && log.type === RESIST_TYPE && log.slot === slot
  )

// 這筆能不能撤銷：存在、未撤銷、日期在今天往回 6 天內（含今天）
export const canUndo = (log, todayKey) => {
  if (!isPlainObject(log) || log.undone) return false
  const days = daysBetween(log.date, todayKey)
  return Number.isInteger(days) && days >= 0 && days < UNDO_DAYS
}

// 全形數字換成半形
const toAsciiDigits = (text) =>
  text.replace(FULLWIDTH_DIGIT_PATTERN, (ch) => String.fromCharCode(ch.charCodeAt(0) - FULLWIDTH_ZERO + ASCII_ZERO))

// 剝掉表情標籤
export const stripTags = (script) => String(script ?? EMPTY_TEXT).replace(TAG_PATTERN, EMPTY_TEXT)

// 台詞中出現的所有數字（去掉千分位逗號後轉整數）
export const numbersInScript = (script) =>
  (toAsciiDigits(stripTags(script)).match(NUMBER_PATTERN) ?? []).map((n) => Number(n.replace(COMMA_PATTERN, EMPTY_TEXT)))

// 台詞數字檢查（§4.1.4）：required 每個都至少出現一次，且出現的每個數字都在 required 之中
export const checkScriptNumbers = (script, required) => {
  const allowed = Array.isArray(required) ? required : []
  const found = numbersInScript(script)
  return allowed.every((n) => found.includes(n)) && found.every((n) => allowed.includes(n))
}

// 預設台詞的佔位符以規則算出的值填入；沒有的值換成空字串
export const fillLine = (template, values) =>
  String(template ?? EMPTY_TEXT).replace(PLACEHOLDER_PATTERN, (whole, key) =>
    Object.hasOwn(values ?? {}, key) && values[key] !== null && values[key] !== undefined ? String(values[key]) : EMPTY_TEXT
  )

// 儲存的紀錄 → 戒飲存備份格式的一筆（§4.1.6）
export const toBackupLog = (log) =>
  log.type === RESIST_TYPE
    ? { date: log.date, slot: log.slot, type: RESIST_TYPE }
    : {
        date: log.date,
        slot: log.slot,
        type: DRINK_TYPE,
        drinkId: null,
        name: log.name ?? null,
        price: Number.isInteger(log.price) ? log.price : null,
        kcal: log.kcal,
        source: log.source,
        ice: log.ice ?? null
      }

// 範圍內的整數
const isIntegerIn = (value, min, max) => Number.isInteger(value) && value >= min && value <= max

// 單一欄位合不合法
const isSettingValid = (rule, value) => {
  if (rule.key === 'subscriptionName') {
    if (typeof value !== 'string') return false
    const chars = countChars(value.trim())
    return chars >= NAME_MIN_CHARS && chars <= NAME_MAX_CHARS
  }
  if (rule.key === 'askTime') return typeof value === 'string' && ASK_TIME_PATTERN.test(value)
  return isIntegerIn(value, rule.min, rule.max)
}

// 設定驗證（§4.1.7）：五個欄位都合法才回 ok；否則只報第一個不合的欄位
export const validateDrinkSettings = (payload) => {
  const source = isPlainObject(payload) ? payload : {}
  const bad = SETTING_RULES.find((rule) => !isSettingValid(rule, source[rule.key]))
  if (bad) return { ok: false, error: `${SETTINGS_ERROR_PREFIX}${bad.label}` }
  return {
    ok: true,
    settings: {
      subscriptionName: source.subscriptionName.trim(),
      monthlyFee: source.monthlyFee,
      resistValue: source.resistValue,
      monthlyQuota: source.monthlyQuota,
      askTime: source.askTime
    }
  }
}

// 詢問時間的小時（'15:00' → 15）；格式不對回 null
export const askHourOf = (askTime) =>
  typeof askTime === 'string' && ASK_TIME_PATTERN.test(askTime) ? Number(askTime.slice(0, HOUR_DIGITS)) : null

// 每日詢問要不要送（§4.1.5，不含推播是否已設定）：
// 現在是詢問的整點、今天還沒問過、詢問時間所在的時段今天沒有任何未撤銷的紀錄
export const shouldAsk = ({ hour, askTime, askedOn, todayKey, logs }) => {
  const askHour = askHourOf(askTime)
  if (askHour === null || hour !== askHour) return false
  if (askedOn === todayKey) return false
  const slot = slotOf(askHour)
  return !activeLogs(logs).some((log) => log.date === todayKey && log.slot === slot)
}

// 每日詢問推播的編號（§7.2）
export const questionPushId = (todayKey) => `drink-question-${todayKey}`

// 紀錄編號：d-<毫秒時間>-<亂數 8 碼>（§7.2）
export const drinkLogId = (nowMs, randomText) => `d-${nowMs}-${randomText}`

// 給解析用語言模型看的編號清單（drink-model.json 與 starbucks.json 的全部編號與名稱）
export const buildCatalogText = (model, table) => {
  const section = (title, list) =>
    `${title}：\n${(Array.isArray(list) ? list : []).map((item) => `- ${item.id}：${item.name}`).join('\n')}`
  return [
    section('baseId（基底）', model?.bases),
    section('sizeId（大小）', model?.sizes),
    section('sugarLevelId（甜度）', model?.sugarLevels),
    section('iceId（冰量）', model?.iceLevels),
    section('toppingIds（配料，可多選）', model?.toppings),
    section('starbucksId（星巴克品項）', table?.items)
  ].join('\n\n')
}

// 名稱查詢：給預設台詞與台詞事實用（找不到回空字串）
export const nameIn = (list, id) => findIn(list, id)?.name ?? EMPTY_TEXT
