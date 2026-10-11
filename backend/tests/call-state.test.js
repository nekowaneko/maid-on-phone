// core/call-state.js 的輔助測試：轉換表全組合、時間格式、畫面欄位與連線判斷的邊界。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CALL_STATES,
  CALL_EVENTS,
  CALL_TEXT,
  CHAT_EXIT_URL,
  MORE_MENU_ITEMS,
  formatCallTime,
  nextCallState,
  callView,
  endedTimeText,
  connectEvent
} from '../core/call-state.js'

const callConfig = JSON.parse(readFileSync(new URL('../config/call.json', import.meta.url), 'utf8'))

const EXPECTED = {
  connecting: { connected: 'live', 'connect-failed': 'error', hangup: 'ended' },
  live: { send: 'thinking', hangup: 'ended' },
  thinking: { reply: 'live', 'reply-failed': 'live', hangup: 'ended' },
  error: { redial: 'connecting' },
  ended: { redial: 'connecting' }
}

test('nextCallState：5 個狀態 × 7 個事件全組合，表外維持原狀態', () => {
  for (const state of Object.values(CALL_STATES)) {
    for (const event of Object.values(CALL_EVENTS)) {
      const want = EXPECTED[state][event] ?? state
      assert.equal(nextCallState(state, event), want, `${state} + ${event}`)
    }
  }
})

test('nextCallState：不認得的狀態或事件維持原狀態，不丟例外', () => {
  assert.equal(nextCallState('bogus', 'send'), 'bogus')
  assert.equal(nextCallState('live', 'bogus'), 'live')
  assert.equal(nextCallState('toString', 'send'), 'toString')
  assert.equal(nextCallState('live', 'constructor'), 'live')
})

test('formatCallTime：邊界', () => {
  assert.equal(formatCallTime(0), '00:00')
  assert.equal(formatCallTime(999), '00:00')
  assert.equal(formatCallTime(1000), '00:01')
  assert.equal(formatCallTime(59999), '00:59')
  assert.equal(formatCallTime(60000), '01:00')
  assert.equal(formatCallTime(65000), '01:05')
  assert.equal(formatCallTime(61 * 60000 + 5000), '61:05')
  for (const bad of [-1, NaN, Infinity, -Infinity, null, undefined, '5000']) {
    assert.equal(formatCallTime(bad), '00:00')
  }
})

test('callView：每個狀態的欄位', () => {
  assert.deepEqual(callView('connecting', 0), {
    statusText: '呼叫中…', statusTone: 'plain', composerEnabled: false, dialogVisible: false,
    overlay: 'connecting', faceDimmed: true, forcedEmotion: null
  })
  assert.deepEqual(callView('live', 61000), {
    statusText: '通話中 01:01', statusTone: 'live', composerEnabled: true, dialogVisible: true,
    overlay: null, faceDimmed: false, forcedEmotion: null
  })
  assert.deepEqual(callView('thinking', 5000), {
    statusText: '她在想… 00:05', statusTone: 'live', composerEnabled: false, dialogVisible: true,
    overlay: null, faceDimmed: false, forcedEmotion: 'thinking'
  })
  assert.deepEqual(callView('error', 0), {
    statusText: '連線失敗', statusTone: 'bad', composerEnabled: false, dialogVisible: false,
    overlay: 'error', faceDimmed: true, forcedEmotion: null
  })
  assert.deepEqual(callView('ended', 0), {
    statusText: '已結束', statusTone: 'plain', composerEnabled: false, dialogVisible: false,
    overlay: 'ended', faceDimmed: true, forcedEmotion: null
  })
})

test('callView：不認得的狀態視為 ended', () => {
  assert.deepEqual(callView('bogus', 0), callView('ended', 0))
  assert.deepEqual(callView(undefined, 0), callView('ended', 0))
})

test('endedTimeText：格式與非法輸入', () => {
  assert.equal(endedTimeText(65000), '通話時間 01:05')
  assert.equal(endedTimeText(NaN), '通話時間 00:00')
})

test('connectEvent：只有有密鑰且 200 才算連上', () => {
  assert.equal(connectEvent({ hasSecret: true, status: 200 }), 'connected')
  assert.equal(connectEvent({ hasSecret: false, status: 200 }), 'connect-failed')
  assert.equal(connectEvent({ hasSecret: true, status: 201 }), 'connect-failed')
  assert.equal(connectEvent({ hasSecret: true, status: 401 }), 'connect-failed')
  assert.equal(connectEvent({ hasSecret: true, status: 500 }), 'connect-failed')
  assert.equal(connectEvent({ hasSecret: true, status: null }), 'connect-failed')
  assert.equal(connectEvent({ hasSecret: 'yes', status: 200 }), 'connect-failed')
})

test('常數：關閉網址與 call.json 相同、選單六項、文字四句不空', () => {
  assert.equal(CHAT_EXIT_URL, callConfig.exitUrl)
  assert.equal(MORE_MENU_ITEMS.length, 6)
  assert.equal(CALL_TEXT.errorBody, '請檢查網路，或確認「App 存取密鑰」有填對。')
})
