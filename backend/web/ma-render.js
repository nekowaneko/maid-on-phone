// 盤前均線網頁渲染函式庫（純函式，無 DOM 操作，ES 模組）
// 依據 docs/M4-LANE-B.md §3 與 design/prototype/prototype.html 規範實作。
// 嚴格遵守安全規範：所有動態字串皆經由 escapeHtml 轉義；所有色碼由 ma.css 管理。

// 常數定義
const CHART_X0 = 10
const CHART_DX = 34
const CHART_TOP = 8
const CHART_SCALE = 0.8
const LABEL_GAP = 14
export const MA_EXIT_URL = 'ma-exit://close' // 與 ma-contract.json 的 exitUrl 相同

// 功能函數定義

// 逸出 HTML 特殊字元防範 XSS
export function escapeHtml(text) {
  if (text === null || text === undefined) return ''
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// 取得排列標籤的文字與分組
export function tagLabel(kind, glossary) {
  const k = glossary?.kinds?.[kind]
  if (!k) return { text: '', group: 'm' }
  const text = k.arrow ? `${k.arrow} ${k.name}` : k.name
  const group = kind === 'U' ? 'u' : (kind === 'D' ? 'd' : 'm')
  return { text, group }
}

// 取得排列說明的各項欄位
export function explainFor(kind, glossary) {
  const k = glossary?.kinds?.[kind]
  return {
    key: glossary?.key || '',
    def: k?.def || '',
    meta: k?.meta || '',
    chart: k?.chart || null,
    note: glossary?.chartNote || ''
  }
}

// 歷史矩陣格子上的代表文字
export function glyphFor(kind, glossary) {
  const k = glossary?.kinds?.[kind]
  if (k && k.glyph) return k.glyph
  if (kind === null || kind === undefined) return '—'
  return ''
}

// 繪製均線走勢示意圖 SVG（純純數值座標運算，色碼集中於 CSS 變數）
export function chartSvg(kind, glossary) {
  const exp = explainFor(kind, glossary)
  if (!exp.chart) return ''
  const c = exp.chart

  const y = (v) => CHART_TOP + v * CHART_SCALE
  const pts = (a) => a.map((v, i) => `${(CHART_X0 + i * CHART_DX).toFixed(0)},${y(v).toFixed(1)}`).join(' ')

  const defs = [
    ['5日', c.a5, 'var(--ma5)'],
    ['20日', c.a20, 'var(--ma20)'],
    ['60日', c.a60, 'var(--ma60)']
  ]
  const endX = CHART_X0 + 5 * CHART_DX

  const labels = defs.map((d) => ({ t: d[0], y: y(d[1][5]), c: d[2] })).sort((a, b) => a.y - b.y)
  for (let i = 1; i < labels.length; i += 1) {
    if (labels[i].y - labels[i - 1].y < LABEL_GAP) {
      labels[i].y = labels[i - 1].y + LABEL_GAP
    }
  }

  const order = defs.slice().sort((a, b) => a[1][5] - b[1][5]).map((d) => d[0]).join('、')

  let svg = `<svg viewBox="0 0 250 108" role="img" aria-label="示意圖，不是實際股價。今天這一格由上到下是：${order}">`
  svg += `<line x1="${CHART_X0}" y1="94" x2="${endX}" y2="94" stroke="rgba(255,255,255,0.25)" stroke-width="1"/>`
  defs.forEach((d) => {
    svg += `<polyline points="${pts(d[1])}" fill="none" stroke="${d[2]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
  })
  defs.forEach((d) => {
    svg += `<circle cx="${endX}" cy="${y(d[1][5]).toFixed(1)}" r="3.8" fill="${d[2]}"/>`
  })
  labels.forEach((l) => {
    svg += `<text x="${endX + 10}" y="${(l.y + 4).toFixed(1)}" font-size="11" fill="var(--p-text)">${l.t}</text>`
  })
  svg += `<text x="${CHART_X0}" y="106" font-size="10" fill="var(--p-sub)">過去</text>`
  svg += `<text x="${endX}" y="106" font-size="10" text-anchor="end" fill="var(--p-sub)">今天</text>`
  svg += '</svg>'
  return svg
}

// 渲染排列標籤 span
export function renderTag(kind, glossary, extraTag) {
  if (extraTag) {
    return `<span class="tag m">${escapeHtml(extraTag)}</span>`
  }
  const info = tagLabel(kind, glossary)
  const k = glossary?.kinds?.[kind]
  const arrow = k?.arrow ? `<span class="ar" aria-hidden="true">${escapeHtml(k.arrow)}</span>` : ''
  const name = k?.name ? escapeHtml(k.name) : escapeHtml(info.text)
  return `<span class="tag ${info.group}">${arrow}${name}</span>`
}

// 渲染三條均線數值藥丸（依數值高至低排序）
export function renderMaPills(ma, lines) {
  if (!ma || !Array.isArray(ma) || ma.length < 3) {
    const noClosesText = lines?.desc?.N || ''
    return `<p class="sub">${escapeHtml(noClosesText)}</p>`
  }
  const arr = [
    { k: '5日', v: ma[0], c: 'var(--ma5)' },
    { k: '20日', v: ma[1], c: 'var(--ma20)' },
    { k: '60日', v: ma[2], c: 'var(--ma60)' }
  ]
  arr.sort((a, b) => b.v - a.v)
  const label = '由高到低：' + arr.map((a) => `${a.k} ${a.v}`).join('、')
  const pills = arr.map((a) => `<span class="pill" style="background:${a.c}">${escapeHtml(a.k)} ${escapeHtml(a.v)}</span>`).join('<span class="gt" aria-hidden="true">›</span>')
  return `<div class="ma" role="img" aria-label="${escapeHtml(label)}">${pills}</div>`
}

// 渲染「什麼意思？」展開內容區塊
export function renderWhy(code, kind, glossary) {
  const exp = explainFor(kind, glossary)
  return `<div class="why" id="why-${escapeHtml(code)}">` +
    `<p class="key">${escapeHtml(exp.key)}</p>` +
    `<p class="def">${escapeHtml(exp.def)}</p>` +
    chartSvg(kind, glossary) +
    `<p class="meta">${escapeHtml(exp.meta)}</p>` +
    `<p class="fine">${escapeHtml(exp.note)}</p>` +
    '</div>'
}

// 渲染單檔卡片
export function renderCard(item, glossary, lines, isOpen) {
  const code = escapeHtml(item.code)
  const name = escapeHtml(item.name || item.code)

  // 剛加入標的
  if (item.pending) {
    const tag = lines?.tags?.pending || '明天納入'
    const desc = lines?.pending || item.desc || ''
    return `<article class="card pend"><div class="ctop"><div><span class="cd">${code}</span><span class="nm">${name}</span></div><span class="tag m">${escapeHtml(tag)}</span></div><p class="desc">${escapeHtml(desc)}</p></article>`
  }

  // 單檔取得失敗（U16 規格）
  if (item.failed) {
    const tag = lines?.tags?.failedStock || item.tag || '沒拿到'
    const desc = lines?.failedStock || item.desc || ''
    return `<article class="card"><div class="ctop"><div><span class="cd">${code}</span><span class="nm">${name}</span></div><span class="tag m">${escapeHtml(tag)}</span></div><p class="desc">${escapeHtml(desc)}</p></article>`
  }

  // 正常卡片
  const tag = renderTag(item.kind, glossary)
  const desc = escapeHtml(item.desc || '')
  const ma = renderMaPills(item.ma, lines)
  const open = !!isOpen
  const whyBtn = `<button type="button" class="whybtn" data-a="why" data-c="${code}" aria-expanded="${open}" aria-controls="why-${code}">${open ? '收起說明' : '什麼意思？'}</button>`
  const whyContent = open ? renderWhy(item.code, item.kind, glossary) : ''
  return `<article class="card"><div class="ctop"><div><span class="cd">${code}</span><span class="nm">${name}</span></div>${tag}</div><p class="desc">${desc}</p>${ma}${whyBtn}${whyContent}</article>`
}

// 渲染「今天」分頁內容
export function renderToday(report, glossary, lines, openMap) {
  if (!report || report.status === 'loading') {
    return '<div class="skel"></div><div class="skel"></div><div class="skel"></div>'
  }
  if (report.status === 'failed') {
    return `<div class="note"><p>${escapeHtml(lines?.failed || '')}</p><button type="button" class="btn" data-a="retry">重試</button></div>`
  }
  if (report.status === 'empty' || !Array.isArray(report.items) || report.items.length === 0) {
    return '<div class="note"><p>追蹤清單是空的。</p><button type="button" class="btn" data-a="gomanage">加入第一檔</button></div>'
  }

  const counts = report.counts || { u: 0, d: 0, m: 0 }
  const chips = `<div class="chips"><span class="chip">多頭 ${counts.u}</span><span class="chip">空頭 ${counts.d}</span><span class="chip">其他 ${counts.m}</span></div>`
  const cards = report.items.map((item) => renderCard(item, glossary, lines, !!openMap?.[item.code])).join('')
  const disclaimer = `<p class="disc">${escapeHtml(report.disclaimer || lines?.disclaimer || '')}</p>`
  return chips + cards + disclaimer
}

// 渲染「歷史」分頁內容
export function renderHistory(historyData, glossary, lines, sel) {
  if (!historyData || historyData.status === 'loading') {
    return '<div class="skel"></div><div class="skel"></div>'
  }
  if (historyData.status === 'failed') {
    return `<div class="note"><p>歷史資料沒有拿到。</p><button type="button" class="btn" data-a="retry">重試</button></div>`
  }
  if (!Array.isArray(historyData.days) || historyData.days.length === 0 || !Array.isArray(historyData.rows) || historyData.rows.length === 0) {
    return '<div class="note"><p>還沒有歷史。</p><p class="sub">從第一次送出報告的那天起開始累積。</p></div>'
  }

  const days = historyData.days
  const head = '<tr><th class="l"></th>' + days.map((d) => `<th>${escapeHtml(d)}</th>`).join('') + '</tr>'

  const rows = historyData.rows.map((r) => {
    const code = escapeHtml(r.code)
    const name = escapeHtml(r.name || r.code)
    const cells = (r.cells || []).map((cell, i) => {
      if (!cell || cell.kind === null || cell.kind === undefined) {
        return '<td><button type="button" class="cell" disabled>—</button></td>'
      }
      const k = cell.kind
      const info = tagLabel(k, glossary)
      const glyph = glyphFor(k, glossary)
      const isSelected = sel && sel.code === r.code && sel.index === i
      const isChanged = !!cell.changed
      const cls = `cell ${info.group}${isChanged ? ' chg' : ''}${isSelected ? ' sel' : ''}`
      const kName = glossary?.kinds?.[k]?.name || info.text
      const prevName = cell.prev ? (glossary?.kinds?.[cell.prev]?.name || '') : ''
      const lab = `${name} ${days[i]} ${kName}${isChanged && prevName ? '，由' + prevName + '轉入' : ''}`
      return `<td><button type="button" class="${cls}" data-a="cell" data-c="${code}" data-i="${i}" aria-label="${escapeHtml(lab)}">${escapeHtml(glyph)}</button></td>`
    }).join('')
    return `<tr><td class="l">${code}<br><span class="sub">${name}</span></td>${cells}</tr>`
  }).join('')

  let ro = '點一格看當天的排列。'
  if (sel) {
    const row = historyData.rows.find((x) => x.code === sel.code)
    if (row && row.cells && row.cells[sel.index]) {
      const cell = row.cells[sel.index]
      const kName = glossary?.kinds?.[cell.kind]?.name || ''
      const prevName = cell.prev ? (glossary?.kinds?.[cell.prev]?.name || '') : ''
      const name = row.name || row.code
      const chgNote = cell.changed && prevName ? `（前一天是${prevName}）` : (cell.prev ? '（和前一天相同）' : '')
      ro = `${sel.date} ${row.code} ${name}：${kName}${chgNote}。`
    }
  }

  const legend = '<div class="legend">' +
    '<span><i class="dot-u"></i>多 多頭</span>' +
    '<span><i class="dot-d"></i>空 空頭</span>' +
    '<span><i class="dot-m"></i>弱 轉弱</span>' +
    '<span><i class="dot-m"></i>強 轉強</span>' +
    '<span><i class="dot-m"></i>糾 糾結</span>' +
    '<span><i class="dot-m"></i>資 資料不足</span>' +
    '<span><i class="ring"></i>當天轉換</span>' +
    '</div>'

  const glossBtn = '<button type="button" class="linkbtn" data-a="gloss">這些字是什麼意思？看懂排列 ›</button>'
  const readout = `<div class="card readout" id="readout" aria-live="polite">${escapeHtml(ro)}</div>`
  const disclaimer = `<p class="disc">${escapeHtml(lines?.disclaimer || '')}</p>`

  return `<table class="mx">${head}${rows}</table>${legend}${glossBtn}${readout}${disclaimer}`
}

// 渲染「看懂排列」說明整頁（S7 規格，依序出現三條線、轉弱轉強、八種排列）
export function renderGlossary(glossary, lines) {
  const order = glossary?.order || ['U', 'D', 'W', 'V', 'S', 'B', 'T', 'N']

  const ma5Text = glossary?.lines?.ma5 || ''
  const ma20Text = glossary?.lines?.ma20 || ''
  const ma60Text = glossary?.lines?.ma60 || ''
  const compareText = glossary?.lines?.compare || ''

  const card1 = '<article class="kcard">' +
    `<h4>${escapeHtml(glossary?.intro?.title || '三條線怎麼想')}</h4>` +
    `<div class="keyrow"><span class="pill pill-ma5">5 日線</span>${escapeHtml(ma5Text)}</div>` +
    `<div class="keyrow"><span class="pill pill-ma20">20 日線</span>${escapeHtml(ma20Text)}</div>` +
    `<div class="keyrow"><span class="pill pill-ma60">60 日線</span>${escapeHtml(ma60Text)}</div>` +
    `<p class="meta">${escapeHtml(compareText)}</p>` +
    '</article>'

  const weakText = glossary?.weakStrong?.weak || ''
  const strongText = glossary?.weakStrong?.strong || ''
  const noteText = glossary?.weakStrong?.note || ''

  const card2 = '<article class="kcard">' +
    `<h4>${escapeHtml(glossary?.weakStrong?.title || '轉弱與轉強')}</h4>` +
    `<p class="def">${escapeHtml(weakText)}<br>${escapeHtml(strongText)}<br>${escapeHtml(noteText)}</p>` +
    '</article>'

  const secTitle = `<p class="sec">${escapeHtml(glossary?.sectionTitle || '八種排列')}</p>`

  const cards = order.map((k) => {
    const item = glossary?.kinds?.[k]
    if (!item) return ''
    const tag = renderTag(k, glossary)
    return '<article class="kcard">' +
      `<div class="ctop"><h4>${escapeHtml(item.name)}</h4>${tag}</div>` +
      `<p class="def">${escapeHtml(item.def)}</p>` +
      chartSvg(k, glossary) +
      `<p class="meta">${escapeHtml(item.meta)}</p>` +
      '</article>'
  }).join('')

  const footer = `<p class="disc">${escapeHtml(glossary?.footer || lines?.disclaimer || '')}</p>`
  return card1 + card2 + secTitle + cards + footer
}

// 渲染「追蹤清單」管理頁
export function renderWatchlist(watchlistData, limit, lines, addErr) {
  const items = watchlistData?.items || []
  const n = items.length
  const rows = items.map((s) => {
    const code = escapeHtml(s.code)
    const name = escapeHtml(s.name || s.code)
    const pendingNote = s.pending ? `<small>${escapeHtml(lines?.tags?.pending ? lines.tags.pending + '起納入報告' : '明天起納入報告')}</small>` : ''
    return '<div class="mrow">' +
      `<div class="mi"><b>${code} ${name}</b>${pendingNote}</div>` +
      `<button type="button" class="ibtn" data-a="untrack" data-c="${code}" aria-label="停止追蹤 ${code} ${name}">停止追蹤</button>` +
      '</div>'
  }).join('')

  const emptyNote = !rows ? '<div class="note"><p>目前沒有追蹤任何標的。</p></div>' : rows

  return `<form class="addf" id="addForm" autocomplete="off">` +
    `<input id="addInput" type="text" inputmode="text" placeholder="代號或名稱，例如 2412 或 中華電" aria-label="要追蹤的代號或名稱" aria-describedby="addErr" />` +
    `<button class="btn" type="submit">加入</button>` +
    `</form>` +
    `<p class="err" id="addErr" role="alert">${escapeHtml(addErr || '')}</p>` +
    emptyNote +
    '<p class="sub">停止追蹤後 6 秒內可以復原。</p>'
}

// 依目前畫面決定「‹」的行為：追蹤清單與看懂排列頁回明細（'detail'），明細最上層關閉明細頁（'exit'）
export const decideBack = (screen) => {
  if (screen === 'manage' || screen === 'glossary') return 'detail'
  return 'exit'
}

