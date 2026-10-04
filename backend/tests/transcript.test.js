// core/transcript.js 的單元測試：誰講的掛誰的名字、一則之間空一行、髒資料不會混進檔案裡。

import test from 'node:test'
import assert from 'node:assert/strict'
import { formatTranscript, buildTranscriptFilename } from '../core/transcript.js'

const 一輪 = [
  { role: 'user', content: '我的朋友剛剛傳了一個粉專給我。' },
  { role: 'assistant', content: '噗……那是什麼啦，快講來聽聽。' }
]

test('我說的掛「我：」，她說的掛「奈奈：」，中間空一行', () => {
  assert.equal(
    formatTranscript(一輪),
    '我：我的朋友剛剛傳了一個粉專給我。\n\n奈奈：噗……那是什麼啦，快講來聽聽。\n'
  )
})

test('整份文字稿以換行收尾，最後一則不會黏在檔尾', () => {
  assert.equal(formatTranscript(一輪).endsWith('\n'), true)
})

test('訊息內容本來就有的換行原樣保留，不會被重排成一行', () => {
  const text = formatTranscript([{ role: 'user', content: '第一句。\n第二句。' }])
  assert.equal(text, '我：第一句。\n第二句。\n')
})

test('前後多餘的空白會被修掉，名字後面不會空一大段', () => {
  assert.equal(formatTranscript([{ role: 'assistant', content: '  嗨嗨  \n' }]), '奈奈：嗨嗨\n')
})

test('空內容、只有空白、非字串的訊息一律略過', () => {
  const history = [
    { role: 'user', content: '' },
    { role: 'user', content: '   ' },
    { role: 'assistant', content: null },
    { role: 'assistant' },
    { role: 'user', content: '只剩這一句。' }
  ]
  assert.equal(formatTranscript(history), '我：只剩這一句。\n')
})

test('沒有半則講得出來的內容時回傳空字串，呼叫端才知道沒東西可存', () => {
  for (const history of [undefined, null, [], {}, [{ role: 'user', content: '  ' }]]) {
    assert.equal(formatTranscript(history), '')
  }
})

test('角色不是 user 的一律當成她說的，不會漏掉任何一句', () => {
  assert.equal(formatTranscript([{ role: 'model', content: '我在喔。' }]), '奈奈：我在喔。\n')
})

test('名字可以由呼叫端換掉，模組本身不綁死任何一個名字', () => {
  const text = formatTranscript(一輪, { user: '主人', assistant: '喵娘' })
  assert.equal(text.startsWith('主人：'), true)
  assert.equal(text.includes('\n\n喵娘：'), true)
})

test('名字傳了但不能用時退回預設，不會匯出開頭是空冒號的檔案', () => {
  assert.equal(formatTranscript([{ role: 'user', content: '嗨' }], { user: '' }), '我：嗨\n')
  assert.equal(formatTranscript([{ role: 'user', content: '嗨' }], { user: 123 }), '我：嗨\n')
  assert.equal(formatTranscript([{ role: 'assistant', content: '嗨' }], { assistant: '' }), '奈奈：嗨\n')
})

test('檔名帶上匯出當下的時間，補零到兩位', () => {
  assert.equal(buildTranscriptFilename(new Date(2026, 0, 3, 4, 5)), '對話紀錄-20260103-0405.txt')
})

test('沒給時間或時間壞掉時用現在時間，不會產生 Invalid 檔名', () => {
  for (const value of [undefined, null, 'x', new Date('x')]) {
    assert.match(buildTranscriptFilename(value), /^對話紀錄-\d{8}-\d{4}\.txt$/)
  }
})
