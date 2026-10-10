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

-- M2 戒飲記錄：一筆一列，欄位照戒飲存備份格式再加組合式模型的編號；撤銷只標記 undone，不刪除
CREATE TABLE IF NOT EXISTS drink_logs (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,
    slot TEXT NOT NULL,
    type TEXT NOT NULL,
    name TEXT,
    price INTEGER,
    kcal INTEGER,
    source TEXT,
    ice TEXT,
    size_id TEXT,
    sugar_level_id TEXT,
    base_id TEXT,
    topping_ids TEXT,
    starbucks_id TEXT,
    created_at INTEGER NOT NULL,
    undone INTEGER NOT NULL DEFAULT 0
);

-- 依日期查詢（統計、同時段判定、每日詢問）
CREATE INDEX IF NOT EXISTS idx_drink_logs_date ON drink_logs (date);

-- M4 盤前均線：追蹤清單、收盤價快取與均線計算結果；不提供刪除操作（A42）
CREATE TABLE IF NOT EXISTS ma_watch (code TEXT PRIMARY KEY, name TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, added_on TEXT NOT NULL, sort INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS ma_close (code TEXT NOT NULL, date TEXT NOT NULL, close REAL NOT NULL, PRIMARY KEY (code, date));
CREATE TABLE IF NOT EXISTS ma_result (date TEXT NOT NULL, code TEXT NOT NULL, kind TEXT NOT NULL, m5 REAL, m20 REAL, m60 REAL, PRIMARY KEY (date, code));
CREATE INDEX IF NOT EXISTS idx_ma_result_code ON ma_result (code);

