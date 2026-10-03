package com.accompany.pet.core.reminder

// 常數定義
const val MAX_TEXT_LENGTH = 500  // 提醒文字最長字數

// 一則提醒：編號（去重用）、要說的話、收到的時間
data class Reminder(val id: String, val text: String, val receivedAtMillis: Long)

// 把推播資料解析成提醒；缺 id、缺 text 或兩者 trim 後為空時回傳 null
fun parseReminder(data: Map<String, String>, nowMillis: Long): Reminder? = TODO()
