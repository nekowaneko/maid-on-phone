// 視訊通話的 DOM 接線：狀態列、蓋層、掛斷、「⋯」選單、眨眼計時、連線探測。
// 狀態轉換、狀態文字、按鈕文字與可用性一律來自 core/call-state.js，這支不自己寫死任何一句，
// 也不判斷規則，只負責「把 callView 算出來的結果畫到畫面上」與「把畫面上發生的事轉成事件」。

import {
  CALL_EVENTS,
  CALL_STATES,
  CALL_TEXT,
  CHAT_EXIT_URL,
  callView,
  connectEvent,
  endedTimeText,
  nextCallState
} from '../core/call-state.js'
import { canBlink, nextBlinkDelay } from '../core/blink.js'
import { emotionToAssetPath } from '../core/emotion.js'

// 常數定義
const ASSET_BASE = new URL('../', import.meta.url) // 設定檔裡的路徑以專案根目錄為基準
const TICK_INTERVAL_MS = 1000 // 通話中每秒更新一次計時
const THINKING_DOTS = '……' // 她在想時對話框裡的動畫文字
const EMPTY_TEXT = ''
const TRUE_TEXT = 'true'
const FALSE_TEXT = 'false'
const OPEN_CLASS = 'is-open'
const SHOWN_CLASS = 'is-shown'
const THINKING_CLASS = 'is-thinking'
const ARIA_HIDDEN = 'aria-hidden'
const MENU_ITEM_SELECTOR = '.menu-item'
const TITLE_SELECTOR = '.overlay-title'
const BODY_SELECTOR = '.overlay-body'
// 與 app.js 之間的通知：事件名稱必須與 app.js 完全相同（V51、check-dom-ids 對照）
const SEND_EVENT_NAME = 'companion:send'
const REPLY_START_EVENT_NAME = 'companion:reply-start'
const REPLY_FAILED_EVENT_NAME = 'companion:reply-failed'
const CALL_ENDED_EVENT_NAME = 'companion:call-ended'
const CALL_INPUT_EVENT_NAME = 'companion:call-input-changed'
const OPEN_SECRET_EVENT_NAME = 'companion:open-secret'

// 功能函數定義

// 對 document 發出通知事件
const emit = (name) => document.dispatchEvent(new CustomEvent(name))

// 預載一張圖；載入完成或失敗都算結束（失敗由換臉當下自己處理），被中止也結束，不會卡住探測
const preloadImage = (url, signal) =>
  new Promise((resolve) => {
    const image = new Image()
    image.addEventListener('load', resolve, { once: true })
    image.addEventListener('error', resolve, { once: true })
    signal.addEventListener('abort', resolve, { once: true })
    image.src = url
  })

// 把某個蓋層裡的標題與說明填成 CALL_TEXT 的句子
const fillOverlay = (overlay, title, body) => {
  overlay.querySelector(TITLE_SELECTOR).textContent = title
  if (body !== null) overlay.querySelector(BODY_SELECTOR).textContent = body
}

// 啟動視訊通話外殼。renderer、config 可能是 null（設定載入失敗），這時探測會走連線失敗。
export const setupCall = ({ renderer, config, callConfig, fetchUsage, readSecret }) => {
  const appElement = document.getElementById('app')
  const statusElement = document.getElementById('call-status')
  const lineElement = document.getElementById('line')
  const endedTimeElement = document.getElementById('ended-time')
  const moreElement = document.getElementById('more')
  const scrimElement = document.getElementById('scrim')
  const overlays = {
    [CALL_STATES.CONNECTING]: document.getElementById('ov-connecting'),
    [CALL_STATES.ERROR]: document.getElementById('ov-error'),
    [CALL_STATES.ENDED]: document.getElementById('ov-ended')
  }

  let state = CALL_STATES.CONNECTING
  let startedAt = 0 // 接通（進入通話中）的那一刻；0 代表還沒接通
  let frozenElapsedMs = 0 // 通話結束時定住的通話時間
  let tickId = 0
  let blinkId = 0
  let probeToken = 0 // 每次探測加一，過期的探測結果一律作廢

  // 目前的通話毫秒數：通話中與她在想時續計，結束後定住，其餘為 0
  const elapsedMs = () => {
    if (state === CALL_STATES.LIVE || state === CALL_STATES.THINKING) return startedAt > 0 ? Date.now() - startedAt : 0
    return state === CALL_STATES.ENDED ? frozenElapsedMs : 0
  }

  // 蓋層與按鈕的文字只填一次，全部來自 CALL_TEXT
  const fillTexts = () => {
    fillOverlay(overlays[CALL_STATES.CONNECTING], CALL_TEXT.connectingTitle, CALL_TEXT.connectingBody)
    fillOverlay(overlays[CALL_STATES.ERROR], CALL_TEXT.errorTitle, CALL_TEXT.errorBody)
    fillOverlay(overlays[CALL_STATES.ENDED], CALL_TEXT.endedTitle, null)
    document.getElementById('call-redial').textContent = CALL_TEXT.errorRetry
    document.getElementById('call-secret').textContent = CALL_TEXT.errorSecret
    document.getElementById('call-redial-ended').textContent = CALL_TEXT.endedRedial
    document.getElementById('call-close').textContent = CALL_TEXT.endedClose
  }

  // 依 callView 的結果更新畫面；樣式切換只靠 #app 的 data- 屬性與 class，不寫行內樣式
  const render = () => {
    const view = callView(state, elapsedMs())
    statusElement.textContent = view.statusText
    statusElement.dataset.tone = view.statusTone
    appElement.dataset.callState = state
    appElement.dataset.faceDimmed = String(view.faceDimmed)
    appElement.dataset.dialogVisible = String(view.dialogVisible)
    appElement.dataset.callInput = String(view.composerEnabled)
    Object.entries(overlays).forEach(([name, element]) => element.classList.toggle(SHOWN_CLASS, view.overlay === name))
    if (view.overlay === CALL_STATES.ENDED) endedTimeElement.textContent = endedTimeText(elapsedMs())
    if (!view.dialogVisible) {
      lineElement.textContent = EMPTY_TEXT
      lineElement.classList.remove(THINKING_CLASS)
    }
    if (view.forcedEmotion !== null && renderer) renderer.setEmotion(view.forcedEmotion)
    emit(CALL_INPUT_EVENT_NAME)
  }

  // 她在想：對話框放「……」動畫；離開這個狀態時把它收掉（接著由 app.js 逐字覆蓋）
  const syncThinkingDots = () => {
    if (state === CALL_STATES.THINKING) {
      lineElement.textContent = THINKING_DOTS
      lineElement.classList.add(THINKING_CLASS)
      return
    }
    if (lineElement.classList.contains(THINKING_CLASS)) {
      lineElement.classList.remove(THINKING_CLASS)
      lineElement.textContent = EMPTY_TEXT
    }
  }

  // 通話中每秒刷新計時；離開通話中與她在想就停
  const syncTick = () => {
    window.clearInterval(tickId)
    tickId = 0
    if (state === CALL_STATES.LIVE || state === CALL_STATES.THINKING) tickId = window.setInterval(render, TICK_INTERVAL_MS)
  }

  // 眨眼：只在通話中排程；到時由 canBlink 判斷，成立才呼叫 renderer.blink，之後重新排程
  const scheduleBlink = () => {
    window.clearTimeout(blinkId)
    blinkId = 0
    if (state !== CALL_STATES.LIVE || !renderer || !config || !callConfig?.blink) return
    blinkId = window.setTimeout(() => {
      const allowed = canBlink({
        state,
        emotion: renderer.currentEmotion(),
        defaultEmotion: config.defaultEmotion,
        speaking: appElement.dataset.speaking === TRUE_TEXT
      })
      if (allowed) renderer.blink(callConfig.blink.file, callConfig.blink.closedMs)
      scheduleBlink()
    }, nextBlinkDelay(Math.random(), callConfig.blink))
  }

  // 連線探測：沒有密鑰就不發請求；其餘同時預載平常的臉並打一次 /api/usage，只看 HTTP 狀態碼。
  // 任何例外（網路錯誤、逾時、被中止）都轉成 status: null，一律交給 connectEvent 判斷。
  const probe = async () => {
    probeToken += 1
    const token = probeToken
    const hasSecret = readSecret().length > 0
    let status = null
    if (hasSecret && renderer && config && callConfig) {
      const controller = new AbortController()
      const timerId = window.setTimeout(() => controller.abort(), callConfig.connectTimeoutMs)
      try {
        const idleUrl = new URL(emotionToAssetPath(config.defaultEmotion, config), ASSET_BASE).href
        const [response] = await Promise.all([fetchUsage(controller.signal), preloadImage(idleUrl, controller.signal)])
        status = response.status
      } catch (error) {
        status = null
      } finally {
        window.clearTimeout(timerId)
      }
    }
    if (token === probeToken) dispatch(connectEvent({ hasSecret, status }))
  }

  // 套用一個事件：下一個狀態由 nextCallState 決定，沒變就什麼都不做
  const dispatch = (event) => {
    const next = nextCallState(state, event)
    if (next === state) return
    const previous = state
    state = next
    if (next === CALL_STATES.LIVE && previous === CALL_STATES.CONNECTING) startedAt = Date.now()
    if (next === CALL_STATES.CONNECTING) {
      startedAt = 0
      frozenElapsedMs = 0
    }
    if (next === CALL_STATES.ENDED) {
      probeToken += 1 // 掛斷時還在探測的話，結果作廢
      frozenElapsedMs = startedAt > 0 ? Date.now() - startedAt : 0
    }
    render()
    syncThinkingDots()
    syncTick()
    scheduleBlink()
    if (next === CALL_STATES.ENDED) emit(CALL_ENDED_EVENT_NAME)
    if (next === CALL_STATES.CONNECTING) probe()
  }

  // 重撥：設定沒載進來就整頁重載（等於重新呼叫一次），否則只重新探測、計時歸零，對話紀錄原封不動
  const redial = () => {
    if (!renderer || !config || !callConfig) {
      window.location.reload()
      return
    }
    dispatch(CALL_EVENTS.REDIAL)
  }

  const openMore = () => {
    moreElement.classList.add(OPEN_CLASS)
    moreElement.setAttribute(ARIA_HIDDEN, FALSE_TEXT)
    scrimElement.classList.add(OPEN_CLASS)
  }

  const closeMore = () => {
    moreElement.classList.remove(OPEN_CLASS)
    moreElement.setAttribute(ARIA_HIDDEN, TRUE_TEXT)
    scrimElement.classList.remove(OPEN_CLASS)
  }

  fillTexts()
  document.addEventListener(SEND_EVENT_NAME, () => dispatch(CALL_EVENTS.SEND))
  document.addEventListener(REPLY_START_EVENT_NAME, () => dispatch(CALL_EVENTS.REPLY))
  document.addEventListener(REPLY_FAILED_EVENT_NAME, () => dispatch(CALL_EVENTS.REPLY_FAILED))
  document.getElementById('hangup').addEventListener('click', () => dispatch(CALL_EVENTS.HANGUP))
  document.getElementById('call-redial').addEventListener('click', redial)
  document.getElementById('call-redial-ended').addEventListener('click', redial)
  document.getElementById('call-secret').addEventListener('click', () => emit(OPEN_SECRET_EVENT_NAME))
  document.getElementById('call-close').addEventListener('click', () => {
    window.location.href = CHAT_EXIT_URL
  })
  document.getElementById('more-open').addEventListener('click', openMore)
  document.getElementById('more-close').addEventListener('click', closeMore)
  scrimElement.addEventListener('click', closeMore)
  // 用捕獲階段：先關面板，再由按鈕自己既有的處理函式開抽屜
  moreElement.addEventListener(
    'click',
    (event) => {
      if (event.target.closest(MENU_ITEM_SELECTOR)) closeMore()
    },
    true
  )

  render()
  probe()
}
