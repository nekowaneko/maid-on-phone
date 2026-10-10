package com.accompany.pet.core.ma

// 常數定義
const val MA_ENTRY_LOADING = "正在取得今天的資料…"
const val MA_ENTRY_FAILED = "今天的資料沒拿到，點了可重試"
const val MA_ENTRY_EMPTY = "還沒有追蹤標的，點了去加入"
const val MA_ENTRY_NONE = "還沒有報告，明天 08:30 會送來"
const val MA_ENTRY_NOT_SET = "尚未設定連線"
const val CHAT_ENTRY_SUBTITLE = "女僕：今天也辛苦了，要不要聊聊？"
const val MA_REPORT_PATH = "/api/ma/report"

// App 這次取資料的結果類型：沒設定連線、連不上、有回應（含非 200）
enum class MaFetch { NOT_SET, UNREACHABLE, RESPONDED }

// 從 /api/ma/report 回應取出的欄位；取不到或型別不對的欄位為 null
data class MaReportBrief(
    val status: String?,
    val reportDate: String?,
    val u: Int?,
    val d: Int?,
    val m: Int?
)

// 內部工具：計算特定月份的天數（含閏年判斷）
private fun daysInMonth(year: Int, month: Int): Int {
    return when (month) {
        1, 3, 5, 7, 8, 10, 12 -> 31
        4, 6, 9, 11 -> 30
        2 -> if ((year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)) 29 else 28
        else -> 0
    }
}

// 內部工具：依 Sakamoto 公式計算星期幾（0 為星期日，1～6 為星期一至六）
private fun dayOfWeekIndex(year: Int, month: Int, day: Int): Int {
    val t = intArrayOf(0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4)
    var y = year
    if (month < 3) y -= 1
    return (y + y / 4 - y / 100 + y / 400 + t[month - 1] + day) % 7
}

// 內部工具：從 JSON 物件區塊中依鍵名取出純整數值，型別不對或不存在回傳 null
private fun extractInteger(block: String, key: String): Int? {
    val pattern = Regex(""""$key"\s*:\s*([^\s,{}]+)""")
    val raw = pattern.find(block)?.groupValues?.get(1) ?: return null
    if (!Regex("""^-?\d+$""").matches(raw)) return null // 帶引號、小數點或非數字視為型別錯誤
    return raw.toIntOrNull()
}

// 從回應原文取出摘要欄位；不是 JSON 物件、欄位缺漏或型別不對時對應欄位為 null，不丟例外
fun parseMaReportBrief(body: String?): MaReportBrief {
    if (body == null) return MaReportBrief(null, null, null, null, null)
    val trimmed = body.trim()
    if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) {
        return MaReportBrief(null, null, null, null, null) // 非 JSON 物件直接回傳全 null
    }

    val statusMatch = Regex(""""status"\s*:\s*"([^"]+)"""").find(trimmed)
    val status = statusMatch?.groupValues?.get(1) // 取第一個出現的 status 鍵值

    val dateMatch = Regex(""""reportDate"\s*:\s*"([^"]+)"""").find(trimmed)
    val reportDate = dateMatch?.groupValues?.get(1) // 取第一個出現的 reportDate 鍵值

    val countsMatch = Regex(""""counts"\s*:\s*\{([^}]*)\}""").find(trimmed)
    val countsBlock = countsMatch?.groupValues?.get(1)

    val u = if (countsBlock != null) extractInteger(countsBlock, "u") else null
    val d = if (countsBlock != null) extractInteger(countsBlock, "d") else null
    val m = if (countsBlock != null) extractInteger(countsBlock, "m") else null

    return MaReportBrief(status = status, reportDate = reportDate, u = u, d = d, m = m)
}

// 把 "2026-10-12" 轉成 "10/12（一）"（月日不補零，星期用一二三四五六日）；格式不對或日期不存在回傳 null
fun maDateLabel(reportDate: String?): String? {
    if (reportDate == null) return null
    val match = Regex("""^(\d{4})-(\d{2})-(\d{2})$""").find(reportDate) ?: return null
    val year = match.groupValues[1].toInt() // 正規式已保證是純數字
    val month = match.groupValues[2].toInt()
    val day = match.groupValues[3].toInt()

    if (year < 1 || month !in 1..12) return null // 年份月數超出範圍
    val maxDay = daysInMonth(year, month)
    if (day !in 1..maxDay) return null // 日期不存在

    val weekDays = arrayOf("日", "一", "二", "三", "四", "五", "六")
    val weekday = weekDays[dayOfWeekIndex(year, month, day)]
    return "$month/$day（$weekday）" // 組裝月日不補零與星期標籤
}

// 卡片載入中的副標
fun maEntryLoadingText(): String = MA_ENTRY_LOADING

// 依取資料結果算出卡片副標
fun maEntrySubtitle(fetch: MaFetch, httpStatus: Int, brief: MaReportBrief?): String {
    if (fetch == MaFetch.NOT_SET) return MA_ENTRY_NOT_SET // 尚未設定連線
    if (fetch == MaFetch.UNREACHABLE) return MA_ENTRY_FAILED // 連不上伺服器

    if (httpStatus != 200 || brief == null) return MA_ENTRY_FAILED // HTTP 非 200 或無回應摘要
    val status = brief.status ?: return MA_ENTRY_FAILED

    return when (status) {
        "ok" -> {
            val dateLabel = maDateLabel(brief.reportDate)
            val u = brief.u
            val d = brief.d
            val m = brief.m
            if (dateLabel != null && u != null && u >= 0 && d != null && d >= 0 && m != null && m >= 0) {
                "$dateLabel・多頭 $u、空頭 $d、其他 $m" // 資料正常顯示完整統計
            } else {
                MA_ENTRY_FAILED // 欄位缺漏、日期無效或檔數負數
            }
        }
        "failed" -> MA_ENTRY_FAILED
        "empty" -> MA_ENTRY_EMPTY
        "none" -> MA_ENTRY_NONE
        else -> MA_ENTRY_FAILED
    }
}
