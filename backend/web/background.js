// 背景圖的兩個抽屜：上傳裁切、以及從過去存過的裡面挑一張換上或刪掉。
//
// 兩個抽屜的開關方式跟對話紀錄、小檔案、用量完全一樣（.drawer + is-open + aria-hidden），
// 沒有另外發明一套視覺語言或互動邏輯。
//
// 分工：
//   幾何計算（切哪一塊、還能滑多少、換倍率之後變成哪一塊）→ core/crop.js
//   規則判斷（文字合不合格、超不超過單張上限、最多能放大幾倍、清單怎麼排）→ core/background.js
//   實際存取 → web/background-store.js
// 這一支只負責把畫布、觸控與 DOM 接起來，自己不做算式也不做判斷。

import {
  computeCropRect,
  coverCropSize,
  cropSlack,
  shiftOffset,
  clampZoom,
  rezoomOffset,
  outputSize
} from '../core/crop.js'
import {
  describeBytes,
  validateLabel,
  validateBytes,
  createRecord,
  createRecordId,
  sortByNewest,
  findRecord,
  resolveSelection,
  canApply,
  canDelete,
  removeRecord,
  resolveMaxZoom
} from '../core/background.js'
import {
  isStoreSupported,
  putBackground,
  listBackgrounds,
  readBackground,
  deleteBackground
} from './background-store.js'

// 常數定義
const SETTINGS_URL = new URL('../config/background.json', import.meta.url) // 一律相對網址，不對外部服務發請求
const CURRENT_STORAGE_KEY = 'companion:background'
const OPEN_CLASS = 'is-open'
const PICKED_CLASS = 'is-picked'
const ARMED_CLASS = 'is-armed'
const HAS_BACKGROUND_CLASS = 'has-background'
const CARD_CLASS = 'pick-card'
const CARD_THUMB_CLASS = 'pick-card-thumb'
const CARD_TEXT_CLASS = 'pick-card-text'
const CARD_LABEL_CLASS = 'pick-card-label'
const CARD_META_CLASS = 'pick-card-meta'
const ARIA_HIDDEN = 'aria-hidden'
const ARIA_PRESSED = 'aria-pressed'
const TRUE_TEXT = 'true'
const FALSE_TEXT = 'false'
const EMPTY_TEXT = ''
const DIV_TAG = 'div'
const IMAGE_TAG = 'img'
const PARAGRAPH_TAG = 'p'
const BUTTON_TAG = 'button'
const BUTTON_TYPE = 'button'
const CANVAS_TAG = 'canvas'
const CANVAS_CONTEXT = '2d'
const HIDDEN_STYLE = 'hidden'
const TRANSPARENT_STYLE = '0'
const ERROR_JOIN = '\n'
const CENTER_OFFSET = 0.5
const PREVIEW_HEIGHT_CSS = 220 // 預覽框的高度（CSS 像素），寬度由畫面比例算出來
const PREVIEW_SCALE = 2 // 畫布內部再放大一倍，縮圖才不會糊
const DEFAULT_QUALITY = 0.8
const FALLBACK_ASPECT = 0.5
const MIN_SLACK_PX = 1 // 還能滑不到一個像素就當作滑不動
const ZOOM_MIN = 1 // 不放大，也就是剛好蓋滿畫面的那一種切法
const ZOOM_DECIMALS = 1
const ZOOM_STEP_ATTR = '0.01'
const WHEEL_TO_ZOOM = 0.0015 // 滾輪滑一格對應多少倍率變化
const PINCH_POINTERS = 2 // 兩根手指才算捏合
const DELETE_ARM_MS = 5000 // 進入待確認狀態之後，這麼久沒動作就自己還原
const HALF = 0.5
const FULL_ALPHA = 1
const CHARACTER_ALPHA = 0.95 // 角色畫得幾乎不透明，才看得出臉會不會被背景吃掉
const OVERLAY_LINE = 'rgba(27, 25, 23, 0.55)' // 對話框與輸入列的淡框，對應 --ink
const OVERLAY_FILL = 'rgba(255, 255, 255, 0.32)'
const OVERLAY_LINE_WIDTH = 2
const OVERLAY_DASH = [6, 5]
const NO_DASH = []
const OVERLAY_RADIUS = 10
const NOT_CHOSEN_TEXT = '還沒選圖片'
const PREVIEW_NOTE_TEXT = '縮圖上的角色與兩個虛線框（對話框、輸入列）都是實際位置。'
const DRAG_HINT_TEXT = '按住上面的縮圖左右（或上下）滑動，就能決定要留下哪一塊。'
const NO_SLACK_HINT_TEXT = '這張圖的比例剛好跟畫面一樣，不用滑動就已經是完整的樣子。'
const ZOOM_HINT_TEXT = '拉下面的滑桿（手機也可以雙指捏合、桌機可以滾滾輪）決定要放多大。'
const NO_ZOOM_HINT_TEXT = '這張圖的解析度不夠，再放大就會糊掉，所以這一張不給放大。'
const NOT_SUPPORTED_TEXT = '這個瀏覽器不支援 IndexedDB，背景圖存不起來。'
const READ_FAILED_TEXT = '這個檔案讀不出來，換一張圖試試看。'
const NO_IMAGE_TEXT = '先選一張圖片再按確認。'
const ENCODE_FAILED_TEXT = '裁切失敗，等一下再試一次。'
const SAVE_FAILED_TEXT = '存不進瀏覽器，可能是空間滿了。'
const LIST_FAILED_TEXT = '讀不到存過的背景圖，等一下再試一次。'
const EMPTY_LIST_TEXT = '還沒有存過的背景圖。先用上傳背景那個按鈕存一張吧。'
const LIST_NOTE_TEXT = '點一下要換上的那一張，選好之後再按「選擇」；不要的可以按「刪除」。'
const APPLY_FAILED_TEXT = '這一張讀不出來了，換一張試試看。'
const DELETE_TEXT = '刪除'
const DELETE_CONFIRM_TEXT = '再按一次刪除'
const DELETE_ARM_NOTE_TEXT = '刪掉就找不回來了。確定的話再按一次那顆按鈕；不想刪就放著別動。'
const DELETED_NOTE_TEXT = '已經刪掉了。'
const DELETED_CURRENT_NOTE_TEXT = '已經刪掉了。那張正是現在用的，所以畫面先回到預設底色。'
const DELETE_FAILED_TEXT = '刪不掉，等一下再試一次。'

// 畫面元素
const newOpenButton = document.getElementById('bg-new-open')
const newElement = document.getElementById('bg-new')
const newCloseButton = document.getElementById('bg-new-close')
const fileInput = document.getElementById('bg-file')
const fileNameElement = document.getElementById('bg-file-name')
const labelInput = document.getElementById('bg-label')
const previewElement = document.getElementById('bg-preview')
const zoomInput = document.getElementById('bg-zoom')
const zoomValueElement = document.getElementById('bg-zoom-value')
const newHintElement = document.getElementById('bg-new-hint')
const newErrorsElement = document.getElementById('bg-new-errors')
const cancelButton = document.getElementById('bg-cancel')
const confirmButton = document.getElementById('bg-confirm')
const listOpenButton = document.getElementById('bg-list-open')
const listElement = document.getElementById('bg-list')
const listCloseButton = document.getElementById('bg-list-close')
const listBodyElement = document.getElementById('bg-list-body')
const listNoteElement = document.getElementById('bg-list-note')
const applyButton = document.getElementById('bg-apply')
const deleteButton = document.getElementById('bg-delete')
// 預覽要疊出角色與介面的位置，所以得量這幾個現成的元素；一律只讀，不動它們的狀態
const characterElement = document.getElementById('character')
const stageElement = document.getElementById('stage')
const dialogElement = document.getElementById('dialog')
const composerElement = document.getElementById('composer')

// 執行期狀態集中在這裡
const state = {
  settings: null,
  image: null, // 使用者選的原圖
  sourceUrl: EMPTY_TEXT, // 原圖的 object URL，換圖時要記得收回去
  offsetX: CENTER_OFFSET,
  offsetY: CENTER_OFFSET,
  aspect: FALLBACK_ASPECT,
  zoom: ZOOM_MIN,
  maxZoom: ZOOM_MIN, // 這張圖能放大到幾倍，每換一張圖都重算
  dragging: false,
  lastPoint: null,
  pointers: new Map(), // 目前壓在預覽框上的手指，兩根就當成捏合
  pinchDistance: 0, // 捏合開始時兩指的距離
  pinchZoom: ZOOM_MIN, // 捏合開始時的倍率
  frame: 0, // 排隊中的重畫，同一個影格只畫一次
  records: [],
  selectedId: null,
  thumbUrls: [], // 清單縮圖的 object URL，重繪前一律先收回去
  appliedUrl: EMPTY_TEXT, // 目前貼在畫面上的那一張，換掉時同樣要收回去
  appliedId: EMPTY_TEXT,
  armedId: null, // 刪除待確認中的那一筆
  armTimer: 0,
  busy: false
}

// 功能函數定義

// 背景要裁成什麼比例，由目前的畫面決定；這樣切出來就是滿版不留白的那一塊
const viewportAspect = () => {
  const width = document.documentElement.clientWidth
  const height = document.documentElement.clientHeight
  return width > 0 && height > 0 ? width / height : FALLBACK_ASPECT
}

const setErrors = (element, errors) => {
  element.textContent = Array.isArray(errors) ? errors.join(ERROR_JOIN) : String(errors ?? EMPTY_TEXT)
}

const openDrawer = (element) => {
  element.classList.add(OPEN_CLASS)
  element.setAttribute(ARIA_HIDDEN, FALSE_TEXT)
}

const closeDrawer = (element) => {
  element.classList.remove(OPEN_CLASS)
  element.setAttribute(ARIA_HIDDEN, TRUE_TEXT)
}

// 記住現在用的是哪一張，重新整理之後才會自己貼回來
const writeCurrentId = (id) => {
  try {
    window.localStorage.setItem(CURRENT_STORAGE_KEY, id)
  } catch (error) {
    console.warn('目前的背景圖記不起來，重新整理之後會回到預設底色。')
  }
}

const readCurrentId = () => {
  try {
    return window.localStorage.getItem(CURRENT_STORAGE_KEY) ?? EMPTY_TEXT
  } catch (error) {
    console.warn('背景圖的紀錄讀不到，先用預設底色。')
    return EMPTY_TEXT
  }
}

const clearCurrentId = () => {
  try {
    window.localStorage.removeItem(CURRENT_STORAGE_KEY)
  } catch (error) {
    console.warn('背景圖的紀錄清不掉。')
  }
}

// 把某一張貼到畫面上。舊的 object URL 一定要收回去，不然換幾次就漏幾份記憶體。
const applyBackground = (blob, id) => {
  const url = URL.createObjectURL(blob)
  if (state.appliedUrl.length > 0) URL.revokeObjectURL(state.appliedUrl)
  state.appliedUrl = url
  state.appliedId = id
  document.body.style.backgroundImage = `url("${url}")`
  document.body.classList.add(HAS_BACKGROUND_CLASS)
  writeCurrentId(id)
}

// 把背景整個撤掉，回到預設米色底。刪到正在用的那一張時走這裡。
const clearBackground = () => {
  if (state.appliedUrl.length > 0) URL.revokeObjectURL(state.appliedUrl)
  state.appliedUrl = EMPTY_TEXT
  state.appliedId = EMPTY_TEXT
  document.body.style.backgroundImage = EMPTY_TEXT
  document.body.classList.remove(HAS_BACKGROUND_CLASS)
  clearCurrentId()
}

// 預覽畫布的大小：高度固定，寬度由畫面比例決定，所以看到的形狀就是之後貼上去的形狀
const sizePreview = () => {
  const cssWidth = Math.max(1, Math.round(PREVIEW_HEIGHT_CSS * state.aspect))
  previewElement.style.width = `${cssWidth}px`
  previewElement.style.height = `${PREVIEW_HEIGHT_CSS}px`
  previewElement.width = cssWidth * PREVIEW_SCALE
  previewElement.height = PREVIEW_HEIGHT_CSS * PREVIEW_SCALE
}

// 目前的裁切矩形。滑動位置、倍率與畫面比例都在 state 裡，這裡只是少寫幾次同一串參數。
const currentCropRect = () =>
  computeCropRect(
    state.image.naturalWidth,
    state.image.naturalHeight,
    state.aspect,
    state.offsetX,
    state.offsetY,
    state.zoom
  )

// 圓角矩形的路徑。用 arcTo 自己畫，不依賴新版瀏覽器才有的 roundRect。
const traceRoundedRect = (context, box, radius) => {
  const limit = Math.min(radius, box.width * HALF, box.height * HALF)
  const right = box.x + box.width
  const bottom = box.y + box.height
  context.beginPath()
  context.moveTo(box.x + limit, box.y)
  context.arcTo(right, box.y, right, bottom, limit)
  context.arcTo(right, bottom, box.x, bottom, limit)
  context.arcTo(box.x, bottom, box.x, box.y, limit)
  context.arcTo(box.x, box.y, right, box.y, limit)
  context.closePath()
}

// 把畫面上某個元素的位置換算成預覽畫布上的位置。
// 預覽畫布的形狀本來就是照畫面比例算的，所以一個縮放係數就對得起來。
const toPreviewBox = (element, scale) => {
  const box = element.getBoundingClientRect()
  return { x: box.left * scale, y: box.top * scale, width: box.width * scale, height: box.height * scale }
}

// 目前真的看得見的角色圖層。臉部有兩張輪替，只有不透明那一張要畫。
// 這裡純粹讀畫面上現成的元素，所以不必也不該認識表情有哪幾種。
const visibleLayers = () =>
  [...characterElement.querySelectorAll(IMAGE_TAG)].filter(
    (image) =>
      image.style.visibility !== HIDDEN_STYLE &&
      image.style.opacity !== TRANSPARENT_STYLE &&
      image.complete &&
      image.naturalWidth > 0
  )

// 照 .layer 的規則（等比縮到塞得進去、水平置中、底部對齊）把一張圖畫進某個方框。
// 跟 style.css 用同一套算式，預覽裡的角色位置才會是實際位置，而不是估的。
const drawContained = (context, image, box) => {
  const scale = Math.min(box.width / image.naturalWidth, box.height / image.naturalHeight)
  const width = image.naturalWidth * scale
  const height = image.naturalHeight * scale
  context.drawImage(image, box.x + (box.width - width) * HALF, box.y + box.height - height, width, height)
}

// 疊上角色與介面的位置。這一層只畫在預覽框裡；存檔走的是另一張乾淨的畫布，
// 所以不管預覽上疊了什麼，存下來的背景圖都不會被畫到。
const drawOverlay = (context) => {
  const viewportWidth = document.documentElement.clientWidth
  if (viewportWidth <= 0) return
  const scale = previewElement.width / viewportWidth
  context.save()
  context.globalAlpha = CHARACTER_ALPHA
  const stageBox = toPreviewBox(stageElement, scale)
  visibleLayers().forEach((image) => drawContained(context, image, stageBox))
  context.globalAlpha = FULL_ALPHA
  context.lineWidth = OVERLAY_LINE_WIDTH
  context.strokeStyle = OVERLAY_LINE
  context.fillStyle = OVERLAY_FILL
  context.setLineDash(OVERLAY_DASH)
  const frames = [dialogElement, composerElement]
  frames.forEach((element) => {
    traceRoundedRect(context, toPreviewBox(element, scale), OVERLAY_RADIUS)
    context.fill()
    context.stroke()
  })
  context.setLineDash(NO_DASH)
  context.restore()
}

// 把目前選到的那一塊畫進預覽框，再疊上角色與介面的位置
const drawPreview = () => {
  const context = previewElement.getContext(CANVAS_CONTEXT)
  context.clearRect(0, 0, previewElement.width, previewElement.height)
  if (state.image === null) return
  const rect = currentCropRect()
  if (rect.width === 0) return
  context.drawImage(state.image, rect.x, rect.y, rect.width, rect.height, 0, 0, previewElement.width, previewElement.height)
  drawOverlay(context)
}

// 重畫一律排到下一個影格：捏合與拖曳會連續丟出很多事件，同一個影格只需要畫一次
const requestPaint = () => {
  if (state.frame !== 0) return
  state.frame = window.requestAnimationFrame(() => {
    state.frame = 0
    drawPreview()
  })
}

// 這張圖還有沒有得滑、還能不能放大；不能的話就明講，免得使用者一直試
const updateDragHint = () => {
  if (state.image === null) {
    newHintElement.textContent = EMPTY_TEXT
    return
  }
  const slack = cropSlack(state.image.naturalWidth, state.image.naturalHeight, state.aspect, state.zoom)
  const movable = slack.x > MIN_SLACK_PX || slack.y > MIN_SLACK_PX
  const parts = [movable ? DRAG_HINT_TEXT : NO_SLACK_HINT_TEXT]
  parts.push(state.maxZoom > ZOOM_MIN ? ZOOM_HINT_TEXT : NO_ZOOM_HINT_TEXT)
  parts.push(PREVIEW_NOTE_TEXT)
  newHintElement.textContent = parts.join(EMPTY_TEXT)
}

const refreshZoomLabel = () => {
  zoomValueElement.textContent = `${state.zoom.toFixed(ZOOM_DECIMALS)}×`
}

// 這張圖能放大到幾倍要重算：上限同時取決於設定檔與這張圖的解析度，換一張圖答案就不一樣。
// 算出來等於 1 就代表這張不能放大，滑桿直接停用，不留下拉了沒反應的控制項。
const refreshZoomRange = () => {
  if (state.image === null) {
    state.maxZoom = ZOOM_MIN
    state.zoom = ZOOM_MIN
  } else {
    const cover = coverCropSize(state.image.naturalWidth, state.image.naturalHeight, state.aspect, ZOOM_MIN)
    state.maxZoom = resolveMaxZoom(cover.width, state.settings)
    state.zoom = clampZoom(state.zoom, state.maxZoom)
  }
  zoomInput.min = String(ZOOM_MIN)
  zoomInput.max = String(state.maxZoom)
  zoomInput.step = ZOOM_STEP_ATTR
  zoomInput.value = String(state.zoom)
  zoomInput.disabled = state.image === null || state.maxZoom <= ZOOM_MIN
  refreshZoomLabel()
}

// 換倍率。裁切框變大變小之後，滑動位置要跟著改，原本在正中央的那一點才會留在正中央；
// 少了 rezoomOffset 這一步，放大時畫面會自己往邊上飄，使用者得再滑一次拉回來。
const setZoom = (next) => {
  if (state.image === null) return
  const wanted = clampZoom(next, state.maxZoom)
  if (wanted === state.zoom) return
  const before = coverCropSize(state.image.naturalWidth, state.image.naturalHeight, state.aspect, state.zoom)
  const after = coverCropSize(state.image.naturalWidth, state.image.naturalHeight, state.aspect, wanted)
  state.offsetX = rezoomOffset(state.image.naturalWidth, before.width, after.width, state.offsetX)
  state.offsetY = rezoomOffset(state.image.naturalHeight, before.height, after.height, state.offsetY)
  state.zoom = wanted
  zoomInput.value = String(wanted)
  refreshZoomLabel()
  updateDragHint()
  requestPaint()
}

const handleZoomInput = () => setZoom(Number(zoomInput.value))

// 滾輪：桌機上最直覺的縮放方式。乘上指數而不是加減固定值，
// 往回滾就會精確回到原本的倍率，不會越滾越偏。
const handleWheel = (event) => {
  if (state.image === null || state.maxZoom <= ZOOM_MIN) return
  event.preventDefault() // 縱向滾動要留給縮放用，不能讓抽屜跟著捲
  setZoom(state.zoom * Math.exp(-event.deltaY * WHEEL_TO_ZOOM))
}

// 兩根手指現在距離多遠。少於兩根就回 0，呼叫端據此判斷這不是捏合。
const pinchSpan = () => {
  const points = [...state.pointers.values()]
  if (points.length < PINCH_POINTERS) return 0
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y)
}

// 手指移動一個 CSS 像素，等於在原圖上走幾個像素
const sourcePerCssPixel = () => {
  const rect = currentCropRect()
  const cssWidth = previewElement.getBoundingClientRect().width
  return cssWidth > 0 ? rect.width / cssWidth : 0
}

// 抓住這根手指，滑出預覽框外也還收得到它的移動。
// 抓不到就算了：手指停在框內時照樣拖得動，不值得為此中斷整個手勢。
const capturePointer = (pointerId) => {
  try {
    previewElement.setPointerCapture(pointerId)
  } catch (error) {
    console.warn('這根手指抓不住，滑出預覽框外就會停下來。')
  }
}

const beginDrag = (event) => {
  if (state.image === null) return
  state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  capturePointer(event.pointerId)
  // 第二根手指落下：從拖曳切成捏合，並記住起點，倍率才不會跳一下
  if (state.pointers.size >= PINCH_POINTERS) {
    state.dragging = false
    state.lastPoint = null
    state.pinchDistance = pinchSpan()
    state.pinchZoom = state.zoom
    return
  }
  state.dragging = true
  state.lastPoint = { x: event.clientX, y: event.clientY }
}

// 手指往右滑等於想看到左邊的內容，所以位移要反過來加。
// 兩根手指則一律當成捏合，這時候不平移，免得畫面同時縮放又飄走。
const moveDrag = (event) => {
  if (state.image === null) return
  if (state.pointers.has(event.pointerId)) state.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (state.pointers.size >= PINCH_POINTERS) {
    const span = pinchSpan()
    if (state.pinchDistance > 0 && span > 0) setZoom(state.pinchZoom * (span / state.pinchDistance))
    return
  }
  if (!state.dragging || state.lastPoint === null) return
  const ratio = sourcePerCssPixel()
  const slack = cropSlack(state.image.naturalWidth, state.image.naturalHeight, state.aspect, state.zoom)
  state.offsetX = shiftOffset(state.offsetX, -(event.clientX - state.lastPoint.x) * ratio, slack.x)
  state.offsetY = shiftOffset(state.offsetY, -(event.clientY - state.lastPoint.y) * ratio, slack.y)
  state.lastPoint = { x: event.clientX, y: event.clientY }
  requestPaint()
}

// 放開一根手指。從兩根變一根時要把剩下那根的位置當成新的拖曳起點，
// 否則接下來第一次移動會被算成一大段位移，畫面瞬間跳掉。
const endDrag = (event) => {
  state.pointers.delete(event.pointerId)
  state.pinchDistance = 0
  const remaining = [...state.pointers.values()]
  if (remaining.length === 1) {
    state.dragging = true
    state.lastPoint = { ...remaining[0] }
    return
  }
  state.dragging = false
  state.lastPoint = null
}

// 換掉正在編輯的原圖，順便把上一張的 object URL 收回去
const replaceSource = (image, url) => {
  if (state.sourceUrl.length > 0) URL.revokeObjectURL(state.sourceUrl)
  state.image = image
  state.sourceUrl = url
  state.offsetX = CENTER_OFFSET
  state.offsetY = CENTER_OFFSET
  state.zoom = ZOOM_MIN // 換圖一律從不放大開始，上一張拉到哪不帶過來
}

// 讀進使用者選的檔案。讀不出來就當作沒選，不留下半途的狀態。
const loadFile = (file) => {
  const url = URL.createObjectURL(file)
  const image = document.createElement(IMAGE_TAG)
  image.addEventListener('load', () => {
    replaceSource(image, url)
    state.aspect = viewportAspect()
    sizePreview()
    refreshZoomRange()
    drawPreview()
    updateDragHint()
    setErrors(newErrorsElement, EMPTY_TEXT)
  })
  image.addEventListener('error', () => {
    URL.revokeObjectURL(url)
    setErrors(newErrorsElement, [READ_FAILED_TEXT])
  })
  image.src = url
}

const handleFileChange = () => {
  const file = fileInput.files?.[0]
  if (!file) return
  fileNameElement.textContent = file.name
  loadFile(file)
}

// toBlob 是回呼式的，包成 Promise 之後裁切流程才寫得成一條直線
const toBlob = (surface, mimeType, quality) =>
  new Promise((resolve) => surface.toBlob((blob) => resolve(blob), mimeType, quality))

// 把某一塊畫進一張新畫布，回傳那張畫布。
// 刻意不重用預覽用的那一張：預覽上疊了角色與介面的位置，那些絕不能被存進去。
const renderCrop = (rect, width, height) => {
  const surface = document.createElement(CANVAS_TAG)
  surface.width = width
  surface.height = height
  surface.getContext(CANVAS_CONTEXT).drawImage(state.image, rect.x, rect.y, rect.width, rect.height, 0, 0, width, height)
  return surface
}

// 依序降低品質，直到檔案落在單張上限之內。
// 一路降到最後仍然過大就把最小的那一份交出去，讓 validateBytes 去講清楚差多少。
const encodeWithinLimit = async (surface) => {
  const configured = state.settings?.qualitySteps
  const steps = Array.isArray(configured) && configured.length > 0 ? configured : [DEFAULT_QUALITY]
  let smallest = null
  for (const quality of steps) {
    const blob = await toBlob(surface, state.settings?.mimeType, quality)
    if (!blob) continue
    smallest = blob
    if (validateBytes(blob.size, state.settings).ok) return blob
  }
  return smallest
}

// 清空這一輪的上傳狀態；取消與存檔成功都走這裡，抽屜下次打開一定是乾淨的
const resetUpload = () => {
  if (state.sourceUrl.length > 0) URL.revokeObjectURL(state.sourceUrl)
  state.image = null
  state.sourceUrl = EMPTY_TEXT
  state.offsetX = CENTER_OFFSET
  state.offsetY = CENTER_OFFSET
  state.pointers.clear()
  state.dragging = false
  state.lastPoint = null
  fileInput.value = EMPTY_TEXT
  fileNameElement.textContent = NOT_CHOSEN_TEXT
  labelInput.value = EMPTY_TEXT
  newHintElement.textContent = EMPTY_TEXT
  setErrors(newErrorsElement, EMPTY_TEXT)
  refreshZoomRange()
  drawPreview()
}

// 取消：這一次上傳整個作廢，什麼都不存
const cancelUpload = () => {
  resetUpload()
  closeDrawer(newElement)
}

// 確認：驗說明文字 → 裁切 → 壓到單張上限以內 → 存進 IndexedDB → 立刻換上
const confirmUpload = async () => {
  if (state.busy) return
  setErrors(newErrorsElement, EMPTY_TEXT)
  if (state.image === null) {
    setErrors(newErrorsElement, [NO_IMAGE_TEXT])
    return
  }
  const label = validateLabel(labelInput.value, state.settings)
  if (!label.ok) {
    setErrors(newErrorsElement, label.errors)
    return
  }
  state.busy = true
  confirmButton.disabled = true
  try {
    const rect = currentCropRect()
    const full = outputSize(rect.width, rect.height, state.settings?.maxOutputWidth)
    const image = await encodeWithinLimit(renderCrop(rect, full.width, full.height))
    if (!image) {
      setErrors(newErrorsElement, [ENCODE_FAILED_TEXT])
      return
    }
    const size = validateBytes(image.size, state.settings)
    if (!size.ok) {
      setErrors(newErrorsElement, size.errors)
      return
    }
    const small = outputSize(rect.width, rect.height, state.settings?.thumbnailWidth)
    const thumbnail = await toBlob(
      renderCrop(rect, small.width, small.height),
      state.settings?.mimeType,
      state.settings?.thumbnailQuality
    )
    const createdAt = Date.now()
    const record = createRecord({
      id: createRecordId(createdAt, Math.random()),
      label: label.label,
      createdAt,
      bytes: image.size,
      width: full.width,
      height: full.height
    })
    await putBackground(state.settings, { ...record, image, thumbnail: thumbnail ?? image })
    applyBackground(image, record.id)
    resetUpload()
    closeDrawer(newElement)
  } catch (error) {
    console.warn('背景圖存檔失敗。')
    setErrors(newErrorsElement, [SAVE_FAILED_TEXT])
  } finally {
    state.busy = false
    confirmButton.disabled = false
  }
}

// 打開之前先量一次畫面比例：轉了螢幕方向之後，裁切框要跟著換形狀
const openUpload = () => {
  state.aspect = viewportAspect()
  sizePreview()
  refreshZoomRange()
  drawPreview()
  updateDragHint()
  openDrawer(newElement)
}

// 只有真的選到一張，「選擇」與「刪除」才按得下去
const refreshListButtons = () => {
  applyButton.disabled = !canApply(state.records, state.selectedId)
  deleteButton.disabled = !canDelete(state.records, state.selectedId)
}

// 解除刪除的待確認狀態，按鈕回到原本的樣子
const disarmDelete = () => {
  if (state.armTimer !== 0) window.clearTimeout(state.armTimer)
  state.armTimer = 0
  state.armedId = null
  deleteButton.classList.remove(ARMED_CLASS)
  deleteButton.textContent = DELETE_TEXT
}

// 縮圖的 object URL 一律在重繪清單前收回去，不然每開一次清單就漏一批
const releaseThumbnails = () => {
  state.thumbUrls.forEach((url) => URL.revokeObjectURL(url))
  state.thumbUrls = []
}

// 一張卡片：縮圖在左、說明與大小在右。整張卡片就是按鈕，手機上比較好點。
const createCard = (record) => {
  const card = document.createElement(BUTTON_TAG)
  card.type = BUTTON_TYPE
  const picked = record.id === state.selectedId
  card.className = picked ? `${CARD_CLASS} ${PICKED_CLASS}` : CARD_CLASS
  card.setAttribute(ARIA_PRESSED, picked ? TRUE_TEXT : FALSE_TEXT)
  const thumb = document.createElement(IMAGE_TAG)
  thumb.className = CARD_THUMB_CLASS
  thumb.alt = EMPTY_TEXT // 說明文字就在旁邊，縮圖不必再讀一次
  if (record.thumbnail) {
    const url = URL.createObjectURL(record.thumbnail)
    state.thumbUrls.push(url)
    thumb.src = url
  }
  const text = document.createElement(DIV_TAG)
  text.className = CARD_TEXT_CLASS
  const label = document.createElement(PARAGRAPH_TAG)
  label.className = CARD_LABEL_CLASS
  // 一律走 textContent，使用者打的說明不會被當成標記解讀
  label.textContent = record.label
  const meta = document.createElement(PARAGRAPH_TAG)
  meta.className = CARD_META_CLASS
  meta.textContent = `${record.width} × ${record.height}．${describeBytes(record.bytes)}`
  text.appendChild(label)
  text.appendChild(meta)
  card.appendChild(thumb)
  card.appendChild(text)
  card.addEventListener('click', () => {
    state.selectedId = record.id
    // 換了選取就把待確認的刪除放掉，免得按下去刪到的不是剛剛想刪的那一張
    if (state.armedId !== null) {
      disarmDelete()
      listNoteElement.textContent = LIST_NOTE_TEXT
    }
    renderList()
  })
  return card
}

const renderList = () => {
  listBodyElement.textContent = EMPTY_TEXT
  releaseThumbnails()
  state.selectedId = resolveSelection(state.records, state.selectedId)
  if (state.records.length === 0) {
    const hint = document.createElement(PARAGRAPH_TAG)
    hint.className = CARD_META_CLASS
    hint.textContent = EMPTY_LIST_TEXT
    listBodyElement.appendChild(hint)
    refreshListButtons()
    return
  }
  state.records.forEach((record) => listBodyElement.appendChild(createCard(record)))
  refreshListButtons()
}

// 每次打開都重新讀一次，清單不會停在上一次的內容
const openList = async () => {
  openDrawer(listElement)
  disarmDelete()
  listNoteElement.textContent = LIST_NOTE_TEXT
  try {
    state.records = sortByNewest(await listBackgrounds(state.settings))
  } catch (error) {
    console.warn('背景圖清單讀取失敗。')
    listNoteElement.textContent = LIST_FAILED_TEXT
    state.records = []
  }
  // 預設就停在目前正在用的那一張，使用者一眼看得出現在是哪一張
  state.selectedId = resolveSelection(state.records, readCurrentId())
  renderList()
}

// 右上角的 ✕ 是取消：關起來就好，背景維持原樣
const cancelList = () => {
  disarmDelete()
  closeDrawer(listElement)
}

const applySelected = async () => {
  const record = findRecord(state.records, state.selectedId)
  if (record === null) return
  disarmDelete()
  try {
    const row = await readBackground(state.settings, record.id)
    if (!row?.image) {
      listNoteElement.textContent = APPLY_FAILED_TEXT
      return
    }
    applyBackground(row.image, record.id)
    closeDrawer(listElement)
  } catch (error) {
    console.warn('背景圖套用失敗。')
    listNoteElement.textContent = APPLY_FAILED_TEXT
  }
}

// 刪除是兩段式的：第一次按只是把按鈕換成確認字樣，第二次按才真的刪。
// 不另開對話框，就用這顆按鈕自己把「刪掉就找不回來」講清楚；
// 放著不動幾秒就自己還原，免得下次打開時它還停在待確認狀態。
const deleteSelected = async () => {
  const record = findRecord(state.records, state.selectedId)
  if (record === null) return
  if (state.armedId !== record.id) {
    disarmDelete()
    state.armedId = record.id
    deleteButton.classList.add(ARMED_CLASS)
    deleteButton.textContent = DELETE_CONFIRM_TEXT
    listNoteElement.textContent = DELETE_ARM_NOTE_TEXT
    state.armTimer = window.setTimeout(() => {
      disarmDelete()
      listNoteElement.textContent = LIST_NOTE_TEXT
    }, DELETE_ARM_MS)
    return
  }
  disarmDelete()
  try {
    await deleteBackground(state.settings, record.id)
  } catch (error) {
    console.warn('背景圖刪除失敗。')
    listNoteElement.textContent = DELETE_FAILED_TEXT
    return
  }
  // 刪到的正好是正在用的那一張：畫面立刻退回預設底色，不留下一張已經不存在的背景
  const wasApplied = state.appliedId === record.id
  if (wasApplied) clearBackground()
  state.records = removeRecord(state.records, record.id)
  state.selectedId = resolveSelection(state.records, readCurrentId())
  renderList()
  listNoteElement.textContent = wasApplied ? DELETED_CURRENT_NOTE_TEXT : DELETED_NOTE_TEXT
}

// 重新整理之後把上次那一張貼回來；那一筆已經不在了就把紀錄清掉，回到預設底色
const restoreCurrent = async () => {
  const id = readCurrentId()
  if (id.length === 0) return
  try {
    const row = await readBackground(state.settings, id)
    if (!row?.image) {
      clearCurrentId()
      return
    }
    applyBackground(row.image, id)
  } catch (error) {
    console.warn('上次的背景圖讀不回來，先用預設底色。')
  }
}

// 這個瀏覽器不支援就把兩個按鈕收起來，不留下按了沒反應的入口
const disableFeature = () => {
  newOpenButton.hidden = true
  listOpenButton.hidden = true
  console.warn(NOT_SUPPORTED_TEXT)
}

// 啟動：載入設定 → 接上兩個抽屜 → 把上次用的那張貼回來
export const setupBackground = async () => {
  if (!isStoreSupported()) {
    disableFeature()
    return
  }
  try {
    const response = await fetch(SETTINGS_URL)
    state.settings = await response.json()
  } catch (error) {
    console.warn('背景圖設定載入失敗，這兩個按鈕先收起來。')
    disableFeature()
    return
  }
  state.aspect = viewportAspect()
  resetUpload()
  newOpenButton.addEventListener('click', openUpload)
  newCloseButton.addEventListener('click', cancelUpload)
  cancelButton.addEventListener('click', cancelUpload)
  confirmButton.addEventListener('click', confirmUpload)
  fileInput.addEventListener('change', handleFileChange)
  previewElement.addEventListener('pointerdown', beginDrag)
  previewElement.addEventListener('pointermove', moveDrag)
  previewElement.addEventListener('pointerup', endDrag)
  previewElement.addEventListener('pointercancel', endDrag)
  // 滾輪要能擋掉預設的捲動，所以不能是被動監聽
  previewElement.addEventListener('wheel', handleWheel, { passive: false })
  zoomInput.addEventListener('input', handleZoomInput)
  listOpenButton.addEventListener('click', openList)
  listCloseButton.addEventListener('click', cancelList)
  applyButton.addEventListener('click', applySelected)
  deleteButton.addEventListener('click', deleteSelected)
  await restoreCurrent()
}
