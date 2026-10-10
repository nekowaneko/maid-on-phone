package com.accompany.pet

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.service.quicksettings.TileService
import android.util.Log
import androidx.core.content.ContextCompat

// 常數定義
const val ACTION_SHOW = "com.accompany.pet.SHOW"  // 叫出角色（可帶要說的話）
const val EXTRA_TEXT = "text"                      // ACTION_SHOW 帶的要演出的原文（可含表情標籤）
const val EXTRA_ASK_SCRIPT = "askScript"           // ACTION_SHOW 帶的每日詢問原文（M2，角色附「沒喝／有喝，用說的」按鈕）
const val EXTRA_LISTEN = "listen"                  // ACTION_SHOW 帶的「出現後開始語音辨識」（M2，通知按「有喝，用說的」）
const val EXTRA_TODOIST_JSON = "todoistJson"       // ACTION_SHOW 帶的 Todoist 負載 JSON（M3R）
const val EXTRA_TODOIST_SCRIPT = "todoistScript"   // ACTION_SHOW 帶的 Todoist 台詞原文（M3R）
const val EXTRA_MA_JSON = "maJson"                 // ACTION_SHOW 帶的盤前均線負載 JSON（M4）
const val EXTRA_MA_SCRIPT = "maScript"             // ACTION_SHOW 帶的盤前均線台詞原文（M4）

// 是否有懸浮窗權限
fun hasOverlayPermission(context: Context): Boolean = Settings.canDrawOverlays(context)

// 啟動（叫出）角色服務，text 為角色要演出的原文（可含表情標籤）；askScript 為每日詢問原文；listen 為出現後開始聆聽；todoistJson / todoistScript 為 Todoist 提醒負載；maJson / maScript 為盤前均線提醒負載
// 被系統拒絕（例如背景啟動限制）時回傳 false，不嘗試繞過
fun startPetService(
    context: Context,
    text: String? = null,
    askScript: String? = null,
    listen: Boolean = false,
    todoistJson: String? = null,
    todoistScript: String? = null,
    maJson: String? = null,
    maScript: String? = null,
): Boolean = try {
    val intent = Intent(context, OverlayService::class.java).setAction(ACTION_SHOW)
    if (text != null) intent.putExtra(EXTRA_TEXT, text)
    if (askScript != null) intent.putExtra(EXTRA_ASK_SCRIPT, askScript)
    if (listen) intent.putExtra(EXTRA_LISTEN, true)
    if (todoistJson != null) intent.putExtra(EXTRA_TODOIST_JSON, todoistJson)
    if (todoistScript != null) intent.putExtra(EXTRA_TODOIST_SCRIPT, todoistScript)
    if (maJson != null) intent.putExtra(EXTRA_MA_JSON, maJson)
    if (maScript != null) intent.putExtra(EXTRA_MA_SCRIPT, maScript)
    ContextCompat.startForegroundService(context, intent)
    true
} catch (e: IllegalStateException) {
    // Android 12+ 的 ForegroundServiceStartNotAllowedException 也是 IllegalStateException
    Log.w(LOG_TAG, "啟動角色服務被系統拒絕：${e.javaClass.simpleName}")
    false
}

// 請服務停止
fun stopPetService(context: Context) {
    context.startService(Intent(context, OverlayService::class.java).setAction(ACTION_STOP))
}

// 通知磁磚更新顯示狀態
fun refreshTile(context: Context) {
    TileService.requestListeningState(context, ComponentName(context, PetTileService::class.java))
}

// 耗電測試模式的紀錄檔（內容 1 或 0）
private fun batteryTestFile(context: Context) = java.io.File(context.filesDir, "battery-test-mode.txt")

// 是否開啟耗電測試模式（開啟時角色在畫面上會保持螢幕亮著）
fun isBatteryTestMode(context: Context): Boolean =
    batteryTestFile(context).let { it.isFile && it.readText().trim() == "1" }

// 切換耗電測試模式，並請執行中的服務立即套用
fun setBatteryTestMode(context: Context, on: Boolean) {
    batteryTestFile(context).writeText(if (on) "1" else "0")
    if (OverlayService.running) {
        context.startService(Intent(context, OverlayService::class.java).setAction(ACTION_APPLY_SETTINGS))
    }
}
