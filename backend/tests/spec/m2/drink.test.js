// M2 規格範例表（docs/M2-EXPENSIVE-PLAN.md §4.5）中 Worker 的各列，凍結後不得修改。
// 相依全部走 Stub：儲存層用 store.stub.js、推播用 fcm-client.stub.js、語言模型由這支測試給定固定回覆，全程不得對外連線。
// 語言模型的呼叫靠提示詞全文分辨是「解析」還是「產生台詞」（計畫書 §4.1.8）。
// 台詞沒有另外準備時語言模型一律失敗，Worker 改用 drink-lines.json 的預設台詞，數字由規則填入。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandler, runScheduled } from '../../../worker/handlers.js'
import { createStore } from '../../../worker/store.stub.js'
import { createFcmStub } from '../../../worker/fcm-client.stub.js'

// 常數定義
const SECRET = 'test-only-secret'
const SECRET_HEADER = 'x-app-secret'
const ORIGIN = 'http://localhost'
const PARSE_PROMPT = '【測試用解析提示詞 PARSE_MARK】'
const SCRIPT_PROMPT = '【測試用台詞提示詞 SCRIPT_MARK】'
const DEVICE_TOKEN = 'test-only-device-token'
const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'test-only-project',
  client_email: 'test-only@test-only-project.iam.gserviceaccount.example',
  private_key: 'test-only-private-key'
})
const BASE_IDS = ['tea', 'milktea', 'freshmilktea', 'latte', 'fruittea', 'wintermelon', 'yakult']
const STARBUCKS_IDS = [
  'sb_black_tea_latte_tall',
  'sb_black_tea_latte_grande',
  'sb_frappuccino_chocolate_grande',
  'sb_frappuccino_chocolate_venti'
]
const readConfig = (name) => readFileSync(new URL(`../../../config/${name}`, import.meta.url), 'utf8')
const DRINK_LINES = JSON.parse(readConfig('drink-lines.json'))
const DRINK_DEFAULTS = JSON.parse(readConfig('drink-defaults.json'))

// 全程不該碰到網路
globalThis.fetch = () => {
  throw new Error('測試期間不得對外發出任何請求')
}

// 功能函數定義

// 台北時間轉成毫秒，例如 tpe('2026-10-07T15:10')
const tpe = (local) => Date.parse(`${local}:00+08:00`)

// 珍奶大杯半糖去冰（語言模型的解析結果）
const bobaParse = (extra = {}) =>
  JSON.stringify({
    isDrink: true,
    name: '珍珠奶茶',
    starbucksId: null,
    baseId: 'milktea',
    sizeId: 'L',
    sugarLevelId: 'half',
    iceId: 'none',
    toppingIds: ['boba'],
    price: null,
    ...extra
  })

// 珍奶大杯半糖去冰的草稿（直接送 preview、confirm 用）
const bobaDraft = (extra = {}) => ({
  name: '珍珠奶茶',
  starbucksId: null,
  baseId: 'milktea',
  sizeId: 'L',
  sugarLevelId: 'half',
  iceId: 'none',
  toppingIds: ['boba'],
  price: null,
  ...extra
})

// 語言模型的 Stub：依提示詞分辨解析與台詞，各自依序取準備好的回覆；沒有準備就丟例外（語言模型失敗）
const createLlm = ({ parse = [], script = [] } = {}) => {
  const queues = { parse: [...parse], script: [...script] }
  const calls = { parse: 0, script: 0 }
  const streamer = (messages) => ({
    [Symbol.asyncIterator]: async function* () {
      const joined = messages.map((m) => String(m.content)).join('\n')
      const isParse = joined.includes(PARSE_PROMPT) && !joined.includes(SCRIPT_PROMPT)
      const isScript = joined.includes(SCRIPT_PROMPT) && !joined.includes(PARSE_PROMPT)
      if (!isParse && !isScript) throw new Error('stub：分辨不出呼叫種類')
      const kind = isParse ? 'parse' : 'script'
      calls[kind] += 1
      const reply = queues[kind].shift()
      if (reply === undefined) throw new Error('stub：沒有準備回覆')
      yield { type: 'text', text: reply }
    }
  })
  return { streamer, calls }
}

// 組出一份完整的相依與可調整的時鐘
const setup = (llmReplies = {}) => {
  const llm = createLlm(llmReplies)
  const fcm = createFcmStub()
  const clock = { now: tpe('2026-10-07T15:10') }
  let serial = 0
  const deps = {
    emotionConfig: JSON.parse(readConfig('emotion-map.json')),
    gapConfig: JSON.parse(readConfig('time-gap-tiers.json')),
    fallbackConfig: JSON.parse(readConfig('fallback-lines.json')),
    quotaConfig: JSON.parse(readConfig('quota.json')),
    personaSchema: JSON.parse(readConfig('persona-schema.json')),
    messageSchema: JSON.parse(readConfig('message.json')),
    personaText: readConfig('persona.md'),
    templateText: readConfig('prompt-template.md'),
    drinkModel: JSON.parse(readConfig('drink-model.json')),
    starbucksTable: JSON.parse(readConfig('starbucks.json')),
    drinkDefaults: DRINK_DEFAULTS,
    drinkLines: DRINK_LINES,
    drinkPrompts: { parse: PARSE_PROMPT, script: SCRIPT_PROMPT },
    secret: SECRET,
    store: createStore({}),
    streamer: llm.streamer,
    now: () => clock.now,
    pusher: (message) => fcm.sendFcm(message, SERVICE_ACCOUNT),
    pushConfig: { serviceAccount: SERVICE_ACCOUNT, deviceToken: DEVICE_TOKEN },
    randomText: () => `r${(serial += 1)}`
  }
  const handle = createHandler(deps)
  // 送一次 API 請求，回傳狀態碼與 JSON
  const call = async (method, path, body) => {
    const init = { method, headers: { [SECRET_HEADER]: SECRET } }
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    const response = await handle(new Request(`${ORIGIN}${path}`, init))
    return { status: response.status, json: await response.json() }
  }
  // 在指定的台北時間做一件事
  const at = async (local, method, path, body) => {
    clock.now = tpe(local)
    return call(method, path, body)
  }
  return { deps, llm, fcm, clock, call, at }
}

// 台詞中出現的所有阿拉伯數字（去掉千分位逗號）
const numbersIn = (text) => (String(text).match(/\d[\d,]*/g) ?? []).map((n) => Number(n.replace(/,/g, '')))

// 四個回報數字
const fourStats = (stats) => ({
  weekCups: stats.weekCups,
  monthSavedMoney: stats.monthSavedMoney,
  paybackPct: stats.paybackPct,
  monthSavedKcal: stats.monthSavedKcal
})

test('M2-S01 說剛喝大杯珍奶半糖去冰時複述 450 大卡且不採用語言模型自己給的熱量', async () => {
  const env = setup({ parse: [bobaParse({ kcal: 999, calories: 999 })] })
  const res = await env.call('POST', '/api/drink/parse', { text: '剛喝大杯珍奶半糖去冰' })
  assert.equal(res.status, 200)
  assert.equal(res.json.kind, 'confirm')
  assert.equal(res.json.kcal, 450)
  assert.equal(res.json.source, 'model')
  assert.equal(res.json.draft.baseId, 'milktea')
  assert.equal(res.json.draft.sizeId, 'L')
  assert.equal(res.json.draft.sugarLevelId, 'half')
  assert.equal(res.json.draft.iceId, 'none')
  assert.deepEqual(res.json.draft.toppingIds, ['boba'])
  assert.ok(numbersIn(res.json.script).includes(450))
  assert.ok(!numbersIn(res.json.script).includes(999))
  assert.ok(!JSON.stringify(res.json).includes('999'))
  assert.equal(env.llm.calls.parse, 1)
  const stats = await env.call('GET', '/api/drink/stats')
  assert.equal(stats.json.monthCups, 0)
})

test('M2-S02 改成微糖後重新複述 400 大卡且不重新解析也不寫入', async () => {
  const env = setup()
  const res = await env.call('POST', '/api/drink/preview', { draft: bobaDraft({ sugarLevelId: 'quarter' }) })
  assert.equal(res.status, 200)
  assert.equal(res.json.kind, 'confirm')
  assert.equal(res.json.kcal, 400)
  assert.equal(res.json.draft.sugarLevelId, 'quarter')
  assert.ok(numbersIn(res.json.script).includes(400))
  assert.equal(env.llm.calls.parse, 0)
  const stats = await env.call('GET', '/api/drink/stats')
  assert.equal(stats.json.monthCups, 0)
})

test('M2-S03 確認後新增一筆喝了的紀錄並回報與資料庫一致的四個數字', async () => {
  const env = setup()
  const res = await env.at('2026-10-07T15:10', 'POST', '/api/drink/confirm', { draft: bobaDraft() })
  assert.equal(res.status, 200)
  assert.equal(res.json.kind, 'saved')
  assert.equal(typeof res.json.logId, 'string')
  assert.deepEqual(fourStats(res.json.stats), { weekCups: 1, monthSavedMoney: 0, paybackPct: 0, monthSavedKcal: 0 })
  const stats = await env.call('GET', '/api/drink/stats')
  assert.deepEqual(fourStats(stats.json), fourStats(res.json.stats))
  for (const n of [1, 0]) assert.ok(numbersIn(res.json.script).includes(n))
  const exported = await env.call('GET', '/api/drink/export')
  assert.deepEqual(exported.json.logs, [
    {
      date: '2026-10-07',
      slot: 'afternoon',
      type: 'drink',
      drinkId: null,
      name: '珍珠奶茶',
      price: null,
      kcal: 450,
      source: 'model',
      ice: 'none'
    }
  ])
})

test('M2-S04 基底不在清單上時不出現熱量並列出 7 種基底，選拿鐵後才算熱量', async () => {
  const env = setup({ parse: [bobaParse({ name: '咖啡', baseId: 'coffee', toppingIds: [] })] })
  const res = await env.call('POST', '/api/drink/parse', { text: '喝了一杯咖啡' })
  assert.equal(res.status, 200)
  assert.equal(res.json.kind, 'choose')
  assert.equal(res.json.field, 'base')
  assert.deepEqual(
    res.json.candidates.map((c) => c.id),
    BASE_IDS
  )
  assert.ok(res.json.candidates.every((c) => typeof c.name === 'string' && c.name.length > 0))
  assert.equal('kcal' in res.json, false)
  assert.deepEqual(numbersIn(res.json.script), [])
  const picked = await env.call('POST', '/api/drink/preview', { draft: { ...res.json.draft, baseId: 'latte' } })
  assert.equal(picked.json.kind, 'confirm')
  assert.equal(typeof picked.json.kcal, 'number')
  assert.ok(picked.json.kcal > 0)
})

test('M2-S05 台詞的熱量和規則不同時重試一次，仍不同就改用預設台詞', async () => {
  const wrong = '[smile]珍珠奶茶大杯半糖去冰，大約 500 大卡喔。'
  const env = setup({ parse: [bobaParse()], script: [wrong, wrong] })
  const res = await env.call('POST', '/api/drink/parse', { text: '剛喝大杯珍奶半糖去冰' })
  assert.equal(res.json.kind, 'confirm')
  assert.equal(env.llm.calls.script, 2)
  assert.ok(numbersIn(res.json.script).includes(450))
  assert.ok(!numbersIn(res.json.script).includes(500))
  assert.ok(!numbersIn(res.json.text).includes(500))
})

test('M2-S06 沒說大小和甜度時以大杯全糖計算並說明', async () => {
  const env = setup({
    parse: [bobaParse({ name: '綠茶', baseId: 'tea', sizeId: null, sugarLevelId: null, iceId: null, toppingIds: [] })]
  })
  const res = await env.call('POST', '/api/drink/parse', { text: '喝了一杯綠茶' })
  assert.equal(res.json.kind, 'confirm')
  assert.equal(res.json.kcal, 250)
  assert.equal(res.json.draft.sizeId, 'L')
  assert.equal(res.json.draft.sugarLevelId, 'full')
  assert.deepEqual([...res.json.assumed].sort(), ['size', 'sugar'])
  assert.ok(numbersIn(res.json.script).includes(250))
  assert.ok(res.json.script.includes(DRINK_LINES.labels.assumedSize))
  assert.ok(res.json.script.includes(DRINK_LINES.labels.assumedSugar))
})

test('M2-S07 本月第三次沒喝時回報省下 180 元、回本 28%、少攝取 1950 大卡', async () => {
  const env = setup()
  await env.at('2026-10-01T15:00', 'POST', '/api/drink/resist', {})
  await env.at('2026-10-03T15:00', 'POST', '/api/drink/resist', {})
  const res = await env.at('2026-10-07T15:10', 'POST', '/api/drink/resist', {})
  assert.equal(res.status, 200)
  assert.equal(res.json.kind, 'saved')
  assert.deepEqual(fourStats(res.json.stats), { weekCups: 0, monthSavedMoney: 180, paybackPct: 28, monthSavedKcal: 1950 })
  for (const n of [180, 28, 1950]) assert.ok(numbersIn(res.json.script).includes(n))
  const exported = await env.call('GET', '/api/drink/export')
  assert.deepEqual(exported.json.logs.at(-1), { date: '2026-10-07', slot: 'afternoon', type: 'resist' })
})

test('M2-S08 同一時段再按沒喝不新增；當天喝過飲料在不同時段仍可按沒喝', async () => {
  const sameSlot = setup()
  await sameSlot.at('2026-10-07T15:00', 'POST', '/api/drink/resist', {})
  const again = await sameSlot.at('2026-10-07T15:30', 'POST', '/api/drink/resist', {})
  assert.equal(again.json.kind, 'already')
  assert.equal((await sameSlot.call('GET', '/api/drink/stats')).json.monthResists, 1)

  const drank = setup()
  await drank.at('2026-10-07T09:00', 'POST', '/api/drink/confirm', { draft: bobaDraft() })
  const afterDrink = await drank.at('2026-10-07T15:10', 'POST', '/api/drink/resist', {})
  assert.equal(afterDrink.json.kind, 'saved')
  assert.equal((await drank.call('GET', '/api/drink/stats')).json.monthResists, 1)

  const otherSlot = setup()
  await otherSlot.at('2026-10-07T09:00', 'POST', '/api/drink/resist', {})
  const afternoon = await otherSlot.at('2026-10-07T15:10', 'POST', '/api/drink/resist', {})
  assert.equal(afternoon.json.kind, 'saved')
  assert.equal((await otherSlot.call('GET', '/api/drink/stats')).json.monthResists, 2)
})

test('M2-S09 撤銷後那筆不再計入；同一筆再撤銷一次不能撤銷且數字不變', async () => {
  const env = setup()
  await env.at('2026-10-01T15:00', 'POST', '/api/drink/resist', {})
  await env.at('2026-10-03T15:00', 'POST', '/api/drink/resist', {})
  const saved = await env.at('2026-10-07T15:10', 'POST', '/api/drink/resist', {})
  const undone = await env.at('2026-10-07T15:10', 'POST', '/api/drink/undo', { logId: saved.json.logId })
  assert.equal(undone.json.kind, 'undone')
  assert.equal(undone.json.stats.monthSavedMoney, 120)
  const twice = await env.at('2026-10-07T15:11', 'POST', '/api/drink/undo', { logId: saved.json.logId })
  assert.equal(twice.json.kind, 'already')
  assert.equal((await env.call('GET', '/api/drink/stats')).json.monthSavedMoney, 120)
})

test('M2-S10 本月喝了 19 杯、沒喝 3 次時沒喝全部入帳：省下 180 元、回本 28%', async () => {
  const env = setup()
  for (let i = 0; i < 19; i += 1) {
    const day = String(1 + (i % 5)).padStart(2, '0')
    const hour = String(9 + Math.floor(i / 5)).padStart(2, '0')
    const res = await env.at(`2026-10-${day}T${hour}:00`, 'POST', '/api/drink/confirm', { draft: bobaDraft() })
    assert.equal(res.json.kind, 'saved')
  }
  for (const time of ['09:00', '12:00', '15:00']) {
    const res = await env.at(`2026-10-06T${time}`, 'POST', '/api/drink/resist', {})
    assert.equal(res.json.kind, 'saved')
  }
  const stats = await env.at('2026-10-07T15:10', 'GET', '/api/drink/stats')
  assert.equal(stats.json.monthCups, 19)
  assert.equal(stats.json.savedCups, 3)
  assert.equal(stats.json.monthSavedMoney, 180)
  assert.equal(stats.json.paybackPct, 28)
})

test('M2-S11 每天詢問只在設定的整點送一次，詢問時段已記過就不送', async () => {
  const env = setup()
  await runScheduled(env.deps, tpe('2026-10-07T14:00'))
  assert.equal(env.fcm.sent.length, 0)
  await runScheduled(env.deps, tpe('2026-10-07T15:00'))
  assert.equal(env.fcm.sent.length, 1)
  const data = env.fcm.sent[0].message.data
  assert.equal(data.actions, 'resist,speak')
  assert.equal(typeof data.script, 'string')
  assert.ok(/^\[[^\]]+\]/.test(data.script))
  assert.ok(!data.text.includes('['))
  assert.ok(data.text.length > 0)
  await runScheduled(env.deps, tpe('2026-10-07T16:00'))
  assert.equal(env.fcm.sent.length, 1)

  await env.at('2026-10-08T09:00', 'POST', '/api/drink/resist', {})
  await runScheduled(env.deps, tpe('2026-10-08T15:00'))
  assert.equal(env.fcm.sent.length, 2)

  await env.at('2026-10-09T14:30', 'POST', '/api/drink/resist', {})
  await runScheduled(env.deps, tpe('2026-10-09T15:00'))
  assert.equal(env.fcm.sent.length, 2)
})

test('M2-S12 月費設成 0 時不寫入任何設定；改成 300 後回本以 300 計算', async () => {
  const env = setup()
  const before = await env.call('GET', '/api/drink/settings')
  assert.deepEqual(before.json, {
    subscriptionName: 'Claude Pro',
    monthlyFee: 650,
    resistValue: 60,
    monthlyQuota: 20,
    askTime: '15:00'
  })
  const bad = await env.call('PUT', '/api/drink/settings', { ...before.json, subscriptionName: '別的訂閱', monthlyFee: 0 })
  assert.equal(bad.status, 400)
  assert.equal(bad.json.error, '設定值不正確：月費')
  assert.deepEqual((await env.call('GET', '/api/drink/settings')).json, before.json)
  const good = await env.call('PUT', '/api/drink/settings', { ...before.json, monthlyFee: 300 })
  assert.equal(good.status, 200)
  assert.equal(good.json.monthlyFee, 300)
  const res = await env.at('2026-10-07T15:10', 'POST', '/api/drink/resist', {})
  assert.equal(res.json.stats.monthSavedMoney, 60)
  assert.equal(res.json.stats.paybackPct, 20)
})

test('M2-S14 匯出成戒飲存的備份格式，撤銷的紀錄不在內', async () => {
  const env = setup()
  await env.at('2026-10-06T10:00', 'POST', '/api/drink/resist', {})
  await env.at('2026-10-07T15:10', 'POST', '/api/drink/confirm', { draft: bobaDraft() })
  const extra = await env.at('2026-10-07T15:20', 'POST', '/api/drink/confirm', { draft: bobaDraft() })
  await env.at('2026-10-07T15:21', 'POST', '/api/drink/undo', { logId: extra.json.logId })
  const exported = await env.call('GET', '/api/drink/export')
  assert.equal(exported.status, 200)
  assert.deepEqual(exported.json.subscription, { name: 'Claude Pro', monthlyFee: 650 })
  assert.equal(exported.json.monthlyQuota, 20)
  assert.equal(exported.json.resistValue, 60)
  assert.deepEqual(exported.json.drinks, DRINK_DEFAULTS.drinks)
  assert.deepEqual(exported.json.logs, [
    { date: '2026-10-06', slot: 'morning', type: 'resist' },
    {
      date: '2026-10-07',
      slot: 'afternoon',
      type: 'drink',
      drinkId: null,
      name: '珍珠奶茶',
      price: null,
      kcal: 450,
      source: 'model',
      ice: 'none'
    }
  ])
})

test('M2-S15 時段依台北時間的小時界線，9/30 23:30 算在 9 月', async () => {
  const env = setup()
  const times = ['10:59', '11:00', '16:59', '17:00', '20:00', '00:30']
  for (const time of times) {
    await env.at(`2026-10-07T${time}`, 'POST', '/api/drink/confirm', { draft: bobaDraft() })
  }
  await env.at('2026-09-30T23:30', 'POST', '/api/drink/confirm', { draft: bobaDraft() })
  const exported = await env.call('GET', '/api/drink/export')
  assert.deepEqual(
    exported.json.logs.map((log) => `${log.date} ${log.slot}`),
    [
      '2026-09-30 latenight',
      '2026-10-07 morning',
      '2026-10-07 morning',
      '2026-10-07 lunch',
      '2026-10-07 afternoon',
      '2026-10-07 dinner',
      '2026-10-07 latenight'
    ]
  ) // 匯出依記錄時間排序：9/30 23:30、10/7 00:30、10:59、11:00、16:59、17:00、20:00
  const stats = await env.at('2026-10-07T23:00', 'GET', '/api/drink/stats')
  assert.equal(stats.json.monthCups, 6)
  assert.equal(stats.json.weekCups, 6)
})

test('M2-S16 星巴克品項用官方公告值且沒有改甜度；表上沒有的品項不出現熱量並列出表上品項', async () => {
  const env = setup({
    parse: [
      bobaParse({ name: '伯爵茶那堤', starbucksId: 'sb_black_tea_latte_grande', baseId: null, sizeId: null, sugarLevelId: null, iceId: null, toppingIds: [] }),
      bobaParse({ name: '焦糖瑪奇朵', starbucksId: 'sb_caramel_macchiato', baseId: null, sizeId: null, sugarLevelId: null, iceId: null, toppingIds: [] })
    ]
  })
  const found = await env.call('POST', '/api/drink/parse', { text: '喝了一杯大杯伯爵茶那堤' })
  assert.equal(found.json.kind, 'confirm')
  assert.equal(found.json.kcal, 204)
  assert.equal(found.json.source, 'table')
  assert.ok(numbersIn(found.json.script).includes(204))
  const saved = await env.at('2026-10-07T15:10', 'POST', '/api/drink/confirm', { draft: found.json.draft })
  assert.equal(saved.json.kind, 'saved')
  const exported = await env.call('GET', '/api/drink/export')
  assert.equal(exported.json.logs[0].kcal, 204)
  assert.equal(exported.json.logs[0].source, 'table')

  const missing = await env.call('POST', '/api/drink/parse', { text: '喝了一杯焦糖瑪奇朵' })
  assert.equal(missing.json.kind, 'choose')
  assert.equal(missing.json.field, 'starbucks')
  assert.deepEqual(
    missing.json.candidates.map((c) => c.id),
    STARBUCKS_IDS
  )
  assert.equal('kcal' in missing.json, false)
  assert.deepEqual(numbersIn(missing.json.script), [])
})
