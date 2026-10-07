// Todoist 核心純函式邏輯輔助單元測試
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  toTaipeiDateString,
  addDaysToDateKey,
  diffDays,
  pickP2,
  pickP3,
  setDateFor,
  validateSplitSteps,
  validateTodoistAction
} from '../core/todoist.js'

test('日期工具函式正確計算', () => {
  const d = new Date('2026-10-07T00:00:00Z')
  assert.equal(toTaipeiDateString(d), '2026-10-07')
  assert.equal(addDaysToDateKey('2026-10-07', 1), '2026-10-08')
  assert.equal(diffDays('2026-10-03', '2026-10-10'), 7)
})

test('pickP2 挑選擱置任務與間隔邏輯', () => {
  const now = Date.parse('2026-10-07T09:00:00+08:00')
  const tasks = [
    { id: 't1', priority: 3, updated_at: '2026-09-01T00:00:00Z', parent_id: null },
    { id: 't2', priority: 3, updated_at: '2026-09-10T00:00:00Z', parent_id: null },
    { id: 'sub1', priority: 3, updated_at: '2026-08-01T00:00:00Z', parent_id: 't1' }
  ]
  const picked = pickP2(tasks, '2026-10-07', now, {})
  assert.equal(picked?.id, 't1')

  // 若 7 天內提過則回傳 null
  const skipped = pickP2(tasks, '2026-10-07', now, { 'todoist.p2SentOn': '2026-10-03' })
  assert.equal(skipped, null)
})

test('pickP3 到期與問日期分流', () => {
  const tasks = [
    { id: 'due1', priority: 2, due: { date: '2026-10-07' } },
    { id: 'ask1', priority: 2, due: null, parent_id: null, added_at: '2026-09-01T00:00:00Z' }
  ]
  const resultDue = pickP3(tasks, '2026-10-07', {})
  assert.equal(resultDue?.view, 'p3')
  assert.equal(resultDue?.task.id, 'due1')

  const resultAsk = pickP3([tasks[1]], '2026-10-07', {})
  assert.equal(resultAsk?.view, 'askDate')
  assert.equal(resultAsk?.task.id, 'ask1')
})

test('setDateFor 計算不同選項', () => {
  assert.equal(setDateFor('tomorrow', '2026-10-07'), '2026-10-08')
  assert.equal(setDateFor('nextMonday', '2026-10-07'), '2026-10-12')
  assert.equal(setDateFor('nextMonth', '2026-10-07'), '2026-11-01')
})

test('validateSplitSteps 嚴格驗證步數與長度', () => {
  assert.equal(validateSplitSteps(['第一步', '第二步']).valid, true)
  assert.equal(validateSplitSteps(['只有一步']).valid, false)
  assert.equal(validateSplitSteps(['一', '二', '三', '四']).valid, false)
  assert.equal(validateSplitSteps(['第一步', '  ']).valid, false)
})

test('validateTodoistAction 驗證動作參數', () => {
  const contract = {
    actions: { sent: ['doToday', 'snooze', 'confirmSplit'] },
    taskIdPattern: '^[0-9A-Za-z_]{1,64}$',
    contentMaxChars: 200
  }
  assert.equal(validateTodoistAction({ action: 'doToday', taskId: '123', view: 'p2' }, contract).valid, true)
  assert.equal(validateTodoistAction({ action: 'doToday', taskId: '123', view: 'invalid' }, contract).valid, false)
  assert.equal(validateTodoistAction({ action: 'unknown', taskId: '123' }, contract).valid, false)
})
