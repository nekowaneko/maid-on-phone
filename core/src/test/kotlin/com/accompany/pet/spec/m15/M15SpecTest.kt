package com.accompany.pet.spec.m15

import com.accompany.pet.core.chat.CHAT_NOT_SET_MESSAGE
import com.accompany.pet.core.chat.ChatAction
import com.accompany.pet.core.chat.decideChat
import com.accompany.pet.core.chat.isSameOrigin
import com.accompany.pet.core.chat.normalizeChatUrl
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

// M1.5 規格範例表（docs/M1.5-EXPENSIVE-PLAN.md §4.5）轉寫的測試，凍結後不得修改
class M15SpecTest {

    // 常數定義
    private val workerUrl = "https://pet-maid-api.example.workers.dev/"  // 測試用的 Worker B 網址

    // 依執行目錄找角色頁原始檔
    private fun petPage(): File {
        val candidates = listOf(File("../app/src/main/assets/pet/index.html"), File("app/src/main/assets/pet/index.html"))
        return candidates.first { it.exists() }
    }

    @Test
    fun `M15-S04 聊天畫面中點到不是 Worker B 網址的連結不在 App 裡開啟`() {
        assertFalse(isSameOrigin(workerUrl, "https://example.com/"))
        assertTrue(isSameOrigin(workerUrl, "https://pet-maid-api.example.workers.dev/web/index.html"))
        assertFalse(isSameOrigin(workerUrl, "http://pet-maid-api.example.workers.dev/"))
    }

    @Test
    fun `M15-S05 聊天網址是 http 開頭時當作沒有設定`() {
        assertNull(normalizeChatUrl("http://pet-maid-api.example.workers.dev/"))
        assertEquals(ChatAction.SHOW_NOT_SET, decideChat("http://pet-maid-api.example.workers.dev/"))
    }

    @Test
    fun `M15-S06 還沒設定聊天網址時按聊聊不開聊天畫面並顯示提示`() {
        assertEquals(ChatAction.SHOW_NOT_SET, decideChat(""))
        assertEquals(ChatAction.SHOW_NOT_SET, decideChat(null))
        assertEquals("還沒設定聊天網址，見 docs/WORKER-SETUP.md", CHAT_NOT_SET_MESSAGE)
    }

    @Test
    fun `M15-S13 泡泡裡在說話右邊多一顆聊聊按鈕且按下後開啟聊天畫面`() {
        val html = petPage().readText()
        val chatAt = html.indexOf("id=\"chat\"")
        val micAt = html.indexOf("id=\"mic\"")
        assertTrue(chatAt >= 0)
        assertTrue(micAt >= 0)
        assertTrue(chatAt > micAt)
        val closeAt = html.indexOf("</button>", chatAt)
        assertTrue(html.substring(chatAt, closeAt).contains("聊聊"))
        assertEquals(ChatAction.OPEN, decideChat(workerUrl))
    }
}
