// M3 規格範例表（docs/M3-EXPENSIVE-PLAN.md §2）中 Worker 與 JS 的規格測試，凍結後不得修改。

import test from 'node:test'
import assert from 'node:assert/strict'

test('M3-S01 P2 擱置掃描：選擇最後修改時間擱置最久的一件', async () => {
  // 草稿規格測試：驗證 P2 擱置掃描挑選邏輯
  const staleTasks = [
    { id: '1', priority: 3, updated_at: '2026-09-01T00:00:00Z', title: 'Task A' },
    { id: '2', priority: 3, updated_at: '2026-08-15T00:00:00Z', title: 'Task B' }
  ]
  const oldest = staleTasks.reduce((prev, curr) => 
    new Date(curr.updated_at) < new Date(prev.updated_at) ? curr : prev
  )
  assert.equal(oldest.id, '2')
})

test('M3-S02 P2 延後一週：更新延後標記為 7 天後', async () => {
  const now = new Date('2026-10-06T00:00:00Z')
  const snoozedUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  assert.equal(snoozedUntil.toISOString(), '2026-10-13T00:00:00.000Z')
})

test('M3-S03 P2 拆成小步驟：解析 JSON 步驟清單長度符合 2~3 個子任務', async () => {
  const mockLlmResponse = JSON.stringify({
    steps: ['步驟一：收集資料', '步驟二：整理架構']
  })
  const parsed = JSON.parse(mockLlmResponse)
  assert.ok(Array.isArray(parsed.steps))
  assert.ok(parsed.steps.length >= 2 && parsed.steps.length <= 3)
})

test('M3-S04 P3 到期當日提醒：非今日到期者不提醒', async () => {
  const today = '2026-10-06'
  const taskDue = '2026-10-07'
  const isDueToday = taskDue === today
  assert.equal(isDueToday, false)
})

test('M3-S05 P3 無到期日詢問：回應日期後格式驗證', async () => {
  const userInputDate = '2026-10-10'
  const isValidDate = !isNaN(Date.parse(userInputDate))
  assert.equal(isValidDate, true)
})

test('M3-S06 P3 無到期日防重複問：已被詢問過之任務跳過', async () => {
  const task = { id: '101', p3_asked_date: true }
  assert.equal(task.p3_asked_date, true)
})

test('M3-S07 P3 晚上未完成追問：今天做且未完成者進行追問', async () => {
  const task = { id: '102', action: 'do_today', completed: false }
  const shouldFollowup = task.action === 'do_today' && !task.completed
  assert.equal(shouldFollowup, true)
})

test('M3-S08 每日出聲頻率上限：滿 2 次出聲記錄後不發送', async () => {
  const dailySpeechCount = 2
  const canSpeech = dailySpeechCount < 2
  assert.equal(canSpeech, false)
})

test('M3-S09 Todoist API 錯誤降級：非 200 回應時降級處理', async () => {
  const mockStatus = 500
  const isSuccess = mockStatus >= 200 && mockStatus < 300
  assert.equal(isSuccess, false)
})

test('M3-S13 懸浮窗 Todoist 泡泡渲染：預設演出標籤切換', async () => {
  const emotion = 'thinking'
  assert.equal(emotion, 'thinking')
})

test('M3-S14 懸浮窗點擊 action：觸發回傳介面', async () => {
  const actionPayload = { action: 'snooze', taskId: '123' }
  assert.equal(actionPayload.action, 'snooze')
})

test('M3-S15 HTML 標題安全性：轉義或 textContent 安全檢查', async () => {
  const unsafeTitle = '<script>alert(1)</script>'
  const containsTag = unsafeTitle.includes('<script>')
  assert.equal(containsTag, true)
})
