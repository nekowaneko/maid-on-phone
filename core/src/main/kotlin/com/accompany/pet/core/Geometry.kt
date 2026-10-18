package com.accompany.pet.core

// 常數定義
const val EDGE_MARGIN_PX = 8      // 吸附時與螢幕邊緣的距離
const val DEFAULT_Y_RATIO = 0.65  // 預設位置在螢幕高度的比例

// 螢幕上的一個座標點（左上角為原點）
data class Point(val x: Int, val y: Int)

// 寬高尺寸
data class Size(val w: Int, val h: Int)

// 把一個數值限制在 min..max 之間（max 比 min 小時取 min）
fun clampValue(v: Int, min: Int, max: Int): Int = if (max < min) min else v.coerceIn(min, max)

// 把角色位置限制在螢幕範圍內
fun clampInScreen(p: Point, pet: Size, screen: Size): Point {
    val x = clampValue(p.x, 0, screen.w - pet.w)  // 左右不出界
    val y = clampValue(p.y, 0, screen.h - pet.h)  // 上下不出界
    return Point(x, y)
}

// 依放開的位置，決定角色要吸附到左邊或右邊
fun snapToEdge(drop: Point, pet: Size, screen: Size, margin: Int = EDGE_MARGIN_PX): Point {
    val centerX = drop.x + pet.w / 2  // 角色中心點
    val x = if (centerX < screen.w / 2) margin else screen.w - pet.w - margin
    return clampInScreen(Point(x, drop.y), pet, screen)  // 上下也要留在畫面內（S08 優先）
}

// 觸控點（以角色頁 WebView 左上為原點）是否落在角色本體上：角色貼在靠螢幕邊那一側，往上長時在底部、往下長時在頂部
// 只有按在角色上才拖曳視窗；按在泡泡上交給網頁，台詞區才能上下捲動
fun isOnPet(x: Int, y: Int, view: Size, pet: Size, right: Boolean, growDown: Boolean): Boolean {
    val inX = if (right) x >= view.w - pet.w else x < pet.w
    val inY = if (growDown) y < pet.h else y >= view.h - pet.h
    return inX && inY
}

// 決定角色開始時的位置：有紀錄用紀錄，沒有就放右下
fun initialPosition(saved: Point?, pet: Size, screen: Size, margin: Int = EDGE_MARGIN_PX): Point {
    if (saved != null) return clampInScreen(saved, pet, screen)  // 換解析度也要留在畫面內
    val x = screen.w - pet.w - margin
    val y = (screen.h * DEFAULT_Y_RATIO).toInt()
    return clampInScreen(Point(x, y), pet, screen)
}
