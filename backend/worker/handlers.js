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
import { feedAll, finalize } from '../core/stream-parser.js'
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
import {
  resolveDraft,
  pickParseFields,
  parseLlmJson,
  slotOf,
  localHourOf,
  statsOf,
  canResist,
  canUndo,
  checkScriptNumbers,
  stripTags,
  fillLine,
  toBackupLog,
  validateDrinkSettings,
  parseDrinkEnabled,
  isDrinkEnabled,
  shouldAsk,
  questionPushId,
  drinkLogId,
  buildCatalogText,
  nameIn
} from '../core/drink.js'
import {
  toTaipeiDateString,
  addDaysToDateKey,
  pickP2,
  pickP3,
  setDateFor,
  validateSplitSteps,
  validateTodoistAction
} from '../core/todoist.js'
import {
  computeStock,
  descFor,
  countKinds,
  isTradingDay,
  prevTradingDay,
  buildMaPayload,
  validateWatchInput
} from '../core/ma.js'

// 常數定義
const API_PREFIX = '/api/' // 授權只掛在這個前綴底下（架構約束 A8）
const SECRET_HEADER = 'x-app-secret'
const CHAT_PATH = '/api/chat'
const PERSONA_PATH = '/api/persona'
const USAGE_PATH = '/api/usage'
const PUSH_PATH = '/api/push' // M1.5：送一則純資料推播到手機
const TODOIST_ACTION_PATH = '/api/todoist/action'
const TODOIST_PREFIX = '/api/todoist/'
const MA_PREFIX = '/api/ma/'
const MA_REPORT_PATH = '/api/ma/report'
const MA_HISTORY_PATH = '/api/ma/history'
const MA_WATCHLIST_PATH = '/api/ma/watchlist'
const MA_REFRESH_PATH = '/api/ma/refresh'
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
// M2 戒飲記錄（docs/M2-EXPENSIVE-PLAN.md §4.1）
const DRINK_PREFIX = '/api/drink/'
const DRINK_TEXT_MAX_CHARS = 200 // parse 的文字 trim 後最多 200 字（§7.2）
const DRINK_SCRIPT_MAX_CHARS = 200 // 語言模型的台詞超過這個長度就當作不通過，避免推播與泡泡塞爆
const DRINK_SCRIPT_TRIES = 2 // 台詞數字不對時最多重試 1 次（架構約束 A31）
const DRINK_DEFAULT_TAG = '[pout]' // 台詞完全沒有表情標籤時補在開頭（§4.1.4）
const DRINK_EXTRA_EMOTIONS = ['pout', 'shy'] // 角色頁 emotion-map.js 另有的兩個表情，台詞可以用
const DRINK_QUESTION_ACTIONS = 'resist,speak' // 每日詢問推播附的按鈕（§4.2）
const DRINK_SETTING_PREFIX = 'drink.'
const DRINK_SETTING_FIELDS = ['subscriptionName', 'monthlyFee', 'resistValue', 'monthlyQuota', 'askTime']
const DRINK_TEXT_SETTING_FIELDS = ['subscriptionName', 'askTime'] // 其餘三個欄位存成數字文字，讀回時轉整數
const DRINK_ASKED_ON_KEY = 'drink.askedOn' // 每日詢問最後送出的日期
const DRINK_ENABLED_KEY = DRINK_SETTING_PREFIX + 'enabled' // 戒飲記錄開關，獨立於五個設定欄位（A62）
const DRINK_DISABLED_ERROR = '戒飲記錄已關閉'
const DRINK_GUARDED_ROUTES = ['parse', 'preview', 'confirm', 'resist', 'undo'] // 關閉時被擋的寫入類路由（A64）
const HTTP_FORBIDDEN = 403
const DRINK_CAPPED_KIND = 'capped'
const DRINK_TYPE = 'drink'
const RESIST_TYPE = 'resist'
const DRINK_TEXT_MESSAGE = '請求格式不正確：text 需為 1～200 字。'
const DRINK_DRAFT_MESSAGE = '請求格式不正確：缺少 draft 欄位。'
const DRINK_LOG_ID_MESSAGE = '請求格式不正確：缺少 logId 欄位。'
const NO_NUMBER_HINT = '（這次台詞不得出現任何阿拉伯數字）'
const NUMBER_LIST_SEPARATOR = '、'
const FIELD_NAMES = { starbucks: '星巴克品項', base: '飲料種類', size: '大小', sugar: '甜度', topping: '配料' }
// 各情境要交給人設說的事（數字另外列在事實裡）
const SITUATIONS = {
  confirm: '複述主人剛剛說的飲料與熱量，問主人要不要記下來。',
  choose: '主人說的飲料在清單上找不到一模一樣的，請主人從畫面上的選項挑一個最接近的。',
  saved: '主人喝了一杯飲料，已經幫他記下來了。回報下面四個數字；喝了也不要讓主人有罪惡感。',
  resisted: '主人這個時段忍住沒喝飲料，已經記下來了。回報下面四個數字，稱讚他一下。',
  undone: '主人撤銷了一筆紀錄，已經改好了。回報撤銷後的四個數字。',
  notDrink: '主人說了一句跟飲料無關的話，用角色的口吻簡短回一句。',
  ask: '現在是每天詢問的時間。微傲地問主人今天有沒有喝飲料，提醒他沒喝的話按一下按鈕就好。'
}

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

// 把推播原文的表情標籤剝掉（M1.6）：與聊天網頁同一支解析程式，回傳 { text: trim 後的純文字, script }。
// 剝完的純文字（trim 前）與原文相同就視為不含標籤，script 為 null，推播與 M1.5 逐字相同（架構約束 A27）
const splitPushScript = (deps, original) => {
  const emotionMap = deps.emotionConfig?.emotionMap
  const defaultEmotion = deps.emotionConfig?.defaultEmotion
  const plain = finalize(feedAll([original], emotionMap, defaultEmotion), defaultEmotion).text
  return { text: plain.trim(), script: plain === original ? null : original }
}

// 送一則推播：順序固定為 內容檢查 → 剝標籤 → 是否已設定 → 組訊息 → 送出一次（M1.6 §4.2）
// 日誌只記成功或失敗與錯誤代碼，不記內容、推播代碼與服務帳戶（架構約束 A19）
const handlePush = async (deps, request) => {
  if (request.method !== POST_METHOD) return jsonResponse({ error: METHOD_NOT_ALLOWED_MESSAGE }, 405)
  const checked = validatePushPayload(await readPayload(request))
  if (!checked.ok) {
    const error = checked.reason === PUSH_TOO_LONG_REASON ? PUSH_TOO_LONG_MESSAGE : PUSH_FORMAT_MESSAGE
    return jsonResponse({ error }, 400)
  }
  // 長度以原文計（上面已檢查），剝完標籤沒有台詞時一樣算格式錯誤，不送出
  const split = splitPushScript(deps, checked.text)
  if (split.text.length === 0) return jsonResponse({ error: PUSH_FORMAT_MESSAGE }, 400)
  const config = deps.pushConfig ?? {}
  if (!isPushConfigured(config.serviceAccount, config.deviceToken)) {
    return jsonResponse({ error: PUSH_NOT_CONFIGURED_MESSAGE }, 503)
  }
  const id = checked.id ?? newPushId(readNow(deps), readRandomText(deps))
  const result = await sendOnce(deps, buildFcmMessage(config.deviceToken, id, split.text, split.script))
  if (result?.ok) {
    console.log('推播送出成功')
    return jsonResponse({ ok: true, id }, 200)
  }
  const code = typeof result?.code === 'string' && result.code.length > 0 ? result.code : UNKNOWN_CODE
  console.error('推播送出失敗：', code)
  return jsonResponse({ ok: false, error: PUSH_FAILED_MESSAGE, code }, 502)
}

// ===== M2 戒飲記錄（§4.1） =====

// 以 Unicode 字元計算長度
const countChars = (text) => Array.from(text).length

// 是不是一般物件（不是陣列、不是 null）
const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value)

// 台北時間的今天與小時
const drinkClock = (deps, nowMs) => ({
  today: todayKey(deps, nowMs),
  hour: localHourOf(nowMs, deps.quotaConfig?.utcOffsetMinutes)
})

// 呼叫語言模型一次，把串流的 text 事件串成一則完整回覆；失敗或沒有文字回 null。
// 不論成功或失敗都照 handleChat 記一次用量（§4.1.4）
const collectReply = async (deps, messages) => {
  const nowMs = readNow(deps)
  let text = EMPTY_TEXT
  let usage = EMPTY_USAGE
  let failed = false
  try {
    for await (const event of deps.streamer(messages)) {
      if (event?.type === TEXT_EVENT) text += String(event.text ?? EMPTY_TEXT)
      if (event?.type === USAGE_EVENT) usage = event
    }
  } catch (error) {
    // 只記錯誤訊息（llm-client.js 的訊息只含狀態碼與理由代號），不記內容
    console.error('戒飲語言模型呼叫失敗：', error?.message)
    failed = true
  }
  await recordUsage(deps, todayKey(deps, nowMs), nowMs, usage)
  return failed || text.trim().length === 0 ? null : text
}

// 用量到頂就不呼叫語言模型（直接回 null，呼叫端改用預設台詞）
const askLlm = async (deps, messages) => ((await isCapped(deps, readNow(deps))) ? null : collectReply(deps, messages))

// 解析用的訊息：提示詞全文＋全部編號，使用者說的話放在 user（§4.1.2、§4.1.8）
const parseMessages = (deps, text) => [
  { role: 'system', content: `${deps.drinkPrompts.parse}\n${buildCatalogText(deps.drinkModel, deps.starbucksTable)}` },
  { role: 'user', content: text }
]

// 台詞可用的表情：聊天網頁的表情加上角色頁另有的 pout、shy
const drinkEmotionList = (deps) => {
  const keys = new Set([...Object.keys(deps.emotionConfig?.emotionMap ?? {}), ...DRINK_EXTRA_EMOTIONS])
  return buildEmotionList(Object.fromEntries([...keys].map((key) => [key, key])))
}

// 產生台詞用的訊息：系統提示沿用 buildSystemPrompt 帶人設，再接台詞提示詞；事實與數字放在 user
const scriptMessages = (deps, personaText, situation, facts, required) => {
  const systemPrompt = buildSystemPrompt(deps.templateText, {
    persona: personaText,
    emotionList: drinkEmotionList(deps),
    timeGap: EMPTY_TEXT,
    history: EMPTY_TEXT
  })
  const numbers = required.length > 0 ? `台詞中只能出現這些數字：${required.join(NUMBER_LIST_SEPARATOR)}` : NO_NUMBER_HINT
  return [
    { role: 'system', content: `${systemPrompt}\n\n${deps.drinkPrompts.script}` },
    { role: 'user', content: `情境：${situation}\n要說的事實：${facts || '無'}\n${numbers}` }
  ]
}

// 語言模型的台詞能不能用：有台詞、不過長、數字完全符合規則（架構約束 A31）
const isScriptUsable = (script, required) =>
  stripTags(script).trim().length > 0 && countChars(script) <= DRINK_SCRIPT_MAX_CHARS && checkScriptNumbers(script, required)

// 請人設說一段話：數字不對就再呼叫一次，仍不對、失敗或用量到頂回 null（呼叫端改用預設台詞）
const generateScript = async (deps, situation, facts, required) => {
  const personaText = await readPersona(deps)
  for (let attempt = 0; attempt < DRINK_SCRIPT_TRIES; attempt += 1) {
    const reply = await askLlm(deps, scriptMessages(deps, personaText, situation, facts, required))
    if (reply === null) return null
    const script = reply.trim()
    if (isScriptUsable(script, required)) return script
  }
  return null
}

// drink-lines.json 某個鍵的第一句，佔位符以規則算出的值填入
const drinkLine = (deps, key, values = {}) => fillLine(deps.drinkLines?.[key]?.[0] ?? EMPTY_TEXT, values)

// 收尾：assumed 依序接上說明、沒有任何表情標籤就補 [pout]，再剝出通知欄用的純文字（§4.1.4）
const finishScript = (deps, script, assumed = []) => {
  const labels = deps.drinkLines?.labels ?? {}
  const withLabels = assumed.reduce(
    (text, item) => text + ((item === 'size' ? labels.assumedSize : labels.assumedSugar) ?? EMPTY_TEXT),
    script
  )
  const tagged = splitPushScript(deps, withLabels).script === null ? `${DRINK_DEFAULT_TAG}${withLabels}` : withLabels
  return { script: tagged, text: splitPushScript(deps, tagged).text }
}

// 人設台詞，失敗就用預設台詞，最後收尾
const speak = async (deps, { situation, facts, required, fallbackKey, values, assumed }) => {
  const generated = await generateScript(deps, situation, facts, required)
  return finishScript(deps, generated ?? drinkLine(deps, fallbackKey, values), assumed)
}

// 回一則戒飲回應：一律帶 kind、script、text
const drinkResponse = (kind, finished, extra = {}) =>
  jsonResponse({ kind, script: finished.script, text: finished.text, ...extra }, 200)

// 不呼叫語言模型、直接用預設台詞的回應（already、notUnderstood、用量到頂等）
const plainDrinkResponse = (deps, kind, key, values) => drinkResponse(kind, finishScript(deps, drinkLine(deps, key, values)))

// 複述用的名稱與數字
const confirmValues = (deps, resolved) => {
  const model = deps.drinkModel
  return {
    name: resolved.draft.name,
    size: nameIn(model?.sizes, resolved.draft.sizeId),
    sugar: nameIn(model?.sugarLevels, resolved.draft.sugarLevelId),
    ice: nameIn(model?.iceLevels, resolved.draft.iceId),
    kcal: resolved.kcal,
    price: resolved.draft.price
  }
}

// 複述的事實文字與必須出現的數字：熱量一定要說，有價格再加價格
const confirmFacts = (resolved, values) => {
  const hasPrice = values.price !== null
  const required = hasPrice ? [values.kcal, values.price] : [values.kcal]
  const drink =
    resolved.source === 'table'
      ? `${values.name}（星巴克官方公告值）`
      : `${values.name}、${values.size}、${values.sugar}、${values.ice}`
  const price = hasPrice ? `，花了 ${values.price} 元` : EMPTY_TEXT
  return { facts: `${drink}${price}，熱量約 ${values.kcal} 大卡`, required }
}

// 預設台詞的鍵：星巴克用 confirmTable、有價格用 confirmWithPrice，其餘 confirm
const confirmLineKey = (resolved, values) => {
  if (resolved.source === 'table') return 'confirmTable'
  return values.price !== null ? 'confirmWithPrice' : 'confirm'
}

// resolveDraft 的結果 → confirm 或 choose 的回應（choose 不含任何熱量欄位）
const resolvedResponse = async (deps, resolved) => {
  if (resolved.kind === 'choose') {
    const finished = await speak(deps, {
      situation: SITUATIONS.choose,
      facts: `要主人選的是${FIELD_NAMES[resolved.field] ?? EMPTY_TEXT}`,
      required: [],
      fallbackKey: 'choose'
    })
    return drinkResponse('choose', finished, { draft: resolved.draft, field: resolved.field, candidates: resolved.candidates })
  }
  const values = confirmValues(deps, resolved)
  const { facts, required } = confirmFacts(resolved, values)
  const finished = await speak(deps, {
    situation: SITUATIONS.confirm,
    facts,
    required,
    fallbackKey: confirmLineKey(resolved, values),
    values,
    assumed: resolved.assumed
  })
  return drinkResponse('confirm', finished, {
    draft: resolved.draft,
    kcal: resolved.kcal,
    source: resolved.source,
    assumed: resolved.assumed
  })
}

// 預設值（drink-defaults.json）中的五個設定欄位
const defaultDrinkSettings = (deps) =>
  Object.fromEntries(DRINK_SETTING_FIELDS.map((key) => [key, deps.drinkDefaults?.[key]]))

// 存起來的文字轉回欄位值：數字欄位轉整數，轉不成就是 NaN（之後驗不過而用預設值）
const storedSettingValue = (key, raw) => {
  if (raw === null) return undefined
  return DRINK_TEXT_SETTING_FIELDS.includes(key) ? raw : Number(raw)
}

// 目前的設定：每個欄位存過且合法就用存的，否則用 drink-defaults.json 的預設值
const readDrinkSettings = async (deps) => {
  const defaults = defaultDrinkSettings(deps)
  const result = { ...defaults }
  for (const key of DRINK_SETTING_FIELDS) {
    const value = storedSettingValue(key, await deps.store.readSetting(DRINK_SETTING_PREFIX + key))
    if (value !== undefined && validateDrinkSettings({ ...defaults, [key]: value }).ok) result[key] = value
  }
  return result
}

// 依目前的紀錄與設定算統計
const currentStats = async (deps, today) => {
  const settings = await readDrinkSettings(deps)
  const logs = await deps.store.listDrinkLogs()
  return statsOf(logs, { ...settings, drinks: deps.drinkDefaults?.drinks }, today)
}

// 回報四個數字的事實文字與必須出現的數字（§4.1.4：saved、undone）
const statsFacts = (stats) => ({
  facts: `本週喝了 ${stats.weekCups} 杯；本月省下 ${stats.monthSavedMoney} 元；訂閱回本 ${stats.paybackPct}%；少攝取 ${stats.monthSavedKcal} 大卡`,
  required: [stats.weekCups, stats.monthSavedMoney, stats.paybackPct, stats.monthSavedKcal]
})

// 寫入後的回報台詞
const statsScript = (deps, stats, situationKey, fallbackKey) =>
  speak(deps, { situation: SITUATIONS[situationKey], ...statsFacts(stats), fallbackKey, values: stats })

// 讀出請求中的 draft；不是物件回 null
const readDraft = async (request) => {
  const payload = await readPayload(request)
  return isPlainObject(payload?.draft) ? payload.draft : null
}

// POST /api/drink/parse：驗文字 → 用量到頂？ → 解析一次 → 只取九個欄位 → resolveDraft → 台詞（§4.1.2 固定順序）
const handleDrinkParse = async (deps, request) => {
  const payload = await readPayload(request)
  const text = typeof payload?.text === 'string' ? payload.text.trim() : EMPTY_TEXT
  if (text.length === 0 || countChars(text) > DRINK_TEXT_MAX_CHARS) return jsonResponse({ error: DRINK_TEXT_MESSAGE }, 400)
  if (await isCapped(deps, readNow(deps))) {
    return drinkResponse('other', finishScript(deps, buildFallbackText(deps.fallbackConfig, DRINK_CAPPED_KIND)))
  }
  const parsed = parseLlmJson(await collectReply(deps, parseMessages(deps, text)))
  if (parsed === null) return plainDrinkResponse(deps, 'other', 'notUnderstood')
  const fields = pickParseFields(parsed) // 只取九個欄位，語言模型給的任何數字欄位都丟掉（A30）
  if (fields.isDrink !== true) {
    const finished = await speak(deps, { situation: SITUATIONS.notDrink, facts: `主人說：「${text}」`, required: [], fallbackKey: 'notDrink' })
    return drinkResponse('other', finished)
  }
  return resolvedResponse(deps, resolveDraft(fields, deps.drinkModel, deps.starbucksTable))
}

// POST /api/drink/preview：只重算並產生台詞，不呼叫解析用的語言模型、不寫入
const handleDrinkPreview = async (deps, request) => {
  const draft = await readDraft(request)
  if (draft === null) return jsonResponse({ error: DRINK_DRAFT_MESSAGE }, 400)
  return resolvedResponse(deps, resolveDraft(draft, deps.drinkModel, deps.starbucksTable))
}

// POST /api/drink/confirm：Worker 自己重新 resolveDraft，以自己算的熱量寫入（A30）；驗不過回 choose、不寫入
const handleDrinkConfirm = async (deps, request) => {
  const draft = await readDraft(request)
  if (draft === null) return jsonResponse({ error: DRINK_DRAFT_MESSAGE }, 400)
  const resolved = resolveDraft(draft, deps.drinkModel, deps.starbucksTable)
  if (resolved.kind !== 'confirm') return resolvedResponse(deps, resolved)
  const nowMs = readNow(deps)
  const { today, hour } = drinkClock(deps, nowMs)
  const logId = drinkLogId(nowMs, readRandomText(deps))
  const saved = resolved.draft
  await deps.store.addDrinkLog({
    id: logId,
    date: today,
    slot: slotOf(hour),
    type: DRINK_TYPE,
    name: saved.name,
    price: saved.price,
    kcal: resolved.kcal,
    source: resolved.source,
    ice: saved.iceId,
    sizeId: saved.sizeId,
    sugarLevelId: saved.sugarLevelId,
    baseId: saved.baseId,
    toppingIds: saved.toppingIds,
    starbucksId: saved.starbucksId,
    createdAt: nowMs
  })
  const stats = await currentStats(deps, today)
  return drinkResponse('saved', await statsScript(deps, stats, 'saved', 'saved'), { logId, stats })
}

// POST /api/drink/resist：這個時段已有沒喝、或今天已喝過 → already 不寫入；否則寫一筆沒喝
const handleDrinkResist = async (deps) => {
  const nowMs = readNow(deps)
  const { today, hour } = drinkClock(deps, nowMs)
  const slot = slotOf(hour)
  if (!canResist(await deps.store.listDrinkLogs(), today, slot)) return plainDrinkResponse(deps, 'already', 'already')
  const logId = drinkLogId(nowMs, readRandomText(deps))
  await deps.store.addDrinkLog({ id: logId, date: today, slot, type: RESIST_TYPE, toppingIds: [], createdAt: nowMs })
  const stats = await currentStats(deps, today)
  return drinkResponse('saved', await statsScript(deps, stats, 'resisted', 'resisted'), { logId, stats })
}

// POST /api/drink/undo：存在、未撤銷、7 天內才撤銷；否則 already（cannotUndo），不改任何資料
const handleDrinkUndo = async (deps, request) => {
  const payload = await readPayload(request)
  const logId = typeof payload?.logId === 'string' && payload.logId.length > 0 ? payload.logId : null
  if (logId === null) return jsonResponse({ error: DRINK_LOG_ID_MESSAGE }, 400)
  const { today } = drinkClock(deps, readNow(deps))
  const log = await deps.store.findDrinkLog(logId)
  if (!canUndo(log, today) || !(await deps.store.markDrinkUndone(logId))) {
    return plainDrinkResponse(deps, 'already', 'cannotUndo')
  }
  const stats = await currentStats(deps, today)
  return drinkResponse('undone', await statsScript(deps, stats, 'undone', 'undone'), { stats })
}

// POST /api/drink/history：呼叫過往紀錄與統計台詞
const handleDrinkHistory = async (deps) => {
  const nowMs = readNow(deps)
  const { today } = drinkClock(deps, nowMs)
  const stats = await currentStats(deps, today)
  return drinkResponse('other', await statsScript(deps, stats, 'saved', 'saved'), { stats })
}

// GET /api/drink/stats
const handleDrinkStats = async (deps) => jsonResponse(await currentStats(deps, todayKey(deps, readNow(deps))), 200)

// GET /api/drink/settings
const handleDrinkSettingsRead = async (deps) => jsonResponse(await readDrinkSettings(deps), 200)

// PUT /api/drink/settings：五個欄位全部驗過才寫入；任一不合回 400，一個欄位都不寫（§4.1.7）
const handleDrinkSettingsWrite = async (deps, request) => {
  const checked = validateDrinkSettings(await readPayload(request))
  if (!checked.ok) return jsonResponse({ error: checked.error }, 400)
  for (const key of DRINK_SETTING_FIELDS) {
    await deps.store.writeSetting(DRINK_SETTING_PREFIX + key, String(checked.settings[key]))
  }
  return jsonResponse(await readDrinkSettings(deps), 200)
}

// GET /api/drink/enabled：讀不到儲存體時讓例外往上丟，不當成開啟（A63）
const handleDrinkEnabledRead = async (deps) =>
  jsonResponse({ enabled: isDrinkEnabled(await deps.store.readSetting(DRINK_ENABLED_KEY)) }, 200)

// PUT /api/drink/enabled：只接受布林值，不合格回 400 且不寫入
const handleDrinkEnabledWrite = async (deps, request) => {
  const checked = parseDrinkEnabled(await readPayload(request))
  if (!checked.ok) return jsonResponse({ error: checked.error }, 400)
  await deps.store.writeSetting(DRINK_ENABLED_KEY, String(checked.enabled))
  return jsonResponse({ enabled: checked.enabled }, 200)
}

// GET /api/drink/export：戒飲存備份格式，不含已撤銷的紀錄（§4.1.6）
const handleDrinkExport = async (deps) => {
  const settings = await readDrinkSettings(deps)
  const logs = await deps.store.listDrinkLogs()
  return jsonResponse(
    {
      subscription: { name: settings.subscriptionName, monthlyFee: settings.monthlyFee },
      monthlyQuota: settings.monthlyQuota,
      resistValue: settings.resistValue,
      drinks: deps.drinkDefaults?.drinks ?? [],
      lastSeenMonth: EMPTY_TEXT,
      logs: [...logs].sort((a, b) => a.createdAt - b.createdAt).map(toBackupLog)
    },
    200
  )
}

// 戒飲路由表：路徑 → 方法 → 處理函式
const DRINK_ROUTES = {
  parse: { [POST_METHOD]: handleDrinkParse },
  preview: { [POST_METHOD]: handleDrinkPreview },
  confirm: { [POST_METHOD]: handleDrinkConfirm },
  resist: { [POST_METHOD]: handleDrinkResist },
  undo: { [POST_METHOD]: handleDrinkUndo },
  history: { [POST_METHOD]: handleDrinkHistory, [GET_METHOD]: handleDrinkHistory },
  stats: { [GET_METHOD]: handleDrinkStats },
  settings: { [GET_METHOD]: handleDrinkSettingsRead, [PUT_METHOD]: handleDrinkSettingsWrite },
  export: { [GET_METHOD]: handleDrinkExport },
  enabled: { [GET_METHOD]: handleDrinkEnabledRead, [PUT_METHOD]: handleDrinkEnabledWrite }
}

// /api/drink/* 的分派：路徑不認得回 404，方法不對回 405
const handleDrink = async (deps, request, pathname) => {
  const name = pathname.slice(DRINK_PREFIX.length)
  const route = Object.hasOwn(DRINK_ROUTES, name) ? DRINK_ROUTES[name] : null
  if (route === null) return jsonResponse({ error: NOT_FOUND_MESSAGE }, 404)
  const handler = Object.hasOwn(route, request.method) ? route[request.method] : null
  if (handler === null) return jsonResponse({ error: METHOD_NOT_ALLOWED_MESSAGE }, 405)
  if (DRINK_GUARDED_ROUTES.includes(name) && !isDrinkEnabled(await deps.store.readSetting(DRINK_ENABLED_KEY))) {
    return jsonResponse({ error: DRINK_DISABLED_ERROR }, HTTP_FORBIDDEN)
  }
  return handler(deps, request)
}

// ===== Todoist 雙軌提醒（docs/M3R-EXPENSIVE-PLAN.md §4.2） =====

const TODOIST_CONTRACT = {
  actions: { sent: ['doToday', 'snooze', 'tomorrow', 'split', 'confirmSplit', 'setDate', 'unknownDate'] },
  setDateWhen: ['tomorrow', 'nextMonday', 'nextMonth'],
  taskIdPattern: '^[0-9A-Za-z_]{1,64}$',
  contentMaxChars: 200
}

// 產生提醒台詞用的訊息
const todoistScriptMessages = (deps, personaText, taskTitle) => {
  const systemPrompt = buildSystemPrompt(deps.templateText, {
    persona: personaText,
    emotionList: drinkEmotionList(deps),
    timeGap: EMPTY_TEXT,
    history: EMPTY_TEXT
  })
  return [
    { role: 'system', content: `${systemPrompt}\n\n${deps.todoistPrompts?.script || ''}` },
    { role: 'user', content: `任務名稱：${taskTitle}` }
  ]
}

// 產生拆步驟用的訊息（不得包含提醒台詞提示詞）
const todoistSplitMessages = (deps, taskTitle) => [
  { role: 'user', content: `${deps.todoistPrompts?.split || ''}\n任務名稱：${taskTitle}` }
]

// 處理 Todoist 動作請求 POST /api/todoist/action
const handleTodoistAction = async (deps, request) => {
  if (request.method !== POST_METHOD) {
    return jsonResponse({ error: METHOD_NOT_ALLOWED_MESSAGE }, 405)
  }

  const payload = await readPayload(request)
  const validation = validateTodoistAction(payload, TODOIST_CONTRACT)
  if (!validation.valid) {
    return jsonResponse({ error: validation.error || 'BAD_REQUEST' }, 400)
  }

  const failedReply = () => {
    const script = deps.todoistLines?.failed?.[0] || 'Todoist 發生錯誤'
    return jsonResponse({ kind: 'failed', script, text: stripTags(script) }, 200)
  }

  if (!deps.todoist) {
    return failedReply()
  }

  const nowMs = readNow(deps)
  const todayKey = toTaipeiDateString(nowMs)
  const { action, taskId, view, when, content, steps } = payload

  try {
    if (action === 'doToday') {
      await deps.todoist.updateDue(taskId, todayKey)
      if (view === 'p3') {
        await deps.store.writeSetting('todoist.doToday', JSON.stringify({ taskId, date: todayKey }))
      }
      const script = deps.todoistLines?.doneDoToday?.[0] || '完成'
      return jsonResponse({ kind: 'done', script, text: stripTags(script) }, 200)
    }

    if (action === 'snooze') {
      const snoozeUntil = addDaysToDateKey(todayKey, 7)
      await deps.store.writeSetting(`todoist.p2Snooze.${taskId}`, snoozeUntil)
      const script = deps.todoistLines?.doneSnooze?.[0] || '完成'
      return jsonResponse({ kind: 'done', script, text: stripTags(script) }, 200)
    }

    if (action === 'tomorrow') {
      const tomorrowKey = addDaysToDateKey(todayKey, 1)
      await deps.todoist.updateDue(taskId, tomorrowKey)
      const script = deps.todoistLines?.doneTomorrow?.[0] || '完成'
      return jsonResponse({ kind: 'done', script, text: stripTags(script) }, 200)
    }

    if (action === 'setDate') {
      const targetDate = setDateFor(when, todayKey)
      await deps.todoist.updateDue(taskId, targetDate)
      const script = deps.todoistLines?.doneSetDate?.[0] || '完成'
      return jsonResponse({ kind: 'done', script, text: stripTags(script) }, 200)
    }

    if (action === 'unknownDate') {
      const script = deps.todoistLines?.doneUnknownDate?.[0] || '完成'
      return jsonResponse({ kind: 'done', script, text: stripTags(script) }, 200)
    }

    if (action === 'split') {
      let validSteps = null
      const messages = todoistSplitMessages(deps, content)
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const reply = await askLlm(deps, messages)
        if (reply) {
          const match = reply.match(/\{[\s\S]*\}/)
          if (match) {
            try {
              const parsed = JSON.parse(match[0])
              const check = validateSplitSteps(parsed.steps)
              if (check.valid) {
                validSteps = check.steps
                break
              }
            } catch {}
          }
        }
      }

      if (!validSteps) {
        return failedReply()
      }

      const template = deps.todoistLines?.split?.[0] || '{title}：{steps}'
      const script = template.replace('{title}', content).replace('{steps}', validSteps.join('、'))
      return jsonResponse(
        {
          kind: 'split',
          script,
          text: stripTags(script),
          taskId,
          content,
          steps: validSteps
        },
        200
      )
    }

    if (action === 'confirmSplit') {
      for (const step of steps) {
        await deps.todoist.addSubtask(taskId, step)
      }
      const script = deps.todoistLines?.doneSplit?.[0] || '完成'
      return jsonResponse({ kind: 'done', script, text: stripTags(script) }, 200)
    }
  } catch (error) {
    console.error('Todoist 動作處理失敗：', error?.message)
    return failedReply()
  }

  return failedReply()
}

// 產生推播台詞（若語言模型失敗或格式不合，改用預設台詞）
const generateTodoistRemindScript = async (deps, view, taskTitle) => {
  const personaText = await readPersona(deps)
  const messages = todoistScriptMessages(deps, personaText, taskTitle)
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = await askLlm(deps, messages)
    if (reply) {
      const plain = stripTags(reply).trim()
      if (plain.includes(taskTitle) && countChars(reply) <= 120 && !/[0-9]/.test(reply)) {
        return reply.trim()
      }
    }
  }
  const fallbackTemplate = deps.todoistLines?.[view]?.[0] || '{title}'
  return fallbackTemplate.replace('{title}', taskTitle)
}

// 08:30 P3 掃描
const runP3Scan = async (deps, todayKey) => {
  const p3SentOn = await deps.store.readSetting('todoist.p3SentOn')
  if (p3SentOn === todayKey) return

  const tasks = await deps.todoist.listTasks()
  const state = { 'todoist.p3SentOn': p3SentOn }
  for (const t of tasks) {
    if (t?.priority === 2) {
      const reminded = await deps.store.readSetting(`todoist.p3Reminded.${t.id}`)
      if (reminded) state[`todoist.p3Reminded.${t.id}`] = reminded
      const asked = await deps.store.readSetting(`todoist.p3Asked.${t.id}`)
      if (asked) state[`todoist.p3Asked.${t.id}`] = asked
    }
  }

  const picked = pickP3(tasks, todayKey, state)
  if (!picked) return

  const { view, task } = picked
  const taskTitle = Array.from(task.content || '').slice(0, 200).join('')
  const script = await generateTodoistRemindScript(deps, view, taskTitle)
  const id = `todoist-${view}-${task.id}-${todayKey.replace(/-/g, '')}`
  const text = stripTags(script).trim()
  const todoistData = JSON.stringify({ view, taskId: task.id, content: taskTitle })

  const msg = buildFcmMessage(deps.pushConfig.deviceToken, id, text, script)
  msg.message.data.todoist = todoistData

  const res = await sendOnce(deps, msg)
  if (res?.ok) {
    await deps.store.writeSetting('todoist.p3SentOn', todayKey)
    if (view === 'p3' && task.due?.date) {
      await deps.store.writeSetting(`todoist.p3Reminded.${task.id}`, task.due.date.slice(0, 10))
    } else if (view === 'askDate') {
      await deps.store.writeSetting(`todoist.p3Asked.${task.id}`, '1')
    }
    console.log('P3 掃描推播送出成功')
  }
}

// 09:00 P2 掃描
const runP2Scan = async (deps, todayKey, nowMs) => {
  const p2SentOn = await deps.store.readSetting('todoist.p2SentOn')
  const tasks = await deps.todoist.listTasks()
  const state = { 'todoist.p2SentOn': p2SentOn }
  for (const t of tasks) {
    if (t?.priority === 3) {
      const snooze = await deps.store.readSetting(`todoist.p2Snooze.${t.id}`)
      if (snooze) state[`todoist.p2Snooze.${t.id}`] = snooze
    }
  }

  const task = pickP2(tasks, todayKey, nowMs, state, deps.todoistDefaults)
  if (!task) return

  const taskTitle = Array.from(task.content || '').slice(0, 200).join('')
  const script = await generateTodoistRemindScript(deps, 'p2', taskTitle)
  const id = `todoist-p2-${task.id}-${todayKey.replace(/-/g, '')}`
  const text = stripTags(script).trim()
  const todoistData = JSON.stringify({ view: 'p2', taskId: task.id, content: taskTitle })

  const msg = buildFcmMessage(deps.pushConfig.deviceToken, id, text, script)
  msg.message.data.todoist = todoistData

  const res = await sendOnce(deps, msg)
  if (res?.ok) {
    await deps.store.writeSetting('todoist.p2SentOn', todayKey)
    console.log('P2 掃描推播送出成功')
  }
}

// 21:00 追問
const runNightFollowup = async (deps, todayKey) => {
  const doTodayRaw = await deps.store.readSetting('todoist.doToday')
  if (!doTodayRaw) return

  try {
    const doToday = JSON.parse(doTodayRaw)
    if (doToday.date === todayKey) {
      const taskObj = await deps.todoist.getTask(doToday.taskId)
      if (taskObj !== null) {
        const taskTitle = Array.from(taskObj.content || '').slice(0, 200).join('')
        const template = deps.todoistLines?.followup?.[0] || '任務追問：{title}'
        const script = template.replace('{title}', taskTitle)
        const id = `todoist-night-${doToday.taskId}-${todayKey.replace(/-/g, '')}`
        const text = stripTags(script).trim()
        const msg = buildFcmMessage(deps.pushConfig.deviceToken, id, text, script)
        await sendOnce(deps, msg)
        console.log('夜間追問推播送出成功')
      }
    }
  } finally {
    await deps.store.deleteSetting('todoist.doToday')
  }
}

// 產生盤前均線開場台詞（依人設，不得含數字，不超過 40 字）
const generateMaOpeningScript = async (deps) => {
  const personaText = await readPersona(deps)
  const emotionList = drinkEmotionList(deps)
  const systemPrompt = buildSystemPrompt(deps.templateText, {
    persona: personaText,
    emotionList,
    timeGap: EMPTY_TEXT,
    history: EMPTY_TEXT
  })
  const promptContent = `${systemPrompt}\n\n${deps.maPrompt || ''}`
  const messages = [
    { role: 'system', content: promptContent },
    { role: 'user', content: '早晨開盤前問候' }
  ]
  const maxChars = deps.maDefaults?.openingMaxChars ?? 40

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const reply = await askLlm(deps, messages)
    if (reply) {
      const plain = stripTags(reply).trim()
      if (plain.length > 0 && countChars(plain) <= maxChars && !/[0-9０-９]/.test(plain)) {
        return reply.trim()
      }
    }
  }

  return deps.maLines?.opening?.[0] || ''
}

// 執行盤前均線報告（§4.4）：取得資料、計算均線、寫入儲存層與發送推播
export const runMaReport = async (deps, nowMs = null, { push = false } = {}) => {
  const currentMs = nowMs ?? readNow(deps)
  const today = toTaipeiDateString(currentMs)

  if (!deps.twse) {
    return { status: 'skipped', reportDate: today, asOf: null }
  }

  const year = Number(today.slice(0, 4))
  const month = Number(today.slice(5, 7))
  let closedDates = []
  try {
    closedDates = await deps.twse.listClosedDates(year)
    if (month === 1) {
      if (deps.sleep) await deps.sleep(deps.maDefaults?.twseDelayMs ?? 1000)
      const prevClosed = await deps.twse.listClosedDates(year - 1)
      closedDates = [...closedDates, ...prevClosed]
    }
  } catch (error) {
    console.error('TWSE_CLOSED_DATES_ERROR', error?.message)
    return { status: 'unknown', reportDate: today, asOf: null }
  }

  if (!isTradingDay(today, closedDates)) {
    return { status: 'holiday', reportDate: today, asOf: null }
  }

  const watchList = await deps.store.listWatch()
  const activeList = watchList.filter((w) => w.active).sort((a, b) => a.sort - b.sort)
  if (activeList.length === 0) {
    return { status: 'empty', reportDate: today, asOf: null }
  }

  const sentOnKey = deps.maContract?.settingsKeys?.sentOn ?? 'ma.sentOn'
  const lastKey = deps.maContract?.settingsKeys?.last ?? 'ma.last'
  const sentOn = await deps.store.readSetting(sentOnKey)

  if (push && sentOn === today) {
    const lastRaw = await deps.store.readSetting(lastKey)
    let last = null
    try {
      last = JSON.parse(lastRaw)
    } catch {}
    return { status: last?.status ?? 'ok', reportDate: today, asOf: last?.asOf ?? null }
  }

  let asOf = null
  try {
    asOf = prevTradingDay(today, closedDates)
  } catch (error) {
    console.error('PREV_TRADING_DAY_ERROR', error?.message)
    return { status: 'unknown', reportDate: today, asOf: null }
  }

  const minCloses = deps.maContract?.minCloses ?? 60
  const backfillMonths = deps.maContract?.backfillMonths ?? 4
  const delayMs = deps.maDefaults?.twseDelayMs ?? 1000
  const successfulResults = []
  const failedCodes = []

  for (const stock of activeList) {
    const code = stock.code
    try {
      let closes = await deps.store.listCloses(code, 70)
      const asOfYm = `${asOf.slice(0, 4)}${asOf.slice(5, 7)}`
      const latestCloseDate = closes.length > 0 ? closes[closes.length - 1].date : null

      if (closes.length < minCloses) {
        const [asOfYear, asOfMon] = asOf.split('-').map(Number)
        for (let m = backfillMonths - 1; m >= 0; m -= 1) {
          if (deps.sleep) await deps.sleep(delayMs)
          const targetD = new Date(Date.UTC(asOfYear, asOfMon - 1 - m, 1))
          const ym = `${targetD.getUTCFullYear()}${String(targetD.getUTCMonth() + 1).padStart(2, '0')}`
          const monthRows = await deps.twse.getMonth(code, ym)
          if (monthRows.length > 0) {
            await deps.store.upsertCloses(code, monthRows)
          }
        }
      } else if (!latestCloseDate || latestCloseDate < asOf) {
        if (deps.sleep) await deps.sleep(delayMs)
        const monthRows = await deps.twse.getMonth(code, asOfYm)
        if (monthRows.length > 0) {
          await deps.store.upsertCloses(code, monthRows)
        }
      }

      closes = await deps.store.listCloses(code, 70)
      const newestDate = closes.length > 0 ? closes[closes.length - 1].date : null
      if (newestDate !== asOf) {
        failedCodes.push(code)
      } else {
        const computed = computeStock(closes.map((c) => c.close), deps.maContract)
        successfulResults.push({
          code,
          name: stock.name,
          kind: computed.kind,
          ma: computed.ma
        })
      }
    } catch (err) {
      console.error('FETCH_STOCK_ERROR', code, err?.message)
      failedCodes.push(code)
    }
  }

  if (successfulResults.length === 0) {
    await deps.store.writeSetting(
      lastKey,
      JSON.stringify({ reportDate: today, asOf: null, status: 'failed', failed: failedCodes })
    )
    if (push && isPushConfigured(deps.pushConfig?.serviceAccount, deps.pushConfig?.deviceToken)) {
      const idPrefix = deps.maContract?.push?.idPrefix ?? 'ma-'
      const id = `${idPrefix}${today.replace(/-/g, '')}`
      const failedText = deps.maLines?.failed ?? ''
      const maPayload = buildMaPayload(today, '', { u: 0, d: 0, m: 0 }, 'failed')
      const msg = buildFcmMessage(deps.pushConfig.deviceToken, id, failedText, null)
      msg.message.data.ma = maPayload
      await sendOnce(deps, msg)
    }
    return { status: 'failed', reportDate: today, asOf: null }
  }

  await deps.store.upsertResults(asOf, successfulResults)
  await deps.store.writeSetting(
    lastKey,
    JSON.stringify({ reportDate: today, asOf, status: 'ok', failed: failedCodes })
  )

  if (push && isPushConfigured(deps.pushConfig?.serviceAccount, deps.pushConfig?.deviceToken)) {
    const script = await generateMaOpeningScript(deps)
    const plainOpening = stripTags(script).trim()
    const counts = countKinds(successfulResults)
    const countsSentence = (deps.maLines?.countsSentence ?? '')
      .replace('{u}', String(counts.u))
      .replace('{d}', String(counts.d))
      .replace('{m}', String(counts.m))
    const text = `${plainOpening} ${countsSentence}`
    const idPrefix = deps.maContract?.push?.idPrefix ?? 'ma-'
    const id = `${idPrefix}${today.replace(/-/g, '')}`
    const maPayload = buildMaPayload(today, asOf, counts, 'ok')
    const msg = buildFcmMessage(deps.pushConfig.deviceToken, id, text, script)
    msg.message.data.ma = maPayload
    const res = await sendOnce(deps, msg)
    if (res?.ok) {
      await deps.store.writeSetting(sentOnKey, today)
    }
  }

  return { status: 'ok', reportDate: today, asOf }
}

// 取得最新均線報告
const handleMaReport = async (deps, request) => {
  const watchList = await deps.store.listWatch()
  const activeList = watchList.filter((w) => w.active).sort((a, b) => a.sort - b.sort)
  const lastKey = deps.maContract?.settingsKeys?.last ?? 'ma.last'
  const lastRaw = await deps.store.readSetting(lastKey)
  const disclaimer = deps.maLines?.disclaimer ?? ''
  const today = toTaipeiDateString(readNow(deps))

  if (activeList.length === 0) {
    return jsonResponse({
      kind: 'report',
      status: 'empty',
      reportDate: today,
      asOf: null,
      counts: { u: 0, d: 0, m: 0 },
      items: [],
      disclaimer
    })
  }

  if (!lastRaw) {
    return jsonResponse({
      kind: 'report',
      status: 'none',
      reportDate: today,
      asOf: null,
      counts: { u: 0, d: 0, m: 0 },
      items: [],
      disclaimer
    })
  }

  let last = null
  try {
    last = JSON.parse(lastRaw)
  } catch {
    return jsonResponse({
      kind: 'report',
      status: 'none',
      reportDate: today,
      asOf: null,
      counts: { u: 0, d: 0, m: 0 },
      items: [],
      disclaimer
    })
  }

  if (last.status === 'failed') {
    return jsonResponse({
      kind: 'report',
      status: 'failed',
      reportDate: last.reportDate,
      asOf: null,
      counts: { u: 0, d: 0, m: 0 },
      items: [],
      disclaimer
    })
  }

  const results = last.asOf ? await deps.store.listResults([last.asOf]) : []
  const resultMap = new Map(results.map((r) => [r.code, r]))
  const failedSet = new Set(last.failed || [])

  const items = activeList.map((stock) => {
    const code = stock.code
    const name = stock.name
    if (resultMap.has(code)) {
      const r = resultMap.get(code)
      return {
        code,
        name,
        kind: r.kind,
        desc: descFor(r.kind, deps.maLines),
        ma: r.m5 !== null && r.m20 !== null && r.m60 !== null ? [r.m5, r.m20, r.m60] : null
      }
    }
    if (failedSet.has(code)) {
      return {
        code,
        name,
        failed: true,
        tag: deps.maLines?.tags?.failedStock,
        desc: deps.maLines?.failedStock
      }
    }
    return {
      code,
      name,
      pending: true,
      tag: deps.maLines?.tags?.pending,
      desc: deps.maLines?.pending
    }
  })

  const counts = countKinds(items)

  return jsonResponse({
    kind: 'report',
    status: 'ok',
    reportDate: last.reportDate,
    asOf: last.asOf,
    counts,
    items,
    disclaimer
  })
}

// 取得最近 7 個交易日之歷史種類矩陣
const handleMaHistory = async (deps, request) => {
  const historyDays = deps.maContract?.historyDays ?? 7
  const dateList = await deps.store.listResultDates(historyDays)
  const days = [...dateList].reverse()

  const watchList = await deps.store.listWatch()
  const activeList = watchList.filter((w) => w.active).sort((a, b) => a.sort - b.sort)

  if (days.length === 0) {
    return jsonResponse({
      kind: 'history',
      days: [],
      rows: []
    })
  }

  const results = await deps.store.listResults(days)
  const resultMap = new Map()
  for (const r of results) {
    resultMap.set(`${r.date}:${r.code}`, r.kind)
  }

  const rows = activeList.map((stock) => {
    const cells = []
    let prevKind = null
    for (let i = 0; i < days.length; i += 1) {
      const day = days[i]
      const kind = resultMap.get(`${day}:${stock.code}`) ?? null
      const changed = kind !== null && prevKind !== null && kind !== prevKind
      cells.push({ kind, prev: prevKind, changed })
      prevKind = kind
    }
    return {
      code: stock.code,
      name: stock.name,
      cells
    }
  })

  return jsonResponse({
    kind: 'history',
    days,
    rows
  })
}

// 取得追蹤清單
const handleMaWatchlistGet = async (deps, request) => {
  const watchList = await deps.store.listWatch()
  const activeList = watchList.filter((w) => w.active).sort((a, b) => a.sort - b.sort)
  const latestDates = await deps.store.listResultDates(1)
  const latestAsOf = latestDates[0] || null
  const results = latestAsOf ? await deps.store.listResults([latestAsOf]) : []
  const hasResultSet = new Set(results.map((r) => r.code))

  const items = activeList.map((w) => ({
    code: w.code,
    name: w.name,
    pending: !hasResultSet.has(w.code)
  }))

  return jsonResponse({
    kind: 'watchlist',
    items,
    limit: deps.maContract?.limit ?? 10
  })
}

// 寫入追蹤清單（新增、停止追蹤、復原）
const handleMaWatchlistPost = async (deps, request) => {
  let body = null
  try {
    body = await request.json()
  } catch {
    return jsonResponse({ error: 'format' }, 400)
  }

  const action = body?.action
  const code = body?.code
  const allowedActions = deps.maContract?.watchActions ?? ['add', 'untrack', 'restore']
  if (typeof action !== 'string' || !allowedActions.includes(action) || typeof code !== 'string') {
    return jsonResponse({ error: 'format' }, 400)
  }

  const allWatch = await deps.store.listWatch()
  const activeList = allWatch.filter((w) => w.active)
  const activeCodes = activeList.map((w) => w.code)
  const limit = deps.maContract?.limit ?? 10
  const trimmedCode = code.trim()

  if (action === 'add') {
    if (trimmedCode.length < 1 || trimmedCode.length > 40) {
      return jsonResponse({ error: 'format', message: deps.maLines?.errors?.format }, 400)
    }

    let twseData = null
    try {
      twseData = await deps.twse.listAll()
    } catch {
      return jsonResponse({ error: 'unavailable', message: deps.maLines?.errors?.unavailable }, 502)
    }

    const validation = validateWatchInput(trimmedCode, twseData?.rows ?? [], activeCodes, limit, deps.maContract)
    if (!validation.ok) {
      const template = deps.maLines?.errors?.[validation.error] ?? ''
      const message = template
        .replace('{input}', trimmedCode)
        .replace('{code}', validation.code ?? trimmedCode)
        .replace('{name}', validation.name ?? '')
        .replace('{limit}', String(limit))
      return jsonResponse({ error: validation.error, message }, 400)
    }

    const { code: validCode, name: validName } = validation
    const existing = allWatch.find((w) => w.code === validCode)
    if (existing && !existing.active) {
      await deps.store.setWatchActive(validCode, true)
    } else {
      const today = toTaipeiDateString(readNow(deps))
      await deps.store.addWatch({ code: validCode, name: validName, addedOn: today })
      const backfillMonths = deps.maContract?.backfillMonths ?? 4
      const [curY, curM] = today.split('-').map(Number)
      const delayMs = deps.maDefaults?.twseDelayMs ?? 1000
      for (let m = backfillMonths - 1; m >= 0; m -= 1) {
        try {
          if (deps.sleep) await deps.sleep(delayMs)
          const targetD = new Date(Date.UTC(curY, curM - 1 - m, 1))
          const ym = `${targetD.getUTCFullYear()}${String(targetD.getUTCMonth() + 1).padStart(2, '0')}`
          const mRows = await deps.twse.getMonth(validCode, ym)
          if (mRows.length > 0) {
            await deps.store.upsertCloses(validCode, mRows)
          }
        } catch (err) {
          console.error('BACKFILL_MONTH_ERROR', validCode, err?.message)
        }
      }
    }

    return jsonResponse({ ok: true, item: { code: validCode, name: validName, pending: true } }, 200)
  }

  if (action === 'untrack') {
    const existing = allWatch.find((w) => w.code === trimmedCode)
    if (!existing) {
      const template = deps.maLines?.errors?.notFound ?? ''
      return jsonResponse({ error: 'notFound', message: template.replace('{input}', trimmedCode) }, 400)
    }
    await deps.store.setWatchActive(existing.code, false)
    return jsonResponse({ ok: true }, 200)
  }

  if (action === 'restore') {
    const existing = allWatch.find((w) => w.code === trimmedCode)
    if (!existing) {
      const template = deps.maLines?.errors?.notFound ?? ''
      return jsonResponse({ error: 'notFound', message: template.replace('{input}', trimmedCode) }, 400)
    }
    if (activeCodes.length >= limit) {
      const template = deps.maLines?.errors?.limit ?? ''
      return jsonResponse({ error: 'limit', message: template.replace('{limit}', String(limit)) }, 400)
    }
    await deps.store.setWatchActive(existing.code, true)
    return jsonResponse({ ok: true }, 200)
  }

  return jsonResponse({ error: 'format' }, 400)
}

// 重算今日報告（頻率限制 60 秒）
const handleMaRefresh = async (deps, request) => {
  const refreshedAtKey = deps.maContract?.settingsKeys?.refreshedAt ?? 'ma.refreshedAt'
  const lastRefreshed = await deps.store.readSetting(refreshedAtKey)
  const now = readNow(deps)
  const minIntervalSec = deps.maDefaults?.refreshMinIntervalSec ?? 60

  if (lastRefreshed && now - Number(lastRefreshed) < minIntervalSec * 1000) {
    return jsonResponse({ error: 'tooSoon' }, 429)
  }

  await deps.store.writeSetting(refreshedAtKey, String(now))
  await runMaReport(deps, now, { push: false })
  return handleMaReport(deps, request)
}

// 盤前均線路由總入口
const handleMa = async (deps, request, pathname) => {
  if (pathname === MA_REPORT_PATH) {
    if (request.method !== GET_METHOD) return jsonResponse({ error: METHOD_NOT_ALLOWED_MESSAGE }, 405)
    return handleMaReport(deps, request)
  }
  if (pathname === MA_HISTORY_PATH) {
    if (request.method !== GET_METHOD) return jsonResponse({ error: METHOD_NOT_ALLOWED_MESSAGE }, 405)
    return handleMaHistory(deps, request)
  }
  if (pathname === MA_WATCHLIST_PATH) {
    if (request.method === GET_METHOD) return handleMaWatchlistGet(deps, request)
    if (request.method === POST_METHOD) return handleMaWatchlistPost(deps, request)
    return jsonResponse({ error: METHOD_NOT_ALLOWED_MESSAGE }, 405)
  }
  if (pathname === MA_REFRESH_PATH) {
    if (request.method !== POST_METHOD) return jsonResponse({ error: METHOD_NOT_ALLOWED_MESSAGE }, 405)
    return handleMaRefresh(deps, request)
  }
  return jsonResponse({ error: NOT_FOUND_MESSAGE }, 404)
}

// 排程觸發（§4.2）：整點戒飲詢問，以及台北時間 08:30 P3、09:00 P2、21:00 追問
export const runScheduled = async (deps, nowMs) => {
  const tpeMs = nowMs + 8 * 60 * 60 * 1000
  const tpeDate = new Date(tpeMs)
  const hour = tpeDate.getUTCHours()
  const minute = tpeDate.getUTCMinutes()
  const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const today = tpeDate.toISOString().slice(0, 10)

  // 1. 每日戒飲詢問：只在分鐘為 0（整點）時觸發（M2-S11 保持不變）
  if (minute === 0) {
    try {
      const settings = await readDrinkSettings(deps)
      const askedOn = await deps.store.readSetting(DRINK_ASKED_ON_KEY)
      const logs = await deps.store.listDrinkLogs()
      const enabled = isDrinkEnabled(await deps.store.readSetting(DRINK_ENABLED_KEY))
      if (shouldAsk({ hour, askTime: settings.askTime, askedOn, todayKey: today, logs, enabled })) {
        const config = deps.pushConfig ?? {}
        if (isPushConfigured(config.serviceAccount, config.deviceToken)) {
          const finished = await speak(deps, { situation: SITUATIONS.ask, facts: EMPTY_TEXT, required: [], fallbackKey: 'ask' })
          const split = splitPushScript(deps, finished.script)
          const message = buildFcmMessage(config.deviceToken, questionPushId(today), split.text, split.script, DRINK_QUESTION_ACTIONS)
          const result = await sendOnce(deps, message)
          if (result?.ok) {
            await deps.store.writeSetting(DRINK_ASKED_ON_KEY, today)
            console.log('每日詢問推播送出成功')
          }
        }
      }
    } catch (error) {
      console.error('每日詢問失敗：', error?.message)
    }
  }

  // 2. F3 盤前均線排程（08:30）：必須在 Todoist 判斷之前，有獨立 try/catch（A41、V34）
  if (timeStr === '08:30') {
    try {
      await runMaReport(deps, nowMs, { push: true })
    } catch (error) {
      console.error('盤前均線排程失敗：', error?.message)
    }
  }

  // 3. Todoist 雙軌提醒排程：需具備 todoist 實例與推播設定
  if (!deps.todoist || !deps.pushConfig?.deviceToken) {
    return
  }

  // 08:30 P3 掃描
  if (timeStr === '08:30') {
    try {
      await runP3Scan(deps, today)
    } catch (error) {
      console.error('P3 掃描失敗：', error?.message)
    }
  }

  // 09:00 P2 掃描
  if (timeStr === '09:00') {
    try {
      await runP2Scan(deps, today, nowMs)
    } catch (error) {
      console.error('P2 掃描失敗：', error?.message)
    }
  }

  // 21:00 追問
  if (timeStr === '21:00') {
    try {
      await runNightFollowup(deps, today)
    } catch (error) {
      console.error('夜間追問失敗：', error?.message)
    }
  }
}

// 把根路徑導到真正的入口頁，查詢字串（例如 ?debug=1）原封不動帶過去
const redirectToApp = (url) => Response.redirect(new URL(APP_PATH + url.search, url.origin).href, 302)

// 授權中介：只擋 /api/ 底下的路徑。根路徑與靜態資源永遠公開，
// 否則使用者連網頁都打不開，也就沒有地方可以輸入密鑰（架構約束 A8）。
const needsSecret = (pathname) => pathname.startsWith(API_PREFIX)

// 建立處理函式：只認 /api/chat、/api/persona、/api/usage、/api/push、/api/drink/*、/api/todoist/action 與根路徑
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
  if (url.pathname.startsWith(DRINK_PREFIX)) {
    return handleDrink(deps, request, url.pathname)
  }
  if (url.pathname === TODOIST_ACTION_PATH) {
    return handleTodoistAction(deps, request)
  }
  if (url.pathname.startsWith(TODOIST_PREFIX)) {
    return jsonResponse({ error: NOT_FOUND_MESSAGE }, 404)
  }
  if (url.pathname.startsWith(MA_PREFIX)) {
    return handleMa(deps, request, url.pathname)
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

