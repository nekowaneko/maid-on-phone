package com.accompany.pet.core.reminder

import com.accompany.pet.core.drink.parseDrinkActions
import com.accompany.pet.core.todoist.pickTodoistPayload

// 常數定義
const val MAX_TEXT_LENGTH = 500  // 提醒文字最長字數

// 一則提醒：編號（去重用）、要說的話（純文字，給通知欄）、收到的時間、演出用原文（含表情標籤，M1.6）、按鈕動作（M2）、Todoist 負載（M3R）
data class Reminder(
    val id: String,
    val text: String,
    val receivedAtMillis: Long,
    val script: String = text,
    val actions: List<String> = emptyList(),  // 每日詢問的按鈕（resist、speak）；排隊時不保留
    val todoist: String? = null,              // Todoist 負載 JSON 原文
)

// 把推播資料解析成提醒；缺 id、缺 text 或兩者 trim 後為空時回傳 null
fun parseReminder(data: Map<String, String>, nowMillis: Long): Reminder? {
    val id = data["id"]?.trim().orEmpty()          // 提醒編號
    val text = data["text"]?.trim().orEmpty()      // 要說的話
    if (id.isEmpty() || text.isEmpty()) return null  // 缺任何一個就丟掉
    val shown = text.take(MAX_TEXT_LENGTH)           // 過長截斷
    val todoist = pickTodoistPayload(data["todoist"]) // Todoist 負載 JSON 原文
    return Reminder(id, shown, nowMillis, pickScript(data["script"], shown), parseDrinkActions(data["actions"]), todoist)
}

// 選出演出用原文：trim 後非空且不超過上限才採用，否則用顯示用文字
fun pickScript(raw: String?, fallback: String): String {
    val script = raw?.trim().orEmpty()  // 推播帶來的原文（沒有就是空字串）
    return if (script.isNotEmpty() && script.length <= MAX_TEXT_LENGTH) script else fallback  // 不合格就退回純文字
}

