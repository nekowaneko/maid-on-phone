package com.accompany.pet.spec.m3r

import com.accompany.pet.core.reminder.parseReminder
import com.accompany.pet.core.todoist.TODOIST_SENT_ACTIONS
import com.accompany.pet.core.todoist.TODOIST_VIEWS
import com.accompany.pet.core.todoist.isSendableTodoistAction
import com.accompany.pet.core.todoist.isValidTaskId
import com.accompany.pet.core.todoist.pickTodoistPayload
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// M3 第二輪規格範例表（docs/M3R-EXPENSIVE-PLAN.md §4.5）中 Kotlin 的各列，凍結後不得修改
// 動作清單與畫面種類以接口塊 backend/config/todoist-contract.json 為準（core 沒有 JSON 程式庫，這裡用正規表示式取陣列）
class M3RSpecTest {

    // 常數定義
    private val now = 1_800_000_000_000L  // 固定時間，不讀系統時鐘
    private val contractPath = "backend/config/todoist-contract.json"

    // 從目前目錄往上找契約檔（Gradle 的工作目錄是 core/）
    private fun contractText(): String {
        var dir: File? = File("").absoluteFile
        while (dir != null) {
            val f = File(dir, contractPath)
            if (f.isFile) return f.readText(Charsets.UTF_8)
            dir = dir.parentFile
        }
        throw IllegalStateException("找不到 $contractPath")
    }

    // 取出契約裡某個鍵的字串陣列，例如 "sent": ["a", "b"]
    private fun contractList(key: String): List<String> {
        val body = Regex("\"$key\"\\s*:\\s*\\[([^\\]]*)\\]").find(contractText())?.groupValues?.get(1)
            ?: throw IllegalStateException("契約缺少 $key")
        return Regex("\"([^\"]*)\"").findAll(body).map { it.groupValues[1] }.toList()
    }

    @Test
    fun `M3R-S16 帶 todoist 欄位的推播保留原文，過長或格式不對就丟掉，舊格式照舊`() {
        val payload = """{"view":"p2","taskId":"A01","content":"教師證加科登記"}"""
        val r = parseReminder(mapOf("id" to "todoist-p2-A01-20261007", "text" to "教師證加科登記放了好一陣子了", "todoist" to payload), now)
        assertNotNull(r)
        assertEquals(payload, r!!.todoist)

        val padded = parseReminder(mapOf("id" to "p", "text" to "提醒", "todoist" to "  $payload  "), now)
        assertEquals(payload, padded!!.todoist)

        val tooLong = "{\"content\":\"" + "很".repeat(2100) + "\"}"
        val long = parseReminder(mapOf("id" to "l", "text" to "提醒", "todoist" to tooLong), now)
        assertNotNull(long)
        assertNull(long!!.todoist)
        assertEquals("提醒", long.text)

        val notJson = parseReminder(mapOf("id" to "n", "text" to "提醒", "todoist" to "p2,A01"), now)
        assertNull(notJson!!.todoist)

        val old = parseReminder(mapOf("id" to "old", "text" to "該喝水了"), now)
        assertNotNull(old)
        assertNull(old!!.todoist)
        assertEquals(emptyList<String>(), old.actions)

        assertNull(pickTodoistPayload(null))
        assertNull(pickTodoistPayload(""))
        assertEquals(payload, pickTodoistPayload(payload))
    }

    @Test
    fun `M3R-S17 App 端的動作清單、畫面種類、任務編號格式與契約一致`() {
        assertEquals(contractList("sent"), TODOIST_SENT_ACTIONS)
        assertEquals(contractList("views"), TODOIST_VIEWS)
        for (action in contractList("sent")) assertTrue(action, isSendableTodoistAction(action))
        for (action in listOf("cancel", "confirm_split", "ask_date", "do_today", "", null)) {
            assertFalse("$action", isSendableTodoistAction(action))
        }

        assertTrue(isValidTaskId("A01"))
        assertTrue(isValidTaskId("6X7rM8997g3RQmvh"))
        assertTrue(isValidTaskId("a".repeat(64)))
        assertFalse(isValidTaskId("a".repeat(65)))
        assertFalse(isValidTaskId("task\"1"))
        assertFalse(isValidTaskId("A-01"))
        assertFalse(isValidTaskId(""))
        assertFalse(isValidTaskId(null))
    }
}
