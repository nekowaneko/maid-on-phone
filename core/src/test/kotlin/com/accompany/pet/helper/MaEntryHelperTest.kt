package com.accompany.pet.helper

import com.accompany.pet.core.ma.MA_ENTRY_FAILED
import com.accompany.pet.core.ma.MA_EXIT_URL
import com.accompany.pet.core.ma.MaFetch
import com.accompany.pet.core.ma.MaReportBrief
import com.accompany.pet.core.ma.isMaExitUrl
import com.accompany.pet.core.ma.maDateLabel
import com.accompany.pet.core.ma.maEntrySubtitle
import com.accompany.pet.core.ma.parseMaReportBrief
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// M4.1 盤前均線卡片副標與解析純函式輔助測試（解析、日期、邊界）
class MaEntryHelperTest {

    @Test
    fun `maDateLabel 正確轉換星期二至星期日與月底`() {
        assertEquals("10/13（二）", maDateLabel("2026-10-13"))
        assertEquals("10/14（三）", maDateLabel("2026-10-14"))
        assertEquals("10/15（四）", maDateLabel("2026-10-15"))
        assertEquals("10/16（五）", maDateLabel("2026-10-16"))
        assertEquals("10/17（六）", maDateLabel("2026-10-17"))
        assertEquals("10/18（日）", maDateLabel("2026-10-18"))
        assertEquals("10/31（六）", maDateLabel("2026-10-31"))
    }

    @Test
    fun `maDateLabel 閏年二月二十九日與非閏年邊界`() {
        assertEquals("2/29（四）", maDateLabel("2024-02-29")) // 2024 是閏年
        assertNull(maDateLabel("2023-02-29")) // 2023 不是閏年
        assertEquals("2/28（三）", maDateLabel("2024-02-28"))
        assertEquals("2/28（二）", maDateLabel("2023-02-28"))
        assertEquals("1/5（一）", maDateLabel("2026-01-05")) // 月份與日期不補零
    }

    @Test
    fun `maDateLabel 格式錯誤或不存在的日期回傳 null`() {
        assertNull(maDateLabel(null))
        assertNull(maDateLabel(""))
        assertNull(maDateLabel("2026/10/12"))
        assertNull(maDateLabel("2026-13-01"))
        assertNull(maDateLabel("2026-04-31")) // 4 月只有 30 天
        assertNull(maDateLabel("not-a-date"))
    }

    @Test
    fun `parseMaReportBrief 解析標準回應與缺漏欄位`() {
        val json = """{"status":"ok","reportDate":"2026-10-14","counts":{"u":3,"d":2,"m":5},"items":[{"symbol":"2330"}]}"""
        val brief = parseMaReportBrief(json)
        assertEquals("ok", brief.status)
        assertEquals("2026-10-14", brief.reportDate)
        assertEquals(3, brief.u)
        assertEquals(2, brief.d)
        assertEquals(5, brief.m)
    }

    @Test
    fun `parseMaReportBrief 處理非 JSON 或字串型別的數字`() {
        val nonJson = parseMaReportBrief("hello")
        assertNull(nonJson.status)
        assertNull(nonJson.u)

        val strNum = """{"status":"ok","reportDate":"2026-10-14","counts":{"u":"3","d":2,"m":5}}"""
        val strBrief = parseMaReportBrief(strNum)
        assertEquals("ok", strBrief.status)
        assertNull(strBrief.u) // "3" 是字串，視為型別錯誤回傳 null
        assertEquals(2, strBrief.d)
        assertEquals(5, strBrief.m)
    }

    @Test
    fun `parseMaReportBrief 處理小數點與負數`() {
        val floatNum = """{"status":"ok","reportDate":"2026-10-14","counts":{"u":3.5,"d":2,"m":5}}"""
        val floatBrief = parseMaReportBrief(floatNum)
        assertNull(floatBrief.u) // 帶小數點視為非整數型別錯誤

        val negNum = """{"status":"ok","reportDate":"2026-10-14","counts":{"u":-2,"d":0,"m":1}}"""
        val negBrief = parseMaReportBrief(negNum)
        assertEquals(-2, negBrief.u)
    }

    @Test
    fun `isMaExitUrl 嚴格比對 MA_EXIT_URL`() {
        assertTrue(isMaExitUrl(MA_EXIT_URL))
        assertTrue(isMaExitUrl("ma-exit://close"))
        assertFalse(isMaExitUrl("MA-EXIT://close")) // 不分大小寫的 scheme 亦不放行
        assertFalse(isMaExitUrl("ma-exit://close/"))
        assertFalse(isMaExitUrl("https://example.com"))
        assertFalse(isMaExitUrl(null))
        assertFalse(isMaExitUrl(""))
    }

    @Test
    fun `maEntrySubtitle 邊界情況檢查`() {
        // brief 為 null
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.RESPONDED, 200, null))
        // httpStatus 為 404
        val okBrief = MaReportBrief("ok", "2026-10-12", 1, 1, 1)
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.RESPONDED, 404, okBrief))
        // 檔數為負數
        val negBrief = MaReportBrief("ok", "2026-10-12", -1, 1, 1)
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.RESPONDED, 200, negBrief))
        // 日期格式錯誤
        val badDateBrief = MaReportBrief("ok", "bad-date", 1, 1, 1)
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.RESPONDED, 200, badDateBrief))
    }
}
