// W-A 主畫面入口契約驗證（輔助測試，L2）
// 驗證 /api/ma/report 回應原文鍵順序（status、reportDate、counts 在 items 之前）、empty 與 none 回應狀態，以及契約狀態子集。
// 嚴格遵守架構約束：不使用 monkeypatch。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandler, runScheduled } from '../worker/handlers.js'
import { createStore } from '../worker/store.stub.js'
import { createTwseStub } from '../worker/twse-client.stub.js'

// 常數定義
const contract = JSON.parse(readFileSync(new URL('../config/ma-contract.json', import.meta.url), 'utf8'))
const defaults = JSON.parse(readFileSync(new URL('../config/ma-defaults.json', import.meta.url), 'utf8'))
const lines = JSON.parse(readFileSync(new URL('../config/ma-lines.json', import.meta.url), 'utf8'))
const prompt = readFileSync(new URL('../config/ma-script-prompt.md', import.meta.url), 'utf8')

// 建立通用的測試相依物件
function createDeps(store, twse) {
  return {
    secret: 'test-secret',
    store,
    maContract: contract,
    maDefaults: defaults,
    maLines: lines,
    maPrompt: prompt,
    twse,
    sleep: async () => {},
    pushConfig: {
      serviceAccount: '{"project_id":"p","client_email":"e","private_key":"k"}',
      deviceToken: 'fcm-device-token'
    },
    pusher: async () => ({ ok: true }),
    streamer: () => ({
      async *[Symbol.asyncIterator]() {
        yield { type: 'text', text: '[smile]早安均線完成' }
      }
    }),
    templateText: 'Assistant',
    personaSchema: {},
    messageSchema: {},
    drinkModel: {},
    starbucksTable: {},
    drinkDefaults: {},
    drinkLines: {},
    drinkPrompts: {},
    todoist: null
  }
}

test('W-A 契約驗證：正常報告回應原文中 status、reportDate、counts 在 items 之前', async () => {
  const store = createStore()
  const closes60 = Array.from({ length: 60 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    close: 100 + i
  }))
  closes60[closes60.length - 1].date = '2026-10-07'

  const twse = createTwseStub({
    all: {
      asOf: '2026-10-07',
      rows: [{ code: '2330', name: '台積電', close: 159 }]
    },
    months: {
      '2330': { '202610': closes60 }
    },
    closed: { '2026': [] }
  })

  await store.addWatch({ code: '2330', name: '台積電', addedOn: '2026-10-01' })
  const deps = createDeps(store, twse)

  // 台北時間 08:30（UTC 00:30）觸發排程產出報告
  const triggerMs = Date.UTC(2026, 9, 8, 0, 30, 0)
  await runScheduled(deps, triggerMs)

  const handler = createHandler(deps)
  const req = new Request('https://example.com/api/ma/report', {
    headers: { 'x-app-secret': 'test-secret' }
  })
  const res = await handler(req)
  assert.equal(res.status, 200)

  const rawText = await res.text()
  const parsed = JSON.parse(rawText)

  assert.equal(parsed.status, 'ok')
  assert.equal(typeof parsed.reportDate, 'string')
  assert.equal(typeof parsed.counts?.u, 'number')
  assert.equal(typeof parsed.counts?.d, 'number')
  assert.equal(typeof parsed.counts?.m, 'number')
  assert.ok(Array.isArray(parsed.items))

  // 釘住 parseMaReportBrief 的取值假設：status、reportDate、counts 必須在 items 之前出現
  const posStatus = rawText.indexOf('"status"')
  const posReportDate = rawText.indexOf('"reportDate"')
  const posCounts = rawText.indexOf('"counts"')
  const posItems = rawText.indexOf('"items"')

  assert.ok(posStatus !== -1 && posItems !== -1 && posStatus < posItems, 'status 必須在 items 之前')
  assert.ok(posReportDate !== -1 && posReportDate < posItems, 'reportDate 必須在 items 之前')
  assert.ok(posCounts !== -1 && posCounts < posItems, 'counts 必須在 items 之前')
})

test('W-A 契約驗證：清單為空回應 empty，無報告回應 none', async () => {
  // 1. 清單為空
  const emptyStore = createStore()
  const emptyDeps = createDeps(emptyStore, createTwseStub({ all: { asOf: '2026-10-07', rows: [] }, months: {}, closed: {} }))
  const emptyHandler = createHandler(emptyDeps)
  const emptyRes = await emptyHandler(new Request('https://example.com/api/ma/report', {
    headers: { 'x-app-secret': 'test-secret' }
  }))
  assert.equal(emptyRes.status, 200)
  const emptyData = await emptyRes.json()
  assert.equal(emptyData.status, 'empty')

  // 2. 有清單但尚未產出報告（剛設定好，尚未到過 08:30）
  const noneStore = createStore()
  await noneStore.addWatch({ code: '2330', name: '台積電', addedOn: '2026-10-01' })
  const noneDeps = createDeps(noneStore, createTwseStub({ all: { asOf: '2026-10-07', rows: [] }, months: {}, closed: {} }))
  const noneHandler = createHandler(noneDeps)
  const noneRes = await noneHandler(new Request('https://example.com/api/ma/report', {
    headers: { 'x-app-secret': 'test-secret' }
  }))
  assert.equal(noneRes.status, 200)
  const noneData = await noneRes.json()
  assert.equal(noneData.status, 'none')
})

test('W-A 契約驗證：App 認得的狀態值為 ma-contract.json 的 statuses 子集', () => {
  const appRecognizedStatuses = ['ok', 'failed', 'empty', 'none']
  const contractStatuses = contract.statuses

  assert.ok(Array.isArray(contractStatuses), '契約必須包含 statuses 陣列')
  for (const st of appRecognizedStatuses) {
    assert.ok(contractStatuses.includes(st), `契約 statuses 必須包含 App 認得的狀態 ${st}`)
  }
})
