package com.accompany.pet.spec.m2

import com.accompany.pet.core.reminder.parseReminder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

// M2 規格範例表（docs/M2-EXPENSIVE-PLAN.md §4.5）轉寫的測試，凍結後不得修改
class M2SpecTest {

    // 常數定義
    private val now = 1_800_000_000_000L  // 固定時間，不讀系統時鐘

    @Test
    fun `M2-S13 詢問推播有兩個按鈕，不認得的按鈕略過，舊格式沒有按鈕`() {
        val ask = parseReminder(mapOf("id" to "drink-question-2026-10-07", "text" to "今天有喝飲料嗎？", "actions" to "resist,speak"), now)
        assertNotNull(ask)
        assertEquals(listOf("resist", "speak"), ask!!.actions)

        val unknown = parseReminder(mapOf("id" to "m2-unknown", "text" to "今天有喝飲料嗎？", "actions" to "resist,dance"), now)
        assertNotNull(unknown)
        assertEquals(listOf("resist"), unknown!!.actions)

        val old = parseReminder(mapOf("id" to "old", "text" to "該喝水了"), now)
        assertNotNull(old)
        assertEquals(emptyList<String>(), old!!.actions)
    }
}
