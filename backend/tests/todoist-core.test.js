// Todoist 核心純函式邏輯單元測試
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  isP2Stale,
  pickP2TaskToRemind,
  calculateSnoozeTime,
  isP3DueToday,
  shouldAskP3Date,
  shouldFollowupP3Night,
  canSpeakToday,
  validateSplitSteps
} from '../core/todoist.js'

test('isP2Stale：超過 14 天未修改且未完成者符合條件', () => {
  const now = new Date('2026-10-15T00:00:00Z').getTime()
  const staleTask = {
    id: 't1',
    priority: 3,
    completed: false,
    updated_at: '2026-09-30T00:00:00Z'
  }
  assert.equal(isP2Stale(staleTask, now), true)

  const recentTask = {
    id: 't2',
    priority: 3,
    completed: false,
    updated_at: '2026-10-10T00:00:00Z'
  }
  assert.equal(isP2Stale(recentTask, now), false)
})

test('pickP2TaskToRemind：挑選擱置最久的那件，且 7 天內提過則跳過', () => {
  const now = new Date('2026-10-15T00:00:00Z').getTime()
  const tasks = [
    { id: 't1', priority: 3, updated_at: '2026-09-10T00:00:00Z' },
    { id: 't2', priority: 3, updated_at: '2026-09-01T00:00:00Z' }
  ]
  const picked = pickP2TaskToRemind(tasks, now, null, '2026-10-15')
  assert.equal(picked.id, 't2')

  // 若 3 天前剛提醒過，則回傳 null
  const skipped = pickP2TaskToRemind(tasks, now, '2026-10-12', '2026-10-15')
  assert.equal(skipped, null)
})

test('calculateSnoozeTime：產生 7 天後之 ISO 字串', () => {
  const now = new Date('2026-10-06T00:00:00Z').getTime()
  const snoozed = calculateSnoozeTime(now, 7)
  assert.equal(snoozed, '2026-10-13T00:00:00.000Z')
})

test('isP3DueToday：判斷到期日是否為今天', () => {
  const taskToday = { priority: 2, completed: false, due_date: '2026-10-06' }
  const taskTomorrow = { priority: 2, completed: false, due_date: '2026-10-07' }
  assert.equal(isP3DueToday(taskToday, '2026-10-06'), true)
  assert.equal(isP3DueToday(taskTomorrow, '2026-10-06'), false)
})

test('shouldAskP3Date：未設定到期日且未詢問過者需詢問', () => {
  const unasked = { priority: 2, completed: false, due_date: null, has_asked_date: false }
  const asked = { priority: 2, completed: false, due_date: null, has_asked_date: true }
  assert.equal(shouldAskP3Date(unasked), true)
  assert.equal(shouldAskP3Date(asked), false)
})

test('shouldFollowupP3Night：當天標記今天做但 21:00 未完成者需追問', () => {
  assert.equal(shouldFollowupP3Night({ action: 'do_today' }, false), true)
  assert.equal(shouldFollowupP3Night({ action: 'do_today' }, true), false)
  assert.equal(shouldFollowupP3Night({ action: 'other' }, false), false)
})

test('canSpeakToday：每天出聲限制在 2 次之內', () => {
  assert.equal(canSpeakToday(0), true)
  assert.equal(canSpeakToday(1), true)
  assert.equal(canSpeakToday(2), false)
})

test('validateSplitSteps：驗證子任務陣列長度在 2~5 之間', () => {
  assert.equal(validateSplitSteps({ steps: ['A', 'B'] }).valid, true)
  assert.equal(validateSplitSteps({ steps: ['A'] }).valid, false)
  assert.equal(validateSplitSteps(null).valid, false)
})
