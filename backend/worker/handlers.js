// 路由層：路徑判斷、請求解析與 SSE 組裝全部集中在這裡。
// 本檔案不 import 任何 .md 或 .json（架構約束 A9），設定與相依一律由 deps 注入，
// 因此它在 Node 下載得動，測試可以直接呼叫 createHandler(deps) 回傳的處理函式。
//
// deps 的形狀見 EXPENSIVE-PLAN-2.md §4.1.1。其中 streamer 由呼叫端先綁好環境變數，
// 這支只管把訊息陣列交出去，不認識 env，也不認識任何憑證。

import { buildEmotionList, buildSystemPrompt, buildHistoryText, trimHistory } from '../core/prompt.js'
import { buildTimeGapHint } from '../core/time-gap.js'
import { isAuthorized } from '../core/auth.js'
import { classifyFailure, shouldRetract, buildFallbackText } from '../core/failure.js'
import { zonedDateKey, nextResetMs, summarizeUsage } from '../core/quota.js'
import { validatePersona } from '../core/persona.js'
import { isMessageAcceptable, describeMessage } from '../core/message.js'
import {
  validatePushPayload,
  newPushId,
  buildFcmMessage,
  isPushConfigured,
  PUSH_FORMAT_MESSAGE,
  PUSH_TOO_LONG_MESSAGE,
  PUSH_NOT_CONFIGURED_MESSAGE,
  PUSH_FAILED_MESSAGE
} from '../core/push.js'

// 常數定義
const API_PREFIX = '/api/' // 授權只掛在這個前綴底下（架構約束 A8）
const SECRET_HEADER = 'x-app-secret'
const CHAT_PATH = '/api/chat'
const PERSONA_PATH = '/api/persona'
const USAGE_PATH = '/api/usage'
const PUSH_PATH = '/api/push' // M1.5：送一則純資料推播到手機
const RANDOM_ID_LENGTH = 8 // 推播編號的亂數段取 randomUUID 前 8 碼
const UNKNOWN_CODE = 'UNKNOWN'
const PUSH_TOO_LONG_REASON = 'too_long'
const RPM_WINDOW_MS = 60000 // 每分鐘請求數用 60 秒滑動窗
// 小檔案存在 settings 表的這個 key，改動時間另外存一個 key，
// 這樣儲存層的介面不必為了一個時間戳而多開一個方法
const PERSONA_KEY = 'persona'
const PERSONA_UPDATED_KEY = 'persona:updatedAt'
const ROOT_PATH = '/'
const APP_PATH = '/web/index.html' // 網站入口，根目錄沒有 index.html
const HISTORY_TURN_LIMIT = 20 // 最近 20 輪，超過從最舊的開始丟棄
const SSE_HEADERS = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache',
  connection: 'keep-alive'
}
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'access-control-allow-headers': 'content-type, x-app-secret'
}
const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }
const DELTA_EVENT = 'delta'
const DONE_EVENT = 'done'
const FALLBACK_EVENT = 'fallback'
// 語言模型客戶端吐出來的兩種事件
const TEXT_EVENT = 'text'
const USAGE_EVENT = 'usage'
const EMPTY_USAGE = { promptTokens: 0, outputTokens: 0 }
const BAD_REQUEST_MESSAGE = '請求格式不正確：缺少 message 欄位。'
const TOO_LONG_MESSAGE = '訊息太長了。'
const NOT_FOUND_MESSAGE = '找不到這個路徑。'
// 授權失敗一律回這一句，不說明是沒帶還是帶錯，避免拿回應內容去試密鑰
const UNAUTHORIZED_MESSAGE = '未授權。'
const EMPTY_TEXT = ''
const POST_METHOD = 'POST'
const GET_METHOD = 'GET'
const PUT_METHOD = 'PUT'
const DELETE_METHOD = 'DELETE'
const OPTIONS_METHOD = 'OPTIONS'
const METHOD_NOT_ALLOWED_MESSAGE = '這個路徑不接受這種方法。'

// 功能函數定義

// 把一則事件編成 SSE 訊框
const encodeEvent = (payload) => `data: ${JSON.stringify(payload)}\n\n`

// 現在時間；測試會注入固定時間，跨日的判定才不會在半夜偶然翻臉。
// 沒注入就用系統時間，這是 §4.1.1 給 now 的預設值。
const readNow = (deps) => (deps.now ? deps.now() : Date.now())

// 今天是哪一天，依 config/quota.json 的時區切
const todayKey = (deps, nowMs) => zonedDateKey(nowMs, deps.quotaConfig?.utcOffsetMinutes)

// 組一則 fallback 事件。台詞與表情全部來自設定檔，這裡只轉手。
const fallbackEvent = (deps, kind, retract) => ({
  type: FALLBACK_EVENT,
  text: buildFallbackText(deps.fallbackConfig, kind),
  retract
})

// 讀取請求主體，格式不對就回傳 null
const readPayload = async (request) => {
  try {
    return await request.json()
  } catch (error) {
    return null
  }
}

// 統一的 JSON 回應
const jsonResponse = (payload, status) =>
  new Response(JSON.stringify(payload), { status, headers: { ...JSON_HEADERS, ...CORS_HEADERS } })

// 目前生效的小檔案：存過就用存的那一份，沒存過就用 config/persona.md 帶進來的預設值。
// 「一鍵還原」就是把存檔刪掉，讓這裡自然退回預設值。
const readPersona = async (deps) => {
  const stored = await deps.store.readSetting(PERSONA_KEY)
  return typeof stored === 'string' && stored.length > 0 ? stored : deps.personaText
}

// 組出這一輪要送給語言模型的訊息陣列
const buildMessages = (deps, personaText, payload) => {
  const history = trimHistory(payload?.history, HISTORY_TURN_LIMIT)
  const systemPrompt = buildSystemPrompt(deps.templateText, {
    persona: personaText,
    emotionList: buildEmotionList(deps.emotionConfig.emotionMap),
    timeGap: buildTimeGapHint(payload?.minutesSinceLastSeen, deps.gapConfig.tiers),
    history: buildHistoryText(history)
  })
  return [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: String(payload?.message ?? EMPTY_TEXT) }
  ]
}

// 不論成功或失敗都要記一次；capped 除外，那一種根本沒送出任何對外請求。
// 記錄失敗不該把整條回應弄壞，所以這裡自己把例外吃掉，只留一行日誌。
const recordUsage = async (deps, dateKey, nowMs, usage) => {
  try {
    await deps.store.recordRequest(dateKey, nowMs)
    await deps.store.addTokens(dateKey, usage.promptTokens, usage.outputTokens)
  } catch (error) {
    console.error('用量記錄失敗：', error?.message)
  }
}

// 一整條對話的 SSE：文字逐段轉發，失敗就改送一則 fallback 事件。
// 六種失敗全部走這一條串流，前端因此只要認得 delta / fallback / done 三種事件。
const toChatStream = (deps, personaText, payload, capped) => {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start: async (controller) => {
      const send = (event) => controller.enqueue(encoder.encode(encodeEvent(event)))
      // 自己擋下來的請求：直接演 fallback，不送出去，也不計入用量，
      // 否則自訂上限會把自己越擋越死
      if (capped) {
        send(fallbackEvent(deps, classifyFailure({ capped: true }).kind, false))
        send({ type: DONE_EVENT })
        controller.close()
        return
      }
      const nowMs = readNow(deps)
      const dateKey = todayKey(deps, nowMs)
      let sawText = false
      let usage = EMPTY_USAGE
      try {
        for await (const event of deps.streamer(buildMessages(deps, personaText, payload))) {
          if (event?.type === TEXT_EVENT) {
            sawText = true
            send({ type: DELTA_EVENT, text: event.text })
          }
          // 每個片段都可能帶用量，後面的比前面的完整，所以一路覆蓋到最後一個
          if (event?.type === USAGE_EVENT) usage = event
        }
        // 串流正常結束卻一個字都沒有，一樣要給使用者一句話
        if (!sawText) send(fallbackEvent(deps, classifyFailure({ sawText }).kind, false))
      } catch (error) {
        // 只記在伺服器端日誌（wrangler tail 看得到）。
        // llm-client.js 丟出的訊息依設計只含狀態碼與理由代號，不含回應內容或憑證。
        console.error('串流失敗：', error?.message)
        const signal = { ...(error?.signal ?? {}), sawText }
        send(fallbackEvent(deps, classifyFailure(signal).kind, shouldRetract(signal)))
      }
      await recordUsage(deps, dateKey, nowMs, usage)
      send({ type: DONE_EVENT })
      controller.close()
    }
  })
}

// 今天送出去的次數有沒有撞到我們自己設的天花板
const isCapped = async (deps, nowMs) => {
  const cap = deps.quotaConfig?.selfCap?.dailyRequests
  if (typeof cap !== 'number' || !Number.isFinite(cap)) return false
  const daily = await deps.store.readDaily(todayKey(deps, nowMs))
  return daily.requests >= cap
}

// 處理一次對話請求
const handleChat = async (deps, request) => {
  const payload = await readPayload(request)
  // 先修剪再判斷：輸入框可以換行之後，「只有空白與換行」是很容易送出的東西，
  // 而它對模型來說跟空訊息沒有兩樣。前端已經修剪過，但這裡不能倚賴前端。
  const message = typeof payload?.message === 'string' ? payload.message.trim() : null
  if (message === null || message.length === 0) {
    return jsonResponse({ error: BAD_REQUEST_MESSAGE }, 400)
  }
  // 長度自己再擋一次：前端擋過不代表這裡可以不擋（失敗時關門，不是開門）。
  // 兩邊讀同一份 config/message.json，判定也是同一支函式。
  if (!isMessageAcceptable(message, deps.messageSchema)) {
    const state = describeMessage(message, deps.messageSchema)
    return jsonResponse({ error: TOO_LONG_MESSAGE, used: state.used, max: state.max }, 400)
  }
  const capped = await isCapped(deps, readNow(deps))
  // 小檔案在開始串流之前先讀好：串流一旦開始就沒有地方回報讀取失敗了
  const personaText = capped ? EMPTY_TEXT : await readPersona(deps)
  // 往下傳修剪後的那一則：驗的是哪一份，送出去的就該是哪一份
  return new Response(toChatStream(deps, personaText, { ...payload, message }, capped), {
    headers: { ...SSE_HEADERS, ...CORS_HEADERS }
  })
}

// 讀小檔案：一併回報現在用的是不是預設值，前端才知道要不要亮出「已修改」
const handlePersonaRead = async (deps) => {
  const stored = await deps.store.readSetting(PERSONA_KEY)
  const isDefault = typeof stored !== 'string' || stored.length === 0
  return jsonResponse(
    {
      text: isDefault ? deps.personaText : stored,
      isDefault,
      updatedAt: isDefault ? null : await deps.store.readSetting(PERSONA_UPDATED_KEY)
    },
    200
  )
}

// 存小檔案：先驗結構再寫，驗不過回 400 與錯誤陣列，不寫進去
const handlePersonaWrite = async (deps, request) => {
  const payload = await readPayload(request)
  const text = typeof payload?.text === 'string' ? payload.text : null
  const result = validatePersona(text, deps.personaSchema)
  if (!result.ok) return jsonResponse({ errors: result.errors }, 400)
  const updatedAt = new Date(readNow(deps)).toISOString()
  await deps.store.writeSetting(PERSONA_KEY, text)
  await deps.store.writeSetting(PERSONA_UPDATED_KEY, updatedAt)
  return jsonResponse({ ok: true, isDefault: false, updatedAt }, 200)
}

// 一鍵還原：把存檔刪掉，下一次讀就自然退回 config/persona.md
const handlePersonaReset = async (deps) => {
  await deps.store.deleteSetting(PERSONA_KEY)
  await deps.store.deleteSetting(PERSONA_UPDATED_KEY)
  return jsonResponse({ ok: true, isDefault: true, text: deps.personaText, updatedAt: null }, 200)
}

// 小檔案的三種方法都走這裡
const handlePersona = async (deps, request) => {
  if (request.method === GET_METHOD) return handlePersonaRead(deps)
  if (request.method === PUT_METHOD) return handlePersonaWrite(deps, request)
  if (request.method === DELETE_METHOD) return handlePersonaReset(deps)
  return jsonResponse({ error: METHOD_NOT_ALLOWED_MESSAGE }, 405)
}

// 用量面板：全部是我們自己記的估計值，官方數字以 Google Cloud console 為準。
// freeTier 的三個數字使用者沒填時是 null，那一項就只顯示已用量，不顯示比例。
const handleUsage = async (deps, request) => {
  if (request.method !== GET_METHOD) return jsonResponse({ error: METHOD_NOT_ALLOWED_MESSAGE }, 405)
  const nowMs = readNow(deps)
  const dateKey = todayKey(deps, nowMs)
  const daily = await deps.store.readDaily(dateKey)
  const rpm = await deps.store.countRequestsSince(nowMs - RPM_WINDOW_MS)
  const freeTier = deps.quotaConfig?.freeTier ?? {}
  const summary = summarizeUsage(
    {
      rpm,
      rpd: daily.requests,
      promptTokens: daily.promptTokens,
      outputTokens: daily.outputTokens
    },
    {
      rpm: freeTier.rpm ?? null,
      rpd: freeTier.rpd ?? null,
      tpm: freeTier.tpm ?? null,
      selfCap: deps.quotaConfig?.selfCap?.dailyRequests ?? null
    }
  )
  return jsonResponse(
    {
      ...summary,
      dateKey,
      timeZone: deps.quotaConfig?.timeZone ?? null,
      warnAtPercent: deps.quotaConfig?.warnAtPercent ?? null,
      resetsAt: new Date(nextResetMs(nowMs, deps.quotaConfig?.utcOffsetMinutes)).toISOString()
    },
    200
  )
}

// 推播編號的亂數段：測試注入固定字串，真實環境用 randomUUID 的前 8 碼
const readRandomText = (deps) =>
  deps.randomText ? deps.randomText() : globalThis.crypto.randomUUID().slice(0, RANDOM_ID_LENGTH)

// 呼叫推播客戶端恰好一次；客戶端自己丟例外時也當成失敗，不重試（架構約束 A21）
const sendOnce = async (deps, message) => {
  try {
    return await deps.pusher(message)
  } catch (error) {
    return { ok: false, status: null, code: UNKNOWN_CODE }
  }
}

// 送一則推播：順序固定為 內容檢查 → 是否已設定 → 組訊息 → 送出一次（§4.4）
// 日誌只記成功或失敗與錯誤代碼，不記內容、推播代碼與服務帳戶（架構約束 A19）
const handlePush = async (deps, request) => {
  if (request.method !== POST_METHOD) return jsonResponse({ error: METHOD_NOT_ALLOWED_MESSAGE }, 405)
  const checked = validatePushPayload(await readPayload(request))
  if (!checked.ok) {
    const error = checked.reason === PUSH_TOO_LONG_REASON ? PUSH_TOO_LONG_MESSAGE : PUSH_FORMAT_MESSAGE
    return jsonResponse({ error }, 400)
  }
  const config = deps.pushConfig ?? {}
  if (!isPushConfigured(config.serviceAccount, config.deviceToken)) {
    return jsonResponse({ error: PUSH_NOT_CONFIGURED_MESSAGE }, 503)
  }
  const id = checked.id ?? newPushId(readNow(deps), readRandomText(deps))
  const result = await sendOnce(deps, buildFcmMessage(config.deviceToken, id, checked.text))
  if (result?.ok) {
    console.log('推播送出成功')
    return jsonResponse({ ok: true, id }, 200)
  }
  const code = typeof result?.code === 'string' && result.code.length > 0 ? result.code : UNKNOWN_CODE
  console.error('推播送出失敗：', code)
  return jsonResponse({ ok: false, error: PUSH_FAILED_MESSAGE, code }, 502)
}

// 把根路徑導到真正的入口頁，查詢字串（例如 ?debug=1）原封不動帶過去
const redirectToApp = (url) => Response.redirect(new URL(APP_PATH + url.search, url.origin).href, 302)

// 授權中介：只擋 /api/ 底下的路徑。根路徑與靜態資源永遠公開，
// 否則使用者連網頁都打不開，也就沒有地方可以輸入密鑰（架構約束 A8）。
const needsSecret = (pathname) => pathname.startsWith(API_PREFIX)

// 建立處理函式：只認 /api/chat、/api/persona、/api/usage、/api/push 與根路徑，其餘路徑交還給靜態資源或回 404
export const createHandler = (deps) => async (request) => {
  const url = new URL(request.url)
  if (request.method === OPTIONS_METHOD) {
    // 預檢請求不帶自訂標頭，先放行才問得到後面那一次真正的請求
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }
  if (needsSecret(url.pathname) && !isAuthorized(request.headers.get(SECRET_HEADER), deps.secret)) {
    return jsonResponse({ error: UNAUTHORIZED_MESSAGE }, 401)
  }
  if (url.pathname === PERSONA_PATH) {
    return handlePersona(deps, request)
  }
  if (url.pathname === PUSH_PATH) {
    return handlePush(deps, request)
  }
  if (url.pathname === USAGE_PATH) {
    return handleUsage(deps, request)
  }
  if (url.pathname === CHAT_PATH && request.method === POST_METHOD) {
    return handleChat(deps, request)
  }
  if (url.pathname === ROOT_PATH) {
    return redirectToApp(url)
  }
  return jsonResponse({ error: NOT_FOUND_MESSAGE }, 404)
}
