# 用表情差分 face-pout.jpg 產生 App 圖示（只放在 debug 來源集，不進 git）。
# 角色立繪不進公開 repo（規格書 §2.1），所以圖示產物放在 app/src/debug/res/，由 .gitignore 排除；
# release 建置仍用 main 的預設圖示。
# 用法：python tools/make_app_icon.py <原圖資料夾，含 face-pout.jpg>

import sys
from pathlib import Path

from PIL import Image

# 常數定義
SOURCE_NAME = "face-pout.jpg"
SOURCE_WIDTH = 1728                 # 原圖全尺寸寬（face-*.jpg 可能是縮小版，依比例換算）
FACE_CENTER = (864, 480)            # 裁切中心：臉與貓耳的中間（以 1728 寬的原圖座標）
CROP_SIDE = 960                     # 108dp 前景對應的裁切邊長（上緣剛好貼齊原圖頂端；中間 72dp 可見區約為貓耳到下巴）
DENSITIES = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}
DEBUG_RES = Path(__file__).resolve().parent.parent / "app/src/debug/res"
FOREGROUND_NAME = "ic_launcher_pout.png"
ADAPTIVE_XML = """<?xml version="1.0" encoding="utf-8"?>
<!-- 由 tools/make_app_icon.py 產生（debug 專用，不進 git） -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@android:color/white" />
    <foreground android:drawable="@mipmap/ic_launcher_pout" />
</adaptive-icon>
"""


# 以臉為中心裁出正方形
def crop_face(path):
    image = Image.open(path).convert("RGB")
    k = image.width / SOURCE_WIDTH
    cx, cy, half = FACE_CENTER[0] * k, FACE_CENTER[1] * k, CROP_SIDE * k / 2
    return image.crop((round(cx - half), round(cy - half), round(cx + half), round(cy + half)))


# 產生各密度的前景圖與兩個自適應圖示設定
def main(art_dir):
    face = crop_face(art_dir / SOURCE_NAME)
    for density, size in DENSITIES.items():
        folder = DEBUG_RES / f"mipmap-{density}"
        folder.mkdir(parents=True, exist_ok=True)
        face.resize((size, size), Image.LANCZOS).save(folder / FOREGROUND_NAME)
    anydpi = DEBUG_RES / "mipmap-anydpi"
    anydpi.mkdir(parents=True, exist_ok=True)
    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        (anydpi / name).write_text(ADAPTIVE_XML, encoding="utf-8")
    print(f"已產生圖示：{DEBUG_RES}")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
