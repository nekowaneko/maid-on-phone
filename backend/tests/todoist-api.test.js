// Todoist API 端點整合測試
import test from 'node:test'
import assert from 'node:assert/strict'
import { createHandler } from '../worker/handlers.js'
import { createStore } from '../worker/store.stub.js'

const SECRET = 'test-secret'
const SECRET_HEADER = 'x-app-secret'

const makeDeps = () => ({
  secret: SECRET,
  store: createStore(),
  readClock: () => Date.now()
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

test('POST /api/todoist/action：成功處理 action 回傳 ok', async () => {
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
  assert.equal(json.ok, true)
  assert.equal(json.taskId, 'taskabc')
  assert.equal(json.action, 'snooze')
})
