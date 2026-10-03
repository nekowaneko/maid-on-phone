package com.accompany.pet.core

import java.time.Instant
import java.time.format.DateTimeFormatter

// 常數定義
const val LOG_INTERVAL_MINUTES = 15                     // 耗電紀錄間隔
const val CSV_HEADER = "時間,電量百分比,螢幕,動畫"      // CSV 第一行
private const val TIME_PATTERN = "yyyy-MM-dd HH:mm:ss"  // CSV 時間格式

// 一筆耗電樣本
data class BatterySample(val timeMillis: Long, val batteryPercent: Int, val screenOn: Boolean, val animating: Boolean)

// 算出下一次取樣的時間
fun nextSampleTime(lastMillis: Long): Long = lastMillis + LOG_INTERVAL_MINUTES * 60_000L

// 把一筆樣本轉成 CSV 一行
fun toCsvLine(s: BatterySample, zone: java.time.ZoneId): String {
    val time = DateTimeFormatter.ofPattern(TIME_PATTERN).withZone(zone).format(Instant.ofEpochMilli(s.timeMillis))
    val screen = if (s.screenOn) "開" else "關"
    val anim = if (s.animating) "播放中" else "暫停"
    return "$time,${s.batteryPercent},$screen,$anim"
}
