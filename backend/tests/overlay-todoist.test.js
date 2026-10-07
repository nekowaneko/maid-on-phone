// 懸浮窗 Todoist 泡泡與動作邏輯單元測試（B 線輔助測試）
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 常數定義
const PET_DIR = new URL('../../app/src/main/assets/pet/', import.meta.url)

// 載入 todoist-labels.js 與 todoist-view.js 於獨立 vm 環境
const loadTodoistView = () => {
  const sandbox = {}
  vm.createContext(sandbox)
  const labelsCode = readFileSync(new URL('todoist-labels.js', PET_DIR), 'utf8')
  const viewCode = readFileSync(new URL('todoist-view.js', PET_DIR), 'utf8')
  vm.runInContext(labelsCode, sandbox)
  vm.runInContext(viewCode, sandbox)
  return sandbox
}

// 跨 realm 的物件先轉成一般資料再比對
const plain = (value) => JSON.parse(JSON.stringify(value))

test('PetTodoistView.viewFor p2：產生三選一按鈕', () => {
  const { PetTodoistView, PetTodoistLabels } = loadTodoistView()
  const data = { view: 'p2', taskId: 't-123', content: '準備課程', script: '記得準備' }
  const result = plain(PetTodoistView.viewFor(data, PetTodoistLabels))
  assert.equal(result.script, '記得準備')
  assert.equal(result.buttons.length, 3)
  assert.equal(result.buttons[0].label, '今天推進一小步')
  assert.equal(result.buttons[1].label, '延後一週')
  assert.equal(result.buttons[2].label, '拆成小步驟')
  assert.deepEqual(result.buttons[0].action, { action: 'doToday', taskId: 't-123', view: 'p2' })
  assert.deepEqual(result.buttons[1].action, { action: 'snooze', taskId: 't-123' })
  assert.deepEqual(result.buttons[2].action, { action: 'split', taskId: 't-123', content: '準備課程' })
})

test('PetTodoistView.viewFor p3：產生兩選一按鈕', () => {
  const { PetTodoistView, PetTodoistLabels } = loadTodoistView()
  const data = { view: 'p3', taskId: 't-456', script: '該做了' }
  const result = plain(PetTodoistView.viewFor(data, PetTodoistLabels))
  assert.equal(result.buttons.length, 2)
  assert.equal(result.buttons[0].label, '今天做')
  assert.equal(result.buttons[1].label, '明天再提醒')
  assert.deepEqual(result.buttons[0].action, { action: 'doToday', taskId: 't-456', view: 'p3' })
  assert.deepEqual(result.buttons[1].action, { action: 'tomorrow', taskId: 't-456' })
})

test('PetTodoistView.viewFor askDate：產生四選一按鈕', () => {
  const { PetTodoistView, PetTodoistLabels } = loadTodoistView()
  const data = { view: 'askDate', taskId: 't-789', script: '什麼時候要做？' }
  const result = plain(PetTodoistView.viewFor(data, PetTodoistLabels))
  assert.equal(result.buttons.length, 4)
  assert.equal(result.buttons[0].label, '明天')
  assert.equal(result.buttons[1].label, '下週一')
  assert.equal(result.buttons[2].label, '下個月')
  assert.equal(result.buttons[3].label, '不知道')
  assert.deepEqual(result.buttons[0].action, { action: 'setDate', taskId: 't-789', when: 'tomorrow' })
  assert.deepEqual(result.buttons[1].action, { action: 'setDate', taskId: 't-789', when: 'nextMonday' })
  assert.deepEqual(result.buttons[2].action, { action: 'setDate', taskId: 't-789', when: 'nextMonth' })
  assert.deepEqual(result.buttons[3].action, { action: 'unknownDate', taskId: 't-789' })
})

test('PetTodoistView.viewFor split：產生確認子任務與取消按鈕', () => {
  const { PetTodoistView, PetTodoistLabels } = loadTodoistView()
  const steps = ['步驟一', '步驟二']
  const data = { kind: 'split', taskId: 't-789', steps, script: '已幫你拆解' }
  const result = plain(PetTodoistView.viewFor(data, PetTodoistLabels))
  assert.equal(result.buttons.length, 2)
  assert.equal(result.buttons[0].label, '幫我加成子任務')
  assert.equal(result.buttons[1].label, '取消')
  assert.deepEqual(result.buttons[0].action, { action: 'confirmSplit', taskId: 't-789', steps })
  assert.deepEqual(result.buttons[1].action, { action: 'cancel' })
})

test('PetTodoistView.viewFor done/failed：無按鈕', () => {
  const { PetTodoistView, PetTodoistLabels } = loadTodoistView()
  for (const kind of ['done', 'failed']) {
    const result = plain(PetTodoistView.viewFor({ kind, script: '處理完成' }, PetTodoistLabels))
    assert.equal(result.script, '處理完成')
    assert.deepEqual(result.buttons, [])
  }
})

test('PetTodoistView.viewFor 無效或缺失 taskId：無按鈕', () => {
  const { PetTodoistView, PetTodoistLabels } = loadTodoistView()
  const noTask = plain(PetTodoistView.viewFor({ view: 'p2', script: '測試' }, PetTodoistLabels))
  assert.deepEqual(noTask.buttons, [])
  const emptyTask = plain(PetTodoistView.viewFor({ view: 'p2', taskId: '', script: '測試' }, PetTodoistLabels))
  assert.deepEqual(emptyTask.buttons, [])
  const unknownView = plain(PetTodoistView.viewFor({ view: 'unknown', taskId: 't-1', script: '未知' }, PetTodoistLabels))
  assert.deepEqual(unknownView.buttons, [])
  assert.equal(unknownView.script, '未知')
})
