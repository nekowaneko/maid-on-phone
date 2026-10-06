package com.accompany.pet.todoist

import com.accompany.pet.WorkerApi
import com.accompany.pet.WorkerResult
import com.accompany.pet.core.todoist.buildTodoistActionJson
import com.accompany.pet.core.todoist.isValidTodoistAction

/**
 * 處理來自懸浮窗或通知按鈕的 Todoist 動作請求
 */
object TodoistActionHandler {

    /**
     * 送出動作至 Worker API
     */
    fun sendAction(action: String, taskId: String, callback: (Boolean) -> Unit) {
        if (!isValidTodoistAction(action)) {
            callback(false)
            return
        }
        val body = buildTodoistActionJson(action, taskId)
        WorkerApi.post("/api/todoist/action", body) { result: WorkerResult ->
            callback(result.status in 200..299)
        }
    }
}
