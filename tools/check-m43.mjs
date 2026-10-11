// M4.3 戒飲記錄開關的結構檢查（docs/M4.3-EXPENSIVE-PLAN.md §6.1 的 V60、V61、V62、V63、V65、V67）
// 用法：node tools/check-m43.mjs <v60|v61|v62|v63|v65|v67> <基準 commit>
// 問題逐行印到 stderr，有任何問題就以 1 結束。

import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'

// 常數定義
const DRINK_JS = 'backend/core/drink.js'
const HANDLERS_JS = 'backend/worker/handlers.js'
const DRINK_KT = 'core/src/main/kotlin/com/accompany/pet/core/drink/Drink.kt'
const SETTINGS_KT = 'app/src/main/java/com/accompany/pet/DrinkSettingsActivity.kt'
const OVERLAY_KT = 'app/src/main/java/com/accompany/pet/OverlayService.kt'
const DRINK_VIEW_JS = 'app/src/main/assets/pet/drink-view.js'
const PET_INDEX_HTML = 'app/src/main/assets/pet/index.html'
const EXPECTED_FIELDS = ['subscriptionName', 'monthlyFee', 'resistValue', 'monthlyQuota', 'askTime']
const EXPECTED_GUARDED = ['parse', 'preview', 'confirm', 'resist', 'undo']
const UNGUARDED = ['history', 'stats', 'settings', 'export', 'enabled']
const SILENT_ENABLED = [/enabled\s*=\s*true/, /enabled\s*:\s*true/, /setDrinkEnabled\(\s*true/, /isDrinkEnabled\(\s*null/]
const FAKE_BYTES = /hasattr|0x89|Buffer\.from|new Uint8Array\(\[/

const problems = []
const [mode, base] = process.argv.slice(2)

// 功能函數定義

// 換行統一成 LF（工作目錄可能是 CRLF，git 內是 LF）
const normalize = (text) => text.split('\r\n').join('\n')

// 讀檔；讀不到記一個問題並回空字串
const read = (path) => {
  try {
    return normalize(readFileSync(path, 'utf8'))
  } catch {
    problems.push(`${path} 讀不到`)
    return ''
  }
}

// 讀基準 commit 的檔案內容
const readBase = (path) => {
  try {
    return normalize(execFileSync('git', ['show', `${base}:${path}`], { encoding: 'utf8' }))
  } catch {
    problems.push(`基準 commit ${base} 讀不到 ${path}`)
    return ''
  }
}

// 去掉註解：區塊註解、整行註解、行尾註解（前面要有空白，避免誤砍網址）
const strip = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/.*$/, ''))
    .join('\n')

// 取出頂層 const 的區段：行尾是開括號就取到第一個以閉括號開頭的行，否則只取那一行；找不到回 null
const sectionOf = (src, name) => {
  const lines = src.split('\n')
  const start = lines.findIndex((line) => new RegExp(`^(export )?const ${name}\\b`).test(line))
  if (start < 0) return null
  if (!/[{(\[]\s*$/.test(lines[start])) return lines[start]
  let end = start + 1
  while (end < lines.length && !/^[}\])]/.test(lines[end])) end += 1
  return lines.slice(start, end + 1).join('\n')
}

// 取出所有 catch 區塊的內文（以大括號配對）
const catchBodies = (src) => {
  const out = []
  const re = /catch\s*(\([^)]*\))?\s*\{/g
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1
    let i = re.lastIndex
    for (; i < src.length && depth > 0; i += 1) depth += src[i] === '{' ? 1 : src[i] === '}' ? -1 : 0
    out.push(src.slice(re.lastIndex, i - 1))
  }
  return out
}

// 取出以某段文字開頭、大括號配對到結尾的區塊（用在 index.html 的 setDrinkEnabled）；找不到回 null
const braceBlockFrom = (src, marker) => {
  const at = src.indexOf(marker)
  if (at < 0) return null
  const open = src.indexOf('{', at)
  if (open < 0) return null
  let depth = 0
  for (let i = open; i < src.length; i += 1) {
    depth += src[i] === '{' ? 1 : src[i] === '}' ? -1 : 0
    if (depth === 0) return src.slice(at, i + 1)
  }
  return null
}

// 把 ['a', 'b'] 這種字面值轉成陣列；格式不對回 null
const parseList = (literal) => {
  const items = [...literal.matchAll(/'([^']*)'/g)].map((m) => m[1])
  return items
}

// V60：A62
const v60 = () => {
  const handlers = read(HANDLERS_JS)
  const fields = handlers.match(/const DRINK_SETTING_FIELDS = \[([^\]]*)\]/)
  if (!fields || JSON.stringify(parseList(fields[1])) !== JSON.stringify(EXPECTED_FIELDS)) {
    problems.push('DRINK_SETTING_FIELDS 不是恰好五個欄位')
  }
  const validate = sectionOf(strip(read(DRINK_JS)), 'validateDrinkSettings')
  if (validate === null) problems.push('找不到 validateDrinkSettings')
  else if (/\benabled\b/.test(validate)) problems.push('validateDrinkSettings 含 enabled')
  const baseHandlers = readBase(HANDLERS_JS)
  for (const name of ['handleDrinkSettingsRead', 'handleDrinkSettingsWrite', 'readDrinkSettings']) {
    const now = sectionOf(handlers, name)
    const before = sectionOf(baseHandlers, name)
    if (now === null || before === null) problems.push(`找不到 ${name}`)
    else if (now !== before) problems.push(`${name} 與基準 commit 不同`)
  }
}

// V61：A64
const v61 = () => {
  const handlers = strip(read(HANDLERS_JS))
  const def = handlers.match(/const DRINK_GUARDED_ROUTES = \[([^\]]*)\]/)
  const guarded = def ? parseList(def[1]) : null
  if (guarded === null || JSON.stringify(guarded) !== JSON.stringify(EXPECTED_GUARDED)) {
    problems.push('DRINK_GUARDED_ROUTES 不是恰好 parse preview confirm resist undo')
  }
  for (const name of UNGUARDED) if (guarded?.includes(name)) problems.push(`DRINK_GUARDED_ROUTES 含 ${name}`)
  const handleDrink = sectionOf(handlers, 'handleDrink')
  if (handleDrink === null) problems.push('找不到 handleDrink')
  const lines = handlers.split('\n')
  const uses = lines.filter((line) => line.includes('DRINK_GUARDED_ROUTES') && !/^const DRINK_GUARDED_ROUTES\b/.test(line))
  if (uses.length === 0) problems.push('DRINK_GUARDED_ROUTES 沒有被使用')
  for (const line of uses) {
    if (handleDrink === null || !handleDrink.includes(line)) problems.push(`DRINK_GUARDED_ROUTES 用在 handleDrink 以外：${line.trim()}`)
  }
}

// V62：A65
const v62 = () => {
  const handlers = strip(read(HANDLERS_JS))
  const scheduled = sectionOf(handlers, 'runScheduled')
  if (scheduled === null) return problems.push('找不到 runScheduled')
  const ma = scheduled.indexOf('if (timeStr === \'08:30\')')
  if (ma < 0) return problems.push('runScheduled 找不到盤前均線段落')
  const askPart = scheduled.slice(0, ma)
  const rest = scheduled.slice(ma)
  if (!askPart.includes('DRINK_ENABLED_KEY')) problems.push('每日戒飲詢問段沒有讀 DRINK_ENABLED_KEY')
  if (/DRINK_ENABLED_KEY|isDrinkEnabled/.test(rest)) problems.push('盤前均線或 Todoist 段含 DRINK_ENABLED_KEY 或 isDrinkEnabled')
}

// V63：新增的函式沒有 import、Date、fetch、Math.random
const v63 = () => {
  const drink = strip(read(DRINK_JS))
  for (const name of ['parseDrinkEnabled', 'isDrinkEnabled', 'shouldAsk']) {
    const body = sectionOf(drink, name)
    if (body === null) problems.push(`drink.js 找不到 ${name}`)
    else if (/\bimport\b|\bDate\b|\bfetch\b|Math\.random/.test(body)) problems.push(`${name} 含 import、Date、fetch 或 Math.random`)
  }
}

// V65：網頁接線
const v65 = () => {
  const html = read(PET_INDEX_HTML)
  const view = read(DRINK_VIEW_JS)
  if (!html.includes('setDrinkEnabled')) problems.push('index.html 缺少 setDrinkEnabled')
  if (!html.includes('controlsVisibility(')) problems.push('index.html 缺少 controlsVisibility(')
  for (const id of ['mic', 'resist', 'history']) if (!html.includes(`id="${id}"`)) problems.push(`index.html 缺少 #${id}`)
  const block = braceBlockFrom(html, 'setDrinkEnabled: function')
  if (block === null) problems.push('index.html 找不到 setDrinkEnabled: function 區塊')
  else {
    if (/['"#](chat|ma)\b/.test(block)) problems.push('setDrinkEnabled 內碰了 #chat 或 #ma')
    if (!block.includes('clearDrinkButtons')) problems.push('setDrinkEnabled 沒有呼叫 clearDrinkButtons')
  }
  if (!/PetDrinkView\s*=\s*\{[^}]*controlsVisibility/.test(view)) problems.push('drink-view.js 沒有匯出 controlsVisibility')
  const srcs = (text) => [...text.matchAll(/<script[^>]*src="([^"]*)"/g)].map((m) => m[1])
  if (JSON.stringify(srcs(html)) !== JSON.stringify(srcs(readBase(PET_INDEX_HTML)))) problems.push('index.html 載入順序與基準不同')
}

// V67：條款 12，靜默降級
const v67 = () => {
  const files = [DRINK_JS, HANDLERS_JS, DRINK_KT, SETTINGS_KT, OVERLAY_KT, DRINK_VIEW_JS, PET_INDEX_HTML]
  for (const path of files) {
    const src = strip(read(path))
    for (const body of catchBodies(src)) {
      for (const pattern of SILENT_ENABLED) if (pattern.test(body)) problems.push(`${path} 的 catch 內有 ${pattern}`)
    }
    if (FAKE_BYTES.test(src)) problems.push(`${path} 含假資料或存在判斷的樣式`)
    for (const line of src.split('\n')) {
      if (/enabled/i.test(line) && /typeof[^\n]*undefined/.test(line)) problems.push(`${path} 以 typeof undefined 判斷開關：${line.trim()}`)
    }
  }
}

const CHECKS = { v60, v61, v62, v63, v65, v67 }
if (!CHECKS[mode]) {
  console.error('用法：node tools/check-m43.mjs <v60|v61|v62|v63|v65|v67> <基準 commit>')
  process.exit(2)
}
CHECKS[mode]()
if (problems.length > 0) {
  console.error(problems.join('\n'))
  process.exit(1)
}
