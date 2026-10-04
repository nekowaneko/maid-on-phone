package com.accompany.pet.helper

import com.accompany.pet.core.reminder.DEFAULT_EMOTION_TAG
import com.accompany.pet.core.reminder.DEFAULT_GREETING
import com.accompany.pet.core.reminder.FileReminderQueueStore
import com.accompany.pet.core.reminder.MAX_TEXT_LENGTH
import com.accompany.pet.core.reminder.QUEUE_REPORT_HEADER
import com.accompany.pet.core.reminder.Reminder
import com.accompany.pet.core.reminder.parseReminder
import com.accompany.pet.core.reminder.pickScript
import com.accompany.pet.core.reminder.reportScript
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.util.Base64

// M1.6 輔助測試：script 欄位、排隊報告原文、排隊檔 4 欄的邊界情況（可自由增修）
class M16HelperTest {

    @get:Rule
    val tmp = TemporaryFolder()

    // 把文字編成 Base64（模擬排隊檔的寫法）
    private fun b64(text: String): String = Base64.getEncoder().encodeToString(text.toByteArray(Charsets.UTF_8))

    @Test
    fun `parseReminder 的 script 會 trim`() {
        val r = parseReminder(mapOf("id" to "a", "text" to "好", "script" to "  [smile]好  "), 0L)
        assertNotNull(r)
        assertEquals("[smile]好", r!!.script)
    }

    @Test
    fun `script 全是空白時退回 text`() {
        val r = parseReminder(mapOf("id" to "a", "text" to " 好 ", "script" to "   "), 0L)
        assertEquals("好", r!!.script)
    }

    @Test
    fun `script 剛好 500 字可用，501 字退回截斷後的 text`() {
        val exact = "喝".repeat(MAX_TEXT_LENGTH)
        assertEquals(exact, parseReminder(mapOf("id" to "a", "text" to "t", "script" to exact), 0L)!!.script)
        val longText = "x".repeat(MAX_TEXT_LENGTH + 10)
        val r = parseReminder(mapOf("id" to "a", "text" to longText, "script" to exact + "喝"), 0L)!!
        assertEquals(MAX_TEXT_LENGTH, r.text.length)
        assertEquals(r.text, r.script)
    }

    @Test
    fun `script 長度以 trim 後計算`() {
        val exact = "喝".repeat(MAX_TEXT_LENGTH)
        assertEquals(exact, pickScript("  $exact  ", "備用"))
        assertEquals("備用", pickScript(null, "備用"))
    }

    @Test
    fun `缺 text 時即使有 script 也丟掉`() {
        assertEquals(null, parseReminder(mapOf("id" to "a", "script" to "[pout]x"), 0L))
    }

    @Test
    fun `reportScript 各種組合`() {
        val q = listOf(Reminder("1", "甲", 0, "[pout]甲"), Reminder("2", "乙", 0))
        assertEquals(DEFAULT_GREETING, reportScript(emptyList(), null))
        assertEquals(DEFAULT_GREETING, reportScript(emptyList(), ""))
        assertEquals("[smile]新", reportScript(emptyList(), "[smile]新"))
        assertEquals(
            "$QUEUE_REPORT_HEADER\n$DEFAULT_EMOTION_TAG・[pout]甲\n$DEFAULT_EMOTION_TAG・乙\n\n$DEFAULT_EMOTION_TAG[smile]新",
            reportScript(q, "[smile]新"),
        )
        assertEquals("$QUEUE_REPORT_HEADER\n$DEFAULT_EMOTION_TAG・乙", reportScript(q.drop(1), ""))
    }

    @Test
    fun `排隊檔寫入一律 4 欄且可還原 script`() {
        val file = tmp.newFile("q.txt")
        val items = listOf(Reminder("1", "甲", 10L, "[pout]甲\n\t尾"), Reminder("2", "乙", 20L))
        FileReminderQueueStore(file).save(items)
        assertTrue(file.readLines().all { it.split("\t").size == 4 })
        assertEquals(items, FileReminderQueueStore(file).load())
    }

    @Test
    fun `排隊檔新舊格式混在一起都能讀，其他欄數與壞掉的 script 略過`() {
        val file = tmp.newFile("q.txt")
        val lines = listOf(
            listOf("1", b64("a"), b64("舊")).joinToString("\t"),
            listOf("2", b64("b"), b64("新"), b64("[pout]新")).joinToString("\t"),
            listOf("3", b64("c"), b64("五"), b64("x"), b64("y")).joinToString("\t"),
            listOf("4", b64("d"), b64("壞"), "%%%").joinToString("\t"),
            listOf("5", b64("e")).joinToString("\t"),
        )
        file.writeText(lines.joinToString("\n"))
        val loaded = FileReminderQueueStore(file).load()
        assertEquals(listOf(Reminder("a", "舊", 1L, "舊"), Reminder("b", "新", 2L, "[pout]新")), loaded)
    }
}
