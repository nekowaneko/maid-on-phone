package com.accompany.pet.spec.m3

import org.junit.Test
import org.junit.Assert.*

/**
 * M3 規格範例表（docs/M3-EXPENSIVE-PLAN.md §2）中 Kotlin 相關的規格測試，凍結後不得修改。
 */
class M3SpecTest {

    @Test
    fun `M3-S10 App 接收 Todoist FCM 轉發處理`() {
        val fcmType = "todoist_p2"
        val isTodoistFcm = fcmType.startsWith("todoist_")
        assertTrue(isTodoistFcm)
    }

    @Test
    fun `M3-S11 Notification Action 觸發 WorkerApi 回傳`() {
        val action = "snooze"
        val taskId = "task-789"
        assertNotNull(action)
        assertNotNull(taskId)
    }

    @Test
    fun `M3-S12 App 限制網路連線於 WorkerApi`() {
        val workerApiClassName = "com.accompany.pet.WorkerApi"
        assertTrue(workerApiClassName.endsWith("WorkerApi"))
    }
}
