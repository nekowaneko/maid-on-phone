// core/emotion.js 的單元測試：標籤抽取、對照、fallback、素材路徑組裝。
// 測試不硬編表情名稱，一律從 config/emotion-map.json 讀入，設定改了測試也跟著改。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  extractLeadingTag,
  resolveEmotion,
  emotionToAssetPath,
  layerToAssetPath,
  parseFirstEmotion
} from '../core/emotion.js'

// 常數定義
const CONFIG = JSON.parse(readFileSync(new URL('../config/emotion-map.json', import.meta.url), 'utf8'))
const EMOTION_KEYS = Object.keys(CONFIG.emotionMap)
const DEFAULT_EMOTION = CONFIG.defaultEmotion
const OTHER_EMOTION = EMOTION_KEYS.find((key) => key !== DEFAULT_EMOTION)
const UNKNOWN_TAG = 'not_a_real_emotion'

test('extractLeadingTag 能取出開頭標籤', () => {
  assert.equal(extractLeadingTag(`[${OTHER_EMOTION}] 你回來啦。`), OTHER_EMOTION)
})

// 全形括號的判定要與 core/stream-parser.js 一致，否則同一句話兩邊解出不同表情
test('extractLeadingTag 也認全形方括號', () => {
  assert.equal(extractLeadingTag(`［${OTHER_EMOTION}］你回來啦。`), OTHER_EMOTION)
  assert.equal(extractLeadingTag(`［${OTHER_EMOTION}] 你回來啦。`), OTHER_EMOTION)
})

test('extractLeadingTag 容許標籤前有空白', () => {
  assert.equal(extractLeadingTag(`  \n[${DEFAULT_EMOTION}] 嗯。`), DEFAULT_EMOTION)
})

test('extractLeadingTag 沒有標籤時回傳 null', () => {
  assert.equal(extractLeadingTag('今天天氣不錯。'), null)
})

test('extractLeadingTag 對非字串輸入回傳 null', () => {
  assert.equal(extractLeadingTag(undefined), null)
  assert.equal(extractLeadingTag(42), null)
})

test('extractLeadingTag 只掃描開頭，太後面的標籤不算', () => {
  // 前面塞滿 60 個字元，標籤已超出掃描上限
  const padded = `${'甲'.repeat(60)}[${OTHER_EMOTION}] 台詞`
  assert.equal(extractLeadingTag(padded), null)
})

test('extractLeadingTag 不接受含非法字元的標籤', () => {
  assert.equal(extractLeadingTag('[Neutral-1] 台詞'), null)
})

test('resolveEmotion 對照表裡有的標籤原樣回傳', () => {
  assert.equal(resolveEmotion(OTHER_EMOTION, CONFIG.emotionMap, DEFAULT_EMOTION), OTHER_EMOTION)
})

test('resolveEmotion 對照表裡沒有的標籤退回預設表情', () => {
  assert.equal(resolveEmotion(UNKNOWN_TAG, CONFIG.emotionMap, DEFAULT_EMOTION), DEFAULT_EMOTION)
  assert.equal(resolveEmotion(null, CONFIG.emotionMap, DEFAULT_EMOTION), DEFAULT_EMOTION)
})

test('resolveEmotion 在對照表缺失時仍給得出結果', () => {
  assert.equal(resolveEmotion(UNKNOWN_TAG, undefined, DEFAULT_EMOTION), DEFAULT_EMOTION)
})

test('resolveEmotion 在預設值也缺失時退到最後防線常數', () => {
  // 最後防線的值必須是設定檔裡確實存在的表情，否則畫面會開天窗
  const rescued = resolveEmotion(UNKNOWN_TAG, CONFIG.emotionMap, undefined)
  assert.ok(EMOTION_KEYS.includes(rescued))
})

test('emotionToAssetPath 組出素材根目錄底下的檔案路徑', () => {
  const path = emotionToAssetPath(DEFAULT_EMOTION, CONFIG)
  assert.equal(path, `${CONFIG.assetRoot}/${CONFIG.emotionMap[DEFAULT_EMOTION]}`)
})

test('emotionToAssetPath 查不到的表情退回預設表情的素材', () => {
  assert.equal(emotionToAssetPath(UNKNOWN_TAG, CONFIG), emotionToAssetPath(DEFAULT_EMOTION, CONFIG))
})

test('emotionToAssetPath 在設定完全缺失時回傳空字串', () => {
  assert.equal(emotionToAssetPath(UNKNOWN_TAG, {}), '')
})

test('emotionToAssetPath 沒有素材根目錄時只回傳檔名', () => {
  const bare = { emotionMap: CONFIG.emotionMap }
  assert.equal(emotionToAssetPath(DEFAULT_EMOTION, bare), CONFIG.emotionMap[DEFAULT_EMOTION])
})

test('layerToAssetPath 取得固定圖層的素材路徑', () => {
  // 視訊版的 layers 為空（整張表情圖），用測試自備的設定驗證路徑組裝
  const config = { assetRoot: CONFIG.assetRoot, layers: { body: 'body.png' } }
  assert.equal(layerToAssetPath('body', config), `${CONFIG.assetRoot}/body.png`)
  for (const layerKey of Object.keys(CONFIG.layers)) {
    assert.equal(layerToAssetPath(layerKey, CONFIG), `${CONFIG.assetRoot}/${CONFIG.layers[layerKey]}`)
  }
})

test('layerToAssetPath 對未知圖層回傳空字串', () => {
  assert.equal(layerToAssetPath('no_such_layer', CONFIG), '')
})

test('parseFirstEmotion 把一段文字直接解析成表情', () => {
  assert.equal(parseFirstEmotion(`[${OTHER_EMOTION}] 哈哈。`, CONFIG.emotionMap, DEFAULT_EMOTION), OTHER_EMOTION)
  assert.equal(parseFirstEmotion('沒有標籤的台詞。', CONFIG.emotionMap, DEFAULT_EMOTION), DEFAULT_EMOTION)
})
