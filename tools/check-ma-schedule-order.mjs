// V34 檢查：runScheduled 裡呼叫 runMaReport 的位置必須在 Todoist 判斷（!deps.todoist）之前，且包在自己的 try 裡。
// 現有的 runScheduled 在沒有 Todoist 時會提早 return，F3 排在後面就永遠不會執行（docs/M4-EXPENSIVE-PLAN.md A41）。

import { readFileSync } from 'node:fs'

// 常數定義
const HANDLERS = 'backend/worker/handlers.js'
const TRY_LOOKBACK_CHARS = 300 // 呼叫前這段範圍內必須有 try

const source = readFileSync(HANDLERS, 'utf8')
const start = source.indexOf('export const runScheduled')
if (start < 0) {
  console.error('找不到 runScheduled')
  process.exit(1)
}
const body = source.slice(start)
const callAt = body.indexOf('runMaReport(')
const guardAt = body.indexOf('!deps.todoist')
if (callAt < 0) {
  console.error('runScheduled 沒有呼叫 runMaReport')
  process.exit(1)
}
if (guardAt < 0) {
  console.error('找不到 Todoist 判斷（!deps.todoist）')
  process.exit(1)
}
if (callAt > guardAt) {
  console.error('runMaReport 的呼叫在 Todoist 判斷之後')
  process.exit(1)
}
if (!body.slice(Math.max(0, callAt - TRY_LOOKBACK_CHARS), callAt).includes('try')) {
  console.error('runMaReport 的呼叫沒有包在自己的 try 裡')
  process.exit(1)
}
