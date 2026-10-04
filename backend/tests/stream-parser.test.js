// core/stream-parser.js 的單元測試。
// EXPENSIVE-PLAN.md §4 列出六種必須處理的情況，以下每一種都有對應測試，
// 測試名稱以「情況一」到「情況六」標示，驗收腳本會逐一 grep。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  createParserState,
  feedChunk,
  finalize,
  feedAll,
  cuesReadyAt,
  extractSseEvents
} from '../core/stream-parser.js'

// 常數定義
const CONFIG = JSON.parse(readFileSync(new URL('../config/emotion-map.json', import.meta.url), 'utf8'))
const EMOTION_MAP = CONFIG.emotionMap
const DEFAULT_EMOTION = CONFIG.defaultEmotion
const EMOTION_KEYS = Object.keys(EMOTION_MAP)
const OTHER_EMOTION = EMOTION_KEYS.find((key) => key !== DEFAULT_EMOTION)
const THIRD_EMOTION = EMOTION_KEYS.filter((key) => key !== DEFAULT_EMOTION)[1]
const UNKNOWN_TAG = 'not_a_real_emotion'

// 依序餵入多個片段的小工具，讓每個測試只描述輸入與期望
const feed = (chunks) => feedAll(chunks, EMOTION_MAP, DEFAULT_EMOTION)

test('createParserState 以預設表情開場，台詞、緩衝與表情提示皆為空', () => {
  assert.deepEqual(createParserState(DEFAULT_EMOTION), {
    emotion: DEFAULT_EMOTION,
    text: '',
    pending: '',
    cues: []
  })
})

test('情況一：標籤完整出現在第一個 chunk 內', () => {
  const state = feed([`[${OTHER_EMOTION}] 你回來了。`])
  assert.equal(state.emotion, OTHER_EMOTION)
  assert.equal(state.text, ' 你回來了。')
  assert.equal(state.pending, '')
})

test('情況二：標籤被切斷跨 chunk，兩段合起來才成立', () => {
  const head = `[${OTHER_EMOTION.slice(0, 2)}`
  const tail = `${OTHER_EMOTION.slice(2)}] 今天過得好嗎？`
  const afterHead = feedChunk(createParserState(DEFAULT_EMOTION), head, EMOTION_MAP, DEFAULT_EMOTION)
  // 標籤還沒閉合，先留在緩衝區，不能先吐出半截標籤
  assert.equal(afterHead.text, '')
  assert.equal(afterHead.pending, head)
  assert.equal(afterHead.emotion, DEFAULT_EMOTION)

  const afterTail = feedChunk(afterHead, tail, EMOTION_MAP, DEFAULT_EMOTION)
  assert.equal(afterTail.emotion, OTHER_EMOTION)
  assert.equal(afterTail.text, ' 今天過得好嗎？')
  assert.equal(afterTail.pending, '')
})

test('情況二補充：標籤被切成三段跨 chunk 也要能還原', () => {
  const state = feed(['[', OTHER_EMOTION.slice(0, 1), `${OTHER_EMOTION.slice(1)}] 嗨。`])
  assert.equal(state.emotion, OTHER_EMOTION)
  assert.equal(state.text, ' 嗨。')
})

test('情況三：台詞中途出現第二個標籤，表情要切換', () => {
  const state = feed([`[${OTHER_EMOTION}] 前半段。`, `[${THIRD_EMOTION}] 後半段。`])
  assert.equal(state.emotion, THIRD_EMOTION)
  assert.equal(state.text, ' 前半段。 後半段。')
})

test('情況四：完全沒有標籤，使用預設表情且台詞照常顯示', () => {
  const state = feed(['今天', '天氣不錯。'])
  assert.equal(state.emotion, DEFAULT_EMOTION)
  assert.equal(state.text, '今天天氣不錯。')
})

test('情況五：標籤不在對照表中，退回預設表情且該標籤仍被剝除', () => {
  const state = feed([`[${UNKNOWN_TAG}] 這句話還是要顯示。`])
  assert.equal(state.emotion, DEFAULT_EMOTION)
  assert.equal(state.text, ' 這句話還是要顯示。')
  assert.ok(!state.text.includes(UNKNOWN_TAG))
  assert.ok(!state.text.includes('['))
})

test('情況五補充：先切到合法表情，再遇到不在對照表的標籤要退回預設', () => {
  const state = feed([`[${OTHER_EMOTION}] 開心。`, `[${UNKNOWN_TAG}] 然後呢。`])
  assert.equal(state.emotion, DEFAULT_EMOTION)
  assert.equal(state.text, ' 開心。 然後呢。')
})

test('情況六：空字串輸入不會破壞狀態', () => {
  const start = createParserState(DEFAULT_EMOTION)
  const state = feedChunk(start, '', EMOTION_MAP, DEFAULT_EMOTION)
  assert.deepEqual(state, start)
  assert.deepEqual(feed([]), start)
  assert.deepEqual(feed(['', '', '']), start)
})

test('方括號不是合法標籤時原樣留在台詞裡', () => {
  const state = feed(['[123] 這是一般文字。'])
  assert.equal(state.emotion, DEFAULT_EMOTION)
  assert.equal(state.text, '[123] 這是一般文字。')
})

// 以下四則對應實測到的漏洞：模型在中文語境下把括號吐成全形，
// 舊版只認半形，結果臉沒換、標籤還原封不動印在台詞裡。
test('全形方括號的標籤也要換表情並從台詞剝除', () => {
  const state = feed([`［${OTHER_EMOTION}］呀……哥哥怎麼突然咬耳朵啦！`])
  assert.equal(state.emotion, OTHER_EMOTION)
  assert.equal(state.text, '呀……哥哥怎麼突然咬耳朵啦！')
})

test('半形全形混用的標籤也算數', () => {
  assert.equal(feed([`［${OTHER_EMOTION}] 嗨。`]).emotion, OTHER_EMOTION)
  assert.equal(feed([`[${OTHER_EMOTION}］ 嗨。`]).emotion, OTHER_EMOTION)
})

test('全形標籤被切斷跨 chunk 也要能還原', () => {
  const head = `［${OTHER_EMOTION.slice(0, 2)}`
  const afterHead = feedChunk(createParserState(DEFAULT_EMOTION), head, EMOTION_MAP, DEFAULT_EMOTION)
  assert.equal(afterHead.text, '')
  assert.equal(afterHead.pending, head)

  const afterTail = feedChunk(afterHead, `${OTHER_EMOTION.slice(2)}］好啊。`, EMOTION_MAP, DEFAULT_EMOTION)
  assert.equal(afterTail.emotion, OTHER_EMOTION)
  assert.equal(afterTail.text, '好啊。')
})

test('全形方括號不是合法標籤時原樣留在台詞裡', () => {
  const state = feed(['［123］這是一般文字。'])
  assert.equal(state.emotion, DEFAULT_EMOTION)
  assert.equal(state.text, '［123］這是一般文字。')
})

test('疑似標籤超過掃描上限就當成普通文字吐出，不會永遠卡在緩衝區', () => {
  const long = `[${'a'.repeat(45)}`
  const state = feed([long])
  assert.equal(state.text, long)
  assert.equal(state.pending, '')
})

test('普通文字不因為緩衝而延遲，逐字顯示要能即時拿到', () => {
  // 只有疑似標籤的尾巴會被緩衝，前面的台詞必須立刻進到 text
  const state = feed([`[${OTHER_EMOTION}] 先講這句[`])
  assert.equal(state.text, ' 先講這句')
  assert.equal(state.pending, '[')
})

test('feedChunk 不會就地改動舊狀態（不可變更新）', () => {
  const start = createParserState(DEFAULT_EMOTION)
  const next = feedChunk(start, `[${OTHER_EMOTION}] 哈囉`, EMOTION_MAP, DEFAULT_EMOTION)
  assert.equal(start.text, '')
  assert.equal(start.emotion, DEFAULT_EMOTION)
  assert.notEqual(next, start)
})

test('feedChunk 對非字串片段視為空字串', () => {
  const start = createParserState(DEFAULT_EMOTION)
  assert.deepEqual(feedChunk(start, undefined, EMOTION_MAP, DEFAULT_EMOTION), start)
})

test('finalize 後表情回復為預設表情', () => {
  const state = feed([`[${OTHER_EMOTION}] 說完了。`])
  const done = finalize(state, DEFAULT_EMOTION)
  assert.equal(done.emotion, DEFAULT_EMOTION)
  assert.equal(done.text, ' 說完了。')
  assert.equal(done.pending, '')
})

test('finalize 會把沒閉合的疑似標籤補回台詞，不吞字', () => {
  const state = feed(['台詞[abc'])
  assert.equal(state.pending, '[abc')
  const done = finalize(state, DEFAULT_EMOTION)
  assert.equal(done.text, '台詞[abc')
  assert.equal(done.pending, '')
})

// ---- 表情提示：記字數位置，不記時間 ----
// 標籤被剝掉的位置要留下來，呼叫端才能讓表情跟著逐字走而不是跟著串流走。

test('標籤記在它後面那個字的位置上', () => {
  const state = feed([`[${OTHER_EMOTION}]你好[${THIRD_EMOTION}]再見`])
  assert.equal(state.text, '你好再見')
  assert.deepEqual(state.cues, [
    { index: 0, emotion: OTHER_EMOTION },
    { index: 2, emotion: THIRD_EMOTION }
  ])
})

test('沒有標籤就沒有表情提示', () => {
  assert.deepEqual(feed(['今天天氣不錯。']).cues, [])
})

test('位置以整段台詞為準，不因為切成幾個 chunk 而改變', () => {
  const whole = feed([`[${OTHER_EMOTION}]你好嗎[${THIRD_EMOTION}]我很好`])
  const split = feed([`[${OTHER_EMOTION}]你`, '好', `嗎[${THIRD_EMOTION}]我`, '很好'])
  const cut = feed([`[${OTHER_EMOTION}]你好嗎[${THIRD_EMOTION.slice(0, 2)}`, `${THIRD_EMOTION.slice(2)}]我很好`])
  assert.deepEqual(split.cues, whole.cues)
  assert.deepEqual(cut.cues, whole.cues)
  assert.deepEqual(split.text, whole.text)
  assert.deepEqual(cut.text, whole.text)
})

test('同一個表情連下兩次標籤只記一次，退回預設表情則要記', () => {
  assert.deepEqual(feed([`[${OTHER_EMOTION}]甲[${OTHER_EMOTION}]乙`]).cues, [{ index: 0, emotion: OTHER_EMOTION }])
  assert.deepEqual(feed([`[${OTHER_EMOTION}]甲[${UNKNOWN_TAG}]乙`]).cues, [
    { index: 0, emotion: OTHER_EMOTION },
    { index: 1, emotion: DEFAULT_EMOTION }
  ])
})

test('標籤落在整段話最後面時，位置等於台詞總長', () => {
  const state = feed([`說完了[${OTHER_EMOTION}]`])
  assert.deepEqual(state.cues, [{ index: 3, emotion: OTHER_EMOTION }])
})

test('finalize 保留表情提示，逐字還沒追平的表情才演得完', () => {
  const state = feed([`[${OTHER_EMOTION}]你好`])
  assert.deepEqual(finalize(state, DEFAULT_EMOTION).cues, state.cues)
})

test('feedChunk 不會就地改動舊狀態的表情提示陣列', () => {
  const start = feed([`[${OTHER_EMOTION}]甲`])
  const next = feedChunk(start, `[${THIRD_EMOTION}]乙`, EMOTION_MAP, DEFAULT_EMOTION)
  assert.equal(start.cues.length, 1)
  assert.equal(next.cues.length, 2)
  assert.notEqual(start.cues, next.cues)
})

test('cuesReadyAt 只回傳已經到站、而且還沒演過的提示', () => {
  const state = feed([`[${OTHER_EMOTION}]你好[${THIRD_EMOTION}]再見`])
  // 逐字還沒開始：只有位置 0 的提示到站
  assert.deepEqual(cuesReadyAt(state, 0, 0), [{ index: 0, emotion: OTHER_EMOTION }])
  // 演過第一個之後，逐到第一個字還輪不到下一個
  assert.deepEqual(cuesReadyAt(state, 1, 1), [])
  // 逐到第二個字，第二個提示才到站
  assert.deepEqual(cuesReadyAt(state, 2, 1), [{ index: 2, emotion: THIRD_EMOTION }])
  // 全部演完就不再回傳
  assert.deepEqual(cuesReadyAt(state, 4, 2), [])
})

test('cuesReadyAt 一次可以回傳多個到站的提示，順序照台詞', () => {
  const state = feed([`[${OTHER_EMOTION}]甲[${THIRD_EMOTION}]乙`])
  assert.deepEqual(cuesReadyAt(state, 9, 0), state.cues)
})

test('cuesReadyAt 對缺漏或無效的輸入回傳空陣列而非炸掉', () => {
  assert.deepEqual(cuesReadyAt(undefined, 3, 0), [])
  assert.deepEqual(cuesReadyAt({}, 3, 0), [])
  assert.deepEqual(cuesReadyAt(feed(['沒有標籤']), Number.NaN, undefined), [])
})

// 這一則是整個設計的理由：串流快慢不同，演出必須一模一樣。
test('串流切法不影響演出：逐字重演出來的表情序列完全相同', () => {
  const reply = `[${OTHER_EMOTION}]呀……哥哥怎麼突然咬耳朵啦！[${THIRD_EMOTION}]你看你現在壞心眼的樣子。`
  // 逐字重演一次，回傳「第幾個字換成什麼表情」
  const replay = (chunks) => {
    const state = feed(chunks)
    const shown = []
    let done = 0
    for (let count = 0; count <= state.text.length; count += 1) {
      cuesReadyAt(state, count, done).forEach((cue) => {
        shown.push({ at: count, emotion: cue.emotion })
        done += 1
      })
    }
    return shown
  }
  const oneShot = replay([reply]) // 整段一次到齊（快網路）
  const perCharacter = replay([...reply]) // 一個字一個 chunk（慢網路）
  assert.deepEqual(perCharacter, oneShot)
  assert.deepEqual(oneShot, [
    { at: 0, emotion: OTHER_EMOTION },
    { at: 14, emotion: THIRD_EMOTION } // 「呀……哥哥怎麼突然咬耳朵啦！」共 14 個字
  ])
})

test('extractSseEvents 切出完整訊框並保留殘段', () => {
  const { events, rest } = extractSseEvents('data: one\n\ndata: two\n\ndata: par')
  assert.deepEqual(events, ['one', 'two'])
  assert.equal(rest, 'data: par')
})

test('extractSseEvents 支援 CRLF 換行並略過沒有資料的訊框', () => {
  const { events, rest } = extractSseEvents('event: ping\r\n\r\ndata: {"t":1}\r\n\r\n')
  assert.deepEqual(events, ['{"t":1}'])
  assert.equal(rest, '')
})

test('extractSseEvents 對空輸入與非字串輸入都回傳空結果', () => {
  assert.deepEqual(extractSseEvents(''), { events: [], rest: '' })
  assert.deepEqual(extractSseEvents(undefined), { events: [], rest: '' })
})
