# 用懸浮窗的 pout 表情圖產生 App 圖示（只放在 debug 來源集，不進 git）。
# 角色立繪不進公開 repo（規格書 §2.1），所以圖示產物放在 app/src/debug/res/，由 .gitignore 排除；
# release 建置仍用 main 的預設圖示。
# 來源用已去背的 frames/local/pout.png（由 tools/make_expression_frames.py 產生）：
# 原圖的貓耳尖幾乎貼著上緣，去背後放到透明畫布上縮小，上方才有空間把整對貓耳放進可見範圍。
# 用法：python tools/make_app_icon.py

from pathlib import Path

from PIL import Image

# 常數定義
ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "app/src/main/assets/pet/frames/local/pout.png"  # 300×349 去背圖
VISIBLE_CENTER = (154, 110)          # 可見圓的中心（以 300×349 的座標）：臉與貓耳的中間
VISIBLE_RADIUS = 107                 # 可見圓半徑：貓耳尖約 7 成以上在圈內
CANVAS_SIDE = VISIBLE_RADIUS * 3     # 108dp 畫布中只有中間 72dp 看得到，所以畫布邊長是可見直徑的 1.5 倍
BACKGROUND_COLOR = "#FFE8EF"         # 圖示底色（淡粉紅，配泡泡的「說話」按鈕）
DENSITIES = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
DEBUG_RES = ROOT / "app/src/debug/res"
FOREGROUND_NAME = "ic_launcher_pout.png"
ADAPTIVE_XML = """<?xml version="1.0" encoding="utf-8"?>
<!-- 由 tools/make_app_icon.py 產生（debug 專用，不進 git） -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_pout_background" />
    <foreground android:drawable="@mipmap/ic_launcher_pout" />
</adaptive-icon>
"""
COLOR_XML = f"""<?xml version="1.0" encoding="utf-8"?>
<!-- 由 tools/make_app_icon.py 產生（debug 專用，不進 git） -->
<resources>
    <color name="ic_launcher_pout_background">{BACKGROUND_COLOR}</color>
</resources>
"""


# 把去背圖放到透明正方形畫布上，讓可見圓的中心落在畫布正中央
def build_foreground():
    face = Image.open(SOURCE).convert("RGBA")
    canvas = Image.new("RGBA", (CANVAS_SIDE, CANVAS_SIDE), (0, 0, 0, 0))
    offset = (CANVAS_SIDE // 2 - VISIBLE_CENTER[0], CANVAS_SIDE // 2 - VISIBLE_CENTER[1])
    canvas.paste(face, offset, face)
    return canvas


# 產生各密度的前景圖、底色與兩個自適應圖示設定
def main():
    foreground = build_foreground()
    for density, size in DENSITIES.items():
        folder = DEBUG_RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        foreground.resize((size, size), Image.LANCZOS).save(folder / FOREGROUND_NAME)
    anydpi = DEBUG_RES / "mipmap-anydpi"
    anydpi.mkdir(parents=True, exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        (anydpi / name).write_text(ADAPTIVE_XML, encoding="utf-8")
    values = DEBUG_RES / "values"
    values.mkdir(parents=True, exist_ok=True)
    (values / "ic_launcher_pout.xml").write_text(COLOR_XML, encoding="utf-8")
    print(f"已產生圖示：{DEBUG_RES}")


if __name__ == "__main__":
    main()
