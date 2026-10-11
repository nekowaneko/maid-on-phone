package com.accompany.pet.helper

import com.accompany.pet.core.drink.DRINK_DISABLED_MESSAGE
import com.accompany.pet.core.drink.ENABLED_PATH
import com.accompany.pet.core.drink.STATUS_DISABLED
import com.accompany.pet.core.drink.STATUS_NOT_SET
import com.accompany.pet.core.drink.STATUS_UNREACHABLE
import com.accompany.pet.core.drink.UNREACHABLE_MESSAGE
import com.accompany.pet.core.drink.WRONG_SECRET_MESSAGE
import com.accompany.pet.core.drink.drinkUiEnabled
import com.accompany.pet.core.drink.workerErrorMessage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// M4.3 輔助測試：開關路徑、403 提示、讀不到時的降級邊界（可自由增修）
class M43HelperTest {

    @Test
    fun `常數值與計畫書一致`() {
        assertEquals("/api/drink/enabled", ENABLED_PATH)
        assertEquals(403, STATUS_DISABLED)
        assertTrue(DRINK_DISABLED_MESSAGE.startsWith("戒飲記錄已關閉"))
    }

    @Test
    fun `workerErrorMessage 403 回已關閉提示且其他分支不變`() {
        assertEquals(DRINK_DISABLED_MESSAGE, workerErrorMessage(403))
        assertEquals(WRONG_SECRET_MESSAGE, workerErrorMessage(401))
        for (status in listOf(400, 500, 300, 199)) assertEquals(UNREACHABLE_MESSAGE, workerErrorMessage(status))
        assertEquals(null, workerErrorMessage(200))
    }

    @Test
    fun `drinkUiEnabled 只有 2xx 且明確 false 才隱藏`() {
        assertFalse(drinkUiEnabled(200, false))
        assertFalse(drinkUiEnabled(299, false))
        assertTrue(drinkUiEnabled(200, true))
        assertTrue(drinkUiEnabled(200, null))
        assertTrue(drinkUiEnabled(300, false))
        assertTrue(drinkUiEnabled(199, false))
        assertTrue(drinkUiEnabled(403, false))
        assertTrue(drinkUiEnabled(STATUS_NOT_SET, null))
        assertTrue(drinkUiEnabled(STATUS_UNREACHABLE, false))
    }
}
