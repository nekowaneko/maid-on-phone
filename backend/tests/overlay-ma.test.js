// 懸浮窗盤前均線泡泡與檢視輔助測試（M4 B 線）
// 依據 docs/M4-LANE-B.md §3、§4B.2 與規格列 M4-S15B 撰寫。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 常數定義
const PET_DIR = new URL('../../app/src/main/assets/pet/', import.meta.url)
const CONTRACT_URL = new URL('../config/ma-contract.json', import.meta.url)

// 功能函數定義

// 載入 ma-labels.js 與 ma-view.js 於獨立 vm 環境
const loadMaView = () => {
  const sandbox = {}
  vm.createContext(sandbox)
  const labelsCode = readFileSync(new URL('ma-labels.js', PET_DIR), 'utf8')
  const viewCode = readFileSync(new URL('ma-view.js', PET_DIR), 'utf8')
  vm.runInContext(labelsCode, sandbox)
  vm.runInContext(viewCode, sandbox)
  return sandbox
}

// 跨 realm 的物件轉為一般純資料以便比對
const plain = (value) => JSON.parse(JSON.stringify(value))

test('PetMaView.viewFor：status ok 且 u、d、m 為非負整數時，回傳摘要與看明細、晚點再看兩顆按鈕', () => {
  const { PetMaView, PetMaLabels } = loadMaView()
  const data = {
    date: '20261012',
    asOf: '20261009',
    u: 3,
    d: 1,
    m: 1,
    status: 'ok',
    script: '[smile]主人早安～今天的均線我整理好了。'
  }
  const result = plain(PetMaView.viewFor(data, PetMaLabels))
  assert.equal(result.script, '[smile]主人早安～今天的均線我整理好了。')
  assert.deepEqual(result.summary, { u: 3, d: 1, m: 1 })
  assert.equal(result.buttons.length, 2)
  assert.equal(result.buttons[0].label, '看明細')
  assert.deepEqual(result.buttons[0].action, { action: 'openMa' })
  assert.equal(result.buttons[1].label, '晚點再看')
  assert.deepEqual(result.buttons[1].action, { action: 'dismiss' })
})

test('PetMaView.viewFor：status failed 時，摘要為 null，只有一顆「知道了」按鈕', () => {
  const { PetMaView, PetMaLabels } = loadMaView()
  const data = {
    status: 'failed',
    script: '證交所的資料今天沒拿到，我晚點再試一次。'
  }
  const result = plain(PetMaView.viewFor(data, PetMaLabels))
  assert.equal(result.script, '證交所的資料今天沒拿到，我晚點再試一次。')
  assert.equal(result.summary, null)
  assert.equal(result.buttons.length, 1)
  assert.equal(result.buttons[0].label, '知道了')
  assert.deepEqual(result.buttons[0].action, { action: 'dismiss' })
})

test('PetMaView.viewFor：邊界與異常情況（缺 u/d/m、負數、浮點數、非預期狀態、非物件）', () => {
  const { PetMaView, PetMaLabels } = loadMaView()

  // status 為 ok 但缺少 u、d 或 m
  assert.deepEqual(plain(PetMaView.viewFor({ status: 'ok', u: 1, d: 2, script: 'test' }, PetMaLabels)), { script: 'test', summary: null, buttons: [] })

  // status 為 ok 但包含負數
  assert.deepEqual(plain(PetMaView.viewFor({ status: 'ok', u: -1, d: 0, m: 0, script: 'test' }, PetMaLabels)), { script: 'test', summary: null, buttons: [] })

  // status 為 ok 但數值為浮點數
  assert.deepEqual(plain(PetMaView.viewFor({ status: 'ok', u: 1.5, d: 0, m: 0, script: 'test' }, PetMaLabels)), { script: 'test', summary: null, buttons: [] })

  // 不認得的 status（例如 empty、none）
  assert.deepEqual(plain(PetMaView.viewFor({ status: 'empty', script: 'test' }, PetMaLabels)), { script: 'test', summary: null, buttons: [] })
  assert.deepEqual(plain(PetMaView.viewFor({ status: 'none', script: 'test' }, PetMaLabels)), { script: 'test', summary: null, buttons: [] })

  // null、undefined 或非物件
  assert.deepEqual(plain(PetMaView.viewFor(null, PetMaLabels)), { script: '', summary: null, buttons: [] })
  assert.deepEqual(plain(PetMaView.viewFor(undefined, PetMaLabels)), { script: '', summary: null, buttons: [] })
  assert.deepEqual(plain(PetMaView.viewFor('string', PetMaLabels)), { script: '', summary: null, buttons: [] })
})

test('M4-S15B 泡泡摘要與按鈕、按鈕文字取自契約、index.html 正確載入與按鈕橋接呼叫', () => {
  const { PetMaView, PetMaLabels } = loadMaView()
  const contract = JSON.parse(readFileSync(CONTRACT_URL, 'utf8'))
  const html = readFileSync(new URL('index.html', PET_DIR), 'utf8')

  // 1. 驗證按鈕文字取自契約標籤
  const okData = { status: 'ok', u: 2, d: 1, m: 2, script: '報告' }
  const okView = plain(PetMaView.viewFor(okData, PetMaLabels))
  assert.equal(okView.buttons[0].label, PetMaLabels.buttons.openMa)
  assert.equal(okView.buttons[1].label, PetMaLabels.buttons.dismiss)
  assert.ok(contract.bubbleActions.includes(okView.buttons[0].action.action))
  assert.ok(contract.bubbleActions.includes(okView.buttons[1].action.action))

  const failData = { status: 'failed', script: '失敗' }
  const failView = plain(PetMaView.viewFor(failData, PetMaLabels))
  assert.equal(failView.buttons[0].label, PetMaLabels.buttons.know)
  assert.ok(contract.bubbleActions.includes(failView.buttons[0].action.action))

  // 2. 檢查 index.html 依序載入 ma-labels.js、ma-view.js
  const scriptTags = [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])
  const labelsIdx = scriptTags.indexOf('ma-labels.js')
  const viewIdx = scriptTags.indexOf('ma-view.js')
  assert.ok(labelsIdx >= 0, 'index.html 需載入 ma-labels.js')
  assert.ok(viewIdx >= 0, 'index.html 需載入 ma-view.js')
  assert.ok(labelsIdx < viewIdx, 'ma-labels.js 需在 ma-view.js 之前載入')

  // 3. 檢查 index.html 常駐按鈕列包含 id="ma"，且位於 #history 之後
  const historyPos = html.indexOf('id="history"')
  const maPos = html.indexOf('id="ma"')
  assert.ok(historyPos >= 0, '需存在 #history 按鈕')
  assert.ok(maPos >= 0, '需存在 #ma 按鈕')
  assert.ok(historyPos < maPos, '#ma 按鈕需在 #history 之後')

  // 4. 檢查 index.html 包含 #maSummary 與 #maActions
  assert.ok(html.includes('id="maSummary"'), '需存在 #maSummary')
  assert.ok(html.includes('id="maActions"'), '需存在 #maActions')

  // 5. 檢查 index.html 宣告並實作 showMa 介面與 onMaPressed 呼叫
  assert.ok(html.includes('showMa: function'), 'window.pet 需提供 showMa 函式')
  assert.ok(html.includes("onMaPressed"), '點擊看明細或常駐按鈕需呼叫 onMaPressed')

  // 6. 角色頁不得含有危險 sink
  for (const file of ['index.html', 'ma-view.js', 'ma-labels.js']) {
    const src = file === 'index.html' ? html : readFileSync(new URL(file, PET_DIR), 'utf8')
    for (const sink of ['innerHTML', 'outerHTML', 'insertAdjacentHTML', 'document.write', 'eval(']) {
      assert.ok(!src.includes(sink), `${file} 不得包含 ${sink}`)
    }
  }
})
