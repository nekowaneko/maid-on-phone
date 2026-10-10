// 產線入口驗證（W-A、V36）
// 從真實入口 runScheduled 進入，驗證 FCM 推播產出、API 查詢一致性與無 Todoist 權杖正常運作。
// 嚴格遵守架構約束：純黑箱測試，不使用 monkeypatch。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandler, runScheduled } from '../worker/handlers.js'
import { createStore } from '../worker/store.stub.js'
import { createTwseStub } from '../worker/twse-client.stub.js'

const contract = JSON.parse(readFileSync(new URL('../config/ma-contract.json', import.meta.url), 'utf8'))
const defaults = JSON.parse(readFileSync(new URL('../config/ma-defaults.json', import.meta.url), 'utf8'))
const lines = JSON.parse(readFileSync(new URL('../config/ma-lines.json', import.meta.url), 'utf8'))
const prompt = readFileSync(new URL('../config/ma-script-prompt.md', import.meta.url), 'utf8')

test('W-A 產線入口驗證：完整貫穿排程推播、API 查詢與清單異動流程', async () => {
  const store = createStore()
  const pushes = []

  // 準備 60 筆由舊到新的 2330 收盤價，最後一天為前一交易日 2026-10-07
  const closes60 = Array.from({ length: 60 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    close: 100 + i
  }))
  closes60[closes60.length - 1].date = '2026-10-07'

  const twse = createTwseStub({
    all: {
      asOf: '2026-10-07',
      rows: [
        { code: '2330', name: '台積電', close: 159 },
        { code: '2412', name: '中華電', close: 120 }
      ]
    },
    months: {
      '2330': { '202610': closes60 },
      '2412': { '202610': [{ date: '2026-10-07', close: 120 }] }
    },
    closed: {
      '2026': []
    }
  })

  // 初始加入追蹤標的 2330
  await store.addWatch({ code: '2330', name: '台積電', addedOn: '2026-10-01' })

  const deps = {
    secret: 'pipeline-secret',
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
    pusher: async (message) => {
      pushes.push(message)
      return { ok: true }
    },
    streamer: (messages) => ({
      async *[Symbol.asyncIterator]() {
        yield { type: 'text', text: '[smile]早安主人均線整理完成' }
      }
    }),
    templateText: 'Assistant {{persona}} {{emotionList}}',
    personaSchema: {},
    messageSchema: {},
    drinkModel: {},
    starbucksTable: {},
    drinkDefaults: {},
    drinkLines: {},
    drinkPrompts: {},
    todoist: null // 無 Todoist 權杖，驗證 F3 仍正常執行（A41）
  }

  // 1. 台北時間 2026-10-08 08:30:00（UTC 2026-10-08 00:30:00）觸發真實排程入口
  const triggerMs = Date.UTC(2026, 9, 8, 0, 30, 0)
  await runScheduled(deps, triggerMs)

  // 驗證 FCM 推播
  assert.equal(pushes.length, 1)
  const pushMsg = pushes[0]
  const data = pushMsg.message.data

  assert.equal(data.id, 'ma-20261008')
  assert.match(data.text, /多頭 1、空頭 0、其他 0。/)

  // 驗證 data.ma JSON 鍵順序
  const parsedMa = JSON.parse(data.ma)
  assert.deepEqual(Object.keys(parsedMa), ['date', 'asOf', 'u', 'd', 'm', 'status'])
  assert.equal(parsedMa.date, '2026-10-08')
  assert.equal(parsedMa.asOf, '2026-10-07')
  assert.equal(parsedMa.u, 1)
  assert.equal(parsedMa.d, 0)
  assert.equal(parsedMa.m, 0)
  assert.equal(parsedMa.status, 'ok')

  // 2. 透過 createHandler 驗證 API 路由產出與推播一致
  const handler = createHandler(deps)
  const makeReq = async (method, path, body = null) => {
    const init = {
      method,
      headers: {
        'x-app-secret': 'pipeline-secret'
      }
    }
    if (body !== null) {
      init.headers['content-type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    return handler(new Request(`https://example.com${path}`, init))
  }

  // GET /api/ma/report
  const reportRes = await makeReq('GET', '/api/ma/report')
  assert.equal(reportRes.status, 200)
  const report = await reportRes.json()
  assert.equal(report.kind, 'report')
  assert.equal(report.status, 'ok')
  assert.equal(report.reportDate, '2026-10-08')
  assert.equal(report.asOf, '2026-10-07')
  assert.deepEqual(report.counts, { u: 1, d: 0, m: 0 })
  assert.equal(report.items.length, 1)
  assert.equal(report.items[0].code, '2330')
  assert.equal(report.items[0].kind, 'U')
  assert.equal(report.disclaimer, lines.disclaimer)

  // GET /api/ma/history
  const historyRes = await makeReq('GET', '/api/ma/history')
  assert.equal(historyRes.status, 200)
  const history = await historyRes.json()
  assert.equal(history.kind, 'history')
  assert.ok(history.days.includes('2026-10-07'))
  const row2330 = history.rows.find((r) => r.code === '2330')
  assert.ok(row2330)
  assert.equal(row2330.cells[row2330.cells.length - 1].kind, 'U')

  // POST /api/ma/watchlist add
  const addRes = await makeReq('POST', '/api/ma/watchlist', { action: 'add', code: '2412' })
  assert.equal(addRes.status, 200)
  const addBody = await addRes.json()
  assert.equal(addBody.ok, true)
  assert.deepEqual(addBody.item, { code: '2412', name: '中華電', pending: true })

  // POST /api/ma/watchlist untrack
  const untrackRes = await makeReq('POST', '/api/ma/watchlist', { action: 'untrack', code: '2330' })
  assert.equal(untrackRes.status, 200)
  const untrackBody = await untrackRes.json()
  assert.equal(untrackBody.ok, true)

  // POST /api/ma/watchlist restore
  const restoreRes = await makeReq('POST', '/api/ma/watchlist', { action: 'restore', code: '2330' })
  assert.equal(restoreRes.status, 200)
  const restoreBody = await restoreRes.json()
  assert.equal(restoreBody.ok, true)

  // 3. 追蹤清單為空時不送推播且不丟例外
  const emptyStore = createStore()
  const emptyPushes = []
  const emptyDeps = {
    ...deps,
    store: emptyStore,
    pusher: async (m) => { emptyPushes.push(m); return { ok: true } }
  }
  await runScheduled(emptyDeps, triggerMs)
  assert.equal(emptyPushes.length, 0)
})
