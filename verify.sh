#!/usr/bin/env bash
# 三層驗收腳本（docs/EXPENSIVE-PLAN.md §0.4、§6.1）
# 用法：./verify.sh          → L1＋L2
#       ./verify.sh --full   → L1＋L2＋L3
#       ./verify.sh --core-only → 只在 T1 使用：app 尚未實作，略過 V07～V10（見 DECISIONS.md）
#       ./verify.sh --lane B|C|D → M1.6 平行開工：L1 全跑，L2 只跑該線負責的部分（docs/M1.6-EXPENSIVE-PLAN.md §0.4）
set -euo pipefail

# 常數定義
FROZEN_HASH="fbda387281a50ca4dc4526d5b98ff67c03354d87"   # 凍結規格測試的 commit（M1.6 凍結版）
SPEC_DIR="core/src/test/kotlin/com/accompany/pet/spec/"   # 規格測試目錄
JS_SPEC_DIR="backend/tests/spec/"                         # backend 規格測試目錄（M1.5）
MANIFEST="app/src/main/AndroidManifest.xml"
ASSET_PREFIX="file:///android_asset/pet/"
SPEC_IDS="S01 S02 S03 S07 S08 S09 S10 S13 S14 S15"
M15_SPEC_IDS="M15-S04 M15-S05 M15-S06 M15-S13"  # M1.5 的 Kotlin 自動列
M15_JS_SPEC_IDS="M15-S01 M15-S02 M15-S03 M15-S07 M15-S08 M15-S09 M15-S10 M15-S11 M15-S12"  # M1.5 的 JS 自動列
M16_SPEC_IDS="M16-S03 M16-S04 M16-S05 M16-S06 M16-S07 M16-S08"  # M1.6 的 Kotlin 自動列
M16_JS_SPEC_IDS="M16-S01 M16-S02 M16-S10 M16-S11 M16-S12 M16-S13 M16-S14 M16-S15"  # M1.6 的 JS 自動列
OVERLAY_TESTS="tests/spec/m16/overlay.test.js tests/overlay-*.test.js"  # B 線（角色頁）的測試
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

# V05：Kotlin M0 10 個＋M1 14 個＋M1.5 4 個＋M1.6 6 個規格測試、各列一次；JS M1.5 9 列、M1.6 8 列各一次；沒有略過或獨跑標記
TEST_COUNT=$(grep -rh '@Test' "$SPEC_DIR" | wc -l)
[ "$TEST_COUNT" -eq 34 ] || fail "V05 規格測試數量為 $TEST_COUNT，應為 34"
for id in $SPEC_IDS $M1_SPEC_IDS $M15_SPEC_IDS $M16_SPEC_IDS; do
  n=$(grep -rhE "fun \`$id " "$SPEC_DIR" | wc -l)
  [ "$n" -eq 1 ] || fail "V05 $id 出現 $n 次"
done
for id in $M15_JS_SPEC_IDS $M16_JS_SPEC_IDS; do
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

# V28：角色頁只載入本機相對路徑的一般 script，不用 module、不讀檔、不連外（M1.6 A24）
PET_ASSETS=app/src/main/assets/pet
if grep -rnE 'type="module"|fetch\(|XMLHttpRequest|import\(|https?://' "$PET_ASSETS" --include='*.html' --include='*.js'; then fail "V28 角色頁含 module、讀檔或外部網址"; fi
SRCS=$(grep -oE '<script[^>]*src="[^"]*"' "$PET_ASSETS/index.html" | sed -E 's/.*src="([^"]*)"//' || true)
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
  LOADS=$(grep -rhoE 'loadUrl\([^)]*\)' app/src --exclude=ChatActivity.kt || true)
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

  # V08：@JavascriptInterface 恰好 3 次；ChatActivity 不得加 JS 介面（M1.5 A5 修訂）
  JS_COUNT=$(grep -rho '@JavascriptInterface' app/src | wc -l)
  [ "$JS_COUNT" -eq 3 ] || fail "V08 @JavascriptInterface 出現 $JS_COUNT 次"
  if grep -n 'addJavascriptInterface' "$CHAT_KT"; then fail "V08 ChatActivity.kt 含 addJavascriptInterface"; fi
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

  # V18：app 不自行連外（M1 A12）
  if grep -rnE 'java\.net\.URL\(|HttpURLConnection|okhttp|retrofit|ktor' app/src/main; then fail "V18 app 含自行連外的程式"; fi
  pass "V18"

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
  # V26：backend 全部測試通過（原有 269 個＋規格＋輔助）；D 線不跑角色頁的測試（屬 B 線）
  if [ "$LANE" = "D" ]; then
    NODE_FILES=$(cd backend && find tests -name '*.test.js' ! -path 'tests/spec/m16/overlay.test.js' ! -name 'overlay-*.test.js' | sort | tr '
' ' ')
    NODE_MIN=308
  else
    NODE_FILES="tests/**/*.test.js"
    NODE_MIN=314
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
  for scope in core/permission core/reminder core/chat backend/core/push.js; do
    grep -q "$scope" MUTATION-REPORT.md || fail "V15 執行範圍不含 $scope"
  done
fi
pass "V15"

# V16：高風險清單涵蓋 §2.1
[ -f RISK-REVIEW.md ] || fail "V16 缺少 RISK-REVIEW.md"
for name in exportCsv FilePositionStore PetBridge BatteryLogger FileReminderQueueStore FileSeenIdStore PetMessagingService ReminderDispatcher ForegroundDetector PushTokenStore   fcm-client handlePush push.js ChatActivity onChatPressed wrangler.toml   showScript performance.js; do
  grep -q "$name" RISK-REVIEW.md || fail "V16 RISK-REVIEW.md 缺少 $name"
done
pass "V16"

# V17：報告檔存在
[ -f SECURITY-REPORT.md ] || fail "V17 缺少 SECURITY-REPORT.md"
[ -f SPEC-MAP.md ] || fail "V17 缺少 SPEC-MAP.md"
pass "V17"

echo "🎉 L1＋L2＋L3 全部通過"
