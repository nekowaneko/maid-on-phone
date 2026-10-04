package com.accompany.pet

import android.Manifest
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.accompany.pet.core.exportCsv
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.accompany.pet.core.chat.CHAT_NOT_SET_MESSAGE
import com.accompany.pet.core.chat.ChatAction
import com.accompany.pet.core.chat.decideChat
import com.accompany.pet.core.permission.StartAction
import com.accompany.pet.core.permission.decideStart

// 常數定義
const val OVERLAY_EXPLANATION =
    "陪伴角色需要「顯示在其他應用程式上層」權限，才能待在桌面上陪你。\n" +
        "請按下方按鈕到系統設定開啟，開啟後回到這裡按「叫出角色」。"
const val USAGE_ACCESS_HINT = "開啟後才能在玩遊戲時先不打擾"  // 沒有使用情形存取權時的說明
const val NO_FIREBASE_HINT = "尚未設定 Firebase，見 docs/FIREBASE-SETUP.md"  // 沒有推播代碼時的說明
const val TEST_PUSH_TEXT = "這是一則測試推播"  // 測試推播的內容
const val PADDING_DP = 24  // 畫面四周留白
const val CHAT_SET_TEXT = "聊天網址：已設定"  // 聊天網址已設定時的說明

// 主畫面：權限說明、開始／停止
class MainActivity : AppCompatActivity() {

    private lateinit var status: TextView        // 說明文字
    private lateinit var grantButton: Button     // 前往授權按鈕
    private lateinit var testModeButton: Button  // 耗電測試模式開關
    private lateinit var usageStatus: TextView   // 使用情形存取權說明
    private lateinit var usageButton: Button     // 前往開啟使用情形存取權
    private lateinit var pushCode: TextView      // 推播代碼
    private lateinit var chatStatus: TextView    // 聊天網址是否已設定
    private lateinit var customGames: EditText   // 自訂遊戲清單輸入框
    private var lastTestId: String? = null       // 上一則測試推播的編號（供「重送上一則」）

    // 請求麥克風與通知權限（只能在 Activity 請求）
    private val permissionLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
            refreshUi()
            // 角色已在執行時，通知服務重新宣告前景類型，補上 microphone
            if (result[Manifest.permission.RECORD_AUDIO] == true && OverlayService.running) {
                ContextCompat.startForegroundService(this, Intent(this, OverlayService::class.java))
            }
        }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val root = buildLayout()
        setContentView(root)
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            val pad = dp(PADDING_DP)
            v.setPadding(bars.left + pad, bars.top + pad, bars.right + pad, bars.bottom + pad)
            insets
        }
    }

    // 主畫面已開著時，磁磚帶來的「自動開始」從這裡進來
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
    }

    override fun onResume() {
        super.onResume()
        refreshUi()  // 從系統設定回來時更新說明
        if (intent.getBooleanExtra(EXTRA_AUTO_START, false)) {
            intent.removeExtra(EXTRA_AUTO_START)  // 只自動按一次
            onStartPressed()
        }
    }

    // dp 轉 px
    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()

    // 建立畫面元件
    private fun buildLayout(): ScrollView {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        val scroll = ScrollView(this).apply {
            clipToPadding = false
            addView(root)
        }
        status = TextView(this).apply { textSize = 16f }
        grantButton = Button(this).apply {
            text = "前往授權「顯示在其他應用程式上層」"
            setOnClickListener { openOverlaySettings() }
        }
        root.addView(status)
        root.addView(grantButton)
        root.addView(button("叫出角色") { onStartPressed() })
        root.addView(button("收起角色") { stopPet() })
        root.addView(button("允許麥克風（用說的）") { requestRuntimePermissions() })
        addReminderSection(root)
        root.addView(button("匯出耗電紀錄") { exportAndShare() })
        testModeButton = button(testModeLabel()) {
            setBatteryTestMode(this, !isBatteryTestMode(this))
            testModeButton.text = testModeLabel()
        }
        root.addView(testModeButton)
        return scroll
    }

    // 建立提醒相關區塊：使用情形存取權、自訂遊戲清單、推播代碼、測試推播
    private fun addReminderSection(root: LinearLayout) {
        usageStatus = TextView(this).apply { textSize = 14f }
        usageButton = button("前往開啟「使用情形存取權」") {
            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        }
        customGames = EditText(this).apply {
            hint = "自訂遊戲清單：一行一個套件名稱"
            minLines = 3
            gravity = Gravity.TOP
            setText(readCustomGamesText(this@MainActivity))
        }
        pushCode = TextView(this).apply {
            textSize = 12f
            setTextIsSelectable(true)
        }
        root.addView(usageStatus)
        root.addView(usageButton)
        root.addView(customGames)
        root.addView(button("儲存自訂遊戲清單") {
            saveCustomGames(this, customGames.text.toString())
            status.text = "已儲存自訂遊戲清單"
        })
        chatStatus = TextView(this).apply { textSize = 14f }
        root.addView(pushCode)
        root.addView(button("複製推播代碼") { copyPushCode() })
        root.addView(button("測試推播") { sendTestPush(newId = true) })
        root.addView(button("重送上一則") { sendTestPush(newId = false) })
        root.addView(chatStatus)
    }

    // 複製推播代碼到剪貼簿
    private fun copyPushCode() {
        val value = PushTokenStore(this).load() ?: return
        val clipboard = getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
        clipboard.setPrimaryClip(ClipData.newPlainText("推播代碼", value))
        status.text = "已複製推播代碼"
    }

    // 送一則測試推播：同樣走 ReminderDispatcher（A13）；newId=false 時沿用上一則的編號
    private fun sendTestPush(newId: Boolean) {
        val id = if (newId || lastTestId == null) "test-${System.currentTimeMillis()}" else lastTestId!!
        lastTestId = id
        ReminderDispatcher.handle(this, mapOf("id" to id, "text" to TEST_PUSH_TEXT))
    }

    // 建立一個按鈕
    private fun button(label: String, onClick: () -> Unit): Button =
        Button(this).apply {
            text = label
            setOnClickListener { onClick() }
        }

    // 是否已有懸浮窗權限
    private fun hasOverlayPermission(): Boolean = Settings.canDrawOverlays(this)

    // 依權限狀態更新說明與按鈕
    private fun refreshUi() {
        val granted = hasOverlayPermission()
        status.text = if (granted) "已授權，可以按「叫出角色」。" else OVERLAY_EXPLANATION
        grantButton.isEnabled = !granted
        val usage = hasUsageAccess(this)
        usageStatus.text = if (usage) "使用情形存取權：已開啟" else USAGE_ACCESS_HINT
        usageButton.isEnabled = !usage
        pushCode.text = PushTokenStore(this).load()?.let { "推播代碼：$it" } ?: NO_FIREBASE_HINT
        chatStatus.text = chatStatusText()
    }

    // 按「叫出角色」：沒權限就說明，有權限才啟動角色（S01）
    private fun onStartPressed() {
        when (decideStart(hasOverlayPermission())) {
            StartAction.SHOW_PERMISSION_EXPLANATION -> {
                status.text = OVERLAY_EXPLANATION
                openOverlaySettings()
            }
            StartAction.START_OVERLAY -> {
                startPetService(this)
            }
        }
    }

    // 停止角色
    private fun stopPet() {
        stopPetService(this)  // 只收起角色，不改角色模式
    }

    // 開啟系統的懸浮窗授權頁
    private fun openOverlaySettings() {
        val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:$packageName"))
        startActivity(intent)
    }

    // 請求麥克風（以及 Android 13+ 的通知）權限
    private fun requestRuntimePermissions() {
        val perms = mutableListOf(Manifest.permission.RECORD_AUDIO)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) perms += Manifest.permission.POST_NOTIFICATIONS
        permissionLauncher.launch(perms.toTypedArray())
    }

    // 匯出耗電紀錄成新的 CSV 檔，並開啟分享選單（每次都是新檔，不覆蓋，S03）
    private fun exportAndShare() {
        val dir = getExternalFilesDir("exports") ?: java.io.File(filesDir, "exports")
        val file = exportCsv(dir, readSamples(this), System.currentTimeMillis(), LOG_ZONE)
        val uri = FileProvider.getUriForFile(this, "$packageName.fileprovider", file)
        val send = Intent(Intent.ACTION_SEND).apply {
            type = "text/csv"
            putExtra(Intent.EXTRA_STREAM, uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)  // 只授權讀取這一個檔案
        }
        status.text = "已匯出：${file.name}"
        startActivity(Intent.createChooser(send, "分享耗電紀錄"))
    }


    // 聊天網址是否已設定的說明（網址本身不顯示）
    private fun chatStatusText(): String =
        if (decideChat(BuildConfig.CHAT_URL) == ChatAction.OPEN) CHAT_SET_TEXT else CHAT_NOT_SET_MESSAGE

    // 耗電測試模式按鈕的文字
    private fun testModeLabel(): String =
        if (isBatteryTestMode(this)) "耗電測試模式：開（螢幕保持亮著）" else "耗電測試模式：關"
}
