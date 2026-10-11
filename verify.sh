#!/usr/bin/env bash
# 三層驗收腳本（docs/EXPENSIVE-PLAN.md §0.4、§6.1）
# 用法：./verify.sh          → L1＋L2
#       ./verify.sh --full   → L1＋L2＋L3
#       ./verify.sh --core-only → 只在 T1 使用：app 尚未實作，略過 V07～V10（見 DECISIONS.md）
#       ./verify.sh --lane B|C|D → 平行開工：L1 全跑，L2 只跑該線負責的部分（M3R 範圍見 docs/M3R-EXPENSIVE-PLAN.md §0）
set -euo pipefail

# 常數定義
FROZEN_HASH="19f82711d6609342ec45a72a23ee7571b94d9985"   # 凍結規格測試的 commit（M4.2 凍結版）
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
M42_SPEC_IDS="M42-S09"  # M4.2 的 Kotlin 自動列
M42_JS_SPEC_IDS="M42-S01 M42-S02 M42-S03 M42-S04 M42-S05 M42-S07 M42-S08 M42-S09 M42-S10 M42-S11 M42-S12 M42-S13 M42-S15"  # M4.2 的 JS 自動列（13 列；S06、S14 為手機實測）
M3R_JS_SPEC_IDS="M3R-S01 M3R-S02 M3R-S03 M3R-S04 M3R-S05 M3R-S06 M3R-S07 M3R-S08 M3R-S09 M3R-S10 M3R-S11 M3R-S12 M3R-S13 M3R-S14 M3R-S15 M3R-S18 M3R-S19"  # M3R 的 Worker 與懸浮窗自動列
M41_SPEC_IDS="M41-S01 M41-S02 M41-S03 M41-S04 M41-S05 M41-S06 M41-S07 M41-S08 M41-S09 M41-S14"  # M4.1 的 Kotlin 自動列
M41_JS_SPEC_IDS="M41-S11 M41-S12"  # M4.1 的 JS 自動列
OVERLAY_TESTS="tests/spec/m16/overlay.test.js tests/spec/m2/overlay-drink.test.js tests/spec/m3r/overlay-todoist.test.js tests/spec/m4/overlay-ma.test.js tests/overlay-*.test.js tests/ma-web-*.test.js"  # B 線（角色頁）的測試
WORKER_API_KT="app/src/main/java/com/accompany/pet/WorkerApi.kt"  # App 唯一可以連外的檔案（M2 A12 修訂）
M1_SPEC_IDS="M1-S01 M1-S02 M1-S03 M1-S04 M1-S05 M1-S06 M1-S07 M1-S08 M1-S09 M1-S10 M1-S11 M1-S12 M1-S14 M1-S15"  # M1 自動列（計畫書寫 13 個但列了 14 列，見 DECISIONS.md）

FULL=0
CORE_ONLY=0
STAGE=4
LANE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --full) FULL=1 ;;
    --core-only) CORE_ONLY=1 ;;
    --stage) shift; STAGE="${1:-}"; case "$STAGE" in 1|2|3|4) ;; *) echo "--stage 只能是 1、2、3、4"; exit 2 ;; esac ;;
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

# V05：Kotlin M0 10 個＋M1 14 個＋M1.5 4 個＋M1.6 6 個＋M2 1 個＋M3R 2 個＋M4 1 個＋M4.1 10 個＋M4.2 1 個規格測試、各列一次；JS M1.5 9 列、M1.6 8 列、M2 15＋4 列、M3R 17 列、M4 22 列、M4.1 2 列、M4.2 13 列各一次；沒有略過或獨跑標記
TEST_COUNT=$(grep -rh '@Test' "$SPEC_DIR" | wc -l)
[ "$TEST_COUNT" -eq 49 ] || fail "V05 規格測試數量為 $TEST_COUNT，應為 49"
for id in $SPEC_IDS $M1_SPEC_IDS $M15_SPEC_IDS $M16_SPEC_IDS $M2_SPEC_IDS $M3R_SPEC_IDS $M4_SPEC_IDS $M41_SPEC_IDS $M42_SPEC_IDS; do
  n=$(grep -rhE "fun \`$id " "$SPEC_DIR" | wc -l)
  [ "$n" -eq 1 ] || fail "V05 $id 出現 $n 次"
done
for id in $M15_JS_SPEC_IDS $M16_JS_SPEC_IDS $M2_JS_SPEC_IDS $M2_JS_B_SPEC_IDS $M3R_JS_SPEC_IDS $M4_JS_SPEC_IDS $M41_JS_SPEC_IDS $M42_JS_SPEC_IDS; do
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

# ===== M4.1 主畫面入口與明細頁關閉（docs/M4.1-EXPENSIVE-PLAN.md §6.1）=====

# V39：MA_EXIT_URL 三處一致（A51）
if [ "$STAGE" -ge 2 ]; then
  CONTRACT_EXIT=$(grep -oE '"exitUrl"\s*:\s*"[^"]+"' "$MA_CONTRACT_FILE" | sed -E 's/.*"([^"]+)"/\1/' || true)
  [ "$CONTRACT_EXIT" = "ma-exit://close" ] || fail "V39 ma-contract.json 的 exitUrl 不是 ma-exit://close：$CONTRACT_EXIT"
  KT_MODELS="core/src/main/kotlin/com/accompany/pet/core/ma/MaModels.kt"
  KT_EXIT=$(grep -oE 'const\s+val\s+MA_EXIT_URL\s*=\s*"[^"]+"' "$KT_MODELS" 2>/dev/null | sed -E 's/.*"([^"]+)"/\1/' || true)
  [ "$KT_EXIT" = "$CONTRACT_EXIT" ] || fail "V39 MaModels.kt 的 MA_EXIT_URL ($KT_EXIT) 與契約 ($CONTRACT_EXIT) 不一致"
  RENDER_JS="backend/web/ma-render.js"
  JS_EXIT=$(grep -oE "MA_EXIT_URL\s*=\s*['\"][^'\"]+['\"]" "$RENDER_JS" 2>/dev/null | sed -E "s/.*['\"]([^'\"]+)['\"]/\1/" || true)
  [ "$JS_EXIT" = "$CONTRACT_EXIT" ] || fail "V39 ma-render.js 的 MA_EXIT_URL ($JS_EXIT) 與契約 ($CONTRACT_EXIT) 不一致"
  pass "V39"
fi

# V40：主畫面接線
if [ "$STAGE" -ge 3 ]; then
  MAIN_XML="app/src/main/res/layout/activity_main.xml"
  MAIN_KT="app/src/main/java/com/accompany/pet/MainActivity.kt"
  for id in 'cardMaEntry' 'cardChatEntry' 'tvMaEntrySub' 'tvChatEntrySub' '盤前均線，點了進入明細' '聊聊，點了和女僕聊天'; do
    grep -q "$id" "$MAIN_XML" || fail "V40 activity_main.xml 缺少 $id"
  done
  L_DRINK=$(grep -n 'android:id="@+id/cardDrinkSettings"' "$MAIN_XML" | cut -d: -f1 || true)
  L_MA=$(grep -n 'android:id="@+id/cardMaEntry"' "$MAIN_XML" | cut -d: -f1 || true)
  L_CHAT=$(grep -n 'android:id="@+id/cardChatEntry"' "$MAIN_XML" | cut -d: -f1 || true)
  L_MIC=$(grep -n 'android:id="@+id/cardMicQuick"' "$MAIN_XML" | cut -d: -f1 || true)
  [ -n "$L_DRINK" ] && [ -n "$L_MA" ] && [ -n "$L_CHAT" ] && [ -n "$L_MIC" ] || fail "V40 卡片 id 不完整"
  [ "$L_DRINK" -lt "$L_MA" ] && [ "$L_MA" -lt "$L_CHAT" ] && [ "$L_CHAT" -lt "$L_MIC" ] || fail "V40 卡片順序不符合 cardDrinkSettings -> cardMaEntry -> cardChatEntry -> cardMicQuick"
  for forbidden in 'cardChatQuick' 'tvChatStatus' '女僕對話紀錄'; do
    if grep -n "$forbidden" "$MAIN_XML"; then fail "V40 activity_main.xml 含 $forbidden"; fi
  done
  grep -q 'startActivity(Intent(this, MaActivity::class.java))' "$MAIN_KT" || fail "V40 MainActivity.kt 缺少 startActivity(Intent(this, MaActivity::class.java))"
  grep -q 'maPageUrl(BuildConfig.CHAT_URL)' "$MAIN_KT" || fail "V40 MainActivity.kt 缺少 maPageUrl(BuildConfig.CHAT_URL)"
  grep -A25 'override fun onResume()' "$MAIN_KT" | grep -q 'refreshMaEntry()' || fail "V40 MainActivity.kt onResume 缺少 refreshMaEntry()"
  MA_LAUNCH_BLOCK=$(grep -B2 -A5 'startActivity(Intent(this, MaActivity::class.java))' "$MAIN_KT" || true)
  if echo "$MA_LAUNCH_BLOCK" | grep -q 'FLAG_ACTIVITY_NEW_TASK'; then fail "V40 開 MaActivity 含 FLAG_ACTIVITY_NEW_TASK"; fi
  if echo "$MA_LAUNCH_BLOCK" | grep -q 'finish()'; then fail "V40 開 MaActivity 含 finish()"; fi
  pass "V40"
fi

# V41：關閉機制接線（A50）
if [ "$STAGE" -ge 3 ]; then
  MA_ACT="app/src/main/java/com/accompany/pet/MaActivity.kt"
  MA_JS="backend/web/ma.js"
  grep -A15 'shouldOverrideUrlLoading' "$MA_ACT" | grep -q 'isMaExitUrl(' || fail "V41 MaActivity.kt shouldOverrideUrlLoading 缺少 isMaExitUrl("
  grep -A15 'shouldOverrideUrlLoading' "$MA_ACT" | grep -q 'finish()' || fail "V41 MaActivity.kt shouldOverrideUrlLoading 缺少 finish()"
  grep -q 'decideBack(' "$MA_JS" || fail "V41 ma.js 缺少 decideBack("
  grep -q 'MA_EXIT_URL' "$MA_JS" || fail "V41 ma.js 缺少 MA_EXIT_URL"
  if grep -n 'history\.back' "$MA_JS"; then fail "V41 ma.js 含 history.back"; fi
  pass "V41"
fi

# V42：A48 主畫面卡片只用 WorkerApi.get("/api/ma/report") 取摘要
if [ "$STAGE" -ge 3 ]; then
  MA_PATH_HITS=$(grep -rn '/api/ma/' app/src/main || true)
  [ -z "$MA_PATH_HITS" ] || { echo "$MA_PATH_HITS"; fail "V42 app/src/main 出現寫死的 /api/ma/ 路徑"; }
  if grep -rnE '/api/ma/refresh|/api/ma/watchlist|/api/ma/history' app/src/main; then fail "V42 app/src/main 含禁用的 ma 路徑"; fi
  if grep -rnE 'WorkerApi\.post\(.*ma' app/src/main; then fail "V42 app/src/main 呼叫了 WorkerApi.post 搭配 ma 路徑"; fi
  pass "V42"
fi

# V43：無靜默降級與無寫死副標（A49、A53、條款 12）
if [ "$STAGE" -ge 3 ]; then
  MAIN_KT="app/src/main/java/com/accompany/pet/MainActivity.kt"
  for s in '正在取得今天的資料…' '今天的資料沒拿到，點了可重試' '還沒有追蹤標的，點了去加入' '還沒有報告，明天 08:30 會送來' '尚未設定連線' '女僕：今天也辛苦了，要不要聊聊？'; do
    if grep -Fq "$s" "$MAIN_KT"; then fail "V43 MainActivity.kt 寫死了副標句子：$s"; fi
  done
  if grep -nE '多頭\s*[0-9]' "$MAIN_KT"; then fail "V43 MainActivity.kt 寫死了多頭檔數範例"; fi
  CHECK_FILES=$(ls core/src/main/kotlin/com/accompany/pet/core/ma/MaEntry.kt app/src/main/java/com/accompany/pet/MainActivity.kt app/src/main/java/com/accompany/pet/MaActivity.kt backend/web/ma.js backend/web/ma-render.js 2>/dev/null || true)
  if [ -n "$CHECK_FILES" ]; then
    if grep -nE 'catch\s*(\([^)]*\))?\s*\{\s*return\s+["'"'"']' $CHECK_FILES; then fail "V43 catch 內回傳空白或固定字串副標"; fi
  fi
  pass "V43"
fi

# ===== M4.2 聊天頁視訊版（docs/M4.2-EXPENSIVE-PLAN.md §6.1）=====
CHAT_KT="app/src/main/java/com/accompany/pet/ChatActivity.kt"
CALL_JSON="backend/config/call.json"
CHAT_KT_MODEL="core/src/main/kotlin/com/accompany/pet/core/chat/Chat.kt"
CALL_STATE_JS="backend/core/call-state.js"
BLINK_JS="backend/core/blink.js"
CALL_JS="backend/web/call.js"
APP_JS="backend/web/app.js"
RENDERER_JS="backend/web/renderer.js"
INDEX_HTML="backend/web/index.html"
STYLE_CSS="backend/web/style.css"
EMOTION_MAP_JSON="backend/config/emotion-map.json"
MANIFEST_WEB="backend/web/manifest.webmanifest"
V55_BASELINE=2   # style.css 在 :root 區塊以外的十六進位色碼數量（T0a 記錄於 PROGRESS.md）
DISPLAY_NAME="手機女僕"

# V47：A54 CHAT_EXIT_URL 三處一致（call.json、Chat.kt、call-state.js）
V47_JSON=$(grep -oE '"exitUrl"\s*:\s*"[^"]+"' "$CALL_JSON" | sed -E 's/.*"([^"]+)"/\1/' || true)
V47_KT=$(grep -oE 'const\s+val\s+CHAT_EXIT_URL\s*=\s*"[^"]+"' "$CHAT_KT_MODEL" 2>/dev/null | sed -E 's/.*"([^"]+)"/\1/' || true)
V47_JS=$(grep -oE "export\s+const\s+CHAT_EXIT_URL\s*=\s*'[^']+'" "$CALL_STATE_JS" 2>/dev/null | sed -E "s/.*'([^']+)'/\1/" || true)
[ "$V47_JSON" = "chat-exit://close" ] || fail "V47 call.json 的 exitUrl 不是 chat-exit://close：$V47_JSON"
[ "$V47_KT" = "$V47_JSON" ] || fail "V47 Chat.kt 的 CHAT_EXIT_URL ($V47_KT) 與 call.json ($V47_JSON) 不一致"
[ "$V47_JS" = "$V47_JSON" ] || fail "V47 call-state.js 的 CHAT_EXIT_URL ($V47_JS) 與 call.json ($V47_JSON) 不一致"
pass "V47"

# V48：換裝已移除
for f in backend/web/outfit.js backend/web/tryon.html backend/web/tryon.js; do
  [ ! -e "$f" ] || fail "V48 換裝檔案還在：$f"
done
if grep -niE 'outfit|tryon|tools-toggle|更換服裝' "$INDEX_HTML" "$APP_JS" "$STYLE_CSS"; then fail "V48 網頁還含換裝相關字串"; fi
if grep -nE 'outfits|outfitNames|defaultOutfit' "$EMOTION_MAP_JSON"; then fail "V48 emotion-map.json 還含換裝設定"; fi
pass "V48"

# V49：名稱是「手機女僕」，且不再出現「陪伴角色」
grep -qF "<title>$DISPLAY_NAME</title>" "$INDEX_HTML" || fail "V49 index.html 的 <title> 不是 $DISPLAY_NAME"
grep -qE "name=\"apple-mobile-web-app-title\"\s+content=\"$DISPLAY_NAME\"" "$INDEX_HTML" || fail "V49 index.html 的 apple-mobile-web-app-title 不是 $DISPLAY_NAME"
grep -qE "\"name\"\s*:\s*\"$DISPLAY_NAME\"" "$MANIFEST_WEB" || fail "V49 manifest 的 name 不是 $DISPLAY_NAME"
grep -qE "\"short_name\"\s*:\s*\"$DISPLAY_NAME\"" "$MANIFEST_WEB" || fail "V49 manifest 的 short_name 不是 $DISPLAY_NAME"
grep -qE "\"displayName\"\s*:\s*\"$DISPLAY_NAME\"" "$CALL_JSON" || fail "V49 call.json 的 displayName 不是 $DISPLAY_NAME"
grep -qE "id=\"call-name\"[^>]*>\s*$DISPLAY_NAME\s*<" "$INDEX_HTML" || fail "V49 index.html 的 #call-name 文字不是 $DISPLAY_NAME"
if grep -rn '陪伴角色' backend/web "$CALL_JSON"; then fail "V49 還有「陪伴角色」"; fi
pass "V49"

# V50：A55 與素材設定（眨眼不進 emotionMap）
if grep -n 'blink' "$EMOTION_MAP_JSON"; then fail "V50 emotion-map.json 含 blink（A55）"; fi
node - "$EMOTION_MAP_JSON" <<'NODE' || fail "V50 emotion-map.json 設定不符（zOrder、assetRoot、emotionMap 鍵或 displayNames）"
const c = JSON.parse(require('fs').readFileSync(process.argv[2], 'utf8'))
const keys = Object.keys(c.emotionMap ?? {}).join(' ')
const ok = JSON.stringify(c.zOrder) === JSON.stringify(['face'])
  && c.assetRoot === 'assets/character/frames'
  && keys === 'neutral thinking smile laugh troubled pout shy'
  && typeof c.displayNames?.pout === 'string' && typeof c.displayNames?.shy === 'string'
process.exit(ok ? 0 : 1)
NODE
pass "V50"

# V51：版面接線（id 齊全、對話框巢狀在視訊區內、選單舊 id 在面板內、樣式與事件名稱）
node - "$INDEX_HTML" "$STYLE_CSS" "$APP_JS" "$CALL_JS" <<'NODE' || fail "V51 版面接線不符（見上方訊息）"
const fs = require('fs')
const [html, css, app, call] = process.argv.slice(2).map((p) => { try { return fs.readFileSync(p, 'utf8') } catch { return '' } })
const problems = []
const hasId = (id) => new RegExp(`id="${id}"`).test(html)
// 取出某個 id 元素的內層字串（以同名標籤的開合計數找結尾）
const innerOf = (id) => {
  const open = html.match(new RegExp(`<([a-zA-Z0-9]+)\\b[^>]*id="${id}"[^>]*>`))
  if (!open) return null
  const tag = open[1]
  const tokens = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, 'g')
  tokens.lastIndex = open.index + open[0].length
  let depth = 1
  for (let t = tokens.exec(html); t; t = tokens.exec(html)) {
    depth += t[0].startsWith('</') ? -1 : 1
    if (depth === 0) return html.slice(open.index + open[0].length, t.index)
  }
  return null
}
const IDS = ['hangup', 'call-bar', 'call-name', 'call-status', 'more-open', 'more', 'scrim', 'ov-connecting', 'ov-error', 'ov-ended', 'call-redial', 'call-secret', 'call-redial-ended', 'call-close', 'stage', 'dialog', 'line', 'character', 'echo', 'composer']
for (const id of IDS) if (!hasId(id)) problems.push(`index.html 缺少 #${id}`)
const stage = innerOf('stage')
if (stage === null || !/id="dialog"/.test(stage)) problems.push('#dialog 沒有巢狀在 #stage 內')
const more = innerOf('more')
for (const id of ['log-open', 'persona-open', 'usage-open', 'bg-new-open', 'bg-list-open', 'replies-open']) {
  if (more === null || !new RegExp(`id="${id}"`).test(more)) problems.push(`#${id} 不在 #more 內`)
}
if (!css.includes('--face-width: 118cqw')) problems.push('style.css 缺少 --face-width: 118cqw')
if (!/#dialog\s*\{[^}]*bottom:\s*calc\([^;]*--face-width/.test(css)) problems.push('#dialog 的 bottom 算式沒有引用 --face-width')
if (!/#line\s*\{[^}]*overflow-y:\s*auto/.test(css)) problems.push('#line 沒有 overflow-y: auto')
for (const ev of ['companion:send', 'companion:reply-start', 'companion:reply-failed']) {
  if (!app.includes(ev)) problems.push(`app.js 缺少事件 ${ev}`)
  if (!call.includes(ev)) problems.push(`call.js 沒有監聽事件 ${ev}`)
}
if (problems.length > 0) { console.error(problems.join('\n')); process.exit(1) }
NODE
pass "V51"

# V52：A56、A57、A58、條款 12：無寫死狀態文字、無靜默降級、core 純度
node - "$CALL_STATE_JS" "$BLINK_JS" "$CALL_JS" "$APP_JS" "$RENDERER_JS" <<'NODE' || fail "V52 純度、寫死文字或靜默降級檢查不符（見上方訊息）"
const fs = require('fs')
const [stateP, blinkP, callP, appP, rendererP] = process.argv.slice(2)
const problems = []
const read = (p) => { try { return fs.readFileSync(p, 'utf8') } catch { problems.push(`${p} 讀不到`); return '' } }
// 去掉註解：整行註解、行尾註解（前面要有空白，避免誤砍網址）、區塊註解
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '').replace(/\s\/\/.*$/, '')).join('\n')
// 取出所有 catch 區塊的內文（以大括號配對）
const catchBodies = (s) => {
  const out = []
  const re = /catch\s*(\([^)]*\))?\s*\{/g
  for (let m = re.exec(s); m; m = re.exec(s)) {
    let depth = 1
    let i = re.lastIndex
    for (; i < s.length && depth > 0; i += 1) depth += s[i] === '{' ? 1 : s[i] === '}' ? -1 : 0
    out.push(s.slice(re.lastIndex, i - 1))
  }
  return out
}
const state = strip(read(stateP))
const blink = strip(read(blinkP))
const call = strip(read(callP))
const app = strip(read(appP))
const renderer = strip(read(rendererP))

// A57：core 兩支檔案的純度
for (const [name, src] of [['call-state.js', state], ['blink.js', blink]]) {
  for (const word of ['document', 'window', 'fetch', 'localStorage', 'Math.random']) {
    if (src.includes(word)) problems.push(`${name} 含 ${word}`)
  }
  if (/import[^\n]*from\s*['"][^./]/.test(src)) problems.push(`${name} import 了外部套件`)
}

// A56：call.js、app.js 不得寫死 CALL_TEXT 的句子與狀態字
const sentences = []
try {
  const text = (fs.readFileSync(stateP, 'utf8').match(/CALL_TEXT\s*=\s*\{[\s\S]*?\n\}/) ?? [''])[0]
  for (const m of text.matchAll(/'([^']+)'/g)) sentences.push(m[1])
} catch { /* 讀不到的問題上面已經記過 */ }
for (const word of ['通話中', '她在想', '連線失敗', '已結束', ...sentences]) {
  if (call.includes(word)) problems.push(`call.js 寫死了「${word}」`)
  if (app.includes(word)) problems.push(`app.js 寫死了「${word}」`)
}

// 條款 12：靜默降級
const callRaw = (() => { try { return fs.readFileSync(callP, 'utf8') } catch { return '' } })()
const bodies = catchBodies(call)
for (const body of bodies) {
  if (/LIVE|'live'|CONNECTED\b/.test(body)) problems.push('call.js 的 catch 內把狀態設成 live 或 connected')
  if (/return\s+(true|\{|\[|'|"|`)/.test(body)) problems.push('call.js 的 catch 內回傳成功值')
}
if (callRaw.length > 0) {
  if (!/connectEvent\(/.test(call)) problems.push('call.js 沒有用 connectEvent 轉換連線探測結果')
  const hasNullPath = bodies.some((b) => /null/.test(b)) || /\.catch\([^)]*null/.test(call)
  if (!hasNullPath) problems.push('call.js 的連線探測例外沒有轉成 status: null')
  if (/removeItem[^\n]*companion:history|companion:history[^\n]*removeItem/.test(call) || call.includes('localStorage.clear')) problems.push('call.js 會清除對話紀錄（M42-S08）')
}
for (const [name, src] of [['call.js', call], ['app.js', app], ['renderer.js', renderer], ['call-state.js', state], ['blink.js', blink]]) {
  if (/hasattr|0x89|Buffer\.from|new Uint8Array\(\[/.test(src)) problems.push(`${name} 含假圖或固定位元組的樣式`)
}
if (problems.length > 0) { console.error(problems.join('\n')); process.exit(1) }
NODE
pass "V52"

# V53：A59 關閉網址的攔截；不新增 JS 介面
grep -A15 'shouldOverrideUrlLoading' "$CHAT_KT" 2>/dev/null | grep -q 'isChatExitUrl(' || fail "V53 ChatActivity.kt shouldOverrideUrlLoading 缺少 isChatExitUrl("
grep -A15 'shouldOverrideUrlLoading' "$CHAT_KT" 2>/dev/null | grep -q 'finish()' || fail "V53 ChatActivity.kt shouldOverrideUrlLoading 缺少 finish()"
grep -q 'CHAT_EXIT_URL' "$CALL_JS" 2>/dev/null || fail "V53 call.js 沒有導向 CHAT_EXIT_URL"
if grep -n 'addJavascriptInterface' "$CHAT_KT" app/src/main/java/com/accompany/pet/MaActivity.kt; then fail "V53 含 addJavascriptInterface"; fi
[ "$(grep -rho '@JavascriptInterface' app/src | wc -l)" -eq 6 ] || fail "V53 @JavascriptInterface 不是 6 次"
pass "V53"

# V54：A60 逐字節奏不得改動
grep -qE 'TYPEWRITER_INTERVAL_MS\s*=\s*30\b' "$APP_JS" || fail "V54 app.js 的 TYPEWRITER_INTERVAL_MS 不是 30"
grep -qE 'HOLD_MS\s*=\s*3000\b' "$APP_JS" || fail "V54 app.js 的 HOLD_MS 不是 3000"
pass "V54"

# V55：A61 style.css 在 :root 區塊以外不得新增十六進位色碼
V55_COUNT=$(node - "$STYLE_CSS" <<'NODE'
const css = require('fs').readFileSync(process.argv[2], 'utf8').replace(/:root\s*\{[^}]*\}/, '')
console.log((css.match(/#[0-9a-fA-F]{3,8}(?![0-9a-zA-Z_-])/g) ?? []).length)
NODE
)
[ "$V55_COUNT" -le "$V55_BASELINE" ] || fail "V55 style.css 在 :root 以外有 $V55_COUNT 個十六進位色碼，基準為 $V55_BASELINE"
pass "V55"

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

if runs D && [ "$STAGE" -ge 2 ]; then
  # V26：backend 全部測試通過（包含 M3R、M4、M4.1 規格＋輔助）；D 線不跑角色頁的測試（屬 B 線）
  if [ "$LANE" = "D" ]; then
    NODE_FILES=$(cd backend && find tests -name '*.test.js' ! -path 'tests/spec/m16/overlay.test.js' ! -path 'tests/spec/m2/overlay-drink.test.js' ! -path 'tests/spec/m3r/overlay-todoist.test.js' ! -path 'tests/spec/m4/overlay-ma.test.js' ! -name 'overlay-*.test.js' ! -name 'ma-web-*.test.js' ! -name 'ma-wiring.test.js' | sort | tr '
' ' ')
    NODE_MIN=450   # M3R 起跑前（不含第一輪的 todoist-core、todoist-api 輔助測試）＋M3R Worker 規格 15 列＋M4 Worker 規格 15 列
  else
    NODE_FILES="tests/**/*.test.js"
    NODE_MIN=511   # 上一行＋角色頁測試＋M3R 規格＋M4 規格＋M4.1 規格 2 列與輔助（498）＋M4.2 規格 13 列；T1 起隨輔助測試新增再調高
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

# V44：M4.1 規格測試通過（10 個 Kotlin、2 個 JS）
if [ "$STAGE" -ge 1 ]; then
  ./gradlew :core:test --tests "com.accompany.pet.spec.m41.*" -q || fail "V44 Kotlin 規格測試未通過"
fi
if [ "$STAGE" -ge 2 ]; then
  (cd backend && node --test tests/spec/m41/ma-back.test.js) >/dev/null 2>&1 || fail "V44 JS 規格測試未通過"
fi
if [ "$STAGE" -ge 2 ]; then
  pass "V44"
elif [ "$STAGE" -ge 1 ]; then
  pass "V44（Kotlin）"
fi

# V45：W-A 契約測試存在且通過；不含 mock.method、monkeypatch、jest.mock、sinon.stub【條款 11】
if [ "$STAGE" -ge 2 ]; then
  WA_TEST="backend/tests/ma-entry-contract.test.js"
  [ -f "$WA_TEST" ] || fail "V45 缺少 $WA_TEST"
  if grep -vE '^\s*//' "$WA_TEST" | grep -nE 'mock\.method|monkeypatch|jest\.mock|sinon\.stub'; then fail "V45 $WA_TEST 含 monkeypatch"; fi
  (cd backend && node --test tests/ma-entry-contract.test.js) >/dev/null 2>&1 || fail "V45 $WA_TEST 測試未通過"
  pass "V45"
fi

# V56：M4.2 規格測試通過（13 個 JS、1 個 Kotlin）
(cd backend && node --test tests/spec/m42/call.test.js) >/dev/null 2>&1 || fail "V56 M4.2 JS 規格測試未通過"
./gradlew :core:test --tests "com.accompany.pet.spec.m42.*" -q || fail "V56 M4.2 Kotlin 規格測試未通過"
pass "V56"

# V57：W-A 契約測試存在且通過；不含 mock.method、monkeypatch、jest.mock、sinon.stub【條款 11】
WA_CALL_TEST="backend/tests/call-wiring.test.js"
[ -f "$WA_CALL_TEST" ] || fail "V57 缺少 $WA_CALL_TEST"
if grep -vE '^\s*//' "$WA_CALL_TEST" | grep -nE 'mock\.method|monkeypatch|jest\.mock|sinon\.stub'; then fail "V57 $WA_CALL_TEST 含 monkeypatch"; fi
(cd backend && node --test tests/call-wiring.test.js) >/dev/null 2>&1 || fail "V57 $WA_CALL_TEST 測試未通過"
pass "V57"

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

# V46：M4.1 風險審查與突變報告涵蓋項目
grep -q 'MaActivity' RISK-REVIEW.md || fail "V46 RISK-REVIEW.md 缺少 MaActivity"
grep -q 'MainActivity' RISK-REVIEW.md || fail "V46 RISK-REVIEW.md 缺少 MainActivity"
grep -q 'ma.js' RISK-REVIEW.md || fail "V46 RISK-REVIEW.md 缺少 ma.js"
grep -q '## M4.1' MUTATION-REPORT.md || fail "V46 MUTATION-REPORT.md 缺少 ## M4.1"
if grep -q '狀態：待補' MUTATION-REPORT.md; then
  for field in 未執行原因 預定範圍 程式版本 原工具補跑方式 替代品候選 搜尋紀錄; do
    grep -q "$field" MUTATION-REPORT.md || fail "V46 MUTATION-REPORT.md 待補報告缺少欄位：$field"
  done
else
  grep -q 'com/accompany/pet/core/ma/MaEntry.kt' MUTATION-REPORT.md || fail "V46 MUTATION-REPORT.md 缺少 MaEntry.kt"
  grep -q 'com/accompany/pet/core/ma/MaModels.kt' MUTATION-REPORT.md || fail "V46 MUTATION-REPORT.md 缺少 MaModels.kt"
fi
pass "V46"

# V58：M4.2 風險審查與突變報告涵蓋項目【條款 9、10】
for name in ChatActivity call.js app.js; do
  grep -A200 '## M4.2' RISK-REVIEW.md 2>/dev/null | grep -q "$name" || fail "V58 RISK-REVIEW.md 的 M4.2 段落缺少 $name"
done
grep -q '## M4.2' MUTATION-REPORT.md || fail "V58 MUTATION-REPORT.md 缺少 ## M4.2"
if ! sed -n '/## M4.2/,$p' MUTATION-REPORT.md | grep -q '狀態：待補'; then
  for scope in backend/core/call-state.js backend/core/blink.js isChatExitUrl; do
    sed -n '/## M4.2/,$p' MUTATION-REPORT.md | grep -q "$scope" || fail "V58 MUTATION-REPORT.md 的 M4.2 段落缺少 $scope"
  done
fi
pass "V58"

# V17：報告檔存在
[ -f SECURITY-REPORT.md ] || fail "V17 缺少 SECURITY-REPORT.md"
[ -f SPEC-MAP.md ] || fail "V17 缺少 SPEC-MAP.md"
pass "V17"

echo "🎉 L1＋L2＋L3 全部通過"
