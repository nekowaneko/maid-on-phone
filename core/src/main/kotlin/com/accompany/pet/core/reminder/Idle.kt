package com.accompany.pet.core.reminder

// 常數定義
const val IDLE_HIDE_MILLIS = 3 * 60 * 1000L  // 沒互動多久後自動收起：3 分鐘

// 最後一次互動後，到哪個時間點該收起
fun idleDeadline(lastInteractionMillis: Long): Long = TODO()

// 現在是否該收起角色（到期時間含）
fun shouldHide(lastInteractionMillis: Long, nowMillis: Long): Boolean = TODO()
