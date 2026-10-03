package com.accompany.pet

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.quicksettings.TileService
import android.util.Log
import androidx.core.content.ContextCompat
import com.accompany.pet.core.FileRunIntentStore
import com.accompany.pet.core.RunIntentStore
import com.accompany.pet.core.nextWatchdogTime

// 常數定義
const val RUN_INTENT_FILE = "pet-wanted.txt"  // 使用者意圖紀錄檔
const val WATCHDOG_REQUEST_CODE = 10           // 巡邏鬧鐘的 PendingIntent 編號

// 使用者意圖的存取（想不想讓角色開著）
fun runIntentStore(context: Context): RunIntentStore =
    FileRunIntentStore(java.io.File(context.filesDir, RUN_INTENT_FILE))

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

// 請服務停止（使用者主動停止，服務收到後會記錄不想開著）
fun stopPetService(context: Context) {
    context.startService(Intent(context, OverlayService::class.java).setAction(ACTION_STOP))
}

// 巡邏鬧鐘要送出的 PendingIntent
private fun watchdogIntent(context: Context): PendingIntent =
    PendingIntent.getBroadcast(
        context, WATCHDOG_REQUEST_CODE,
        Intent(context, WatchdogReceiver::class.java),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

// 是否能用精確鬧鐘
fun canUseExactAlarm(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return true
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    return am.canScheduleExactAlarms()
}

// 排下一次巡邏：有精確鬧鐘權限用精確鬧鐘，沒有就退回一般鬧鐘（可能延後）
fun scheduleWatchdog(context: Context) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val at = nextWatchdogTime(System.currentTimeMillis())
    val pi = watchdogIntent(context)
    try {
        if (canUseExactAlarm(context)) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
        }
    } catch (e: SecurityException) {
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)  // 權限剛被收回時退回一般鬧鐘
    }
}

// 取消巡邏
fun cancelWatchdog(context: Context) {
    val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    am.cancel(watchdogIntent(context))
}

// 通知磁磚更新顯示狀態
fun refreshTile(context: Context) {
    TileService.requestListeningState(context, ComponentName(context, PetTileService::class.java))
}
