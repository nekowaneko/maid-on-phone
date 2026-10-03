package com.accompany.pet.core.reminder

// 前景 App 的分類
enum class ForegroundKind { NORMAL, GAME, CUSTOM_GAME }

// 依套件名稱與系統分類，判斷前景 App 屬於哪一類
fun classifyForeground(packageName: String?, isGameCategory: Boolean, customGames: Set<String>): ForegroundKind = TODO()

// 是否正在玩遊戲；沒有使用情形存取權一律 false
fun isGaming(kind: ForegroundKind, hasUsagePermission: Boolean): Boolean = TODO()

// 分流需要的三個條件
data class RouteInput(val petMode: Boolean, val gaming: Boolean, val alreadySeen: Boolean)

// 提醒的四種去向
enum class Route { SHOW_PET, NOTIFY, QUEUE, IGNORE }

// 決定提醒的去向：已看過 → 忽略；玩遊戲 → 排隊；角色模式開 → 角色出現；否則一般通知
fun decideRoute(input: RouteInput): Route = TODO()
