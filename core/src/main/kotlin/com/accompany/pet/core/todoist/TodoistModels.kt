package com.accompany.pet.core.todoist

// 常數定義
val TODOIST_SENT_ACTIONS: List<String> = listOf("doToday", "snooze", "tomorrow", "split", "confirmSplit", "setDate", "unknownDate")
val TODOIST_VIEWS: List<String> = listOf("p2", "p3", "askDate")

private val TASK_ID_REGEX = Regex("^[0-9A-Za-z_]{1,64}$")

/**
 * 檢查任務 ID 格式是否合法（1~64 碼英數字或底線）
 */
fun isValidTaskId(id: String?): Boolean {
    if (id == null) return false
    return TASK_ID_REGEX.matches(id)
}

/**
 * 解析並清理 Todoist 負載：null、超過 2048 字、trim 後不是 { 開頭 } 結尾 → null；否則回 trim 後原文
 */
fun pickTodoistPayload(raw: String?): String? {
    if (raw == null) return null
    val trimmed = raw.trim()
    if (trimmed.length > 2048) return null
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null
    return trimmed
}

/**
 * 判斷動作代碼是否在可以送出的 Todoist 動作清單內
 */
fun isSendableTodoistAction(action: String?): Boolean {
    if (action == null) return false
    return action in TODOIST_SENT_ACTIONS
}

