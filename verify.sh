#!/usr/bin/env bash
# 三層驗收腳本（docs/EXPENSIVE-PLAN.md §0.4、§6.1）
# 用法：./verify.sh          → L1＋L2
#       ./verify.sh --full   → L1＋L2＋L3
#       ./verify.sh --core-only → 只在 T1 使用：app 尚未實作，略過 V07～V10（見 DECISIONS.md）
#       ./verify.sh --lane B|C|D → 平行開工：L1 全跑，L2 只跑該線負責的部分（M3R 範圍見 docs/M3R-EXPENSIVE-PLAN.md §0）
set -euo pipefail

# 常數定義
FROZEN_HASH="ec209546ee19b88204952a85dffafec9862d8dc9"   # 凍結規格測試的 commit（M4 凍結版）
SPEC_DIR="core/src/test/kotlin/com/accompany/pet/spec/"   # 規格測試目錄
JS_SPEC_DIR="backend/tests/spec/"                         # backend 規格測試目錄（M1.5）
MANIFEST="app/src/main/AndroidManifest.xml"
ASSET_PREFIX="file:///android_asset/pet/"
SPEC_IDS="S01 S02 S03 S07 S08 S09 S10 S13 S14 S15"
M15_SPEC_IDS="M15-S04 M15-S05 M15-S06 M15-S13"  # M1.5 的 Kotlin 自動列
M15_JS_SPEC_IDS="M15-S01 M15-S02 M15-S03 M15-S07 M15-S08 M15-S09 M15-S10 M15-S11 M15-S12"  # M1.5 的 JS 自動列
M16_SPEC_IDS="M16-S03 M16-S04 M16-S05 M16-S06 M16-S07 M16-S08"  # M1.6 的 Kotlin 自動列
M16_JS_SPEC_IDS="M16-S01 M16-S02 M16-S10 M16-S11 M16-S12 M16-S13 M16-S14 M16-S15"  # M1.6 的 JS 自動列
M2_SPEC_IDS="M2-S13"  # M2 的 Kotlin 自動列
M2_JS_SPEC_IDS="M2-S01 M2-S02 M2-S03 M2-S04 M2-S05 M2-S06 M2-S07 M2-S08 M2-S09 M2-S10 M2-S11 M2-S12 M2-S14 M2-S15 M2-S16"  # M2 的 Worker 自動列
M2_JS_B_SPEC_IDS="M2-S02-B M2-S04-B M2-S11-B M2-S16-B"  # M2 的懸浮窗網頁自動列
M3R_SPEC_IDS="M3R-S16 M3R-S17"  # M3R 的 Kotlin 自動列（第一輪 M3 的規格測試已刪除）
M4_SPEC_IDS="M4-S15C"  # M4 的 Kotlin 自動列
M4_JS_SPEC_IDS="M4-S01 M4-S02 M4-S03 M4-S04 M4-S05 M4-S06 M4-S07 M4-S08 M4-S09 M4-S10 M4-S11 M4-S12 M4-S13 M4-S14 M4-S16 M4-S15B M4-S17 M4-S18 M4-S19 M4-S20 M4-S21 M4-S22"  # M4 的 Worker（15 列）與前端（2 列）自動列
M3R_JS_SPEC_IDS="M3R-S01 M3R-S02 M3R-S03 M3R-S04 M3R-S05 M3R-S06 M3R-S07 M3R-S08 M3R-S09 M3R-S10 M3R-S11 M3R-S12 M3R-S13 M3R-S14 M3R-S15 M3R-S18 M3R-S19"  # M3R 的 Worker 與懸浮窗自動列
OVERLAY_TESTS="tests/spec/m16/overlay.test.js tests/spec/m2/overlay-drink.test.js tests/spec/m3r/overlay-todoist.test.js tests/spec/m4/overlay-ma.test.js tests/overlay-*.test.js tests/ma-web-*.test.js"  # B 線（角色頁）的測試
WORKER_API_KT="app/src/main/java/com/accompany/pet/WorkerApi.kt"  # App 唯一可以連外的檔案（M2 A12 修訂）
M1_SPEC_IDS="M1-S01 M1-S02 M1-S03 M1-S04 M1-S05 M1-S06 M1-S07 M1-S08 M1-S09 M1-S10 M1-S11 M1-S12 M1-S14 M1-S15"  # M1 自動列（計畫書寫 13 個但列了 14 列，見 DECISIONS.md）

FULL=0
CORE_ONLY=0
LANE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --full) FULL=1 ;;
    --core-only) CORE_ONLY=1 ;;
    --lane) shift; LANE="${1:-}"; case "$LANE" in B|C|D) ;; *) echo "--lane 只能是 B、C、D"; exit 2 ;; esac ;;
    *) echo "未知參數：$1"; exit 2 ;;
  esac
  shift
done
[ -z "$LANE" ] || [ "$FULL" -eq 0 ] || { echo "--lane 不能與 --full 同時使用"; exit 2; }

# 這一層要不要跑：沒指定線就全跑，指定了只跑該線
runs() { [ -z "$LANE" ] || [[ " $* " == *" $LANE "* ]]; }

cd "$(dirname "$0")"

# 沒設 JAVA_HOME 時改用 Android Studio 內附的 JDK
if [ -z "${JAVA_HOME:-}" ] && [ -d "/c/Program Files/Android/Android Studio/jbr" ]; then
  export JAVA_HOME="/c/Program Files/Android/Android Studio/jbr"
fi

# 印出失敗原因並以非零結束
fail() { echo "❌ $1"; exit 1; }
# 印出通過
pass() { echo "✅ $1"; }

echo "===== L1 結構與安全檢查 ====="

# V01：core 不得 import android / androidx
if grep -rnE '^\s*import\s+(android|androidx)\.' core/src; then fail "V01 core 引用了 Android"; fi
pass "V01"

# V02：core 不得連網
if grep -rnE 'java\.net|okhttp|HttpURLConnection' core/src --exclude-dir=spec; then fail "V02 core 含連網程式"; fi  # 凍結的 S15 本身要列出禁用字串，排除 spec 目錄
pass "V02"

# V03：Manifest 不得宣告 INTERNET
if grep -n 'android.permission.INTERNET' "$MANIFEST"; then fail "V03 Manifest 含 INTERNET"; fi
pass "V03"

# V04：規格測試未被改動（含未追蹤的新檔）
git diff --quiet "$FROZEN_HASH" -- "$SPEC_DIR" "$JS_SPEC_DIR" || fail "V04 spec 目錄與凍結版本不同"
[ -z "$(git status --porcelain -- "$SPEC_DIR" "$JS_SPEC_DIR")" ] || fail "V04 spec 目錄有未提交變動"
pass "V04"

# V05：Kotlin M0 10 個＋M1 14 個＋M1.5 4 個＋M1.6 6 個＋M2 1 個＋M3R 2 個＋M4 1 個規格測試、各列一次；JS M1.5 9 列、M1.6 8 列、M2 15＋4 列、M3R 17 列、M4 22 列各一次；沒有略過或獨跑標記
TEST_COUNT=$(grep -rh '@Test' "$SPEC_DIR" | wc -l)
[ "$TEST_COUNT" -eq 38 ] || fail "V05 規格測試數量為 $TEST_COUNT，應為 38"
for id in $SPEC_IDS $M1_SPEC_IDS $M15_SPEC_IDS $M16_SPEC_IDS $M2_SPEC_IDS $M3R_SPEC_IDS $M4_SPEC_IDS; do
  n=$(grep -rhE "fun \`$id " "$SPEC_DIR" | wc -l)
  [ "$n" -eq 1 ] || fail "V05 $id 出現 $n 次"
done
for id in $M15_JS_SPEC_IDS $M16_JS_SPEC_IDS $M2_JS_SPEC_IDS $M2_JS_B_SPEC_IDS $M3R_JS_SPEC_IDS $M4_JS_SPEC_IDS; do
  n=$(grep -rhF "test('$id " "$JS_SPEC_DIR" | wc -l)
  [ "$n" -eq 1 ] || fail "V05 $id 出現 $n 次"
done
if grep -rn '@Ignore' "$SPEC_DIR"; then fail "V05 規格測試含 @Ignore"; fi
if grep -rnE 'test\.skip|test\.todo|\.only' "$JS_SPEC_DIR"; then fail "V05 JS 規格測試含略過或獨跑標記"; fi
pass "V05"

# V06：沒有憑證與私人素材被追蹤
if command -v gitleaks >/dev/null 2>&1; then
  gitleaks detect --no-banner --redact >/dev/null || fail "V06 gitleaks 發現疑似憑證"
else
  # gitleaks 不可用：以 grep 樣式檢查所有追蹤中的檔案（本腳本與計畫書自身會提到樣式字串，排除）
  LEAKS=$(git ls-files -z | grep -zvE '^(verify\.sh|docs/EXPENSIVE-PLAN\.md)$' \
    | xargs -0 grep -nIE 'AIza|sk-|-----BEGIN|password=' 2>/dev/null || true)
  [ -z "$LEAKS" ] || { echo "$LEAKS"; fail "V06 追蹤中的檔案含疑似憑證"; }
fi
if git ls-files | grep -E '\.jks$|frames/local/.*\.png$'; then fail "V06 追蹤了金鑰或私人角色圖"; fi
if git ls-files | grep -E '(^|/)(firebase\.properties|google-services\.json)$'; then fail "V06 追蹤了 Firebase 設定檔"; fi
pass "V06"

# V23：Worker B 與 accompany_bot 隔離、金鑰不寫進設定檔、立繪與本機變數不進 git（M1.5 A19、A20）
TOML=backend/wrangler.toml
grep -qE '^name = "pet-maid-api"$' "$TOML" || fail "V23 wrangler.toml 名稱不是 pet-maid-api"
if grep -n 'neko-companion' "$TOML"; then fail "V23 wrangler.toml 含 neko-companion"; fi
if grep -nE '^\s*(FCM_SERVICE_ACCOUNT|FCM_DEVICE_TOKEN|APP_SECRET|LLM_API_KEY)\s*=' "$TOML"; then fail "V23 wrangler.toml 含金鑰賦值"; fi
if git ls-files backend | grep -E '\.png$|(^|/)\.dev\.vars$'; then fail "V23 backend 追蹤了立繪或 .dev.vars"; fi
pass "V23"

# V24：googleapis.com 只出現在 fcm-client.js；backend/core 不連線、不碰憑證與環境變數（M1.5 A18）
# 例外：複製來的 llm-client.js 原有的 Gemini 直連網址那一行（規格爭議，見 BLOCKERS.md），只豁免這一行原文
LLM_ORIGIN_LINE="backend/worker/llm-client.js:const API_ORIGIN = 'https://generativelanguage.googleapis.com'"
GOOGLE_HITS=$(grep -rH 'googleapis\.com' backend/worker backend/core | grep -v '^backend/worker/fcm-client\.js:' | grep -vxF "$LLM_ORIGIN_LINE" || true)
[ -z "$GOOGLE_HITS" ] || { echo "$GOOGLE_HITS"; fail "V24 googleapis.com 出現在 fcm-client.js 以外"; }
if grep -rnE 'fetch\(|crypto\.subtle|env\.|eval\(|new Function\(' backend/core; then fail "V24 backend/core 含連線、憑證或環境變數存取"; fi
pass "V24"

# V30：只有 todoist-client.js 連 Todoist；權杖不寫進設定檔、只在 index.js 讀環境變數（M3R A35）
TODOIST_HITS=$(grep -rln 'api\.todoist\.com' backend/worker backend/core backend/web 2>/dev/null | grep -v '^backend/worker/todoist-client\.js$' || true)
[ -z "$TODOIST_HITS" ] || { echo "$TODOIST_HITS"; fail "V30 api.todoist.com 出現在 todoist-client.js 以外"; }
if grep -nE '^\s*TODOIST_TOKEN\s*=' "$TOML"; then fail "V30 wrangler.toml 含 TODOIST_TOKEN 賦值"; fi
TOKEN_HITS=$(grep -rln 'TODOIST_TOKEN' backend/worker backend/core 2>/dev/null | grep -v '^backend/worker/index\.js$' || true)
[ -z "$TOKEN_HITS" ] || { echo "$TOKEN_HITS"; fail "V30 TODOIST_TOKEN 出現在 index.js 以外"; }
pass "V30"

# ===== M4 盤前均線（docs/M4-EXPENSIVE-PLAN.md §6.1）=====
MA_CONTRACT_FILE="backend/config/ma-contract.json"

# V31：只有 twse-client.js 連證交所（A40）；wrangler.toml 不含證交所設定
if runs D; then
  TWSE_HITS=$(grep -rln 'twse\.com\.tw' backend/worker backend/core backend/web 2>/dev/null | grep -v '^backend/worker/twse-client\.js$' || true)
  [ -z "$TWSE_HITS" ] || { echo "$TWSE_HITS"; fail "V31 twse.com.tw 出現在 twse-client.js 以外"; }
  if grep -niE 'twse' "$TOML"; then fail "V31 wrangler.toml 含證交所設定"; fi
  pass "V31"
fi

# V32：說明與台詞唯一來源（A45）：設定檔的句子不得另寫在程式裡；免責聲明只存在設定檔
if runs B D; then
  node tools/check-ma-sentences.mjs || fail "V32 設定檔的句子被寫死在程式裡"
  DISCLAIMER_HITS=$(grep -rln '僅供參考，非投資建議' backend/worker backend/core backend/web app/src 2>/dev/null || true)
  [ -z "$DISCLAIMER_HITS" ] || { echo "$DISCLAIMER_HITS"; fail "V32 免責聲明被寫死在程式裡"; }
  pass "V32"
fi

# V33：網頁與 WebView 安全（A43、A44）
if runs B; then
  if [ -f backend/web/ma.js ]; then
    INNER_COUNT=$(grep -o 'innerHTML' backend/web/ma.js | wc -l)
    [ "$INNER_COUNT" -eq 1 ] || fail "V33 ma.js 的 innerHTML 出現 $INNER_COUNT 次，應為 1"
  fi
  if grep -nE 'eval\(|document\.write|new Function\(' backend/web/ma.js backend/web/ma-render.js 2>/dev/null; then fail "V33 ma 網頁含 eval 或 document.write"; fi
  if grep -nE "fetch\(\s*['\"\`]https?:" backend/web/ma.js backend/web/ma-render.js 2>/dev/null; then fail "V33 ma 網頁含跨網域 fetch"; fi
  pass "V33（網頁）"
fi
if runs C && [ "$CORE_ONLY" -eq 0 ]; then
  MA_KT="app/src/main/java/com/accompany/pet/MaActivity.kt"
  [ -f "$MA_KT" ] || fail "V33 找不到 MaActivity.kt"
  grep -A3 'android:name=".MaActivity"' "$MANIFEST" | grep -q 'android:exported="false"' || fail "V33 MaActivity 不是 exported=false"
  [ "$(grep -cE '^\s*val url = maPageUrl\(BuildConfig\.CHAT_URL\)$' "$MA_KT")" -eq 1 ] || fail "V33 MaActivity.kt 的 url 不是只來自 maPageUrl(BuildConfig.CHAT_URL)"
  MA_LOADS=$(grep -n 'loadUrl' "$MA_KT" || true)
  [ -n "$MA_LOADS" ] || fail "V33 MaActivity.kt 找不到 loadUrl"
  while IFS= read -r line; do
    [ "$(echo "${line#*:}" | tr -d ' ')" = "wv.loadUrl(url)" ] || [ "$(echo "${line#*:}" | tr -d ' ')" = "loadUrl(url)" ] || fail "V33 MaActivity.kt 的 loadUrl 參數不是檢查後的網址：$line"
  done <<< "$MA_LOADS"
  grep -q 'shouldOverrideUrlLoading' "$MA_KT" || fail "V33 MaActivity.kt 缺少 shouldOverrideUrlLoading"
  grep -q 'shouldInterceptRequest' "$MA_KT" || fail "V33 MaActivity.kt 缺少 shouldInterceptRequest"
  pass "V33（MaActivity）"
fi

# V34：F3 排程段在 Todoist 判斷之前，且有自己的 try（A41）
if runs D; then
  node tools/check-ma-schedule-order.mjs || fail "V34 runMaReport 的位置或 try 包裝不符"
  pass "V34"
fi

# V35：無靜默降級與無刪除（A42、條款 12）
if runs B D; then
  MA_JS_FILES=$(ls backend/core/ma.js backend/worker/twse-client.js backend/web/ma.js backend/web/ma-render.js 2>/dev/null || true)
  if [ -n "$MA_JS_FILES" ] && grep -nE 'catch\s*(\([^)]*\))?\s*\{\s*return\s+[\{\[]|Math\.random' $MA_JS_FILES; then fail "V35 ma 程式含靜默降級或亂數"; fi
  if grep -nE 'DELETE\s+FROM\s+ma_' backend/worker/schema.sql backend/worker/store.js backend/worker/store.stub.js backend/worker/handlers.js 2>/dev/null; then fail "V35 含 DELETE FROM ma_"; fi
  pass "V35"
fi

# V36：產線入口驗證存在且不用 monkeypatch（條款 11）；ma-wiring 只在整合時檢查
if runs D; then
  [ -f backend/tests/ma-pipeline.test.js ] || fail "V36 缺少 ma-pipeline.test.js"
  if grep -vE '^\s*//' backend/tests/ma-pipeline.test.js | grep -nE 'mock\.method|monkeypatch|jest\.mock|sinon\.stub'; then fail "V36 ma-pipeline.test.js 含 monkeypatch"; fi
  pass "V36"
fi
if [ -z "$LANE" ] && [ "$FULL" -eq 1 ]; then
  [ -f backend/tests/ma-wiring.test.js ] || fail "V36 缺少 ma-wiring.test.js"
  if grep -vE '^\s*//' backend/tests/ma-wiring.test.js | grep -nE 'mock\.method|monkeypatch|jest\.mock|sinon\.stub'; then fail "V36 ma-wiring.test.js 含 monkeypatch"; fi
  pass "V36（接線）"
fi

# V28：角色頁只載入本機相對路徑的一般 script，不用 module、不讀檔、不連外（M1.6 A24）
PET_ASSETS=app/src/main/assets/pet
if grep -rnE 'type="module"|fetch\(|XMLHttpRequest|import\(|https?://' "$PET_ASSETS" --include='*.html' --include='*.js'; then fail "V28 角色頁含 module、讀檔或外部網址"; fi
SRCS=$(grep -oE '<script[^>]*src="[^"]*"' "$PET_ASSETS/index.html" | sed -E 's/.*src="([^"]*)"/\1/' || true)
while IFS= read -r src; do
  [ -z "$src" ] && continue
  case "$src" in /*|*:*|*..*) fail "V28 script 來源不是本機相對路徑：$src" ;; esac
  [ -f "$PET_ASSETS/$src" ] || fail "V28 找不到 script：$src"
done <<< "$SRCS"
pass "V28"

if [ "$CORE_ONLY" -eq 0 ]; then
  # V07：懸浮窗 loadUrl 只載入本機資產；ChatActivity 只載入 normalizeChatUrl(BuildConfig.CHAT_URL) 的結果；兩支都有攔截函式（M1.5 A4 修訂）
  CHAT_KT=app/src/main/java/com/accompany/pet/ChatActivity.kt
  OVERLAY_KT=app/src/main/java/com/accompany/pet/OverlayService.kt
  [ -f "$CHAT_KT" ] || fail "V07 找不到 ChatActivity.kt"
  LOADS=$(grep -rhoE 'loadUrl\([^)]*\)' app/src --exclude=ChatActivity.kt --exclude=MaActivity.kt || true)  # MaActivity 的 loadUrl 由 V33 檢查
  [ -n "$LOADS" ] || fail "V07 找不到 loadUrl"
  while IFS= read -r line; do
    case "$line" in
      "loadUrl(\"$ASSET_PREFIX"*) ;;
      *) fail "V07 loadUrl 參數不是本機資產：$line" ;;
    esac
  done <<< "$LOADS"
  grep -q 'normalizeChatUrl(BuildConfig.CHAT_URL)' "$CHAT_KT" || fail "V07 ChatActivity.kt 缺少 normalizeChatUrl(BuildConfig.CHAT_URL)"
  [ "$(grep -cE '^\s*val url = normalizeChatUrl\(BuildConfig\.CHAT_URL\)$' "$CHAT_KT")" -eq 1 ] || fail "V07 ChatActivity.kt 的 url 不是只來自 normalizeChatUrl(BuildConfig.CHAT_URL)"
  CHAT_LOADS=$(grep -oE 'loadUrl\([^)]*\)' "$CHAT_KT" || true)
  [ -n "$CHAT_LOADS" ] || fail "V07 ChatActivity.kt 找不到 loadUrl"
  while IFS= read -r line; do
    [ "$line" = "loadUrl(url)" ] || fail "V07 ChatActivity.kt 的 loadUrl 參數不是檢查後的網址：$line"
  done <<< "$CHAT_LOADS"
  for f in "$OVERLAY_KT" "$CHAT_KT"; do
    grep -q 'shouldOverrideUrlLoading' "$f" || fail "V07 $f 缺少 shouldOverrideUrlLoading"
  done
  pass "V07"

  # V08：@JavascriptInterface 恰好 6 次（M4 A5 修訂：再加 onMaPressed）；ChatActivity 與 MaActivity 不得加 JS 介面
  # B、D 線的 worktree 不含 C 線的改動，仍是 5 個；只有 C 線與整合時要求 6 個
  JS_COUNT=$(grep -rho '@JavascriptInterface' app/src | wc -l)
  if [ "$LANE" = "B" ] || [ "$LANE" = "D" ]; then
    [ "$JS_COUNT" -eq 5 ] || [ "$JS_COUNT" -eq 6 ] || fail "V08 @JavascriptInterface 出現 $JS_COUNT 次"
  else
    [ "$JS_COUNT" -eq 6 ] || fail "V08 @JavascriptInterface 出現 $JS_COUNT 次，應為 6"
  fi
  if grep -n 'addJavascriptInterface' "$CHAT_KT"; then fail "V08 ChatActivity.kt 含 addJavascriptInterface"; fi
  if [ -f app/src/main/java/com/accompany/pet/MaActivity.kt ] && grep -n 'addJavascriptInterface' app/src/main/java/com/accompany/pet/MaActivity.kt; then fail "V08 MaActivity.kt 含 addJavascriptInterface"; fi
  pass "V08"

  # V25：聊天畫面不對外開放、不讀本機檔案、禁止混合內容、攔截子資源（M1.5 A23）
  grep -A3 'android:name=".ChatActivity"' "$MANIFEST" | grep -q 'android:exported="false"' || fail "V25 ChatActivity 不是 exported=false"
  for word in 'allowFileAccess = false' 'allowContentAccess = false' 'MIXED_CONTENT_NEVER_ALLOW' 'shouldInterceptRequest'; do
    grep -qF "$word" "$CHAT_KT" || fail "V25 ChatActivity.kt 缺少 $word"
  done
  pass "V25"

  # V09：懸浮窗不得 MATCH_PARENT
  [ -f app/src/main/java/com/accompany/pet/OverlayService.kt ] || fail "V09 找不到 OverlayService.kt"
  if grep -n 'MATCH_PARENT' app/src/main/java/com/accompany/pet/OverlayService.kt; then fail "V09 使用了 MATCH_PARENT"; fi
  pass "V09"

  # V10：前景服務類型宣告
  grep -q 'specialUse' "$MANIFEST" || fail "V10 Manifest 缺少 specialUse"
  grep -q 'PROPERTY_SPECIAL_USE_FGS_SUBTYPE' "$MANIFEST" || fail "V10 Manifest 缺少 PROPERTY_SPECIAL_USE_FGS_SUBTYPE"
  pass "V10"


  # V19：快速設定磚只有系統能綁定（M0.5 A9）
  grep -A5 'android:name=".PetTileService"' "$MANIFEST" | grep -q 'BIND_QUICK_SETTINGS_TILE' || fail "V19 PetTileService 缺少 BIND_QUICK_SETTINGS_TILE"
  pass "V19"

  # V18：app 只有 WorkerApi.kt 可以連外，且不得用第三方連線程式庫（M2 A12 修訂）
  if grep -rnE 'okhttp|retrofit|ktor' app/src/main; then fail "V18 app 含第三方連線程式庫"; fi
  if grep -rnE 'java\.net\.|HttpURLConnection|HttpsURLConnection|openConnection' app/src/main --exclude=WorkerApi.kt; then fail "V18 WorkerApi.kt 以外含自行連外的程式"; fi
  pass "V18"

  # V29：WorkerApi.kt 只連 apiOrigin(BuildConfig.CHAT_URL)；API_SECRET 只在 WorkerApi.kt 使用；log 不含密鑰與回應內容（M2 A12、A33）
  # B、D 線的 worktree 沒有 C 線的檔案，WorkerApi.kt 不存在時略過；C 線與整合時必須存在
  if [ -f "$WORKER_API_KT" ]; then
    grep -q 'apiOrigin(BuildConfig.CHAT_URL)' "$WORKER_API_KT" || fail "V29 WorkerApi.kt 的網址不是來自 apiOrigin(BuildConfig.CHAT_URL)"
    if grep -nE 'https?://' "$WORKER_API_KT"; then fail "V29 WorkerApi.kt 寫死了網址"; fi
    if grep -rn 'API_SECRET' app/src/main --exclude=WorkerApi.kt; then fail "V29 API_SECRET 出現在 WorkerApi.kt 以外"; fi
    if grep -nE 'Log\.[a-z]\(.*([Ss]ecret|SECRET|[Bb]ody)' "$WORKER_API_KT"; then fail "V29 WorkerApi.kt 把密鑰或回應內容寫進 log"; fi
  elif [ "$LANE" != "B" ] && [ "$LANE" != "D" ]; then
    fail "V29 找不到 $WORKER_API_KT"
  fi
  pass "V29"

  # V20：PetMessagingService 不對外開放（M1 A14）
  grep -A3 'android:name=".PetMessagingService"' "$MANIFEST" | grep -q 'android:exported="false"' || fail "V20 PetMessagingService 不是 exported=false"
  pass "V20"

  # V21：排隊通知頻道為最低重要性且靜音（M1 A15）
  NOTIF=app/src/main/java/com/accompany/pet/ReminderNotifications.kt
  [ -f "$NOTIF" ] || fail "V21 找不到 ReminderNotifications.kt"
  grep -q 'IMPORTANCE_MIN' "$NOTIF" || fail "V21 缺少 IMPORTANCE_MIN"
  grep -q 'setSilent(true)' "$NOTIF" || fail "V21 缺少 setSilent(true)"
  pass "V21"

  # V22：推播代碼不得寫進 log（M1 A17）
  if grep -rnE 'Log\.[a-z]\(.*[Tt]oken' app/src/main; then fail "V22 token 被寫進 log"; fi
  pass "V22"
else
  echo "⚠️  --core-only：略過 V07～V10（app 尚未實作）"
fi

echo "===== L2 單元測試與編譯 ====="

if runs C; then
  # V11：core 測試全部通過
  ./gradlew :core:test -q || fail "V11 core 測試未通過"
  pass "V11"

  # V12：app 可編譯
  ./gradlew :app:compileDebugKotlin -q || fail "V12 app 編譯失敗"
  pass "V12"
fi

if runs D; then
  # V26：backend 全部測試通過（包含 M3R 規格＋輔助）；D 線不跑角色頁的測試（屬 B 線）
  if [ "$LANE" = "D" ]; then
    NODE_FILES=$(cd backend && find tests -name '*.test.js' ! -path 'tests/spec/m16/overlay.test.js' ! -path 'tests/spec/m2/overlay-drink.test.js' ! -path 'tests/spec/m3r/overlay-todoist.test.js' ! -path 'tests/spec/m4/overlay-ma.test.js' ! -name 'overlay-*.test.js' ! -name 'ma-web-*.test.js' ! -name 'ma-wiring.test.js' | sort | tr '
' ' ')
    NODE_MIN=450   # M3R 起跑前（不含第一輪的 todoist-core、todoist-api 輔助測試）＋M3R Worker 規格 15 列＋M4 Worker 規格 15 列
  else
    NODE_FILES="tests/**/*.test.js"
    NODE_MIN=493   # 上一行＋角色頁測試（不含第一輪的 overlay-todoist 輔助測試）＋M3R 懸浮窗規格 2 列＋M4 前端規格 2 列
  fi
  NODE_OUT=$(cd backend && node --test $NODE_FILES 2>&1) || { echo "$NODE_OUT" | grep -E '^not ok|^# (pass|fail)'; fail "V26 backend 測試未通過"; }
  NODE_PASS=$(echo "$NODE_OUT" | grep -E '^# pass ' | awk '{print $3}')
  NODE_FAIL=$(echo "$NODE_OUT" | grep -E '^# fail ' | awk '{print $3}')
  [ "$NODE_FAIL" = "0" ] || fail "V26 backend 測試失敗 $NODE_FAIL 個"
  [ "$NODE_PASS" -ge "$NODE_MIN" ] || fail "V26 backend 測試通過數 $NODE_PASS，應至少 $NODE_MIN"
  pass "V26（通過 $NODE_PASS 個）"
fi

if runs B; then
  # V27：角色頁的解析程式與 backend 同一份（M1.6 A25），角色頁測試全部通過
  node tools/sync-overlay-vendor.mjs --check || fail "V27 角色頁的 vendor 檔與 backend/core 不一致，請重跑 node tools/sync-overlay-vendor.mjs"
  OVERLAY_OUT=$(cd backend && node --test $OVERLAY_TESTS 2>&1) || { echo "$OVERLAY_OUT" | grep -E '^not ok|^# (pass|fail)'; fail "V27 角色頁測試未通過"; }
  pass "V27"
fi

if [ "$FULL" -eq 0 ]; then
  [ -z "$LANE" ] || { echo "🎉 L1＋L2（$LANE 線）全部通過"; exit 0; }
  echo "🎉 L1＋L2 全部通過"
  exit 0
fi

echo "===== L3 建置、Lint、突變測試、報告 ====="

# V13：產出 APK
./gradlew assembleDebug -q || fail "V13 assembleDebug 失敗"
ls app/build/outputs/apk/debug/*.apk >/dev/null 2>&1 || fail "V13 找不到 APK"
pass "V13"

# V14：Lint 無 error
./gradlew :app:lintDebug -q || fail "V14 Lint 有 error"
pass "V14"

# V15：突變測試報告（Kotlin 用 Pitest；backend/core/push.js 用 Stryker，設定檔 backend/stryker.config.json）
./gradlew :core:pitest -q || echo "⚠️  pitest 執行失敗，檢查報告是否為待補狀態"
(cd backend && npx --yes @stryker-mutator/core@10.0.0 run >/dev/null 2>&1) || echo "⚠️  Stryker 執行失敗，檢查報告是否為待補狀態"
[ -f MUTATION-REPORT.md ] || fail "V15 缺少 MUTATION-REPORT.md"
if grep -q '狀態：待補' MUTATION-REPORT.md; then
  for field in 未執行原因 預定範圍 程式版本 原工具補跑方式 替代品候選 搜尋紀錄; do
    grep -q "$field" MUTATION-REPORT.md || fail "V15 待補報告缺少欄位：$field"
  done
  grep -q '突變測試待補' CHECKLIST.md || fail "V15 CHECKLIST.md 缺少突變測試待補項"
else
  grep -q '執行範圍' MUTATION-REPORT.md || fail "V15 報告缺少執行範圍"
  for scope in core/permission core/reminder core/chat core/drink backend/core/push.js backend/core/drink.js; do
    grep -q "$scope" MUTATION-REPORT.md || fail "V15 執行範圍不含 $scope"
  done
fi
pass "V15"

# V16：高風險清單涵蓋 §2.1
[ -f RISK-REVIEW.md ] || fail "V16 缺少 RISK-REVIEW.md"
for name in exportCsv FilePositionStore PetBridge BatteryLogger FileReminderQueueStore FileSeenIdStore PetMessagingService ReminderDispatcher ForegroundDetector PushTokenStore   fcm-client handlePush push.js ChatActivity onChatPressed wrangler.toml   showScript performance.js   handleDrinkConfirm handleDrinkResist handleDrinkUndo runScheduled addDrinkLog markDrinkUndone handleDrinkSettings WorkerApi DrinkActionReceiver onDrinkAction viewFor; do
  grep -q "$name" RISK-REVIEW.md || fail "V16 RISK-REVIEW.md 缺少 $name"
done
pass "V16"

# V17：報告檔存在
[ -f SECURITY-REPORT.md ] || fail "V17 缺少 SECURITY-REPORT.md"
[ -f SPEC-MAP.md ] || fail "V17 缺少 SPEC-MAP.md"
pass "V17"

echo "🎉 L1＋L2＋L3 全部通過"
