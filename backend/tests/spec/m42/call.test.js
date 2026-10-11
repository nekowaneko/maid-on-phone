// M4.2 規格範例表（docs/M4.2-EXPENSIVE-PLAN.md §4.5）中 JS 規格測試列（13 列），凍結後不得修改。
// S06、S14 沒有自動測試（手機實測，見 DEVICE-CHECKLIST-M4.2.md D04、D06）；S09 另有 Kotlin 規格測試。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  CHAT_EXIT_URL,
  CALL_STATES,
  CALL_EVENTS,
  MORE_MENU_ITEMS,
  CALL_TEXT,
  nextCallState,
  callView,
  endedTimeText,
  connectEvent
} from '../../../core/call-state.js'
import { nextBlinkDelay, canBlink } from '../../../core/blink.js'
import { extractLeadingTag, resolveEmotion } from '../../../core/emotion.js'
import { feedAll } from '../../../core/stream-parser.js'
import { planFaceSwap } from '../../../core/face-swap.js'

// 常數定義
const readText = (relative) => readFileSync(new URL(relative, import.meta.url), 'utf8')
const readJson = (relative) => JSON.parse(readText(relative))
const CALL_CONFIG_PATH = '../../../config/call.json'
const EMOTION_MAP_PATH = '../../../config/emotion-map.json'
const INDEX_HTML_PATH = '../../../web/index.html'
const MANIFEST_PATH = '../../../web/manifest.webmanifest'
const DISPLAY_NAME = '手機女僕'
const OLD_NAME = '陪伴角色'
const S = CALL_STATES
const E = CALL_EVENTS

test('M42-S01 先看到「呼叫中…」：頂列狀態寫「呼叫中…」，角色變淡，對話框不顯示，輸入框與送出按鈕不能用。準備好後自動接通，狀態變「通話中 00:00」開始計時，她說一句開場話。', () => {
  assert.deepEqual(callView(S.CONNECTING, 0), {
    statusText: '呼叫中…',
    statusTone: 'plain',
    composerEnabled: false,
    dialogVisible: false,
    overlay: 'connecting',
    faceDimmed: true,
    forcedEmotion: null
  })
  assert.equal(nextCallState(S.CONNECTING, E.CONNECTED), S.LIVE)
  assert.equal(callView(S.LIVE, 0).statusText, '通話中 00:00')
})

test('M42-S02 輸入框與送出暫時停用，狀態變「她在想… mm:ss」，表情切到思考貌，對話框顯示「……」動畫。回覆到達後狀態回「通話中 mm:ss」，輸入框恢復可用，她開始逐字說話。', () => {
  assert.equal(nextCallState(S.LIVE, E.SEND), S.THINKING)
  const thinking = callView(S.THINKING, 5000)
  assert.equal(thinking.statusText, '她在想… 00:05')
  assert.equal(thinking.composerEnabled, false)
  assert.equal(thinking.forcedEmotion, 'thinking')
  assert.equal(thinking.dialogVisible, true)
  assert.equal(nextCallState(S.THINKING, E.REPLY), S.LIVE)
  const live = callView(S.LIVE, 5000)
  assert.equal(live.statusText, '通話中 00:05')
  assert.equal(live.composerEnabled, true)
})

test('M42-S03 說到「哼。」時換成微傲臉，說到「……謝謝。」時換成嬌臉。逐字速度維持聊天頁現況（每字 0.03 秒），說完後表情保持 3 秒再回平常的臉。', () => {
  const config = readJson(EMOTION_MAP_PATH)
  assert.equal(config.emotionMap.pout, 'pout.png')
  assert.equal(config.emotionMap.shy, 'shy.png')
  const line = '[pout]哼。[shy]……謝謝。'
  assert.equal(extractLeadingTag(line), 'pout')
  const parsed = feedAll([line], config.emotionMap, config.defaultEmotion)
  assert.equal(parsed.text, '哼。……謝謝。')
  assert.deepEqual(parsed.cues, [
    { index: 0, emotion: 'pout' },
    { index: 2, emotion: 'shy' }
  ])
})

test('M42-S04 顯示平常的臉，台詞照常顯示，不報錯、不出現破圖。', () => {
  const config = readJson(EMOTION_MAP_PATH)
  const resolved = resolveEmotion('dance', config.emotionMap, config.defaultEmotion)
  assert.equal(resolved, config.defaultEmotion)
  assert.equal(config.emotionMap[config.defaultEmotion], 'idle.png')
  const parsed = feedAll(['[dance]好耶。'], config.emotionMap, config.defaultEmotion)
  assert.equal(parsed.text, '好耶。')
})

test('M42-S05 3 秒後回到平常的臉。平常的臉時，每隔 3 到 5.5 秒眨一次眼（閉眼約 0.14 秒）；說話中與換表情時不眨眼。', () => {
  const { blink } = readJson(CALL_CONFIG_PATH)
  assert.equal(blink.closedMs, 140)
  assert.equal(nextBlinkDelay(0, blink), 3000)
  const high = nextBlinkDelay(0.9999, blink)
  assert.ok(high >= 5499 && high <= 5500, `實際 ${high}`)
  assert.equal(nextBlinkDelay(-1, blink), 3000)
  assert.equal(nextBlinkDelay(2, blink), 5500)

  const base = { state: S.LIVE, emotion: 'neutral', defaultEmotion: 'neutral', speaking: false }
  assert.equal(canBlink(base), true)
  assert.equal(canBlink({ ...base, speaking: true }), false)
  assert.equal(canBlink({ ...base, emotion: 'smile' }), false)
  for (const state of [S.CONNECTING, S.THINKING, S.ERROR, S.ENDED]) {
    assert.equal(canBlink({ ...base, state }), false, state)
  }
})

test('M42-S07 進入「通話結束」：頂列狀態寫「已結束」，對話框收起且內容清空，輸入框與送出不能用；畫面中央顯示「通話結束」「通話時間 mm:ss」與「再撥一次」「關閉聊天」兩個按鈕。', () => {
  assert.equal(nextCallState(S.LIVE, E.HANGUP), S.ENDED)
  assert.deepEqual(callView(S.ENDED, 0), {
    statusText: '已結束',
    statusTone: 'plain',
    composerEnabled: false,
    dialogVisible: false,
    overlay: 'ended',
    faceDimmed: true,
    forcedEmotion: null
  })
  assert.equal(endedTimeText(65000), '通話時間 01:05')
  assert.equal(CALL_TEXT.endedTitle, '通話結束')
  assert.equal(CALL_TEXT.endedRedial, '再撥一次')
  assert.equal(CALL_TEXT.endedClose, '關閉聊天')
})

test('M42-S08 回到「呼叫中…」並重新接通，通話時間從 00:00 重新計；之前的對話紀錄保留，不清掉。', () => {
  assert.equal(nextCallState(S.ENDED, E.REDIAL), S.CONNECTING)
  assert.equal(nextCallState(S.ERROR, E.REDIAL), S.CONNECTING)
  assert.equal(callView(S.LIVE, 0).statusText, '通話中 00:00')
})

test('M42-S09 在 App 內：聊天畫面關閉，回到進來的地方（懸浮窗或主畫面）。在一般瀏覽器：停在通話結束畫面，沒有反應也不出錯。', () => {
  const { exitUrl } = readJson(CALL_CONFIG_PATH)
  assert.equal(CHAT_EXIT_URL, exitUrl)
  assert.equal(CHAT_EXIT_URL, 'chat-exit://close')
})

test('M42-S10 進入「連線失敗」：標題「連不上她」，說明「請檢查網路，或確認「App 存取密鑰」有填對。」，按鈕「重撥」與「開啟密鑰設定」；角色變淡，對話框收起，輸入不能用，狀態寫「連線失敗」。', () => {
  assert.equal(connectEvent({ hasSecret: false, status: 200 }), E.CONNECT_FAILED)
  assert.equal(connectEvent({ hasSecret: true, status: 401 }), E.CONNECT_FAILED)
  assert.equal(connectEvent({ hasSecret: true, status: 500 }), E.CONNECT_FAILED)
  assert.equal(connectEvent({ hasSecret: true, status: null }), E.CONNECT_FAILED)
  assert.equal(connectEvent({ hasSecret: true, status: 200 }), E.CONNECTED)
  assert.equal(nextCallState(S.CONNECTING, E.CONNECT_FAILED), S.ERROR)
  assert.deepEqual(callView(S.ERROR, 0), {
    statusText: '連線失敗',
    statusTone: 'bad',
    composerEnabled: false,
    dialogVisible: false,
    overlay: 'error',
    faceDimmed: true,
    forcedEmotion: null
  })
  assert.equal(CALL_TEXT.errorTitle, '連不上她')
  assert.equal(CALL_TEXT.errorBody, '請檢查網路，或確認「App 存取密鑰」有填對。')
  assert.equal(CALL_TEXT.errorRetry, '重撥')
  assert.equal(CALL_TEXT.errorSecret, '開啟密鑰設定')
})

test('M42-S11 沿用現有的制式回覆：她用角色口吻說那句罐頭台詞，仍然停在「通話中」，輸入框恢復可用，可以再送一次；不會跳到「連線失敗」畫面。', () => {
  assert.equal(nextCallState(S.THINKING, E.REPLY_FAILED), S.LIVE)
  assert.equal(nextCallState(S.LIVE, E.CONNECT_FAILED), S.LIVE)
  assert.equal(nextCallState(S.THINKING, E.CONNECT_FAILED), S.THINKING)
  assert.equal(nextCallState(S.ENDED, E.REPLY_FAILED), S.ENDED)
  assert.equal(nextCallState(S.ERROR, E.REPLY_FAILED), S.ERROR)
  assert.equal(callView(S.LIVE, 0).composerEnabled, true)
})

test('M42-S12 從下方滑出面板，恰好六項：對話紀錄、小檔案、用量、上傳背景圖、更換背景圖、制式回覆。沒有「更換服裝」。', () => {
  const labels = MORE_MENU_ITEMS.map((item) => item.label)
  assert.deepEqual(labels, ['對話紀錄', '小檔案', '用量', '上傳背景圖', '更換背景圖', '制式回覆'])
  assert.equal(MORE_MENU_ITEMS.length, 6)
  assert.ok(!labels.some((label) => label.includes('服裝')))
})

test('M42-S13 名稱顯示「手機女僕」：頂列名字、瀏覽器分頁標題、加到手機桌面的名稱，都不再出現「陪伴角色」。', () => {
  const callConfig = readJson(CALL_CONFIG_PATH)
  const manifestText = readText(MANIFEST_PATH)
  const manifest = JSON.parse(manifestText)
  const html = readText(INDEX_HTML_PATH)
  assert.equal(callConfig.displayName, DISPLAY_NAME)
  assert.ok(html.includes(`<title>${DISPLAY_NAME}</title>`))
  assert.match(html, /<meta\s+name="apple-mobile-web-app-title"\s+content="手機女僕"/)
  assert.equal(manifest.name, DISPLAY_NAME)
  assert.equal(manifest.short_name, DISPLAY_NAME)
  assert.ok(!html.includes(OLD_NAME))
  assert.ok(!manifestText.includes(OLD_NAME))
  assert.ok(!JSON.stringify(callConfig).includes(OLD_NAME))
})

test('M42-S15 那個表情不換臉，維持原本那張臉，不出現破圖圖示，其他表情與功能照常。', () => {
  const plan = planFaceSwap({ activeSlot: 0, nextSlot: 1, hasPainted: true, loaded: false })
  assert.equal(plan.show, null)
  assert.equal(plan.hide, null)
  assert.equal(plan.activeSlot, 0)
})
