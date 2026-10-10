package com.accompany.pet

import android.content.Context
import android.util.Log
import com.accompany.pet.core.reminder.FilePetModeStore
import com.accompany.pet.core.reminder.FileReminderQueueStore
import com.accompany.pet.core.reminder.FileSeenIdStore
import com.accompany.pet.core.reminder.Reminder
import com.accompany.pet.core.reminder.Route
import com.accompany.pet.core.reminder.RouteInput
import com.accompany.pet.core.reminder.classifyForeground
import com.accompany.pet.core.reminder.decideRoute
import com.accompany.pet.core.reminder.drainAlive
import com.accompany.pet.core.reminder.enqueue
import com.accompany.pet.core.reminder.isGaming
import com.accompany.pet.core.reminder.parseReminder
import com.accompany.pet.core.reminder.reportScript

// 常數定義
const val QUEUE_FILE = "reminder-queue.txt"  // 排隊檔名
const val SEEN_FILE = "seen-ids.txt"         // 已處理編號檔名
const val PET_MODE_FILE = "pet-mode.txt"     // 角色模式檔名

// 角色模式（開／關）的存取
fun petModeStore(context: Context) = FilePetModeStore(java.io.File(context.filesDir, PET_MODE_FILE))

// 所有提醒（真推播與測試推播）的唯一入口（A13）
object ReminderDispatcher {
    private val lock = Any()  // 排隊檔與去重檔一次只讓一個執行緒改

    // 處理一則推播：解析 → 去重 → 前景判斷 → 分流 → 執行
    fun handle(context: Context, data: Map<String, String>, nowMillis: Long = System.currentTimeMillis()) {
        val reminder = parseReminder(data, nowMillis) ?: return  // 格式錯誤什麼都不做
        synchronized(lock) {
            val seen = FileSeenIdStore(java.io.File(context.filesDir, SEEN_FILE))
            val route = decideRoute(
                RouteInput(
                    petMode = petModeStore(context).load(),
                    gaming = isCurrentlyGaming(context, nowMillis),
                    alreadySeen = seen.contains(reminder.id),
                ),
            )
            if (route == Route.IGNORE) return
            seen.add(reminder.id)
            execute(context, route, reminder, nowMillis)
        }
    }

    // 只在這一刻讀一次前景 App，判斷是否正在玩遊戲；沒有使用情形存取權一律否
    private fun isCurrentlyGaming(context: Context, nowMillis: Long): Boolean {
        if (!hasUsageAccess(context)) return false
        val snapshot = try {
            readForeground(context, nowMillis)
        } catch (e: SecurityException) {
            Log.w(LOG_TAG, "讀取前景 App 被拒絕")
            return false
        }
        val kind = classifyForeground(snapshot.packageName, snapshot.isGameCategory, loadCustomGames(context))
        return isGaming(kind, true)
    }

    // 依分流結果執行
    private fun execute(context: Context, route: Route, r: Reminder, nowMillis: Long) {
        when (route) {
            Route.SHOW_PET -> {
                // 角色用原文演出（帶按鈕的每日詢問改用 ask；Todoist 提醒帶 todoistJson；盤前均線帶 maJson）；沒有懸浮窗權限或被系統拒絕啟動時，改發一般通知
                val started = hasOverlayPermission(context) && when {
                    r.ma != null -> startPetService(context, maJson = r.ma, maScript = r.script)
                    r.todoist != null -> startPetService(context, todoistJson = r.todoist, todoistScript = r.script)
                    r.actions.isNotEmpty() -> startPetService(context, askScript = r.script)
                    else -> startPetService(context, text = r.script)
                }
                if (!started) showReminderNotification(context, r)
            }
            Route.NOTIFY -> showReminderNotification(context, r)
            Route.QUEUE -> queueReminder(context, r, nowMillis)
            Route.IGNORE -> Unit
        }
    }

    // 存進排隊並更新靜音通知
    private fun queueReminder(context: Context, r: Reminder, nowMillis: Long) {
        val store = FileReminderQueueStore(java.io.File(context.filesDir, QUEUE_FILE))
        val alive = enqueue(drainAlive(store.load(), nowMillis), r)  // 先丟掉過期的再加入
        store.save(alive)
        showQueueNotification(context, alive.size)
    }

    // 角色出現時呼叫：取出排隊、丟掉過期的、清空排隊並取消靜音通知，回傳要演出的原文
    fun takeReport(context: Context, newScript: String?, nowMillis: Long = System.currentTimeMillis()): String =
        synchronized(lock) {
            val store = FileReminderQueueStore(java.io.File(context.filesDir, QUEUE_FILE))
            val alive = drainAlive(store.load(), nowMillis)  // 先過濾過期再報告
            store.save(emptyList())
            cancelQueueNotification(context)
            reportScript(alive, newScript)  // 每則從平常的臉開始（M16-S07）
        }

    // 角色出現時呼叫（M2 每日詢問、開始聆聽）：同 takeReport，但沒有排隊內容時回 null，不說預設招呼
    fun takeQueuedReport(context: Context, nowMillis: Long = System.currentTimeMillis()): String? =
        synchronized(lock) {
            val store = FileReminderQueueStore(java.io.File(context.filesDir, QUEUE_FILE))
            val alive = drainAlive(store.load(), nowMillis)  // 先過濾過期再報告
            store.save(emptyList())
            cancelQueueNotification(context)
            if (alive.isEmpty()) null else reportScript(alive, null)
        }
}
