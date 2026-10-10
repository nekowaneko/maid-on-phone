// M4.1 規格測試：明細頁「‹」關閉行為與返回機制（S11、S12），凍結後不得修改
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import * as maRender from '../../../web/ma-render.js'

// 常數定義
const CONTRACT_URL = new URL('../../../config/ma-contract.json', import.meta.url)
const MA_JS_URL = new URL('../../../web/ma.js', import.meta.url)

test('M41-S11 在明細頁（今天分頁）按畫面左上的「‹」，關閉明細頁，回到進來的地方', () => {
  const contract = JSON.parse(readFileSync(CONTRACT_URL, 'utf8'))
  const maJs = readFileSync(MA_JS_URL, 'utf8')

  assert.equal(maRender.decideBack?.('detail'), 'exit')
  assert.equal(maRender.decideBack?.('other'), 'exit')
  assert.equal(maRender.MA_EXIT_URL, contract.exitUrl)
  assert.equal(maRender.MA_EXIT_URL, 'ma-exit://close')
  assert.ok(maJs.includes('decideBack('))
  assert.ok(maJs.includes('MA_EXIT_URL'))
  assert.ok(!maJs.includes('history.back'))
})

test('M41-S12 在追蹤清單頁或看懂排列頁按畫面左上的「‹」，只是回到明細頁，不關閉明細頁', () => {
  assert.equal(maRender.decideBack?.('manage'), 'detail')
  assert.equal(maRender.decideBack?.('glossary'), 'detail')
})
