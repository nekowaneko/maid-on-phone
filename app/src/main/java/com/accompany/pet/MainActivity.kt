package com.accompany.pet

import android.Manifest
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.widget.Button
import android.widget.EditText
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.RelativeLayout
import android.widget.ScrollView
import android.widget.TextView
import android.view.View
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.SwitchCompat
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.accompany.pet.core.chat.CHAT_NOT_SET_MESSAGE
import com.accompany.pet.core.chat.ChatAction
import com.accompany.pet.core.chat.decideChat
import com.accompany.pet.core.exportCsv
import com.accompany.pet.core.permission.StartAction
import com.accompany.pet.core.permission.decideStart
import com.google.android.material.bottomsheet.BottomSheetDialog

// 常數定義
const val OVERLAY_EXPLANATION =
    "陪伴角色需要「顯示在其他應用程式上層」權限，才能待在桌面上陪你。\n" +
        "請在齒輪設定中開啟權限後再切換開啟角色。"
const val USAGE_ACCESS_HINT = "開啟後才能在玩遊戲時先不打擾"
const val NO_FIREBASE_HINT = "尚未設定 Firebase，見 docs/FIREBASE-SETUP.md"
const val TEST_PUSH_TEXT = "這是一則測試推播"
const val PADDING_DP = 16
const val CHAT_SET_TEXT = "聊天網址：已設定"

// macOS 深色毛玻璃風格主畫面：1A, 2A, 3A, 4A 決策實作
class MainActivity : AppCompatActivity() {

    // 主介面元件
    private lateinit var btnGearSettings: ImageButton
    private lateinit var statusDot: TextView
    private lateinit var tvMainStatus: TextView
    private lateinit var charToggleCapsule: RelativeLayout
    private lateinit var imgApkIcon: ImageView
    private lateinit var tvCharSubStatus: TextView
    private lateinit var swCharToggle: SwitchCompat
    private lateinit var cardDrinkSettings: LinearLayout
    private lateinit var tvChatStatus: TextView

    private var settingsDialog: BottomSheetDialog? = null
    private var lastTestId: String? = null

    // 監聽 OverlayService 啟動/停止狀態變更廣播
    private val petStateReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            refreshUi()
        }
    }

    // 請求麥克風與通知權限
    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            refreshUi()
            if (result[Manifest.permission.RECORD_AUDIO] == true && OverlayService.running) {
                ContextCompat.startForegroundService(this, Intent(this, OverlayService::class.java))
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContentView(R.layout.activity_main)

        bindViews()
        setupListeners()

        ViewCompat.setOnApplyWindowInsetsListener(findViewById<ScrollView>(R.id.main)) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val pad = dp(PADDING_DP)
            v.setPadding(bars.left + pad, bars.top + pad, bars.right + pad, bars.bottom + pad)
            insets
        }
    }

    private fun bindViews() {
        btnGearSettings = findViewById(R.id.btnGearSettings)
        statusDot = findViewById(R.id.statusDot)
        tvMainStatus = findViewById(R.id.tvMainStatus)
        charToggleCapsule = findViewById(R.id.charToggleCapsule)
        imgApkIcon = findViewById(R.id.imgApkIcon)
        tvCharSubStatus = findViewById(R.id.tvCharSubStatus)
        swCharToggle = findViewById(R.id.swCharToggle)
        cardDrinkSettings = findViewById(R.id.cardDrinkSettings)
        tvChatStatus = findViewById(R.id.tvChatStatus)
    }

    private fun setupListeners() {
        // 4A: 齒輪按鈕彈出偏好設定 Sheet Dialog
        btnGearSettings.setOnClickListener { showSettingsSheet() }

        // 2A: 角色開關膠囊按鈕 (點膠囊卡片或點 Switch 皆可切換)
        charToggleCapsule.setOnClickListener {
            toggleCharacterState(!swCharToggle.isChecked)
        }

        swCharToggle.setOnClickListener {
            toggleCharacterState(swCharToggle.isChecked)
        }

        // 3A: 戒飲設定入口卡片
        cardDrinkSettings.setOnClickListener {
            startActivity(Intent(this, DrinkSettingsActivity::class.java))
        }

        // 4B: 快捷小按鈕（允許麥克風 / 對話紀錄）
        findViewById<View>(R.id.cardMicQuick)?.setOnClickListener {
            requestRuntimePermissions()
        }
        findViewById<View>(R.id.cardChatQuick)?.setOnClickListener {
            when (decideChat(BuildConfig.CHAT_URL)) {
                ChatAction.SHOW_NOT_SET -> tvMainStatus.text = CHAT_NOT_SET_MESSAGE
                ChatAction.OPEN -> startActivity(Intent(this, ChatActivity::class.java))
            }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        val filter = IntentFilter(ACTION_PET_STATE_CHANGED)
        ContextCompat.registerReceiver(this, petStateReceiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        refreshUi()
        if (intent.getBooleanExtra(EXTRA_AUTO_START, false)) {
            intent.removeExtra(EXTRA_AUTO_START)
            toggleCharacterState(true)
        }
    }

    override fun onPause() {
        super.onPause()
        try {
            unregisterReceiver(petStateReceiver)
        } catch (_: IllegalArgumentException) {}
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    // 依權限與執行狀態更新 UI
    private fun refreshUi() {
        updateUiForState(OverlayService.running)
    }

    // 依指定狀態更新 UI（支援樂觀即時更新，避免非同步等待被覆蓋）
    private fun updateUiForState(isRunning: Boolean) {
        val granted = hasOverlayPermission()

        tvMainStatus.text = if (granted) {
            if (isRunning) "角色目前在桌面上運行中 🟢" else "已授權，按膠囊開關可叫出角色"
        } else {
            "未取得懸浮窗權限，請點右上角 ⚙️ 設定"
        }

        statusDot.text = if (isRunning) "🟢" else "⚪"
        swCharToggle.isChecked = isRunning

        if (isRunning) {
            charToggleCapsule.setBackgroundResource(R.drawable.bg_capsule_card_active)
            tvCharSubStatus.text = "狀態：顯示中 🟢"
        } else {
            charToggleCapsule.setBackgroundResource(R.drawable.bg_capsule_card)
            tvCharSubStatus.text = "狀態：已隱藏 ⚪"
        }

        tvChatStatus.text = chatStatusText()
    }

    // 膠囊切換角色開關
    private fun toggleCharacterState(enable: Boolean) {
        if (enable && !hasOverlayPermission()) {
            tvMainStatus.text = OVERLAY_EXPLANATION
            showSettingsSheet()
            openOverlaySettings()
            updateUiForState(false)
            return
        }

        // 樂觀更新：立刻呈現目標視覺狀態
        updateUiForState(enable)

        if (enable) {
            startPetService(this)
        } else {
            stopPetService(this)
        }
    }

    // 4A: 顯示齒輪偏好設定 Sheet Dialog
    private fun showSettingsSheet() {
        if (settingsDialog?.isShowing == true) return

        val dialog = BottomSheetDialog(this)
        val view = layoutInflater.inflate(R.layout.dialog_settings_sheet, null)

        val btnClose = view.findViewById<Button>(R.id.btnCloseSheet)
        val tvOverlayStatus = view.findViewById<TextView>(R.id.sheetOverlayStatus)
        val btnGrantOverlay = view.findViewById<Button>(R.id.sheetGrantOverlayBtn)
        val tvUsageStatus = view.findViewById<TextView>(R.id.sheetUsageStatus)
        val btnGrantUsage = view.findViewById<Button>(R.id.sheetGrantUsageBtn)
        val btnGrantMic = view.findViewById<Button>(R.id.sheetGrantMicBtn)

        val etCustomGames = view.findViewById<EditText>(R.id.sheetCustomGamesInput)
        val btnSaveGames = view.findViewById<Button>(R.id.sheetSaveGamesBtn)
        val tvPushCode = view.findViewById<TextView>(R.id.sheetPushCodeText)
        val btnCopyPush = view.findViewById<Button>(R.id.sheetCopyPushBtn)
        val btnTestPush = view.findViewById<Button>(R.id.sheetTestPushBtn)
        val btnResendPush = view.findViewById<Button>(R.id.sheetResendPushBtn)

        val btnExportBattery = view.findViewById<Button>(R.id.sheetExportBatteryBtn)
        val btnTestMode = view.findViewById<Button>(R.id.sheetTestModeBtn)

        // 權限狀態更新
        val hasOverlay = hasOverlayPermission()
        tvOverlayStatus.text = if (hasOverlay) "懸浮窗顯示權限：已授權 🟢" else OVERLAY_EXPLANATION
        btnGrantOverlay.isEnabled = !hasOverlay

        val hasUsage = hasUsageAccess(this)
        tvUsageStatus.text = if (hasUsage) "使用情形存取權：已開啟 🟢" else USAGE_ACCESS_HINT
        btnGrantUsage.isEnabled = !hasUsage

        // 遊戲與推播資料載入
        etCustomGames.setText(readCustomGamesText(this))
        tvPushCode.text = PushTokenStore(this).load()?.let { "推播代碼：$it" } ?: NO_FIREBASE_HINT

        btnTestMode.text = testModeLabel()

        // 按鈕監聽器綁定
        btnClose.setOnClickListener { dialog.dismiss() }

        btnGrantOverlay.setOnClickListener { openOverlaySettings() }
        btnGrantUsage.setOnClickListener { startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS)) }
        btnGrantMic.setOnClickListener { requestRuntimePermissions() }

        btnSaveGames.setOnClickListener {
            saveCustomGames(this, etCustomGames.text.toString())
            tvMainStatus.text = "已儲存自訂遊戲清單"
            dialog.dismiss()
        }

        btnCopyPush.setOnClickListener {
            copyPushCode()
            dialog.dismiss()
        }

        btnTestPush.setOnClickListener { sendTestPush(newId = true) }
        btnResendPush.setOnClickListener { sendTestPush(newId = false) }

        btnExportBattery.setOnClickListener { exportAndShare() }

        btnTestMode.setOnClickListener {
            setBatteryTestMode(this, !isBatteryTestMode(this))
            btnTestMode.text = testModeLabel()
        }

        dialog.setContentView(view)
        dialog.show()
        settingsDialog = dialog
    }

    private fun copyPushCode() {
        val value = PushTokenStore(this).load() ?: return
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("推播代碼", value))
        tvMainStatus.text = "已複製推播代碼"
    }

    private fun sendTestPush(newId: Boolean) {
        val id = if (newId || lastTestId == null) "test-${System.currentTimeMillis()}" else lastTestId!!
        lastTestId = id
        ReminderDispatcher.handle(this, mapOf("id" to id, "text" to TEST_PUSH_TEXT))
    }

    private fun hasOverlayPermission(): Boolean = Settings.canDrawOverlays(this)

    private fun openOverlaySettings() {
        val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
        startActivity(intent)
    }

    private fun requestRuntimePermissions() {
        val perms = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) perms += Manifest.permission.POST_NOTIFICATIONS
        permissionLauncher.launch(perms.toTypedArray())
    }

    private fun exportAndShare() {
        val dir = getExternalFilesDir("exports") ?: java.io.File(filesDir, "exports")
        val file = exportCsv(dir, readSamples(this), System.currentTimeMillis(), LOG_ZONE)
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        tvMainStatus.text = "已匯出：${file.name}"
        startActivity(Intent.createChooser(send, "分享耗電紀錄"))
    }

    private fun chatStatusText(): String =
        if (decideChat(BuildConfig.CHAT_URL) == ChatAction.OPEN) CHAT_SET_TEXT else CHAT_NOT_SET_MESSAGE

    private fun testModeLabel(): String =
        if (isBatteryTestMode(this)) "耗電測試模式：開（螢幕保持亮著）" else "耗電測試模式：關"
}
