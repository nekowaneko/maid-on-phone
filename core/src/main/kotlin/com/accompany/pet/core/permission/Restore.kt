package com.accompany.pet.core.permission

// 巡邏或磁磚檢查後要做的事
enum class RestoreAction { NONE, RESTORE }

// 決定要不要自動叫回角色：使用者想開著、目前沒在跑、而且有懸浮窗權限才恢復
fun decideRestore(wanted: Boolean, running: Boolean, hasOverlayPermission: Boolean): RestoreAction =
    if (wanted && !running && hasOverlayPermission) RestoreAction.RESTORE else RestoreAction.NONE
