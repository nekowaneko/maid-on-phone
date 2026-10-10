package com.accompany.pet.helper

import com.accompany.pet.core.ma.MA_ENTRY_EMPTY
import com.accompany.pet.core.ma.MA_ENTRY_FAILED
import com.accompany.pet.core.ma.MA_ENTRY_NONE
import com.accompany.pet.core.ma.MA_ENTRY_NOT_SET
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
    @Test
    fun `maDateLabel 世紀閏年規則`() {
        assertEquals("2/29（二）", maDateLabel("2000-02-29")) // 可被 400 整除是閏年
        assertEquals("2/29（二）", maDateLabel("2028-02-29"))
        assertEquals("2/29（二）", maDateLabel("2400-02-29"))
        assertNull(maDateLabel("1900-02-29")) // 可被 100 不可被 400 整除不是閏年
        assertNull(maDateLabel("2100-02-29"))
        assertNull(maDateLabel("2026-02-29"))
    }

    @Test
    fun `maDateLabel 一二月與三月星期推算邊界`() {
        assertEquals("3/1（日）", maDateLabel("2026-03-01"))
        assertEquals("3/1（五）", maDateLabel("2024-03-01"))
        assertEquals("3/31（二）", maDateLabel("2026-03-31"))
        assertEquals("1/1（四）", maDateLabel("2026-01-01"))
    }

    @Test
    fun `maDateLabel 年月日上下界`() {
        assertEquals("1/1（一）", maDateLabel("0001-01-01"))
        assertNull(maDateLabel("0000-01-01"))
        assertEquals("12/31（四）", maDateLabel("2026-12-31"))
        assertNull(maDateLabel("2026-00-10"))
        assertNull(maDateLabel("2026-10-00"))
        assertNull(maDateLabel("2026-10-32"))
        assertEquals("4/30（四）", maDateLabel("2026-04-30"))
        assertEquals("1/31（六）", maDateLabel("2026-01-31"))
        assertNull(maDateLabel("2026-06-31"))
    }

    @Test
    fun `parseMaReportBrief counts 缺少某個鍵時該欄位為 null`() {
        val brief = parseMaReportBrief("""{"status":"ok","reportDate":"2026-10-14","counts":{"u":1}}""")
        assertEquals(1, brief.u)
        assertNull(brief.d)
        assertNull(brief.m)
    }

    @Test
    fun `maEntrySubtitle 各狀態與零檔數`() {
        fun brief(status: String?, u: Int? = 1, d: Int? = 2, m: Int? = 3) =
            MaReportBrief(status, "2026-10-12", u, d, m)
        assertEquals("10/12（一）・多頭 1、空頭 2、其他 3", maEntrySubtitle(MaFetch.RESPONDED, 200, brief("ok")))
        assertEquals("10/12（一）・多頭 0、空頭 0、其他 0", maEntrySubtitle(MaFetch.RESPONDED, 200, brief("ok", 0, 0, 0)))
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.RESPONDED, 200, brief("ok", -1, 0, 0)))
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.RESPONDED, 200, brief("ok", 0, -1, 0)))
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.RESPONDED, 200, brief("ok", 0, 0, -1)))
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.RESPONDED, 200, brief("ok", null)))
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.RESPONDED, 200, brief("ok", 1, null)))
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.RESPONDED, 200, brief("ok", 1, 1, null)))
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.RESPONDED, 200, brief(null)))
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.RESPONDED, 200, brief("failed")))
        assertEquals(MA_ENTRY_EMPTY, maEntrySubtitle(MaFetch.RESPONDED, 200, brief("empty")))
        assertEquals(MA_ENTRY_NONE, maEntrySubtitle(MaFetch.RESPONDED, 200, brief("none")))
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.RESPONDED, 200, brief("xyz")))
        assertEquals(MA_ENTRY_NOT_SET, maEntrySubtitle(MaFetch.NOT_SET, 200, brief("ok")))
        assertEquals(MA_ENTRY_FAILED, maEntrySubtitle(MaFetch.UNREACHABLE, 200, brief("ok")))
    }
}
