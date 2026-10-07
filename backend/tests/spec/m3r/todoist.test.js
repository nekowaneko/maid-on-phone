// M3 第二輪規格範例表（docs/M3R-EXPENSIVE-PLAN.md §4.5）中 Worker 的各列，凍結後不得修改。
// 相依全部走 Stub：儲存層用 store.stub.js、推播用 fcm-client.stub.js、Todoist 用 todoist-client.stub.js，
// 語言模型由這支測試給定固定回覆（靠提示詞全文分辨拆步驟與提醒台詞，計畫書 §4.2），全程不得對外連線。
// 沒有準備回覆時語言模型一律失敗，Worker 改用 todoist-lines.json 的預設台詞。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createHandler, runScheduled } from '../../../worker/handlers.js'
import { createStore } from '../../../worker/store.stub.js'
import { createFcmStub } from '../../../worker/fcm-client.stub.js'
import { createTodoistStub } from '../../../worker/todoist-client.stub.js'
import { createTodoistClient } from '../../../worker/todoist-client.js'

// 常數定義
const SECRET = 'test-only-secret'
const SECRET_HEADER = 'x-app-secret'
const ORIGIN = 'http://localhost'
const ACTION_PATH = '/api/todoist/action'
const SPLIT_PROMPT = '【測試用拆步驟提示詞 SPLIT_MARK】'
const SCRIPT_PROMPT = '【測試用提醒台詞提示詞 REMIND_MARK】'
const DRINK_PARSE_PROMPT = '【測試用解析提示詞 PARSE_MARK】'
const DRINK_SCRIPT_PROMPT = '【測試用台詞提示詞 SCRIPT_MARK】'
const DEVICE_TOKEN = 'test-only-device-token'
const SERVICE_ACCOUNT = JSON.stringify({
  project_id: 'test-only-project',
  client_email: 'test-only@test-only-project.iam.gserviceaccount.example',
  private_key: 'test-only-private-key'
})
const DAY_MS = 24 * 60 * 60 * 1000
const readConfig = (name) => readFileSync(new URL(`../../../config/${name}`, import.meta.url), 'utf8')
const TODOIST_DEFAULTS = JSON.parse(readConfig('todoist-defaults.json'))
const TODOIST_LINES = JSON.parse(readConfig('todoist-lines.json'))

// 全程不該碰到網路
globalThis.fetch = () => {
  throw new Error('測試期間不得對外發出任何請求')
}

// 功能函數定義

// 台北時間轉成毫秒，例如 tpe('2026-10-07T09:00')
const tpe = (local) => Date.parse(`${local}:00+08:00`)

// 2026-10-07 09:00（台北）往前 n 天的 ISO 時間
const daysAgo = (n) => new Date(tpe('2026-10-07T09:00') - n * DAY_MS).toISOString()

// 一件 Todoist 任務（API v1 的欄位；P2 的 priority 是 3、P3 是 2）
const task = (id, content, priority, { updated = daysAgo(1), added = daysAgo(60), due = null, parent = null } = {}) => ({
  id,
  content,
  priority,
  updated_at: updated,
  added_at: added,
  due: due === null ? null : { date: due, string: due, lang: 'zh', is_recurring: false, timezone: null },
  parent_id: parent
})

// 語言模型的 Stub：依提示詞分辨拆步驟與提醒台詞，各自依序取準備好的回覆；沒有準備就丟例外
const createLlm = ({ split = [], script = [] } = {}) => {
  const queues = { split: [...split], script: [...script] }
  const calls = { split: 0, script: 0 }
  const streamer = (messages) => ({
    [Symbol.asyncIterator]: async function* () {
      const joined = messages.map((m) => String(m.content)).join('\n')
      const isSplit = joined.includes(SPLIT_PROMPT) && !joined.includes(SCRIPT_PROMPT)
      const isScript = joined.includes(SCRIPT_PROMPT) && !joined.includes(SPLIT_PROMPT)
      if (!isSplit && !isScript) throw new Error('stub：不是 Todoist 的呼叫')
      const kind = isSplit ? 'split' : 'script'
      calls[kind] += 1
      const reply = queues[kind].shift()
      if (reply === undefined) throw new Error('stub：沒有準備回覆')
      yield { type: 'text', text: reply }
    }
  })
  return { streamer, calls }
}

// 組出一份完整的相依；todoist 為 null 表示沒有設定權杖
const setup = ({ tasks = [], fail = false, llm: llmReplies = {}, noToken = false } = {}) => {
  const llm = createLlm(llmReplies)
  const fcm = createFcmStub()
  const todoist = noToken ? null : createTodoistStub({ tasks, fail })
  const clock = { now: tpe('2026-10-07T12:00') }
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
    todoistPrompts: { split: SPLIT_PROMPT, script: SCRIPT_PROMPT },
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
  // 在指定的台北時間按一顆 Todoist 按鈕
  const act = async (local, body) => {
    clock.now = tpe(local)
    return call('POST', ACTION_PATH, body)
  }
  // 在指定的台北時間跑一次排程
  const run = async (local) => {
    clock.now = tpe(local)
    await runScheduled(deps, tpe(local))
  }
  return { deps, llm, fcm, todoist, clock, call, act, run }
}

// 第 i 則推播的 data
const pushData = (env, i) => env.fcm.sent[i].message.data

// 第 i 則推播的 todoist 欄位（JSON 字串）解析後的物件
const pushTodoist = (env, i) => JSON.parse(pushData(env, i).todoist)

// stub 記錄的寫入動作
const writes = (env) => env.todoist.calls.map((c) => ({ ...c }))

// P2 掃描用的一組任務
const p2Tasks = () => [
  task('A01', '教師證加科登記', 3, { updated: daysAgo(30) }),
  task('B01', '延長修業年限申請', 3, { updated: daysAgo(20) }),
  task('C01', '準備明年的課程', 3, { updated: daysAgo(10) }),
  task('D01', '繳學費', 4, { updated: daysAgo(60) }),
  task('E01', '影印成績單', 3, { updated: daysAgo(60), parent: 'A01' })
]

// 把戒飲每日詢問時間改成指定整點
const setAskTime = async (env, askTime) => {
  const current = (await env.call('GET', '/api/drink/settings')).json
  const res = await env.call('PUT', '/api/drink/settings', { ...current, askTime })
  assert.equal(res.status, 200)
}

test('M3R-S01 P2 掃描只提擱置最久、不是子任務的那件 P2', async () => {
  const env = setup({ tasks: p2Tasks() })
  await env.run('2026-10-07T09:00')
  assert.equal(env.fcm.sent.length, 1)
  const data = pushData(env, 0)
  assert.equal(data.id, 'todoist-p2-A01-20261007')
  assert.deepEqual(pushTodoist(env, 0), { view: 'p2', taskId: 'A01', content: '教師證加科登記' })
  assert.ok(data.text.includes('教師證加科登記'))
  assert.ok(/^\[[^\]]+\]/.test(data.script))
  assert.ok(!data.text.includes('['))
  assert.deepEqual(writes(env), [])
})

test('M3R-S02 P2 每 7 天最多提一件', async () => {
  const env = setup({ tasks: p2Tasks() })
  await env.deps.store.writeSetting('todoist.p2SentOn', '2026-10-03')
  await env.run('2026-10-07T09:00')
  await env.run('2026-10-09T09:00')
  assert.equal(env.fcm.sent.length, 0)
  await env.run('2026-10-10T09:00')
  assert.equal(env.fcm.sent.length, 1)
  assert.equal(await env.deps.store.readSetting('todoist.p2SentOn'), '2026-10-10')
})

test('M3R-S03 延後一週不寫 Todoist，7 天內改提別件，第 7 天又可以提', async () => {
  const env = setup({ tasks: p2Tasks() })
  const res = await env.act('2026-10-07T12:00', { action: 'snooze', taskId: 'A01' })
  assert.equal(res.status, 200)
  assert.equal(res.json.kind, 'done')
  assert.ok(res.json.text.length > 0)
  assert.deepEqual(writes(env), [])
  await env.run('2026-10-13T09:00')
  assert.equal(env.fcm.sent.length, 1)
  assert.equal(pushTodoist(env, 0).taskId, 'B01')
  await env.deps.store.deleteSetting('todoist.p2SentOn') // 假設這段期間沒有送過其他 P2
  await env.run('2026-10-14T09:00')
  assert.equal(env.fcm.sent.length, 2)
  assert.equal(pushTodoist(env, 1).taskId, 'A01')
})

test('M3R-S04 今天推進一小步把到期日改成今天', async () => {
  const env = setup({ tasks: p2Tasks() })
  const res = await env.act('2026-10-07T12:00', { action: 'doToday', taskId: 'A01', view: 'p2' })
  assert.equal(res.status, 200)
  assert.equal(res.json.kind, 'done')
  assert.deepEqual(writes(env), [{ method: 'updateDue', id: 'A01', dateKey: '2026-10-07' }])
  assert.equal(await env.deps.store.readSetting('todoist.doToday'), null)
})

test('M3R-S05 拆成小步驟回傳 2～3 步且不寫 Todoist；步數不合重試一次後回 failed', async () => {
  const good = setup({
    tasks: p2Tasks(),
    llm: { split: ['好的 {"steps":["列出需要的文件","上網預約","到現場辦理"]}'] }
  })
  const res = await good.act('2026-10-07T12:00', { action: 'split', taskId: 'A01', content: '教師證加科登記' })
  assert.equal(res.status, 200)
  assert.equal(res.json.kind, 'split')
  assert.equal(res.json.taskId, 'A01')
  assert.deepEqual(res.json.steps, ['列出需要的文件', '上網預約', '到現場辦理'])
  for (const step of res.json.steps) assert.ok(res.json.text.includes(step))
  assert.deepEqual(writes(good), [])

  const bad = setup({
    tasks: p2Tasks(),
    llm: { split: ['{"steps":["只有一步"]}', '{"steps":["還是只有一步"]}'] }
  })
  const res2 = await bad.act('2026-10-07T12:00', { action: 'split', taskId: 'A01', content: '教師證加科登記' })
  assert.equal(res2.status, 200)
  assert.equal(res2.json.kind, 'failed')
  assert.equal(bad.llm.calls.split, 2)
  assert.deepEqual(writes(bad), [])
})

test('M3R-S06 確認後依序建立子任務；步驟或動作不合回 400 且不寫入', async () => {
  const env = setup({ tasks: p2Tasks() })
  const steps = ['列出需要的文件', '上網預約', '到現場辦理']
  const res = await env.act('2026-10-07T12:00', { action: 'confirmSplit', taskId: 'A01', steps })
  assert.equal(res.status, 200)
  assert.equal(res.json.kind, 'done')
  assert.deepEqual(
    writes(env),
    steps.map((content) => ({ method: 'addSubtask', parentId: 'A01', content }))
  )

  const other = setup({ tasks: p2Tasks() })
  const tooMany = await other.act('2026-10-07T12:00', { action: 'confirmSplit', taskId: 'A01', steps: ['一', '二', '三', '四'] })
  assert.equal(tooMany.status, 400)
  const blank = await other.act('2026-10-07T12:00', { action: 'confirmSplit', taskId: 'A01', steps: ['一', '  '] })
  assert.equal(blank.status, 400)
  const oldName = await other.act('2026-10-07T12:00', { action: 'confirm_split', taskId: 'A01', steps })
  assert.equal(oldName.status, 400)
  const badId = await other.act('2026-10-07T12:00', { action: 'snooze', taskId: 'A0"1' })
  assert.equal(badId.status, 400)
  assert.deepEqual(writes(other), [])
  assert.equal(other.llm.calls.split + other.llm.calls.script, 0)
})

test('M3R-S07 P3 到期當天 08:30 提醒，同一個到期日只提一次', async () => {
  const env = setup({
    tasks: [task('X01', '確認畢業時辰', 2, { due: '2026-10-07' }), task('Y01', '領畢業證書', 2, { due: '2026-10-09' })]
  })
  await env.run('2026-10-07T08:30')
  assert.equal(env.fcm.sent.length, 1)
  assert.equal(pushData(env, 0).id, 'todoist-p3-X01-20261007')
  assert.deepEqual(pushTodoist(env, 0), { view: 'p3', taskId: 'X01', content: '確認畢業時辰' })
  assert.ok(pushData(env, 0).text.includes('確認畢業時辰'))
  await env.run('2026-10-08T08:30')
  assert.equal(env.fcm.sent.length, 1)
  await env.run('2026-10-09T08:30')
  assert.equal(env.fcm.sent.length, 2)
  assert.equal(pushTodoist(env, 1).taskId, 'Y01')
})

test('M3R-S08 明天再提醒把到期日改成明天，隔天再提一次', async () => {
  const env = setup({ tasks: [task('X01', '確認畢業時辰', 2, { due: '2026-10-07' })] })
  await env.run('2026-10-07T08:30')
  const res = await env.act('2026-10-07T12:00', { action: 'tomorrow', taskId: 'X01' })
  assert.equal(res.status, 200)
  assert.equal(res.json.kind, 'done')
  assert.deepEqual(writes(env), [{ method: 'updateDue', id: 'X01', dateKey: '2026-10-08' }])
  await env.run('2026-10-08T08:30')
  assert.equal(env.fcm.sent.length, 2)
  assert.deepEqual(pushTodoist(env, 1), { view: 'p3', taskId: 'X01', content: '確認畢業時辰' })
})

test('M3R-S09 沒有日期的 P3 只問一次；當天有到期的 P3 時先提到期的', async () => {
  const env = setup({ tasks: [task('Z01', '寄回校友問卷', 2)] })
  await env.run('2026-10-07T08:30')
  assert.equal(env.fcm.sent.length, 1)
  assert.equal(pushData(env, 0).id, 'todoist-askDate-Z01-20261007')
  assert.deepEqual(pushTodoist(env, 0), { view: 'askDate', taskId: 'Z01', content: '寄回校友問卷' })
  await env.run('2026-10-08T08:30')
  assert.equal(env.fcm.sent.length, 1)

  const both = setup({
    tasks: [task('Z01', '寄回校友問卷', 2), task('X01', '確認畢業時辰', 2, { due: '2026-10-07' })]
  })
  await both.run('2026-10-07T08:30')
  assert.equal(both.fcm.sent.length, 1)
  assert.equal(pushTodoist(both, 0).taskId, 'X01')
  await both.run('2026-10-08T08:30')
  assert.equal(both.fcm.sent.length, 2)
  assert.equal(pushTodoist(both, 1).view, 'askDate')
  assert.equal(pushTodoist(both, 1).taskId, 'Z01')
})

test('M3R-S10 回答日期依按鈕寫入到期日，不知道不寫入', async () => {
  const env = setup({ tasks: [task('Z01', '寄回校友問卷', 2)] })
  for (const when of ['tomorrow', 'nextMonday', 'nextMonth']) {
    const res = await env.act('2026-10-07T12:00', { action: 'setDate', taskId: 'Z01', when })
    assert.equal(res.status, 200)
    assert.equal(res.json.kind, 'done')
  }
  const unknown = await env.act('2026-10-07T12:00', { action: 'unknownDate', taskId: 'Z01' })
  assert.equal(unknown.status, 200)
  assert.equal(unknown.json.kind, 'done')
  const monday = await env.act('2026-10-12T12:00', { action: 'setDate', taskId: 'Z01', when: 'nextMonday' })
  assert.equal(monday.json.kind, 'done')
  assert.deepEqual(writes(env), [
    { method: 'updateDue', id: 'Z01', dateKey: '2026-10-08' },
    { method: 'updateDue', id: 'Z01', dateKey: '2026-10-12' },
    { method: 'updateDue', id: 'Z01', dateKey: '2026-11-01' },
    { method: 'updateDue', id: 'Z01', dateKey: '2026-10-19' }
  ])
  const badWhen = await env.act('2026-10-07T12:00', { action: 'setDate', taskId: 'Z01', when: 'nextYear' })
  assert.equal(badWhen.status, 400)
})

test('M3R-S11 今天做到 21:00 還沒完成才追問，追問沒有按鈕', async () => {
  const open = setup({ tasks: [task('X01', '確認畢業時辰', 2, { due: '2026-10-07' })] })
  await open.act('2026-10-07T10:00', { action: 'doToday', taskId: 'X01', view: 'p3' })
  assert.deepEqual(writes(open), [{ method: 'updateDue', id: 'X01', dateKey: '2026-10-07' }])
  await open.run('2026-10-07T21:00')
  assert.equal(open.fcm.sent.length, 1)
  const data = pushData(open, 0)
  assert.equal(data.id, 'todoist-night-X01-20261007')
  assert.equal(data.todoist, undefined)
  assert.ok(data.text.includes('確認畢業時辰'))

  const finished = setup({ tasks: [task('X01', '確認畢業時辰', 2, { due: '2026-10-07' })] })
  await finished.act('2026-10-07T10:00', { action: 'doToday', taskId: 'X01', view: 'p3' })
  finished.todoist.remove('X01') // 使用者在 Todoist 完成了這件
  await finished.run('2026-10-07T21:00')
  assert.equal(finished.fcm.sent.length, 0)

  const yesterday = setup({ tasks: [task('X01', '確認畢業時辰', 2, { due: '2026-10-07' })] })
  await yesterday.act('2026-10-06T10:00', { action: 'doToday', taskId: 'X01', view: 'p3' })
  await yesterday.run('2026-10-07T21:00')
  assert.equal(yesterday.fcm.sent.length, 0)
})

test('M3R-S12 同一天最多一則 P3、一則 P2；08:30 不補送整點的戒飲詢問', async () => {
  const env = setup({
    tasks: [
      ...p2Tasks(),
      task('X01', '確認畢業時辰', 2, { due: '2026-10-07' }),
      task('W01', '預約學位服', 2, { due: '2026-10-07' })
    ]
  })
  await setAskTime(env, '08:00')
  await env.run('2026-10-07T08:30')
  await env.run('2026-10-07T08:30')
  assert.equal(env.fcm.sent.length, 1)
  assert.equal(pushTodoist(env, 0).view, 'p3')
  await env.run('2026-10-07T09:00')
  await env.run('2026-10-07T09:00')
  assert.equal(env.fcm.sent.length, 2)
  assert.equal(pushTodoist(env, 1).view, 'p2')
})

test('M3R-S13 Todoist 出錯或沒有權杖時不送、不記錄、不中斷戒飲詢問，按鈕回 failed', async () => {
  const env = setup({ tasks: p2Tasks(), fail: true })
  await setAskTime(env, '09:00')
  await env.run('2026-10-07T09:00')
  assert.equal(env.fcm.sent.length, 1)
  assert.equal(pushData(env, 0).actions, 'resist,speak')
  assert.equal(await env.deps.store.readSetting('todoist.p2SentOn'), null)
  await env.run('2026-10-07T08:30')
  assert.equal(env.fcm.sent.length, 1)
  assert.equal(await env.deps.store.readSetting('todoist.p3SentOn'), null)
  const res = await env.act('2026-10-07T12:00', { action: 'doToday', taskId: 'A01', view: 'p2' })
  assert.equal(res.status, 200)
  assert.equal(res.json.kind, 'failed')
  assert.ok(res.json.text.length > 0)

  const noToken = setup({ noToken: true })
  await noToken.run('2026-10-07T08:30')
  await noToken.run('2026-10-07T09:00')
  await noToken.run('2026-10-07T21:00')
  assert.equal(noToken.fcm.sent.length, 0)
  const res2 = await noToken.act('2026-10-07T12:00', { action: 'tomorrow', taskId: 'X01' })
  assert.equal(res2.status, 200)
  assert.equal(res2.json.kind, 'failed')
})

test('M3R-S14 Todoist 用戶端翻頁、帶權杖、改到期日、建子任務、查不到回 null', async () => {
  const requests = []
  const pages = {
    first: { results: [task('A01', '教師證加科登記', 3)], next_cursor: 'c2' },
    second: { results: [task('B01', '延長修業年限申請', 3)], next_cursor: null }
  }
  // 假的連線：依網址回固定內容，並記下每一次請求
  const fakeFetch = async (url, init = {}) => {
    const u = new URL(String(url))
    const body = init.body === undefined ? null : JSON.parse(init.body)
    requests.push({ u, method: (init.method ?? 'GET').toUpperCase(), auth: new Headers(init.headers).get('authorization'), body })
    const json = (status, payload) => new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } })
    if (u.pathname === '/api/v1/tasks' && (init.method ?? 'GET').toUpperCase() === 'GET') {
      return json(200, u.searchParams.get('cursor') === 'c2' ? pages.second : pages.first)
    }
    if (u.pathname === '/api/v1/tasks/GONE1') return json(404, { error: 'not found' })
    if (u.pathname === '/api/v1/tasks/BOOM1') return json(500, { error: 'boom' })
    if (u.pathname === '/api/v1/tasks/A01' && (init.method ?? 'GET').toUpperCase() === 'GET') return json(200, pages.first.results[0])
    return json(200, { id: 'NEW01' })
  }
  assert.equal(createTodoistClient('', fakeFetch, TODOIST_DEFAULTS), null)
  const client = createTodoistClient('test-only-token', fakeFetch, TODOIST_DEFAULTS)

  const all = await client.listTasks()
  assert.deepEqual(all.map((t) => t.id), ['A01', 'B01'])
  assert.equal(requests.length, 2)
  assert.equal(requests[0].u.origin + requests[0].u.pathname, 'https://api.todoist.com/api/v1/tasks')
  assert.equal(requests[0].u.searchParams.get('limit'), '200')
  assert.equal(requests[1].u.searchParams.get('cursor'), 'c2')

  await client.updateDue('A01', '2026-10-08')
  await client.addSubtask('A01', '上網預約')
  const update = requests[2]
  assert.equal(update.method, 'POST')
  assert.equal(update.u.href, 'https://api.todoist.com/api/v1/tasks/A01')
  assert.deepEqual(update.body, { due_date: '2026-10-08' })
  const add = requests[3]
  assert.equal(add.method, 'POST')
  assert.equal(add.u.href, 'https://api.todoist.com/api/v1/tasks')
  assert.deepEqual(add.body, { content: '上網預約', parent_id: 'A01' })
  for (const r of requests) assert.equal(r.auth, 'Bearer test-only-token')

  assert.equal((await client.getTask('A01')).id, 'A01')
  assert.equal(await client.getTask('GONE1'), null)
  await assert.rejects(() => client.getTask('BOOM1'))
})

test('M3R-S15 提醒台詞沒帶到任務名稱就用預設台詞；名稱截到 200 字', async () => {
  const env = setup({
    tasks: p2Tasks(),
    llm: { script: ['[smile]今天也要加油喔！', '[smile]先休息一下吧。'] }
  })
  await env.run('2026-10-07T09:00')
  assert.equal(env.llm.calls.script, 2)
  assert.equal(env.fcm.sent.length, 1)
  assert.ok(pushData(env, 0).text.includes('教師證加科登記'))

  const longTitle = '很'.repeat(250)
  const long = setup({ tasks: [task('L01', longTitle, 3, { updated: daysAgo(30) })] })
  await long.run('2026-10-07T09:00')
  assert.equal(long.fcm.sent.length, 1)
  const content = pushTodoist(long, 0).content
  assert.equal(Array.from(content).length, 200)
  assert.ok(pushData(long, 0).text.includes(content))
})
