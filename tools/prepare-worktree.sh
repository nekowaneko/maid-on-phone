#!/usr/bin/env bash
# 平行開工用：把不進 git 的本機檔案複製到一個新的 git worktree，並安裝 backend 套件。
# 用法（Git Bash，在主倉庫根目錄執行）：bash tools/prepare-worktree.sh <worktree 路徑>
# 只複製，不覆蓋 worktree 裡已經存在的檔案；不讀取、不輸出任何檔案內容。
set -euo pipefail

# 常數定義
MAIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOCAL_FILES=(local.properties firebase.properties worker.properties app/google-services.json)
LOCAL_DIRS=(app/src/main/assets/pet/frames/local backend/assets/character/png backend/assets/icons)

TARGET="${1:?請指定 worktree 路徑}"
TARGET="$(cd "$TARGET" && pwd)"
[ "$TARGET" != "$MAIN_ROOT" ] || { echo "目標不能是主倉庫本身" >&2; exit 1; }
git -C "$TARGET" rev-parse --is-inside-work-tree > /dev/null

# 複製單一檔案；來源不存在就略過，目標已存在就保留
copy_file() {
  local rel="$1"
  [ -f "$MAIN_ROOT/$rel" ] || { echo "略過（主倉庫沒有）：$rel"; return 0; }
  [ -e "$TARGET/$rel" ] && { echo "保留（已存在）：$rel"; return 0; }
  mkdir -p "$(dirname "$TARGET/$rel")"
  cp "$MAIN_ROOT/$rel" "$TARGET/$rel"
  echo "已複製：$rel"
}

for f in "${LOCAL_FILES[@]}"; do copy_file "$f"; done
for d in "${LOCAL_DIRS[@]}"; do
  [ -d "$MAIN_ROOT/$d" ] || continue
  while IFS= read -r -d '' file; do copy_file "${file#"$MAIN_ROOT/"}"; done < <(find "$MAIN_ROOT/$d" -type f ! -name .gitkeep -print0)
done

# backend 套件：每個 worktree 各自安裝
if [ -f "$TARGET/backend/package.json" ] && [ ! -d "$TARGET/backend/node_modules" ]; then
  (cd "$TARGET/backend" && npm install --no-audit --no-fund --silent) && echo "已安裝 backend 套件"
fi
echo "完成：$TARGET"
