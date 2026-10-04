// 推播客戶端（真實版）：用 Firebase 服務帳戶換存取權杖，再呼叫 FCM HTTP v1 送出一則訊息。
// 這是整個 backend 唯一碰服務帳戶私鑰、唯一連 googleapis.com 的檔案（架構約束 A18）。
// 權杖不快取；失敗一律直接回報，不重試（架構約束 A21）。
// 回傳值、例外與日誌都不得含服務帳戶內容或推播代碼（架構約束 A19），所以這支不寫任何日誌。

// 常數定義
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const FCM_SEND_ORIGIN = 'https://fcm.googleapis.com/v1/projects/'
const FCM_SEND_SUFFIX = '/messages:send'
const JWT_GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:jwt-bearer'
const JWT_HEADER = { alg: 'RS256', typ: 'JWT' }
const JWT_TTL_SECONDS = 3600 // 權杖有效一小時，每次送出都重新換
const SIGN_ALGORITHM = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }
const PEM_BOUNDARY = /-----[A-Z ]+-----/g // PEM 的標頭與標尾
const ESCAPED_NEWLINE = /\\n/g // 環境變數裡常見的字面 \n
const WHITESPACE = /\s+/g
const UNKNOWN_CODE = 'UNKNOWN'
const NETWORK_ERROR_CODE = 'NETWORK_ERROR'
const INVALID_ACCOUNT_CODE = 'INVALID_SERVICE_ACCOUNT'
const FORM_HEADERS = { 'content-type': 'application/x-www-form-urlencoded' }
const JSON_CONTENT_TYPE = 'application/json; charset=utf-8'
const POST_METHOD = 'POST'
const MS_PER_SECOND = 1000

// 功能函數定義

// 位元組轉 base64url（不補等號）
const toBase64Url = (bytes) =>
  btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

// 物件轉成 JWT 的一段：JSON → UTF-8 → base64url
const encodeSegment = (value) => toBase64Url(new TextEncoder().encode(JSON.stringify(value)))

// 去掉 PEM 標頭、標尾與換行（真正的換行與字面的 \n 都接受）後 base64 解碼
const pemToBytes = (pem) => {
  const body = pem.replace(ESCAPED_NEWLINE, '\n').replace(PEM_BOUNDARY, '').replace(WHITESPACE, '')
  return Uint8Array.from(atob(body), (char) => char.charCodeAt(0))
}

// 解析服務帳戶 JSON，缺欄位或格式錯誤回傳 null
const parseAccount = (serviceAccountText) => {
  try {
    const account = JSON.parse(serviceAccountText)
    const ok = ['project_id', 'client_email', 'private_key'].every((field) => typeof account?.[field] === 'string')
    return ok ? account : null
  } catch (error) {
    return null
  }
}

// 以 WebCrypto 匯入 PKCS#8 私鑰
const importPrivateKey = (pem) =>
  crypto.subtle.importKey('pkcs8', pemToBytes(pem), SIGN_ALGORITHM, false, ['sign'])

// 簽一張 RS256 JWT，用來向 Google 換存取權杖
const signJwt = async (account, nowMs) => {
  const iat = Math.floor(nowMs / MS_PER_SECOND)
  const claims = {
    iss: account.client_email,
    sub: account.client_email,
    aud: TOKEN_URL,
    scope: FCM_SCOPE,
    iat,
    exp: iat + JWT_TTL_SECONDS
  }
  const unsigned = `${encodeSegment(JWT_HEADER)}.${encodeSegment(claims)}`
  const key = await importPrivateKey(account.private_key)
  const signature = await crypto.subtle.sign(SIGN_ALGORITHM, key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${toBase64Url(new Uint8Array(signature))}`
}

// 讀回應主體的 JSON，讀不到就回傳 null
const readJson = async (response) => {
  try {
    return await response.json()
  } catch (error) {
    return null
  }
}

// 從 FCM 錯誤回應取出錯誤代碼：先找 details[].errorCode，再用 error.status，都沒有用 UNKNOWN
const pickFcmErrorCode = (body) => {
  const details = Array.isArray(body?.error?.details) ? body.error.details : []
  const found = details.find((detail) => typeof detail?.errorCode === 'string' && detail.errorCode.length > 0)
  if (found) return found.errorCode
  const status = body?.error?.status
  return typeof status === 'string' && status.length > 0 ? status : UNKNOWN_CODE
}

// 從權杖端點的錯誤回應取出錯誤代碼（例如 invalid_grant），沒有用 UNKNOWN
const pickTokenErrorCode = (body) =>
  typeof body?.error === 'string' && body.error.length > 0 ? body.error : UNKNOWN_CODE

// 呼叫一次對外端點；fetch 本身拋錯（網路錯誤）時回傳 null
const fetchOnce = async (fetchImpl, url, init) => {
  try {
    return await fetchImpl(url, init)
  } catch (error) {
    return null
  }
}

// 用簽好的 JWT 換存取權杖；回傳 { ok: true, token } 或失敗結果
const exchangeToken = async (fetchImpl, jwt) => {
  const response = await fetchOnce(fetchImpl, TOKEN_URL, {
    method: POST_METHOD,
    headers: FORM_HEADERS,
    body: new URLSearchParams({ grant_type: JWT_GRANT_TYPE, assertion: jwt }).toString()
  })
  if (response === null) return { ok: false, status: null, code: NETWORK_ERROR_CODE }
  const body = await readJson(response)
  if (!response.ok) return { ok: false, status: response.status, code: pickTokenErrorCode(body) }
  const token = body?.access_token
  if (typeof token !== 'string' || token.length === 0) return { ok: false, status: response.status, code: UNKNOWN_CODE }
  return { ok: true, token }
}

// 把訊息送到 FCM 的送出端點，恰好一次
const postMessage = async (fetchImpl, projectId, token, message) => {
  const response = await fetchOnce(fetchImpl, `${FCM_SEND_ORIGIN}${encodeURIComponent(projectId)}${FCM_SEND_SUFFIX}`, {
    method: POST_METHOD,
    headers: { authorization: `Bearer ${token}`, 'content-type': JSON_CONTENT_TYPE },
    body: JSON.stringify(message)
  })
  if (response === null) return { ok: false, status: null, code: NETWORK_ERROR_CODE }
  const body = await readJson(response)
  if (!response.ok) return { ok: false, status: response.status, code: pickFcmErrorCode(body) }
  return { ok: true, name: typeof body?.name === 'string' ? body.name : null }
}

// 送出一則訊息；回傳 { ok: true, name } 或 { ok: false, status, code }
export const sendFcm = async (message, serviceAccountText, fetchImpl = fetch) => {
  const account = parseAccount(serviceAccountText)
  if (account === null) return { ok: false, status: null, code: INVALID_ACCOUNT_CODE }
  let jwt
  try {
    jwt = await signJwt(account, Date.now())
  } catch (error) {
    // 私鑰格式不對：不帶出任何例外內容，避免私鑰片段跑進日誌
    return { ok: false, status: null, code: INVALID_ACCOUNT_CODE }
  }
  const exchanged = await exchangeToken(fetchImpl, jwt)
  if (!exchanged.ok) return exchanged
  return postMessage(fetchImpl, account.project_id, exchanged.token, message)
}
