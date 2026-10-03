package com.accompany.pet

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.service.quicksettings.TileService
import android.util.Log
import androidx.core.content.ContextCompat

// 常數定義

// 是否有懸浮窗權限
fun hasOverlayPermission(context: Context): Boolean = Settings.canDrawOverlays(context)

// 啟動角色服務；被系統拒絕（例如背景啟動限制）時回傳 false，不嘗試繞過
fun startPetService(context: Context): Boolean = try {
    ContextCompat.startForegroundService(context, Intent(context, OverlayService::class.java))
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
