// M2 規格範例表（docs/M2-EXPENSIVE-PLAN.md §4.5）中懸浮窗按鈕的各列，凍結後不得修改。
// 角色頁的程式是一般 script（掛在全域），這裡用 node:vm 依序載入同一份檔案來測，不另寫一份。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

// 常數定義
const PET_DIR = new URL('../../../../app/src/main/assets/pet/', import.meta.url)
const PET_SCRIPTS = ['emotion-map.js', 'vendor/stream-parser.js', 'performance.js', 'drink-labels.js', 'drink-view.js'] // 與 index.html 的載入順序相同
const BASES = [
  { id: 'tea', name: '純茶（紅/綠/青/烏龍）' },
  { id: 'milktea', name: '奶茶（奶精）' },
  { id: 'freshmilktea', name: '鮮奶茶' },
  { id: 'latte', name: '拿鐵／鮮奶' },
  { id: 'fruittea', name: '水果茶' },
  { id: 'wintermelon', name: '冬瓜茶（本身含糖，糖度僅微調）' },
  { id: 'yakult', name: '多多／養樂多系列' }
]

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

// 珍奶大杯半糖去冰的草稿
const bobaDraft = () => ({
  name: '珍珠奶茶',
  starbucksId: null,
  baseId: 'milktea',
  sizeId: 'L',
  sugarLevelId: 'half',
  iceId: 'none',
  toppingIds: ['boba'],
  price: null
})

// Worker 回的複述
const confirmResp = (extra = {}) => ({
  kind: 'confirm',
  script: '[pout]珍珠奶茶、大杯、半糖、去冰，大約 450 大卡。',
  text: '珍珠奶茶、大杯、半糖、去冰，大約 450 大卡。',
  draft: bobaDraft(),
  kcal: 450,
  source: 'model',
  assumed: [],
  ...extra
})

test('M2-S02-B 複述時有三個按鈕，改甜度出現五個糖度，選微糖送出重新複述而不是寫入', () => {
  const pet = loadPet()
  const labels = pet.PetDrinkLabels
  const resp = confirmResp()
  const view = plain(pet.PetDrinkView.viewFor(resp, labels))
  assert.equal(view.script, resp.script)
  assert.deepEqual(
    view.buttons.map((b) => b.label),
    ['對，記下來', '改甜度', '取消']
  )
  assert.deepEqual(view.buttons[0].action, { action: 'confirm', draft: bobaDraft() })
  assert.deepEqual(view.buttons[1].action, { local: 'sugarMenu' })
  assert.deepEqual(view.buttons[2].action, { action: 'cancel' })

  const draft = bobaDraft()
  const menu = plain(pet.PetDrinkView.sugarMenu(draft, labels))
  assert.deepEqual(
    menu.map((b) => b.label),
    ['全糖', '少糖', '半糖', '微糖', '無糖']
  )
  assert.deepEqual(menu[3].action, { action: 'preview', draft: { ...bobaDraft(), sugarLevelId: 'quarter' } })
  assert.ok(menu.every((b) => b.action.action === 'preview'))
  assert.deepEqual(draft, bobaDraft()) // 不得改動傳入的草稿
})

test('M2-S04-B 品項不在清單上時列出 7 種基底加取消，按鈕沒有數字，選拿鐵送出重新複述', () => {
  const pet = loadPet()
  const draft = { ...bobaDraft(), name: '咖啡', baseId: null, toppingIds: [] }
  const resp = {
    kind: 'choose',
    script: '[thinking]這個我不太確定是哪一種……',
    text: '這個我不太確定是哪一種……',
    draft,
    field: 'base',
    candidates: BASES
  }
  const view = plain(pet.PetDrinkView.viewFor(resp, pet.PetDrinkLabels))
  assert.deepEqual(
    view.buttons.map((b) => b.label),
    [...BASES.map((b) => b.name), '取消']
  )
  assert.ok(view.buttons.every((b) => !/\d/.test(b.label)))
  assert.deepEqual(view.buttons[3].action, { action: 'preview', draft: { ...draft, baseId: 'latte' } })
  assert.deepEqual(view.buttons.at(-1).action, { action: 'cancel' })
  assert.equal(draft.baseId, null) // 不得改動傳入的草稿
})

test('M2-S11-B 每日詢問的泡泡有沒喝與有喝用說的兩個按鈕', () => {
  const pet = loadPet()
  const view = plain(pet.PetDrinkView.viewFor({ kind: 'ask', script: '[pout]今天有喝飲料嗎？' }, pet.PetDrinkLabels))
  assert.equal(view.script, '[pout]今天有喝飲料嗎？')
  assert.deepEqual(view.buttons, [
    { label: '沒喝', action: { action: 'resist' } },
    { label: '有喝，用說的', action: { action: 'speak' } }
  ])
})

test('M2-S16-B 星巴克查表的複述沒有改甜度按鈕', () => {
  const pet = loadPet()
  const draft = { ...bobaDraft(), name: '伯爵茶那堤（大杯）', starbucksId: 'sb_black_tea_latte_grande', baseId: null, sizeId: null, sugarLevelId: null, iceId: null, toppingIds: [] }
  const view = plain(pet.PetDrinkView.viewFor(confirmResp({ draft, kcal: 204, source: 'table' }), pet.PetDrinkLabels))
  assert.deepEqual(
    view.buttons.map((b) => b.label),
    ['對，記下來', '取消']
  )
  assert.deepEqual(view.buttons[0].action, { action: 'confirm', draft })
})
