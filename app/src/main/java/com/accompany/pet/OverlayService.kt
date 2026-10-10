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
import android.os.Handler
import android.os.IBinder
import android.os.Looper
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
import com.accompany.pet.core.chat.CHAT_NOT_SET_MESSAGE
import com.accompany.pet.core.chat.ChatAction
import com.accompany.pet.core.chat.decideChat
import com.accompany.pet.core.clampInScreen
import com.accompany.pet.core.drink.ACTION_CONFIRM
import com.accompany.pet.core.drink.ACTION_HISTORY
import com.accompany.pet.core.drink.ACTION_PREVIEW
import com.accompany.pet.core.drink.ACTION_RESIST
import com.accompany.pet.core.drink.ACTION_SPEAK
import com.accompany.pet.core.drink.ACTION_UNDO
import com.accompany.pet.core.drink.PARSE_PATH
import com.accompany.pet.core.drink.drinkEndpointFor
import com.accompany.pet.core.drink.workerErrorMessage
import org.json.JSONException
import org.json.JSONObject
import com.accompany.pet.core.initialPosition
import com.accompany.pet.core.ma.maPageUrl
import com.accompany.pet.core.permission.MIC_DENIED_MESSAGE
import com.accompany.pet.core.reminder.idleDeadline
import com.accompany.pet.core.reminder.shouldHide
import com.accompany.pet.core.reduce
import com.accompany.pet.core.reminder.IDLE_HIDE_MILLIS
import com.accompany.pet.core.snapToEdge
import com.accompany.pet.core.todoist.TODOIST_VIEWS
import com.accompany.pet.core.todoist.isSendableTodoistAction
import com.accompany.pet.core.todoist.isValidTaskId
import java.io.ByteArrayInputStream
import kotlin.math.abs

// 常數定義
const val ACTION_STOP = "com.accompany.pet.STOP"     // 通知「停止」按鈕的動作
const val ACTION_APPLY_SETTINGS = "com.accompany.pet.APPLY_SETTINGS"  // 主畫面改了設定，請服務重新套用
const val ACTION_PET_STATE_CHANGED = "com.accompany.pet.STATE_CHANGED"  // 角色服務執行狀態變更通知
const val PET_WIDTH_DP = 96                           // 角色寬
const val PET_HEIGHT_DP = 108                         // 角色高
const val BUBBLE_WIDTH_DP = 164                       // 泡泡寬（含間距）
const val BUBBLE_MAX_HEIGHT_DP = 240                  // 泡泡最高（與 index.html 的 #bubble max-height 相同）；展開時視窗長到這個高度
const val TAP_SLOP_PX = 10                            // 移動小於這個距離視為點擊
const val CHANNEL_ID = "pet_overlay"                  // 通知頻道
const val NOTIFICATION_ID = 1                         // 常駐通知編號
const val POSITION_FILE = "pet-position.txt"          // 位置檔名
const val LOG_TAG = "AccompanyPet"                    // logcat 標籤
const val ASSET_ROOT = "file:///android_asset/pet/"   // WebView 唯一允許的網址開頭

const val PARSE_MAX_CHARS = 200                       // 送去解析的文字最多幾字（Worker 超過回 400）
val MA_PUSH_STATUSES = setOf("ok", "failed")          // 盤前均線推播合法狀態清單（M4 契約 push.pushStatuses）

// 頁面載入前暫存的呼叫種類
enum class PendingKind { SCRIPT, TEXT, DRINK, THINKING, TODOIST, MA }

// 判斷網址是否為角色頁的本機資產（架構約束 A4）
fun isAllowedUrl(url: String): Boolean = url.startsWith(ASSET_ROOT)

// 依網頁按鈕動作組送給 Worker 的內容（§4.3）；只取固定欄位，缺欄位或型別不對回 null
fun drinkRequestBody(action: String, obj: JSONObject): String? = when (action) {
    ACTION_CONFIRM, ACTION_PREVIEW -> obj.optJSONObject("draft")?.let { JSONObject().put("draft", it).toString() }
    ACTION_UNDO -> (obj.opt("logId") as? String)?.takeIf { it.isNotBlank() }?.let { JSONObject().put("logId", it).toString() }
    ACTION_RESIST, ACTION_HISTORY -> "{}"
    else -> null
}

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
    private val speech by lazy { SpeechBridge(this, onResult = ::onSpeechResult, onStatus = ::showText) }
    private val batteryLogger by lazy { BatteryLogger(this) { state.render == RenderState.PLAYING } }
    private val idleHandler = Handler(Looper.getMainLooper())  // 閒置收起的計時
    @Volatile private var lastInteractionMillis = 0L           // 最後一次互動的時間（網頁橋接執行緒也會更新）
    private var pageReady = false                              // 角色頁是否載入完成
    private val pending = mutableListOf<Pair<PendingKind, String>>()  // 頁面還沒載入完成時先存著的呼叫，依到達順序
    private val idleCheck = Runnable { checkIdle() }           // 到期檢查

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
        if (!hasOverlayPermission(this)) {
            startInForeground()  // 被要求前景啟動就一定要宣告，再立刻結束；不嘗試繞過權限
            ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
            stopSelf()
            return START_NOT_STICKY
        }
        if (state.service == com.accompany.pet.core.ServiceState.RUNNING) {
            startInForeground()  // 已在執行：重新宣告前景類型（剛取得麥克風權限時補上 microphone）
            ensureOverlay()
            presentIntent(intent)
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
        sendBroadcast(Intent(ACTION_PET_STATE_CHANGED).setPackage(packageName))
        refreshTile(this)
        batteryLogger.start()  // 螢幕關閉時也不停（S14 優先）
        presentIntent(intent)
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
        idleHandler.removeCallbacks(idleCheck)
        running = false
        sendBroadcast(Intent(ACTION_PET_STATE_CHANGED).setPackage(packageName))
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
        pageReady = false  // 暫存的話保留，重建後的頁面載入完成時補送（排隊已清空，不能丟）
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
        wv.addJavascriptInterface(
            PetBridge(
                onTap = ::toggleBubble,
                onMic = ::onMicPressed,
                onChat = ::onChatPressed,
                onDrink = ::onDrinkAction,
                onTodoist = ::onTodoistAction,
                onMa = ::onMaPressed,
            ),
            "PetBridge",
        )
        wv.setOnTouchListener(DragHandler())
        wv.loadUrl("file:///android_asset/pet/index.html")
        // WebView 固定為「角色＋泡泡」寬，展開泡泡時只改外層容器大小，WebView 不必重新排版，避免先錯位再彈回
        val box = android.widget.FrameLayout(this)
        box.addView(wv, android.widget.FrameLayout.LayoutParams(pet.w + dp(BUBBLE_WIDTH_DP), dp(BUBBLE_MAX_HEIGHT_DP)))
        windowManager.addView(box, lp)
        container = box
        webView = wv
        params = lp
        applyWindowLayout()  // 依左右側設定基準點
    }

    // 記下互動時間：懸浮窗任何觸控、點角色、按麥克風都算（M1-S12）
    private fun markInteraction() {
        lastInteractionMillis = System.currentTimeMillis()
    }

    // 依啟動指令決定角色出現後做什麼：每日詢問（帶按鈕）、開始聆聽、Todoist 提醒、盤前均線、或一般的演出與排隊報告
    private fun presentIntent(intent: Intent?) {
        val maJson = intent?.getStringExtra(EXTRA_MA_JSON)
        val maScript = intent?.getStringExtra(EXTRA_MA_SCRIPT)
        val todoistJson = intent?.getStringExtra(EXTRA_TODOIST_JSON)
        val todoistScript = intent?.getStringExtra(EXTRA_TODOIST_SCRIPT)
        val ask = intent?.getStringExtra(EXTRA_ASK_SCRIPT)               // 每日詢問的原文（M2）
        val listen = intent?.getBooleanExtra(EXTRA_LISTEN, false) == true  // 通知按「有喝，用說的」（M2）
        when {
            maJson != null -> presentMa(maJson, maScript ?: intent?.getStringExtra(EXTRA_TEXT) ?: "")
            todoistJson != null -> presentTodoist(todoistJson, todoistScript ?: intent?.getStringExtra(EXTRA_TEXT) ?: "")
            ask != null -> presentAsk(ask)
            listen -> {
                presentQueued()
                onMicPressed()  // 沒有麥克風權限時照現有提示
            }
            else -> presentReport(intent?.getStringExtra(EXTRA_TEXT))  // 要演出的原文（沒有就只報告排隊）
        }
    }

    // 盤前均線提醒：先報告排隊內容，驗證 ma 負載後交給 showMa（帶 script），驗不過降級為 showScript（M4）
    private fun presentMa(maJson: String, script: String) {
        presentQueued()
        val validObj = try {
            val obj = JSONObject(maJson)
            val status = obj.optString("status").takeIf { it.isNotEmpty() }
            val u = obj.optInt("u", -1)
            val d = obj.optInt("d", -1)
            val m = obj.optInt("m", -1)
            if (status != null && status in MA_PUSH_STATUSES && u >= 0 && d >= 0 && m >= 0) {
                obj.put("script", script)
                obj
            } else null
        } catch (e: JSONException) {
            null
        }
        if (validObj != null) {
            showMa(validObj.toString())
        } else {
            showScript(script)
        }
    }

    // Todoist 提醒：先報告排隊內容，驗證 todoist 負載後交給 showTodoist（帶 script），驗不過降級為 showScript
    private fun presentTodoist(todoistJson: String, script: String) {
        presentQueued()
        val validObj = try {
            val obj = JSONObject(todoistJson)
            val view = obj.optString("view").takeIf { it.isNotEmpty() }
            val taskId = obj.optString("taskId").takeIf { it.isNotEmpty() }
            if (view != null && view in TODOIST_VIEWS && taskId != null && isValidTaskId(taskId)) {
                obj.put("script", script)
                obj
            } else null
        } catch (e: JSONException) {
            null
        }
        if (validObj != null) {
            showTodoist(validObj.toString())
        } else {
            showScript(script)
        }
    }

    // 角色出現：重新計時、取出排隊內容與新提醒一起演出
    private fun presentReport(script: String?) {
        markInteraction()
        showScript(ReminderDispatcher.takeReport(this, script))  // 原文含表情標籤，交給角色頁演出
        restartIdleTimer()
    }

    // 角色出現：只在有排隊內容時報告（不說預設招呼），重新計時
    private fun presentQueued() {
        markInteraction()
        ReminderDispatcher.takeQueuedReport(this)?.let { showScript(it) }
        restartIdleTimer()
    }

    // 每日詢問：先報告排隊內容，再以 ask 的形式交給角色頁（帶「沒喝／有喝，用說的」按鈕）
    private fun presentAsk(script: String) {
        presentQueued()
        showDrink(JSONObject().put("kind", "ask").put("script", script).toString())  // 用 JSONObject 組，避免注入
    }

    // 閒置計時從現在重新開始
    private fun restartIdleTimer() {
        idleHandler.removeCallbacks(idleCheck)
        idleHandler.postDelayed(idleCheck, IDLE_HIDE_MILLIS)
    }

    // 到期檢查：該收起就停止服務（不改角色模式），否則等到新的期限再查
    private fun checkIdle() {
        val now = System.currentTimeMillis()
        if (shouldHide(lastInteractionMillis, now)) {
            stopPet()
        } else {
            idleHandler.postDelayed(idleCheck, idleDeadline(lastInteractionMillis) - now)
        }
    }

    // 點角色：展開或收起泡泡，視窗跟著擴張或縮回（A6：只到角色＋泡泡大小）
    private fun toggleBubble() {
        markInteraction()
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
        val extraHeight = if (bubbleShown) dp(BUBBLE_MAX_HEIGHT_DP) - pet.h else 0  // 泡泡比角色高出的部分
        val growDown = petPos.y < extraHeight                                       // 上方空間不夠時，泡泡往下長
        val right = isOnRightSide()
        lp.width = pet.w + extra
        lp.height = pet.h + extraHeight
        // 在右邊時以螢幕右緣為基準：視窗變寬只往左長，右緣與角色位置不動，展開泡泡時角色不會跳
        if (right) {
            lp.gravity = Gravity.TOP or Gravity.END
            lp.x = screenSize().w - petPos.x - pet.w  // 與右緣的距離
        } else {
            lp.gravity = Gravity.TOP or Gravity.START
            lp.x = petPos.x
        }
        lp.y = if (growDown) petPos.y else petPos.y - extraHeight  // 往上長時視窗上緣往上移，角色留在原位
        // 耗電測試模式：角色在畫面上時保持螢幕亮著（只影響本 App 的懸浮窗，不改系統設定）
        lp.flags = if (isBatteryTestMode(this)) {
            lp.flags or WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
        } else {
            lp.flags and WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON.inv()
        }
        callJs("document.documentElement.dataset.side='${if (right) "right" else "left"}'")
        callJs("document.documentElement.dataset.grow='${if (growDown) "down" else "up"}'")
        // WebView 在容器內靠角色那一側對齊，被裁掉的是泡泡那一側；上下則靠角色所在的那一邊（往上長時靠底）
        val horizontal = if (right) Gravity.END else Gravity.START
        val vertical = if (growDown) Gravity.TOP else Gravity.BOTTOM
        (wv.layoutParams as android.widget.FrameLayout.LayoutParams).gravity = horizontal or vertical
        wv.requestLayout()
        windowManager.updateViewLayout(box, lp)
    }

    // 按麥克風：沒權限就提示，有權限才啟動語音辨識
    private fun onMicPressed() {
        markInteraction()
        if (!hasMicPermission()) {
            showText(MIC_DENIED_MESSAGE)  // 沒權限不啟動辨識（S02）
            return
        }
        speech.start()
    }

    // 按「聊聊」：沒設定聊天網址就在泡泡提示；有設定就收起泡泡、開啟聊天畫面（角色保留，閒置照常計時）
    private fun onChatPressed() {
        markInteraction()
        when (decideChat(BuildConfig.CHAT_URL)) {
            ChatAction.SHOW_NOT_SET -> showText(CHAT_NOT_SET_MESSAGE)  // 不開聊天畫面（M15-S06）
            ChatAction.OPEN -> {
                if (bubbleShown) toggleBubble()
                startActivity(Intent(this, ChatActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))  // 從服務開畫面需要新工作
            }
        }
    }

    // 按「📈 盤前均線」或「看明細」：沒設定聊天網址就在泡泡提示；有設定就開啟盤前均線畫面（角色保留，閒置照常計時，M4）
    private fun onMaPressed() {
        markInteraction()
        val url = maPageUrl(BuildConfig.CHAT_URL)
        if (url == null) {
            showText(CHAT_NOT_SET_MESSAGE) // 尚未設定聊天網址提示，不開畫面
        } else {
            startActivity(Intent(this, MaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    // 語音辨識成功的文字：送 Worker 解析（M2；「我在聽…」與錯誤提示不會進來）
    private fun onSpeechResult(text: String) {
        markInteraction()
        callWorker(PARSE_PATH, JSONObject().put("text", text.take(PARSE_MAX_CHARS)).toString())
    }

    // 網頁的戒飲按鈕（§4.3）：只解析固定欄位，不認得的動作略過
    private fun onDrinkAction(json: String) {
        markInteraction()  // 包含「取消」：只記一次互動
        val obj = try {
            JSONObject(json)
        } catch (e: JSONException) {
            return  // 不是 JSON 物件就略過
        }
        val action = obj.opt("action") as? String ?: return
        if (action == ACTION_SPEAK) {
            onMicPressed()  // 同按「說話」
            return
        }
        val path = drinkEndpointFor(action) ?: return       // cancel 與不認得的動作不連線
        val body = drinkRequestBody(action, obj) ?: return  // 缺欄位或型別不對就略過
        callWorker(path, body)
    }

    // 呼叫 Worker：先換思考的臉，拿到回應後交給角色頁；失敗顯示固定提示
    private fun callWorker(path: String, body: String) {
        thinking(true)
        WorkerApi.post(path, body) { result ->
            if (state.service != com.accompany.pet.core.ServiceState.RUNNING) return@post  // 角色已收起，不再演出
            markInteraction()
            thinking(false)
            val message = workerErrorMessage(result.status)
            if (message != null) showText(message) else showDrink(result.text)
        }
    }

    // 網頁的 Todoist 按鈕（§4.3）：只解析固定欄位，不認得的動作略過
    private fun onTodoistAction(json: String) {
        markInteraction()  // 包含「cancel」：只記一次互動
        val obj = try {
            JSONObject(json)
        } catch (e: JSONException) {
            return  // 不是 JSON 物件就略過
        }
        val action = obj.optString("action").takeIf { it.isNotEmpty() } ?: return
        if (action == "cancel") return  // cancel 不連線，只記一次互動
        if (!isSendableTodoistAction(action)) return  // 不在 TODOIST_SENT_ACTIONS 內略過

        callTodoistWorker(json)
    }

    // 呼叫 Worker Todoist API：先換思考的臉，拿到回應後交給 showTodoist；連不上或非 2xx 顯示固定提示
    private fun callTodoistWorker(body: String) {
        thinking(true)
        WorkerApi.post("/api/todoist/action", body) { result ->
            if (state.service != com.accompany.pet.core.ServiceState.RUNNING) return@post
            markInteraction()
            thinking(false)
            val message = workerErrorMessage(result.status)
            if (message != null) showText(message) else showTodoist(result.text)
        }
    }

    // 把 Todoist 資料（或回應）交給角色頁；以 JSON 字串跳脫，只當資料（A26）
    fun showTodoist(json: String) {
        if (!pageReady) {
            pending.add(PendingKind.TODOIST to json)  // 頁面還沒載入完成，等 onPageFinished 再交
            return
        }
        val arg = org.json.JSONObject.quote(json)
        callJs("window.pet.showTodoist&&window.pet.showTodoist($arg)")  // 網頁沒有這個方法時略過
        if (!bubbleShown) toggleBubble()
    }

    // 把盤前均線資料交給角色頁；以 JSON 字串跳脫，只當資料（A26，M4）
    fun showMa(json: String) {
        if (!pageReady) {
            pending.add(PendingKind.MA to json)  // 頁面還沒載入完成，等 onPageFinished 再交
            return
        }
        val arg = org.json.JSONObject.quote(json)
        callJs("window.pet.showMa&&window.pet.showMa($arg)")  // 網頁沒有這個方法時略過
        if (!bubbleShown) toggleBubble()
    }

    // 把 Worker 回應（或 App 組的 ask）交給角色頁；以 JSON 字串跳脫，只當資料（A26）
    fun showDrink(json: String) {
        if (!pageReady) {
            pending.add(PendingKind.DRINK to json)  // 頁面還沒載入完成，等 onPageFinished 再交
            return
        }
        val arg = org.json.JSONObject.quote(json)
        callJs("window.pet.showDrink&&window.pet.showDrink($arg)")  // 網頁沒有這個方法時略過（M1.5 決定 47）
        if (!bubbleShown) toggleBubble()
    }

    // 切換思考的臉（true 時泡泡顯示「…」）
    fun thinking(on: Boolean) {
        if (!pageReady) {
            pending.add(PendingKind.THINKING to on.toString())  // 頁面還沒載入完成，等 onPageFinished 再切
            return
        }
        callJs("window.pet.thinking&&window.pet.thinking($on)")  // 只傳布林值
        if (on && !bubbleShown) toggleBubble()
    }

    // 在泡泡顯示文字（以 JSON 字串跳脫，避免注入）
    fun showText(text: String) {
        if (!pageReady) {
            pending.add(PendingKind.TEXT to text)  // 頁面還沒載入完成，等 onPageFinished 再顯示
            return
        }
        callJs("window.pet.showText(${org.json.JSONObject.quote(text)})")
        if (!bubbleShown) toggleBubble()
    }

    // 讓角色依原文演出（換表情、逐字）；以 JSON 字串跳脫，避免注入（A26）
    fun showScript(script: String) {
        if (!pageReady) {
            pending.add(PendingKind.SCRIPT to script)  // 頁面還沒載入完成，等 onPageFinished 再演出
            return
        }
        callJs("window.pet.say(${org.json.JSONObject.quote(script)})")  // 原文只當字串參數，不當程式
        if (!bubbleShown) toggleBubble()
    }

    // 依到達順序補送頁面載入前暫存的話
    private fun flushPending() {
        val items = pending.toList()  // 先複製，補送時不會再進暫存（pageReady 已為 true）
        pending.clear()
        items.forEach { (kind, value) ->
            when (kind) {
                PendingKind.SCRIPT -> showScript(value)
                PendingKind.TEXT -> showText(value)
                PendingKind.DRINK -> showDrink(value)
                PendingKind.THINKING -> thinking(value.toBoolean())
                PendingKind.TODOIST -> showTodoist(value)
                PendingKind.MA -> showMa(value)
            }
        }
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
            markInteraction()  // 任何觸控都重新計時
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

        // 頁面載入完成：補顯示先前存著的話
        override fun onPageFinished(view: WebView, url: String) {
            if (view != webView) return
            pageReady = true
            flushPending()
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
