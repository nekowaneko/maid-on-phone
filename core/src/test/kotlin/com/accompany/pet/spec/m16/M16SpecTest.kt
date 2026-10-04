package com.accompany.pet.spec.m16

import com.accompany.pet.core.reminder.FileReminderQueueStore
import com.accompany.pet.core.reminder.Reminder
import com.accompany.pet.core.reminder.parseReminder
import com.accompany.pet.core.reminder.reportScript
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Test
import java.io.File
import java.util.Base64

// M1.6 規格範例表（docs/M1.6-EXPENSIVE-PLAN.md §4.5）轉寫的測試，凍結後不得修改
class M16SpecTest {

    // 常數定義
    private val plain = "真拿主人沒辦法。水記得喝。"                    // 顯示用文字
    private val tagged = "[pout]真拿主人沒辦法。[smile]水記得喝。"      // 原文（含表情標籤）
    private val now = 1_800_000_000_000L                                // 固定時間，不讀系統時鐘

    // 新格式推播的資料欄位
    private fun newFormat(): Map<String, String> = mapOf("id" to "m16", "text" to plain, "script" to tagged)

    // 把文字編成 Base64（模擬舊版排隊檔的寫法）
    private fun b64(text: String): String = Base64.getEncoder().encodeToString(text.toByteArray(Charsets.UTF_8))

    @Test
    fun `M16-S03 角色模式關時通知欄顯示純文字看不到方括號`() {
        val r = parseReminder(newFormat(), now)
        assertNotNull(r)
        assertEquals(plain, r!!.text)
        assertFalse(r.text.contains("["))
    }

    @Test
    fun `M16-S04 角色模式開時角色演出用的是原文`() {
        val r = parseReminder(newFormat(), now)
        assertNotNull(r)
        assertEquals(tagged, r!!.script)
    }

    @Test
    fun `M16-S05 舊格式推播照常處理且演出用同一段文字`() {
        val r = parseReminder(mapOf("id" to "old", "text" to "該喝水了"), now)
        assertNotNull(r)
        assertEquals("該喝水了", r!!.text)
        assertEquals("該喝水了", r.script)
    }

    @Test
    fun `M16-S06 原文超過500字時不閃退並改用顯示用文字演出`() {
        val longScript = "[pout]" + "喝".repeat(500)
        val r = parseReminder(mapOf("id" to "long", "text" to plain, "script" to longScript), now)
        assertNotNull(r)
        assertEquals(plain, r!!.text)
        assertEquals(plain, r.script)
    }

    @Test
    fun `M16-S07 排隊兩則依收到順序報告且第二則換回平常的臉`() {
        val first = Reminder("1", "第一則", now, "[pout]第一則")
        val second = Reminder("2", "第二則", now + 1, "第二則")
        val report = reportScript(listOf(first, second), null)
        assertEquals("剛剛你在忙，我先記下了：\n[neutral]・[pout]第一則\n[neutral]・第二則", report)
    }

    @Test
    fun `M16-S08 更新前的舊版排隊檔更新後照常報告一則都不少`() {
        val file = File.createTempFile("m16-queue", ".txt")
        try {
            val oldLines = listOf(
                listOf((now - 2000).toString(), b64("a"), b64("第一則")).joinToString("\t"),
                listOf((now - 1000).toString(), b64("b"), b64("第二則")).joinToString("\t"),
            )
            file.writeText(oldLines.joinToString("\n"))
            val loaded = FileReminderQueueStore(file).load()
            assertEquals(listOf("a", "b"), loaded.map { it.id })
            assertEquals(listOf("第一則", "第二則"), loaded.map { it.text })
            assertEquals(listOf("第一則", "第二則"), loaded.map { it.script })
        } finally {
            file.delete()
        }
    }
}
