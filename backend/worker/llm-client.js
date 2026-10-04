// 真實 LLM 呼叫：全專案唯一允許對外發出請求的檔案（架構約束 A2）。
// 供應商是 Google Gemini；金鑰只從 Worker 的環境變數讀取，
// 永遠不會出現在回應、log 或錯誤訊息裡。

import { extractSseEvents } from '../core/stream-parser.js'
import { BLOCKING_FINISH_REASONS } from '../core/failure.js'

// 常數定義
const API_ORIGIN = 'https://generativelanguage.googleapis.com'
const MODEL_PATH = '/v1beta/models'
// 中繼站：Cloudflare 的對外請求從香港出去，Gemini 不供應該地區。
// 設了 LLM_RELAY_ORIGIN 就改走中繼站，沒設就直連 Google（本機開發照舊）。
const RELAY_SECRET_HEADER = 'x-relay-secret'
const API_METHOD = 'streamGenerateContent'
const API_QUERY = '?alt=sse' // 少了這個參數會回傳整包 JSON 陣列，不是逐段的 SSE
const FALLBACK_MODEL = 'gemini-3.5-flash-lite' // 未設定 LLM_MODEL 時採用的型號
const MAX_OUTPUT_TOKENS = 1024
const EMPTY_TEXT = ''
const SYSTEM_ROLE = 'system'
const ASSISTANT_ROLE = 'assistant'
const MODEL_ROLE = 'model'
const USER_ROLE = 'user'
const TEXT_EVENT = 'text'
const USAGE_EVENT = 'usage'
const STATUS_MESSAGE = '語言模型服務回應狀態'
const BLOCKED_MESSAGE = '語言模型擋下了這次請求，理由代號'
// 串流已經開始之後才失敗的話，狀態碼已經沒有意義，一律填 null
const NO_STATUS = null

// 功能函數定義

// 取出系統提示詞：Gemini 把 system_instruction 與對話內容分開放
const extractSystemPrompt = (messages) => {
  const found = (Array.isArray(messages) ? messages : []).find((item) => item?.role === SYSTEM_ROLE)
  return typeof found?.content === 'string' ? found.content : EMPTY_TEXT
}

// 換成 Gemini 認得的角色名稱：它只收 user 與 model，沒有 assistant
const toGeminiRole = (role) => (role === ASSISTANT_ROLE ? MODEL_ROLE : USER_ROLE)

// 只留下真正的對話訊息，並改寫成 Gemini 的 contents 格式
const extractContents = (messages) =>
  (Array.isArray(messages) ? messages : [])
    .filter((item) => item?.role !== SYSTEM_ROLE)
    .map((item) => ({
      role: toGeminiRole(item?.role),
      parts: [{ text: String(item?.content ?? EMPTY_TEXT) }]
    }))

// 組出請求網址：型號放在路徑上，金鑰不放這裡（見 buildHeaders）。
// 路徑對兩種出口都一樣，中繼站只換掉前面的網域。
const buildUrl = (env) =>
  `${env?.LLM_RELAY_ORIGIN ?? API_ORIGIN}${MODEL_PATH}/${env?.LLM_MODEL ?? FALLBACK_MODEL}:${API_METHOD}${API_QUERY}`

// 組出請求主體
const buildRequestBody = (messages) => ({
  system_instruction: { parts: [{ text: extractSystemPrompt(messages) }] },
  contents: extractContents(messages),
  generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS }
})

// 組出請求標頭；金鑰只在這裡出現一次，且不做任何字串拼接與輸出。
// Gemini 也接受把金鑰放在查詢字串，但那會讓它出現在各種網址紀錄裡，所以一律走標頭。
// 走中繼站時多帶一個共用密鑰，免得中繼站變成任何人都能用的公開跳板。
const buildHeaders = (env) => ({
  'content-type': 'application/json',
  'x-goog-api-key': env?.LLM_API_KEY ?? EMPTY_TEXT,
  ...(env?.LLM_RELAY_ORIGIN ? { [RELAY_SECRET_HEADER]: env?.LLM_RELAY_SECRET ?? EMPTY_TEXT } : {})
})

// 從一則 SSE 資料中取出這次要吐出的文字，沒有文字就回傳空字串。
// 帶 thought 標記的片段是模型的思考過程而不是台詞，必須濾掉，
// 否則思考內容會被當成角色的話逐字顯示出來。
const extractDeltaText = (data) => {
  try {
    const parsed = JSON.parse(data)
    const parts = parsed?.candidates?.[0]?.content?.parts
    if (!Array.isArray(parts)) return EMPTY_TEXT
    return parts
      .filter((part) => part?.thought !== true && typeof part?.text === 'string')
      .map((part) => part.text)
      .join(EMPTY_TEXT)
  } catch (error) {
    // 非 JSON 的心跳或註解訊框直接略過，不中斷整段串流
    return EMPTY_TEXT
  }
}

// 從一則 SSE 資料中取出 token 用量。每個片段都可能帶，後面的比前面的完整。
const extractUsage = (data) => {
  try {
    const meta = JSON.parse(data)?.usageMetadata
    if (!meta) return null
    return {
      type: USAGE_EVENT,
      promptTokens: Number(meta.promptTokenCount) || 0,
      outputTokens: Number(meta.candidatesTokenCount) || 0
    }
  } catch (error) {
    return null
  }
}

// 取出輸入被擋的理由；輸入被擋時 HTTP 狀態碼是 200，錯誤藏在串流片段裡
const extractBlockReason = (data) => {
  try {
    const reason = JSON.parse(data)?.promptFeedback?.blockReason
    return typeof reason === 'string' && reason.length > 0 ? reason : null
  } catch (error) {
    return null
  }
}

// 取出輸出被砍的理由，且只認安全類的那幾個；MAX_TOKENS、STOP 是正常結束
const extractBlockingFinishReason = (data) => {
  try {
    const reason = JSON.parse(data)?.candidates?.[0]?.finishReason
    return BLOCKING_FINISH_REASONS.includes(reason) ? reason : null
  } catch (error) {
    return null
  }
}

// 從上游的錯誤回應取出理由代號。Google 的錯誤格式是 { error: { status } }，
// status 是 FAILED_PRECONDITION、INVALID_ARGUMENT 這類固定代號，不含使用者內容。
// 讀不到就回 null，診斷用的東西不該讓原本的錯誤處理更難處理。
const readErrorStatus = async (response) => {
  try {
    return JSON.parse(await response.text())?.error?.status ?? null
  } catch (error) {
    return null
  }
}

// 丟出帶訊號的錯誤。訊息只含狀態碼與理由代號，不含回應內容或任何憑證片段。
const throwSignal = (message, signal) => {
  throw Object.assign(new Error(message), { signal })
}

// 回傳一個 async 產生器，逐次吐出 { type: 'text' } 與 { type: 'usage' } 事件
// 例外：ES 語法不支援箭頭產生器函式，此處依 EXPENSIVE-PLAN.md §4 豁免使用 async function*
export const streamCompletion = async function* (messages, env) {
  const response = await fetch(buildUrl(env), {
    method: 'POST',
    headers: buildHeaders(env),
    body: JSON.stringify(buildRequestBody(messages))
  })
  // 只回報狀態碼，不把回應內容或標頭往外送，避免夾帶憑證片段
  if (!response.ok || !response.body) {
    // 失敗時多記一個上游的理由代號（例如 FAILED_PRECONDITION、INVALID_ARGUMENT）。
    // 只取代號，不取 message 也不取標頭，維持「不夾帶憑證或回應內容」的原則。
    // 光看狀態碼分不出「地區不支援」與「請求格式錯誤」，兩者都是 400。
    // 理由代號一起帶進訊號，讓 classifyFailure 分得出「地區不支援」與「請求格式錯誤」——
    // 兩者都是 400，只有代號分得開。代號是固定字串，不含使用者內容或憑證。
    const reason = await readErrorStatus(response)
    console.error(`${STATUS_MESSAGE} ${response.status}`, '理由代號：', reason)
    throwSignal(`${STATUS_MESSAGE} ${response.status}`, {
      status: response.status,
      blockReason: null,
      finishReason: null,
      reason
    })
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = EMPTY_TEXT
  let reading = true
  while (reading) {
    const { value, done } = await reader.read()
    if (done) {
      reading = false
      continue
    }
    buffer += decoder.decode(value, { stream: true })
    const parsed = extractSseEvents(buffer)
    buffer = parsed.rest
    for (const data of parsed.events) {
      const blockReason = extractBlockReason(data)
      if (blockReason !== null) {
        throwSignal(`${BLOCKED_MESSAGE} ${blockReason}`, {
          status: NO_STATUS,
          blockReason,
          finishReason: null
        })
      }
      const usage = extractUsage(data)
      if (usage !== null) yield usage
      const piece = extractDeltaText(data)
      if (piece.length > 0) yield { type: TEXT_EVENT, text: piece }
      const finishReason = extractBlockingFinishReason(data)
      if (finishReason !== null) {
        throwSignal(`${BLOCKED_MESSAGE} ${finishReason}`, {
          status: NO_STATUS,
          blockReason: null,
          finishReason
        })
      }
    }
  }
}
