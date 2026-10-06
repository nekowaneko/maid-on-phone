// 懸浮窗 Todoist 泡泡與動作邏輯單元測試（B 線）
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 載入 todoist-view.js 於獨立 vm 環境
const code = readFileSync(new URL('../../app/src/main/assets/pet/todoist-view.js', import.meta.url), 'utf8')
const sandbox = {}
vm.createContext(sandbox)
vm.runInContext(code, sandbox)
const PetTodoistView = sandbox.PetTodoistView

test('PetTodoistView.viewForP2：產生三選一按鈕', () => {
  const task = { id: 't-123', title: '準備課程' }
  const result = PetTodoistView.viewForP2(task)
  assert.equal(result.buttons.length, 3)
  assert.equal(result.buttons[0].label, '今天推進一小步')
  assert.equal(result.buttons[1].label, '延後一週')
  assert.equal(result.buttons[2].label, '拆成小步驟')
  assert.equal(result.buttons[1].action.taskId, 't-123')
})

test('PetTodoistView.viewForP3：產生兩選一按鈕', () => {
  const task = { id: 't-456', title: '確認時程' }
  const result = PetTodoistView.viewForP3(task)
  assert.equal(result.buttons.length, 2)
  assert.equal(result.buttons[0].label, '今天做')
  assert.equal(result.buttons[1].label, '明天再提醒')
  assert.equal(result.buttons[0].action.taskId, 't-456')
})

test('PetTodoistView.viewForSplit：產生確認子任務按鈕', () => {
  const task = { id: 't-789' }
  const steps = ['步驟一', '步驟二']
  const result = PetTodoistView.viewForSplit(task, steps)
  assert.equal(result.buttons.length, 2)
  assert.equal(result.buttons[0].label, '確認新增子任務')
  assert.deepEqual(result.buttons[0].action.steps, steps)
  assert.equal(result.buttons[1].label, '取消')
})
