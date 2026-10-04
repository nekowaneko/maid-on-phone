// core/background.js 的單元測試：說明文字驗證、單張上限、紀錄形狀、清單排序、選取收斂、
// 刪除之後的清單，以及這張圖最多能放大到幾倍。
// 限制值一律從 config/background.json 讀進來，設定改了測試也跟著改，不在測試裡另寫一組數字。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  describeBytes,
  validateLabel,
  validateBytes,
  createRecordId,
  createRecord,
  sortByNewest,
  findRecord,
  resolveSelection,
  canApply,
  canDelete,
  removeRecord,
  resolveMaxZoom
} from '../core/background.js'

// 常數定義
const SETTINGS = JSON.parse(readFileSync(new URL('../config/background.json', import.meta.url), 'utf8'))
const MAX_BYTES = SETTINGS.maxBytes
const MAX_LABEL = SETTINGS.maxLabelChars
const MIN_LABEL = SETTINGS.minLabelChars
const MAX_ZOOM = SETTINGS.maxZoom
const MIN_CROP_WIDTH = SETTINGS.minCropWidth
const SAMPLE_LABEL = '深夜的房間'
const RECORDS = [
  { id: 'bg-1000-aaaaaa', label: '海邊', createdAt: 1000 },
  { id: 'bg-3000-cccccc', label: '房間', createdAt: 3000 },
  { id: 'bg-2000-bbbbbb', label: '街道', createdAt: 2000 }
]

test('describeBytes 依大小換單位', () => {
  assert.equal(describeBytes(512), '512 B')
  assert.equal(describeBytes(2048), '2 KB')
  assert.equal(describeBytes(1572864), '1.5 MB')
})

test('describeBytes 對壞掉的輸入回傳未知大小，不自行湊數字', () => {
  assert.equal(describeBytes(undefined), '未知大小')
  assert.equal(describeBytes(-1), '未知大小')
  assert.equal(describeBytes('大概一點五兆'), '未知大小')
})

test('validateLabel 正常的說明文字通過，並回傳修剪過的版本', () => {
  const result = validateLabel(`  ${SAMPLE_LABEL}  `, SETTINGS)
  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
  assert.equal(result.label, SAMPLE_LABEL)
})

test('validateLabel 過短（含整串空白）不給過', () => {
  const result = validateLabel('   ', SETTINGS)
  assert.equal(result.ok, false)
  assert.equal(result.errors.length, 1)
  assert.match(result.errors[0], new RegExp(String(MIN_LABEL)))
})

test('validateLabel 過長不給過，並講出目前幾個字', () => {
  const result = validateLabel('長'.repeat(MAX_LABEL + 5), SETTINGS)
  assert.equal(result.ok, false)
  assert.match(result.errors[0], new RegExp(String(MAX_LABEL + 5)))
})

test('validateLabel 對非字串一律當成空白處理', () => {
  assert.equal(validateLabel(undefined, SETTINGS).ok, false)
  assert.equal(validateLabel(42, SETTINGS).label, '')
})

test('validateLabel 沒給限制時不擋任何長度', () => {
  const result = validateLabel(SAMPLE_LABEL, {})
  assert.equal(result.ok, true)
})

test('validateBytes 沒超過單張上限就通過', () => {
  const result = validateBytes(MAX_BYTES, SETTINGS)
  assert.equal(result.ok, true)
  assert.deepEqual(result.errors, [])
})

test('validateBytes 超過單張上限就擋下來，訊息裡同時有實際大小與上限', () => {
  const result = validateBytes(MAX_BYTES + 1, SETTINGS)
  assert.equal(result.ok, false)
  assert.match(result.errors[0], new RegExp(describeBytes(MAX_BYTES)))
})

test('validateBytes 拿不到圖片內容時擋下來', () => {
  assert.equal(validateBytes(0, SETTINGS).ok, false)
  assert.equal(validateBytes(undefined, SETTINGS).ok, false)
  assert.equal(validateBytes(-5, SETTINGS).ok, false)
})

test('validateBytes 上限沒設就不限制大小，不自行代入預設上限', () => {
  assert.equal(validateBytes(MAX_BYTES * 10, {}).ok, true)
})

test('createRecordId 時間戳在前，同一毫秒不同亂數不會撞號', () => {
  const first = createRecordId(1700000000000, 0.1)
  const second = createRecordId(1700000000000, 0.9)
  assert.match(first, /^bg-1700000000000-[0-9a-z]{6}$/)
  assert.notEqual(first, second)
})

test('createRecordId 對壞掉的輸入仍給得出可用的編號', () => {
  assert.match(createRecordId(undefined, undefined), /^bg-0-[0-9a-z]{6}$/)
})

test('createRecord 只留下要存進去的欄位，多餘的丟掉', () => {
  const record = createRecord({ id: 'bg-1-aaaaaa', label: ` ${SAMPLE_LABEL} `, createdAt: 1, bytes: 2, width: 3, height: 4, blob: '不該被存進去' })
  assert.deepEqual(record, { id: 'bg-1-aaaaaa', label: SAMPLE_LABEL, createdAt: 1, bytes: 2, width: 3, height: 4 })
})

test('createRecord 對缺漏的欄位補成安全值，不會存進 undefined', () => {
  assert.deepEqual(createRecord(undefined), { id: '', label: '', createdAt: 0, bytes: 0, width: 0, height: 0 })
})

test('sortByNewest 新的排前面，且不動到原本的陣列', () => {
  const sorted = sortByNewest(RECORDS)
  assert.deepEqual(sorted.map((item) => item.createdAt), [3000, 2000, 1000])
  assert.equal(RECORDS[0].createdAt, 1000)
})

test('sortByNewest 對非陣列回傳空陣列', () => {
  assert.deepEqual(sortByNewest(undefined), [])
})

test('findRecord 找得到就回傳那一筆，找不到回傳 null', () => {
  assert.equal(findRecord(RECORDS, 'bg-2000-bbbbbb').label, '街道')
  assert.equal(findRecord(RECORDS, 'bg-9999-zzzzzz'), null)
  assert.equal(findRecord(RECORDS, ''), null)
  assert.equal(findRecord(undefined, 'bg-1000-aaaaaa'), null)
})

test('resolveSelection 選中的那張還在就保留，不在了就當作沒選', () => {
  assert.equal(resolveSelection(RECORDS, 'bg-1000-aaaaaa'), 'bg-1000-aaaaaa')
  assert.equal(resolveSelection(RECORDS, 'bg-9999-zzzzzz'), null)
  assert.equal(resolveSelection([], 'bg-1000-aaaaaa'), null)
})

test('canApply 只有真的選到一張才准按下選擇', () => {
  assert.equal(canApply(RECORDS, 'bg-3000-cccccc'), true)
  assert.equal(canApply(RECORDS, null), false)
  assert.equal(canApply([], 'bg-3000-cccccc'), false)
})

test('canDelete 只有真的選到一張才准按下刪除', () => {
  assert.equal(canDelete(RECORDS, 'bg-2000-bbbbbb'), true)
  assert.equal(canDelete(RECORDS, null), false)
  assert.equal(canDelete(RECORDS, 'bg-9999-zzzzzz'), false)
  assert.equal(canDelete([], 'bg-2000-bbbbbb'), false)
})

test('removeRecord 刪掉指定的那一筆，其餘與原順序都保留', () => {
  const left = removeRecord(RECORDS, 'bg-3000-cccccc')
  assert.deepEqual(left.map((item) => item.id), ['bg-1000-aaaaaa', 'bg-2000-bbbbbb'])
  // 不動到傳進來的那一份
  assert.equal(RECORDS.length, 3)
})

test('removeRecord 對不存在的編號回傳內容相同的新陣列', () => {
  const left = removeRecord(RECORDS, 'bg-9999-zzzzzz')
  assert.deepEqual(left.map((item) => item.id), RECORDS.map((item) => item.id))
  assert.notEqual(left, RECORDS)
})

test('removeRecord 對非陣列或空編號不會爆掉', () => {
  assert.deepEqual(removeRecord(undefined, 'bg-1000-aaaaaa'), [])
  assert.equal(removeRecord(RECORDS, '').length, 3)
  assert.equal(removeRecord(RECORDS, undefined).length, 3)
})

test('removeRecord 刪到最後一筆會得到空清單，選取也跟著失效', () => {
  const left = removeRecord([RECORDS[0]], RECORDS[0].id)
  assert.deepEqual(left, [])
  assert.equal(resolveSelection(left, RECORDS[0].id), null)
  assert.equal(canApply(left, RECORDS[0].id), false)
})

test('resolveMaxZoom 大圖由設定檔的倍率上限把關', () => {
  // 裁切框寬到除以畫質下限還超過倍率上限，這時倍率上限才是嚴格的那一個
  assert.equal(resolveMaxZoom(MIN_CROP_WIDTH * MAX_ZOOM * 2, SETTINGS), MAX_ZOOM)
})

test('resolveMaxZoom 小圖由畫質保護把關，放不到設定檔允許的倍率', () => {
  const coverWidth = MIN_CROP_WIDTH * 1.5
  assert.ok(1.5 < MAX_ZOOM)
  assert.equal(resolveMaxZoom(coverWidth, SETTINGS), 1.5)
})

test('resolveMaxZoom 裁切框已經比畫質下限還窄時完全不准放大', () => {
  assert.equal(resolveMaxZoom(MIN_CROP_WIDTH / 2, SETTINGS), 1)
})

test('resolveMaxZoom 上限沒設就不准放大，不自行代入預設倍率', () => {
  assert.equal(resolveMaxZoom(4000, {}), 1)
  assert.equal(resolveMaxZoom(4000, { minCropWidth: MIN_CROP_WIDTH }), 1)
})

test('resolveMaxZoom 沒設畫質下限時只看倍率上限', () => {
  assert.equal(resolveMaxZoom(4000, { maxZoom: MAX_ZOOM }), MAX_ZOOM)
  assert.equal(resolveMaxZoom(undefined, SETTINGS), MAX_ZOOM)
})
