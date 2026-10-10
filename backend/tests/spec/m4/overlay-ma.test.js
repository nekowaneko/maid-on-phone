// M4 規格範例表（docs/M4-EXPENSIVE-PLAN.md §4.5）中前端的各列（M4-S15B、M4-S17），凍結後不得修改。
// 角色頁的程式是一般 script（掛在全域），這裡用 node:vm 依 index.html 的順序載入同一份檔案來測；
// 明細網頁的 ma-render.js 是 ES module，直接 import。說明文字以 backend/config/ma-glossary.json 為準，接口以 ma-contract.json 為準。

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
  'todoist-view.js',
  'ma-labels.js',
  'ma-view.js'
] // 與 index.html 的載入順序相同
const readConfig = (name) => readFileSync(new URL(`../../../config/${name}`, import.meta.url), 'utf8')
const CONTRACT = JSON.parse(readConfig('ma-contract.json'))
const GLOSSARY = JSON.parse(readConfig('ma-glossary.json'))
const SCRIPT = '[smile]主人早安～今天的均線我整理好了。'

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

// 算出泡泡的檢視
const viewOf = (data) => {
  const pet = loadPet()
  return plain(pet.PetMaView.viewFor(data, pet.PetMaLabels))
}

test('M4-S15B 報告泡泡：正常有摘要與「看明細」「晚點再看」，失敗只有「知道了」，壞資料沒有按鈕，按鈕列有「📈 盤前均線」', () => {
  const ok = viewOf({ date: '2026-10-14', asOf: '2026-10-13', u: 1, d: 1, m: 3, status: 'ok', script: SCRIPT })
  assert.deepEqual(ok, {
    script: SCRIPT,
    summary: { u: 1, d: 1, m: 3 },
    buttons: [
      { label: '看明細', action: { action: 'openMa' } },
      { label: '晚點再看', action: { action: 'dismiss' } }
    ]
  })

  const failed = viewOf({ date: '2026-10-14', asOf: '', u: 0, d: 0, m: 0, status: 'failed', script: SCRIPT })
  assert.deepEqual(failed, {
    script: SCRIPT,
    summary: null,
    buttons: [{ label: '知道了', action: { action: 'dismiss' } }]
  })

  // 不認得的狀態、缺檔數、檔數不是整數、負數：沒有摘要也沒有按鈕，台詞照留
  for (const bad of [
    { status: 'weird', u: 1, d: 1, m: 1, script: SCRIPT },
    { status: 'ok', d: 1, m: 1, script: SCRIPT },
    { status: 'ok', u: '1', d: 1, m: 1, script: SCRIPT },
    { status: 'ok', u: 1.5, d: 1, m: 1, script: SCRIPT },
    { status: 'ok', u: -1, d: 1, m: 1, script: SCRIPT }
  ]) {
    assert.deepEqual(viewOf(bad), { script: SCRIPT, summary: null, buttons: [] })
  }
  assert.deepEqual(viewOf({ status: 'weird' }), { script: '', summary: null, buttons: [] })

  // 動作代號都在契約內，按鈕文字取自 ma-labels.js
  const pet = loadPet()
  const used = new Set([...ok.buttons, ...failed.buttons].map((b) => b.action.action))
  for (const code of used) assert.ok(CONTRACT.bubbleActions.includes(code), code)
  assert.equal(pet.PetMaLabels.mainButton, '📈 盤前均線')

  // index.html：載入順序、第 5 顆按鈕、與原生的橋接
  const html = readFileSync(new URL('index.html', PET_DIR), 'utf8')
  const pos = (name) => html.indexOf(`src="${name}"`)
  assert.ok(pos('todoist-view.js') >= 0 && pos('ma-labels.js') > pos('todoist-view.js'))
  assert.ok(pos('ma-view.js') > pos('ma-labels.js'))
  assert.ok(html.includes('id="ma"'))
  assert.ok(html.includes('onMaPressed'))
  assert.ok(html.includes('showMa'))
})

test('M4-S17 說明文字：八種排列都有定義與比喻，轉弱與轉強說得清楚，由設定檔顯示不經語言模型', async () => {
  const render = await import(new URL('../../../web/ma-render.js', import.meta.url))
  const { explainFor, tagLabel, glyphFor, chartSvg, escapeHtml } = render

  // 種類順序與契約相同
  assert.deepEqual(GLOSSARY.order, CONTRACT.kinds)
  assert.equal(CONTRACT.kinds.length, 8)

  for (const kind of CONTRACT.kinds) {
    const e = explainFor(kind, GLOSSARY)
    assert.ok(typeof e.def === 'string' && e.def.length > 0, `${kind} 定義`)
    assert.ok(typeof e.meta === 'string' && e.meta.length > 0, `${kind} 比喻`)
    assert.equal(e.key, GLOSSARY.key)
    assert.equal(e.note, GLOSSARY.chartNote)
    assert.equal(e.def, GLOSSARY.kinds[kind].def)
    assert.equal(e.meta, GLOSSARY.kinds[kind].meta)
    if (kind === 'N') {
      assert.equal(e.chart, null)
      assert.equal(chartSvg(kind, GLOSSARY), '')
    } else {
      assert.equal(e.chart.a5.length, 6)
      assert.equal(e.chart.a20.length, 6)
      assert.equal(e.chart.a60.length, 6)
      const svg = chartSvg(kind, GLOSSARY)
      assert.ok(svg.includes('role="img"') && svg.includes('aria-label') && svg.includes('不是實際股價'), `${kind} 示意圖`)
    }
  }

  // 轉弱、轉強說清楚
  assert.ok(explainFor('W', GLOSSARY).def.includes('跌破 20 日線'))
  assert.ok(explainFor('S', GLOSSARY).def.includes('站回 20 日線與 60 日線'))
  assert.ok(GLOSSARY.weakStrong.weak.includes('轉弱') && GLOSSARY.weakStrong.strong.includes('轉強'))

  // 標籤與歷史格子上的字
  assert.deepEqual(plain(tagLabel('W', GLOSSARY)), { text: '↘ 轉弱', group: 'm' })
  assert.deepEqual(plain(tagLabel('S', GLOSSARY)), { text: '↗ 轉強', group: 'm' })
  assert.deepEqual(plain(tagLabel('U', GLOSSARY)), { text: '多頭排列', group: 'u' })
  assert.deepEqual(plain(tagLabel('D', GLOSSARY)), { text: '空頭排列', group: 'd' })
  const glyphs = { U: '多', D: '空', W: '弱', V: '弱', S: '強', B: '強', T: '糾', N: '資' }
  for (const [kind, glyph] of Object.entries(glyphs)) assert.equal(glyphFor(kind, GLOSSARY), glyph, kind)

  // 外部輸入要跳脫
  assert.ok(!escapeHtml('<img src=x onerror=alert(1)>').includes('<'))

  // 說明文字不寫死在網頁程式裡（由設定檔顯示）
  const source = readFileSync(new URL('../../../web/ma-render.js', import.meta.url), 'utf8')
  assert.ok(!source.includes(GLOSSARY.kinds.W.meta))
  assert.ok(!source.includes(GLOSSARY.weakStrong.note))
})
