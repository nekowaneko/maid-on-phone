## 素材規格書

本目錄分成兩層：

- **原始檔（`*.jpg`）**：nano banana 直接產出的綠幕圖，畫布一律 800 x 1333。這是來源，不直接給程式用。
- **成品（`png/*.png`）**：由 `tools/prepare-assets.py` 去背、統一成 800 x 1200 的透明 PNG。
  `config/emotion-map.json` 的 `assetRoot` 指向這裡。

成品必須**像素級對齊**：所有圖層套用同一組縮放與置中變換，直接疊起來就會對準，
不得靠程式做位移或縮放。

## 圖層

| 成品檔名 | 圖層鍵 | 來源 | 說明 |
|---|---|---|---|
| `png/body01.png` | `body` | `body02.jpg` ＋ `body01.jpg` | 脖子以下的全身：洋裝、手臂、雙腿、鞋子 |
| `png/body02.png` | `body` | `pajamas01.jpg` | 同上，換成奶油白睡衣、赤腳 |
| `png/body03.png` | `body` | `pajamas02.jpg` | 同上，換成玫瑰粉睡衣、赤腳 |
| `png/body04.png` | `body` | `swimsuit.jpg` | 同上，換成荷葉邊泳裝、赤腳。領口最低的一套 |
| `png/face-*.png` | `face` | `face-*.jpg` | 光頭＋五官＋脖子，五種表情各一張。胸口與頸圈已切掉 |
| `png/ears-cat.png` | `ears` | `ears-cat.jpg` | 一對貓耳，可整組替換為其他獸耳 |
| `png/hair.png` | `hair` | `hair.jpg` | 瀏海、側髮、後髮合為一層，中央留臉形鏤空 |

`body` 的兩個來源：`body02.jpg` 有手有腳但胸口被挖空，`body01.jpg` 有完整胸口。
`tools/prepare-assets.py merge` 會找出 body02 內部被主體包圍的破洞，
只補上被 body01 蓋滿的那一個（胸口），手臂與裙身之間該透光的縫隙一律保留。

## 疊合順序

由下而上：`face` → `body` → `ears` → `hair`。
順序定義在 `config/emotion-map.json` 的 `zOrder`，不寫死在程式裡。

`body` 壓在 `face` 之上，是為了讓胸口只由 `body` 這一層決定。`face-*.png` 本身
也畫了胸口（連著洋裝），若讓它蓋在 `body` 上，換一套衣服就會露出舊洋裝。
翻過來之後，`face` 只剩脖子露在領口上方，以下整片被 `body` 蓋住。
換衣服的代價因此只剩「新素材的輪廓不能比 `body01` 窄」這一條。

`hair` 放最上層是因為它是完整一片假髮、中央有臉形鏤空，臉會從洞裡透出來，
所以不需要拆成前髮與後髮兩層。`ears` 壓在 `hair` 之下，耳根會被頭髮蓋住，
這樣貓耳看起來是從頭髮裡長出來的，而不是貼上去的。

## 重新產生成品

```bash
python tools/prepare-assets.py merge --base assets/character/body02.jpg \
                                     --patch assets/character/body01.jpg \
                                     --out assets/character/png/body01.png
python tools/prepare-assets.py build assets/character/hair.jpg \
                                     assets/character/ears-cat.jpg \
                                     assets/character/face-*.jpg \
                                     --out-dir assets/character/png
python tools/prepare-assets.py build assets/character/pajamas01.jpg \
                                     assets/character/pajamas02.jpg \
                                     assets/character/swimsuit.jpg \
                                     --out-dir assets/character/png
python tools/prepare-assets.py trim  assets/character/png/face-*.png
python tools/prepare-assets.py align-neck assets/character/png/body02.png \
                                          assets/character/png/body03.png \
                                          assets/character/png/body04.png \
                                          --face assets/character/png/face-neutral.png
python tools/prepare-assets.py seam  assets/character/png/body02.png \
                                     assets/character/png/body03.png \
                                     assets/character/png/body04.png \
                                     --face assets/character/png/face-neutral.png
```

`align-neck` 必須排在 `seam` 之前。`seam` 是依「身體與臉重疊到哪些像素」算羽化範圍的，
先羽化再位移，羽化帶就跟著跑掉了。同理，`trim` 要排在這兩者之前——它決定臉留到哪一列，
而那正是羽化帶的下界。

`build` 產生的檔名要改成圖層名：`pajamas01` → `body02`、`pajamas02` → `body03`、
`swimsuit` → `body04`。

`face-*.jpg` 那一行的萬用字元會連 `face-smile-temp.jpg` 一起吃進去，那是參考圖不是圖層，
產出的 `png/face-smile-temp.png` 要刪掉。

尺寸方面：`pajamas0*.jpg` 是 843 x 1264，與 800 x 1200 同為 2:3；`swimsuit.jpg` 是
800 x 1333，與其餘素材相同。`contain` 縮放後三者的主體邊界框與 `body01` 都只差 2 px，
不必另外對位。

### build 之後一定要跑 trim

否則臉那層還帶著胸口與頸圈。原始的 `face-*.jpg` 畫到胸口，那塊在現在的疊合順序下
永遠看不到，但頸圈會從睡衣的領口上方露出來。`trim` 把 y=270 以下清成透明，
再逐欄把頸圈換成它上方的脖子膚色。

`--cut 270` 是量出來的，而且**由領口最低的那套服裝決定**：四套 `body` 之中，
從 y=268 起每一套都能完整蓋住臉。多留兩列是墊在柔邊後面用的——`body04` 的上緣
是綠幕柔邊，alpha 要到 y=270 才爬滿，底下沒有東西墊著就會透出背景色，
在脖子與胸口之間留下一條灰綠色的橫帶。

日後新增的服裝若領口更低，得重新量再調這個值，否則胸口會開天窗。量法是逐列比對
「臉的不透明像素」與「每一套 body 的不透明像素」，找出所有 body 都完整覆蓋的第一列。

### 換裝素材還要跑 align-neck 與 seam

`body02`～`body04` 都不是從 `body01.jpg` 改出來的，模型各自在領口裡畫了一副脖子，
而且**沒有畫在同一條中線上**。以膚色區域各列中點的中位數量測，臉那層的脖子中心在
x=409.0，`body01` 在 410.0，但三張原始素材分別在 404.0、407.5、408.5。整體邊界框
只差 2 px，偏的就是脖子這一塊，所以看起來像脖子被接歪了。

`align-neck` 量出兩層的脖子中心差多少，整層左右挪過去。只修水平：垂直位置由
`canonicalize` 那組共用變換決定，本來就對得上，會跑掉的是生成時的重新構圖，
而那只發生在水平方向。實際位移是 body02 dx=+5、body03 dx=+2、body04 dx=+1，
事後殘餘 ±0.5 px，與 `body01` 自身的 +1.0 px 同一個量級。

對齊之後仍有膚色與明暗的落差，`seam` 把身體壓在臉上的那一段上緣做 smoothstep 羽化，
讓硬邊化成漸層；只在臉還在後面的地方羽化，肩線與袖子維持不透明，輪廓不會透出背景。

判定「重疊到哪裡」時，身體只要有一點點不透明就算數（`SEAM_EDGE = 0.02`），
不能用 0.5 當門檻。綠幕柔邊會讓上緣的 alpha 花好幾列才爬滿，`body04` 是
36 → 107 → 171 → 244；用 0.5 會從半路才開始羽化，把已經爬到一半的 alpha
一腳踩回 floor，變成 36 → 107 → **17** → 244，接縫處反而多一條比原本更明顯的橫線。

`body01` 兩者都不需要 —— 它與臉是同一批素材，本來就接得上。

**`seam` 不可重複執行。** 它是把 alpha 乘上一條漸層，跑第二次會再乘一次，
脖子會越來越透。要重跑就得先用 `build` 產生乾淨的 PNG。

## 目前狀態

五種表情、頭髮、貓耳、身體都已是真實素材。

**尚缺尾巴。** `body02.jpg` 沒有畫尾巴，但人設寫明有尾巴，參考圖 `hair-temp.jpg` 也有。
補的時候建議獨立成 `tail` 圖層放在 `body` 之下，日後要讓尾巴單獨擺動比較容易。

`*.svg` 是專案初期的佔位素材，已無程式引用，可以刪除。
`hair-temp.jpg` 與 `face-smile-temp.jpg` 是完整合成的參考圖，不是圖層，留著當對齊基準。
