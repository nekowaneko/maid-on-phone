// 懸浮窗角色頁的輔助測試（M1.6 B 線）：performance.js 的純函式邊界情況，以及 vendor 檔的產生方式。
// 角色頁是一般 script，這裡跟規格測試一樣用 node:vm 依序載入同一份檔案；DOM 行為交給 DEVICE-CHECKLIST-M1.6.md。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { buildVendor } from '../../tools/sync-overlay-vendor.mjs'

// 常數定義
const PET_DIR = new URL('../../app/src/main/assets/pet/', import.meta.url)
const PET_SCRIPTS = ['emotion-map.js', 'vendor/stream-parser.js', 'performance.js']
const PARSER_SOURCE = new URL('../core/stream-parser.js', import.meta.url)
const VENDOR_FILE = new URL('vendor/stream-parser.js', PET_DIR)

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

// 以角色頁的對照表排出演出步驟
const planOf = (script) => {
  const pet = loadPet()
  const map = pet.PetEmotionMap
  return plain(pet.PetPerformance.planTimeline(script, map.frames, map.defaultEmotion))
}

test('TIMING 照抄聊天網頁的節奏', () => {
  const { PetPerformance: perf } = loadPet()
  assert.deepEqual(plain(perf.TIMING), { leadMs: 450, charMs: 30, holdMs: 3000 })
})

test('planTimeline 的步驟依時間遞增排列，每個字恰好一個 count 步驟', () => {
  const plan = planOf('[pout]真拿主人沒辦法。[smile]水記得喝。[shy]')
  for (let i = 1; i < plan.steps.length; i += 1) {
    assert.ok(plan.steps[i].atMs >= plan.steps[i - 1].atMs, `第 ${i} 步時間倒退`)
  }
  const counts = plan.steps.filter((step) => step.count !== undefined).map((step) => step.count)
  assert.deepEqual(counts, Array.from({ length: plan.text.length }, (_, i) => i + 1))
})

test('沒有標籤時開頭與結尾都是平常的臉，中間沒有換臉', () => {
  const plan = planOf('該喝水了')
  const faces = plan.steps.filter((step) => step.face !== undefined)
  assert.deepEqual(faces, [{ atMs: 0, face: 'neutral' }, { atMs: 540 + 3000, face: 'neutral' }])
  assert.equal(plan.endMs, 3540)
})

test('標籤寫在最後一個字之後時，排在最後一個字的時間、count 之後', () => {
  const plan = planOf('你好[pout]')
  assert.equal(plan.text, '你好')
  const lastCount = plan.steps.findIndex((step) => step.count === 2)
  assert.deepEqual(plan.steps[lastCount + 1], { atMs: 480, face: 'pout' })
  assert.deepEqual(plan.steps[plan.steps.length - 1], { atMs: 3480, face: 'neutral' })
})

test('空字串與只有標籤時，以 leadMs 當最後一個字的時間', () => {
  assert.deepEqual(planOf(''), {
    text: '',
    steps: [{ atMs: 0, face: 'neutral' }, { atMs: 3450, face: 'neutral' }],
    endMs: 3450
  })
  const tagOnly = planOf('[pout]')
  assert.equal(tagOnly.text, '')
  assert.deepEqual(tagOnly.steps[0], { atMs: 0, face: 'pout' })
  assert.equal(tagOnly.endMs, 3450)
  assert.equal(tagOnly.steps.length, 2)
})

test('開頭連下兩個標籤時，開頭的臉用後面那一個', () => {
  const plan = planOf('[pout][smile]你好')
  assert.deepEqual(plan.steps[0], { atMs: 0, face: 'smile' })
  assert.ok(plan.steps.slice(1, -1).every((step) => step.face === undefined))
})

test('排隊報告補的 [neutral] 讓每則從平常的臉開始', () => {
  const plan = planOf('[neutral]・[pout]第一則')
  assert.deepEqual(plan.steps[0], { atMs: 0, face: 'neutral' })
  const pout = plan.steps.find((step) => step.face === 'pout')
  assert.equal(pout.atMs, 480) // 「第」是第 2 個字
})

test('非字串的台詞當成空字串，不丟例外', () => {
  const { PetPerformance: perf, PetEmotionMap: map } = loadPet()
  assert.equal(perf.planTimeline(undefined, map.frames, map.defaultEmotion).text, '')
})

test('frameFor 對原型鏈上的鍵與非字串都退回預設表情的圖', () => {
  const { PetPerformance: perf, PetEmotionMap: map } = loadPet()
  assert.equal(perf.frameFor('toString', map), 'idle.png')
  assert.equal(perf.frameFor(undefined, map), 'idle.png')
  assert.equal(perf.frameFor('shy', map), 'shy.png')
  assert.equal(perf.frameFor('pout', undefined), undefined)
})

test('舞台函式不改動傳入的物件', () => {
  const { PetPerformance: perf, PetEmotionMap: map } = loadPet()
  const stage = deepFreeze({ current: 'a', waiting: ['b'] })
  assert.deepEqual(plain(perf.stageSay(stage, 'c')), { current: 'a', waiting: ['b', 'c'] })
  assert.deepEqual(plain(perf.stageFinish(stage)), { current: 'b', waiting: [] })
  assert.deepEqual(plain(perf.stageSkip(stage, map.frames, map.defaultEmotion)).text, 'a\n\nb')
  assert.deepEqual(plain(stage), { current: 'a', waiting: ['b'] })
  const empty = deepFreeze(perf.createStage())
  const said = perf.stageSay(empty, 'x')
  assert.deepEqual(plain(said), { current: 'x', waiting: [] })
  assert.notEqual(said.waiting, empty.waiting)
})

test('stageSkip 沒有任何演出時回傳空字串與平常的臉', () => {
  const { PetPerformance: perf, PetEmotionMap: map } = loadPet()
  assert.deepEqual(plain(perf.stageSkip(perf.createStage(), map.frames, map.defaultEmotion)), {
    stage: { current: null, waiting: [] },
    text: '',
    face: 'neutral'
  })
  assert.deepEqual(plain(perf.stageSkip(undefined, map.frames, map.defaultEmotion)).text, '')
})

test('stageFinish 依序叫出排隊中的每一則', () => {
  const { PetPerformance: perf } = loadPet()
  let stage = ['一', '二', '三'].reduce((acc, script) => perf.stageSay(acc, script), perf.createStage())
  const order = []
  while (stage.current !== null) {
    order.push(stage.current)
    stage = perf.stageFinish(stage)
  }
  assert.deepEqual(order, ['一', '二', '三'])
})

test('vendor 檔等於同步腳本由 backend/core/stream-parser.js 產生的內容', () => {
  const expected = buildVendor(readFileSync(PARSER_SOURCE, 'utf8'))
  const actual = readFileSync(VENDOR_FILE, 'utf8').replace(/\r\n/g, '\n')
  assert.equal(actual, expected)
})

test('同步腳本只去掉行首 export 並包一層，其餘逐字保留', () => {
  const source = 'export const a = 1\nconst b = "export x"\r\nexport const c = 2\n'
  const lines = buildVendor(source).split('\n')
  assert.equal(lines[0], '// 此檔由 tools/sync-overlay-vendor.mjs 產生，不得手改')
  assert.equal(lines[1], '(function (root) {')
  assert.deepEqual(lines.slice(2, 5), ['const a = 1', 'const b = "export x"', 'const c = 2'])
  assert.match(lines[5], /^root\.PetStreamParser = \{ createParserState, feedChunk, finalize, cuesReadyAt, feedAll, extractSseEvents \}$/)
  assert.equal(lines[6], '})(this)')
  assert.equal(lines.length, 8)
})

test('vendor 掛上的 PetStreamParser 與 backend 的匯出名稱一致', async () => {
  const backend = await import('../core/stream-parser.js')
  const { PetStreamParser: parser } = loadPet()
  assert.deepEqual(Object.keys(parser).sort(), Object.keys(backend).sort())
})
