package com.accompany.pet.helper

import com.accompany.pet.core.Size
import com.accompany.pet.core.isOnPet
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

// 輔助測試：懸浮窗觸控只有按在角色上才拖曳，按在泡泡上要交給網頁捲動
class TouchTargetHelperTest {

    // 常數定義：WebView 為「角色＋泡泡」寬、泡泡最高；角色 288×324（3 倍密度）
    private val view = Size(780, 720)
    private val pet = Size(288, 324)

    @Test
    fun `角色在右邊往上長：右下角是角色，左上的泡泡不是`() {
        assertTrue(isOnPet(700, 700, view, pet, right = true, growDown = false))
        assertTrue(isOnPet(492, 396, view, pet, right = true, growDown = false))  // 角色左上角邊界
        assertFalse(isOnPet(491, 700, view, pet, right = true, growDown = false)) // 泡泡那一側
        assertFalse(isOnPet(700, 395, view, pet, right = true, growDown = false)) // 角色上方的空白
        assertFalse(isOnPet(100, 100, view, pet, right = true, growDown = false)) // 台詞區
    }

    @Test
    fun `角色在左邊往下長：左上角是角色，右側的泡泡不是`() {
        assertTrue(isOnPet(0, 0, view, pet, right = false, growDown = true))
        assertTrue(isOnPet(287, 323, view, pet, right = false, growDown = true))
        assertFalse(isOnPet(288, 100, view, pet, right = false, growDown = true))
        assertFalse(isOnPet(100, 324, view, pet, right = false, growDown = true))
    }

    @Test
    fun `角色在右邊往下長、在左邊往上長`() {
        assertTrue(isOnPet(700, 10, view, pet, right = true, growDown = true))
        assertFalse(isOnPet(700, 700, view, pet, right = true, growDown = true))
        assertTrue(isOnPet(10, 700, view, pet, right = false, growDown = false))
        assertFalse(isOnPet(10, 10, view, pet, right = false, growDown = false))
    }
}
