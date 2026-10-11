package com.accompany.pet.helper

import com.accompany.pet.core.chat.CHAT_EXIT_URL
import com.accompany.pet.core.chat.isChatExitUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// 關閉網址判斷的輔助測試（規格以外的邊界，供突變測試使用）
class ChatExitHelperTest {

    @Test
    fun `常數就是約定的關閉網址`() {
        assertEquals("chat-exit://close", CHAT_EXIT_URL)
    }

    @Test
    fun `逐字相同才放行`() {
        assertTrue(isChatExitUrl("chat-exit://close"))
    }

    @Test
    fun `null 與空字串不放行`() {
        assertFalse(isChatExitUrl(null))
        assertFalse(isChatExitUrl(""))
    }

    @Test
    fun `大小寫不同不放行`() {
        assertFalse(isChatExitUrl("CHAT-EXIT://close"))
        assertFalse(isChatExitUrl("chat-exit://CLOSE"))
    }

    @Test
    fun `結尾多斜線或空白不放行`() {
        assertFalse(isChatExitUrl("chat-exit://close/"))
        assertFalse(isChatExitUrl("chat-exit://close "))
        assertFalse(isChatExitUrl(" chat-exit://close"))
    }

    @Test
    fun `前面加網址或後面加參數不放行`() {
        assertFalse(isChatExitUrl("https://x/chat-exit://close"))
        assertFalse(isChatExitUrl("chat-exit://close?x=1"))
        assertFalse(isChatExitUrl("chat-exit://"))
    }
}
