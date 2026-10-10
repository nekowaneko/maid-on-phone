// 盤前均線 API 路由與 runMaReport 整合測試
// 涵蓋 M4-S07～M4-S14 與 /api/ma/* 端點行為驗證。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandler, runMaReport, runScheduled } from '../worker/handlers.js'
import { createStore } from '../worker/store.stub.js'
import { createTwseStub } from '../worker/twse-client.stub.js'

const contract = JSON.parse(readFileSync(new URL('../config/ma-contract.json', import.meta.url), 'utf8'))
const defaults = JSON.parse(readFileSync(new URL('../config/ma-defaults.json', import.meta.url), 'utf8'))
const lines = JSON.parse(readFileSync(new URL('../config/ma-lines.json', import.meta.url), 'utf8'))
const prompt = readFileSync(new URL('../config/ma-script-prompt.md', import.meta.url), 'utf8')

const setupTestEnv = ({
  twseAll = null,
  twseMonths = {},
  twseClosed = {},
  twseFail = false,
  twseFailCodes = [],
  llmReplies = [],
  pushConfig = { serviceAccount: '{"project_id":"p","client_email":"e","private_key":"k"}', deviceToken: 'token123' }
} = {}) => {
  const store = createStore()
  const pushes = []
  let replyIdx = 0

  const deps = {
    secret: 'test-secret',
    store,
    maContract: contract,
    maDefaults: defaults,
    maLines: lines,
    maPrompt: prompt,
    twse: createTwseStub({
      all: twseAll,
      months: twseMonths,
      closed: twseClosed,
      fail: twseFail,
      failCodes: twseFailCodes
    }),
    sleep: async () => {},
    pushConfig,
    pusher: async (message) => {
      pushes.push(message)
      return { ok: true }
    },
    streamer: (messages) => ({
      async *[Symbol.asyncIterator]() {
        const text = llmReplies[replyIdx] ?? '早安主人均線已經整理好了'
        replyIdx += 1
        yield { type: 'text', text }
      }
    }),
    templateText: 'You are an assistant. {{persona}} {{emotionList}}',
    personaSchema: { properties: { greeting: { type: 'string' } } },
    messageSchema: {},
    drinkModel: {},
    starbucksTable: {},
    drinkDefaults: {},
    drinkLines: {},
    drinkPrompts: {},
    todoist: null
  }

  const handler = createHandler(deps)
  const callApi = async (method, path, body = null, headers = {}) => {
    const reqHeaders = {
      'x-app-secret': 'test-secret',
      ...headers
    }
    const init = {
      method,
      headers: reqHeaders
    }
    if (body !== null) {
      init.headers['content-type'] = 'application/json'
      init.body = JSON.stringify(body)
    }
    return handler(new Request(`https://example.com${path}`, init))
  }

  return { deps, store, pushes, callApi }
}

test('M4-S07 08:30 排程在假日或休市日時不送推播且不寫歷史', async () => {
  const { deps, store, pushes } = setupTestEnv({
    twseClosed: {
      '2026': ['2026-10-10'] // 假設 10/10 為休市日
    }
  })
  // 加上追蹤標的
  await store.addWatch({ code: '2330', name: '台積電', addedOn: '2026-10-01' })

  // 台北時間 2026-10-10 08:30:00 (UTC 2026-10-10 00:30:00)
  const ms = Date.UTC(2026, 9, 10, 0, 30, 0)
  const result = await runMaReport(deps, ms, { push: true })

  assert.equal(result.status, 'holiday')
  assert.equal(pushes.length, 0)
  assert.deepEqual(await store.listResultDates(), [])
})

test('M4-S10 追蹤清單為空時，08:30 排程不送推播', async () => {
  const { deps, store, pushes } = setupTestEnv()
  // 清單為空
  const ms = Date.UTC(2026, 9, 8, 0, 30, 0) // 週四
  const result = await runMaReport(deps, ms, { push: true })

  assert.equal(result.status, 'empty')
  assert.equal(pushes.length, 0)
})

test('M4-S08 全部失敗送失敗推播，單檔失敗其餘照報', async () => {
  // 情境 1：標的全部失敗（例如連線逾時或查無資料）
  const envAllFail = setupTestEnv({
    twseFailCodes: ['2330']
  })
  await envAllFail.store.addWatch({ code: '2330', name: '台積電', addedOn: '2026-10-01' })

  const ms = Date.UTC(2026, 9, 8, 0, 30, 0) // 2026-10-08 週四
  const res1 = await runMaReport(envAllFail.deps, ms, { push: true })
  assert.equal(res1.status, 'failed')
  assert.equal(envAllFail.pushes.length, 1)
  const failPush = envAllFail.pushes[0]
  assert.equal(failPush.message.data.id, 'ma-20261008')
  assert.equal(failPush.message.data.text, lines.failed)
  assert.equal(failPush.message.data.script, undefined)
  const failPayload = JSON.parse(failPush.message.data.ma)
  assert.equal(failPayload.status, 'failed')

  // 情境 2：只有單檔失敗（2454 失敗，2330 成功）
  const closes60 = Array.from({ length: 60 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    close: 100 + i
  }))
  // 最後一筆改為 asOf 2026-10-07
  closes60[closes60.length - 1].date = '2026-10-07'

  const envOneFail = setupTestEnv({
    twseMonths: {
      '2330': { '202610': closes60 }
    },
    twseFailCodes: ['2454']
  })
  await envOneFail.store.addWatch({ code: '2330', name: '台積電', addedOn: '2026-10-01' })
  await envOneFail.store.addWatch({ code: '2454', name: '聯發科', addedOn: '2026-10-01' })

  const res2 = await runMaReport(envOneFail.deps, ms, { push: true })
  assert.equal(res2.status, 'ok')
  assert.equal(envOneFail.pushes.length, 1)
  const okPush = envOneFail.pushes[0]
  const okPayload = JSON.parse(okPush.message.data.ma)
  assert.equal(okPayload.status, 'ok')
  assert.equal(okPayload.u, 1) // 2330 多頭

  // 檢查 report API 回傳內容
  const reportRes = await envOneFail.callApi('GET', '/api/ma/report')
  const reportBody = await reportRes.json()
  assert.equal(reportBody.status, 'ok')
  assert.equal(reportBody.items.length, 2)
  const item2330 = reportBody.items.find((it) => it.code === '2330')
  const item2454 = reportBody.items.find((it) => it.code === '2454')
  assert.equal(item2330.kind, 'U')
  assert.equal(item2454.failed, true)
  assert.equal(item2454.desc, lines.failedStock)
})

test('M4-S09 同一天 08:30 排程被觸發兩次只送一則推播', async () => {
  const closes60 = Array.from({ length: 60 }, (_, i) => ({
    date: '2026-10-07',
    close: 100
  }))
  const { deps, store, pushes } = setupTestEnv({
    twseMonths: {
      '2330': { '202610': closes60 }
    }
  })
  await store.addWatch({ code: '2330', name: '台積電', addedOn: '2026-10-01' })

  const ms = Date.UTC(2026, 9, 8, 0, 30, 0)
  const first = await runMaReport(deps, ms, { push: true })
  assert.equal(first.status, 'ok')
  assert.equal(pushes.length, 1)

  const second = await runMaReport(deps, ms, { push: true })
  assert.equal(second.status, 'ok')
  assert.equal(pushes.length, 1) // 仍只有 1 則
})

test('M4-S11 追蹤清單操作與驗證（加入、重複、查無、上限）', async () => {
  const { deps, store, callApi } = setupTestEnv({
    twseAll: {
      asOf: '2026-10-08',
      rows: [
        { code: '2330', name: '台積電', close: 1000 },
        { code: '2412', name: '中華電', close: 120 }
      ]
    },
    twseMonths: {
      '2412': {
        '202610': [{ date: '2026-10-08', close: 120 }]
      }
    }
  })

  // 初始加入 2330
  await store.addWatch({ code: '2330', name: '台積電', addedOn: '2026-10-01' })

  // 成功加入 2412
  const addRes = await callApi('POST', '/api/ma/watchlist', { action: 'add', code: '2412' })
  assert.equal(addRes.status, 200)
  const addBody = await addRes.json()
  assert.equal(addBody.ok, true)
  assert.deepEqual(addBody.item, { code: '2412', name: '中華電', pending: true })

  // 重複加入 2330 回 400
  const dupRes = await callApi('POST', '/api/ma/watchlist', { action: 'add', code: '2330' })
  assert.equal(dupRes.status, 400)
  const dupBody = await dupRes.json()
  assert.equal(dupBody.error, 'duplicate')

  // 查無標的 9999 回 400
  const notFoundRes = await callApi('POST', '/api/ma/watchlist', { action: 'add', code: '9999' })
  assert.equal(notFoundRes.status, 400)
  const notFoundBody = await notFoundRes.json()
  assert.equal(notFoundBody.error, 'notFound')

  // 已有 10 檔時再加回 400 limit
  for (let i = 1; i <= 8; i += 1) {
    await store.addWatch({ code: `100${i}`, name: `標的${i}`, addedOn: '2026-10-01' })
  }
  const limitRes = await callApi('POST', '/api/ma/watchlist', { action: 'add', code: '2412' })
  assert.equal(limitRes.status, 400)
  const limitBody = await limitRes.json()
  assert.equal(limitBody.error, 'duplicate') // 2412 已經在裡面了
})

test('M4-S12 停止追蹤與復原', async () => {
  const { store, callApi } = setupTestEnv()
  await store.addWatch({ code: '2603', name: '長榮', addedOn: '2026-10-01' })

  // 停止追蹤
  const untrackRes = await callApi('POST', '/api/ma/watchlist', { action: 'untrack', code: '2603' })
  assert.equal(untrackRes.status, 200)
  const watchAfterUntrack = await store.listWatch()
  assert.equal(watchAfterUntrack.find((w) => w.code === '2603')?.active, false)

  // 復原追蹤
  const restoreRes = await callApi('POST', '/api/ma/watchlist', { action: 'restore', code: '2603' })
  assert.equal(restoreRes.status, 200)
  const watchAfterRestore = await store.listWatch()
  assert.equal(watchAfterRestore.find((w) => w.code === '2603')?.active, true)
})

test('M4-S13 查詢歷史矩陣與轉換狀態', async () => {
  const { store, callApi } = setupTestEnv()
  await store.addWatch({ code: '2454', name: '聯發科', addedOn: '2026-10-01' })
  await store.addWatch({ code: '2412', name: '中華電', addedOn: '2026-10-08' })

  // 建立 7 個交易日的結果
  const dates = [
    '2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09'
  ]
  for (let i = 0; i < dates.length; i += 1) {
    const d = dates[i]
    // 2454 前 5 天為 U，第 6 天（10-08）轉為 W
    const kind = i < 5 ? 'U' : 'W'
    await store.upsertResults(d, [{ code: '2454', kind, ma: [100, 90, 80] }])
  }

  const res = await callApi('GET', '/api/ma/history')
  assert.equal(res.status, 200)
  const body = await res.json()
  assert.equal(body.kind, 'history')
  assert.equal(body.days.length, 7)

  const row2454 = body.rows.find((r) => r.code === '2454')
  assert.ok(row2454)
  // 第 6 天（index 5）由 U 轉 W，changed 應為 true，prev 應為 U
  assert.equal(row2454.cells[5].kind, 'W')
  assert.equal(row2454.cells[5].prev, 'U')
  assert.equal(row2454.cells[5].changed, true)

  const row2412 = body.rows.find((r) => r.code === '2412')
  assert.ok(row2412)
  // 2412 剛加入無歷史，每一格都是 null
  assert.ok(row2412.cells.every((c) => c.kind === null && c.prev === null && c.changed === false))
})

test('M4-S14 報告推播台詞含數字重試，失敗降級預設開場', async () => {
  const closes60 = Array.from({ length: 60 }, (_, i) => ({
    date: `2026-07-${String(i + 1).padStart(2, '0')}`,
    close: 100 + i
  }))
  closes60[closes60.length - 1].date = '2026-10-07'

  // LLM 第一次回含數字 123，第二次回無數字台詞
  const { deps, store, pushes } = setupTestEnv({
    twseMonths: {
      '2330': { '202610': closes60 }
    },
    llmReplies: ['早安今天有 3 檔均線', '[smile]主人早安均線整理好了']
  })
  await store.addWatch({ code: '2330', name: '台積電', addedOn: '2026-10-01' })

  const ms = Date.UTC(2026, 9, 8, 0, 30, 0)
  await runMaReport(deps, ms, { push: true })

  assert.equal(pushes.length, 1)
  const push = pushes[0]
  assert.equal(push.message.data.script, '[smile]主人早安均線整理好了')
  assert.match(push.message.data.text, /主人早安均線整理好了/)
  assert.match(push.message.data.text, /多頭 1、空頭 0、其他 0。/)
})

test('/api/ma/refresh 頻率限制與重算', async () => {
  const closes60 = Array.from({ length: 60 }, (_, i) => ({
    date: '2026-10-07',
    close: 100
  }))
  const { store, callApi } = setupTestEnv({
    twseMonths: {
      '2330': { '202610': closes60 }
    }
  })
  await store.addWatch({ code: '2330', name: '台積電', addedOn: '2026-10-01' })

  // 第一次 refresh 應成功
  const res1 = await callApi('POST', '/api/ma/refresh')
  assert.equal(res1.status, 200)

  // 立即第二次 refresh 應被 429 tooSoon 擋下
  const res2 = await callApi('POST', '/api/ma/refresh')
  assert.equal(res2.status, 429)
  const body2 = await res2.json()
  assert.equal(body2.error, 'tooSoon')
})

test('MA 路由端點方法限制與未知路徑保護（404 與 405）', async () => {
  const { callApi } = setupTestEnv()

  // GET /api/ma/refresh -> 405
  assert.equal((await callApi('GET', '/api/ma/refresh')).status, 405)
  // POST /api/ma/report -> 405
  assert.equal((await callApi('POST', '/api/ma/report')).status, 405)
  // POST /api/ma/history -> 405
  assert.equal((await callApi('POST', '/api/ma/history')).status, 405)
  // PUT /api/ma/watchlist -> 405
  assert.equal((await callApi('PUT', '/api/ma/watchlist')).status, 405)
  // 未知路徑 /api/ma/unknown -> 404
  assert.equal((await callApi('GET', '/api/ma/unknown')).status, 404)
})
