package com.accompany.pet.helper

import com.accompany.pet.core.FileRunIntentStore
import com.accompany.pet.core.nextWatchdogTime
import com.accompany.pet.core.permission.RestoreAction
import com.accompany.pet.core.permission.decideRestore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

// 輔助測試：自動恢復的判斷與意圖紀錄（docs/M0.5-RECOVERY-PLAN.md §4）
class RestoreTest {

    @get:Rule
    val tmp = TemporaryFolder()

    @Test
    fun `decideRestore 只有想開著且沒在跑且有權限時才恢復`() {
        for (wanted in listOf(true, false)) for (running in listOf(true, false)) for (overlay in listOf(true, false)) {
            val expected = if (wanted && !running && overlay) RestoreAction.RESTORE else RestoreAction.NONE
            assertEquals("wanted=$wanted running=$running overlay=$overlay", expected, decideRestore(wanted, running, overlay))
        }
    }

    @Test
    fun `使用者停止後不自動恢復`() {
        assertEquals(RestoreAction.NONE, decideRestore(wanted = false, running = false, hasOverlayPermission = true))
    }

    @Test
    fun `意圖存入後以新實例讀出相同`() {
        val f = File(tmp.root, "pet-wanted.txt")
        FileRunIntentStore(f).save(true)
        assertTrue(FileRunIntentStore(f).load())
        FileRunIntentStore(f).save(false)
        assertFalse(FileRunIntentStore(f).load())
    }

    @Test
    fun `意圖檔不存在或內容不明時視為不想開著`() {
        assertFalse(FileRunIntentStore(File(tmp.root, "none.txt")).load())
        val bad = File(tmp.root, "bad.txt")
        bad.writeText("yes")
        assertFalse(FileRunIntentStore(bad).load())
    }

    @Test
    fun `下一次巡邏相差 5 分鐘`() {
        assertEquals(5L * 60 * 1000, nextWatchdogTime(1_000L) - 1_000L)
    }
}
