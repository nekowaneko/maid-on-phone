package com.accompany.pet.spec.m42

import com.accompany.pet.core.chat.CHAT_EXIT_URL
import com.accompany.pet.core.chat.isChatExitUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// M4.2 規格範例表（docs/M4.2-EXPENSIVE-PLAN.md §4.5）中 Kotlin 規格測試列（S09），凍結後不得修改
class M42SpecTest {

    @Test
    fun `M42-S09 在 App 內：聊天畫面關閉，回到進來的地方（懸浮窗或主畫面）。在一般瀏覽器：停在通話結束畫面，沒有反應也不出錯`() {
        assertEquals("chat-exit://close", CHAT_EXIT_URL)
        assertTrue(isChatExitUrl("chat-exit://close"))
        assertFalse(isChatExitUrl(null))
        assertFalse(isChatExitUrl(""))
        assertFalse(isChatExitUrl("CHAT-EXIT://close"))
        assertFalse(isChatExitUrl("chat-exit://close/"))
        assertFalse(isChatExitUrl("https://x/chat-exit://close"))
    }
}
