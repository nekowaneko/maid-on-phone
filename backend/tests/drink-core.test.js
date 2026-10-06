// M2 戒飲記錄純函式（core/drink.js）的輔助測試：補規格表沒有逐一列出的邊界，讓突變測試有足夠的斷言。
// 規格本身在 tests/spec/m2/drink.test.js，這支可以自由增修。只讀設定檔，不連線。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  resolveDraft,
  normalizeDraft,
  pickParseFields,
  parseLlmJson,
  slotOf,
  localHourOf,
  weekStartKey,
  statsOf,
  canResist,
  canUndo,
  checkScriptNumbers,
  numbersInScript,
  stripTags,
  fillLine,
  toBackupLog,
  validateDrinkSettings,
  askHourOf,
  shouldAsk,
  questionPushId,
  drinkLogId,
  buildCatalogText,
  nameIn
} from '../core/drink.js'

// 常數定義
const readConfig = (name) => JSON.parse(readFileSync(new URL(`../config/${name}`, import.meta.url), 'utf8'))
const MODEL = readConfig('drink-model.json')
const TABLE = readConfig('starbucks.json')
const DEFAULTS = readConfig('drink-defaults.json')
const SETTINGS = { resistValue: 60, monthlyFee: 650, drinks: DEFAULTS.drinks }
const GOOD_SETTINGS = { subscriptionName: 'Claude Pro', monthlyFee: 650, resistValue: 60, monthlyQuota: 20, askTime: '15:00' }

// 功能函數定義

// 組一筆紀錄
const log = (date, type, slot = 'afternoon', extra = {}) => ({ date, type, slot, undone: false, ...extra })

test('resolveDraft：珍奶大杯半糖算 450，未說的冰量補正常冰', () => {
  const res = resolveDraft({ baseId: 'milktea', sizeId: 'L', sugarLevelId: 'half', toppingIds: ['boba'] }, MODEL, TABLE)
  assert.equal(res.kind, 'confirm')
  assert.equal(res.kcal, 450)
  assert.equal(res.source, 'model')
  assert.deepEqual(res.assumed, [])
  assert.equal(res.draft.iceId, 'normal')
  assert.equal(res.draft.name, MODEL.bases[1].name) // 沒說品名用基底名稱
})

test('resolveDraft：只缺大小或只缺甜度時 assumed 只列那一項', () => {
  assert.deepEqual(resolveDraft({ baseId: 'tea', sugarLevelId: 'none' }, MODEL, TABLE).assumed, ['size'])
  assert.deepEqual(resolveDraft({ baseId: 'tea', sizeId: 'M' }, MODEL, TABLE).assumed, ['sugar'])
  const both = resolveDraft({ baseId: 'tea' }, MODEL, TABLE)
  assert.deepEqual(both.assumed, ['size', 'sugar'])
  assert.equal(both.draft.sizeId, 'L')
  assert.equal(both.draft.sugarLevelId, 'full')
})

test('resolveDraft：不在清單的冰量換成正常冰，不列入 assumed', () => {
  const res = resolveDraft({ baseId: 'tea', sizeId: 'L', sugarLevelId: 'full', iceId: 'snow' }, MODEL, TABLE)
  assert.equal(res.draft.iceId, 'normal')
  assert.deepEqual(res.assumed, [])
})

test('resolveDraft：大小不在清單時請使用者選大小，候選順序同設定檔，不含熱量', () => {
  const res = resolveDraft({ baseId: 'tea', sizeId: 'XXL', sugarLevelId: 'full' }, MODEL, TABLE)
  assert.equal(res.kind, 'choose')
  assert.equal(res.field, 'size')
  assert.equal(res.draft.sizeId, null)
  assert.deepEqual(res.candidates, MODEL.sizes.map((s) => ({ id: s.id, name: s.name })))
  assert.equal('kcal' in res, false)
})

test('resolveDraft：甜度不在清單時請使用者選甜度', () => {
  const res = resolveDraft({ baseId: 'tea', sizeId: 'L', sugarLevelId: 'extra' }, MODEL, TABLE)
  assert.equal(res.field, 'sugar')
  assert.equal(res.draft.sugarLevelId, null)
  assert.equal(res.candidates.length, 5)
})

test('resolveDraft：配料不在清單時只移除那一個並列出全部配料', () => {
  const res = resolveDraft({ baseId: 'milktea', toppingIds: ['boba', 'cheese', 'boba'] }, MODEL, TABLE)
  assert.equal(res.field, 'topping')
  assert.deepEqual(res.draft.toppingIds, ['boba'])
  assert.equal(res.candidates.length, MODEL.toppings.length)
  assert.equal(res.draft.sizeId, null) // 請使用者選時保留使用者原本沒說的欄位
})

test('resolveDraft：沒有基底時先請使用者選基底', () => {
  const res = resolveDraft({}, MODEL, TABLE)
  assert.equal(res.field, 'base')
  assert.equal(res.candidates.length, 7)
})

test('resolveDraft：同一個配料出現兩次只算一次', () => {
  const once = resolveDraft({ baseId: 'milktea', sizeId: 'L', sugarLevelId: 'half', toppingIds: ['boba'] }, MODEL, TABLE)
  const twice = resolveDraft({ baseId: 'milktea', sizeId: 'L', sugarLevelId: 'half', toppingIds: ['boba', 'boba'] }, MODEL, TABLE)
  assert.equal(twice.kcal, once.kcal)
  assert.deepEqual(twice.draft.toppingIds, ['boba'])
})

test('resolveDraft：星巴克查表清空組合欄位、名稱用表上的品名', () => {
  const res = resolveDraft(
    { name: '那堤', starbucksId: 'sb_black_tea_latte_tall', baseId: 'milktea', sizeId: 'L', sugarLevelId: 'half', toppingIds: ['boba'], iceId: 'less', price: 150 },
    MODEL,
    TABLE
  )
  assert.equal(res.kind, 'confirm')
  assert.equal(res.kcal, 154)
  assert.equal(res.source, 'table')
  assert.deepEqual(res.assumed, [])
  assert.equal(res.draft.name, '伯爵茶那堤（中杯）')
  assert.equal(res.draft.baseId, null)
  assert.equal(res.draft.sizeId, null)
  assert.equal(res.draft.sugarLevelId, null)
  assert.deepEqual(res.draft.toppingIds, [])
  assert.equal(res.draft.iceId, 'less')
  assert.equal(res.draft.price, 150)
})

test('resolveDraft：星巴克表上沒有或值是佔位符時請使用者選，只列有數值的品項', () => {
  const table = { items: [...TABLE.items, { id: 'sb_todo', name: '待補', 'energy-kcal': '<TODO:官方公告值>' }] }
  const todo = resolveDraft({ starbucksId: 'sb_todo' }, MODEL, table)
  assert.equal(todo.kind, 'choose')
  assert.equal(todo.field, 'starbucks')
  assert.equal(todo.draft.starbucksId, null)
  assert.deepEqual(todo.candidates.map((c) => c.id), TABLE.items.map((i) => i.id))
})

test('normalizeDraft：價格只收 0 以上的整數，品名截到 30 字，不改傳入物件', () => {
  const raw = { price: -1, name: '  ', toppingIds: 'boba' }
  const draft = normalizeDraft(raw)
  assert.equal(draft.price, null)
  assert.equal(draft.name, null)
  assert.deepEqual(draft.toppingIds, [])
  assert.equal(normalizeDraft({ price: 0 }).price, 0)
  assert.equal(normalizeDraft({ price: 65.5 }).price, null)
  assert.equal(normalizeDraft({ price: '65' }).price, null)
  assert.equal(Array.from(normalizeDraft({ name: '奶'.repeat(40) }).name).length, 30)
  assert.deepEqual(raw, { price: -1, name: '  ', toppingIds: 'boba' })
  assert.deepEqual(normalizeDraft(null).toppingIds, [])
})

test('pickParseFields：只留九個欄位，kcal 等數字欄位被丟棄', () => {
  const picked = pickParseFields({ isDrink: true, baseId: 'tea', kcal: 999, calories: 999 })
  assert.deepEqual(Object.keys(picked).sort(), ['baseId', 'iceId', 'isDrink', 'name', 'price', 'sizeId', 'starbucksId', 'sugarLevelId', 'toppingIds'])
  assert.equal(picked.isDrink, true)
  assert.equal(picked.name, null)
  assert.equal(JSON.stringify(picked).includes('999'), false)
})

test('parseLlmJson：取第一個 { 到配對的 }，字串內的括號不算', () => {
  assert.deepEqual(parseLlmJson('好的：{"a":{"b":1},"c":"}{"} 結束 {"d":2}'), { a: { b: 1 }, c: '}{' })
  assert.deepEqual(parseLlmJson('```json\n{"x":"\\"}"}\n```'), { x: '"}' })
  assert.equal(parseLlmJson('沒有 JSON'), null)
  assert.equal(parseLlmJson('{"a":1'), null)
  assert.equal(parseLlmJson('{壞掉}'), null)
  assert.equal(parseLlmJson(null), null)
})

test('slotOf 與 localHourOf：時段界線與台北時間的小時', () => {
  const cases = [[0, 'morning'], [10, 'morning'], [11, 'lunch'], [12, 'lunch'], [13, 'afternoon'], [16, 'afternoon'], [17, 'dinner'], [19, 'dinner'], [20, 'latenight'], [23, 'latenight']]
  for (const [hour, slot] of cases) assert.equal(slotOf(hour), slot)
  assert.equal(localHourOf(Date.parse('2026-09-30T15:30:00Z'), 480), 23)
  assert.equal(localHourOf(Date.parse('2026-09-30T15:30:00Z'), 0), 15)
})

test('weekStartKey：週從星期一開始，可以跨月', () => {
  assert.equal(weekStartKey('2026-10-07'), '2026-10-05') // 星期三
  assert.equal(weekStartKey('2026-10-05'), '2026-10-05') // 星期一
  assert.equal(weekStartKey('2026-10-04'), '2026-09-28') // 星期日
  assert.equal(weekStartKey('2026-10-01'), '2026-09-28')
})

test('statsOf：只算未撤銷；本週杯數含跨月的星期一之後', () => {
  const logs = [
    log('2026-09-28', 'drink'),
    log('2026-09-27', 'drink'),
    log('2026-10-01', 'drink'),
    log('2026-10-02', 'drink', 'afternoon', { undone: true }),
    log('2026-10-01', 'resist'),
    log('2026-10-02', 'resist', 'afternoon', { undone: true }),
    log('2026-09-30', 'resist')
  ]
  const stats = statsOf(logs, SETTINGS, '2026-10-01')
  assert.deepEqual(stats, {
    weekCups: 2,
    monthCups: 1,
    monthResists: 1,
    savedCups: 1,
    monthSavedMoney: 60,
    paybackPct: 9,
    monthSavedKcal: 650
  })
})

test('statsOf：回本最多 100%，月費為 0 時回本 0%，沒有常喝品項時少攝取 0', () => {
  const logs = Array.from({ length: 20 }, (_, i) => log(`2026-10-${String(i + 1).padStart(2, '0')}`, 'resist'))
  assert.equal(statsOf(logs, SETTINGS, '2026-10-20').paybackPct, 100)
  assert.equal(statsOf(logs, { ...SETTINGS, monthlyFee: 0 }, '2026-10-20').paybackPct, 0)
  assert.equal(statsOf(logs, { ...SETTINGS, drinks: [] }, '2026-10-20').monthSavedKcal, 0)
  const avg = statsOf([log('2026-10-01', 'resist')], { ...SETTINGS, drinks: [{ kcal: 300 }, { kcal: 401 }] }, '2026-10-01')
  assert.equal(avg.monthSavedKcal, 351) // (300+401)/2 = 350.5 → 351
})

test('statsOf：回本 % 四捨五入（0.5 進位）', () => {
  const logs = [log('2026-10-01', 'resist')]
  assert.equal(statsOf(logs, { resistValue: 1, monthlyFee: 200, drinks: [] }, '2026-10-01').paybackPct, 1) // 0.5% → 1
  assert.equal(statsOf(logs, { resistValue: 1, monthlyFee: 201, drinks: [] }, '2026-10-01').paybackPct, 0)
})

test('canResist：同時段已有沒喝就不能；撤銷過的不算；昨天的不算；當天喝過飲料仍可按沒喝', () => {
  assert.equal(canResist([], '2026-10-07', 'afternoon'), true)
  assert.equal(canResist([log('2026-10-07', 'resist', 'afternoon')], '2026-10-07', 'afternoon'), false)
  assert.equal(canResist([log('2026-10-07', 'resist', 'morning')], '2026-10-07', 'afternoon'), true)
  assert.equal(canResist([log('2026-10-07', 'drink', 'morning')], '2026-10-07', 'afternoon'), true)
  assert.equal(canResist([log('2026-10-07', 'resist', 'afternoon', { undone: true })], '2026-10-07', 'afternoon'), true)
  assert.equal(canResist([log('2026-10-06', 'drink', 'afternoon')], '2026-10-07', 'afternoon'), true)
})

test('canUndo：今天往回 6 天內、未撤銷才可以', () => {
  assert.equal(canUndo(log('2026-10-07', 'drink'), '2026-10-07'), true)
  assert.equal(canUndo(log('2026-10-01', 'drink'), '2026-10-07'), true)
  assert.equal(canUndo(log('2026-09-30', 'drink'), '2026-10-07'), false)
  assert.equal(canUndo(log('2026-10-08', 'drink'), '2026-10-07'), false)
  assert.equal(canUndo(log('2026-10-07', 'drink', 'afternoon', { undone: true }), '2026-10-07'), false)
  assert.equal(canUndo(null, '2026-10-07'), false)
  assert.equal(canUndo(log('壞日期', 'drink'), '2026-10-07'), false)
})

test('checkScriptNumbers：缺數字、多數字都不通過；標籤與千分位不影響；全形數字也算', () => {
  assert.equal(checkScriptNumbers('[smile]約 450 大卡', [450]), true)
  assert.equal(checkScriptNumbers('[smile]約 450 大卡，65 元', [450]), false)
  assert.equal(checkScriptNumbers('[smile]約大卡', [450]), false)
  assert.equal(checkScriptNumbers('[smile]少攝取 1,950 大卡', [1950]), true)
  assert.equal(checkScriptNumbers('約 ４５０ 大卡', [450]), true)
  assert.equal(checkScriptNumbers('約 ５００ 大卡', [450]), false)
  assert.equal(checkScriptNumbers('沒有數字', []), true)
  assert.equal(checkScriptNumbers('有 1 個', []), false)
  assert.equal(checkScriptNumbers('沒有數字', undefined), true)
  assert.equal(checkScriptNumbers('本週 0 杯、省下 0 元', [0, 0, 0]), true)
  assert.deepEqual(numbersInScript('［pout］12 與 3,400'), [12, 3400])
  assert.equal(stripTags('[pout]哼［shy］嗯'), '哼嗯')
})

test('fillLine：佔位符換成值，沒有的換成空字串，0 照樣填入', () => {
  assert.equal(fillLine('{name} 約 {kcal} 大卡{x}', { name: '綠茶', kcal: 0 }), '綠茶 約 0 大卡')
  assert.equal(fillLine('{name}', { name: null }), '')
  assert.equal(fillLine(undefined, {}), '')
})

test('toBackupLog：喝了九個欄位、沒喝三個欄位', () => {
  assert.deepEqual(toBackupLog({ date: '2026-10-07', slot: 'lunch', type: 'resist', name: 'x', kcal: 1 }), {
    date: '2026-10-07',
    slot: 'lunch',
    type: 'resist'
  })
  assert.deepEqual(
    toBackupLog({ id: 'd-1', date: '2026-10-07', slot: 'lunch', type: 'drink', name: '綠茶', price: 30, kcal: 250, source: 'model', ice: 'less', baseId: 'tea' }),
    { date: '2026-10-07', slot: 'lunch', type: 'drink', drinkId: null, name: '綠茶', price: 30, kcal: 250, source: 'model', ice: 'less' }
  )
  assert.equal(toBackupLog({ date: '2026-10-07', slot: 'lunch', type: 'drink', kcal: 1, source: 'table' }).price, null)
})

test('validateDrinkSettings：五個欄位的界線，只報第一個不合的欄位', () => {
  assert.deepEqual(validateDrinkSettings({ ...GOOD_SETTINGS, subscriptionName: '  Pro  ' }).settings.subscriptionName, 'Pro')
  const bad = (patch) => validateDrinkSettings({ ...GOOD_SETTINGS, ...patch })
  assert.equal(bad({ subscriptionName: '   ' }).error, '設定值不正確：訂閱名稱')
  assert.equal(bad({ subscriptionName: 'a'.repeat(31) }).error, '設定值不正確：訂閱名稱')
  assert.equal(bad({ subscriptionName: 'a'.repeat(30) }).ok, true)
  assert.equal(bad({ subscriptionName: 1 }).ok, false)
  assert.equal(bad({ monthlyFee: 0 }).error, '設定值不正確：月費')
  assert.equal(bad({ monthlyFee: 1 }).ok, true)
  assert.equal(bad({ monthlyFee: 100000 }).ok, true)
  assert.equal(bad({ monthlyFee: 100001 }).ok, false)
  assert.equal(bad({ monthlyFee: '650' }).ok, false)
  assert.equal(bad({ monthlyFee: 6.5 }).ok, false)
  assert.equal(bad({ resistValue: -1 }).error, '設定值不正確：忍住一杯的入帳金額')
  assert.equal(bad({ resistValue: 0 }).ok, true)
  assert.equal(bad({ resistValue: 10000 }).ok, true)
  assert.equal(bad({ resistValue: 10001 }).ok, false)
  assert.equal(bad({ monthlyQuota: 301 }).error, '設定值不正確：每月額度')
  assert.equal(bad({ monthlyQuota: 0 }).ok, true)
  assert.equal(bad({ monthlyQuota: 300 }).ok, true)
  assert.equal(bad({ askTime: '15:30' }).error, '設定值不正確：每天詢問時間')
  assert.equal(bad({ askTime: '24:00' }).ok, false)
  assert.equal(bad({ askTime: '00:00' }).ok, true)
  assert.equal(bad({ askTime: '23:00' }).ok, true)
  assert.equal(bad({ askTime: '9:00' }).ok, false)
  assert.equal(bad({ monthlyFee: 0, askTime: 'x' }).error, '設定值不正確：月費')
  assert.equal(validateDrinkSettings(null).error, '設定值不正確：訂閱名稱')
})

test('shouldAsk：整點、今天沒問過、詢問時段沒有紀錄才問', () => {
  const base = { hour: 15, askTime: '15:00', askedOn: null, todayKey: '2026-10-07', logs: [] }
  assert.equal(shouldAsk(base), true)
  assert.equal(shouldAsk({ ...base, hour: 16 }), false)
  assert.equal(shouldAsk({ ...base, askedOn: '2026-10-07' }), false)
  assert.equal(shouldAsk({ ...base, askedOn: '2026-10-06' }), true)
  assert.equal(shouldAsk({ ...base, logs: [log('2026-10-07', 'resist', 'afternoon')] }), false)
  assert.equal(shouldAsk({ ...base, logs: [log('2026-10-07', 'drink', 'afternoon')] }), false)
  assert.equal(shouldAsk({ ...base, logs: [log('2026-10-07', 'resist', 'morning')] }), true)
  assert.equal(shouldAsk({ ...base, logs: [log('2026-10-07', 'resist', 'afternoon', { undone: true })] }), true)
  assert.equal(shouldAsk({ ...base, logs: [log('2026-10-06', 'resist', 'afternoon')] }), true)
  assert.equal(shouldAsk({ ...base, askTime: '15:30' }), false)
  assert.equal(shouldAsk({ ...base, hour: 9, askTime: '09:00', logs: [log('2026-10-07', 'resist', 'morning')] }), false)
})

test('askHourOf、questionPushId、drinkLogId、nameIn、buildCatalogText', () => {
  assert.equal(askHourOf('09:00'), 9)
  assert.equal(askHourOf('9:00'), null)
  assert.equal(askHourOf(null), null)
  assert.equal(questionPushId('2026-10-07'), 'drink-question-2026-10-07')
  assert.equal(drinkLogId(123, 'abcdefgh'), 'd-123-abcdefgh')
  assert.equal(nameIn(MODEL.sugarLevels, 'quarter'), '微糖')
  assert.equal(nameIn(MODEL.sugarLevels, 'x'), '')
  const catalog = buildCatalogText(MODEL, TABLE)
  for (const id of ['milktea', 'XL', 'quarter', 'hot', 'agar', 'sb_frappuccino_chocolate_venti']) assert.ok(catalog.includes(id))
})
