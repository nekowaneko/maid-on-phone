// 換臉決策的測試。這一層原本埋在 renderer.js 裡，要 DOM 與真實網路才跑得到，
// 所以「臉整個不見」的問題一路沒有被任何測試擋下來。抽成純函式之後就測得到了。

import test from 'node:test'
import assert from 'node:assert/strict'
import { pickFaceSlot, planFaceSwap } from '../core/face-swap.js'

const SLOT_COUNT = 2

test('首次繪製用目前這一格，之後每次換手', () => {
  assert.equal(pickFaceSlot({ activeSlot: 0, slotCount: SLOT_COUNT, hasPainted: false }), 0)
  assert.equal(pickFaceSlot({ activeSlot: 0, slotCount: SLOT_COUNT, hasPainted: true }), 1)
  assert.equal(pickFaceSlot({ activeSlot: 1, slotCount: SLOT_COUNT, hasPainted: true }), 0)
})

test('格號或格數不合理時退回第一格，不會算出不存在的格子', () => {
  assert.equal(pickFaceSlot({ activeSlot: 9, slotCount: SLOT_COUNT, hasPainted: false }), 0)
  assert.equal(pickFaceSlot({ activeSlot: -1, slotCount: SLOT_COUNT, hasPainted: false }), 0)
  assert.equal(pickFaceSlot({ activeSlot: 0.5, slotCount: SLOT_COUNT, hasPainted: false }), 0)
  assert.equal(pickFaceSlot({ activeSlot: 0, slotCount: 0, hasPainted: true }), 0)
  assert.equal(pickFaceSlot(), 0)
})

test('首次繪製只點亮新的那一格，沒有舊臉要熄掉', () => {
  const plan = planFaceSwap({ activeSlot: 0, nextSlot: 0, hasPainted: false, loaded: true })
  assert.equal(plan.show, 0)
  assert.equal(plan.hide, null)
  assert.equal(plan.activeSlot, 0)
  assert.equal(plan.hasPainted, true)
})

test('一般切換點亮新的、熄掉舊的，activeSlot 跟著換手', () => {
  const plan = planFaceSwap({ activeSlot: 0, nextSlot: 1, hasPainted: true, loaded: true })
  assert.equal(plan.show, 1)
  assert.equal(plan.hide, 0)
  assert.equal(plan.activeSlot, 1)
  assert.equal(plan.hasPainted, true)
})

// 這一項就是線上那個「臉變透明」的情境：新臉沒載成功，舊臉不准被熄掉。
// 舊的寫法無條件熄掉舊臉，兩張臉同時看不見，臉的位置變成一個洞。
test('新臉載入失敗時舊臉留著，兩張臉不會同時看不見', () => {
  const plan = planFaceSwap({ activeSlot: 0, nextSlot: 1, hasPainted: true, loaded: false })
  assert.equal(plan.show, null, '不該點亮沒載成功的那一格')
  assert.equal(plan.hide, null, '舊臉必須留在畫面上')
  assert.equal(plan.activeSlot, 0, 'activeSlot 不該換手')
  assert.equal(plan.hasPainted, true)
})

test('首次繪製就失敗時不記成已繪製，下一次仍然當作首次', () => {
  const plan = planFaceSwap({ activeSlot: 0, nextSlot: 0, hasPainted: false, loaded: false })
  assert.equal(plan.show, null)
  assert.equal(plan.hide, null)
  assert.equal(plan.hasPainted, false)
  assert.equal(pickFaceSlot({ activeSlot: plan.activeSlot, slotCount: SLOT_COUNT, hasPainted: plan.hasPainted }), 0)
})

test('loaded 不是布林真值一律當成沒載成功', () => {
  for (const loaded of [undefined, null, 'ok', 1]) {
    const plan = planFaceSwap({ activeSlot: 0, nextSlot: 1, hasPainted: true, loaded })
    assert.equal(plan.hide, null)
  }
  assert.equal(planFaceSwap().show, null)
})

// 連續切換不該讓兩張臉的狀態脫節：成功時一定是一亮一暗，失敗時維持原狀
test('連續切換之後 activeSlot 與格號始終落在有效範圍內', () => {
  let state = { activeSlot: 0, hasPainted: false }
  for (const loaded of [true, true, false, true, false, false, true]) {
    const nextSlot = pickFaceSlot({ ...state, slotCount: SLOT_COUNT })
    const plan = planFaceSwap({ ...state, nextSlot, loaded })
    assert.ok(nextSlot === 0 || nextSlot === 1)
    assert.ok(plan.activeSlot === 0 || plan.activeSlot === 1)
    if (plan.show !== null) assert.notEqual(plan.show, plan.hide)
    state = { activeSlot: plan.activeSlot, hasPainted: plan.hasPainted }
  }
})
