// M4.3 規格範例表（docs/M4.3-EXPENSIVE-PLAN.md §4.6）中 JS 自動測試的各列（S01～S09、S11～S15），凍結後不得修改。
// S10 為 Kotlin 規格測試（M43SpecTest.kt）。每個測試標題的「預期結果」文字逐字照規格表抄寫。
// 相依全部走 Stub：儲存層用 store.stub.js、推播用 fcm-client.stub.js、證交所用 twse-client.stub.js、Todoist 用 todoist-client.stub.js，
// 語言模型由這支測試給定固定回覆，並自己計數；全程不得對外連線。
// setup()、call、at、tpe() 複製自 spec/m2/drink.test.js，盤前均線與 Todoist 的相依複製自 spec/m4/ma.test.js。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createHandler, runScheduled } from '../../../worker/handlers.js'
import { createStore } from '../../../worker/store.stub.js'
import { createFcmStub } from '../../../worker/fcm-client.stub.js'
import { createTwseStub } from '../../../worker/twse-client.stub.js'
import { createTodoistStub } from '../../../worker/todoist-client.stub.js'

// 常數定義
const SECRET = 'test-only-secret'
const SECRET_HEADER = 'x-app-secret'
const ORIGIN = 'http://localhost'
const PARSE_PROMPT = '【測試用解析提示詞 PARSE_MARK】'
const SCRIPT_PROMPT = '【測試用台詞提示詞 SCRIPT_MARK】'
const OPEN_PROMPT = '【測試用開場台詞提示詞 OPEN_MARK】'
const TODOIST_SPLIT_PROMPT = '【測試用拆步驟提示詞 SPLIT_MARK】'
const TODOIST_SCRIPT_PROMPT = '【測試用提醒台詞提示詞 REMIND_MARK】'
const DEVICE_TOKEN = 'test-only-device-token'
const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'test-only-project',
  client_email: 'test-only@test-only-project.iam.gserviceaccount.example',
  private_key: 'test-only-private-key'
})
const ENABLED_PATH = '/api/drink/enabled'
const SETTINGS_PATH = '/api/drink/settings'
const DISABLED_ERROR = '戒飲記錄已關閉'
const ENABLED_ERROR = '設定值不正確：啟用戒飲記錄'
const ASKED_ON_KEY = 'drink.askedOn'
const FIVE_FIELDS = ['subscriptionName', 'monthlyFee', 'resistValue', 'monthlyQuota', 'askTime']
const TODAY = '2026-10-14' // 星期三
const ASOF = '2026-10-13' // 前一交易日（星期二）
const DAY_MS = 24 * 60 * 60 * 1000
const PET_DIR = new URL('../../../../app/src/main/assets/pet/', import.meta.url)
const PET_SCRIPTS = ['emotion-map.js', 'vendor/stream-parser.js', 'performance.js', 'drink-labels.js', 'drink-view.js'] // 與 index.html 的載入順序相同
const MAIN_XML = new URL('../../../../app/src/main/res/layout/activity_main.xml', import.meta.url)
const MAIN_KT = new URL('../../../../app/src/main/java/com/accompany/pet/MainActivity.kt', import.meta.url)
const readConfig = (name) => readFileSync(new URL(`../../../config/${name}`, import.meta.url), 'utf8')
const MA_CONTRACT = JSON.parse(readConfig('ma-contract.json'))
const MA_DEFAULTS = JSON.parse(readConfig('ma-defaults.json'))
const MA_LINES = JSON.parse(readConfig('ma-lines.json'))
const TODOIST_DEFAULTS = JSON.parse(readConfig('todoist-defaults.json'))
const TODOIST_LINES = JSON.parse(readConfig('todoist-lines.json'))
const WATCH = [
  ['2330', '台積電'],
  ['2317', '鴻海']
]
const UNIVERSE = [
  ...WATCH,
  ['2412', '中華電'],
  ['2881', '富邦金']
].map(([code, name]) => ({ code, name, close: 100 }))

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

// 語言模型的 Stub：依提示詞分辨解析、台詞與盤前均線開場，各自依序取準備好的回覆並計數；沒有準備就丟例外
const createLlm = ({ parse = [], script = [] } = {}) => {
  const queues = { parse: [...parse], script: [...script] }
  const calls = { parse: 0, script: 0, other: 0, total: 0 }
  const streamer = (messages) => ({
    [Symbol.asyncIterator]: async function* () {
      calls.total += 1
      const joined = messages.map((m) => String(m.content)).join('\n')
      const isParse = joined.includes(PARSE_PROMPT) && !joined.includes(SCRIPT_PROMPT)
      const isScript = joined.includes(SCRIPT_PROMPT) && !joined.includes(PARSE_PROMPT)
      if (!isParse && !isScript) {
        calls.other += 1
        throw new Error('stub：分辨不出呼叫種類')
      }
      const kind = isParse ? 'parse' : 'script'
      calls[kind] += 1
      const reply = queues[kind].shift()
      if (reply === undefined) throw new Error('stub：沒有準備回覆')
      yield { type: 'text', text: reply }
    }
  })
  return { streamer, calls }
}

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

// 60 日遞增收盤價（多頭排列），最後一筆是 endKey
const risingRows = (endKey) => {
  const dates = weekdaysEnding(endKey, 60)
  return dates.map((date, i) => ({ date, close: i + 1 }))
}

// 組出一份完整的相依與可調整的時鐘；seedMa 為 true 時播種追蹤清單與收盤價並給 Todoist
const setup = async (llmReplies = {}, { seedMa = false } = {}) => {
  const llm = createLlm(llmReplies)
  const fcm = createFcmStub()
  const clock = { now: tpe('2026-10-07T15:10') }
  const store = createStore({})
  const twse = createTwseStub({ all: { asOf: ASOF, rows: UNIVERSE }, months: {}, closed: { 2026: [] } })
  const p3Task = {
    id: 'X01',
    content: '確認畢業時辰',
    priority: 2,
    updated_at: '2026-09-01T00:00:00.000Z',
    added_at: '2026-08-01T00:00:00.000Z',
    due: { date: TODAY, string: TODAY, lang: 'zh', is_recurring: false, timezone: null },
    parent_id: null
  }
  const todoist = createTodoistStub({ tasks: seedMa ? [p3Task] : [] })
  if (seedMa) {
    for (const [code, name] of WATCH) {
      await store.addWatch({ code, name, addedOn: '2026-09-01' })
      await store.upsertCloses(code, risingRows(ASOF))
    }
  }
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
    drinkPrompts: { parse: PARSE_PROMPT, script: SCRIPT_PROMPT },
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
  // 送一次 API 請求，回傳狀態碼、原始文字與（能解析時的）JSON；body 是 undefined 時不送內容，rawBody 給了就原樣送出
  const call = async (method, path, body, rawBody) => {
    const init = { method, headers: { [SECRET_HEADER]: SECRET } }
    if (body !== undefined || rawBody !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = rawBody !== undefined ? rawBody : JSON.stringify(body)
    }
    const response = await handle(new Request(`${ORIGIN}${path}`, init))
    const text = await response.text()
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }
    return { status: response.status, json, text }
  }
  // 在指定的台北時間做一件事
  const at = async (local, method, path, body) => {
    clock.now = tpe(local)
    return call(method, path, body)
  }
  // 在指定的台北時間跑一次排程
  const run = async (local) => {
    clock.now = tpe(local)
    await runScheduled(deps, tpe(local))
  }
  // 設定開關（必須回 200 才繼續）
  const setEnabled = async (enabled) => {
    const res = await call('PUT', ENABLED_PATH, { enabled })
    assert.equal(res.status, 200, `PUT ${ENABLED_PATH} 應回 200`)
    return res
  }
  return { deps, store, llm, fcm, twse, todoist, clock, call, at, run, setEnabled }
}

// 依序載入角色頁的程式，回傳它們掛上的全域物件（照 spec/m2/overlay-drink.test.js 的 loadPet）
const loadPet = () => {
  const context = vm.createContext({})
  for (const name of PET_SCRIPTS) {
    vm.runInContext(readFileSync(new URL(name, PET_DIR), 'utf8'), context, { filename: name })
  }
  return context
}

// 跨 realm 的物件先轉成一般資料再比對
const plain = (value) => JSON.parse(JSON.stringify(value))

// 紀錄的完整快照（含已撤銷旗標），用來確認一筆都沒新增也沒改動
const snapshot = async (env) => plain(await env.deps.store.listDrinkLogs())

test('M43-S01 戒飲記錄預設為「開啟」，所有功能和現在完全一樣。', async () => {
  const env = await setup()
  const res = await env.call('GET', ENABLED_PATH)
  assert.equal(res.status, 200)
  assert.deepEqual(res.json, { enabled: true })
  const settings = await env.call('GET', SETTINGS_PATH)
  assert.equal(settings.status, 200)
  assert.deepEqual(Object.keys(settings.json).sort(), [...FIVE_FIELDS].sort()) // 仍是五個欄位，不含 enabled
  assert.equal('enabled' in settings.json, false)
})

test('M43-S02 開關仍然是關閉。', async () => {
  const env = await setup()
  const off = await env.setEnabled(false)
  assert.equal(off.status, 200)
  assert.deepEqual(off.json, { enabled: false })
  assert.deepEqual((await env.call('GET', ENABLED_PATH)).json, { enabled: false })
  const on = await env.setEnabled(true)
  assert.equal(on.status, 200)
  assert.deepEqual(on.json, { enabled: true })
  assert.deepEqual((await env.call('GET', ENABLED_PATH)).json, { enabled: true })
})

test('M43-S03 不會推播「今天有喝飲料嗎？」。', async () => {
  const env = await setup()
  await env.setEnabled(false)
  await env.run('2026-10-07T15:00')
  assert.equal(env.fcm.sent.length, 0)
  assert.equal(await env.store.readSetting(ASKED_ON_KEY), null) // drink.askedOn 沒被寫入
})

test('M43-S04 照常推播詢問。', async () => {
  const env = await setup()
  await env.setEnabled(false)
  await env.setEnabled(true)
  await env.run('2026-10-07T15:00')
  assert.equal(env.fcm.sent.length, 1)
  const data = env.fcm.sent[0].message.data
  assert.equal(data.actions, 'resist,speak') // 沿用 M2-S11 的判斷方式
  assert.equal(typeof data.script, 'string')
  assert.ok(/^\[[^\]]+\]/.test(data.script))
  assert.ok(data.text.length > 0)
  assert.equal(await env.store.readSetting(ASKED_ON_KEY), '2026-10-07')
})

test('M43-S05 回覆「戒飲記錄已關閉」，不解析、不寫入任何紀錄。', async () => {
  const env = await setup({ parse: [bobaParse()] })
  await env.setEnabled(false)
  const before = await snapshot(env)
  const res = await env.call('POST', '/api/drink/parse', { text: '喝了一杯珍奶' })
  assert.equal(res.status, 403)
  assert.deepEqual(res.json, { error: DISABLED_ERROR })
  assert.equal(env.llm.calls.parse, 0)
  assert.equal(env.llm.calls.total, 0)
  assert.equal(before.length, 0)
  assert.equal((await env.deps.store.listDrinkLogs()).length, before.length)
})

test('M43-S06 同樣被拒絕並回覆「戒飲記錄已關閉」，不新增也不改動任何紀錄。', async () => {
  const env = await setup()
  // 關閉前先有兩筆：一筆喝了（之後拿來撤銷）、一筆沒喝
  const drank = await env.at('2026-10-07T09:00', 'POST', '/api/drink/confirm', { draft: bobaDraft() })
  assert.equal(drank.json.kind, 'saved')
  await env.at('2026-10-07T15:00', 'POST', '/api/drink/resist', {})
  await env.setEnabled(false)
  const before = await snapshot(env)
  assert.equal(before.length, 2)
  const requests = [
    ['resist', {}],
    ['confirm', { draft: bobaDraft() }],
    ['undo', { logId: drank.json.logId }],
    ['preview', { draft: bobaDraft({ sugarLevelId: 'quarter' }) }]
  ]
  for (const [name, body] of requests) {
    const res = await env.at('2026-10-07T15:30', 'POST', `/api/drink/${name}`, body)
    assert.equal(res.status, 403, name)
    assert.deepEqual(res.json, { error: DISABLED_ERROR }, name)
  }
  assert.deepEqual(await snapshot(env), before) // 筆數與內容（含已撤銷旗標）完全不變
})

test('M43-S07 一筆都不刪除；關閉期間仍可查看統計與匯出；重新打開後歷史、統計和關閉前一模一樣。', async () => {
  const env = await setup()
  await env.at('2026-10-06T10:00', 'POST', '/api/drink/resist', {})
  await env.at('2026-10-07T15:10', 'POST', '/api/drink/confirm', { draft: bobaDraft() })
  const read = async () => ({
    stats: await env.at('2026-10-07T16:00', 'GET', '/api/drink/stats'),
    exported: await env.at('2026-10-07T16:00', 'GET', '/api/drink/export'),
    history: await env.at('2026-10-07T16:00', 'POST', '/api/drink/history', {})
  })
  const opened = await read()
  assert.equal(opened.stats.status, 200)
  assert.equal(opened.exported.status, 200)
  assert.equal(opened.history.status, 200)
  assert.equal(opened.exported.json.logs.length, 2)
  await env.setEnabled(false)
  const closed = await read()
  assert.equal(closed.stats.status, 200)
  assert.equal(closed.exported.status, 200)
  assert.equal(closed.history.status, 200)
  assert.deepEqual(closed.stats.json, opened.stats.json)
  assert.deepEqual(closed.exported.json, opened.exported.json)
  assert.deepEqual(closed.history.json, opened.history.json)
  await env.setEnabled(true)
  const reopened = await read()
  assert.deepEqual(reopened.stats.json, opened.stats.json)
  assert.deepEqual(reopened.exported.json, opened.exported.json)
  assert.deepEqual(reopened.history.json, opened.history.json)
})

test('M43-S08 「🎤 說話」「沒喝」「📊 戒飲歷史」三顆不顯示；「💬 聊聊」「📈 盤前均線」照常顯示。', () => {
  const { PetDrinkView } = loadPet()
  assert.deepEqual(plain(PetDrinkView.controlsVisibility(false)), {
    mic: false,
    resist: false,
    history: false,
    chat: true,
    ma: true
  })
})

test('M43-S09 五顆按鈕都顯示，和現在一樣。', () => {
  const { PetDrinkView } = loadPet()
  const all = { mic: true, resist: true, history: true, chat: true, ma: true }
  assert.deepEqual(plain(PetDrinkView.controlsVisibility(true)), all)
  for (const value of [undefined, null, 'false', 0]) {
    assert.deepEqual(plain(PetDrinkView.controlsVisibility(value)), all, String(value))
  }
})

test('M43-S11 完全不受影響，照常運作。', async () => {
  const env = await setup({}, { seedMa: true })
  await env.setEnabled(false)
  // 盤前均線讀取、Todoist 動作、聊天：不回 403，也不含「戒飲記錄已關閉」
  const report = await env.at(`${TODAY}T08:00`, 'GET', '/api/ma/report')
  const todoist = await env.at(`${TODAY}T08:00`, 'POST', '/api/todoist/action', { action: 'snooze', taskId: 'X01' })
  const chat = await env.at(`${TODAY}T08:00`, 'POST', '/api/chat', { message: '早安', history: [], minutesSinceLastSeen: 0 })
  for (const [name, res] of [['ma/report', report], ['todoist/action', todoist], ['chat', chat]]) {
    assert.notEqual(res.status, 403, name)
    assert.ok(!res.text.includes(DISABLED_ERROR), name)
  }
  // 排程：台北 08:30 仍照常執行盤前均線與 Todoist 的 P3 掃描
  await env.run(`${TODAY}T08:30`)
  const pushes = env.fcm.sent.map((m) => m.message.data)
  assert.ok(pushes.some((d) => d.ma !== undefined), '盤前均線照常推播')
  assert.ok(pushes.some((d) => d.todoist !== undefined), 'Todoist P3 掃描照常推播')
})

test('M43-S12 不論開或關都留在原位、都能點開。', () => {
  const xml = readFileSync(MAIN_XML, 'utf8')
  const kt = readFileSync(MAIN_KT, 'utf8')
  assert.ok(xml.includes('android:id="@+id/cardDrinkSettings"'))
  assert.ok(kt.includes('DrinkSettingsActivity::class.java'))
  for (const word of ['ENABLED_PATH', 'drinkUiEnabled', 'enabled']) {
    assert.ok(!kt.includes(word), `MainActivity.kt 不得含 ${word}`) // 主畫面沒有依開關改變行為
  }
})

test('M43-S13 拒絕儲存並回報「設定值不正確」，所有設定都維持原樣。', async () => {
  const env = await setup()
  await env.setEnabled(false) // 先設為 false，確認壞值不會把它改成 true
  const settingsBefore = (await env.call('GET', SETTINGS_PATH)).json
  const bad = [{ enabled: 'maybe' }, { enabled: 'false' }, { enabled: 0 }, { enabled: null }, {}]
  for (const body of bad) {
    const res = await env.call('PUT', ENABLED_PATH, body)
    assert.equal(res.status, 400, JSON.stringify(body))
    assert.deepEqual(res.json, { error: ENABLED_ERROR }, JSON.stringify(body))
    assert.deepEqual((await env.call('GET', ENABLED_PATH)).json, { enabled: false }, JSON.stringify(body))
  }
  // 整個 body 不是物件
  for (const raw of ['"false"', '123', 'null', '[]', 'true']) {
    const res = await env.call('PUT', ENABLED_PATH, undefined, raw)
    assert.equal(res.status, 400, raw)
    assert.deepEqual(res.json, { error: ENABLED_ERROR }, raw)
    assert.deepEqual((await env.call('GET', ENABLED_PATH)).json, { enabled: false }, raw)
  }
  assert.deepEqual((await env.call('GET', SETTINGS_PATH)).json, settingsBefore)
})

test('M43-S14 可以儲存，而且不會改變開關。', async () => {
  const env = await setup()
  await env.setEnabled(false)
  const before = (await env.call('GET', SETTINGS_PATH)).json
  const res = await env.call('PUT', SETTINGS_PATH, { ...before, monthlyFee: 300 })
  assert.equal(res.status, 200)
  assert.equal(res.json.monthlyFee, 300)
  assert.deepEqual((await env.call('GET', ENABLED_PATH)).json, { enabled: false })
})

test('M43-S15 開關維持原狀，不會被改成開或關。', async () => {
  const env = await setup()
  await env.setEnabled(false)
  const settings = (await env.call('GET', SETTINGS_PATH)).json
  assert.deepEqual(Object.keys(settings).sort(), [...FIVE_FIELDS].sort()) // 只帶五欄位，不含 enabled
  const closed = await env.call('PUT', SETTINGS_PATH, settings)
  assert.equal(closed.status, 200)
  assert.deepEqual((await env.call('GET', ENABLED_PATH)).json, { enabled: false })
  await env.setEnabled(true)
  const opened = await env.call('PUT', SETTINGS_PATH, settings)
  assert.equal(opened.status, 200)
  assert.deepEqual((await env.call('GET', ENABLED_PATH)).json, { enabled: true })
})
