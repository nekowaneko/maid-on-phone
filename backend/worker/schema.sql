-- D1 建表語句。全部冪等，重複執行不會出錯也不會清掉既有資料。
-- 套用方式：wrangler d1 execute <資料庫名稱> --file worker/schema.sql
-- （這一步需要 Cloudflare 帳號，由使用者本人執行，見 CHECKLIST.md）

-- 小檔案之類的單筆設定，key 就是設定名稱
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 每日用量。date 是依 config/quota.json 的時區切出來的 YYYY-MM-DD
CREATE TABLE IF NOT EXISTS daily_usage (
    date TEXT PRIMARY KEY,
    requests INTEGER NOT NULL DEFAULT 0,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0
);

-- 只用來算每分鐘請求數，兩分鐘以前的列會被清掉
CREATE TABLE IF NOT EXISTS request_log (
    ts INTEGER PRIMARY KEY
);
