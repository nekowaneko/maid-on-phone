# 依 vivo「單一應用程式用量」的短時間數據，推估 8 小時的額外耗電
# 用法：python tools/battery_estimate.py

# 常數定義
CAPACITY_MAH = 6500     # 電池容量
TOTAL_MAH = 23          # vivo 顯示的 App 總耗電
MINUTES = 8 + 7         # 前景 8 分鐘＋背景 7 分鐘
SCREEN_SHARE = 0.59     # 歸給 App 的螢幕耗電比例
HOURS = 8               # 實測時長
TARGET_PERCENT = 5      # 目標：額外耗電 ≤ 5%


# 把每小時耗電換算成 8 小時占電池的百分比
def percent_over(mah_per_hour, hours=HOURS):
    return mah_per_hour * hours / CAPACITY_MAH * 100


# 印出一種情境的結果
def report(name, mah):
    per_hour = mah / (MINUTES / 60)  # 每小時耗電
    pct = percent_over(per_hour)
    mark = "達標" if pct <= TARGET_PERCENT else "超標"
    print("%-26s %5.1f mAh/h → 8 小時 %5.1f%%（%s）" % (name, per_hour, pct, mark))


report("A 全部算角色的（含螢幕）", TOTAL_MAH)
report("B 只算非螢幕部分", TOTAL_MAH * (1 - SCREEN_SHARE))
