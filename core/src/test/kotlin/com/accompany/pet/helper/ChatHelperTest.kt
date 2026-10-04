package com.accompany.pet.helper

import com.accompany.pet.core.chat.ChatAction
import com.accompany.pet.core.chat.decideChat
import com.accompany.pet.core.chat.isSameOrigin
import com.accompany.pet.core.chat.normalizeChatUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

// 聊天網址檢查的輔助測試（規格以外的邊界，供突變測試使用）
class ChatHelperTest {

    // 常數定義
    private val base = "https://pet.example.dev/web/index.html"  // 測試用的聊天網址

    @Test
    fun `normalizeChatUrl 去掉前後空白後原樣回傳`() {
        assertEquals("https://pet.example.dev/a?b=1", normalizeChatUrl("  https://pet.example.dev/a?b=1 \n"))
    }

    @Test
    fun `normalizeChatUrl 不分大小寫接受 https`() {
        assertEquals("HTTPS://Pet.Example.dev", normalizeChatUrl("HTTPS://Pet.Example.dev"))
    }

    @Test
    fun `normalizeChatUrl 擋下空白、主機為空、其他 scheme 與帳密`() {
        for (raw in listOf("", "   ", "https://", "https:///path", "ftp://pet.example.dev", "pet.example.dev",
            "https://user@pet.example.dev", "https://pet.example.dev:abc", "https://pet.example.dev:", "file:///sdcard")) {
            assertNull(raw, normalizeChatUrl(raw))
        }
    }

    @Test
    fun `normalizeChatUrl 接受自訂埠號`() {
        assertEquals("https://pet.example.dev:8443/", normalizeChatUrl("https://pet.example.dev:8443/"))
    }

    @Test
    fun `isSameOrigin 主機不分大小寫，沒寫埠號等於 443`() {
        assertTrue(isSameOrigin(base, "https://PET.example.dev/api/chat"))
        assertTrue(isSameOrigin(base, "https://pet.example.dev:443/"))
        assertTrue(isSameOrigin(base, "https://pet.example.dev?x=1"))
        assertTrue(isSameOrigin(base, "https://pet.example.dev#top"))
    }

    @Test
    fun `isSameOrigin 不同埠號、子網域、相似主機都不同源`() {
        assertFalse(isSameOrigin(base, "https://pet.example.dev:8443/"))
        assertFalse(isSameOrigin(base, "https://a.pet.example.dev/"))
        assertFalse(isSameOrigin(base, "https://pet.example.dev.evil.com/"))
        assertFalse(isSameOrigin(base, "https://evil.com@pet.example.dev/"))
    }

    @Test
    fun `isSameOrigin 無法解析時為 false`() {
        assertFalse(isSameOrigin(base, "not a url"))
        assertFalse(isSameOrigin("not a url", base))
        assertFalse(isSameOrigin(base, "javascript:alert(1)"))
        assertFalse(isSameOrigin(base, "data:text/html,hi"))
        assertFalse(isSameOrigin(base, "ftp://pet.example.dev/"))
        assertFalse(isSameOrigin(base, "https://[::1]/"))
        assertFalse(isSameOrigin(base, "https://pet.example.dev:123456/"))
        assertFalse(isSameOrigin(base, "://pet.example.dev/"))
    }

    @Test
    fun `isSameOrigin http 沒寫埠號等於 80`() {
        assertTrue(isSameOrigin("http://a.dev/", "http://a.dev:80/x"))
        assertFalse(isSameOrigin("http://a.dev/", "http://a.dev:443/"))
    }

    @Test
    fun `decideChat 有效網址開啟、空白網址提示`() {
        assertEquals(ChatAction.OPEN, decideChat(" https://pet.example.dev "))
        assertEquals(ChatAction.SHOW_NOT_SET, decideChat("   "))
    }
}
