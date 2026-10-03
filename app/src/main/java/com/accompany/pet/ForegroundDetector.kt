package com.accompany.pet

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process

// 常數定義
const val CUSTOM_GAMES_FILE = "custom-games.txt"   // 自訂遊戲清單檔名（一行一個套件名稱）
const val FOREGROUND_WINDOW_MILLIS = 60 * 1000L    // 往回查多久的前景事件

// 當下前景 App 的資訊：套件名稱（查不到為 null）與系統是否標成遊戲
data class ForegroundSnapshot(val packageName: String?, val isGameCategory: Boolean)

// 是否已取得「使用情形存取權」
fun hasUsageAccess(context: Context): Boolean {
    val appOps = context.getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
    val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    } else {
        @Suppress("DEPRECATION")
        appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
    }
    return mode == AppOpsManager.MODE_ALLOWED
}

// 只讀一次當下的前景 App（收到推播的當下才呼叫，不常駐監看）
fun readForeground(context: Context, nowMillis: Long): ForegroundSnapshot {
    val manager = context.getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
    val events = manager.queryEvents(nowMillis - FOREGROUND_WINDOW_MILLIS, nowMillis)
    val event = UsageEvents.Event()
    var last: String? = null  // 最後一個移到前景的套件
    while (events.hasNextEvent()) {
        events.getNextEvent(event)
        if (event.eventType == foregroundEventType()) last = event.packageName
    }
    return ForegroundSnapshot(last, last != null && isGameApp(context, last))
}

// 「移到前景」事件的代碼（Android 10 起改名）
private fun foregroundEventType(): Int =
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        UsageEvents.Event.ACTIVITY_RESUMED
    } else {
        @Suppress("DEPRECATION") UsageEvents.Event.MOVE_TO_FOREGROUND
    }

// 系統是否把這個套件標成遊戲；查不到套件視為否
private fun isGameApp(context: Context, packageName: String): Boolean = try {
    context.packageManager.getApplicationInfo(packageName, 0).category == ApplicationInfo.CATEGORY_GAME
} catch (e: PackageManager.NameNotFoundException) {
    false
}

// 讀取自訂遊戲清單：trim 後略過空行
fun loadCustomGames(context: Context): Set<String> =
    readCustomGamesText(context).lines().map { it.trim() }.filter { it.isNotEmpty() }.toSet()

// 儲存自訂遊戲清單（整份文字原樣寫入，讀取時再整理）
fun saveCustomGames(context: Context, text: String) {
    java.io.File(context.filesDir, CUSTOM_GAMES_FILE).writeText(text)
}

// 讀出自訂遊戲清單的原始文字，給主畫面編輯用
fun readCustomGamesText(context: Context): String {
    val file = java.io.File(context.filesDir, CUSTOM_GAMES_FILE)
    return try {
        if (file.isFile) file.readText() else ""
    } catch (e: java.io.IOException) {
        ""
    }
}
