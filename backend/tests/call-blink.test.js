// core/blink.js 的輔助測試：等待時間的夾回與四捨五入、可眨眼條件的全組合。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { nextBlinkDelay, canBlink } from '../core/blink.js'

const { blink } = JSON.parse(readFileSync(new URL('../config/call.json', import.meta.url), 'utf8'))

test('nextBlinkDelay：兩端與中間', () => {
  assert.equal(nextBlinkDelay(0, blink), blink.minIntervalMs)
  assert.equal(nextBlinkDelay(0.5, blink), 4250)
  const high = nextBlinkDelay(0.9999, blink)
  assert.ok(high >= 5499 && high <= blink.maxIntervalMs)
})

test('nextBlinkDelay：超出範圍與非數字被夾回', () => {
  assert.equal(nextBlinkDelay(-1, blink), blink.minIntervalMs)
  assert.equal(nextBlinkDelay(NaN, blink), blink.minIntervalMs)
  assert.equal(nextBlinkDelay('0.5', blink), blink.minIntervalMs)
  assert.ok(nextBlinkDelay(2, blink) <= blink.maxIntervalMs)
  assert.ok(nextBlinkDelay(Infinity, blink) <= blink.maxIntervalMs)
})

test('nextBlinkDelay：四捨五入成整數', () => {
  const delay = nextBlinkDelay(0.33333, { minIntervalMs: 1000, maxIntervalMs: 1010 })
  assert.equal(delay, 1003)
  assert.ok(Number.isInteger(nextBlinkDelay(0.123456, blink)))
})

test('canBlink：只有 live＋預設表情＋未說話為 true', () => {
  for (const state of ['connecting', 'live', 'thinking', 'error', 'ended']) {
    for (const emotion of ['neutral', 'smile']) {
      for (const speaking of [true, false]) {
        const want = state === 'live' && emotion === 'neutral' && speaking === false
        assert.equal(canBlink({ state, emotion, defaultEmotion: 'neutral', speaking }), want, `${state}/${emotion}/${speaking}`)
      }
    }
  }
})
