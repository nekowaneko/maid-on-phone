// Todoist API 端點整合單元測試
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandler } from '../worker/handlers.js'
import { createStore } from '../worker/store.stub.js'
import { createTodoistStub } from '../worker/todoist-client.stub.js'

const SECRET = 'test-secret'
const SECRET_HEADER = 'x-app-secret'

const makeDeps = (options = {}) => ({
  secret: SECRET,
  store: createStore({}),
  todoist: options.noToken ? null : createTodoistStub({ tasks: options.tasks || [] }),
  todoistLines: {
    doneSnooze: ['[smile]延後成功'],
    doneDoToday: ['[smile]今天做'],
    doneSplit: ['[smile]已拆解'],
    failed: ['[troubled]失敗']
  },
  now: () => Date.parse('2026-10-07T12:00:00+08:00')
})

test('POST /api/todoist/action：未帶 secret 回傳 401', async () => {
  const handler = createHandler(makeDeps())
  const req = new Request('http://localhost/api/todoist/action', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'snooze', taskId: '123' })
  })
  const res = await handler(req)
  assert.equal(res.status, 401)
})

test('非 POST 方法回傳 405，其他 todoist 路徑回傳 404', async () => {
  const handler = createHandler(makeDeps())
  const getReq = new Request('http://localhost/api/todoist/action', {
    method: 'GET',
    headers: { [SECRET_HEADER]: SECRET }
  })
  const res405 = await handler(getReq)
  assert.equal(res405.status, 405)

  const otherReq = new Request('http://localhost/api/todoist/unknown', {
    method: 'GET',
    headers: { [SECRET_HEADER]: SECRET }
  })
  const res404 = await handler(otherReq)
  assert.equal(res404.status, 404)
})

test('POST /api/todoist/action：缺少必要欄位回傳 400', async () => {
  const handler = createHandler(makeDeps())
  const req = new Request('http://localhost/api/todoist/action', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [SECRET_HEADER]: SECRET
    },
    body: JSON.stringify({ action: 'snooze' })
  })
  const res = await handler(req)
  assert.equal(res.status, 400)
})

test('POST /api/todoist/action：成功處理 snooze 動作回傳 done', async () => {
  const handler = createHandler(makeDeps())
  const req = new Request('http://localhost/api/todoist/action', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [SECRET_HEADER]: SECRET
    },
    body: JSON.stringify({ action: 'snooze', taskId: 'taskabc' })
  })
  const res = await handler(req)
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(json.kind, 'done')
  assert.ok(json.text.length > 0)
})

test('POST /api/todoist/action：確認子任務建立 confirmSplit', async () => {
  const handler = createHandler(makeDeps())
  const req = new Request('http://localhost/api/todoist/action', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      [SECRET_HEADER]: SECRET
    },
    body: JSON.stringify({
      action: 'confirmSplit',
      taskId: 'taskabc',
      steps: ['步驟一', '步驟二']
    })
  })
  const res = await handler(req)
  assert.equal(res.status, 200)
  const json = await res.json()
  assert.equal(json.kind, 'done')
})
