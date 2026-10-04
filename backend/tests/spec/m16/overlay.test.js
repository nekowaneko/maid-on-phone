// M1.6 規格範例表（docs/M1.6-EXPENSIVE-PLAN.md §4.5）中懸浮窗演出的各列，凍結後不得修改。
// 角色頁的程式是一般 script（掛在全域），這裡用 node:vm 依序載入同一份檔案來測，不另寫一份。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { feedAll, finalize } from '../../../core/stream-parser.js'

// 常數定義
const PET_DIR = new URL('../../../../app/src/main/assets/pet/', import.meta.url)
const PET_SCRIPTS = ['emotion-map.js', 'vendor/stream-parser.js', 'performance.js'] // 與 index.html 的載入順序相同
const SAMPLE = '[pout]真拿主人沒辦法。[smile]水記得喝。'
const SAMPLE_TEXT = '真拿主人沒辦法。水記得喝。'

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

test('M16-S10 先換 pout 臉停 0.45 秒才出第一個字之後每 0.03 秒一個字打到第 9 個字時換 smile 臉', () => {
  const pet = loadPet()
  const map = pet.PetEmotionMap
  const plan = plain(pet.PetPerformance.planTimeline(SAMPLE, map.frames, map.defaultEmotion))
  assert.equal(plan.text, SAMPLE_TEXT)
  assert.deepEqual(plan.steps[0], { atMs: 0, face: 'pout' })
  const countAt = (count) => plan.steps.findIndex((step) => step.count === count)
  assert.equal(plan.steps[countAt(1)].atMs, 450)
  assert.equal(plan.steps[countAt(2)].atMs, 480)
  assert.equal(plan.steps[countAt(9)].atMs, 690)
  const smileAt = plan.steps.findIndex((step) => step.face === 'smile')
  assert.equal(plan.steps[smileAt].atMs, 690)
  assert.ok(smileAt < countAt(9))
  assert.ok(plan.steps.slice(0, countAt(9)).filter((step) => step.face === 'smile').length === 1)
  assert.ok(plan.steps.slice(1, smileAt).every((step) => step.face === undefined))
})

test('M16-S11 不在表情清單裡的標籤用平常的臉說而且泡泡裡看不到標籤', () => {
  const pet = loadPet()
  const map = pet.PetEmotionMap
  const plan = plain(pet.PetPerformance.planTimeline('[happy]你好', map.frames, map.defaultEmotion))
  assert.equal(plan.text, '你好')
  const faces = plan.steps.filter((step) => step.face !== undefined).map((step) => step.face)
  assert.ok(faces.length > 0)
  assert.ok(faces.every((face) => face === 'neutral'))
  assert.equal(pet.PetPerformance.frameFor('happy', map), 'idle.png')
  assert.equal(pet.PetPerformance.frameFor('neutral', map), 'idle.png')
  assert.equal(pet.PetPerformance.frameFor('pout', map), 'pout.png')
})

test('M16-S12 最後一個字出現後再過 3 秒換回平常的臉', () => {
  const pet = loadPet()
  const map = pet.PetEmotionMap
  const plan = plain(pet.PetPerformance.planTimeline('[smile]你好呀', map.frames, map.defaultEmotion))
  const lastChar = plan.steps.find((step) => step.count === 3)
  assert.equal(lastChar.atMs, 510)
  assert.equal(plan.endMs, 3510)
  assert.deepEqual(plan.steps[plan.steps.length - 1], { atMs: 3510, face: 'neutral' })
  assert.ok(plan.steps.slice(0, -1).every((step) => step.atMs < 3510))
})

test('M16-S13 演出中又來一則時第一則照常演完才開始演第二則', () => {
  const { PetPerformance: perf } = loadPet()
  const first = perf.stageSay(perf.createStage(), SAMPLE)
  assert.deepEqual(plain(first), { current: SAMPLE, waiting: [] })
  const both = perf.stageSay(first, '第二則')
  assert.deepEqual(plain(both), { current: SAMPLE, waiting: ['第二則'] })
  const next = perf.stageFinish(both)
  assert.deepEqual(plain(next), { current: '第二則', waiting: [] })
  assert.deepEqual(plain(perf.stageFinish(next)), { current: null, waiting: [] })
})

test('M16-S14 演出被打斷時直接跳到演完泡泡顯示全部完整台詞且換回平常的臉', () => {
  const { PetPerformance: perf, PetEmotionMap: map } = loadPet()
  const stage = perf.stageSay(perf.stageSay(perf.createStage(), SAMPLE), '[shy]第二則')
  const skipped = plain(perf.stageSkip(stage, map.frames, map.defaultEmotion))
  assert.deepEqual(skipped, {
    stage: { current: null, waiting: [] },
    text: `${SAMPLE_TEXT}\n\n第二則`,
    face: 'neutral'
  })
})

test('M16-S15 同一句帶標籤的台詞懸浮窗和聊天網頁解析出的文字與換臉位置完全一樣', () => {
  const pet = loadPet()
  const map = pet.PetEmotionMap
  const cases = [
    [SAMPLE],
    ['[po', 'ut]真拿主人', '沒辦法。[sm', 'ile]水記得喝。'],
    ['［shy］謝謝主人'],
    ['[happy]你好[pout]'],
    ['沒有標籤的一句話'],
    ['[Neutral-1] 不是標籤', '[abc']
  ]
  for (const chunks of cases) {
    const backend = finalize(feedAll(chunks, map.frames, map.defaultEmotion), map.defaultEmotion)
    const overlay = pet.PetStreamParser.finalize(
      pet.PetStreamParser.feedAll(chunks, map.frames, map.defaultEmotion),
      map.defaultEmotion
    )
    assert.deepEqual(plain(overlay), plain(backend), JSON.stringify(chunks))
  }
})
