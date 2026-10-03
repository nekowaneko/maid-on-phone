package com.accompany.pet.core.permission

// 常數定義
const val MIC_DENIED_MESSAGE = "需要麥克風權限才能用說的"  // 麥克風被拒絕時泡泡顯示的文字

// 按下「開始」後要做的事
enum class StartAction { SHOW_PERMISSION_EXPLANATION, START_OVERLAY }

// 依是否有懸浮窗權限，決定要說明權限還是直接開始
fun decideStart(hasOverlayPermission: Boolean): StartAction =
    if (hasOverlayPermission) StartAction.START_OVERLAY else StartAction.SHOW_PERMISSION_EXPLANATION
