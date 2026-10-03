package com.accompany.pet

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import com.accompany.pet.core.exportCsv
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import com.accompany.pet.core.permission.StartAction
import com.accompany.pet.core.permission.decideStart

// 常數定義
const val OVERLAY_EXPLANATION =
    "陪伴角色需要「顯示在其他應用程式上層」權限，才能待在桌面上陪你。\n" +
        "請按下方按鈕到系統設定開啟，開啟後回到這裡按「開始」。"
const val PADDING_DP = 24  // 畫面四周留白

// 主畫面：權限說明、開始／停止
class MainActivity : AppCompatActivity() {

    private lateinit var status: TextView        // 說明文字
    private lateinit var grantButton: Button     // 前往授權按鈕

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
    private fun buildLayout(): LinearLayout {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
        }
        status = TextView(this).apply { textSize = 16f }
        grantButton = Button(this).apply {
            text = "前往授權「顯示在其他應用程式上層」"
            setOnClickListener { openOverlaySettings() }
        }
        root.addView(status)
        root.addView(grantButton)
        root.addView(button("開始") { onStartPressed() })
        root.addView(button("停止") { stopPet() })
        root.addView(button("允許麥克風（用說的）") { requestRuntimePermissions() })
        root.addView(button("匯出耗電紀錄") { exportAndShare() })
        root.addView(button("允許自動恢復（精確鬧鐘）") { openExactAlarmSettings() })
        return root
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
        status.text = if (granted) "已授權，可以按「開始」叫出角色。" else OVERLAY_EXPLANATION
        grantButton.isEnabled = !granted
    }

    // 按「開始」：沒權限就說明，有權限才啟動角色（S01）
    private fun onStartPressed() {
        when (decideStart(hasOverlayPermission())) {
            StartAction.SHOW_PERMISSION_EXPLANATION -> {
                status.text = OVERLAY_EXPLANATION
                openOverlaySettings()
            }
            StartAction.START_OVERLAY -> {
                runIntentStore(this).save(true)  // 使用者想開著：之後被收掉會自動恢復
                startPetService(this)
            }
        }
    }

    // 停止角色
    private fun stopPet() {
        stopPetService(this)  // 服務會記錄不想開著並取消巡邏
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

    // 開啟系統的精確鬧鐘授權頁（Android 12+）；有權限時巡邏更準時
    private fun openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || canUseExactAlarm(this)) {
            status.text = "已允許自動恢復。"
            return
        }
        startActivity(Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:$packageName")))
    }
}
