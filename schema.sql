-- =============================================
-- 劍靈：革命 靈石追蹤器 - Supabase 資料庫結構
-- =============================================

-- 1. 建立靈石計時器資料表
CREATE TABLE IF NOT EXISTS soulstone_timers (
    id SERIAL PRIMARY KEY,
    map_id VARCHAR(50) UNIQUE NOT NULL,
    next_spawn TIMESTAMP WITH TIME ZONE,
    spawn_minutes INTEGER[] DEFAULT ARRAY[0, 20, 40],
    collected_used BOOLEAN DEFAULT FALSE,
    cycle_end_time TIMESTAMP WITH TIME ZONE,
    base_time TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. 啟用即時訂閱（重要！）
-- 這讓多人可以即時同步資料
ALTER PUBLICATION supabase_realtime ADD TABLE soulstone_timers;

-- 3. 建立更新觸發器（自動更新 updated_at）
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_soulstone_timers_updated_at
    BEFORE UPDATE ON soulstone_timers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 4. 啟用 Row Level Security（可選，但建議開啟）
ALTER TABLE soulstone_timers ENABLE ROW LEVEL SECURITY;

-- 5. 建立安全政策
-- 允許所有匿名使用者讀寫（适合公开追踪器）
CREATE POLICY "Allow all users" ON soulstone_timers
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- 6. 初始化四張地圖的資料列
INSERT INTO soulstone_timers (map_id, spawn_minutes) VALUES
    ('spirit-stone-valley', ARRAY[0, 20, 40]),
    ('yu-hwang-fortress', ARRAY[0, 20, 40]),
    ('blood-ruffian-base', ARRAY[0, 20, 40]),
    ('red-dragon-forge', ARRAY[0, 20, 40])
ON CONFLICT (map_id) DO NOTHING;

-- 7. （可選）建立效能優化的索引
CREATE INDEX IF NOT EXISTS idx_soulstone_timers_map_id ON soulstone_timers(map_id);
CREATE INDEX IF NOT EXISTS idx_soulstone_timers_updated_at ON soulstone_timers(updated_at);

-- =============================================
-- 使用說明：
-- 1. 在 Supabase SQL Editor 中執行此腳本
-- 2. 確認 Table 已被建立
-- 3. 複製你的 Project URL 和 anon key 到 app.js
-- 4. 完成！
-- =============================================
