// M4.4 資源接線檢查（verify.sh 的 V75）：新增資源都存在、是合法 XML、有被引用；Activity 引用的資源都存在
import { readFileSync, existsSync, readdirSync } from 'node:fs'

// 常數定義
const RES = 'app/src/main/res/'
const ACTIVITY = 'app/src/main/java/com/accompany/pet/DrinkSettingsActivity.kt'
const NEW_DRAWABLES = ['bg_settings_card', 'bg_settings_field', 'bg_settings_field_focus', 'bg_settings_field_invalid', 'bg_settings_status', 'bg_settings_dot', 'bg_settings_btn_primary', 'bg_settings_btn_ghost', 'bg_settings_bar', 'bg_settings_note']
const NEW_COLOR_FILES = ['switch_track_tint', 'switch_thumb_tint']
const NEW_COLORS = ['settings_text', 'settings_text_secondary', 'settings_accent', 'settings_success', 'settings_warning', 'settings_danger', 'settings_card_fill', 'settings_card_stroke', 'settings_field_fill', 'settings_divider', 'settings_bar_fill', 'settings_note_fill', 'settings_note_stroke']

const problems = []
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n')

// 簡易合法性檢查：標籤成對、標籤之間沒有殘缺的角括號（足以抓出寫壞的資源檔）
const checkXml = (path) => {
  const text = read(path)
  const stack = []
  const tagRe = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<(\/?)([A-Za-z_][\w.:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*?)(\/?)>/g
  const rest = text.replace(tagRe, (whole, closing, name, attrs, selfClose) => {
    if (!name || selfClose) return ''
    if (closing) {
      if (stack.pop() !== name) problems.push(`${path}：標籤不成對（${name}）`)
    } else stack.push(name)
    return ''
  })
  if (stack.length) problems.push(`${path}：標籤未關閉（${stack.join(',')}）`)
  if (/[<>]/.test(rest)) problems.push(`${path}：有殘缺的角括號`)
  if (!/<!--[^]*?[一-鿿][^]*?-->/.test(text.split('\n').slice(0, 3).join('\n'))) problems.push(`${path}：開頭缺少中文註解`)
}

// 所有資源檔文字（用來找引用）
const resFiles = []
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = dir + e.name
    if (e.isDirectory()) walk(p + '/')
    else if (p.endsWith('.xml')) resFiles.push(p)
  }
}
walk(RES)
const activity = read(ACTIVITY)
const allText = resFiles.map(read).join('\n') + '\n' + activity

for (const name of NEW_DRAWABLES) {
  const path = `${RES}drawable/${name}.xml`
  if (!existsSync(path)) { problems.push(`缺少 ${path}`); continue }
  checkXml(path)
}
for (const name of NEW_COLOR_FILES) {
  const path = `${RES}color/${name}.xml`
  if (!existsSync(path)) { problems.push(`缺少 ${path}`); continue }
  checkXml(path)
}
const colorsXml = read(`${RES}values/colors.xml`)
const declared = new Set([...colorsXml.matchAll(/<color name="([^"]+)"/g)].map((m) => m[1]))
for (const name of NEW_COLORS) if (!declared.has(name)) problems.push(`colors.xml 缺少 ${name}`)

// Activity 引用的資源都存在
for (const m of activity.matchAll(/R\.drawable\.(\w+)/g)) {
  if (!existsSync(`${RES}drawable/${m[1]}.xml`) && !existsSync(`${RES}drawable/${m[1]}.jpg`)) problems.push(`Activity 引用不存在的 drawable：${m[1]}`)
}
for (const m of activity.matchAll(/R\.color\.(\w+)/g)) {
  if (!declared.has(m[1]) && !existsSync(`${RES}color/${m[1]}.xml`)) problems.push(`Activity 引用不存在的 color：${m[1]}`)
}

// 每個新增資源至少被引用一次（Activity、或其他資源）
const used = (name, kind) => new RegExp(`R\\.${kind}\\.${name}\\b|@${kind}/${name}\\b`).test(allText)
for (const name of NEW_DRAWABLES) if (!used(name, 'drawable')) problems.push(`drawable 沒被引用：${name}`)
for (const name of NEW_COLOR_FILES) if (!used(name, 'color')) problems.push(`color 檔沒被引用：${name}`)
for (const name of NEW_COLORS) if (!used(name, 'color')) problems.push(`顏色沒被引用：${name}`)

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
