package com.accompany.pet.helper

import com.accompany.pet.core.drink.API_NOT_SET_MESSAGE
import com.accompany.pet.core.drink.STATUS_NOT_SET
import com.accompany.pet.core.drink.STATUS_UNREACHABLE
import com.accompany.pet.core.drink.UNREACHABLE_MESSAGE
import com.accompany.pet.core.drink.WRONG_SECRET_MESSAGE
import com.accompany.pet.core.drink.apiOrigin
import com.accompany.pet.core.drink.askTimeOptions
import com.accompany.pet.core.drink.pushActionLabel
import com.accompany.pet.core.drink.workerErrorMessage
import com.accompany.pet.core.drink.drinkEndpointFor
import com.accompany.pet.core.drink.parseDrinkActions
import com.accompany.pet.core.reminder.parseReminder
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

// M2 輔助測試：apiOrigin、drinkEndpointFor、parseDrinkActions 的邊界情況（可自由增修）
class M2HelperTest {

    @Test
    fun `apiOrigin 去掉路徑、查詢與結尾斜線`() {
        assertEquals("https://pet.example.workers.dev", apiOrigin("https://pet.example.workers.dev/chat?x=1"))
        assertEquals("https://pet.example.workers.dev", apiOrigin("https://pet.example.workers.dev/"))
        assertEquals("https://pet.example.workers.dev", apiOrigin("https://pet.example.workers.dev"))
        assertEquals("https://pet.example.workers.dev", apiOrigin("  https://pet.example.workers.dev#a  "))
    }

    @Test
    fun `apiOrigin 保留埠號`() {
        assertEquals("https://example.com:8443", apiOrigin("https://example.com:8443/app/"))
    }

    @Test
    fun `apiOrigin 不是 https 或沒有網域時回 null`() {
        assertNull(apiOrigin("http://example.com/"))
        assertNull(apiOrigin(""))
        assertNull(apiOrigin("https://"))
        assertNull(apiOrigin("https:///chat"))
        assertNull(apiOrigin("ftp://example.com"))
        assertNull(apiOrigin("example.com"))
        assertNull(apiOrigin("https://user@evil.com/"))
    }

    @Test
    fun `drinkEndpointFor 只對應四個需要連線的動作`() {
        assertEquals("/api/drink/confirm", drinkEndpointFor("confirm"))
        assertEquals("/api/drink/preview", drinkEndpointFor("preview"))
        assertEquals("/api/drink/resist", drinkEndpointFor("resist"))
        assertEquals("/api/drink/undo", drinkEndpointFor("undo"))
        assertNull(drinkEndpointFor("speak"))
        assertNull(drinkEndpointFor("cancel"))
        assertNull(drinkEndpointFor("parse"))
        assertNull(drinkEndpointFor(""))
        assertNull(drinkEndpointFor("Confirm"))
    }

    @Test
    fun `parseDrinkActions 去空白、去重、保留順序`() {
        assertEquals(listOf("speak", "resist"), parseDrinkActions(" speak , resist ,speak,resist"))
        assertEquals(listOf("resist"), parseDrinkActions("resist,,dance,"))
        assertEquals(emptyList<String>(), parseDrinkActions(null))
        assertEquals(emptyList<String>(), parseDrinkActions(""))
        assertEquals(emptyList<String>(), parseDrinkActions("confirm,undo,cancel"))
        assertEquals(emptyList<String>(), parseDrinkActions("RESIST"))
    }

    @Test
    fun `apiOrigin 拒絕奇怪的埠號與 IPv6，網域轉小寫`() {
        assertNull(apiOrigin("https://example.com:/x"))
        assertNull(apiOrigin("https://example.com:abc"))
        assertNull(apiOrigin("https://example.com:123456"))
        assertNull(apiOrigin("https://:443/"))
        assertNull(apiOrigin("https://[::1]/"))
        assertNull(apiOrigin("https://exa mple.com/"))
        assertEquals("https://example.com", apiOrigin("HTTPS://Example.COM/Chat"))
    }

    @Test
    fun `pushActionLabel 與網頁按鈕同一套字`() {
        assertEquals("沒喝", pushActionLabel("resist"))
        assertEquals("有喝，用說的", pushActionLabel("speak"))
        assertNull(pushActionLabel("dance"))
    }

    @Test
    fun `workerErrorMessage 依狀態碼回固定提示`() {
        assertNull(workerErrorMessage(200))
        assertNull(workerErrorMessage(299))
        assertEquals(API_NOT_SET_MESSAGE, workerErrorMessage(STATUS_NOT_SET))
        assertEquals(UNREACHABLE_MESSAGE, workerErrorMessage(STATUS_UNREACHABLE))
        assertEquals(WRONG_SECRET_MESSAGE, workerErrorMessage(401))
        assertEquals(UNREACHABLE_MESSAGE, workerErrorMessage(500))
        assertEquals(UNREACHABLE_MESSAGE, workerErrorMessage(400))
        assertEquals(UNREACHABLE_MESSAGE, workerErrorMessage(300))
        assertEquals(UNREACHABLE_MESSAGE, workerErrorMessage(199))
    }

    @Test
    fun `askTimeOptions 是 00 到 23 的整點`() {
        val options = askTimeOptions()
        assertEquals(24, options.size)
        assertEquals("00:00", options.first())
        assertEquals("15:00", options[15])
        assertEquals("23:00", options.last())
    }

    @Test
    fun `parseReminder 帶 actions 時其他欄位不受影響`() {
        val r = parseReminder(mapOf("id" to "a", "text" to "問", "script" to "[pout]問", "actions" to "speak"), 5L)
        assertEquals("[pout]問", r!!.script)
        assertEquals(listOf("speak"), r.actions)
        assertEquals(5L, r.receivedAtMillis)
    }
}
