package com.accompany.pet.core

// 常數定義
const val LOG_INTERVAL_MINUTES = 15                 // 耗電紀錄間隔
const val CSV_HEADER = "時間,電量百分比,螢幕,動畫"  // CSV 第一行

// 一筆耗電樣本
data class BatterySample(val timeMillis: Long, val batteryPercent: Int, val screenOn: Boolean, val animating: Boolean)

// 算出下一次取樣的時間
fun nextSampleTime(lastMillis: Long): Long = TODO()

// 把一筆樣本轉成 CSV 一行
fun toCsvLine(s: BatterySample, zone: java.time.ZoneId): String = TODO()
