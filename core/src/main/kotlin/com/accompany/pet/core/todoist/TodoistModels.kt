package com.accompany.pet.core.todoist

// 常數定義
const val TODOIST_ACTION_SNOOZE = "snooze"
const val TODOIST_ACTION_DO_TODAY = "do_today"
const val TODOIST_ACTION_SPLIT = "split"
const val TODOIST_ACTION_ASK_DATE = "ask_date"

/**
 * Todoist 推播與動作資料模型（純 Kotlin，不含 Android 依賴）
 */
data class TodoistActionPayload(
    val action: String,
    val taskId: String,
    val extra: String? = null
)

/**
 * 驗證 Todoist 動作代碼是否在支援清單中
 */
fun isValidTodoistAction(action: String): Boolean {
    return action in listOf(
        TODOIST_ACTION_SNOOZE,
        TODOIST_ACTION_DO_TODAY,
        TODOIST_ACTION_SPLIT,
        TODOIST_ACTION_ASK_DATE
    )
}

/**
 * 將動作資料封裝為 JSON 字串
 */
fun buildTodoistActionJson(action: String, taskId: String): String {
    return """{"action":"$action","taskId":"$taskId"}"""
}
