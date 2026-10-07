// 懸浮窗戒飲記錄的輔助測試（M2 B 線）：drink-view.js 純函式的邊界情況，以及 index.html 的載入順序與按鈕位置。
// 角色頁是一般 script，這裡跟規格測試一樣用 node:vm 依序載入同一份檔案；點按與計時交給 DEVICE-CHECKLIST-M2.md。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 常數定義
const PET_DIR = new URL('../../app/src/main/assets/pet/', import.meta.url)
const PET_SCRIPTS = ['emotion-map.js', 'vendor/stream-parser.js', 'performance.js', 'drink-labels.js', 'drink-view.js', 'todoist-labels.js', 'todoist-view.js']
const INDEX_HTML = readFileSync(new URL('index.html', PET_DIR), 'utf8')

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

// 深度凍結，用來確認函式不會改動傳入的物件
const deepFreeze = (value) => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze)
    Object.freeze(value)
  }
  return value
}

// 組合式模型的草稿
const draftOf = (extra = {}) => ({
  name: '珍珠奶茶',
  starbucksId: null,
  baseId: 'milktea',
  sizeId: 'L',
  sugarLevelId: 'half',
  iceId: 'none',
  toppingIds: ['boba'],
  price: null,
  ...extra
})

// 以角色頁的對照表算出泡泡內容
const viewOf = (resp) => {
  const pet = loadPet()
  return plain(pet.PetDrinkView.viewFor(resp, pet.PetDrinkLabels))
}

test('applyChoice：starbucks、base、size、sugar 設定對應欄位', () => {
  const { PetDrinkView: view } = loadPet()
  const draft = deepFreeze(draftOf())
  assert.equal(view.applyChoice(draft, 'starbucks', 'sb_x').starbucksId, 'sb_x')
  assert.equal(view.applyChoice(draft, 'base', 'latte').baseId, 'latte')
  assert.equal(view.applyChoice(draft, 'size', 'M').sizeId, 'M')
  assert.equal(view.applyChoice(draft, 'sugar', 'none').sugarLevelId, 'none')
  assert.deepEqual(draft, draftOf())
})

test('applyChoice：topping 加進 toppingIds，已有的不重複，不改動原陣列', () => {
  const { PetDrinkView: view } = loadPet()
  const draft = deepFreeze(draftOf())
  assert.deepEqual(plain(view.applyChoice(draft, 'topping', 'pudding').toppingIds), ['boba', 'pudding'])
  assert.deepEqual(plain(view.applyChoice(draft, 'topping', 'boba').toppingIds), ['boba'])
  assert.deepEqual(draft.toppingIds, ['boba'])
})

test('applyChoice：toppingIds 不是陣列時當成空陣列；不認得的 field 只複製草稿', () => {
  const { PetDrinkView: view } = loadPet()
  const odd = deepFreeze(draftOf({ toppingIds: 'boba' }))
  assert.deepEqual(plain(view.applyChoice(odd, 'topping', 'pudding').toppingIds), ['pudding'])
  const draft = deepFreeze(draftOf())
  const same = view.applyChoice(draft, 'ice', 'less')
  assert.deepEqual(plain(same), draftOf())
  assert.notEqual(same, draft)
})

test('viewFor confirm：按鈕裡的草稿是複本，之後改動不影響傳入的回應', () => {
  const pet = loadPet()
  const resp = { kind: 'confirm', script: '[pout]好', draft: draftOf(), source: 'model' }
  const view = pet.PetDrinkView.viewFor(resp, pet.PetDrinkLabels)
  view.buttons[0].action.draft.toppingIds.push('pudding')
  assert.deepEqual(resp.draft, draftOf())
})

test('viewFor choose：size 與 topping 的候選各自套到對應欄位，候選不是陣列時只有取消', () => {
  const sizes = viewOf({ kind: 'choose', script: '[thinking]哪一種', draft: draftOf({ sizeId: null }), field: 'size', candidates: [{ id: 'M', name: '中杯' }, { id: 'L', name: '大杯' }] })
  assert.deepEqual(sizes.buttons.map((b) => b.label), ['中杯', '大杯', '取消'])
  assert.equal(sizes.buttons[0].action.draft.sizeId, 'M')
  const toppings = viewOf({ kind: 'choose', script: '', draft: draftOf(), field: 'topping', candidates: [{ id: 'pudding', name: '布丁' }] })
  assert.deepEqual(toppings.buttons[0].action, { action: 'preview', draft: draftOf({ toppingIds: ['boba', 'pudding'] }) })
  const broken = viewOf({ kind: 'choose', script: '', draft: draftOf(), field: 'base', candidates: null })
  assert.deepEqual(broken.buttons, [{ label: '取消', action: { action: 'cancel' } }])
})

test('viewFor saved：有 logId 才有撤銷，沒有或空字串時沒有按鈕', () => {
  assert.deepEqual(viewOf({ kind: 'saved', script: '[smile]記下了', logId: 'd-1-abcdefgh' }).buttons, [
    { label: '撤銷', action: { action: 'undo', logId: 'd-1-abcdefgh' } }
  ])
  assert.deepEqual(viewOf({ kind: 'saved', script: '[smile]記下了' }).buttons, [])
  assert.deepEqual(viewOf({ kind: 'saved', script: '[smile]記下了', logId: '' }).buttons, [])
})

test('viewFor already、undone、other：台詞照給、沒有按鈕', () => {
  for (const kind of ['already', 'undone', 'other']) {
    assert.deepEqual(viewOf({ kind, script: '[pout]嗯' }), { script: '[pout]嗯', buttons: [] })
  }
})

test('viewFor 不認得的 kind、沒有 script、不是物件：script 為空字串、沒有按鈕', () => {
  assert.deepEqual(viewOf({ kind: 'dance', script: '[smile]跳' }), { script: '[smile]跳', buttons: [] })
  assert.deepEqual(viewOf({ kind: 'confirm', draft: draftOf() }).script, '')
  assert.deepEqual(viewOf({ kind: 'ask', script: 42 }).script, '')
  assert.deepEqual(viewOf(null), { script: '', buttons: [] })
  assert.deepEqual(viewOf('confirm'), { script: '', buttons: [] })
})

test('sugarMenu：每顆的草稿互相獨立，不改動傳入的草稿', () => {
  const pet = loadPet()
  const draft = deepFreeze(draftOf())
  const menu = pet.PetDrinkView.sugarMenu(draft, pet.PetDrinkLabels)
  assert.equal(menu.length, 5)
  assert.deepEqual(plain(menu.map((b) => b.action.draft.sugarLevelId)), ['full', 'less', 'half', 'quarter', 'none'])
  menu[0].action.draft.toppingIds.push('pudding')
  assert.deepEqual(plain(menu[1].action.draft.toppingIds), ['boba'])
})

test('index.html 依序載入七支 script，戒飲按鈕列在 #text 與 #actions 之間', () => {
  const srcs = [...INDEX_HTML.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(srcs, PET_SCRIPTS)
  const text = INDEX_HTML.indexOf('id="text"')
  const drink = INDEX_HTML.indexOf('id="drinkActions"')
  const actions = INDEX_HTML.indexOf('id="actions"')
  assert.ok(text >= 0 && text < drink && drink < actions)
})

test('index.html 泡泡按鈕列為說話、聊聊、沒喝、歷史，戒飲按鈕用 textContent 設文字', () => {
  const ids = [...INDEX_HTML.matchAll(/<button id="([^"]+)"/g)].map((m) => m[1])
  assert.deepEqual(ids, ['mic', 'chat', 'resist', 'history'])
  assert.ok(!/innerHTML/.test(INDEX_HTML))
  assert.match(INDEX_HTML, /showDrink:/)
  assert.match(INDEX_HTML, /thinking:/)
})
