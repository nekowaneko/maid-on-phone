// 盤前均線明細網頁渲染與規格 M4-S17 輔助測試（M4 B 線）
// 依據 docs/M4-LANE-B.md §3、§4B.3 與規格列 M4-S17 撰寫。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  escapeHtml,
  tagLabel,
  explainFor,
  glyphFor,
  chartSvg,
  renderTag,
  renderMaPills,
  renderWhy,
  renderCard,
  renderToday,
  renderHistory,
  renderGlossary,
  renderWatchlist
} from '../web/ma-render.js'

// 常數定義
const GLOSSARY = JSON.parse(readFileSync(new URL('../config/ma-glossary.json', import.meta.url), 'utf8'))
const LINES = JSON.parse(readFileSync(new URL('../config/ma-lines.json', import.meta.url), 'utf8'))
const CONTRACT = JSON.parse(readFileSync(new URL('../config/ma-contract.json', import.meta.url), 'utf8'))

// 功能函數定義

test('escapeHtml：正確轉義 HTML 5 大特殊字元，處理 null/undefined', () => {
  assert.equal(escapeHtml('<script>alert("xss" & \'test\')</script>'), '&lt;script&gt;alert(&quot;xss&quot; &amp; &#39;test&#39;)&lt;/script&gt;')
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(undefined), '')
  assert.equal(escapeHtml(123), '123')
})

test('tagLabel 與 glyphFor：八種排列之標籤文字、方向箭頭、群組與文字圖標', () => {
  // U: 多頭
  assert.deepEqual(tagLabel('U', GLOSSARY), { text: '多頭排列', group: 'u' })
  assert.equal(glyphFor('U', GLOSSARY), '多')

  // D: 空頭
  assert.deepEqual(tagLabel('D', GLOSSARY), { text: '空頭排列', group: 'd' })
  assert.equal(glyphFor('D', GLOSSARY), '空')

  // W: 轉弱（帶箭頭）
  assert.deepEqual(tagLabel('W', GLOSSARY), { text: '↘ 轉弱', group: 'm' })
  assert.equal(glyphFor('W', GLOSSARY), '弱')

  // V: 明顯轉弱（帶箭頭）
  assert.deepEqual(tagLabel('V', GLOSSARY), { text: '↘ 明顯轉弱', group: 'm' })
  assert.equal(glyphFor('V', GLOSSARY), '弱')

  // S: 轉強（帶箭頭）
  assert.deepEqual(tagLabel('S', GLOSSARY), { text: '↗ 轉強', group: 'm' })
  assert.equal(glyphFor('S', GLOSSARY), '強')

  // B: 初步轉強（帶箭頭）
  assert.deepEqual(tagLabel('B', GLOSSARY), { text: '↗ 初步轉強', group: 'm' })
  assert.equal(glyphFor('B', GLOSSARY), '強')

  // T: 糾結（帶箭頭）
  assert.deepEqual(tagLabel('T', GLOSSARY), { text: '↔ 糾結', group: 'm' })
  assert.equal(glyphFor('T', GLOSSARY), '糾')

  // N: 資料不足
  assert.deepEqual(tagLabel('N', GLOSSARY), { text: '資料不足', group: 'm' })
  assert.equal(glyphFor('N', GLOSSARY), '資')

  // 無資料／空值
  assert.equal(glyphFor(null, GLOSSARY), '—')
  assert.equal(glyphFor(undefined, GLOSSARY), '—')
})

test('explainFor 與 chartSvg：八種排列說明欄位與走勢圖 SVG 生成', () => {
  for (const k of CONTRACT.kinds) {
    const exp = explainFor(k, GLOSSARY)
    assert.ok(exp.key.length > 0, `${k} key 需非空`)
    assert.ok(exp.def.length > 0, `${k} def 需非空`)
    assert.ok(exp.meta.length > 0, `${k} meta 需非空`)
    assert.ok(exp.note.length > 0, `${k} note 需非空`)

    const svg = chartSvg(k, GLOSSARY)
    if (k === 'N') {
      assert.equal(exp.chart, null)
      assert.equal(svg, '', 'N 排列無示意圖')
    } else {
      assert.ok(exp.chart !== null, `${k} 需有 chart 資料`)
      assert.ok(svg.includes('role="img"'), `${k} SVG 需有 role="img"`)
      assert.ok(svg.includes('aria-label='), `${k} SVG 需有 aria-label`)
      assert.ok(svg.includes('不是實際股價'), `${k} SVG 需標明「不是實際股價」`)
    }
  }
})

test('M4-S17 明細頁說明文字：八種排列各自定義與比喻、轉弱與轉強說明、三條線怎麼想與順序檢查', () => {
  // 1. ma-glossary.json 的八種排列都有非空的定義與比喻
  for (const k of CONTRACT.kinds) {
    const item = GLOSSARY.kinds[k]
    assert.ok(item, `缺少排列 ${k}`)
    assert.ok(typeof item.def === 'string' && item.def.length > 0, `${k} 定義不能為空`)
    assert.ok(typeof item.meta === 'string' && item.meta.length > 0, `${k} 比喻不能為空`)
  }

  // 2. 轉弱的定義含「跌破 20 日線」
  const weakExp = explainFor('W', GLOSSARY)
  assert.ok(weakExp.def.includes('跌破 20 日線'), '轉弱的定義需含「跌破 20 日線」')

  // 3. 轉強的定義含「站回 20 日線與 60 日線」
  const strongExp = explainFor('S', GLOSSARY)
  assert.ok(strongExp.def.includes('站回 20 日線與 60 日線'), '轉強的定義需含「站回 20 日線與 60 日線」')

  // 4. 資料不足沒有示意圖、其餘七種都有
  assert.equal(chartSvg('N', GLOSSARY), '')
  for (const k of ['U', 'D', 'W', 'V', 'S', 'B', 'T']) {
    const svg = chartSvg(k, GLOSSARY)
    assert.ok(svg.length > 0, `${k} 必須有示意圖`)
  }

  // 5. 說明頁的種類順序與契約的 kinds 相同
  assert.deepEqual(GLOSSARY.order, CONTRACT.kinds)

  // 6. 渲染出的看懂排列整頁結構符合 S7 規範
  const html = renderGlossary(GLOSSARY, LINES)
  assert.ok(html.includes('三條線怎麼想'))
  assert.ok(html.includes('轉弱與轉強'))
  assert.ok(html.includes('八種排列'))
  assert.ok(html.includes('僅供參考，非投資建議。'))
})

test('卡片與各分頁渲染：包含八種 kind、剛加入、單檔失敗、骨架與重試按鈕', () => {
  // 1. 正常卡片包含 8 種 kind
  for (const k of CONTRACT.kinds) {
    const cardHtml = renderCard({ code: '2330', name: '台積電', kind: k, desc: '描述', ma: [100, 90, 80] }, GLOSSARY, LINES, false)
    assert.ok(cardHtml.includes('什麼意思？'))
    assert.ok(cardHtml.includes('aria-expanded="false"'))
    assert.ok(cardHtml.includes('aria-controls="why-2330"'))

    const openCard = renderCard({ code: '2330', name: '台積電', kind: k, desc: '描述', ma: [100, 90, 80] }, GLOSSARY, LINES, true)
    assert.ok(openCard.includes('收起說明'))
    assert.ok(openCard.includes('aria-expanded="true"'))
    assert.ok(openCard.includes('id="why-2330"'))
  }

  // 2. 剛加入標的卡片
  const pendCard = renderCard({ code: '2454', name: '聯發科', pending: true }, GLOSSARY, LINES, false)
  assert.ok(pendCard.includes('明天納入'))
  assert.ok(!pendCard.includes('什麼意思？'))

  // 3. 單檔取得失敗卡片（U16 驗收項）
  const failCard = renderCard({ code: '2603', name: '長榮', failed: true }, GLOSSARY, LINES, false)
  assert.ok(failCard.includes('沒拿到'))
  assert.ok(failCard.includes('這檔資料沒拿到。'))
  assert.ok(!failCard.includes('什麼意思？'))

  // 4. 歷史矩陣渲染
  const historyData = {
    days: ['10/1', '10/2'],
    rows: [
      { code: '2330', name: '台積電', cells: [{ kind: 'U', prev: null, changed: false }, { kind: 'W', prev: 'U', changed: true }] }
    ]
  }
  const histHtml = renderHistory(historyData, GLOSSARY, LINES, { code: '2330', index: 1, date: '10/2' })
  assert.ok(histHtml.includes('chg'))
  assert.ok(histHtml.includes('sel'))
  assert.ok(histHtml.includes('aria-label='))
  assert.ok(histHtml.includes('前一天是多頭排列'))

  // 5. 追蹤清單頁渲染
  const watchHtml = renderWatchlist({ items: [{ code: '2330', name: '台積電' }] }, 10, LINES, '測試錯誤')
  assert.ok(watchHtml.includes('aria-label="要追蹤的代號或名稱"'))
  assert.ok(watchHtml.includes('role="alert"'))
  assert.ok(watchHtml.includes('測試錯誤'))
})

test('V33、V32 與 U11 安全與架構約束檢驗', () => {
  const maJs = readFileSync(new URL('../web/ma.js', import.meta.url), 'utf8')
  const maRenderJs = readFileSync(new URL('../web/ma-render.js', import.meta.url), 'utf8')

  // V33: ma.js 中的 innerHTML 恰好出現 1 次
  const innerMatches = maJs.match(/innerHTML/g) || []
  assert.equal(innerMatches.length, 1, 'ma.js 中的 innerHTML 必須恰好出現 1 次')

  // V33: ma-render.js 不得包含 innerHTML
  const renderInnerMatches = maRenderJs.match(/innerHTML/g) || []
  assert.equal(renderInnerMatches.length, 0, 'ma-render.js 不得包含 innerHTML')

  // V33: 不得包含危險函式與跨網域連線
  for (const [name, code] of [['ma.js', maJs], ['ma-render.js', maRenderJs]]) {
    for (const sink of ['eval(', 'document.write', 'http://', 'https://']) {
      assert.ok(!code.includes(sink), `${name} 不得包含 ${sink}`)
    }
  }

  // U11: ma.js 與 ma-render.js 不得包含十六進位色碼
  for (const [name, code] of [['ma.js', maJs], ['ma-render.js', maRenderJs]]) {
    const hex = code.match(/#[0-9a-fA-F]{3,8}\b/g)
    assert.equal(hex, null, `${name} 不得包含十六進位色碼`)
  }

  // V32: 說明與台詞唯一來源，不得寫死設定檔之完整句子
  const getStrings = (obj) => {
    let res = []
    for (const k in obj) {
      if (typeof obj[k] === 'string') res.push(obj[k])
      else if (typeof obj[k] === 'object' && obj[k] !== null) res = res.concat(getStrings(obj[k]))
    }
    return res
  }
  const samples = [...getStrings(GLOSSARY), ...getStrings(LINES)]
    .map((s) => s.slice(0, 12))
    .filter((s) => s.length >= 8)

  for (const [name, code] of [['ma.js', maJs], ['ma-render.js', maRenderJs]]) {
    for (const sample of samples) {
      assert.ok(!code.includes(sample), `${name} 不得包含句子樣本：${sample}`)
    }
  }
})
