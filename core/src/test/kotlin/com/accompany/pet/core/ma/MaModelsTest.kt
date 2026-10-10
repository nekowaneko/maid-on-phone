package com.accompany.pet.core.ma

import com.accompany.pet.core.reminder.Reminder
import com.accompany.pet.core.reminder.parseReminder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// 盤前均線核心領域模型與純函式輔助測試（C 線單元測試）
class MaModelsTest {

    // 測試 pickMaPayload：有效負載應正常回傳，前後空白需被 trim
    @Test
    fun pickMaPayloadValid() {
        val payload = "  {\"date\":\"2026-10-10\",\"u\":3,\"d\":1,\"m\":2,\"status\":\"ok\"}  "
        val expected = "{\"date\":\"2026-10-10\",\"u\":3,\"d\":1,\"m\":2,\"status\":\"ok\"}"
        assertEquals(expected, pickMaPayload(payload))
    }

    // 測試 pickMaPayload：空值與非 JSON 物件結構時回傳 null
    @Test
    fun pickMaPayloadInvalidStructure() {
        assertNull(pickMaPayload(null))
        assertNull(pickMaPayload(""))
        assertNull(pickMaPayload("   "))
        assertNull(pickMaPayload("not-json"))
        assertNull(pickMaPayload("[1, 2, 3]"))
        assertNull(pickMaPayload("{unclosed"))
        assertNull(pickMaPayload("unopened}"))
    }

    // 測試 pickMaPayload：長度超過 2048 字元時回傳 null
    @Test
    fun pickMaPayloadLengthLimit() {
        val exactValid = "{" + "a".repeat(2046) + "}" // 剛好 2048 字元
        assertEquals(2048, exactValid.length)
        assertEquals(exactValid, pickMaPayload(exactValid))

        val tooLong = "{" + "a".repeat(2047) + "}" // 2049 字元
        assertEquals(2049, tooLong.length)
        assertNull(pickMaPayload(tooLong))
    }

    // 測試 maPageUrl：正常解析 HTTPS 網址並加上路徑
    @Test
    fun maPageUrlValid() {
        assertEquals("https://pet.example.workers.dev/web/ma.html", maPageUrl("https://pet.example.workers.dev/chat?x=1"))
        assertEquals("https://pet.example.workers.dev/web/ma.html", maPageUrl("https://pet.example.workers.dev/"))
        assertEquals("https://pet.example.workers.dev/web/ma.html", maPageUrl("https://pet.example.workers.dev"))
    }

    // 測試 maPageUrl：非 HTTPS、空字串或無法解析時回傳 null
    @Test
    fun maPageUrlInvalid() {
        assertNull(maPageUrl(null))
        assertNull(maPageUrl(""))
        assertNull(maPageUrl("http://pet.example.workers.dev"))
        assertNull(maPageUrl("ftp://example.com"))
        assertNull(maPageUrl("https://"))
    }

    // 測試 parseReminder 解析 ma 欄位（對應規格 M4-S15C 邏輯）
    @Test
    fun parseReminderMaPayload() {
        val validJson = "{\"status\":\"ok\",\"u\":2,\"d\":1,\"m\":0}"
        val dataWithMa = mapOf(
            "id" to "rem-001",
            "text" to "早安，盤前均線報告送達",
            "script" to "[smile]早安",
            "ma" to "  $validJson  "
        )
        val reminder = parseReminder(dataWithMa, 1000L)
        assertEquals("rem-001", reminder?.id)
        assertEquals(validJson, reminder?.ma)

        // ma 格式損毀時應忽略 ma 欄位並降級為 null，提醒本體不閃退
        val dataWithBadMa = mapOf(
            "id" to "rem-002",
            "text" to "早安",
            "ma" to "bad-data"
        )
        val reminderBad = parseReminder(dataWithBadMa, 1000L)
        assertEquals("rem-002", reminderBad?.id)
        assertNull(reminderBad?.ma)

        // 沒有 ma 欄位時預設為 null
        val dataNoMa = mapOf(
            "id" to "rem-003",
            "text" to "一般通知"
        )
        val reminderNoMa = parseReminder(dataNoMa, 1000L)
        assertNull(reminderNoMa?.ma)
    }
}
