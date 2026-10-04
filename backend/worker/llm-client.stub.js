// 測試與離線開發用的 Stub：回放固定的串流片段，完全不連外、不消耗 API 額度。
// 介面與 worker/llm-client.js 完全相同，由環境變數 USE_STUB 決定載入哪一支。
//
// 腳本刻意把第一個標籤切成兩半（例如 [smi + le]），
// 讓端到端測試每一次都會走到「標籤跨 chunk」這條最容易漏掉的路徑。
//
// 後半段是六種失敗情境的腳本。除了 capped 之外，每一種都由一組關鍵字觸發；
// capped 是我們自己在路由層擋下來的，跟語言模型無關，所以這裡沒有它的腳本。
// 各腳本對應的真實觸發條件列在 reports/failure-matrix.md。

// 常數定義
const TEXT_EVENT = 'text'
const USAGE_EVENT = 'usage'
const STUB_SCRIPTS = [
  {
    match: '早安',
    chunks: ['[smi', 'le] 早安。', '今天也要好好吃飯喔。']
  },
  {
    match: '笑',
    chunks: ['[lau', 'gh] 這個真的很好笑，', '我忍不住了。']
  },
  {
    match: '累',
    chunks: ['[troub', 'led] 聽起來很辛苦。', '先休息一下好嗎？']
  },
  {
    match: '想你',
    // 第二個標籤也切成兩半：表情名稱不得在程式碼裡拼成完整字串（架構約束 A7）
    chunks: ['[smi', 'le] 我也在這裡等你。', '[neu', 'tral] 慢慢說沒關係。']
  },
  {
    // 輸入被安全過濾擋下：HTTP 狀態碼其實是 200，錯誤藏在第一個串流片段裡，
    // 一個字都還沒送出去，所以前端不需要撤回。
    match: '測試輸入阻擋',
    chunks: [],
    signal: { status: null, blockReason: 'SAFETY', finishReason: null }
  },
  {
    // 輸出中途被砍：前面的半句話已經送到前端了，所以 fallback 必須帶撤回指示。
    match: '測試輸出阻擋',
    chunks: ['[troub', 'led] 我剛剛想說的是'],
    signal: { status: null, blockReason: null, finishReason: 'PROHIBITED_CONTENT' }
  },
  {
    match: '測試額度',
    chunks: [],
    signal: { status: 429, blockReason: null, finishReason: null }
  },
  {
    match: '測試上游',
    chunks: [],
    signal: { status: 503, blockReason: null, finishReason: null }
  },
  {
    // 串流正常結束，但一個字都沒有
    match: '測試空回應',
    chunks: []
  },
  {
    match: '測試未知',
    chunks: [],
    signal: { status: 400, blockReason: null, finishReason: null }
  },
  {
    // 正常結束但理由代號不是安全類：依規格不算失敗，台詞照演
    match: '測試截斷',
    chunks: ['[neu', 'tral] 我話還沒說完'],
    finishReason: 'MAX_TOKENS'
  }
]
// 找不到關鍵字時回放這一段，內含一個不在對照表裡的標籤，用來驗證 fallback
const DEFAULT_SCRIPT = ['[neu', 'tral] 我在聽。', '[mystery_tag] 你想聊什麼都可以。']
const STUB_USAGE = { type: USAGE_EVENT, promptTokens: 120, outputTokens: 30 }
const BLOCKED_MESSAGE = '語言模型擋下了這次請求，理由代號'
const STATUS_MESSAGE = '語言模型服務回應狀態'
const EMPTY_TEXT = ''
const USER_ROLE = 'user'

// 功能函數定義

// 取出最後一則使用者訊息的內容，作為挑選腳本的依據
const lastUserContent = (messages) => {
  const list = Array.isArray(messages) ? messages : []
  const found = [...list].reverse().find((item) => item?.role === USER_ROLE)
  return typeof found?.content === 'string' ? found.content : EMPTY_TEXT
}

// 依關鍵字挑一份固定腳本，挑不到就用預設腳本（同樣輸入永遠得到同樣輸出）
export const pickScript = (messages) => {
  const content = lastUserContent(messages)
  const matched = STUB_SCRIPTS.find((script) => content.includes(script.match))
  return matched ? matched.chunks : DEFAULT_SCRIPT
}

// 挑出這次要用的整份腳本設定，含失敗訊號
const pickEntry = (messages) => {
  const content = lastUserContent(messages)
  return STUB_SCRIPTS.find((script) => content.includes(script.match)) ?? { chunks: DEFAULT_SCRIPT }
}

// 訊息只含狀態碼與理由代號，跟真實客戶端同一個規則
const describeSignal = (signal) =>
  signal.blockReason ?? signal.finishReason
    ? `${BLOCKED_MESSAGE} ${signal.blockReason ?? signal.finishReason}`
    : `${STATUS_MESSAGE} ${signal.status}`

// 回傳一個 async 產生器，逐次吐出 { type: 'text' } 與 { type: 'usage' } 事件
// 例外：ES 語法不支援箭頭產生器函式，此處依 EXPENSIVE-PLAN.md §4 豁免使用 async function*
export const streamCompletion = async function* (messages, env) {
  const entry = pickEntry(messages)
  for (const chunk of entry.chunks) {
    yield { type: TEXT_EVENT, text: chunk }
  }
  yield STUB_USAGE
  if (entry.signal) {
    throw Object.assign(new Error(describeSignal(entry.signal)), { signal: entry.signal })
  }
}
