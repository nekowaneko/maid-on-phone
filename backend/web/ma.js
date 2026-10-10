// 盤前均線明細網頁主程式（ES 模組）
// 依據 docs/M4-LANE-B.md §3、§4B.3 與 A43/A45/V32/V33 規範實作。
// 安全規範：內部 HTML 設值恰好出現於單一函式 setHtml；連線僅限同源相對路徑；所有動態值經 escapeHtml 轉義。

import {
  escapeHtml,
  renderToday,
  renderHistory,
  renderWatchlist,
  renderGlossary,
  decideBack,
  MA_EXIT_URL
} from './ma-render.js'

// 常數定義
const SECRET_STORAGE_KEY = 'companion:secret'
const SECRET_HEADER = 'x-app-secret'
const GLOSSARY_URL = '../config/ma-glossary.json'
const LINES_URL = '../config/ma-lines.json'
const CONTRACT_URL = '../config/ma-contract.json'
const DEFAULTS_URL = '../config/ma-defaults.json'
const DEFAULT_UNDO_SECONDS = 6
const DEFAULT_WATCH_LIMIT = 10

// 功能函數定義

// 單一設值函式（A43 / V33 規範：全檔恰好出現一次）
function setHtml(el, html) {
  el.innerHTML = html
}

// 建立應用程式主狀態
const state = {
  secret: '',
  glossary: null,
  lines: null,
  contract: null,
  defaults: null,
  screen: 'detail', // 'detail' | 'manage' | 'glossary'
  tab: 'today',     // 'today' | 'history'
  report: null,
  history: null,
  watchlist: null,
  openMap: {},
  sel: null,
  undo: null,
  undoTimer: null,
  addErr: '',
  loading: false
}

// 取得同源 API 請求標頭
function getHeaders() {
  return {
    'Accept': 'application/json',
    [SECRET_HEADER]: state.secret
  }
}

// 封裝同源 GET API 呼叫
async function fetchApi(url) {
  const resp = await fetch(url, { headers: getHeaders() })
  if (!resp.ok) {
    throw new Error(`API error: ${resp.status}`)
  }
  return resp.json()
}

// 封裝同源 POST API 呼叫
async function postApi(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      ...getHeaders(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const err = new Error(data.message || data.error || 'request failed')
    err.status = resp.status
    err.data = data
    throw err
  }
  return data
}

// 載入設定檔案
async function loadConfigs() {
  const [glossary, lines, contract, defaults] = await Promise.all([
    fetch(GLOSSARY_URL).then((r) => r.json()),
    fetch(LINES_URL).then((r) => r.json()),
    fetch(CONTRACT_URL).then((r) => r.json()),
    fetch(DEFAULTS_URL).then((r) => r.json()).catch(() => ({}))
  ])
  state.glossary = glossary
  state.lines = lines
  state.contract = contract
  state.defaults = defaults
}

// 載入當日報告
async function loadReport() {
  state.report = { status: 'loading' }
  render()
  try {
    const data = await fetchApi(state.contract?.api?.report || '/api/ma/report')
    state.report = data
  } catch {
    state.report = { status: 'failed' }
  }
  render()
}

// 載入歷史資料
async function loadHistory() {
  state.history = { status: 'loading' }
  render()
  try {
    const data = await fetchApi(state.contract?.api?.history || '/api/ma/history')
    state.history = data
  } catch {
    state.history = { status: 'failed' }
  }
  render()
}

// 載入追蹤清單
async function loadWatchlist() {
  try {
    const data = await fetchApi(state.contract?.api?.watchlist || '/api/ma/watchlist')
    state.watchlist = data
  } catch {
    state.watchlist = { items: [] }
  }
  render()
}

// 重新計算並整理當日報告
async function refreshReport() {
  state.report = { status: 'loading' }
  render()
  try {
    const data = await postApi(state.contract?.api?.refresh || '/api/ma/refresh', {})
    state.report = data
  } catch {
    state.report = { status: 'failed' }
  }
  render()
}

// 渲染頂部導覽列
function renderBar() {
  if (state.screen === 'glossary') {
    return '<div class="bar"><button type="button" class="ibtn sq" data-a="back" aria-label="返回">‹</button><h3>看懂排列</h3></div>'
  }
  if (state.screen === 'manage') {
    const limit = state.contract?.limit || DEFAULT_WATCH_LIMIT
    const n = state.watchlist?.items?.length || 0
    return `<div class="bar"><button type="button" class="ibtn sq" data-a="back" aria-label="返回">‹</button><h3>追蹤清單 ${n}/${limit}</h3></div>`
  }
  return '<div class="bar"><button type="button" class="ibtn sq" data-a="back" aria-label="返回">‹</button><h3>盤前均線</h3><button type="button" class="ibtn" data-a="gomanage">追蹤清單</button></div>'
}

// 渲染分頁列與副標題
function renderDetailHeader() {
  const asOf = state.report?.asOf || ''
  const date = state.report?.reportDate || ''
  const subText = (date || asOf) ? `<p class="sub">${escapeHtml(date)} · 依 ${escapeHtml(asOf)} 收盤計算</p>` : ''
  const tabs = '<div class="tabs" role="tablist">' +
    `<button type="button" role="tab" data-a="tab" data-t="today" aria-selected="${state.tab === 'today'}">今天</button>` +
    `<button type="button" role="tab" data-a="tab" data-t="history" aria-selected="${state.tab === 'history'}">歷史</button>` +
    '</div>'
  const glossLink = state.tab === 'today' ? '<button type="button" class="linkbtn" data-a="gloss">看懂排列：什麼是轉弱、轉強？ ›</button>' : ''
  return subText + tabs + glossLink
}

// 渲染主畫面
function render() {
  const app = document.getElementById('app')
  if (!app) return

  // 尚未設定存取密鑰時，顯示提示訊息不連線
  if (!state.secret) {
    setHtml(app, '<div class="body" style="padding-top:40px"><div class="note"><p>請先在聊天畫面輸入存取密鑰</p></div></div>')
    return
  }

  const bar = renderBar()
  let content = ''

  if (state.screen === 'glossary') {
    content = renderGlossary(state.glossary, state.lines)
  } else if (state.screen === 'manage') {
    const limit = state.contract?.limit || DEFAULT_WATCH_LIMIT
    content = renderWatchlist(state.watchlist, limit, state.lines, state.addErr)
  } else {
    const header = renderDetailHeader()
    const inner = state.tab === 'history'
      ? renderHistory(state.history, state.glossary, state.lines, state.sel)
      : renderToday(state.report, state.glossary, state.lines, state.openMap)
    content = header + inner
  }

  let snackbar = ''
  if (state.undo) {
    const code = escapeHtml(state.undo.code)
    const name = escapeHtml(state.undo.name)
    snackbar = `<div class="snack" role="status"><span>已停止追蹤 ${code} ${name}</span><button type="button" data-a="undo">復原</button></div>`
  }

  setHtml(app, bar + `<div class="body">${content}</div>` + snackbar)
}

// 處理新增追蹤標的表單送出
async function handleAdd(inputVal) {
  const raw = String(inputVal || '').trim()
  if (!raw) {
    state.addErr = state.lines?.errors?.format || ''
    render()
    return
  }
  try {
    await postApi(state.contract?.api?.watchlist || '/api/ma/watchlist', {
      action: 'add',
      code: raw
    })
    state.addErr = ''
    await loadWatchlist()
  } catch (e) {
    const errCode = e?.data?.error
    let msg = e?.data?.message
    if (!msg && errCode && state.lines?.errors?.[errCode]) {
      msg = state.lines.errors[errCode]
        .replace('{input}', raw)
        .replace('{code}', raw)
        .replace('{name}', '')
        .replace('{limit}', String(state.contract?.limit || DEFAULT_WATCH_LIMIT))
    }
    state.addErr = msg || e.message || '新增失敗'
    render()
  }
}

// 處理停止追蹤標的
async function handleUntrack(code) {
  const item = state.watchlist?.items?.find((x) => x.code === code)
  const name = item ? (item.name || item.code) : code

  try {
    await postApi(state.contract?.api?.watchlist || '/api/ma/watchlist', {
      action: 'untrack',
      code
    })
    state.undo = { code, name }
    clearTimeout(state.undoTimer)
    const waitSec = state.defaults?.undoSeconds || DEFAULT_UNDO_SECONDS
    state.undoTimer = setTimeout(() => {
      state.undo = null
      render()
    }, waitSec * 1000)
    await loadWatchlist()
  } catch (e) {
    state.addErr = e?.data?.message || e.message || '停止追蹤失敗'
    render()
  }
}

// 處理復原追蹤標的
async function handleUndo() {
  if (!state.undo) return
  const code = state.undo.code
  clearTimeout(state.undoTimer)
  state.undo = null
  try {
    await postApi(state.contract?.api?.watchlist || '/api/ma/watchlist', {
      action: 'restore',
      code
    })
    await loadWatchlist()
  } catch (e) {
    state.addErr = e?.data?.message || e.message || '復原失敗'
    render()
  }
}

// 綁定全域事件委派
function bindEvents() {
  const app = document.getElementById('app')
  if (!app) return

  app.addEventListener('click', (e) => {
    const target = e.target.closest('[data-a]')
    if (!target) return
    const action = target.getAttribute('data-a')

    if (action === 'back') {
      const next = decideBack(state.screen)
      if (next === 'detail') {
        state.screen = 'detail'
        render()
      } else {
        window.location.href = MA_EXIT_URL
      }
      return
    }

    if (action === 'gomanage') {
      state.screen = 'manage'
      state.addErr = ''
      loadWatchlist()
      return
    }

    if (action === 'gloss') {
      state.screen = 'glossary'
      render()
      return
    }

    if (action === 'tab') {
      const tab = target.getAttribute('data-t')
      state.tab = tab
      state.sel = null
      if (tab === 'history' && !state.history) {
        loadHistory()
      } else {
        render()
      }
      return
    }

    if (action === 'why') {
      const code = target.getAttribute('data-c')
      state.openMap[code] = !state.openMap[code]
      render()
      return
    }

    if (action === 'cell') {
      const code = target.getAttribute('data-c')
      const index = parseInt(target.getAttribute('data-i'), 10)
      const date = state.history?.days?.[index] || ''
      state.sel = { code, index, date }
      render()
      return
    }

    if (action === 'retry') {
      refreshReport()
      return
    }

    if (action === 'untrack') {
      const code = target.getAttribute('data-c')
      handleUntrack(code)
      return
    }

    if (action === 'undo') {
      handleUndo()
      return
    }
  })

  app.addEventListener('submit', (e) => {
    if (e.target && e.target.id === 'addForm') {
      e.preventDefault()
      const inp = document.getElementById('addInput')
      handleAdd(inp ? inp.value : '')
    }
  })
}

// 應用程式初始化入口
async function init() {
  state.secret = localStorage.getItem(SECRET_STORAGE_KEY) || ''
  bindEvents()
  if (!state.secret) {
    render()
    return
  }
  try {
    await loadConfigs()
    await loadReport()
  } catch {
    render()
  }
}

// 啟動應用程式
if (typeof document !== 'undefined') {
  init()
}
