#!/usr/bin/env python3
"""把生成出來的原始 jpg 素材處理成對齊、去背、尺寸一致的透明 PNG。

只依賴 Pillow 與 numpy，不需要 ImageMagick，也不需要連外。

子指令
  probe   量測每張圖：底色型態、主體邊界框、綠幕強度分布
  diff    兩張疊起來做差異比對，輸出彩色差異圖並算出最佳位移量
  build   去背 → 位移對齊 → 統一畫布 → 存成透明 PNG
  merge   用另一張圖補滿某張圖被挖空的內部破洞，再統一畫布輸出
  trim    把臉部成品的胸口切掉、頸圈用上方的脖子膚色補回，只留到脖子
  align-neck  把身體成品左右挪動，讓它自己畫的脖子與臉部圖層同一條中線
  seam    把身體成品壓在臉上的那一段上緣羽化，化掉兩層脖子之間的硬邊

用法範例
  python tools/prepare-assets.py probe assets/character/*.jpg
  python tools/prepare-assets.py diff  assets/character/face-neutral.jpg assets/character/face-troubled.jpg
  python tools/prepare-assets.py build assets/character/face-neutral.jpg --align-to assets/character/face-neutral.jpg
  python tools/prepare-assets.py merge --base assets/character/body02.jpg \
                                       --patch assets/character/body01.jpg \
                                       --out assets/character/png/body01.png
  python tools/prepare-assets.py trim  assets/character/png/face-*.png
  python tools/prepare-assets.py align-neck assets/character/png/body02.png \
                                            --face assets/character/png/face-neutral.png
  python tools/prepare-assets.py seam  assets/character/png/body02.png \
                                      --face assets/character/png/face-neutral.png
"""

import argparse
import glob
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

# 常數定義
TARGET_W = 800  # 計畫書 config/emotion-map.json 的預設畫布
TARGET_H = 1200
# 柔邊範圍刻意收窄：這批素材是 JPEG，邊緣的綠色壓縮雜訊若留成半透明像素，
# 去綠後會變成一條淡橄欖色細線掛在手臂與領口上。從 0 起算可以把那圈雜訊直接切掉。
MATTE_LO = 0.0    # 綠度低於此值視為完全不透明的主體
MATTE_HI = 45.0   # 綠度高於此值視為完全透明的背景
WHITE_LO = 226.0  # 白底鍵值：亮度高於此值才可能是背景
WHITE_SAT = 18.0  # 白底鍵值：飽和度高於此值一律當主體，保護白耳白尾
BORDER_SAMPLE = 8  # 判斷底色時取樣的邊框寬度
COARSE_STEP = 4    # 位移搜尋先降取樣這個倍率
COARSE_RADIUS = 20 # 降取樣後的搜尋半徑（等於原圖 80 px）
FINE_RADIUS = 5    # 全解析度下的細修半徑
OUTSIDE_MARK = 128 # flood fill 用來標記「與畫布邊界相連」的暫時色
# trim 的預設值。zOrder 把 body 疊在 face 之上以後，臉這一層以下的胸口純粹是負擔，
# 切掉才不會在換衣服時從領口漏出舊洋裝。切在哪一列由服裝決定：四套 body 量下來，
# 從 y=268 起每一套都能完整蓋住臉。多留兩列是墊在柔邊後面用的——body04 的上緣
# 是綠幕柔邊，alpha 要到 y=270 才滿，底下沒有東西墊著就會透出背景色。
NECK_CUT = 270       # 這一列（含）以下的臉部圖層一律清成透明
NECK_SCAN_FROM = 240 # 從這一列開始往下找頸圈，再往上就是下巴了
NECK_DARK_LEVEL = 120.0 # 亮度低於此值視為暗色像素
NECK_DARK_RUN = 4    # 一欄要連續暗這麼多列才算頸圈，一兩列的暗是下巴的輪廓線
NECK_SHADE = 0.88    # 補出來的脖子往下漸暗到這個倍率，模擬衣領的投影
NECK_SPAN = 6        # 來源膚色沿著 x 做移動平均的半徑，用來抹掉直紋
SEAM_FLOOR = 0.1     # 羽化起點保留的不透明度，留一點才不會在最上緣看見臉的輪廓線
# 找重疊範圍時，身體只要有一點點不透明就算數，不能用 ALPHA_SOLID。
# 綠幕柔邊會讓上緣的 alpha 花好幾列才爬滿（body04 是 36→107→171→244），
# 用 0.5 當門檻會從半路才開始羽化，把已經爬到一半的 alpha 一腳踩回 floor，
# 於是 alpha 變成 36→107→17→244，接縫處反而多一條比原本更明顯的橫線。
SEAM_EDGE = 0.02     # 身體的 alpha 高於此值就算進入重疊範圍
# align-neck 的預設值。掃描範圍要涵蓋臉的脖子（256~266）與身體自己畫的脖子（262 以下），
# 兩層各自掃到哪幾列不必一樣，反正脖子是直的，中心不隨列改變。
NECK_SCAN_ROWS = (256, 281)
NECK_MIN_WIDTH = 10  # 一列的膚色少於這麼寬就不列入，避免領口的碎片把中心拉走
SKIN_MIN_RED = 150.0       # 膚色判準：紅通道下限
SKIN_RED_OVER_BLUE = 28.0  # 膚色判準：紅超出藍多少
SKIN_RED_OVER_GREEN = 18.0 # 膚色判準：紅超出綠多少
ALPHA_SOLID = 0.5    # alpha 高於此值視為實心像素
COMPONENT_LIMIT = 254  # 連通元件數量上限，同時也是灰階影像可用的標記值上限


# 功能函數定義

def load_rgb(path):
    """讀成 float32 的 RGB 陣列，形狀 (H, W, 3)。"""
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float32)


def greenness(arr):
    """綠度：綠通道超出紅藍最大值多少。純綠幕會很大，膚色髮色會是負的。"""
    return arr[..., 1] - np.maximum(arr[..., 0], arr[..., 2])


def detect_background(arr):
    """看四邊框的顏色，判斷這張是綠幕、白底、還是已經滿版沒有背景。"""
    edges = np.concatenate([
        arr[:BORDER_SAMPLE].reshape(-1, 3),
        arr[-BORDER_SAMPLE:].reshape(-1, 3),
        arr[:, :BORDER_SAMPLE].reshape(-1, 3),
        arr[:, -BORDER_SAMPLE:].reshape(-1, 3),
    ])
    mean = edges.mean(axis=0)
    if mean[1] - max(mean[0], mean[2]) > MATTE_HI:
        return "green"
    if mean.min() > WHITE_LO:
        return "white"
    return "none"


def green_alpha(arr, lo, hi):
    """由綠度算出柔邊 alpha：綠度越高越透明，中間帶是漸層而非硬切。"""
    return np.clip((hi - greenness(arr)) / (hi - lo), 0.0, 1.0)


def as_mask_image(mask):
    """把布林遮罩轉成可寫入的灰階影像。

    copy() 不可省略：fromarray 產生的影像共用 numpy 的唯讀緩衝區，floodfill 會靜默失效。
    """
    return Image.fromarray(np.where(mask, 255, 0).astype(np.uint8), mode="L").copy()


def touching_border(mask):
    """遮罩中與畫布四邊相連的那一部分。用來區分「外部背景」與「主體內部的破洞」。

    先在四周補一圈 True 再從角落灌水，即使背景只碰到邊界中段也一定填得到。
    """
    flood = as_mask_image(np.pad(mask, 1, constant_values=True))
    ImageDraw.floodfill(flood, (0, 0), OUTSIDE_MARK, thresh=0)
    return (np.asarray(flood) == OUTSIDE_MARK)[1:-1, 1:-1]


def interior_holes(subject):
    """被主體包圍、與畫布邊界不相連的透明區域。胸口被挖空的那種洞就是這個。"""
    empty = ~subject
    return empty & ~touching_border(empty)


def label_components(mask):
    """把遮罩拆成一個個四連通元件，由大到小回傳。"""
    work = as_mask_image(mask)
    components = []
    for label in range(1, COMPONENT_LIMIT + 1):
        remaining = np.argwhere(np.asarray(work) == 255)
        if remaining.size == 0:
            break
        y, x = remaining[0]
        ImageDraw.floodfill(work, (int(x), int(y)), label, thresh=0)
        components.append(np.asarray(work) == label)
    return sorted(components, key=np.count_nonzero, reverse=True)


def white_alpha(arr):
    """白底鍵值：先挑出低飽和的亮區，再從畫面邊界往內填，避免吃掉主體內部的白色。"""
    saturation = arr.max(axis=-1) - arr.min(axis=-1)
    candidate = (arr.min(axis=-1) > WHITE_LO) & (saturation < WHITE_SAT)
    # 只有與畫布邊界相連的白色才算背景，白耳朵與白尾巴尖因此得以保留
    return np.where(touching_border(candidate), 0.0, 1.0).astype(np.float32)


def despill(arr, strength, balance):
    """去綠邊：把綠通道壓到紅藍推算出的上限，邊緣不會殘留一圈螢光綠或土黃色。

    上限由 balance 在紅藍的較小值與較大值之間取：
    1.0 只壓掉超出 max(R,B) 的部分，最保守，但膚色本來就 G < R，壓不乾淨會留下土黃邊；
    0.5 取紅藍平均，是合成慣用的預設；0.0 最激進，壓到 min(R,B)。
    """
    if strength <= 0:
        return arr
    low = np.minimum(arr[..., 0], arr[..., 2])
    high = np.maximum(arr[..., 0], arr[..., 2])
    limit = low + (high - low) * balance
    excess = np.maximum(arr[..., 1] - limit, 0.0)
    out = arr.copy()
    out[..., 1] = arr[..., 1] - excess * strength
    return out


def build_alpha(arr, mode, lo, hi, shrink):
    """依底色型態產生 alpha，並可選擇把邊緣往內縮幾個像素去掉殘邊。"""
    if mode == "green":
        alpha = green_alpha(arr, lo, hi)
    elif mode == "white":
        alpha = white_alpha(arr)
    else:
        alpha = np.ones(arr.shape[:2], dtype=np.float32)
    if shrink > 0:
        size = shrink * 2 + 1
        eroded = Image.fromarray((alpha * 255).astype(np.uint8), mode="L")
        alpha = np.asarray(eroded.filter(ImageFilter.MinFilter(size)), dtype=np.float32) / 255.0
    return alpha


def grow(mask, radius):
    """把遮罩往外擴張幾個像素，讓補進來的內容多蓋住一圈，接縫不會露出細白線。"""
    if radius <= 0:
        return mask
    expanded = as_mask_image(mask).filter(ImageFilter.MaxFilter(radius * 2 + 1))
    return np.asarray(expanded) > 127


def over(top_color, top_alpha, bottom_color, bottom_alpha):
    """標準的 source-over 疊合，走非預乘 alpha。回傳 (顏色, alpha)。"""
    weight = bottom_alpha * (1.0 - top_alpha)
    out_alpha = top_alpha + weight
    safe = np.maximum(out_alpha, 1e-6)[..., None]
    out_color = (top_color * top_alpha[..., None] + bottom_color * weight[..., None]) / safe
    return out_color, out_alpha


def subject_bbox(alpha, threshold=0.5):
    """主體的邊界框 (x0, y0, x1, y1)，全透明時回傳 None。"""
    rows = np.where(alpha.max(axis=1) > threshold)[0]
    cols = np.where(alpha.max(axis=0) > threshold)[0]
    if rows.size == 0 or cols.size == 0:
        return None
    return int(cols[0]), int(rows[0]), int(cols[-1]) + 1, int(rows[-1]) + 1


def shifted_overlap_cost(mask_a, mask_b, dx, dy):
    """把 b 位移 (dx, dy) 之後與 a 的不重疊像素數，越小代表對得越準。"""
    rolled = np.roll(np.roll(mask_b, dy, axis=0), dx, axis=1)
    return int(np.count_nonzero(mask_a ^ rolled))


def best_offset(mask_a, mask_b):
    """由粗到細搜尋讓兩張輪廓最貼合的位移量，回傳 (dx, dy, 殘差像素數)。"""
    small_a = mask_a[::COARSE_STEP, ::COARSE_STEP]
    small_b = mask_b[::COARSE_STEP, ::COARSE_STEP]
    coarse = min(
        ((dx, dy, shifted_overlap_cost(small_a, small_b, dx, dy))
         for dy in range(-COARSE_RADIUS, COARSE_RADIUS + 1)
         for dx in range(-COARSE_RADIUS, COARSE_RADIUS + 1)),
        key=lambda item: item[2],
    )
    base_x, base_y = coarse[0] * COARSE_STEP, coarse[1] * COARSE_STEP
    fine = min(
        ((dx, dy, shifted_overlap_cost(mask_a, mask_b, dx, dy))
         for dy in range(base_y - FINE_RADIUS, base_y + FINE_RADIUS + 1)
         for dx in range(base_x - FINE_RADIUS, base_x + FINE_RADIUS + 1)),
        key=lambda item: item[2],
    )
    return fine


def to_rgba(arr, alpha):
    """把顏色與 alpha 併成 uint8 的 RGBA 影像。"""
    rgba = np.dstack([np.clip(arr, 0, 255), np.clip(alpha * 255.0, 0, 255)])
    return Image.fromarray(rgba.astype(np.uint8), mode="RGBA")


def canonicalize(image, fit):
    """統一到 TARGET_W x TARGET_H。所有圖層套用同一組變換，對齊關係不會被破壞。"""
    if fit == "stretch":
        return image.resize((TARGET_W, TARGET_H), Image.LANCZOS)
    scale = (min if fit == "contain" else max)(TARGET_W / image.width, TARGET_H / image.height)
    resized = image.resize((round(image.width * scale), round(image.height * scale)), Image.LANCZOS)
    canvas = Image.new("RGBA", (TARGET_W, TARGET_H), (0, 0, 0, 0))
    # 水平置中；垂直靠上，讓裁切時砍掉的是下襬而不是頭頂
    canvas.paste(resized, ((TARGET_W - resized.width) // 2, 0))
    return canvas


def keyed(path, args):
    """讀檔、判斷底色、去背、去綠邊，回傳 (顏色陣列, alpha, 底色型態)。"""
    arr = load_rgb(path)
    mode = detect_background(arr) if args.bg == "auto" else args.bg
    alpha = build_alpha(arr, mode, args.matte_lo, args.matte_hi, args.shrink)
    color = despill(arr, args.despill, args.despill_balance) if mode == "green" else arr
    return color, alpha, mode


# 子指令實作

def cmd_probe(args):
    for path in expand(args.paths):
        arr = load_rgb(path)
        mode = detect_background(arr)
        alpha = build_alpha(arr, mode, args.matte_lo, args.matte_hi, 0)
        box = subject_bbox(alpha)
        coverage = float(alpha.mean())
        g = greenness(arr)
        print(f"{Path(path).name}")
        print(f"  尺寸        {arr.shape[1]} x {arr.shape[0]}")
        print(f"  底色        {mode}")
        print(f"  主體邊界框  {box}")
        print(f"  主體佔比    {coverage:6.2%}")
        print(f"  綠度分布    min {g.min():7.1f}  中位 {np.median(g):7.1f}  max {g.max():7.1f}")
    return 0


def cmd_diff(args):
    color_a, alpha_a, mode_a = keyed(args.left, args)
    color_b, alpha_b, mode_b = keyed(args.right, args)
    mask_a, mask_b = alpha_a > 0.5, alpha_b > 0.5
    dx, dy, residual = best_offset(mask_a, mask_b)
    union = int(np.count_nonzero(mask_a | mask_b))
    print(f"左：{Path(args.left).name}（{mode_a}）  右：{Path(args.right).name}（{mode_b}）")
    print(f"  未對齊時的輪廓差異  {shifted_overlap_cost(mask_a, mask_b, 0, 0):>8} px")
    print(f"  最佳位移            dx={dx:+d}  dy={dy:+d}")
    print(f"  位移後的輪廓差異    {residual:>8} px（占聯集 {residual / max(union, 1):.2%}）")
    if args.out:
        # 差異圖：只有左邊有的畫紅色、只有右邊有的畫藍色、兩邊都有的畫灰色
        overlay = np.zeros(mask_a.shape + (3,), dtype=np.uint8)
        overlay[..., 0] = np.where(mask_a & ~mask_b, 255, 0)
        overlay[..., 2] = np.where(mask_b & ~mask_a, 255, 0)
        both = mask_a & mask_b
        overlay[both] = (70, 70, 70)
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(overlay).save(args.out)
        print(f"  差異圖已存到        {args.out}")
    return 0


def cmd_build(args):
    reference = None
    if args.align_to:
        _, ref_alpha, _ = keyed(args.align_to, args)
        reference = ref_alpha > 0.5
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for path in expand(args.paths):
        color, alpha, mode = keyed(path, args)
        note = ""
        if reference is not None and Path(path) != Path(args.align_to):
            dx, dy, _ = best_offset(reference, alpha > 0.5)
            if dx or dy:
                color = np.roll(np.roll(color, dy, axis=0), dx, axis=1)
                alpha = np.roll(np.roll(alpha, dy, axis=0), dx, axis=1)
            note = f"  位移 dx={dx:+d} dy={dy:+d}"
        image = canonicalize(to_rgba(color, alpha), args.fit)
        target = out_dir / (Path(path).stem + ".png")
        image.save(target)
        print(f"{Path(path).name}  →  {target}  （{mode}，{image.width}x{image.height}）{note}")
    return 0


def cmd_merge(args):
    base_color, base_alpha, base_mode = keyed(args.base, args)
    patch_color, patch_alpha, patch_mode = keyed(args.patch, args)
    patch_mask = patch_alpha > 0.5
    holes = interior_holes(base_alpha > 0.5)
    print(f"底圖：{Path(args.base).name}（{base_mode}）  補丁：{Path(args.patch).name}（{patch_mode}）")
    selected = np.zeros_like(holes)
    for index, component in enumerate(label_components(holes), start=1):
        size = int(np.count_nonzero(component))
        coverage = float(np.count_nonzero(component & patch_mask)) / size
        x0, y0, x1, y1 = subject_bbox(component.astype(np.float32))
        # 補丁蓋不滿的破洞是本來就該透光的縫隙（例如手臂與裙身之間），必須留著
        take = coverage >= args.min_coverage
        print(f"  破洞{index}  {size:6d} px  x {x0:3d}..{x1:3d}  y {y0:3d}..{y1:3d}  "
              f"補丁覆蓋 {coverage:6.1%}  {'補上' if take else '保持透明'}")
        if take:
            selected |= component
    if not selected.any():
        raise SystemExit("沒有任何破洞達到覆蓋門檻，請調整 --min-coverage")
    region = grow(selected, args.grow)
    color, alpha = over(base_color, base_alpha, patch_color, patch_alpha * region)
    image = canonicalize(to_rgba(color, alpha), args.fit)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    image.save(args.out)
    print(f"  已輸出 {args.out}（{image.width}x{image.height}）")
    return 0


def load_rgba(path):
    """讀一張已經去背的 PNG，回傳 (顏色陣列, 0..1 的 alpha)。trim 吃的是成品不是原始圖。"""
    arr = np.asarray(Image.open(path).convert("RGBA"), dtype=np.float32)
    return arr[..., :3], arr[..., 3] / 255.0


def column_choker_top(dark_column, run):
    """一欄裡頸圈從哪一列開始（回傳索引，找不到回傳 None）。

    判準是「連續暗到底」而不是「這裡是暗的」：下巴的輪廓線也是暗的，但只有一兩列，
    頸圈則是一路暗到裁切線。只認長跑才分得開這兩者，否則會把下巴的線一起塗掉。
    """
    streak = 0
    for index in range(dark_column.size - 1, -1, -1):
        streak = streak + 1 if dark_column[index] else 0
        if streak >= run and (index == 0 or not dark_column[index - 1]):
            return index
    return None


def neck_sources(color, alpha, cut, scan_from, dark_level, dark_run):
    """逐欄找出頸圈起點與該欄可用的乾淨膚色。回傳 {欄: (起點列, 顏色)}。

    蕾絲的上緣是波浪狀，繞到脖子兩側時位置更高，所以不能全部共用同一列來源；
    每一欄各自往上找自己的膚色，波浪邊才不會被壓成一條直線。
    """
    solid = alpha > ALPHA_SOLID
    dark = solid & (color.mean(axis=-1) < dark_level)
    found = {}
    for x in range(color.shape[1]):
        top = column_choker_top(dark[scan_from:cut, x], dark_run)
        if top is None:
            continue
        top += scan_from
        # 從掃描起點就一路暗的欄位是脖子的輪廓線，不是頸圈。塗掉它等於把脖子的
        # 邊緣抹平，比留著更難看，所以放過。
        found[x] = top
    return found


def clean_row_colors(color, solid, dark, columns, start, scan_from):
    """從 start 這一列往上，逐欄取第一個乾淨的膚色。取不到的欄位不列入。"""
    picked = {}
    for x in columns:
        y = start
        while y >= scan_from and (not solid[y, x] or dark[y, x]):
            y -= 1
        if y >= scan_from:
            picked[x] = color[y, x].copy()
    return picked


def smooth_across(picked_colors, span):
    """把各欄的來源膚色沿著 x 做移動平均，抹掉取樣造成的直紋，只留左右明暗漸層。"""
    columns = sorted(picked_colors)
    picked = np.array([picked_colors[x] for x in columns])
    smoothed = np.empty_like(picked)
    for index in range(len(columns)):
        lo = max(index - span, 0)
        hi = min(index + span + 1, len(columns))
        smoothed[index] = picked[lo:hi].mean(axis=0)
    return {x: smoothed[index] for index, x in enumerate(columns)}


def repaint_neck(color, alpha, cut, scan_from, dark_level, dark_run, shade, span):
    """把頸圈換成脖子膚色。回傳補過的欄數。

    起點取所有欄位中最高的那個頸圈上緣，整段一起重畫。逐欄各自從自己的上緣起筆
    會沿著蕾絲的波浪邊留下一圈色階，等於把頸圈的形狀又描了一次；拉成一條水平線
    就沒有這個鬼影，而取樣列在所有蕾絲之上，也不會把蕾絲的顏色抹下來。

    脖子的明暗本來就是縱向的，直接往下拉不會露出馬腳；只在越靠近領口處加一點漸暗，
    模擬衣領的投影。
    """
    solid = alpha > ALPHA_SOLID
    dark = solid & (color.mean(axis=-1) < dark_level)
    found = neck_sources(color, alpha, cut, scan_from, dark_level, dark_run)
    if not found:
        return 0
    top = min(found.values())
    picked = clean_row_colors(color, solid, dark, found, top - 1, scan_from)
    if not picked:
        return 0
    shades = smooth_across(picked, span)
    for x in shades:
        for y in range(top, cut):
            if not solid[y, x]:
                continue
            depth = (y - top + 1) / max(cut - top, 1)
            color[y, x] = shades[x] * (1.0 - (1.0 - shade) * depth)
    return len(shades)


def skin_mask(color, alpha):
    """膚色遮罩：夠亮、而且紅明顯高過藍與綠。布料、頭髮、輪廓線都不會通過。"""
    red, green, blue = color[..., 0], color[..., 1], color[..., 2]
    return ((alpha > ALPHA_SOLID) & (red > SKIN_MIN_RED)
            & ((red - blue) > SKIN_RED_OVER_BLUE) & ((red - green) > SKIN_RED_OVER_GREEN))


def neck_center(color, alpha, lo, hi, min_width):
    """脖子在水平方向的中心，取各列中點的中位數。掃不到夠寬的膚色時回傳 None。

    用中位數而不是平均：鎖骨、領口的斜邊會讓某幾列的膚色往一側延伸，
    平均會被那幾列拉走，中位數不會。
    """
    mask = skin_mask(color, alpha)
    mids = []
    for y in range(lo, hi):
        columns = np.where(mask[y])[0]
        if columns.size >= min_width:
            mids.append((int(columns[0]) + int(columns[-1])) / 2)
    return float(np.median(mids)) if mids else None


def feather_seam(alpha, face_alpha, floor):
    """把身體圖層壓在臉上的那一段上緣羽化掉，回傳羽化過的欄數。

    身體疊在臉之上，兩層的脖子若不是同一張圖畫出來的，交界就會是一條硬邊：
    寬度對不上、膚色也對不上。逐欄從重疊的第一列漸進到最後一列，讓上面那截
    透出臉自己的脖子，硬邊就化成漸層。

    只在臉還在後面的地方羽化。臉沒有蓋到的地方（肩線、袖子）一律保持不透明，
    否則角色的輪廓會透出背景，變成一圈鬼影。
    """
    overlap = (alpha > SEAM_EDGE) & (face_alpha > ALPHA_SOLID)
    feathered = 0
    for x in range(alpha.shape[1]):
        rows = np.where(overlap[:, x])[0]
        if rows.size < 2:
            continue
        top, bottom = int(rows[0]), int(rows[-1])
        for y in range(top, bottom + 1):
            if not overlap[y, x]:
                continue
            # smoothstep：兩端平緩，中間才變化快，不會在起訖處留下第二條可見的邊
            t = (y - top) / (bottom - top)
            alpha[y, x] *= floor + (1.0 - floor) * (t * t * (3.0 - 2.0 * t))
        feathered += 1
    return feathered


def cmd_align_neck(args):
    face_color, face_alpha = load_rgba(args.face)
    target = neck_center(face_color, face_alpha, args.rows[0], args.rows[1], args.min_width)
    if target is None:
        raise SystemExit(f"在 {args.face} 的 y={args.rows[0]}..{args.rows[1]} 掃不到脖子")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"基準：{Path(args.face).name}  脖子中心 x={target:.1f}")
    for path in expand(args.paths):
        color, alpha = load_rgba(path)
        found = neck_center(color, alpha, args.rows[0], args.rows[1], args.min_width)
        if found is None:
            print(f"{Path(path).name}  掃不到脖子，跳過")
            continue
        # 只修水平。垂直位置是 canonicalize 那一組共用變換決定的，本來就對得上；
        # 會跑掉的是生成時的重新構圖，而那只發生在水平方向。
        shift = int(np.floor(target - found + 0.5))
        if shift:
            color = np.roll(color, shift, axis=1)
            alpha = np.roll(alpha, shift, axis=1)
        out = out_dir / Path(path).name
        to_rgba(color, alpha).save(out)
        print(f"{Path(path).name}  →  {out}  脖子中心 x={found:.1f}  位移 dx={shift:+d}")
    return 0


def cmd_seam(args):
    _, face_alpha = load_rgba(args.face)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for path in expand(args.paths):
        color, alpha = load_rgba(path)
        feathered = feather_seam(alpha, face_alpha, args.floor)
        target = out_dir / Path(path).name
        to_rgba(color, alpha).save(target)
        print(f"{Path(path).name}  →  {target}  羽化 {feathered} 欄")
    return 0


def cmd_trim(args):
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    for path in expand(args.paths):
        color, alpha = load_rgba(path)
        repainted = repaint_neck(color, alpha, args.cut, args.scan_from,
                                 args.dark_level, args.dark_run, args.shade, args.span)
        # 一欄都沒補到就只做裁切。這通常代表門檻不對，印出來讓人看得見，
        # 不要無聲無息地交出一張還戴著頸圈的臉。
        note = f"補回 {repainted} 欄脖子膚色" if repainted else "未偵測到頸圈，只做裁切"
        alpha[args.cut:] = 0.0
        target = out_dir / Path(path).name
        to_rgba(color, alpha).save(target)
        print(f"{Path(path).name}  →  {target}  y>={args.cut} 清空；{note}")
    return 0


def expand(patterns):
    """把可能含萬用字元的路徑展開成實際檔案清單。"""
    found = [item for pattern in patterns for item in sorted(glob.glob(pattern))]
    if not found:
        raise SystemExit(f"找不到符合的檔案：{patterns}")
    return found


def main(argv):
    parser = argparse.ArgumentParser(description="角色素材去背、對齊與尺寸統一")
    parser.add_argument("--bg", choices=["auto", "green", "white", "none"], default="auto",
                        help="底色型態，預設自動偵測")
    parser.add_argument("--matte-lo", type=float, default=MATTE_LO, help="綠幕柔邊下限")
    parser.add_argument("--matte-hi", type=float, default=MATTE_HI, help="綠幕柔邊上限")
    parser.add_argument("--despill", type=float, default=1.0, help="去綠邊強度，0 為關閉")
    parser.add_argument("--despill-balance", type=float, default=0.5,
                        help="去綠上限在紅藍之間的取法：1.0 取大值、0.5 取平均、0.0 取小值")
    parser.add_argument("--shrink", type=int, default=0, help="alpha 往內縮幾個像素")
    sub = parser.add_subparsers(dest="command", required=True)

    probe = sub.add_parser("probe", help="量測素材現況")
    probe.add_argument("paths", nargs="+")
    probe.set_defaults(func=cmd_probe)

    diff = sub.add_parser("diff", help="兩張圖的輪廓差異與最佳位移")
    diff.add_argument("left")
    diff.add_argument("right")
    diff.add_argument("-o", "--out", help="輸出彩色差異圖的路徑")
    diff.set_defaults(func=cmd_diff)

    build = sub.add_parser("build", help="去背、對齊、統一尺寸並輸出 PNG")
    build.add_argument("paths", nargs="+")
    build.add_argument("--out-dir", default="assets/character/png")
    build.add_argument("--align-to", help="以這張的輪廓為基準對齊其餘圖層")
    build.add_argument("--fit", choices=["contain", "cover", "stretch"], default="contain",
                       help="contain 等比縮放留白、cover 等比填滿裁切、stretch 直接拉伸")
    build.set_defaults(func=cmd_build)

    merge = sub.add_parser("merge", help="用另一張圖補滿底圖被挖空的內部破洞")
    merge.add_argument("--base", required=True, help="當背景的那張")
    merge.add_argument("--patch", required=True, help="拿來補洞的那張")
    merge.add_argument("--out", required=True, help="輸出的 PNG 路徑")
    merge.add_argument("--min-coverage", type=float, default=0.9,
                       help="破洞要被補丁蓋到這個比例才補，其餘留著透光")
    merge.add_argument("--grow", type=int, default=2, help="補進來的區域往外擴張幾個像素")
    merge.add_argument("--fit", choices=["contain", "cover", "stretch"], default="contain")
    merge.set_defaults(func=cmd_merge)

    trim = sub.add_parser("trim", help="臉部成品切掉胸口、塗掉頸圈，只留到脖子")
    trim.add_argument("paths", nargs="+", help="已經去背的臉部 PNG")
    trim.add_argument("--out-dir", default="assets/character/png",
                      help="輸出目錄，預設與成品同一處，也就是就地覆蓋")
    trim.add_argument("--cut", type=int, default=NECK_CUT,
                      help="這一列（含）以下清成透明。改素材時用 body 的領口重新量")
    trim.add_argument("--scan-from", type=int, default=NECK_SCAN_FROM, help="從哪一列開始找頸圈")
    trim.add_argument("--dark-level", type=float, default=NECK_DARK_LEVEL, help="暗色像素的亮度門檻")
    trim.add_argument("--dark-run", type=int, default=NECK_DARK_RUN,
                      help="一欄要連續暗這麼多列才算頸圈，用來跟下巴的輪廓線區分")
    trim.add_argument("--shade", type=float, default=NECK_SHADE, help="補出來的脖子往下漸暗到幾倍")
    trim.add_argument("--span", type=int, default=NECK_SPAN, help="來源膚色橫向移動平均的半徑")
    trim.set_defaults(func=cmd_trim)

    align = sub.add_parser("align-neck", help="左右挪動身體成品，讓脖子與臉對上同一條中線")
    align.add_argument("paths", nargs="+", help="要對齊的身體 PNG")
    align.add_argument("--face", required=True, help="當基準的臉部 PNG")
    align.add_argument("--out-dir", default="assets/character/png", help="輸出目錄，預設就地覆蓋")
    align.add_argument("--rows", type=int, nargs=2, default=list(NECK_SCAN_ROWS),
                       metavar=("LO", "HI"), help="量測脖子中心的列範圍")
    align.add_argument("--min-width", type=int, default=NECK_MIN_WIDTH,
                       help="一列至少要這麼寬的膚色才列入量測")
    align.set_defaults(func=cmd_align_neck)

    seam = sub.add_parser("seam", help="身體成品壓在臉上的那段上緣羽化，化掉硬邊")
    seam.add_argument("paths", nargs="+", help="要羽化的身體 PNG")
    seam.add_argument("--face", required=True, help="拿來界定重疊範圍的臉部 PNG")
    seam.add_argument("--out-dir", default="assets/character/png", help="輸出目錄，預設就地覆蓋")
    seam.add_argument("--floor", type=float, default=SEAM_FLOOR, help="羽化起點保留的不透明度")
    seam.set_defaults(func=cmd_seam)

    args = parser.parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
