// M3 第二輪規格範例表（docs/M3R-EXPENSIVE-PLAN.md §4.5）中懸浮窗的各列，凍結後不得修改。
// 角色頁的程式是一般 script（掛在全域），這裡用 node:vm 依 index.html 的順序載入同一份檔案來測。
// 按鈕的順序與動作代號以接口塊 backend/config/todoist-contract.json 為準。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 常數定義
const PET_DIR = new URL('../../../../app/src/main/assets/pet/', import.meta.url)
const PET_SCRIPTS = [
  'emotion-map.js',
  'vendor/stream-parser.js',
  'performance.js',
  'drink-labels.js',
  'drink-view.js',
  'todoist-labels.js',
  'todoist-view.js'
] // 與 index.html 的載入順序相同
const CONTRACT = JSON.parse(readFileSync(new URL('../../../config/todoist-contract.json', import.meta.url), 'utf8'))
const SCRIPT = '[smile]「教師證加科登記」放了好一陣子了呢。'

// 功能函數定義

// 依序載入角色頁的程式，回傳它們掛上的全域物件
const loadPet = () => {
  const context = vm.createContext({})
  for (const name of PET_SCRIPTS) {
    vm.runInContext(readFileSync(new URL(name, PET_DIR), 'utf8'), context, { filename: name })
  }
  return context
}

// 跨 realm 的物件先轉成一般資料再比對
const plain = (value) => JSON.parse(JSON.stringify(value))

// 算出一組按鈕
const viewOf = (data) => {
  const pet = loadPet()
  return plain(pet.PetTodoistView.viewFor(data, pet.PetTodoistLabels))
}

// 按鈕動作換成契約 viewButtons 的寫法（setDate 帶上 when）
const tokenOf = (action) => (action.action === 'setDate' ? `setDate:${action.when}` : action.action)

// 推播來的畫面資料
const pushView = (view, extra = {}) => ({ view, taskId: 'A01', content: '教師證加科登記', script: SCRIPT, ...extra })

test('M3R-S18 各種畫面的按鈕文字、順序、動作與契約一致', () => {
  const p2 = viewOf(pushView('p2'))
  assert.equal(p2.script, SCRIPT)
  assert.deepEqual(p2.buttons.map((b) => b.label), ['今天推進一小步', '延後一週', '拆成小步驟'])
  assert.deepEqual(p2.buttons.map((b) => b.action), [
    { action: 'doToday', taskId: 'A01', view: 'p2' },
    { action: 'snooze', taskId: 'A01' },
    { action: 'split', taskId: 'A01', content: '教師證加科登記' }
  ])

  const p3 = viewOf(pushView('p3'))
  assert.deepEqual(p3.buttons.map((b) => b.label), ['今天做', '明天再提醒'])
  assert.deepEqual(p3.buttons.map((b) => b.action), [
    { action: 'doToday', taskId: 'A01', view: 'p3' },
    { action: 'tomorrow', taskId: 'A01' }
  ])

  const ask = viewOf(pushView('askDate'))
  assert.deepEqual(ask.buttons.map((b) => b.label), ['明天', '下週一', '下個月', '不知道'])
  assert.deepEqual(ask.buttons.map((b) => b.action), [
    { action: 'setDate', taskId: 'A01', when: 'tomorrow' },
    { action: 'setDate', taskId: 'A01', when: 'nextMonday' },
    { action: 'setDate', taskId: 'A01', when: 'nextMonth' },
    { action: 'unknownDate', taskId: 'A01' }
  ])

  const steps = ['列出需要的文件', '上網預約']
  const split = viewOf({ kind: 'split', script: SCRIPT, text: '拆好了', taskId: 'A01', content: '教師證加科登記', steps })
  assert.equal(split.script, SCRIPT)
  assert.deepEqual(split.buttons.map((b) => b.label), ['幫我加成子任務', '取消'])
  assert.deepEqual(split.buttons.map((b) => b.action), [{ action: 'confirmSplit', taskId: 'A01', steps }, { action: 'cancel' }])

  for (const [name, view] of [['p2', p2], ['p3', p3], ['askDate', ask], ['split', split]]) {
    assert.deepEqual(view.buttons.map((b) => tokenOf(b.action)), CONTRACT.viewButtons[name])
    for (const b of view.buttons) {
      const known = CONTRACT.actions.sent.includes(b.action.action) || CONTRACT.actions.local.includes(b.action.action)
      assert.ok(known, `不在契約內的動作：${b.action.action}`)
    }
  }

  for (const kind of ['done', 'failed']) {
    const view = viewOf({ kind, script: SCRIPT, text: '好' })
    assert.equal(view.script, SCRIPT)
    assert.deepEqual(view.buttons, [])
  }
  assert.deepEqual(viewOf(pushView('p2', { taskId: '' })).buttons, [])
  assert.deepEqual(viewOf({ view: 'p2', content: '沒有編號', script: SCRIPT }).buttons, [])
  assert.deepEqual(viewOf({ view: 'dance', taskId: 'A01', script: SCRIPT }), { script: SCRIPT, buttons: [] })
})

test('M3R-S19 任務名稱只當純文字：角色頁不用 HTML 字串，且照順序載入 Todoist 的兩支 script', () => {
  const html = readFileSync(new URL('index.html', PET_DIR), 'utf8')
  for (const name of ['index.html', 'todoist-view.js', 'todoist-labels.js']) {
    const source = name === 'index.html' ? html : readFileSync(new URL(name, PET_DIR), 'utf8')
    for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write']) {
      assert.ok(!source.includes(sink), `${name} 用了 ${sink}`)
    }
  }
  const srcs = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(srcs.slice(-3), ['drink-view.js', 'todoist-labels.js', 'todoist-view.js'])
  assert.ok(html.includes('id="todoistActions"'))
  assert.ok(html.includes('showTodoist'))
  assert.ok(html.includes('onTodoistAction'))

  const evil = '<img src=x onerror=alert(1)>'
  const view = viewOf(pushView('p2', { content: evil }))
  assert.deepEqual(view.buttons[2].action, { action: 'split', taskId: 'A01', content: evil })
  for (const b of view.buttons) assert.ok(!b.label.includes('<'))
})
