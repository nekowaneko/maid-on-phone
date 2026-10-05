// M2 戒飲記錄路由（/api/drink/*）與每日詢問（runScheduled）的輔助測試：補規格表沒有逐一列出的邊界。
// 規格本身在 tests/spec/m2/drink.test.js，這支可以自由增修。全程走 Stub，不對外連線。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandler, runScheduled } from '../worker/handlers.js'
import { createStore } from '../worker/store.stub.js'
import { createFcmStub } from '../worker/fcm-client.stub.js'

// 常數定義
const SECRET = 'test-only-secret'
const ORIGIN = 'http://localhost'
const PARSE_PROMPT = '【輔助測試解析提示詞】'
const SCRIPT_PROMPT = '【輔助測試台詞提示詞】'
const ACCOUNT_TEXT = JSON.stringify({ project_id: 'p', client_email: 'e', private_key: 'k' })
const readText = (name) => readFileSync(new URL(`../config/${name}`, import.meta.url), 'utf8')
const readJson = (name) => JSON.parse(readText(name))
const LINES = readJson('drink-lines.json')
const DEFAULT_SETTINGS = { subscriptionName: 'Claude Pro', monthlyFee: 650, resistValue: 60, monthlyQuota: 20, askTime: '15:00' }

// 全程不得對外連線
globalThis.fetch = () => {
  throw new Error('測試期間不得對外發出任何請求')
}

// 功能函數定義

// 台北時間轉成毫秒
const tpe = (local) => Date.parse(`${local}:00+08:00`)

// 珍奶大杯半糖去冰的草稿
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

// 語言模型 Stub：依提示詞分辨解析與台詞，記下每次收到的訊息；沒有準備回覆就丟例外
const createLlm = ({ parse = [], script = [] } = {}) => {
  const queues = { parse: [...parse], script: [...script] }
  const calls = { parse: 0, script: 0 }
  const seen = { parse: [], script: [] }
  const streamer = (messages) => ({
    [Symbol.asyncIterator]: async function* () {
      const joined = messages.map((m) => String(m.content)).join('\n')
      const kind = joined.includes(PARSE_PROMPT) ? 'parse' : 'script'
      calls[kind] += 1
      seen[kind].push(joined)
      const reply = queues[kind].shift()
      if (reply === undefined) throw new Error('stub：沒有準備回覆')
      yield { type: 'text', text: reply }
      yield { type: 'usage', promptTokens: 3, outputTokens: 2 }
    }
  })
  return { streamer, calls, seen }
}

// 組出相依與時鐘；pushConfig、pusher 可以覆寫
const setup = (llmReplies = {}, extra = {}) => {
  const llm = createLlm(llmReplies)
  const fcm = createFcmStub(extra.fcmOptions)
  const clock = { now: tpe('2026-10-07T15:10') }
  let serial = 0
  const deps = {
    emotionConfig: readJson('emotion-map.json'),
    gapConfig: readJson('time-gap-tiers.json'),
    fallbackConfig: readJson('fallback-lines.json'),
    quotaConfig: readJson('quota.json'),
    personaSchema: readJson('persona-schema.json'),
    messageSchema: readJson('message.json'),
    personaText: readText('persona.md'),
    templateText: readText('prompt-template.md'),
    drinkModel: readJson('drink-model.json'),
    starbucksTable: readJson('starbucks.json'),
    drinkDefaults: readJson('drink-defaults.json'),
    drinkLines: LINES,
    drinkPrompts: { parse: PARSE_PROMPT, script: SCRIPT_PROMPT },
    secret: SECRET,
    store: createStore({}),
    streamer: llm.streamer,
    now: () => clock.now,
    pusher: (message) => fcm.sendFcm(message, ACCOUNT_TEXT),
    pushConfig: { serviceAccount: ACCOUNT_TEXT, deviceToken: 'tok' },
    randomText: () => `r${(serial += 1)}`,
    ...(extra.deps ?? {})
  }
  const handle = createHandler(deps)
  // 送一次 API 請求
  const call = async (method, path, body, headers = { 'x-app-secret': SECRET }) => {
    const init = { method, headers: { ...headers } }
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json'
      init.body = typeof body === 'string' ? body : JSON.stringify(body)
    }
    const response = await handle(new Request(`${ORIGIN}${path}`, init))
    return { status: response.status, json: await response.json() }
  }
  // 在指定的台北時間送請求
  const at = async (local, method, path, body) => {
    clock.now = tpe(local)
    return call(method, path, body)
  }
  return { deps, llm, fcm, clock, call, at }
}

test('沒帶密鑰時 /api/drink/* 一律 401，不呼叫語言模型', async () => {
  const env = setup({ parse: ['{"isDrink":true}'] })
  for (const [method, path] of [['GET', '/api/drink/stats'], ['POST', '/api/drink/parse'], ['GET', '/api/drink/export']]) {
    const res = await env.call(method, path, method === 'POST' ? { text: '喝了奶茶' } : undefined, {})
    assert.equal(res.status, 401)
  }
  assert.equal(env.llm.calls.parse, 0)
})

test('不認得的戒飲路徑回 404，方法不對回 405', async () => {
  const env = setup()
  assert.equal((await env.call('GET', '/api/drink/unknown')).status, 404)
  assert.equal((await env.call('GET', '/api/drink/')).status, 404)
  assert.equal((await env.call('GET', '/api/drink/parse')).status, 405)
  assert.equal((await env.call('POST', '/api/drink/stats', {})).status, 405)
  assert.equal((await env.call('DELETE', '/api/drink/settings')).status, 405)
  assert.equal((await env.call('GET', '/api/drink/__proto__')).status, 404)
})

test('parse 的文字 trim 後 1～200 字，否則 400 且不呼叫語言模型', async () => {
  const env = setup({ parse: ['{"isDrink":false}'] })
  for (const body of [{}, { text: '   ' }, { text: 5 }, { text: '奶'.repeat(201) }]) {
    assert.equal((await env.call('POST', '/api/drink/parse', body)).status, 400)
  }
  assert.equal((await env.call('POST', '/api/drink/parse', '不是 JSON')).status, 400)
  assert.equal(env.llm.calls.parse, 0)
  const ok = await env.call('POST', '/api/drink/parse', { text: ` ${'奶'.repeat(200)} ` })
  assert.equal(ok.status, 200)
  assert.equal(env.llm.calls.parse, 1)
})

test('parse 的訊息含解析提示詞與全部編號、使用者說的話；台詞的訊息含人設與數字', async () => {
  const env = setup({ parse: [JSON.stringify({ isDrink: true, baseId: 'milktea', sizeId: 'L', sugarLevelId: 'half', toppingIds: ['boba'] })] })
  await env.call('POST', '/api/drink/parse', { text: '珍奶半糖' })
  const parseText = env.llm.seen.parse[0]
  for (const word of ['珍奶半糖', 'milktea', 'quarter', 'hot', 'agar', 'sb_black_tea_latte_grande']) assert.ok(parseText.includes(word))
  assert.equal(parseText.includes(SCRIPT_PROMPT), false)
  const scriptText = env.llm.seen.script[0]
  assert.ok(scriptText.includes('白色短髮')) // persona.md 的內容
  assert.ok(scriptText.includes('450'))
  assert.ok(scriptText.includes('[pout]'))
  assert.equal(scriptText.includes(PARSE_PROMPT), false)
})

test('語言模型的回覆不是 JSON、或語言模型失敗時回 other（notUnderstood），不寫入', async () => {
  const bad = setup({ parse: ['我不知道'] })
  const res = await bad.call('POST', '/api/drink/parse', { text: '嗯' })
  assert.equal(res.json.kind, 'other')
  assert.equal(res.json.script, LINES.notUnderstood[0])
  assert.equal(bad.llm.calls.script, 0)
  const failed = setup()
  const res2 = await failed.call('POST', '/api/drink/parse', { text: '嗯' })
  assert.equal(res2.json.kind, 'other')
  assert.equal(res2.json.text, '嗯……我沒聽懂，可以再說一次嗎？')
})

test('跟飲料無關時用人設回一句；台詞有數字就重試，仍有數字改用 notDrink', async () => {
  const good = setup({ parse: ['{"isDrink":false}'], script: ['[smile]嗯，主人今天辛苦了。'] })
  const res = await good.call('POST', '/api/drink/parse', { text: '今天好累' })
  assert.equal(res.json.kind, 'other')
  assert.equal(res.json.script, '[smile]嗯，主人今天辛苦了。')
  assert.equal(res.json.text, '嗯，主人今天辛苦了。')
  assert.ok(good.llm.seen.script[0].includes('今天好累'))
  const digits = setup({ parse: ['{"isDrink":"true"}'], script: ['[smile]3 點了', '[smile]4 點了'] })
  const res2 = await digits.call('POST', '/api/drink/parse', { text: '幾點了' })
  assert.equal(res2.json.kind, 'other')
  assert.equal(digits.llm.calls.script, 2)
  assert.equal(res2.json.script, LINES.notDrink[0])
})

test('用量到頂時 parse 回 other（capped 台詞），不呼叫語言模型', async () => {
  const env = setup({ parse: ['{"isDrink":true}'] })
  for (let i = 0; i < 200; i += 1) await env.deps.store.recordRequest('2026-10-07', i)
  const res = await env.call('POST', '/api/drink/parse', { text: '喝了奶茶' })
  assert.equal(res.json.kind, 'other')
  assert.ok(res.json.text.startsWith('真拿主人沒辦法'))
  assert.equal(env.llm.calls.parse, 0)
})

test('用量到頂時 preview 不呼叫語言模型，直接用預設台詞', async () => {
  const env = setup({ script: ['[smile]約 450 大卡'] })
  for (let i = 0; i < 200; i += 1) await env.deps.store.recordRequest('2026-10-07', i)
  const res = await env.call('POST', '/api/drink/preview', { draft: bobaDraft() })
  assert.equal(res.json.kind, 'confirm')
  assert.equal(env.llm.calls.script, 0)
  assert.ok(res.json.script.startsWith('[pout]珍珠奶茶、大杯、半糖、去冰'))
})

test('每次語言模型呼叫都記入用量（含失敗）', async () => {
  const env = setup({ parse: [JSON.stringify({ isDrink: true, baseId: 'tea', sizeId: 'L', sugarLevelId: 'full' })], script: ['[smile]500 大卡'] })
  await env.call('POST', '/api/drink/parse', { text: '綠茶' })
  const daily = await env.deps.store.readDaily('2026-10-07')
  assert.equal(daily.requests, 3) // 解析 1 次＋台詞 2 次（第二次失敗）
  assert.equal(daily.promptTokens, 6)
})

test('語言模型的台詞數字正確就採用；assumed 的說明接在最後；沒有標籤補 [pout]', async () => {
  const env = setup({ script: ['綠茶大杯全糖，約 250 大卡。'] })
  const res = await env.call('POST', '/api/drink/preview', { draft: { baseId: 'tea' } })
  assert.equal(res.json.kind, 'confirm')
  assert.equal(res.json.script, `[pout]綠茶大杯全糖，約 250 大卡。${LINES.labels.assumedSize}${LINES.labels.assumedSugar}`)
  assert.equal(res.json.text, `綠茶大杯全糖，約 250 大卡。${LINES.labels.assumedSize}${LINES.labels.assumedSugar}`)
  assert.equal(res.json.draft.name, '純茶（紅/綠/青/烏龍）')
})

test('台詞過長或只有標籤時當作不通過', async () => {
  const env = setup({ script: [`[smile]${'約'.repeat(200)} 450 大卡`, '[smile]'] })
  const res = await env.call('POST', '/api/drink/preview', { draft: bobaDraft() })
  assert.equal(env.llm.calls.script, 2)
  assert.equal(res.json.script, '[pout]珍珠奶茶、大杯、半糖、去冰，大約 450 大卡。[shy]……要我幫主人記下來嗎？')
})

test('有價格時台詞必須含價格，預設台詞用 confirmWithPrice', async () => {
  const env = setup({ script: ['[smile]約 450 大卡', '[smile]約 450 大卡'] })
  const res = await env.call('POST', '/api/drink/preview', { draft: bobaDraft({ price: 65 }) })
  assert.equal(env.llm.calls.script, 2)
  assert.ok(res.json.script.includes('65 元'))
  assert.ok(res.json.script.includes('450'))
  const ok = setup({ script: ['[smile]65 元，約 450 大卡'] })
  assert.equal((await ok.call('POST', '/api/drink/preview', { draft: bobaDraft({ price: 65 }) })).json.script, '[smile]65 元，約 450 大卡')
})

test('preview 與 confirm 缺 draft 時 400，不寫入', async () => {
  const env = setup()
  for (const path of ['/api/drink/preview', '/api/drink/confirm']) {
    assert.equal((await env.call('POST', path, {})).status, 400)
    assert.equal((await env.call('POST', path, { draft: [] })).status, 400)
  }
  assert.equal((await env.call('GET', '/api/drink/stats')).json.monthCups, 0)
})

test('confirm 不採用 App 送來的熱量，以 Worker 重算的值寫入；草稿驗不過回 choose 不寫入', async () => {
  const env = setup()
  const saved = await env.call('POST', '/api/drink/confirm', { draft: { ...bobaDraft(), kcal: 1 }, kcal: 1 })
  assert.equal(saved.json.kind, 'saved')
  assert.equal(saved.json.logId, `d-${tpe('2026-10-07T15:10')}-r1`)
  const exported = await env.call('GET', '/api/drink/export')
  assert.equal(exported.json.logs[0].kcal, 450)
  const bad = await env.call('POST', '/api/drink/confirm', { draft: bobaDraft({ baseId: 'coffee' }) })
  assert.equal(bad.json.kind, 'choose')
  assert.equal(bad.json.field, 'base')
  assert.equal((await env.call('GET', '/api/drink/export')).json.logs.length, 1)
})

test('confirm 寫入價格，匯出時帶出；choose 的台詞不含數字', async () => {
  const env = setup()
  await env.call('POST', '/api/drink/confirm', { draft: bobaDraft({ price: 65, iceId: 'less' }) })
  const log = (await env.call('GET', '/api/drink/export')).json.logs[0]
  assert.equal(log.price, 65)
  assert.equal(log.ice, 'less')
  const choose = await env.call('POST', '/api/drink/preview', { draft: bobaDraft({ sizeId: 'XXL' }) })
  assert.equal(choose.json.field, 'size')
  assert.equal(/\d/.test(choose.json.script), false)
})

test('撤銷：缺 logId 400；不存在回 already；7 天界線；撤銷後同時段可以再按沒喝', async () => {
  const env = setup()
  assert.equal((await env.call('POST', '/api/drink/undo', {})).status, 400)
  assert.equal((await env.call('POST', '/api/drink/undo', { logId: 5 })).status, 400)
  const missing = await env.call('POST', '/api/drink/undo', { logId: 'd-0-none' })
  assert.equal(missing.json.kind, 'already')
  assert.equal(missing.json.script, LINES.cannotUndo[0])
  const oldOne = await env.at('2026-09-30T15:00', 'POST', '/api/drink/confirm', { draft: bobaDraft() })
  const edge = await env.at('2026-10-01T15:00', 'POST', '/api/drink/confirm', { draft: bobaDraft() })
  assert.equal((await env.at('2026-10-07T23:59', 'POST', '/api/drink/undo', { logId: oldOne.json.logId })).json.kind, 'already')
  const undone = await env.at('2026-10-07T23:59', 'POST', '/api/drink/undo', { logId: edge.json.logId })
  assert.equal(undone.json.kind, 'undone')
  assert.equal(undone.json.stats.monthCups, 0)
  assert.ok(undone.json.script.includes('本週喝了 0 杯'))

  const resist = await env.at('2026-10-07T15:10', 'POST', '/api/drink/resist', {})
  assert.equal((await env.at('2026-10-07T15:20', 'POST', '/api/drink/resist', {})).json.kind, 'already')
  await env.at('2026-10-07T15:21', 'POST', '/api/drink/undo', { logId: resist.json.logId })
  assert.equal((await env.at('2026-10-07T15:22', 'POST', '/api/drink/resist', {})).json.kind, 'saved')
})

test('already 的回應只有 kind、script、text', async () => {
  const env = setup()
  await env.call('POST', '/api/drink/resist', {})
  const again = await env.call('POST', '/api/drink/resist', {})
  assert.deepEqual(Object.keys(again.json).sort(), ['kind', 'script', 'text'])
  assert.equal(again.json.script, LINES.already[0])
  assert.equal(again.json.text, '今天已經記過了啦，不用再按一次。')
})

test('設定：數字欄位要是整數型別；名稱 trim 後存；多餘欄位不存；存壞的值退回預設', async () => {
  const env = setup()
  const asText = await env.call('PUT', '/api/drink/settings', { ...DEFAULT_SETTINGS, monthlyFee: '300' })
  assert.equal(asText.status, 400)
  assert.equal(asText.json.error, '設定值不正確：月費')
  const missing = await env.call('PUT', '/api/drink/settings', { subscriptionName: 'X' })
  assert.equal(missing.json.error, '設定值不正確：月費')
  assert.equal((await env.call('PUT', '/api/drink/settings', '壞掉')).json.error, '設定值不正確：訂閱名稱')
  const good = await env.call('PUT', '/api/drink/settings', { ...DEFAULT_SETTINGS, subscriptionName: '  Netflix  ', askTime: '09:00', extra: 1 })
  assert.equal(good.status, 200)
  assert.deepEqual(good.json, { ...DEFAULT_SETTINGS, subscriptionName: 'Netflix', askTime: '09:00' })
  assert.equal(await env.deps.store.readSetting('drink.extra'), null)
  await env.deps.store.writeSetting('drink.monthlyFee', '壞掉')
  await env.deps.store.writeSetting('drink.askTime', '9:30')
  const read = await env.call('GET', '/api/drink/settings')
  assert.equal(read.json.monthlyFee, 650)
  assert.equal(read.json.askTime, '15:00')
  assert.equal(read.json.subscriptionName, 'Netflix')
})

test('匯出：沒有紀錄時 logs 為空陣列、lastSeenMonth 為空字串，設定改過就帶改過的值', async () => {
  const env = setup()
  await env.call('PUT', '/api/drink/settings', { ...DEFAULT_SETTINGS, monthlyFee: 300, resistValue: 50, monthlyQuota: 10 })
  const res = await env.call('GET', '/api/drink/export')
  assert.deepEqual(res.json, {
    subscription: { name: 'Claude Pro', monthlyFee: 300 },
    monthlyQuota: 10,
    resistValue: 50,
    drinks: readJson('drink-defaults.json').drinks,
    lastSeenMonth: '',
    logs: []
  })
})

test('每日詢問：推播未設定不送也不記 askedOn', async () => {
  const env = setup({}, { deps: { pushConfig: { serviceAccount: ACCOUNT_TEXT, deviceToken: '' } } })
  await runScheduled(env.deps, tpe('2026-10-07T15:00'))
  assert.equal(env.fcm.sent.length, 0)
  assert.equal(await env.deps.store.readSetting('drink.askedOn'), null)
  assert.equal(env.llm.calls.script, 0)
})

test('每日詢問：推播失敗不寫 askedOn；下一小時不補送', async () => {
  const env = setup({}, { fcmOptions: { fail: true } })
  await runScheduled(env.deps, tpe('2026-10-07T15:00'))
  assert.equal(env.fcm.callCount(), 1)
  assert.equal(await env.deps.store.readSetting('drink.askedOn'), null)
  await runScheduled(env.deps, tpe('2026-10-07T16:00'))
  assert.equal(env.fcm.callCount(), 1)
})

test('每日詢問：推播編號、按鈕、採用語言模型的詢問台詞，並寫入 askedOn', async () => {
  const env = setup({ script: ['[pout]今天有喝飲料嗎？'] })
  await runScheduled(env.deps, tpe('2026-10-07T15:00'))
  const message = env.fcm.sent[0].message
  assert.equal(message.token, 'tok')
  assert.deepEqual(message.data, { id: 'drink-question-2026-10-07', text: '今天有喝飲料嗎？', script: '[pout]今天有喝飲料嗎？', actions: 'resist,speak' })
  assert.equal(await env.deps.store.readSetting('drink.askedOn'), '2026-10-07')
})

test('每日詢問：台詞有數字改用預設台詞；沒有標籤補 [pout]', async () => {
  const withDigits = setup({ script: ['[pout]3 點了', '[pout]4 點了'] })
  await runScheduled(withDigits.deps, tpe('2026-10-07T15:00'))
  assert.equal(withDigits.fcm.sent[0].message.data.script, LINES.ask[0])
  const noTag = setup({ script: ['今天有喝飲料嗎？'] })
  await runScheduled(noTag.deps, tpe('2026-10-07T15:00'))
  assert.equal(noTag.fcm.sent[0].message.data.script, '[pout]今天有喝飲料嗎？')
})

test('每日詢問：依設定的時間；撤銷過的紀錄不算已記過；儲存層出錯不丟例外', async () => {
  const env = setup()
  await env.call('PUT', '/api/drink/settings', { ...DEFAULT_SETTINGS, askTime: '09:00' })
  await runScheduled(env.deps, tpe('2026-10-07T15:00'))
  assert.equal(env.fcm.sent.length, 0)
  const resist = await env.at('2026-10-07T08:00', 'POST', '/api/drink/resist', {})
  await env.at('2026-10-07T08:01', 'POST', '/api/drink/undo', { logId: resist.json.logId })
  await runScheduled(env.deps, tpe('2026-10-07T09:00'))
  assert.equal(env.fcm.sent.length, 1)

  const broken = setup({}, { deps: { store: { readSetting: async () => { throw new Error('壞了') } } } })
  await assert.doesNotReject(runScheduled(broken.deps, tpe('2026-10-07T15:00')))
  assert.equal(broken.fcm.sent.length, 0)
})
