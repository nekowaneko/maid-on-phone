package com.accompany.pet.spec.m41

import com.accompany.pet.core.chat.ChatAction
import com.accompany.pet.core.chat.decideChat
import com.accompany.pet.core.ma.MA_ENTRY_EMPTY
import com.accompany.pet.core.ma.MA_ENTRY_FAILED
import com.accompany.pet.core.ma.MA_ENTRY_LOADING
import com.accompany.pet.core.ma.MA_ENTRY_NONE
import com.accompany.pet.core.ma.MA_ENTRY_NOT_SET
import com.accompany.pet.core.ma.MaFetch
import com.accompany.pet.core.ma.MaReportBrief
import com.accompany.pet.core.ma.maEntryLoadingText
import com.accompany.pet.core.ma.maEntrySubtitle
import com.accompany.pet.core.ma.parseMaReportBrief
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test

// M4.1 規格範例表（docs/M4.1-EXPENSIVE-PLAN.md §4.5）中 Kotlin 規格測試列（S01～S09、S14），凍結後不得修改
class M41SpecTest {

    @Test
    fun `M41-S01 最近一份報告是 10月12日（週一），資料正常，多頭 1 檔、空頭 1 檔、其他 3 檔`() {
        val brief = MaReportBrief(status = "ok", reportDate = "2026-10-12", u = 1, d = 1, m = 3)
        val text = maEntrySubtitle(MaFetch.RESPONDED, 200, brief)
        assertEquals("10/12（一）・多頭 1、空頭 1、其他 3", text)
    }

    @Test
    fun `M41-S02 最近一份報告是 10月16日（週五），資料正常，多頭 2 檔、空頭 0 檔、其他 0 檔`() {
        val brief = MaReportBrief(status = "ok", reportDate = "2026-10-16", u = 2, d = 0, m = 0)
        val text = maEntrySubtitle(MaFetch.RESPONDED, 200, brief)
        assertEquals("10/16（五）・多頭 2、空頭 0、其他 0", text)
    }

    @Test
    fun `M41-S03 伺服器回報「今天的資料沒拿到」（證交所取得失敗），副標顯示「今天的資料沒拿到，點了可重試」，不顯示任何檔數`() {
        val brief = MaReportBrief(status = "failed", reportDate = "2026-10-12", u = null, d = null, m = null)
        val text = maEntrySubtitle(MaFetch.RESPONDED, 200, brief)
        assertEquals(MA_ENTRY_FAILED, text)
        assertEquals("今天的資料沒拿到，點了可重試", text)
        assertFalse(text.any { it.isDigit() })
    }

    @Test
    fun `M41-S04 App 連不上伺服器（沒網路或逾時），副標顯示「今天的資料沒拿到，點了可重試」，卡片仍可點`() {
        val text = maEntrySubtitle(MaFetch.UNREACHABLE, 0, null)
        assertEquals(MA_ENTRY_FAILED, text)
        assertEquals("今天的資料沒拿到，點了可重試", text)
    }

    @Test
    fun `M41-S05 追蹤清單是空的，副標顯示「還沒有追蹤標的，點了去加入」`() {
        val brief = MaReportBrief(status = "empty", reportDate = null, u = 0, d = 0, m = 0)
        val text = maEntrySubtitle(MaFetch.RESPONDED, 200, brief)
        assertEquals(MA_ENTRY_EMPTY, text)
        assertEquals("還沒有追蹤標的，點了去加入", text)
    }

    @Test
    fun `M41-S06 清單有標的但還沒有任何報告，副標顯示還沒有報告，明天 08點30 會送來`() {
        val brief = MaReportBrief(status = "none", reportDate = null, u = null, d = null, m = null)
        val text = maEntrySubtitle(MaFetch.RESPONDED, 200, brief)
        assertEquals(MA_ENTRY_NONE, text)
        assertEquals("還沒有報告，明天 08:30 會送來", text)
    }

    @Test
    fun `M41-S07 App 還沒設定連線（沒有聊天網址或存取密鑰），副標顯示「尚未設定連線」，不連線`() {
        val text = maEntrySubtitle(MaFetch.NOT_SET, 0, null)
        assertEquals(MA_ENTRY_NOT_SET, text)
        assertEquals("尚未設定連線", text)
    }

    @Test
    fun `M41-S08 資料還沒回來的那段時間，副標顯示「正在取得今天的資料…」`() {
        val text = maEntryLoadingText()
        assertEquals(MA_ENTRY_LOADING, text)
        assertEquals("正在取得今天的資料…", text)
    }

    @Test
    fun `M41-S09 伺服器回的內容怪怪的（狀態不認得，或檔數是負數、不是數字），副標顯示「今天的資料沒拿到，點了可重試」，不顯示怪數字`() {
        // 1. 狀態不認得
        val weird = MaReportBrief(status = "weird", reportDate = "2026-10-12", u = 1, d = 1, m = 3)
        val r1 = maEntrySubtitle(MaFetch.RESPONDED, 200, weird)
        assertEquals(MA_ENTRY_FAILED, r1)
        assertFalse(r1.any { it.isDigit() })

        // 2. 檔數是負數
        val negative = MaReportBrief(status = "ok", reportDate = "2026-10-12", u = -1, d = 1, m = 3)
        val r2 = maEntrySubtitle(MaFetch.RESPONDED, 200, negative)
        assertEquals(MA_ENTRY_FAILED, r2)
        assertFalse(r2.any { it.isDigit() })

        // 3. 檔數不是數字（由 parseMaReportBrief 解析出 u 為 null）
        val notNumBrief = parseMaReportBrief("""{"status":"ok","reportDate":"2026-10-12","counts":{"u":"x","d":1,"m":3}}""")
        val r3 = maEntrySubtitle(MaFetch.RESPONDED, 200, notNumBrief)
        assertEquals(MA_ENTRY_FAILED, r3)
        assertFalse(r3.any { it.isDigit() })

        // 4. HTTP 非 200（例如 500）
        val okBrief = MaReportBrief(status = "ok", reportDate = "2026-10-12", u = 1, d = 1, m = 3)
        val r4 = maEntrySubtitle(MaFetch.RESPONDED, 500, okBrief)
        assertEquals(MA_ENTRY_FAILED, r4)
        assertFalse(r4.any { it.isDigit() })
    }

    @Test
    fun `M41-S14 聊天網址沒設定，在主畫面點「聊聊」卡片，不開聊天畫面，顯示現有的「尚未設定」訊息`() {
        assertEquals(ChatAction.SHOW_NOT_SET, decideChat(null))
        assertEquals(ChatAction.SHOW_NOT_SET, decideChat(""))
        assertEquals(ChatAction.OPEN, decideChat("https://example.com"))
    }
}
