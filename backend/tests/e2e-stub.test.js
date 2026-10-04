// 端到端（Stub）：把 worker 的 Stub 客戶端接上 core 的串流解析器，
// 驗證「餵入固定串流片段 → 最終表情與台詞」整條路徑的行為。
// 後半段再把整條路由層接起來，驗證六種失敗各自送出正確的 fallback 事件。
// 全程不碰網路，也不載入真實的語言模型客戶端。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createParserState, feedChunk, finalize, feedAll, extractSseEvents } from '../core/stream-parser.js'
import { streamCompletion, pickScript } from '../worker/llm-client.stub.js'
import { createHandler } from '../worker/handlers.js'
import { createStore } from '../worker/store.stub.js'

// 常數定義
const readConfig = (name) => readFileSync(new URL(`../config/${name}`, import.meta.url), 'utf8')
const CONFIG = JSON.parse(readConfig('emotion-map.json'))
const FALLBACK = JSON.parse(readConfig('fallback-lines.json'))
const EMOTION_MAP = CONFIG.emotionMap
const DEFAULT_EMOTION = CONFIG.defaultEmotion
const STUB_ENV = { USE_STUB: 'true' }
const TAG_PATTERN = /\[[a-z_]+\]/g
const SECRET = 'e2e-only-secret'
const SECRET_HEADER = 'x-app-secret'
const CHAT_URL = 'http://localhost/api/chat'
const TEXT_EVENT = 'text'
const FALLBACK_EVENT = 'fallback'
const DELTA_EVENT = 'delta'
const DONE_EVENT = 'done'
const FIXED_NOW = Date.UTC(2026, 0, 15, 4, 0, 0) // 固定時間，跨日判定不隨執行時刻改變
const FIXED_DATE_KEY = '2026-01-15'

// NETWORK_GUARD：把全域的對外請求入口換成會拋錯的哨兵。
// 只要端到端流程偷偷連線，這裡就會炸開，測試也就跟著失敗。
let networkCalls = 0
const NETWORK_GUARD = () => {
  networkCalls += 1
  throw new Error('測試期間不得對外發出任何請求')
}
globalThis.fetch = NETWORK_GUARD

// 把 Stub 吐出的文字事件逐一餵進解析器，收集每一步的狀態
const runStream = async (userMessage) => {
  const messages = [
    { role: 'system', content: '（測試用系統提示詞）' },
    { role: 'user', content: userMessage }
  ]
  const timeline = []
  let state = createParserState(DEFAULT_EMOTION)
  const rawPieces = []
  for await (const event of streamCompletion(messages, STUB_ENV)) {
    if (event.type !== TEXT_EVENT) continue
    rawPieces.push(event.text)
    state = feedChunk(state, event.text, EMOTION_MAP, DEFAULT_EMOTION)
    timeline.push({ emotion: state.emotion, text: state.text })
  }
  return { rawPieces, timeline, streamed: state, final: finalize(state, DEFAULT_EMOTION) }
}

// 另一套獨立的算法：整段收完後用正規表示式剝標籤，用來對照增量解析的結果
const stripTags = (pieces) => pieces.join('').replace(TAG_PATTERN, '')

// 組出一份走 Stub 的相依；quotaConfig 與 store 可覆寫，用來驗自訂上限那條路
const buildDeps = (overrides) => ({
  emotionConfig: CONFIG,
  gapConfig: JSON.parse(readConfig('time-gap-tiers.json')),
  fallbackConfig: FALLBACK,
  quotaConfig: JSON.parse(readConfig('quota.json')),
  personaSchema: JSON.parse(readConfig('persona-schema.json')),
  personaText: readConfig('persona.md'),
  templateText: readConfig('prompt-template.md'),
  secret: SECRET,
  store: createStore({}),
  streamer: (messages) => streamCompletion(messages, STUB_ENV),
  now: () => FIXED_NOW,
  ...overrides
})

// 送一句話給指定的處理函式，並把回應的 SSE 訊框解析成事件陣列
const sendMessage = async (handle, message) => {
  const response = await handle(
    new Request(CHAT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', [SECRET_HEADER]: SECRET },
      body: JSON.stringify({ message, history: [], minutesSinceLastSeen: 0 })
    })
  )
  const parsed = extractSseEvents(await response.text())
  return { response, events: parsed.events.map((data) => JSON.parse(data)) }
}

// 一次性的送話：自己組相依、自己送一句
const runChat = async (message, overrides) => {
  const deps = buildDeps(overrides)
  const result = await sendMessage(createHandler(deps), message)
  return { ...result, deps }
}

// 取出這一輪唯一的 fallback 事件
const onlyFallback = (events) => {
  const found = events.filter((event) => event.type === FALLBACK_EVENT)
  assert.equal(found.length, 1)
  return found[0]
}

const countType = (events, type) => events.filter((event) => event.type === type).length

// 期望的台詞字串直接由設定檔算出來，測試不寫死任何台詞或表情名稱
const expectedLine = (kind) => `[${FALLBACK.lines[kind].emotion}] ${FALLBACK.lines[kind].text}`

test('端到端：早安腳本的最終表情與台詞符合預期', async () => {
  const result = await runStream('早安')
  // 期望值對應 worker/llm-client.stub.js 的固定腳本
  assert.equal(result.streamed.text, ' 早安。今天也要好好吃飯喔。')
  assert.equal(result.streamed.emotion, 'smile')
  assert.ok(Object.hasOwn(EMOTION_MAP, result.streamed.emotion))
})

test('端到端：增量解析的台詞與整段剝標籤的結果一致', async () => {
  const result = await runStream('早安')
  assert.equal(result.streamed.text, stripTags(result.rawPieces))
  assert.ok(!result.streamed.text.includes('['))
})

test('端到端：Stub 的第一個標籤確實被切成兩半跨 chunk', async () => {
  const result = await runStream('早安')
  // 第一個片段只有半截標籤，沒有閉合的方括號
  assert.ok(result.rawPieces[0].startsWith('['))
  assert.ok(!result.rawPieces[0].includes(']'))
  // 半截標籤期間不能吐出任何台詞，也不能誤判表情
  assert.equal(result.timeline[0].text, '')
  assert.equal(result.timeline[0].emotion, DEFAULT_EMOTION)
  // 第二個片段補齊標籤後，表情就要跟著換掉
  assert.notEqual(result.timeline[1].emotion, DEFAULT_EMOTION)
})

test('端到端：台詞中途換標籤時表情跟著切換', async () => {
  const result = await runStream('好想你')
  const emotions = result.timeline.map((step) => step.emotion)
  assert.notEqual(emotions[1], emotions[emotions.length - 1])
  assert.equal(result.streamed.text, stripTags(result.rawPieces))
})

test('端到端：不在對照表裡的標籤退回預設表情且不出現在台詞中', async () => {
  const result = await runStream('隨便說點什麼')
  assert.equal(result.streamed.emotion, DEFAULT_EMOTION)
  assert.ok(!result.streamed.text.includes('mystery_tag'))
  assert.ok(!result.streamed.text.includes('['))
})

test('端到端：串流結束後表情回復為預設表情', async () => {
  const result = await runStream('早安')
  assert.notEqual(result.streamed.emotion, DEFAULT_EMOTION)
  assert.equal(result.final.emotion, DEFAULT_EMOTION)
  assert.equal(result.final.text, result.streamed.text)
  assert.equal(result.final.pending, '')
})

// 表情提示的位置決定演出節奏，拿真實的 Stub 腳本再驗一次邊界。
test('端到端：表情提示的位置都落在台詞範圍內，數量與剝掉的標籤對得起來', async () => {
  const result = await runStream('好想你')
  const cues = result.streamed.cues
  assert.ok(cues.length > 0)
  cues.forEach((cue) => {
    assert.ok(Number.isInteger(cue.index))
    assert.ok(cue.index >= 0 && cue.index <= result.streamed.text.length)
  })
  // 位置必須遞增，否則逐字演出時會倒退
  const sorted = [...cues].map((cue) => cue.index).sort((left, right) => left - right)
  assert.deepEqual(cues.map((cue) => cue.index), sorted)
  // 最後一個提示的表情就是串流結束前的表情
  assert.equal(cues[cues.length - 1].emotion, result.streamed.emotion)
})

test('端到端：整段一次餵與逐字餵，表情提示完全相同（演出不隨網路快慢改變）', async () => {
  const result = await runStream('好想你')
  const whole = feedAll([result.rawPieces.join('')], EMOTION_MAP, DEFAULT_EMOTION)
  const perCharacter = feedAll([...result.rawPieces.join('')], EMOTION_MAP, DEFAULT_EMOTION)
  assert.deepEqual(whole.cues, result.streamed.cues)
  assert.deepEqual(perCharacter.cues, result.streamed.cues)
  assert.equal(perCharacter.text, result.streamed.text)
})

test('端到端：同樣輸入永遠得到同樣輸出（Stub 為決定性）', async () => {
  const first = await runStream('早安')
  const second = await runStream('早安')
  assert.deepEqual(first.rawPieces, second.rawPieces)
  assert.deepEqual(first.final, second.final)
})

test('pickScript 挑不到關鍵字時回到預設腳本', () => {
  const fallback = pickScript([{ role: 'user', content: '完全無關的內容' }])
  const matched = pickScript([{ role: 'user', content: '今天好累' }])
  assert.notDeepEqual(fallback, matched)
  assert.deepEqual(pickScript(undefined), fallback)
})

test('端到端：正常回覆不會產生 fallback 事件', async () => {
  const { events } = await runChat('早安')
  assert.equal(countType(events, FALLBACK_EVENT), 0)
  assert.ok(countType(events, DELTA_EVENT) > 0)
  assert.equal(events[events.length - 1].type, DONE_EVENT)
})

test('端到端 fallback：blocked（輸入被擋）不撤回', async () => {
  const { events } = await runChat('測試輸入阻擋')
  const fallback = onlyFallback(events)
  assert.equal(fallback.text, expectedLine('blocked'))
  // 一個字都還沒送出去，不必叫前端清畫面
  assert.equal(fallback.retract, false)
  assert.equal(countType(events, DELTA_EVENT), 0)
})

test('端到端 fallback：blocked（輸出被砍）要撤回', async () => {
  const { events } = await runChat('測試輸出阻擋')
  const fallback = onlyFallback(events)
  assert.equal(fallback.text, expectedLine('blocked'))
  // 半句話已經送到前端了，所以必須帶撤回指示
  assert.equal(fallback.retract, true)
  assert.ok(countType(events, DELTA_EVENT) > 0)
})

test('端到端 fallback：quota 不撤回', async () => {
  const { events } = await runChat('測試額度')
  const fallback = onlyFallback(events)
  assert.equal(fallback.text, expectedLine('quota'))
  assert.equal(fallback.retract, false)
})

test('端到端 fallback：upstream 不撤回', async () => {
  const { events } = await runChat('測試上游')
  const fallback = onlyFallback(events)
  assert.equal(fallback.text, expectedLine('upstream'))
  assert.equal(fallback.retract, false)
})

test('端到端 fallback：empty 不撤回', async () => {
  const { events } = await runChat('測試空回應')
  const fallback = onlyFallback(events)
  assert.equal(fallback.text, expectedLine('empty'))
  assert.equal(fallback.retract, false)
})

test('端到端 fallback：unknown 不撤回', async () => {
  const { events } = await runChat('測試未知')
  const fallback = onlyFallback(events)
  assert.equal(fallback.text, expectedLine('unknown'))
  assert.equal(fallback.retract, false)
})

test('端到端 fallback：capped 由自訂上限擋下，不撤回也不送出請求', async () => {
  const quotaConfig = { ...JSON.parse(readConfig('quota.json')), selfCap: { dailyRequests: 1 } }
  const handle = createHandler(buildDeps({ quotaConfig }))
  // 第一次正常回覆，順便把今天的計數推到上限
  await sendMessage(handle, '早安')
  const { events } = await sendMessage(handle, '早安')
  const fallback = onlyFallback(events)
  assert.equal(fallback.text, expectedLine('capped'))
  assert.equal(fallback.retract, false)
  assert.equal(countType(events, DELTA_EVENT), 0)
})

test('端到端：撞到自訂上限的那一次不得增加計數', async () => {
  const store = createStore({})
  const quotaConfig = { ...JSON.parse(readConfig('quota.json')), selfCap: { dailyRequests: 1 } }
  const handle = createHandler(buildDeps({ store, quotaConfig }))
  await sendMessage(handle, '早安')
  const afterFirst = await store.readDaily(FIXED_DATE_KEY)
  await sendMessage(handle, '早安')
  const afterCapped = await store.readDaily(FIXED_DATE_KEY)
  // 自己擋下來的請求沒有產生任何對外請求，計數不得增加，
  // 否則自訂上限會把自己越擋越死
  assert.equal(afterFirst.requests, 1)
  assert.equal(afterCapped.requests, 1)
})

test('端到端：成功的一次會記下請求數與 token 用量', async () => {
  const store = createStore({})
  await runChat('早安', { store })
  const daily = await store.readDaily(FIXED_DATE_KEY)
  assert.equal(daily.requests, 1)
  assert.ok(daily.promptTokens > 0)
  assert.ok(daily.outputTokens > 0)
})

test('端到端：失敗的那一次同樣要記下請求數', async () => {
  const store = createStore({})
  await runChat('測試額度', { store })
  const daily = await store.readDaily(FIXED_DATE_KEY)
  assert.equal(daily.requests, 1)
})

test('端到端：安全類清單以外的 finishReason 不算失敗，台詞照演', async () => {
  const { events } = await runChat('測試截斷')
  assert.equal(countType(events, FALLBACK_EVENT), 0)
  assert.ok(countType(events, DELTA_EVENT) > 0)
})

test('全程沒有任何對外請求被發出', () => {
  assert.equal(networkCalls, 0)
})
