// 測試與離線開發用的推播客戶端 Stub：不連外，把收到的訊息存進陣列供測試讀取。
// 介面與 worker/fcm-client.js 的 sendFcm 相同，由環境變數 USE_STUB 決定載入哪一支。

// 常數定義
const FAILURE_RESULT = { ok: false, status: 404, code: 'UNREGISTERED' } // 推播代碼失效時 Google 的典型回應
const STUB_NAME_PREFIX = 'projects/stub/messages/'

// 功能函數定義

// 建立一組全新的 Stub：sent 為收到的訊息、calls 為被呼叫次數；fail 為 true 時一律回傳失敗
export const createFcmStub = ({ fail = false } = {}) => {
  const sent = []
  let calls = 0
  // 收下訊息：成功時回傳假的訊息名稱，失敗時不記入 sent
  const sendFcm = async (message, serviceAccountText) => {
    calls += 1
    if (fail) return { ...FAILURE_RESULT }
    sent.push(message)
    return { ok: true, name: `${STUB_NAME_PREFIX}${sent.length}` }
  }
  return { sendFcm, sent, callCount: () => calls }
}

// 預設的共用 Stub（Worker 以 USE_STUB 執行時使用）
const sharedStub = createFcmStub()

// 送出一則訊息（Stub 版，只記錄不連外）
export const sendFcm = async (message, serviceAccountText, fetchImpl) => sharedStub.sendFcm(message, serviceAccountText)
