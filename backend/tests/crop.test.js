// core/crop.js 的單元測試：裁切框大小、可滑動範圍、滑動後的矩形、輸出尺寸。
// 測試不預設任何一種手機比例，比例一律當成參數傳進去，換版面也不必改測試。

import test from 'node:test'
import assert from 'node:assert/strict'
import {
  clampOffset,
  clampZoom,
  coverCropSize,
  cropSlack,
  computeCropRect,
  shiftOffset,
  rezoomOffset,
  outputSize
} from '../core/crop.js'

// 常數定義
const PORTRAIT_ASPECT = 9 / 16 // 直式手機畫面，寬比高小
const LANDSCAPE_SOURCE = { width: 4000, height: 3000 } // 橫幅照片：左右有得滑
const TALL_SOURCE = { width: 900, height: 4000 } // 過高的長圖：上下有得滑
const EXACT_SOURCE = { width: 900, height: 1600 } // 比例剛好等於畫面：兩軸都滑不動
const DOUBLE_ZOOM = 2 // 放大兩倍：裁切框縮到一半
const MAX_ZOOM = 4
const TOLERANCE = 1e-9

// 差在容許誤差內就算相等；裁切用的是浮點數，不做整數比對
const almostEqual = (actual, expected) => assert.ok(Math.abs(actual - expected) < TOLERANCE, `${actual} 不等於 ${expected}`)

test('clampOffset 把滑動位置夾在 0 到 1 之間', () => {
  assert.equal(clampOffset(-3), 0)
  assert.equal(clampOffset(2.5), 1)
  assert.equal(clampOffset(0.25), 0.25)
})

test('clampOffset 對壞掉的輸入回傳置中', () => {
  assert.equal(clampOffset(undefined), 0.5)
  assert.equal(clampOffset(Number.NaN), 0.5)
  assert.equal(clampOffset('0.2'), 0.5)
})

test('coverCropSize 對橫幅照片吃滿高度', () => {
  const size = coverCropSize(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT)
  almostEqual(size.height, LANDSCAPE_SOURCE.height)
  almostEqual(size.width, LANDSCAPE_SOURCE.height * PORTRAIT_ASPECT)
})

test('coverCropSize 對過高的長圖吃滿寬度', () => {
  const size = coverCropSize(TALL_SOURCE.width, TALL_SOURCE.height, PORTRAIT_ASPECT)
  almostEqual(size.width, TALL_SOURCE.width)
  almostEqual(size.height, TALL_SOURCE.width / PORTRAIT_ASPECT)
})

test('coverCropSize 切出來的比例一定等於畫面比例', () => {
  const size = coverCropSize(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT)
  almostEqual(size.width / size.height, PORTRAIT_ASPECT)
})

test('coverCropSize 對不合法的尺寸回傳 0', () => {
  assert.deepEqual(coverCropSize(0, 100, PORTRAIT_ASPECT), { width: 0, height: 0 })
  assert.deepEqual(coverCropSize(100, -1, PORTRAIT_ASPECT), { width: 0, height: 0 })
  assert.deepEqual(coverCropSize(100, 100, 0), { width: 0, height: 0 })
  assert.deepEqual(coverCropSize(undefined, undefined, undefined), { width: 0, height: 0 })
})

test('cropSlack 橫幅照片只有左右能滑', () => {
  const slack = cropSlack(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT)
  assert.ok(slack.x > 0)
  almostEqual(slack.y, 0)
})

test('cropSlack 過高的長圖只有上下能滑', () => {
  const slack = cropSlack(TALL_SOURCE.width, TALL_SOURCE.height, PORTRAIT_ASPECT)
  almostEqual(slack.x, 0)
  assert.ok(slack.y > 0)
})

test('cropSlack 比例剛好相同時兩軸都滑不動', () => {
  const slack = cropSlack(EXACT_SOURCE.width, EXACT_SOURCE.height, PORTRAIT_ASPECT)
  almostEqual(slack.x, 0)
  almostEqual(slack.y, 0)
})

test('cropSlack 對不合法的尺寸回傳 0', () => {
  assert.deepEqual(cropSlack(0, 0, PORTRAIT_ASPECT), { x: 0, y: 0 })
})

test('computeCropRect 置中時左右各留一半空白', () => {
  const rect = computeCropRect(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT, 0.5, 0.5)
  const slack = cropSlack(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT)
  almostEqual(rect.x, slack.x / 2)
  almostEqual(rect.y, 0)
})

test('computeCropRect 滑到底時貼齊原圖邊緣，不會超出去', () => {
  const left = computeCropRect(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT, 0, 0)
  almostEqual(left.x, 0)
  const right = computeCropRect(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT, 1, 1)
  almostEqual(right.x + right.width, LANDSCAPE_SOURCE.width)
  almostEqual(right.y + right.height, LANDSCAPE_SOURCE.height)
})

test('computeCropRect 超出範圍的滑動位置會被夾回去，不會切到圖外', () => {
  const rect = computeCropRect(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT, 9, -9)
  almostEqual(rect.x + rect.width, LANDSCAPE_SOURCE.width)
  almostEqual(rect.y, 0)
})

test('computeCropRect 對不合法的尺寸回傳全零矩形', () => {
  assert.deepEqual(computeCropRect(0, 0, PORTRAIT_ASPECT, 0.5, 0.5), { x: 0, y: 0, width: 0, height: 0 })
})

test('shiftOffset 依滑動距離換算成新的位置', () => {
  // 總共能滑 200 像素，往右滑 50 像素就是往前推進四分之一
  almostEqual(shiftOffset(0.5, 50, 200), 0.75)
  almostEqual(shiftOffset(0.5, -50, 200), 0.25)
})

test('shiftOffset 滑過頭會停在邊界', () => {
  assert.equal(shiftOffset(0.9, 999, 200), 1)
  assert.equal(shiftOffset(0.1, -999, 200), 0)
})

test('shiftOffset 在滑不動的方向上原地不動，也不會除以零', () => {
  assert.equal(shiftOffset(0.5, 120, 0), 0.5)
  assert.equal(shiftOffset(0.5, 120, -8), 0.5)
})

test('shiftOffset 忽略壞掉的滑動距離', () => {
  assert.equal(shiftOffset(0.4, Number.NaN, 200), 0.4)
  assert.equal(shiftOffset(0.4, undefined, 200), 0.4)
})

test('outputSize 超過上限就等比縮小', () => {
  const size = outputSize(4000, 3000, 1440)
  assert.equal(size.width, 1440)
  assert.equal(size.height, 1080)
})

test('outputSize 本來就比上限小就不放大', () => {
  const size = outputSize(800, 600, 1440)
  assert.equal(size.width, 800)
  assert.equal(size.height, 600)
})

test('outputSize 沒給上限就原尺寸輸出', () => {
  assert.deepEqual(outputSize(1234.4, 567.5, 0), { width: 1234, height: 568 })
})

test('outputSize 縮到不足一像素時仍給得出 1，canvas 才建得起來', () => {
  const size = outputSize(4000, 2, 4)
  assert.equal(size.width, 4)
  assert.equal(size.height, 1)
})

test('outputSize 對不合法的尺寸回傳 0', () => {
  assert.deepEqual(outputSize(0, 100, 1440), { width: 0, height: 0 })
  assert.deepEqual(outputSize(100, undefined, 1440), { width: 0, height: 0 })
})

test('clampZoom 把倍率夾在 1 到上限之間', () => {
  assert.equal(clampZoom(2.5, MAX_ZOOM), 2.5)
  assert.equal(clampZoom(9, MAX_ZOOM), MAX_ZOOM)
  assert.equal(clampZoom(0.4, MAX_ZOOM), 1)
})

test('clampZoom 對壞掉的輸入或沒給上限一律回到不放大', () => {
  assert.equal(clampZoom(Number.NaN, MAX_ZOOM), 1)
  assert.equal(clampZoom(undefined, MAX_ZOOM), 1)
  assert.equal(clampZoom('3', MAX_ZOOM), 1)
  assert.equal(clampZoom(3, undefined), 1)
  assert.equal(clampZoom(3, 0), 1)
})

test('coverCropSize 放大兩倍時橫幅照片的裁切框縮到一半', () => {
  const plain = coverCropSize(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT)
  const zoomed = coverCropSize(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT, DOUBLE_ZOOM)
  almostEqual(zoomed.width, plain.width / DOUBLE_ZOOM)
  almostEqual(zoomed.height, plain.height / DOUBLE_ZOOM)
  // 放大之後長寬比不變，貼上去照樣滿版
  almostEqual(zoomed.width / zoomed.height, PORTRAIT_ASPECT)
})

test('coverCropSize 放大兩倍時過高的長圖同樣縮到一半', () => {
  const plain = coverCropSize(TALL_SOURCE.width, TALL_SOURCE.height, PORTRAIT_ASPECT)
  const zoomed = coverCropSize(TALL_SOURCE.width, TALL_SOURCE.height, PORTRAIT_ASPECT, DOUBLE_ZOOM)
  almostEqual(zoomed.width, plain.width / DOUBLE_ZOOM)
  almostEqual(zoomed.height, plain.height / DOUBLE_ZOOM)
})

test('coverCropSize 對小於 1 或壞掉的倍率退回不放大，不會切出比原圖還大的框', () => {
  const plain = coverCropSize(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT)
  assert.deepEqual(coverCropSize(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT, 0.25), plain)
  assert.deepEqual(coverCropSize(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT, Number.NaN), plain)
})

test('cropSlack 放大之後，比例剛好的原圖兩軸都變得有得滑', () => {
  const plain = cropSlack(EXACT_SOURCE.width, EXACT_SOURCE.height, PORTRAIT_ASPECT)
  assert.deepEqual(plain, { x: 0, y: 0 })
  const zoomed = cropSlack(EXACT_SOURCE.width, EXACT_SOURCE.height, PORTRAIT_ASPECT, DOUBLE_ZOOM)
  almostEqual(zoomed.x, EXACT_SOURCE.width / DOUBLE_ZOOM)
  almostEqual(zoomed.y, EXACT_SOURCE.height / DOUBLE_ZOOM)
})

test('computeCropRect 放大並滑到底之後，切下來的範圍仍然完全落在原圖裡', () => {
  const rect = computeCropRect(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT, 1, 1, MAX_ZOOM)
  almostEqual(rect.x + rect.width, LANDSCAPE_SOURCE.width)
  almostEqual(rect.y + rect.height, LANDSCAPE_SOURCE.height)
})

test('rezoomOffset 換倍率之後原本在正中央的那一點留在正中央', () => {
  const source = LANDSCAPE_SOURCE.width
  const plain = coverCropSize(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT)
  const zoomed = coverCropSize(LANDSCAPE_SOURCE.width, LANDSCAPE_SOURCE.height, PORTRAIT_ASPECT, DOUBLE_ZOOM)
  const offset = 0.25
  const next = rezoomOffset(source, plain.width, zoomed.width, offset)
  const centerBefore = (source - plain.width) * offset + plain.width / 2
  const centerAfter = (source - zoomed.width) * next + zoomed.width / 2
  almostEqual(centerAfter, centerBefore)
})

test('rezoomOffset 縮回滿版時回到置中，不會除以零', () => {
  assert.equal(rezoomOffset(900, 450, 900, 0.2), 0.5)
  assert.equal(rezoomOffset(900, 450, 1200, 0.2), 0.5)
})

test('rezoomOffset 對壞掉的輸入保留原本的位置', () => {
  assert.equal(rezoomOffset(0, 450, 225, 0.3), 0.3)
  assert.equal(rezoomOffset(900, undefined, 225, 0.3), 0.3)
  assert.equal(rezoomOffset(900, 450, Number.NaN, 0.3), 0.3)
})
