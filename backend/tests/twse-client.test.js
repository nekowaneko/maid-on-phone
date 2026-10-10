// 證交所 API 用戶端與測試 Stub 驗證
// 驗證 TWSE 資料轉換、錯誤代碼丟出與 Stub 介面行為。

import test from 'node:test'
import assert from 'node:assert/strict'
import { createTwseClient } from '../worker/twse-client.js'
import { createTwseStub } from '../worker/twse-client.stub.js'

const mockDefaults = {
  twseAllUrl: 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
  twseDayUrl: 'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY',
  twseHolidayUrl: 'https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule',
  holidayKeepWords: ['開始交易', '最後交易']
}

test('twse-client listAll 解析全市場資料與收盤價', async () => {
  const fakeData = [
    { Code: '2330', Name: '台積電', ClosingPrice: '1,000.00', Date: '1151008' },
    { Code: '2454', Name: '聯發科', ClosingPrice: '1250', Date: '1151008' },
    { Code: '9999', Name: '暫停交易', ClosingPrice: '--', Date: '1151008' },
    { Code: '8888', Name: '無價格', ClosingPrice: '', Date: '1151008' }
  ]
  const fakeFetch = async (url) => {
    assert.equal(url, mockDefaults.twseAllUrl)
    return {
      ok: true,
      status: 200,
      json: async () => fakeData
    }
  }

  const client = createTwseClient(fakeFetch, mockDefaults)
  const result = await client.listAll()
  assert.equal(result.asOf, '2026-10-08')
  assert.equal(result.rows.length, 2)
  assert.deepEqual(result.rows[0], { code: '2330', name: '台積電', close: 1000 })
  assert.deepEqual(result.rows[1], { code: '2454', name: '聯發科', close: 1250 })
})

test('twse-client listAll 異常處理（非 2xx、網路異常、格式錯誤）', async () => {
  // 非 2xx
  const client500 = createTwseClient(async () => ({ ok: false, status: 502 }), mockDefaults)
  await assert.rejects(() => client500.listAll(), /TWSE_502/)

  // 網路例外
  const clientNet = createTwseClient(async () => { throw new Error('connection refused') }, mockDefaults)
  await assert.rejects(() => clientNet.listAll(), /TWSE_NETWORK/)

  // 格式錯誤（非預期 JSON）
  const clientFmt = createTwseClient(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ invalid: true })
  }), mockDefaults)
  await assert.rejects(() => clientFmt.listAll(), /TWSE_FORMAT/)
})

test('twse-client getMonth 解析單月收盤價並由舊到新排序', async () => {
  const fakePayload = {
    stat: 'OK',
    fields: ['日期', '成交股數', '成交金額', '開盤價', '最高價', '最低價', '收盤價'],
    data: [
      ['115/10/05', '100', '100', '980', '990', '970', '990.00'],
      ['115/10/01', '100', '100', '950', '960', '940', '950.00'],
      ['115/10/08', '100', '100', '1000', '1010', '990', '1,000.00']
    ]
  }

  const fakeFetch = async (url) => {
    assert.match(url, /stockNo=2330/)
    assert.match(url, /date=20261001/)
    return {
      ok: true,
      status: 200,
      json: async () => fakePayload
    }
  }

  const client = createTwseClient(fakeFetch, mockDefaults)
  const rows = await client.getMonth('2330', '202610')
  assert.equal(rows.length, 3)
  assert.deepEqual(rows[0], { date: '2026-10-01', close: 950 })
  assert.deepEqual(rows[1], { date: '2026-10-05', close: 990 })
  assert.deepEqual(rows[2], { date: '2026-10-08', close: 1000 })
})

test('twse-client getMonth 查無資料時回傳空陣列', async () => {
  const clientEmpty = createTwseClient(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ stat: '很抱歉，沒有符合條件的資料!' })
  }), mockDefaults)

  const rows = await clientEmpty.getMonth('9999', '202610')
  assert.deepEqual(rows, [])
})

test('twse-client listClosedDates 正確篩選休市日並排除交易開始日', async () => {
  const holidayData = [
    { Date: '1150101', Name: '中華民國開國紀念日', Description: '放假' },
    { Date: '1150102', Name: '農曆春節開始交易', Description: '開始交易' },
    { Date: '1150210', Name: '春節最後交易', Description: '市場交易日' },
    { Date: '1150215', Name: '春節休市', Description: '市場休市' },
    { Date: '1141231', Name: '去年跨年', Description: '放假' }
  ]

  const client = createTwseClient(async () => ({
    ok: true,
    status: 200,
    json: async () => holidayData
  }), mockDefaults)

  const closed = await client.listClosedDates(2026)
  assert.deepEqual(closed, ['2026-01-01', '2026-02-15'])
})

test('twse-client.stub 記錄呼叫歷史與模擬異常', async () => {
  const stub = createTwseStub({
    all: { asOf: '2026-10-08', rows: [{ code: '2330', name: '台積電', close: 1000 }] },
    months: {
      '2330': {
        '202610': [{ date: '2026-10-08', close: 1000 }]
      }
    },
    closed: {
      '2026': ['2026-10-10']
    },
    failCodes: ['2454']
  })

  const allRes = await stub.listAll()
  assert.equal(allRes.asOf, '2026-10-08')

  const monthRes = await stub.getMonth('2330', '202610')
  assert.equal(monthRes.length, 1)

  const closedRes = await stub.listClosedDates(2026)
  assert.deepEqual(closedRes, ['2026-10-10'])

  // 驗證呼叫記錄逐字比對
  assert.deepEqual(stub.calls, [
    { method: 'listAll' },
    { method: 'getMonth', code: '2330', yyyymm: '202610' },
    { method: 'listClosedDates', year: 2026 }
  ])

  // 驗證 failCodes 丟例外
  await assert.rejects(() => stub.getMonth('2454', '202610'), /TWSE_500/)
})
