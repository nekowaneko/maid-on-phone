// Cloudflare Worker 進入點：一層薄殼。
// 設定檔在建置時由 wrangler 以模組方式帶入（JSON 與 Text 規則），
// 這支只負責把它們組成 deps，再把請求交給 worker/handlers.js。
//
// 路由判斷一律不寫在這裡（架構約束 A9）：這支因為 import 了 .md，
// 在 Node 下載不動（見 DECISIONS.md D11），寫在這裡的邏輯就驗不到。

import emotionConfig from '../config/emotion-map.json' with { type: 'json' }
import gapConfig from '../config/time-gap-tiers.json' with { type: 'json' }
import fallbackConfig from '../config/fallback-lines.json' with { type: 'json' }
import quotaConfig from '../config/quota.json' with { type: 'json' }
import personaSchema from '../config/persona-schema.json' with { type: 'json' }
import messageSchema from '../config/message.json' with { type: 'json' }
import personaText from '../config/persona.md'
import templateText from '../config/prompt-template.md'
import drinkModel from '../config/drink-model.json' with { type: 'json' }
import starbucksTable from '../config/starbucks.json' with { type: 'json' }
import drinkDefaults from '../config/drink-defaults.json' with { type: 'json' }
import drinkLines from '../config/drink-lines.json' with { type: 'json' }
import drinkParsePrompt from '../config/drink-parse-prompt.md'
import drinkScriptPrompt from '../config/drink-script-prompt.md'
import todoistDefaults from '../config/todoist-defaults.json' with { type: 'json' }
import todoistLines from '../config/todoist-lines.json' with { type: 'json' }
import todoistSplitPrompt from '../config/todoist-split-prompt.md'
import todoistScriptPrompt from '../config/todoist-script-prompt.md'
import { createHandler, runScheduled } from './handlers.js'
import { streamCompletion as realStream } from './llm-client.js'
import { streamCompletion as stubStream } from './llm-client.stub.js'
import { createStore as realStore } from './store.js'
import { createStore as stubStore } from './store.stub.js'
import { sendFcm as realPusher } from './fcm-client.js'
import { sendFcm as stubPusher } from './fcm-client.stub.js'
import { createTodoistClient as realTodoistClient } from './todoist-client.js'
import { createTodoistStub as stubTodoistClient } from './todoist-client.stub.js'

// 常數定義
const STUB_FLAG = 'true'

// 功能函數定義

// 依環境變數決定要用真實客戶端還是 Stub，驗收全程走 Stub
const pickStreamer = (env) => (env?.USE_STUB === STUB_FLAG ? stubStream : realStream)

// 儲存層跟語言模型客戶端共用同一個開關，兩邊不會一真一假
const pickStore = (env) => (env?.USE_STUB === STUB_FLAG ? stubStore : realStore)

// 推播客戶端也跟同一個開關，Stub 模式下絕不連到 Google
const pickPusher = (env) => (env?.USE_STUB === STUB_FLAG ? stubPusher : realPusher)

// Todoist 用戶端也跟同一個開關
const pickTodoist = (env) => (env?.USE_STUB === STUB_FLAG ? stubTodoistClient : realTodoistClient)

// 組出這一次請求要用的相依。streamer 在這裡就把 env 綁好，
// 路由層因此完全不必認識環境變數，也碰不到憑證。
const buildDeps = (env) => ({
  emotionConfig,
  gapConfig,
  fallbackConfig,
  quotaConfig,
  personaSchema,
  messageSchema,
  personaText,
  templateText,
  // M2 戒飲記錄（§4.1.8）
  drinkModel,
  starbucksTable,
  drinkDefaults,
  drinkLines,
  drinkPrompts: { parse: drinkParsePrompt, script: drinkScriptPrompt },
  // M3 Todoist 雙軌提醒（§4.2）
  todoist: env?.TODOIST_TOKEN ? pickTodoist(env)(env.TODOIST_TOKEN, fetch, todoistDefaults) : null,
  todoistDefaults,
  todoistLines,
  todoistPrompts: { split: todoistSplitPrompt, script: todoistScriptPrompt },
  secret: env?.APP_SECRET,
  store: pickStore(env)(env),
  streamer: (messages) => pickStreamer(env)(messages, env),
  // 推播：服務帳戶在這裡就綁好，路由層只把訊息交出去（M1.5 §4.4）
  pusher: (message) => pickPusher(env)(message, env?.FCM_SERVICE_ACCOUNT),
  pushConfig: { serviceAccount: env?.FCM_SERVICE_ACCOUNT, deviceToken: env?.FCM_DEVICE_TOKEN }
})

export default {
  fetch: async (request, env) => createHandler(buildDeps(env))(request),
  // M2 每日詢問：每個整點觸發一次，邏輯全部在 handlers.js 的 runScheduled（A9）
  scheduled: (event, env, ctx) => ctx.waitUntil(runScheduled(buildDeps(env), event.scheduledTime))
}
