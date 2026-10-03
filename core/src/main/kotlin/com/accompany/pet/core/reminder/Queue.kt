package com.accompany.pet.core.reminder

// 常數定義
const val QUEUE_MAX = 20                                   // 排隊最多幾則
const val QUEUE_EXPIRE_MILLIS = 2 * 60 * 60 * 1000L        // 排隊提醒的有效時間：2 小時
const val QUEUE_REPORT_HEADER = "剛剛你在忙，我先記下了："   // 報告排隊內容的開頭
const val DEFAULT_GREETING = "主人叫我嗎？"                 // 沒有任何內容時角色說的話

// 把提醒加到排隊尾端；超過上限時丟掉最舊的
fun enqueue(queue: List<Reminder>, r: Reminder): List<Reminder> = (queue + r).takeLast(QUEUE_MAX)  // 只留最新的 20 則

// 回傳還沒過期的提醒；滿 2 小時算過期
fun drainAlive(queue: List<Reminder>, nowMillis: Long): List<Reminder> =
    queue.filter { nowMillis - it.receivedAtMillis < QUEUE_EXPIRE_MILLIS }  // 年齡小於 2 小時才保留

// 靜音通知的文字
fun queueNoticeText(count: Int): String = "有 $count 則提醒等你"

// 角色出現時要說的話：先報排隊內容，再接新內容
fun reportText(alive: List<Reminder>, newText: String?): String {
    val fresh = newText.orEmpty()  // 新內容（沒有就是空字串）
    if (alive.isEmpty()) return fresh.ifEmpty { DEFAULT_GREETING }
    val lines = alive.joinToString("\n") { "・${it.text}" }  // 每則一行
    val head = QUEUE_REPORT_HEADER + "\n" + lines            // 開頭加排隊內容
    return if (fresh.isEmpty()) head else head + "\n\n" + fresh  // 空一行再接新內容
}
