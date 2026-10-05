// 照抄自 cost_down（戒飲存）commit 9fc08b2 的 tests/calorie.test.js，只改了 import 路徑；不得修改
// 熱量計算測試
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calcKcal, explainKcal, lookupTableKcal } from '../core/calorie.js'

// ===== 常數定義 =====

// 斷網樁：測試期間任何真實網路請求都直接拋錯（驗收項 V10）
globalThis.fetch = () => { throw new Error('驗收期間禁止發出真實網路請求') }

const model = JSON.parse(readFileSync(new URL('../config/drink-model.json', import.meta.url), 'utf8'))

// 查表測試用的假資料，不讀真實 starbucks.json（該檔由使用者手動填值，內容會變動）
const tableFixture = {
  version: 2,
  items: [
    { id: 'sb_filled', name: '已填入的品項', 'energy-kcal': 190 },
    { id: 'sb_todo', name: '尚未填入的品項', 'energy-kcal': '<TODO:官方公告值>' }
  ]
}

// ===== 測試 =====

test('[V11] calcKcal 對全部 base×sugar×size 組合的輸出恆為 10 的倍數', () => {
  model.bases.forEach((base) => {
    model.sugarLevels.forEach((sugar) => {
      model.sizes.forEach((size) => {
        const kcal = calcKcal({ baseId: base.id, sugarLevelId: sugar.id, sizeId: size.id, toppingIds: [] }, model)
        assert.equal(kcal % 10, 0, `${base.id}/${sugar.id}/${size.id} 得到 ${kcal}`)
        assert.ok(Number.isInteger(kcal), `${base.id}/${sugar.id}/${size.id} 非整數`)
      })
    })
  })
})

test('[V11] 加上配料後仍為 10 的倍數', () => {
  const kcal = calcKcal(
    { baseId: 'milktea', sugarLevelId: 'half', sizeId: 'M', toppingIds: ['boba', 'pudding'] },
    model
  )
  assert.equal(kcal % 10, 0)
})

test('[V12] 無糖純茶中杯回傳 > 0（基底不得被吃掉）', () => {
  const spec = { baseId: 'tea', sugarLevelId: 'none', sizeId: 'M', toppingIds: [] }
  const detail = explainKcal(spec, model)
  assert.equal(detail.sugar, 0)                    // 無糖，糖的部分確實為 0
  assert.ok(detail.total > 0 && detail.total < 10) // 原始值 5×0.71＝3.55，四捨五入會歸零
  assert.ok(calcKcal(spec, model) > 0, '純茶基底被四捨五入吃掉了')
  assert.equal(calcKcal(spec, model) % 10, 0)      // 同時仍須滿足 V11
})

test('[V12] 五種糖度的無糖以外組合都大於無糖', () => {
  const of = (sugarLevelId) => calcKcal({ baseId: 'tea', sugarLevelId, sizeId: 'L', toppingIds: [] }, model)
  assert.ok(of('full') > of('half'))
  assert.ok(of('half') > of('quarter'))
  assert.ok(of('quarter') > of('none'))
})

test('explainKcal 依設計式拆解：糖隨容量縮放、配料不縮放', () => {
  const spec = { baseId: 'milktea', sugarLevelId: 'full', sizeId: 'L', toppingIds: ['boba'] }
  const detail = explainKcal(spec, model)
  assert.equal(detail.sugar, 240)      // 240 × 1.0 × 1.0
  assert.equal(detail.base, 170)       // 170 × 1.0
  assert.equal(detail.toppings, 160)   // 珍珠不隨容量縮放
  assert.equal(detail.total, 570)
  assert.equal(calcKcal(spec, model), 570)
})

test('explainKcal 的配料不隨容量縮放：中杯與特大杯的配料值相同', () => {
  const withSize = (sizeId) => explainKcal({ baseId: 'tea', sugarLevelId: 'none', sizeId, toppingIds: ['boba'] }, model)
  assert.equal(withSize('M').toppings, withSize('XL').toppings)
  assert.ok(withSize('XL').base > withSize('M').base)  // 基底則有縮放
})

test('未知的糖度與容量採保守值（寧可高估不低估）', () => {
  const unknown = explainKcal({ baseId: 'milktea', sugarLevelId: '不存在', sizeId: '不存在', toppingIds: [] }, model)
  assert.equal(unknown.sugar, 240)  // 視為全糖
  assert.equal(unknown.base, 170)   // 視為大杯
})

test('lookupTableKcal 查到已填值時回傳數字', () => {
  assert.equal(lookupTableKcal('sb_filled', tableFixture), 190)
})

test('lookupTableKcal 遇到 <TODO:...> 佔位或查無時回傳 null，不得回傳 0', () => {
  assert.equal(lookupTableKcal('sb_todo', tableFixture), null)
  assert.equal(lookupTableKcal('不存在的品項', tableFixture), null)
  assert.equal(lookupTableKcal('sb_todo', tableFixture), null)
  assert.notEqual(lookupTableKcal('sb_todo', tableFixture), 0)
})

test('lookupTableKcal 對空表或缺 items 不拋錯', () => {
  assert.equal(lookupTableKcal('sb_filled', {}), null)
  assert.equal(lookupTableKcal('sb_filled', { items: [] }), null)
})
