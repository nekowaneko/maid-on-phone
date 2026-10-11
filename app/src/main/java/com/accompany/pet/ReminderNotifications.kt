package com.accompany.pet

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.accompany.pet.core.drink.pushActionLabel
import com.accompany.pet.core.reminder.Reminder
import com.accompany.pet.core.reminder.queueNoticeText

// 常數定義
const val CHANNEL_REMINDERS = "reminders"   // 一般提醒頻道
const val CHANNEL_QUEUE = "queue"           // 靜音排隊頻道
const val QUEUE_NOTIFICATION_ID = 2         // 排隊通知固定編號（之後只更新數字）
const val REMINDER_NOTIFICATION_BASE = 100  // 一般提醒通知編號的起點
const val DRINK_REQUEST_CODE_STEP = 0x10000000  // 通知按鈕 requestCode 的間隔（通知編號小於這個數）

// 取得通知管理員
private fun manager(context: Context) = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

// 建立兩個通知頻道（重複建立沒有副作用）
private fun ensureChannels(context: Context) {
    val nm = manager(context)
    nm.createNotificationChannel(NotificationChannel(CHANNEL_REMINDERS, "提醒", NotificationManager.IMPORTANCE_DEFAULT))
    val queue = NotificationChannel(CHANNEL_QUEUE, "排隊中的提醒", NotificationManager.IMPORTANCE_MIN).apply {
        setSound(null, null)       // 不出聲
        enableVibration(false)     // 不震動
        setShowBadge(false)
    }
    nm.createNotificationChannel(queue)
}

// 點通知後送給角色服務的 PendingIntent（script 為要演出的原文；null 表示只叫出角色、報告排隊；todoistJson 有值時角色帶出 Todoist 按鈕）
private fun showPending(context: Context, requestCode: Int, script: String?, todoistJson: String? = null): PendingIntent {
    val intent = Intent(context, OverlayService::class.java).setAction(ACTION_SHOW)
    if (script != null) intent.putExtra(EXTRA_TEXT, script)
    if (todoistJson != null) {
        intent.putExtra(EXTRA_TODOIST_JSON, todoistJson)
        if (script != null) intent.putExtra(EXTRA_TODOIST_SCRIPT, script)
    }
    return PendingIntent.getForegroundService(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
}

// 點通知後開啟盤前均線明細畫面的 PendingIntent（M4）
private fun maPending(context: Context, requestCode: Int): PendingIntent {
    val intent = Intent(context, MaActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
}

// 提醒通知的編號：同編號覆蓋同一則
fun reminderNotificationId(reminderId: String): Int = REMINDER_NOTIFICATION_BASE + (reminderId.hashCode() and 0x0FFFFFFF)

// 通知按鈕送給 DrinkActionReceiver 的 PendingIntent；每則通知、每個按鈕的 requestCode 都不同
private fun drinkActionPending(context: Context, notificationId: Int, action: String, index: Int): PendingIntent {
    val intent = Intent(context, DrinkActionReceiver::class.java)
        .setAction(ACTION_DRINK_BUTTON)
        .putExtra(EXTRA_DRINK_ACTION, action)
        .putExtra(EXTRA_NOTIFICATION_ID, notificationId)
    val requestCode = notificationId + (index + 1) * DRINK_REQUEST_CODE_STEP  // 與點通知本身的 requestCode 錯開
    return PendingIntent.getBroadcast(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
}

// 一般通知：頭像＋提醒文字（純文字，看不到標籤），點一下叫出角色用原文演出同一則
// M2：帶 actions 時加上「沒喝」「有喝，用說的」按鈕（不認得的已在 parseReminder 略過）
// M4：帶 ma 時通知點擊開 MaActivity，不加按鈕
fun showReminderNotification(context: Context, r: Reminder) {
    ensureChannels(context)
    val id = reminderNotificationId(r.id)
    val contentIntent = if (r.ma != null) {
        maPending(context, id)
    } else {
        showPending(context, id, r.script, r.todoist)  // Todoist 提醒點通知也要帶按鈕
    }
    val builder = NotificationCompat.Builder(context, CHANNEL_REMINDERS)
        .setSmallIcon(R.drawable.ic_launcher_foreground)
        .setContentTitle("陪伴角色")
        .setContentText(r.text)
        .setStyle(NotificationCompat.BigTextStyle().bigText(r.text))
        .setContentIntent(contentIntent)  // ma 開明細，其餘角色用原文演出（M16-S09）
        .setAutoCancel(true)
    if (r.ma == null) {
        r.actions.forEachIndexed { index, action ->
            val label = pushActionLabel(action) ?: return@forEachIndexed  // 保險：不認得的按鈕略過
            builder.addAction(0, label, drinkActionPending(context, id, action, index))
        }
    }
    manager(context).notify(id, builder.build())
}

// 按通知按鈕後的結果通知：取代原通知，顯示回應的 text；點一下叫出角色用原文演出
fun showDrinkResultNotification(context: Context, notificationId: Int, text: String, script: String?) {
    ensureChannels(context)
    val n: Notification = NotificationCompat.Builder(context, CHANNEL_REMINDERS)
        .setSmallIcon(R.drawable.ic_launcher_foreground)
        .setContentTitle("陪伴角色")
        .setContentText(text)
        .setStyle(NotificationCompat.BigTextStyle().bigText(text))
        .setContentIntent(showPending(context, notificationId, script?.takeIf { it.isNotBlank() } ?: text))
        .setOnlyAlertOnce(true)
        .setAutoCancel(true)
        .build()
    manager(context).notify(notificationId, n)
}

// 取消一則提醒通知
fun cancelReminderNotification(context: Context, notificationId: Int) {
    manager(context).cancel(notificationId)
}

// 靜音通知：「有 N 則提醒等你」，點一下叫出角色並報告排隊內容
fun showQueueNotification(context: Context, count: Int) {
    ensureChannels(context)
    val n: Notification = NotificationCompat.Builder(context, CHANNEL_QUEUE)
        .setSmallIcon(R.drawable.ic_launcher_foreground)
        .setContentTitle(queueNoticeText(count))
        .setPriority(NotificationCompat.PRIORITY_MIN)
        .setSilent(true)
        .setOnlyAlertOnce(true)
        .setContentIntent(showPending(context, QUEUE_NOTIFICATION_ID, null))
        .setAutoCancel(true)
        .build()
    manager(context).notify(QUEUE_NOTIFICATION_ID, n)
}

// 取消靜音排隊通知
fun cancelQueueNotification(context: Context) {
    manager(context).cancel(QUEUE_NOTIFICATION_ID)
}
