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
import { createHandler } from './handlers.js'
import { streamCompletion as realStream } from './llm-client.js'
import { streamCompletion as stubStream } from './llm-client.stub.js'
import { createStore as realStore } from './store.js'
import { createStore as stubStore } from './store.stub.js'

// 常數定義
const STUB_FLAG = 'true'

// 功能函數定義

// 依環境變數決定要用真實客戶端還是 Stub，驗收全程走 Stub
const pickStreamer = (env) => (env?.USE_STUB === STUB_FLAG ? stubStream : realStream)

// 儲存層跟語言模型客戶端共用同一個開關，兩邊不會一真一假
const pickStore = (env) => (env?.USE_STUB === STUB_FLAG ? stubStore : realStore)

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
  secret: env?.APP_SECRET,
  store: pickStore(env)(env),
  streamer: (messages) => pickStreamer(env)(messages, env)
})

export default {
  fetch: async (request, env) => createHandler(buildDeps(env))(request)
}
