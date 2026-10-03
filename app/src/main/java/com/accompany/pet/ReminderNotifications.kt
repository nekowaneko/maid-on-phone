package com.accompany.pet

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat
import com.accompany.pet.core.reminder.Reminder
import com.accompany.pet.core.reminder.queueNoticeText

// 常數定義
const val CHANNEL_REMINDERS = "reminders"   // 一般提醒頻道
const val CHANNEL_QUEUE = "queue"           // 靜音排隊頻道
const val QUEUE_NOTIFICATION_ID = 2         // 排隊通知固定編號（之後只更新數字）
const val REMINDER_NOTIFICATION_BASE = 100  // 一般提醒通知編號的起點

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

// 點通知後送給角色服務的 PendingIntent（text 為 null 表示只叫出角色、報告排隊）
private fun showPending(context: Context, requestCode: Int, text: String?): PendingIntent {
    val intent = Intent(context, OverlayService::class.java).setAction(ACTION_SHOW)
    if (text != null) intent.putExtra(EXTRA_TEXT, text)
    return PendingIntent.getForegroundService(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
}

// 一般通知：頭像＋提醒文字，點一下叫出角色顯示同一則（M1 不加按鈕）
fun showReminderNotification(context: Context, r: Reminder) {
    ensureChannels(context)
    val id = REMINDER_NOTIFICATION_BASE + (r.id.hashCode() and 0x0FFFFFFF)  // 同編號覆蓋同一則
    val n: Notification = NotificationCompat.Builder(context, CHANNEL_REMINDERS)
        .setSmallIcon(R.drawable.ic_launcher_foreground)
        .setContentTitle("陪伴角色")
        .setContentText(r.text)
        .setStyle(NotificationCompat.BigTextStyle().bigText(r.text))
        .setContentIntent(showPending(context, id, r.text))
        .setAutoCancel(true)
        .build()
    manager(context).notify(id, n)
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
