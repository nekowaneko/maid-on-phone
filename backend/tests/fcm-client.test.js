// 真實推播客戶端的輔助測試：現場產生 RSA 金鑰、以假的 fetchImpl 代替網路，
// 驗證 JWT 欄位、簽章、兩次請求的網址與失敗時的錯誤代碼。全程不得真的連外。

import test from 'node:test'
import assert from 'node:assert/strict'
import { sendFcm } from '../worker/fcm-client.js'

// 常數定義
const PEM_DASHES = '-----' // PEM 標頭用的破折號，拆開寫避免追蹤檔被誤判為含私鑰
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SEND_URL = 'https://fcm.googleapis.com/v1/projects/test-only-project/messages:send'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'
const MESSAGE = { message: { token: 'tok', data: { id: 'i', text: 't' }, android: { priority: 'high' } } }
const ALGORITHM = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }

// 全程不得對外連線
globalThis.fetch = () => {
  throw new Error('測試期間不得對外發出任何請求')
}

// 位元組轉標準 base64
const toBase64 = (bytes) => btoa(Array.from(new Uint8Array(bytes), (byte) => String.fromCharCode(byte)).join(''))

// base64url 解碼成位元組
const fromBase64Url = (text) => {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(text.length / 4) * 4, '=')
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0))
}

// 現場產生一組金鑰，回傳公鑰與 PEM 格式私鑰（每 64 字換行）
const makeKeyPair = async () => {
  const pair = await crypto.subtle.generateKey(ALGORITHM, true, ['sign', 'verify'])
  const body = toBase64(await crypto.subtle.exportKey('pkcs8', pair.privateKey)).match(/.{1,64}/g).join('\n')
  const pem = `${PEM_DASHES}BEGIN PRIVATE KEY${PEM_DASHES}\n${body}\n${PEM_DASHES}END PRIVATE KEY${PEM_DASHES}\n`
  return { publicKey: pair.publicKey, pem }
}

const keys = await makeKeyPair()

// 組出服務帳戶 JSON；escaped 為 true 時私鑰換行改成字面的 \n
const accountText = (escaped = false) =>
  JSON.stringify({
    project_id: 'test-only-project',
    client_email: 'test-only@test-only-project.iam.gserviceaccount.example',
    private_key: escaped ? keys.pem.replace(/\n/g, '\\n') : keys.pem
  })

// 假的 fetchImpl：依序回放 responses，記下每次請求
const fakeFetch = (responses) => {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    const next = responses[calls.length - 1]
    if (next instanceof Error) throw next
    return new Response(next.body === undefined ? null : JSON.stringify(next.body), { status: next.status })
  }
  return { impl, calls }
}

// 成功的兩段回應：換權杖、送出
const okResponses = () => [
  { status: 200, body: { access_token: 'test-only-access', expires_in: 3600 } },
  { status: 200, body: { name: 'projects/test-only-project/messages/1' } }
]

test('成功：先換權杖再送出，回傳訊息名稱', async () => {
  const fake = fakeFetch(okResponses())
  const result = await sendFcm(MESSAGE, accountText(), fake.impl)
  assert.deepEqual(result, { ok: true, name: 'projects/test-only-project/messages/1' })
  assert.equal(fake.calls.length, 2)
  assert.equal(fake.calls[0].url, TOKEN_URL)
  assert.equal(fake.calls[1].url, SEND_URL)
  assert.equal(fake.calls[1].init.method, 'POST')
  assert.equal(fake.calls[1].init.headers.authorization, 'Bearer test-only-access')
  assert.deepEqual(JSON.parse(fake.calls[1].init.body), MESSAGE)
})

test('JWT 欄位與簽章正確', async () => {
  const fake = fakeFetch(okResponses())
  const before = Math.floor(Date.now() / 1000)
  await sendFcm(MESSAGE, accountText(), fake.impl)
  const form = new URLSearchParams(fake.calls[0].init.body)
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer')
  const [header, claims, signature] = form.get('assertion').split('.')
  assert.deepEqual(JSON.parse(new TextDecoder().decode(fromBase64Url(header))), { alg: 'RS256', typ: 'JWT' })
  const body = JSON.parse(new TextDecoder().decode(fromBase64Url(claims)))
  assert.equal(body.iss, 'test-only@test-only-project.iam.gserviceaccount.example')
  assert.equal(body.sub, body.iss)
  assert.equal(body.aud, TOKEN_URL)
  assert.equal(body.scope, SCOPE)
  assert.ok(body.iat >= before && body.iat <= before + 5)
  assert.equal(body.exp, body.iat + 3600)
  const valid = await crypto.subtle.verify(ALGORITHM, keys.publicKey, fromBase64Url(signature), new TextEncoder().encode(`${header}.${claims}`))
  assert.equal(valid, true)
})

test('私鑰中字面的 \\n 也接受', async () => {
  const fake = fakeFetch(okResponses())
  const result = await sendFcm(MESSAGE, accountText(true), fake.impl)
  assert.equal(result.ok, true)
})

test('權杖交換失敗：回傳端點的 error 代碼，不送出', async () => {
  const fake = fakeFetch([{ status: 400, body: { error: 'invalid_grant', error_description: 'x' } }])
  const result = await sendFcm(MESSAGE, accountText(), fake.impl)
  assert.deepEqual(result, { ok: false, status: 400, code: 'invalid_grant' })
  assert.equal(fake.calls.length, 1)
})

test('權杖交換失敗且沒有 error：UNKNOWN', async () => {
  const fake = fakeFetch([{ status: 500 }])
  assert.deepEqual(await sendFcm(MESSAGE, accountText(), fake.impl), { ok: false, status: 500, code: 'UNKNOWN' })
})

test('權杖回應沒有 access_token：UNKNOWN，不送出', async () => {
  const fake = fakeFetch([{ status: 200, body: {} }])
  assert.deepEqual(await sendFcm(MESSAGE, accountText(), fake.impl), { ok: false, status: 200, code: 'UNKNOWN' })
  assert.equal(fake.calls.length, 1)
})

test('送出失敗：優先取 details 的 errorCode', async () => {
  const fake = fakeFetch([
    okResponses()[0],
    { status: 404, body: { error: { status: 'NOT_FOUND', details: [{ '@type': 'x' }, { errorCode: 'UNREGISTERED' }] } } }
  ])
  assert.deepEqual(await sendFcm(MESSAGE, accountText(), fake.impl), { ok: false, status: 404, code: 'UNREGISTERED' })
  assert.equal(fake.calls.length, 2)
})

test('送出失敗：沒有 errorCode 時用 error.status，再沒有用 UNKNOWN', async () => {
  const withStatus = fakeFetch([okResponses()[0], { status: 403, body: { error: { status: 'PERMISSION_DENIED' } } }])
  assert.deepEqual(await sendFcm(MESSAGE, accountText(), withStatus.impl), { ok: false, status: 403, code: 'PERMISSION_DENIED' })
  const bare = fakeFetch([okResponses()[0], { status: 500 }])
  assert.deepEqual(await sendFcm(MESSAGE, accountText(), bare.impl), { ok: false, status: 500, code: 'UNKNOWN' })
})

test('網路錯誤：NETWORK_ERROR，不重試', async () => {
  const first = fakeFetch([new Error('offline')])
  assert.deepEqual(await sendFcm(MESSAGE, accountText(), first.impl), { ok: false, status: null, code: 'NETWORK_ERROR' })
  assert.equal(first.calls.length, 1)
  const second = fakeFetch([okResponses()[0], new Error('offline')])
  assert.deepEqual(await sendFcm(MESSAGE, accountText(), second.impl), { ok: false, status: null, code: 'NETWORK_ERROR' })
  assert.equal(second.calls.length, 2)
})

test('服務帳戶不是 JSON、缺欄位或私鑰壞掉：不連外，回傳 INVALID_SERVICE_ACCOUNT', async () => {
  const broken = JSON.stringify({ project_id: 'p', client_email: 'e', private_key: 'not-a-key' })
  for (const text of ['不是 JSON', JSON.stringify({ project_id: 'p' }), broken]) {
    const fake = fakeFetch([])
    assert.deepEqual(await sendFcm(MESSAGE, text, fake.impl), { ok: false, status: null, code: 'INVALID_SERVICE_ACCOUNT' })
    assert.equal(fake.calls.length, 0)
  }
})

test('回傳結果不含服務帳戶內容或權杖', async () => {
  const fake = fakeFetch([okResponses()[0], { status: 400, body: { error: { status: 'INVALID_ARGUMENT' } } }])
  const text = JSON.stringify(await sendFcm(MESSAGE, accountText(), fake.impl))
  assert.ok(!text.includes('test-only-access'))
  assert.ok(!text.includes('client_email'))
  assert.ok(!text.includes('PRIVATE KEY'))
})
