// M4 跨線接線驗證（docs/M4-EXPENSIVE-PLAN.md §4.6 W-B），規劃者在整合階段撰寫。
// 用 D 線真實的排程與 API 產出，餵給 B 線真實的泡泡檢視與明細網頁渲染函式，
// 確認三條線依同一份契約接得起來：推播的 ma 欄位與台詞、報告與歷史的每個種類都能被渲染。
// 只替換外部服務（證交所、語言模型、FCM、D1）；排程、路由、核心函式、檢視函式一律用真的。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { createHandler, runScheduled } from '../worker/handlers.js'
import { createStore } from '../worker/store.stub.js'
import { createFcmStub } from '../worker/fcm-client.stub.js'
import { createTwseStub } from '../worker/twse-client.stub.js'

// 常數定義
const SECRET = 'test-only-secret'
const TODAY = '2026-10-14'
const ASOF = '2026-10-13'
const DAY_MS = 24 * 60 * 60 * 1000
const PET_DIR = new URL('../../app/src/main/assets/pet/', import.meta.url)
const readConfig = (name) => readFileSync(new URL(`../config/${name}`, import.meta.url), 'utf8')
const CONTRACT = JSON.parse(readConfig('ma-contract.json'))
const GLOSSARY = JSON.parse(readConfig('ma-glossary.json'))
const LINES = JSON.parse(readConfig('ma-lines.json'))
const repeat = (parts) => parts.flatMap(([value, count]) => Array(count).fill(value))
const SERIES = [
  ['2330', '台積電', Array.from({ length: 60 }, (_, i) => i + 1)],
  ['2317', '鴻海', Array.from({ length: 60 }, (_, i) => 60 - i)],
  ['0050', '元大台灣50', repeat([[100, 40], [70, 15], [130, 5]])],
  ['2454', '聯發科', repeat([[100, 40], [130, 15], [110, 5]])],
  ['2603', '長榮', repeat([[120, 40], [80, 15], [100, 5]])],
  ['2881', '富邦金', repeat([[100, 40], [140, 15], [60, 5]])],
  ['3008', '大立光', repeat([[90, 40], [100, 20]])],
  ['00878', '國泰永續高股息', Array.from({ length: 40 }, (_, i) => i + 1)]
]

// 功能函數定義

// 到 endKey（含）為止的 n 個平日日期，由舊到新
const weekdaysEnding = (endKey, n) => {
  const out = []
  let d = new Date(`${endKey}T00:00:00Z`)
  while (out.length < n) {
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) out.unshift(d.toISOString().slice(0, 10))
    d = new Date(d.getTime() - DAY_MS)
  }
  return out
}

// 載入角色頁的程式，回傳全域物件
const loadPet = () => {
  const context = vm.createContext({})
  for (const name of ['emotion-map.js', 'vendor/stream-parser.js', 'performance.js', 'ma-labels.js', 'ma-view.js']) {
    vm.runInContext(readFileSync(new URL(name, PET_DIR), 'utf8'), context, { filename: name })
  }
  return context
}

// 組出相依、播種八檔（八種排列各一）、跑一次 08:30 排程
const runOnce = async () => {
  const fcm = createFcmStub()
  const store = createStore({})
  for (const [code, name, closes] of SERIES) {
    await store.addWatch({ code, name, addedOn: '2026-09-01' })
    const dates = weekdaysEnding(ASOF, closes.length)
    await store.upsertCloses(code, closes.map((close, i) => ({ date: dates[i], close })))
  }
  const clock = { now: Date.parse(`${TODAY}T08:30:00+08:00`) }
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
    drinkPrompts: { parse: 'p', script: 's' },
    todoist: null,
    todoistDefaults: JSON.parse(readConfig('todoist-defaults.json')),
    todoistLines: JSON.parse(readConfig('todoist-lines.json')),
    todoistPrompts: { split: 'a', script: 'b' },
    twse: createTwseStub({ all: { asOf: ASOF, rows: [] }, months: {}, closed: { 2026: [] } }),
    maDefaults: JSON.parse(readConfig('ma-defaults.json')),
    maLines: LINES,
    maContract: CONTRACT,
    maPrompt: '【接線測試開場提示詞】',
    sleep: async () => {},
    secret: SECRET,
    store,
    streamer: () => ({ [Symbol.asyncIterator]: async function* () { throw new Error('stub：語言模型不可用') } }),
    now: () => clock.now,
    pusher: (message) => fcm.sendFcm(message, '{}'),
    pushConfig: {
      serviceAccount: JSON.stringify({ project_id: 'p', client_email: 'e@p.example', private_key: 'k' }),
      deviceToken: 'test-only-device-token'
    },
    randomText: () => 'r'
  }
  await runScheduled(deps, clock.now)
  const handle = createHandler(deps)
  const get = async (path) => (await handle(new Request(`http://localhost${path}`, { headers: { 'x-app-secret': SECRET } }))).json()
  return { fcm, get }
}

test('M4 接線：推播的 ma 欄位與台詞能被泡泡檢視正確解讀', async () => {
  const env = await runOnce()
  assert.equal(env.fcm.sent.length, 1)
  const data = env.fcm.sent[0].message.data
  const ma = JSON.parse(data.ma)
  assert.deepEqual(Object.keys(ma), CONTRACT.push.keys)
  assert.ok(data.ma.length <= CONTRACT.push.maxChars)
  assert.ok(CONTRACT.push.pushStatuses.includes(ma.status))
  // 八檔：多頭 1、空頭 1、其他 6
  assert.deepEqual({ u: ma.u, d: ma.d, m: ma.m }, { u: 1, d: 1, m: 6 })
  assert.ok(data.text.includes(LINES.countsSentence.replace('{u}', '1').replace('{d}', '1').replace('{m}', '6')))
  assert.equal(data.id, `ma-${TODAY.replaceAll('-', '')}`)

  const pet = loadPet()
  const view = JSON.parse(JSON.stringify(pet.PetMaView.viewFor({ ...ma, script: data.script }, pet.PetMaLabels)))
  assert.deepEqual(view.summary, { u: 1, d: 1, m: 6 })
  assert.deepEqual(view.buttons.map((b) => b.action.action), ['openMa', 'dismiss'])
  for (const b of view.buttons) assert.ok(CONTRACT.bubbleActions.includes(b.action.action))
})

test('M4 接線：報告與歷史的每個種類都能被明細網頁的渲染函式處理', async () => {
  const env = await runOnce()
  const render = await import(new URL('../web/ma-render.js', import.meta.url))
  const report = await env.get(CONTRACT.api.report)
  assert.equal(report.kind, 'report')
  assert.equal(report.status, 'ok')
  assert.equal(report.disclaimer, LINES.disclaimer)
  assert.equal(report.items.length, SERIES.length)

  const seen = new Set()
  for (const item of report.items) {
    assert.ok(CONTRACT.kinds.includes(item.kind), `${item.code} 種類 ${item.kind}`)
    seen.add(item.kind)
    assert.equal(item.desc, LINES.desc[item.kind])
    const tag = render.tagLabel(item.kind, GLOSSARY)
    assert.ok(tag.text.includes(GLOSSARY.kinds[item.kind].name))
    assert.equal(tag.group, CONTRACT.kindGroups[item.kind])
    const e = render.explainFor(item.kind, GLOSSARY)
    assert.ok(e.def.length > 0 && e.meta.length > 0)
    assert.equal(render.glyphFor(item.kind, GLOSSARY), GLOSSARY.kinds[item.kind].glyph)
    assert.equal(render.chartSvg(item.kind, GLOSSARY) === '', GLOSSARY.kinds[item.kind].chart === null)
    if (item.kind === 'N') assert.equal(item.ma, null)
    else assert.equal(item.ma.length, 3)
  }
  assert.deepEqual([...seen].sort(), [...CONTRACT.kinds].sort(), '八種排列都出現過')

  const history = await env.get(CONTRACT.api.history)
  assert.equal(history.kind, 'history')
  assert.deepEqual(history.days, [ASOF])
  for (const row of history.rows) {
    for (const cell of row.cells) {
      assert.ok(cell.kind === null || CONTRACT.kinds.includes(cell.kind))
      if (cell.kind !== null) assert.ok(render.glyphFor(cell.kind, GLOSSARY).length > 0)
    }
  }

  const watch = await env.get(CONTRACT.api.watchlist)
  assert.equal(watch.kind, 'watchlist')
  assert.equal(watch.limit, CONTRACT.limit)
  assert.equal(watch.items.length, SERIES.length)
})
