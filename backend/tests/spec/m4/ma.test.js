// M4 規格範例表（docs/M4-EXPENSIVE-PLAN.md §4.5）中 Worker 的各列，凍結後不得修改。
// 相依全部走 Stub：儲存層用 store.stub.js、推播用 fcm-client.stub.js、證交所用 twse-client.stub.js、Todoist 用 todoist-client.stub.js，
// 語言模型由這支測試給定固定回覆（靠提示詞全文分辨開場台詞，計畫書 §4.4），全程不得對外連線。
// S01～S06、S16 直接呼叫 core/ma.js 的純函式；S07～S14 透過 runScheduled、createHandler 驗證。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandler, runScheduled } from '../../../worker/handlers.js'
import { createStore } from '../../../worker/store.stub.js'
import { createFcmStub } from '../../../worker/fcm-client.stub.js'
import { createTwseStub } from '../../../worker/twse-client.stub.js'
import { createTodoistStub } from '../../../worker/todoist-client.stub.js'
import { computeStock, classify, descFor, countKinds } from '../../../core/ma.js'

// 常數定義
const SECRET = 'test-only-secret'
const SECRET_HEADER = 'x-app-secret'
const ORIGIN = 'http://localhost'
const OPEN_PROMPT = '【測試用開場台詞提示詞 OPEN_MARK】'
const TODOIST_SPLIT_PROMPT = '【測試用拆步驟提示詞 SPLIT_MARK】'
const TODOIST_SCRIPT_PROMPT = '【測試用提醒台詞提示詞 REMIND_MARK】'
const DRINK_PARSE_PROMPT = '【測試用解析提示詞 PARSE_MARK】'
const DRINK_SCRIPT_PROMPT = '【測試用台詞提示詞 SCRIPT_MARK】'
const DEVICE_TOKEN = 'test-only-device-token'
const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'test-only-project',
  client_email: 'test-only@test-only-project.iam.gserviceaccount.example',
  private_key: 'test-only-private-key'
})
const DAY_MS = 24 * 60 * 60 * 1000
const TODAY = '2026-10-14' // 星期三
const ASOF = '2026-10-13' // 前一交易日（星期二）
const readConfig = (name) => readFileSync(new URL(`../../../config/${name}`, import.meta.url), 'utf8')
const MA_CONTRACT = JSON.parse(readConfig('ma-contract.json'))
const MA_DEFAULTS = JSON.parse(readConfig('ma-defaults.json'))
const MA_LINES = JSON.parse(readConfig('ma-lines.json'))
const TODOIST_DEFAULTS = JSON.parse(readConfig('todoist-defaults.json'))
const TODOIST_LINES = JSON.parse(readConfig('todoist-lines.json'))

// 全程不該碰到網路
globalThis.fetch = () => {
  throw new Error('測試期間不得對外發出任何請求')
}

// 追蹤清單與證交所清單（代號、名稱）
const WATCH = [
  ['2330', '台積電'],
  ['2317', '鴻海'],
  ['0050', '元大台灣50'],
  ['2454', '聯發科'],
  ['2603', '長榮']
]
const UNIVERSE = [
  ...WATCH,
  ['2412', '中華電'],
  ['2881', '富邦金'],
  ['3008', '大立光'],
  ['00878', '國泰永續高股息'],
  ['2308', '台達電'],
  ['2882', '國泰金']
].map(([code, name]) => ({ code, name, close: 100 }))

// 功能函數定義

// 台北時間轉成毫秒，例如 tpe('2026-10-14T08:30')
const tpe = (local) => Date.parse(`${local}:00+08:00`)

// 重複的收盤價：repeat([[100, 40], [130, 15]]) → 40 個 100 接 15 個 130
const repeat = (parts) => parts.flatMap(([value, count]) => Array(count).fill(value))

// 五檔的 60 日收盤價，由舊到新：2330 多頭、2317 空頭、0050 轉強、2454 轉弱、2603 初步轉強
const PATTERNS = {
  2330: Array.from({ length: 60 }, (_, i) => i + 1),
  2317: Array.from({ length: 60 }, (_, i) => 60 - i),
  '0050': repeat([[100, 40], [70, 15], [130, 5]]),
  2454: repeat([[100, 40], [130, 15], [110, 5]]),
  2603: repeat([[120, 40], [80, 15], [100, 5]])
}
const KINDS = { 2330: 'U', 2317: 'D', '0050': 'S', 2454: 'W', 2603: 'B' }

// 到 endKey（含）為止的 n 個平日日期，由舊到新
const weekdaysEnding = (endKey, n) => {
  const out = []
  let d = new Date(`${endKey}T00:00:00Z`)
  while (out.length < n) {
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) out.unshift(d.toISOString().slice(0, 10))
    d = new Date(d.getTime() - DAY_MS)
  }
  return out
}

// 收盤價序列配上日期，最後一筆是 endKey
const rowsOf = (closes, endKey) => {
  const dates = weekdaysEnding(endKey, closes.length)
  return closes.map((close, i) => ({ date: dates[i], close }))
}

// 去掉表情標籤
const stripTags = (script) => script.replace(/\[[^\]]*\]/g, '')

// 語言模型的 Stub：依提示詞分辨開場台詞，依序取準備好的回覆；沒有準備就丟例外；其他提示詞一律失敗並計數
const createLlm = (replies = []) => {
  const queue = [...replies]
  const calls = { open: 0, other: 0 }
  const streamer = (messages) => ({
    [Symbol.asyncIterator]: async function* () {
      const joined = messages.map((m) => String(m.content)).join('\n')
      if (!joined.includes(OPEN_PROMPT)) {
        calls.other += 1
        throw new Error('stub：不是盤前均線的呼叫')
      }
      calls.open += 1
      const reply = queue.shift()
      if (reply === undefined) throw new Error('stub：沒有準備回覆')
      yield { type: 'text', text: reply }
    }
  })
  return { streamer, calls }
}

// 組出一份完整的相依並播種資料
// watch：追蹤清單；staleCodes：收盤價只到前前一天（資料過期）的代號；twse：證交所 Stub 的參數；llm：開場台詞的回覆；todoistTasks：給了就有 Todoist
const setup = async ({ watch = WATCH, staleCodes = [], twse: twseOptions = {}, llm: llmReplies = [], todoistTasks = null } = {}) => {
  const llm = createLlm(llmReplies)
  const fcm = createFcmStub()
  const twse = createTwseStub({ all: { asOf: ASOF, rows: UNIVERSE }, months: {}, closed: { 2026: [] }, ...twseOptions })
  const todoist = todoistTasks === null ? null : createTodoistStub({ tasks: todoistTasks })
  const store = createStore({})
  for (const [code, name] of watch) {
    await store.addWatch({ code, name, addedOn: '2026-09-01' })
    const end = staleCodes.includes(code) ? '2026-10-12' : ASOF
    await store.upsertCloses(code, rowsOf(PATTERNS[code] ?? PATTERNS[2330], end))
  }
  const clock = { now: tpe(`${TODAY}T08:30`) }
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
    drinkDefaults: JSON.parse(readConfig('drink-defaults.json')),
    drinkLines: JSON.parse(readConfig('drink-lines.json')),
    drinkPrompts: { parse: DRINK_PARSE_PROMPT, script: DRINK_SCRIPT_PROMPT },
    todoist,
    todoistDefaults: TODOIST_DEFAULTS,
    todoistLines: TODOIST_LINES,
    todoistPrompts: { split: TODOIST_SPLIT_PROMPT, script: TODOIST_SCRIPT_PROMPT },
    twse,
    maDefaults: MA_DEFAULTS,
    maLines: MA_LINES,
    maContract: MA_CONTRACT,
    maPrompt: OPEN_PROMPT,
    sleep: async () => {},
    secret: SECRET,
    store,
    streamer: llm.streamer,
    now: () => clock.now,
    pusher: (message) => fcm.sendFcm(message, SERVICE_ACCOUNT),
    pushConfig: { serviceAccount: SERVICE_ACCOUNT, deviceToken: DEVICE_TOKEN },
    randomText: () => `r${(serial += 1)}`
  }
  const handle = createHandler(deps)
  // 送一次 API 請求（可指定台北時間），回傳狀態碼與 JSON
  const call = async (method, path, body, local) => {
    if (local) clock.now = tpe(local)
    const init = { method, headers: { [SECRET_HEADER]: SECRET } }
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    const response = await handle(new Request(`${ORIGIN}${path}`, init))
    return { status: response.status, json: await response.json() }
  }
  // 在指定的台北時間跑一次排程
  const run = async (local) => {
    clock.now = tpe(local)
    await runScheduled(deps, tpe(local))
  }
  return { deps, store, llm, fcm, twse, todoist, clock, call, run }
}

// 第 i 則推播的 data
const pushData = (env, i) => env.fcm.sent[i].message.data

// stub 記錄的證交所呼叫（只取某個方法）
const twseCalls = (env, method) => env.twse.calls.filter((c) => c.method === method)

// 追蹤清單的代號（依順序）
const watchCodes = async (env) => (await env.call('GET', '/api/ma/watchlist')).json.items.map((i) => i.code)

test('M4-S01 收盤價 1 到 60：5 日 58、20 日 50.5、60 日 30.5，多頭排列', () => {
  const closes = Array.from({ length: 60 }, (_, i) => i + 1)
  assert.deepEqual(computeStock(closes, MA_CONTRACT), { kind: 'U', ma: [58, 50.5, 30.5] })
  assert.equal(descFor('U', MA_LINES), '5 > 20 > 60，三條線依序往上排。')
})

test('M4-S02 收盤價 60 到 1：5 日 3、20 日 10.5、60 日 30.5，空頭排列', () => {
  const closes = Array.from({ length: 60 }, (_, i) => 60 - i)
  assert.deepEqual(computeStock(closes, MA_CONTRACT), { kind: 'D', ma: [3, 10.5, 30.5] })
  assert.equal(descFor('D', MA_LINES), '60 > 20 > 5，三條線依序往下排。')
})

test('M4-S03 前 40 天 100、中間 15 天 130、最後 5 天 110：轉弱', () => {
  const closes = repeat([[100, 40], [130, 15], [110, 5]])
  assert.deepEqual(computeStock(closes, MA_CONTRACT), { kind: 'W', ma: [110, 125, 108.33] })
  assert.equal(descFor('W', MA_LINES), '5 日線跌破 20 日線，短線轉弱。')
})

test('M4-S04 排列 20 > 60 > 5：明顯轉弱', () => {
  const closes = repeat([[100, 40], [140, 15], [60, 5]])
  assert.deepEqual(computeStock(closes, MA_CONTRACT), { kind: 'V', ma: [60, 120, 106.67] })
  assert.equal(descFor('V', MA_LINES), '5 日線跌破 20 日線與 60 日線，短線明顯轉弱。')
})

test('M4-S05 任兩條均線相等：不算多頭或空頭，糾結', () => {
  const closes = repeat([[90, 40], [100, 20]])
  assert.deepEqual(computeStock(closes, MA_CONTRACT), { kind: 'T', ma: [100, 100, 93.33] })
  assert.equal(descFor('T', MA_LINES), '均線糾結，方向未明。')
  assert.equal(classify(100, 100, 93.33, MA_CONTRACT), 'T')
  assert.equal(classify(100, 100.004, 93, MA_CONTRACT), 'T') // 四捨五入到小數 2 位後相等
})

test('M4-S06 上市只有 40 個交易日：資料不足，不排列，不計入多頭與空頭', () => {
  const closes = Array.from({ length: 40 }, (_, i) => i + 1)
  assert.deepEqual(computeStock(closes, MA_CONTRACT), { kind: 'N', ma: null })
  assert.equal(descFor('N', MA_LINES), '上市未滿 60 個交易日，資料不足。')
  assert.deepEqual(countKinds([{ kind: 'N' }]), { u: 0, d: 0, m: 1 })
  assert.deepEqual(countKinds([{ kind: 'U' }, { kind: 'D' }, { kind: 'N' }, { code: 'X', pending: true }, { code: 'Y', failed: true }]), { u: 1, d: 1, m: 1 })
})

test('M4-S07 週六、週日、證交所休市日的 08:30：不送推播、不取收盤價、不寫歷史', async () => {
  const env = await setup({ twse: { closed: { 2026: ['2026-10-26'] } } })
  await env.run('2026-10-17T08:30') // 星期六
  await env.run('2026-10-18T08:30') // 星期日
  await env.run('2026-10-26T08:30') // 星期一，休市
  assert.equal(env.fcm.sent.length, 0)
  assert.equal(twseCalls(env, 'getMonth').length, 0)
  assert.equal(twseCalls(env, 'listAll').length, 0)
  assert.deepEqual(await env.store.listResultDates(7), [])
})

test('M4-S08 證交所連不上或資料過期：送「資料沒拿到」，P3 照常；只有 1 檔失敗：其餘照報', async () => {
  // 全部失敗：收盤價只到前前一天，補抓也失敗
  const all = WATCH.map(([code]) => code)
  const p3 = [{ id: 'X01', content: '確認畢業時辰', priority: 2, updated_at: '2026-09-01T00:00:00.000Z', added_at: '2026-08-01T00:00:00.000Z', due: { date: TODAY, string: TODAY, lang: 'zh', is_recurring: false, timezone: null }, parent_id: null }]
  const total = await setup({ staleCodes: all, twse: { failCodes: all }, todoistTasks: p3 })
  await total.run(`${TODAY}T08:30`)
  assert.equal(total.fcm.sent.length, 2)
  const ma = total.fcm.sent.map((m) => m.message.data).find((d) => d.ma !== undefined)
  const todo = total.fcm.sent.map((m) => m.message.data).find((d) => d.todoist !== undefined)
  assert.ok(ma, '有失敗推播')
  assert.ok(todo, 'P3 掃描照常')
  assert.equal(JSON.parse(ma.ma).status, 'failed')
  assert.equal(ma.text, MA_LINES.failed)
  assert.ok(ma.script === undefined || ma.script === '')
  assert.deepEqual(await total.store.listResultDates(7), [])
  assert.equal((await total.call('GET', '/api/ma/report')).json.status, 'failed')

  // 資料過期但證交所正常回應（最新一筆還是前前一天）：同樣算失敗
  const stale = await setup({ staleCodes: all })
  await stale.run(`${TODAY}T08:30`)
  assert.equal(JSON.parse(pushData(stale, 0).ma).status, 'failed')

  // 只有 2317 失敗：其餘照報
  const partial = await setup({ staleCodes: ['2317'], twse: { failCodes: ['2317'] } })
  await partial.run(`${TODAY}T08:30`)
  assert.equal(partial.fcm.sent.length, 1)
  assert.equal(JSON.parse(pushData(partial, 0).ma).status, 'ok')
  const report = (await partial.call('GET', '/api/ma/report')).json
  assert.equal(report.status, 'ok')
  const failedItem = report.items.find((i) => i.code === '2317')
  assert.equal(failedItem.failed, true)
  assert.equal(failedItem.desc, '這檔資料沒拿到。')
  assert.deepEqual(report.counts, { u: 1, d: 0, m: 3 })
})

test('M4-S09 同一天 08:30 被觸發兩次：只送一則、歷史只寫一筆', async () => {
  const env = await setup()
  await env.run(`${TODAY}T08:30`)
  await env.run(`${TODAY}T08:30`)
  assert.equal(env.fcm.sent.length, 1)
  assert.equal((await env.store.listResults([ASOF])).length, 5)
  assert.deepEqual(await env.store.listResultDates(7), [ASOF])
})

test('M4-S10 追蹤清單是空的：08:30 不送推播', async () => {
  const env = await setup({ watch: [] })
  await env.run(`${TODAY}T08:30`)
  assert.equal(env.fcm.sent.length, 0)
  assert.equal(twseCalls(env, 'getMonth').length, 0)
  assert.equal((await env.call('GET', '/api/ma/report')).json.status, 'empty')
})

test('M4-S11 加入 2412 成功並補近 4 個月；重複、查不到、滿 10 檔各回 400 且清單不變', async () => {
  const env = await setup()
  const added = await env.call('POST', '/api/ma/watchlist', { action: 'add', code: '2412' }, `${TODAY}T07:00`)
  assert.equal(added.status, 200)
  assert.deepEqual(added.json, { ok: true, item: { code: '2412', name: '中華電', pending: true } })
  assert.deepEqual(await watchCodes(env), ['2330', '2317', '0050', '2454', '2603', '2412'])
  const backfill = twseCalls(env, 'getMonth').filter((c) => c.code === '2412').map((c) => c.yyyymm).sort()
  assert.deepEqual(backfill, ['202607', '202608', '202609', '202610'])

  const dup = await env.call('POST', '/api/ma/watchlist', { action: 'add', code: '2330' })
  assert.equal(dup.status, 400)
  assert.equal(dup.json.error, 'duplicate')
  assert.equal(dup.json.message, '2330 台積電 已經在追蹤清單裡了。')
  const missing = await env.call('POST', '/api/ma/watchlist', { action: 'add', code: '9999' })
  assert.equal(missing.status, 400)
  assert.equal(missing.json.error, 'notFound')
  assert.equal(missing.json.message, '查不到「9999」，請輸入證交所的股票代號或完整名稱。')
  assert.equal((await watchCodes(env)).length, 6)

  // 已有 10 檔再加第 11 檔
  const full = await setup({ watch: [...WATCH, ['2412', '中華電'], ['2881', '富邦金'], ['3008', '大立光'], ['00878', '國泰永續高股息'], ['2308', '台達電']] })
  assert.equal((await watchCodes(full)).length, 10)
  const over = await full.call('POST', '/api/ma/watchlist', { action: 'add', code: '2882' })
  assert.equal(over.status, 400)
  assert.equal(over.json.error, 'limit')
  assert.equal(over.json.message, '最多追蹤 10 檔，請先停止追蹤一檔。')
  assert.equal((await watchCodes(full)).length, 10)
})

test('M4-S12 停止追蹤 2603：不再出現在報告與排程，歷史保留；復原後回到原位置', async () => {
  const env = await setup()
  await env.store.upsertResults('2026-10-12', WATCH.map(([code]) => ({ code, kind: KINDS[code], ma: [1, 2, 3] })))
  const untracked = await env.call('POST', '/api/ma/watchlist', { action: 'untrack', code: '2603' })
  assert.equal(untracked.status, 200)
  assert.deepEqual(untracked.json, { ok: true })
  assert.deepEqual(await watchCodes(env), ['2330', '2317', '0050', '2454'])

  await env.run(`${TODAY}T08:30`)
  assert.equal((await env.store.listResults([ASOF])).length, 4)
  const report = (await env.call('GET', '/api/ma/report')).json
  assert.deepEqual(report.items.map((i) => i.code), ['2330', '2317', '0050', '2454'])
  const history = (await env.call('GET', '/api/ma/history')).json
  assert.deepEqual(history.rows.map((r) => r.code), ['2330', '2317', '0050', '2454'])

  // 復原：回到原位置，之前的歷史還在
  const restored = await env.call('POST', '/api/ma/watchlist', { action: 'restore', code: '2603' })
  assert.equal(restored.status, 200)
  assert.deepEqual(await watchCodes(env), ['2330', '2317', '0050', '2454', '2603'])
  const again = (await env.call('GET', '/api/ma/history')).json
  const row = again.rows.find((r) => r.code === '2603')
  assert.equal(row.cells[0].kind, 'B')
})

test('M4-S13 歷史：近 7 個交易日、轉換標記、剛加入的標的沒有資料', async () => {
  const env = await setup({ watch: [...WATCH, ['2412', '中華電']] })
  const days = ['2026-09-30', '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']
  for (const [index, day] of days.entries()) {
    await env.store.upsertResults(day, WATCH.map(([code]) => ({ code, kind: code === '2454' ? (index >= 6 ? 'W' : 'U') : KINDS[code], ma: [1, 2, 3] })))
  }
  const history = (await env.call('GET', '/api/ma/history')).json
  assert.equal(history.kind, 'history')
  assert.deepEqual(history.days, days.slice(1)) // 只取最近 7 個，由舊到新
  assert.deepEqual(history.rows.map((r) => r.code), ['2330', '2317', '0050', '2454', '2603', '2412'])
  const row = history.rows.find((r) => r.code === '2454')
  assert.equal(row.cells.length, 7)
  assert.deepEqual(row.cells[0], { kind: 'U', prev: null, changed: false })
  assert.deepEqual(row.cells[5], { kind: 'W', prev: 'U', changed: true })
  assert.deepEqual(row.cells[6], { kind: 'W', prev: 'W', changed: false })
  const fresh = history.rows.find((r) => r.code === '2412')
  assert.deepEqual(fresh.cells, Array(7).fill({ kind: null, prev: null, changed: false }))
})

test('M4-S14 報告推播：含數字或語言模型失敗就用預設開場；推播帶 ma 欄位；描述與免責聲明由規則產生', async () => {
  const fallbackText = stripTags(MA_LINES.opening[0])
  const countsText = '多頭 1、空頭 1、其他 3。'

  // 兩次都含阿拉伯數字：重試 1 次後改用預設開場
  const digits = await setup({ llm: ['[smile]主人早安，今天是 10 月 14 日的均線', '[smile]今天有 5 檔的均線'] })
  await digits.run(`${TODAY}T08:30`)
  assert.equal(digits.llm.calls.open, 2)
  assert.equal(digits.llm.calls.other, 0)
  const d = pushData(digits, 0)
  assert.equal(d.script, MA_LINES.opening[0])
  assert.equal(d.text, `${fallbackText} ${countsText}`)
  assert.equal(d.id, 'ma-20261014')
  assert.deepEqual(JSON.parse(d.ma), { date: TODAY, asOf: ASOF, u: 1, d: 1, m: 3, status: 'ok' })
  assert.deepEqual(Object.keys(JSON.parse(d.ma)), ['date', 'asOf', 'u', 'd', 'm', 'status'])
  assert.ok(/^\[[^\]]+\]/.test(d.script))
  assert.ok(!d.text.includes('['))

  // 語言模型失敗：同樣用預設開場
  const failed = await setup()
  await failed.run(`${TODAY}T08:30`)
  assert.equal(pushData(failed, 0).script, MA_LINES.opening[0])
  assert.equal(pushData(failed, 0).text, `${fallbackText} ${countsText}`)

  // 合格的台詞照用；每檔描述與免責聲明仍然是規則產生的，語言模型只被呼叫一次（開場）
  const good = await setup({ llm: ['[smile]主人早安～均線整理好囉。'] })
  await good.run(`${TODAY}T08:30`)
  assert.equal(good.llm.calls.open, 1)
  assert.equal(good.llm.calls.other, 0)
  assert.equal(pushData(good, 0).script, '[smile]主人早安～均線整理好囉。')
  assert.equal(pushData(good, 0).text, `主人早安～均線整理好囉。 ${countsText}`)
  const report = (await good.call('GET', '/api/ma/report')).json
  assert.equal(report.disclaimer, '僅供參考，非投資建議。')
  assert.deepEqual(report.items.map((i) => [i.code, i.kind, i.desc]), WATCH.map(([code]) => [code, KINDS[code], MA_LINES.desc[KINDS[code]]]))
  assert.deepEqual(report.counts, { u: 1, d: 1, m: 3 })
  assert.equal(report.reportDate, TODAY)
  assert.equal(report.asOf, ASOF)
})

test('M4-S16 六種由高到低的排列各得到對應的種類與描述', () => {
  const cases = [
    [[3, 2, 1], 'U'], // 5 > 20 > 60
    [[1, 2, 3], 'D'], // 60 > 20 > 5
    [[2, 3, 1], 'W'], // 20 > 5 > 60
    [[1, 3, 2], 'V'], // 20 > 60 > 5
    [[3, 1, 2], 'S'], // 5 > 60 > 20
    [[2, 1, 3], 'B'] // 60 > 5 > 20
  ]
  for (const [[m5, m20, m60], kind] of cases) assert.equal(classify(m5, m20, m60, MA_CONTRACT), kind, `${m5},${m20},${m60}`)
  assert.equal(descFor('S', MA_LINES), '5 日線站上 20 日線與 60 日線，20 日線仍在最下，短線轉強。')
  assert.equal(descFor('B', MA_LINES), '5 日線站上 20 日線，仍在 60 日線下方，築底回升。')
})
