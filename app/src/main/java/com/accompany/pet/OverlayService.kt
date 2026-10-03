package com.accompany.pet

import android.Manifest
import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.os.IBinder
import android.os.SystemClock
import android.view.Gravity
import android.view.MotionEvent
import android.view.WindowManager
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import androidx.core.content.ContextCompat
import com.accompany.pet.core.FilePositionStore
import com.accompany.pet.core.INITIAL_STATE
import com.accompany.pet.core.PetEvent
import com.accompany.pet.core.PetState
import com.accompany.pet.core.Point
import com.accompany.pet.core.RenderState
import com.accompany.pet.core.Size
import com.accompany.pet.core.clampInScreen
import com.accompany.pet.core.initialPosition
import com.accompany.pet.core.permission.MIC_DENIED_MESSAGE
import com.accompany.pet.core.reduce
import com.accompany.pet.core.snapToEdge
import java.io.ByteArrayInputStream
import kotlin.math.abs

// 常數定義
const val ACTION_STOP = "com.accompany.pet.STOP"     // 通知「停止」按鈕的動作
const val ACTION_APPLY_SETTINGS = "com.accompany.pet.APPLY_SETTINGS"  // 主畫面改了設定，請服務重新套用
const val PET_WIDTH_DP = 96                           // 角色寬
const val PET_HEIGHT_DP = 108                         // 角色高
const val BUBBLE_WIDTH_DP = 164                       // 泡泡寬（含間距）
const val TAP_SLOP_PX = 10                            // 移動小於這個距離視為點擊
const val CHANNEL_ID = "pet_overlay"                  // 通知頻道
const val NOTIFICATION_ID = 1                         // 常駐通知編號
const val POSITION_FILE = "pet-position.txt"          // 位置檔名
const val LOG_TAG = "AccompanyPet"                    // logcat 標籤
const val ASSET_ROOT = "file:///android_asset/pet/"   // WebView 唯一允許的網址開頭

// 判斷網址是否為角色頁的本機資產（架構約束 A4）
fun isAllowedUrl(url: String): Boolean = url.startsWith(ASSET_ROOT)

// 前景服務：顯示懸浮角色、處理拖曳、螢幕開關與通知
class OverlayService : Service() {

    companion object {
        @Volatile var running = false  // 服務是否執行中（給主畫面判斷要不要刷新）
    }

    private var state: PetState = INITIAL_STATE         // 目前狀態
    private var webView: WebView? = null                 // 角色頁
    private var container: android.widget.FrameLayout? = null  // 懸浮窗根視圖：只裁切大小，WebView 本身寬度固定
    private var params: WindowManager.LayoutParams? = null
    private var petPos = Point(0, 0)                     // 角色本體左上角（不含泡泡）
    private var bubbleShown = false                      // 泡泡是否展開
    private val windowManager by lazy { getSystemService(WINDOW_SERVICE) as WindowManager }
    private val positionStore by lazy { FilePositionStore(java.io.File(filesDir, POSITION_FILE)) }
    private val speech by lazy { SpeechBridge(this, ::showText) }
    private val batteryLogger by lazy { BatteryLogger(this) { state.render == RenderState.PLAYING } }

    // 接收螢幕開關事件
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                Intent.ACTION_SCREEN_OFF -> dispatch(PetEvent.SCREEN_OFF)
                Intent.ACTION_SCREEN_ON -> {
                    ensureOverlay()  // 視窗或渲染程序被系統收掉時重建
                    dispatch(PetEvent.SCREEN_ON)
                }
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    // 收到啟動或停止指令
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_APPLY_SETTINGS) {
            applyWindowLayout()  // 例如耗電測試模式切換時更新「保持螢幕開啟」
            return START_NOT_STICKY
        }
        if (intent?.action == ACTION_STOP) {
            stopPet()
            return START_NOT_STICKY
        }
        if (state.service == com.accompany.pet.core.ServiceState.RUNNING) {
            startInForeground()  // 已在執行：重新宣告前景類型（剛取得麥克風權限時補上 microphone）
            ensureOverlay()
            return START_NOT_STICKY
        }
        startInForeground()
        showOverlay()
        val filter = IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
        }
        ContextCompat.registerReceiver(this, screenReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        dispatch(PetEvent.START)
        running = true
        refreshTile(this)
        batteryLogger.start()  // 螢幕關閉時也不停（S14 優先）
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        if (state.service == com.accompany.pet.core.ServiceState.RUNNING) cleanup()
        super.onDestroy()
    }

    // 套用事件、更新狀態，並同步到網頁
    private fun dispatch(event: PetEvent) {
        state = reduce(state, event)
        val mode = if (state.render == RenderState.PLAYING) "playing" else "paused"
        callJs("window.pet.setRender('$mode')")
    }

    // 停止服務：角色消失、通知移除
    private fun stopPet() {
        if (state.service == com.accompany.pet.core.ServiceState.RUNNING) cleanup()
        dispatch(PetEvent.STOP)
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    // 收掉懸浮窗與接收器
    private fun cleanup() {
        running = false
        refreshTile(this)
        batteryLogger.stop()
        speech.release()
        try {
            unregisterReceiver(screenReceiver)
        } catch (e: IllegalArgumentException) {
            // 尚未註冊，略過
        }
        removeOverlay()
    }

    // 把 WebView 從畫面移除並釋放
    private fun removeOverlay() {
        container?.let {
            try {
                windowManager.removeView(it)
            } catch (e: IllegalArgumentException) {
                // 視窗已被系統移除，略過
            }
        }
        webView?.destroy()
        webView = null
        container = null
        bubbleShown = false
    }

    // 確認懸浮窗還掛在畫面上，不在就重建
    private fun ensureOverlay() {
        val wv = webView
        if (wv != null && container?.isAttachedToWindow == true) return
        android.util.Log.w(LOG_TAG, "懸浮窗不在畫面上，重建")
        removeOverlay()
        showOverlay()
        dispatch(if (isScreenOn()) PetEvent.SCREEN_ON else PetEvent.SCREEN_OFF)
    }

    // 螢幕目前是否亮著
    private fun isScreenOn(): Boolean = (getSystemService(POWER_SERVICE) as android.os.PowerManager).isInteractive

    // 以前景服務身分啟動，並顯示常駐通知
    private fun startInForeground() {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL_ID, "陪伴角色", NotificationManager.IMPORTANCE_LOW))
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, buildNotification(), foregroundTypes())  // Android 10+ 需指定類型
        } else {
            startForeground(NOTIFICATION_ID, buildNotification())
        }
    }

    // 決定前景服務類型：只用 specialUse。收音由系統語音辨識服務在它自己的程序進行，本 App 不需要 microphone 類型
    // （實測 vivo 會在鎖屏時把帶 microphone 類型的前景服務收掉）
    private fun foregroundTypes(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE else 0

    // 建立常駐通知（含「停止」按鈕）
    private fun buildNotification(): Notification {
        val stopIntent = Intent(this, OverlayService::class.java).setAction(ACTION_STOP)
        val stopPending = PendingIntent.getService(this, 0, stopIntent, PendingIntent.FLAG_IMMUTABLE)
        val openPending = PendingIntent.getActivity(
            this, 1, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE,
        )
        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("陪伴角色執行中")
            .setContentText("按「停止」可以收起角色")
            .setContentIntent(openPending)
            .setOngoing(true)
            .addAction(0, "停止", stopPending)
            .build()
    }

    // 是否已取得麥克風權限
    private fun hasMicPermission(): Boolean =
        ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED

    // dp 轉 px
    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    // 角色本體尺寸（px）
    private fun petSize(): Size = Size(dp(PET_WIDTH_DP), dp(PET_HEIGHT_DP))

    // 目前螢幕尺寸（px）
    private fun screenSize(): Size {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val b = windowManager.currentWindowMetrics.bounds
            return Size(b.width(), b.height())
        }
        val m = resources.displayMetrics
        return Size(m.widthPixels, m.heightPixels)
    }

    // 角色是否在螢幕右半邊
    private fun isOnRightSide(): Boolean = petPos.x + petSize().w / 2 >= screenSize().w / 2

    // 建立 WebView 並加到 WindowManager
    @SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
    private fun showOverlay() {
        val pet = petSize()
        petPos = initialPosition(positionStore.load(), pet, screenSize())  // 讀出的位置先 clamp（S08 優先）
        val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        } else {
            @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE
        }
        val lp = WindowManager.LayoutParams(
            pet.w, pet.h, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT,  // 透明背景
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                setCanPlayMoveAnimation(false)  // 關掉系統的視窗移動動畫：展開泡泡、拖曳、吸附都要立即到位，不要滑動
            }
            x = petPos.x
            y = petPos.y
        }
        val wv = WebView(this)
        wv.setBackgroundColor(Color.TRANSPARENT)  // 透明 WebView
        wv.settings.javaScriptEnabled = true
        wv.settings.allowFileAccess = false       // android_asset 不受此設定影響
        wv.settings.allowContentAccess = false
        wv.webViewClient = PetWebViewClient()
        wv.addJavascriptInterface(PetBridge(onTap = ::toggleBubble, onMic = ::onMicPressed), "PetBridge")
        wv.setOnTouchListener(DragHandler())
        wv.loadUrl("file:///android_asset/pet/index.html")
        // WebView 固定為「角色＋泡泡」寬，展開泡泡時只改外層容器大小，WebView 不必重新排版，避免先錯位再彈回
        val box = android.widget.FrameLayout(this)
        box.addView(wv, android.widget.FrameLayout.LayoutParams(pet.w + dp(BUBBLE_WIDTH_DP), pet.h))
        windowManager.addView(box, lp)
        container = box
        webView = wv
        params = lp
        applyWindowLayout()  // 依左右側設定基準點
    }

    // 點角色：展開或收起泡泡，視窗跟著擴張或縮回（A6：只到角色＋泡泡大小）
    private fun toggleBubble() {
        bubbleShown = !bubbleShown
        callJs("window.pet.showBubble($bubbleShown)")
        applyWindowLayout()
    }

    // 依角色位置與泡泡狀態，更新視窗大小與位置
    private fun applyWindowLayout() {
        val lp = params ?: return
        val wv = webView ?: return
        val box = container ?: return
        val pet = petSize()
        val extra = if (bubbleShown) dp(BUBBLE_WIDTH_DP) else 0
        val right = isOnRightSide()
        lp.width = pet.w + extra
        lp.height = pet.h
        // 在右邊時以螢幕右緣為基準：視窗變寬只往左長，右緣與角色位置不動，展開泡泡時角色不會跳
        if (right) {
            lp.gravity = Gravity.TOP or Gravity.END
            lp.x = screenSize().w - petPos.x - pet.w  // 與右緣的距離
        } else {
            lp.gravity = Gravity.TOP or Gravity.START
            lp.x = petPos.x
        }
        lp.y = petPos.y
        // 耗電測試模式：角色在畫面上時保持螢幕亮著（只影響本 App 的懸浮窗，不改系統設定）
        lp.flags = if (isBatteryTestMode(this)) {
            lp.flags or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        } else {
            lp.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON.inv()
        }
        callJs("document.documentElement.dataset.side='${if (right) "right" else "left"}'")
        // WebView 在容器內靠角色那一側對齊，被裁掉的是泡泡那一側
        (wv.layoutParams as android.widget.FrameLayout.LayoutParams).gravity = if (right) Gravity.END else Gravity.START
        wv.requestLayout()
        windowManager.updateViewLayout(box, lp)
    }

    // 按麥克風：沒權限就提示，有權限才啟動語音辨識
    private fun onMicPressed() {
        if (!hasMicPermission()) {
            showText(MIC_DENIED_MESSAGE)  // 沒權限不啟動辨識（S02）
            return
        }
        speech.start()
    }

    // 在泡泡顯示文字（以 JSON 字串跳脫，避免注入）
    fun showText(text: String) {
        callJs("window.pet.showText(${org.json.JSONObject.quote(text)})")
        if (!bubbleShown) toggleBubble()
    }

    // 呼叫網頁上的函式
    private fun callJs(script: String) {
        webView?.evaluateJavascript(script, null)
    }

    // 拖曳處理：移動超過 10px 才算拖曳，否則交給網頁當點擊
    private inner class DragHandler : android.view.View.OnTouchListener {
        private var downX = 0f
        private var downY = 0f
        private var startPos = Point(0, 0)
        private var dragging = false

        // 處理觸控事件
        override fun onTouch(v: android.view.View, e: MotionEvent): Boolean {
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    downX = e.rawX
                    downY = e.rawY
                    startPos = petPos
                    dragging = false
                    return false  // 讓網頁也收到，才能判斷點擊
                }
                MotionEvent.ACTION_MOVE -> {
                    val dx = (e.rawX - downX).toInt()
                    val dy = (e.rawY - downY).toInt()
                    if (!dragging && (abs(dx) >= TAP_SLOP_PX || abs(dy) >= TAP_SLOP_PX)) {
                        dragging = true
                        cancelWebTouch(v)  // 開始拖曳，取消網頁上的點擊
                    }
                    if (!dragging) return false
                    petPos = clampInScreen(Point(startPos.x + dx, startPos.y + dy), petSize(), screenSize())  // 移動中留在畫面內
                    applyWindowLayout()
                    return true
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    if (!dragging) return false  // 點擊交給網頁
                    petPos = snapToEdge(petPos, petSize(), screenSize())  // 放開吸附到邊緣（內含 clamp）
                    positionStore.save(petPos)
                    applyWindowLayout()
                    dragging = false
                    return true
                }
            }
            return false
        }

        // 送一個取消事件給 WebView，避免拖曳結束被當成點擊
        private fun cancelWebTouch(v: android.view.View) {
            val now = SystemClock.uptimeMillis()
            val cancel = MotionEvent.obtain(now, now, MotionEvent.ACTION_CANCEL, 0f, 0f, 0)
            v.onTouchEvent(cancel)
            cancel.recycle()
        }
    }

    // 只允許載入角色頁的本機資產，其他網址一律攔截（A4）
    private inner class PetWebViewClient : WebViewClient() {
        // WebView 渲染程序被系統收掉（常見於螢幕關閉時）：丟掉舊的並重建，不讓服務閃退
        override fun onRenderProcessGone(view: WebView, detail: android.webkit.RenderProcessGoneDetail): Boolean {
            android.util.Log.w(LOG_TAG, "WebView 渲染程序結束，crash=${detail.didCrash()}")
            if (view == webView) {
                removeOverlay()
                showOverlay()
                dispatch(PetEvent.SCREEN_ON.takeIf { isScreenOn() } ?: PetEvent.SCREEN_OFF)
            }
            return true
        }

        // 攔截頁面跳轉
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
            !isAllowedUrl(request.url.toString())

        // 攔截子資源請求（圖片、腳本等）
        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            if (isAllowedUrl(request.url.toString())) return null  // 本機資產照常載入
            return WebResourceResponse("text/plain", "utf-8", 403, "Forbidden", emptyMap(), ByteArrayInputStream(ByteArray(0)))
        }
    }
}
