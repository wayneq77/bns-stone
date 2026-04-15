-- ========================================
-- Soulstone Tracker v3 - 完整重寫
-- 1. 更新 RPC 函數 (移除 auto_advance_spawn)
-- 2. 遷移資料 (增加 ch1/ch2 分流)
-- ========================================

-- 1. set_spawn_now: 設定 base_time = NOW() 用於消失倒數
CREATE OR REPLACE FUNCTION set_spawn_now(p_map_id TEXT)
RETURNS json AS $$
DECLARE result json;
BEGIN
    INSERT INTO soulstone_timers (map_id, collected_used)
    VALUES (p_map_id, false) ON CONFLICT (map_id) DO NOTHING;

    UPDATE soulstone_timers SET
        next_spawn = NOW(),
        base_time = NOW(),
        collected_used = FALSE
    WHERE map_id = p_map_id;

    SELECT json_build_object(
        'next_spawn', st.next_spawn,
        'base_time', st.base_time,
        'collected_used', st.collected_used,
        'updated_at', st.updated_at,
        'server_now', NOW()
    ) INTO result FROM soulstone_timers st WHERE st.map_id = p_map_id;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. set_spawn_upcoming: base_time = NULL (未確認出現)
CREATE OR REPLACE FUNCTION set_spawn_upcoming(p_map_id TEXT)
RETURNS json AS $$
DECLARE result json;
BEGIN
    INSERT INTO soulstone_timers (map_id, collected_used)
    VALUES (p_map_id, false) ON CONFLICT (map_id) DO NOTHING;

    UPDATE soulstone_timers SET
        next_spawn = NOW() + INTERVAL '10 minutes',
        base_time = NULL,
        collected_used = FALSE
    WHERE map_id = p_map_id;

    SELECT json_build_object(
        'next_spawn', st.next_spawn,
        'base_time', st.base_time,
        'collected_used', st.collected_used,
        'updated_at', st.updated_at,
        'server_now', NOW()
    ) INTO result FROM soulstone_timers st WHERE st.map_id = p_map_id;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. adjust_spawn_time: 只改 next_spawn，不動 base_time
CREATE OR REPLACE FUNCTION adjust_spawn_time(p_map_id TEXT, p_minutes INTEGER)
RETURNS json AS $$
DECLARE result json;
BEGIN
    UPDATE soulstone_timers SET
        next_spawn = next_spawn + (p_minutes * INTERVAL '1 minute')
    WHERE map_id = p_map_id;

    SELECT json_build_object(
        'next_spawn', st.next_spawn,
        'base_time', st.base_time,
        'collected_used', st.collected_used,
        'updated_at', st.updated_at,
        'server_now', NOW()
    ) INTO result FROM soulstone_timers st WHERE st.map_id = p_map_id;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. mark_collected_fn: 已撿完
CREATE OR REPLACE FUNCTION mark_collected_fn(p_map_id TEXT)
RETURNS json AS $$
DECLARE
    v_next_spawn TIMESTAMPTZ;
    v_collected_used BOOLEAN;
    v_remaining INTERVAL;
    result json;
BEGIN
    SELECT st.next_spawn, st.collected_used
    INTO v_next_spawn, v_collected_used
    FROM soulstone_timers st WHERE st.map_id = p_map_id;

    IF v_collected_used THEN
        RETURN json_build_object('error', 'already_collected');
    END IF;
    IF v_next_spawn IS NULL THEN
        RETURN json_build_object('error', 'no_spawn_set');
    END IF;

    v_remaining := v_next_spawn - NOW();

    IF v_remaining <= INTERVAL '30 minutes' THEN
        UPDATE soulstone_timers SET
            next_spawn = v_next_spawn + INTERVAL '120 minutes',
            base_time = NULL,
            collected_used = TRUE
        WHERE map_id = p_map_id;
    ELSE
        UPDATE soulstone_timers SET
            next_spawn = next_spawn - INTERVAL '20 minutes',
            collected_used = TRUE
        WHERE map_id = p_map_id;
    END IF;

    SELECT json_build_object(
        'next_spawn', st.next_spawn,
        'base_time', st.base_time,
        'collected_used', st.collected_used,
        'updated_at', st.updated_at,
        'server_now', NOW()
    ) INTO result FROM soulstone_timers st WHERE st.map_id = p_map_id;
    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 刪除 auto_advance_spawn（不再需要！）
DROP FUNCTION IF EXISTS auto_advance_spawn(TEXT);

-- 6. get_server_time 不變
CREATE OR REPLACE FUNCTION get_server_time()
RETURNS json AS $$
BEGIN
    RETURN json_build_object('server_now', NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ========================================
-- 資料遷移：增加 ch1/ch2 分流
-- ========================================
UPDATE soulstone_timers SET map_id = map_id || '-ch1'
WHERE map_id NOT LIKE '%-ch1' AND map_id NOT LIKE '%-ch2';

INSERT INTO soulstone_timers (map_id, collected_used)
SELECT REPLACE(map_id, '-ch1', '-ch2'), FALSE
FROM soulstone_timers WHERE map_id LIKE '%-ch1'
ON CONFLICT (map_id) DO NOTHING;
