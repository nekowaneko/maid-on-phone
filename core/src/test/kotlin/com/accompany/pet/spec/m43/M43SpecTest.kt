package com.accompany.pet.spec.m43

import com.accompany.pet.core.drink.STATUS_NOT_SET
import com.accompany.pet.core.drink.STATUS_UNREACHABLE
import com.accompany.pet.core.drink.drinkUiEnabled
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// M4.3 規格範例表（docs/M4.3-EXPENSIVE-PLAN.md §4.6）中 Kotlin 規格測試列（S10），凍結後不得修改
class M43SpecTest {

    @Test
    fun `M43-S10 三顆戒飲按鈕維持顯示（和現在一樣），不跳出錯誤。這是唯一允許的降級。`() {
        assertFalse(drinkUiEnabled(200, false)) // 成功且明確讀到 false：才隱藏
        assertTrue(drinkUiEnabled(200, true))
        assertTrue(drinkUiEnabled(200, null)) // 讀到的內容格式不對
        assertTrue(drinkUiEnabled(STATUS_NOT_SET, null)) // 伺服器網址沒設定
        assertTrue(drinkUiEnabled(STATUS_UNREACHABLE, null)) // 沒網路
        assertTrue(drinkUiEnabled(401, null))
        assertTrue(drinkUiEnabled(500, false)) // 非 2xx 一律顯示
    }
}
