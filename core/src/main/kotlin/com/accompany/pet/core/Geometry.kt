package com.accompany.pet.core

// 常數定義
const val EDGE_MARGIN_PX = 8  // 吸附時與螢幕邊緣的距離

// 螢幕上的一個座標點（左上角為原點）
data class Point(val x: Int, val y: Int)

// 寬高尺寸
data class Size(val w: Int, val h: Int)

// 把角色位置限制在螢幕範圍內
fun clampInScreen(p: Point, pet: Size, screen: Size): Point = TODO()

// 依放開的位置，決定角色要吸附到左邊或右邊
fun snapToEdge(drop: Point, pet: Size, screen: Size, margin: Int = EDGE_MARGIN_PX): Point = TODO()

// 決定角色開始時的位置：有紀錄用紀錄，沒有就放右下
fun initialPosition(saved: Point?, pet: Size, screen: Size, margin: Int = EDGE_MARGIN_PX): Point = TODO()
