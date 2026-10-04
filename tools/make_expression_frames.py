# 把 Nano Banana 做好的表情差分整張圖，轉成懸浮窗用的 300×349 去背圖。
# 做法：依 idle.png 的裁切位置裁好、色調校正到與 idle.png 一致，
# 只把臉部（羽化橢圓）換進 idle.png，頭髮、耳朵、衣服與去背邊緣都沿用 idle.png，換臉時角色不會跳動。
# 用法：python tools/make_expression_frames.py <原圖資料夾，含 idle.jpg 與 face-*.jpg>
# 產出放在 app/src/main/assets/pet/frames/local/（不進 git）。

import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# 常數定義
SOURCE_WIDTH = 1728                       # 原圖寬（idle.jpg）
CROP_SCALE = 1076 / 300                   # idle.png 對應原圖的縮放倍率（以模板比對求得）
CROP_OFFSET = (91, 10)                    # idle.png 左上角在縮放後原圖中的位置
FRAME_SIZE = (300, 349)                   # 懸浮窗圖大小
FACE_ELLIPSE = (88, 78, 222, 205)         # 臉部範圍（在 300×349 座標內）
FACE_FEATHER = 8                          # 臉部邊緣羽化半徑
TONE_DEGREE = 3                           # 色調校正多項式次數
OPAQUE_ALPHA = 250                        # 視為不透明的 alpha 門檻
EXPRESSIONS = ["pout", "shy", "smile", "thinking", "troubled"]
FRAMES_DIR = Path(__file__).resolve().parent.parent / "app/src/main/assets/pet/frames/local"


# 依 idle.png 的位置裁切並縮成 300×349（原圖可以是任何等比例縮放版本）
def crop_frame(path):
    image = Image.open(path).convert("RGB")
    k = image.width / SOURCE_WIDTH
    s = CROP_SCALE
    box = (CROP_OFFSET[0] * s, CROP_OFFSET[1] * s, CROP_OFFSET[0] * s + 300 * s, CROP_OFFSET[1] * s + 349 * s)
    return image.crop(tuple(round(v * k) for v in box)).resize(FRAME_SIZE, Image.LANCZOS)


# 以 idle.jpg → idle.png 擬合每個色版的色調曲線
def fit_tone(source, reference, opaque):
    return [np.polyfit(source[:, :, c][opaque], reference[:, :, c][opaque], TONE_DEGREE) for c in range(3)]


# 套用色調曲線
def apply_tone(pixels, curves):
    return np.clip(np.stack([np.polyval(curves[c], pixels[:, :, c]) for c in range(3)], 2), 0, 255)


# 臉部羽化遮罩（0～1）
def face_mask():
    mask = Image.new("L", FRAME_SIZE, 0)
    ImageDraw.Draw(mask).ellipse(FACE_ELLIPSE, fill=255)
    return np.asarray(mask.filter(ImageFilter.GaussianBlur(FACE_FEATHER))).astype(float)[..., None] / 255


# 產生所有表情圖
def main(art_dir):
    reference = np.asarray(Image.open(FRAMES_DIR / "idle.png").convert("RGBA")).astype(float)
    alpha = reference[:, :, 3]
    source = np.asarray(crop_frame(art_dir / "idle.jpg")).astype(float)
    curves = fit_tone(source, reference, alpha > OPAQUE_ALPHA)
    mask = face_mask()
    for name in EXPRESSIONS:
        face = apply_tone(np.asarray(crop_frame(art_dir / f"face-{name}.jpg")).astype(float), curves)
        rgb = face * mask + reference[:, :, :3] * (1 - mask)  # 只換臉，其餘沿用 idle
        Image.fromarray(np.dstack([rgb, alpha]).astype("uint8"), "RGBA").save(FRAMES_DIR / f"{name}.png")
        print(f"已產生 {name}.png")


if __name__ == "__main__":
    main(Path(sys.argv[1]))
