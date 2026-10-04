// 串流文字的增量解析：一邊收 LLM 吐出的片段，一邊切出情緒標籤與台詞。
// 這是整個 MVP 最關鍵的模組，狀態為純資料、更新為不可變，方便離線逐格測試。
//
// 設計重點：標籤可能被切成兩半跨越兩個 chunk（例如 [neu + tral]），
// 所以遇到 [ 之後若還沒閉合，就把疑似標籤的片段留在 pending 等下一個 chunk，
// 但只緩衝「疑似標籤」的那一小段，其餘文字照樣即時吐出，逐字顯示不會卡住。
//
// 設計重點二：標籤被剝掉的位置會記進 cues，記的是「台詞的第幾個字」而不是時間。
// 表情若照解析時間換，就會跟著網路速度跑——串流比逐字快得多，整段話往往在第一個字
// 吐出來以前就解析完了，臉於是全部搶在台詞前面換完，甚至同一句話在快慢網路下
// 演出完全不同。改記字數位置之後，呼叫端只要在逐字逐到第 n 個字時比對 cues，
// 表情就一定落在它對應的那句話上，間隔自動等於兩個標籤之間的字數。

// 常數定義
const TAG_SCAN_LIMIT = 40 // 疑似標籤緩衝超過這個長度就當成普通文字吐出
// 半形與全形括號都收：中文語境下模型很容易把標籤吐成全形的 ［］，
// 只認半形的話標籤不但換不了臉，還會原封不動印在台詞裡給使用者看到。
// 開頭與結尾各自判斷，混用（［ 配 ]）也算數。
const OPEN_BRACKET_PATTERN = /^[[［]$/
const COMPLETE_TAG_PATTERN = /^[[［]([a-z_]+)[\]］]/ // 已閉合的合法標籤
const PARTIAL_TAG_PATTERN = /^[[［][a-z_]*$/ // 尚未閉合、但還可能長成標籤
const EMPTY_TEXT = ''
const SSE_FRAME_SEPARATOR = '\n\n'
const SSE_DATA_PREFIX = 'data:'
const CARRIAGE_RETURN_PATTERN = /\r\n/g

// 功能函數定義

// 標籤不在對照表裡就退回預設表情（core 不得相互相依，故此處自帶一份最小判斷）
const resolveTagEmotion = (tag, emotionMap, defaultEmotion) => {
  const safeMap = emotionMap ?? {}
  return Object.hasOwn(safeMap, tag) ? tag : defaultEmotion
}

// 從 index 起是否為一個已閉合的合法標籤，是的話回傳標籤名與長度
const readCompleteTag = (buffer, index) => {
  const matched = buffer.slice(index, index + TAG_SCAN_LIMIT).match(COMPLETE_TAG_PATTERN)
  return matched ? { tag: matched[1], length: matched[0].length } : null
}

// 從 index 到結尾是否還「可能」長成一個標籤（只由合法字元組成且尚未閉合）
const isPendingTag = (buffer, index) => {
  const rest = buffer.slice(index)
  if (rest.length > TAG_SCAN_LIMIT) return false
  return PARTIAL_TAG_PATTERN.test(rest)
}

// 掃過整個緩衝區，切出台詞、更新表情、留下疑似標籤的尾巴。
// cues 內的 index 是「相對這一段台詞」的位置，換算成絕對位置是 feedChunk 的事。
const scanBuffer = (buffer, emotion, emotionMap, defaultEmotion) => {
  let index = 0
  let text = EMPTY_TEXT
  let current = emotion
  const cues = []
  while (index < buffer.length) {
    if (OPEN_BRACKET_PATTERN.test(buffer[index])) {
      const found = readCompleteTag(buffer, index)
      if (found) {
        // 標籤一律從台詞中剝除，不論它在不在對照表裡
        const next = resolveTagEmotion(found.tag, emotionMap, defaultEmotion)
        // 只記真正的變化。同一個表情連下兩次標籤不必記，
        // 但退回預設表情算變化（不在對照表的標籤就是走這條路）。
        if (next !== current) {
          current = next
          // 記在「還沒吐出來的下一個字」上：標籤本來就寫在那個字前面
          cues.push({ index: text.length, emotion: next })
        }
        index += found.length
        continue
      }
      if (isPendingTag(buffer, index)) {
        return { emotion: current, text, pending: buffer.slice(index), cues }
      }
    }
    text += buffer[index]
    index += 1
  }
  return { emotion: current, text, pending: EMPTY_TEXT, cues }
}

// 把這一段掃出來的位置換算成整段台詞裡的絕對位置
const shiftCues = (cues, offset) => cues.map((cue) => ({ index: offset + cue.index, emotion: cue.emotion }))

// 建立一個解析狀態（純資料，不含副作用）
export const createParserState = (defaultEmotion) => ({
  emotion: defaultEmotion,
  text: EMPTY_TEXT,
  pending: EMPTY_TEXT,
  cues: []
})

// 餵入一段新的串流片段，回傳新的狀態（不可變更新）
export const feedChunk = (state, chunk, emotionMap, defaultEmotion) => {
  const previousText = state?.text ?? EMPTY_TEXT
  const buffer = (state?.pending ?? EMPTY_TEXT) + (typeof chunk === 'string' ? chunk : EMPTY_TEXT)
  const scanned = scanBuffer(buffer, state?.emotion, emotionMap, defaultEmotion)
  return {
    emotion: scanned.emotion,
    text: previousText + scanned.text,
    pending: scanned.pending,
    cues: [...(state?.cues ?? []), ...shiftCues(scanned.cues, previousText.length)]
  }
}

// 串流結束：沒閉合的疑似標籤當成普通文字補回台詞，表情回復為預設值。
// cues 原封不動留著：串流收完的時候逐字通常還沒追平，後面幾個表情要靠它才演得完。
export const finalize = (state, defaultEmotion) => ({
  emotion: defaultEmotion,
  text: (state?.text ?? EMPTY_TEXT) + (state?.pending ?? EMPTY_TEXT),
  pending: EMPTY_TEXT,
  cues: state?.cues ?? []
})

// 逐字逐到第 count 個字時，該演的表情是哪些：回傳還沒演到、但已經到站的那幾個。
// 呼叫端記住自己演到第幾個 cue（done），這裡只負責回答「接下來輪到誰」。
export const cuesReadyAt = (state, count, done) => {
  const cues = Array.isArray(state?.cues) ? state.cues : []
  const from = Number.isInteger(done) && done > 0 ? done : 0
  const shown = Number.isInteger(count) && count > 0 ? count : 0
  let to = from
  while (to < cues.length && cues[to].index <= shown) to += 1
  return cues.slice(from, to)
}

// 一次餵完整串陣列，方便測試與端到端流程（組合式用法）
export const feedAll = (chunks, emotionMap, defaultEmotion) =>
  (Array.isArray(chunks) ? chunks : []).reduce(
    (state, chunk) => feedChunk(state, chunk, emotionMap, defaultEmotion),
    createParserState(defaultEmotion)
  )

// 從一個 SSE 訊框中取出所有 data: 行的內容
const extractFrameData = (frame) =>
  frame
    .split('\n')
    .filter((line) => line.startsWith(SSE_DATA_PREFIX))
    .map((line) => line.slice(SSE_DATA_PREFIX.length).trim())
    .join('\n')

// 把累積的 SSE 位元組文字切成一則則事件，未收完的殘段留在 rest 等下一輪
export const extractSseEvents = (buffer) => {
  const normalized = (typeof buffer === 'string' ? buffer : EMPTY_TEXT).replace(CARRIAGE_RETURN_PATTERN, '\n')
  const parts = normalized.split(SSE_FRAME_SEPARATOR)
  const rest = parts.pop() ?? EMPTY_TEXT
  const events = parts.map(extractFrameData).filter((data) => data.length > 0)
  return { events, rest }
}
