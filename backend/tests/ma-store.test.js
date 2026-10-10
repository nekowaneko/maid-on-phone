// 盤前均線儲存層方法單元測試
// 驗證 ma_watch、ma_close、ma_result 之存取與設定讀寫。

import test from 'node:test'
import assert from 'node:assert/strict'
import { createStore } from '../worker/store.stub.js'

test('store 追蹤清單管理（listWatch, addWatch, setWatchActive）', async () => {
  const store = createStore()

  // 初始應為空
  const list0 = await store.listWatch()
  assert.deepEqual(list0, [])

  // 新增標的
  await store.addWatch({ code: '2330', name: '台積電', addedOn: '2026-10-10' })
  await store.addWatch({ code: '2454', name: '聯發科', addedOn: '2026-10-10' })

  const list1 = await store.listWatch()
  assert.equal(list1.length, 2)
  assert.equal(list1[0].code, '2330')
  assert.equal(list1[0].sort, 1)
  assert.equal(list1[0].active, true)
  assert.equal(list1[1].code, '2454')
  assert.equal(list1[1].sort, 2)

  // 重複新增應不動
  await store.addWatch({ code: '2330', name: '台積電', addedOn: '2026-10-10' })
  const list2 = await store.listWatch()
  assert.equal(list2.length, 2)

  // 停止追蹤
  await store.setWatchActive('2330', false)
  const list3 = await store.listWatch()
  assert.equal(list3[0].active, false)

  // 復原追蹤
  await store.setWatchActive('2330', true)
  const list4 = await store.listWatch()
  assert.equal(list4[0].active, true)

  // 不存在之標的標記狀態丟例外
  await assert.rejects(() => store.setWatchActive('9999', false), /MA_NOT_FOUND/)
})

test('store 收盤價快取存取（upsertCloses, listCloses）', async () => {
  const store = createStore()

  const rows = [
    { date: '2026-10-01', close: 100 },
    { date: '2026-10-02', close: 102 },
    { date: '2026-10-05', close: 105 },
    { date: '2026-10-06', close: 104 }
  ]
  await store.upsertCloses('2330', rows)

  // listCloses 取最新 2 筆，回傳由舊到新
  const closesLimit2 = await store.listCloses('2330', 2)
  assert.equal(closesLimit2.length, 2)
  assert.deepEqual(closesLimit2[0], { date: '2026-10-05', close: 105 })
  assert.deepEqual(closesLimit2[1], { date: '2026-10-06', close: 104 })

  // 覆寫既有收盤價
  await store.upsertCloses('2330', [{ date: '2026-10-06', close: 110 }])
  const closesUpdated = await store.listCloses('2330', 1)
  assert.deepEqual(closesUpdated[0], { date: '2026-10-06', close: 110 })
})

test('store 均線結果存取（upsertResults, listResultDates, listResults）', async () => {
  const store = createStore()

  const asOf1 = '2026-10-08'
  const results1 = [
    { code: '2330', kind: 'U', ma: [58, 50.5, 30.5] },
    { code: '2454', kind: 'D', ma: [3, 10.5, 30.5] }
  ]
  await store.upsertResults(asOf1, results1)

  const asOf2 = '2026-10-07'
  const results2 = [
    { code: '2330', kind: 'U', ma: [57, 50, 30] }
  ]
  await store.upsertResults(asOf2, results2)

  // listResultDates 取日期，由新到舊
  const dates = await store.listResultDates(5)
  assert.deepEqual(dates, ['2026-10-08', '2026-10-07'])

  // listResults 取指定日期之結果
  const fetched = await store.listResults(['2026-10-08'])
  assert.equal(fetched.length, 2)
  assert.equal(fetched.find((f) => f.code === '2330')?.kind, 'U')
  assert.equal(fetched.find((f) => f.code === '2454')?.kind, 'D')
})

test('store 設定鍵值讀寫（ma.sentOn, ma.last, ma.refreshedAt）', async () => {
  const store = createStore()

  await store.writeSetting('ma.sentOn', '2026-10-10')
  assert.equal(await store.readSetting('ma.sentOn'), '2026-10-10')

  const lastObj = { reportDate: '2026-10-10', asOf: '2026-10-08', status: 'ok', failed: [] }
  await store.writeSetting('ma.last', JSON.stringify(lastObj))
  const lastRead = JSON.parse(await store.readSetting('ma.last'))
  assert.deepEqual(lastRead, lastObj)
})
