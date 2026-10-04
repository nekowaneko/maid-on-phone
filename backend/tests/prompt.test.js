// core/prompt.js 的單元測試：插槽替換、表情清單、對話歷史整理。
// 其中一組測試直接吃真正的 config/prompt-template.md，確保插槽名稱沒有走鐘。

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  renderTemplate,
  buildEmotionList,
  trimHistory,
  buildHistoryText,
  buildSystemPrompt,
  extractTemplateBody
} from '../core/prompt.js'

// 常數定義
const CONFIG = JSON.parse(readFileSync(new URL('../config/emotion-map.json', import.meta.url), 'utf8'))
const TEMPLATE = readFileSync(new URL('../config/prompt-template.md', import.meta.url), 'utf8')
const PERSONA = readFileSync(new URL('../config/persona.md', import.meta.url), 'utf8')
const EMOTION_KEYS = Object.keys(CONFIG.emotionMap)

test('renderTemplate 會替換掉所有提供的插槽', () => {
  assert.equal(renderTemplate('前{{ONE}}中{{TWO}}後', { ONE: 'A', TWO: 'B' }), '前A中B後')
})

test('renderTemplate 未提供的插槽替換為空字串而不是留下原文', () => {
  assert.equal(renderTemplate('前{{MISSING}}後', {}), '前後')
  assert.equal(renderTemplate('前{{MISSING}}後', undefined), '前後')
})

test('renderTemplate 把 null 與 undefined 當成空字串', () => {
  assert.equal(renderTemplate('{{A}}|{{B}}', { A: null, B: undefined }), '|')
})

test('renderTemplate 容許插槽內有空白，也接受數字值', () => {
  assert.equal(renderTemplate('{{ COUNT }}', { COUNT: 3 }), '3')
})

test('renderTemplate 對非字串範本回傳空字串', () => {
  assert.equal(renderTemplate(undefined, { A: 'x' }), '')
})

test('buildEmotionList 由對照表的鍵產生標籤清單', () => {
  const expected = EMOTION_KEYS.map((key) => `[${key}]`).join('、')
  assert.equal(buildEmotionList(CONFIG.emotionMap), expected)
})

test('buildEmotionList 對空對照表回傳空字串', () => {
  assert.equal(buildEmotionList({}), '')
  assert.equal(buildEmotionList(undefined), '')
})

test('trimHistory 只保留最近幾輪，從最舊的開始丟棄', () => {
  // 造 30 輪共 60 則訊息，預設上限 20 輪即 40 則
  const messages = Array.from({ length: 60 }, (item, index) => ({
    role: index % 2 === 0 ? 'user' : 'assistant',
    content: `第 ${index} 則`
  }))
  const kept = trimHistory(messages)
  assert.equal(kept.length, 40)
  assert.equal(kept[0].content, '第 20 則')
  assert.equal(kept[kept.length - 1].content, '第 59 則')
})

test('trimHistory 可指定輪數上限，且不足上限時原樣回傳', () => {
  const messages = [
    { role: 'user', content: '一' },
    { role: 'assistant', content: '二' }
  ]
  assert.equal(trimHistory(messages, 1).length, 2)
  assert.equal(trimHistory(messages, 5).length, 2)
  assert.deepEqual(trimHistory(undefined, 5), [])
  assert.equal(trimHistory(messages, 0).length, 2)
})

test('buildHistoryText 一行一句並標示角色', () => {
  const text = buildHistoryText([
    { role: 'user', content: '你好' },
    { role: 'assistant', content: '嗯' },
    { role: 'unknown', content: '？' }
  ])
  assert.equal(text, '使用者：你好\n你：嗯\n對話：？')
})

test('buildHistoryText 略過空內容與格式不對的項目', () => {
  assert.equal(buildHistoryText([{ role: 'user', content: '' }, null, { role: 'user' }]), '')
  assert.equal(buildHistoryText(undefined), '')
})

test('buildSystemPrompt 套用真正的範本後不留任何未替換插槽', () => {
  const prompt = buildSystemPrompt(TEMPLATE, {
    persona: PERSONA,
    emotionList: buildEmotionList(CONFIG.emotionMap),
    timeGap: '剛剛才聊過。',
    history: buildHistoryText([{ role: 'user', content: '在嗎' }])
  })
  assert.ok(!prompt.includes('{{'))
  assert.ok(prompt.includes('剛剛才聊過。'))
  assert.ok(prompt.includes(buildEmotionList(CONFIG.emotionMap)))
  // 人設內容必須真的被帶進提示詞，否則角色會走鐘
  assert.ok(prompt.includes(PERSONA.trim()))
})

test('buildSystemPrompt 缺任何一段素材都不會留下原始插槽', () => {
  const prompt = buildSystemPrompt(TEMPLATE, {})
  assert.ok(!prompt.includes('{{'))
})

test('extractTemplateBody 砍掉範本前面給人看的說明段落', () => {
  const body = extractTemplateBody(TEMPLATE)
  // 說明段落與插槽對照表都不該進系統提示詞
  assert.ok(!body.includes('## 用途'))
  assert.ok(!body.includes('## 變數插槽'))
  assert.ok(!body.includes('逐字保留'))
  // 真正要給模型的內容必須留著
  assert.ok(body.includes('你要扮演以下角色'))
  assert.ok(body.includes('## 輸出格式規則'))
})

test('extractTemplateBody 找不到分界標記時整份沿用，不讓提示詞憑空消失', () => {
  const plain = '你要扮演以下角色。{{PERSONA}}'
  assert.equal(extractTemplateBody(plain), plain)
  assert.equal(extractTemplateBody(undefined), '')
})

test('buildSystemPrompt 不得把範本的說明文字送進系統提示詞', () => {
  // 迴歸測試：說明段落若混進去，模型會把「替換插槽、逐字保留」當成自己的任務，
  // 直接把填好的範本背出來當台詞（實際線上發生過）。
  const prompt = buildSystemPrompt(TEMPLATE, {
    persona: PERSONA,
    emotionList: buildEmotionList(CONFIG.emotionMap),
    timeGap: '剛剛才聊過。',
    history: ''
  })
  assert.ok(!prompt.includes('逐字保留'))
  assert.ok(!prompt.includes('| 插槽 |'))
  assert.ok(prompt.startsWith('你要扮演以下角色'))
})

// 輸入框改成可以換行之後，訊息本身就可能含換行。
// 歷史紀錄是用換行把每一輪隔開的，不收乾淨的話第二行會變成沒有標籤的孤行，
// 模型可能把它讀成另一輪對話——提示詞就被悄悄污染了。
test('訊息裡的換行會收成空白，不會被誤讀成另一輪對話', () => {
  const text = buildHistoryText([
    { role: 'user', content: '第一行\n第二行' },
    { role: 'assistant', content: '好的' }
  ])
  assert.equal(text, '使用者：第一行 第二行\n你：好的')
  // 一則訊息就是一行，輪數才不會被換行灌水
  assert.equal(text.split('\n').length, 2)
})

test('連續換行、CRLF 與前後空白都收成單一個空白', () => {
  const text = buildHistoryText([{ role: 'user', content: '  上\n\n\n  中  \r\n下  ' }])
  assert.equal(text, '使用者：上 中 下')
})

test('只有換行的訊息不會留下一個空的標籤行', () => {
  assert.equal(buildHistoryText([{ role: 'user', content: '\n\n' }]), '使用者：')
})
