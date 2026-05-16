-- =============================================
-- Soulstone Tracker - 伺服器端 RPC 函數
-- 所有時間運算在資料庫端執行，使用 NOW() 確保權威時間
-- =============================================

-- 1. 已出現靈石：next_spawn = NOW()
CREATE OR REPLACE FUNCTION set_spawn_now(p_map_id TEXT)
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    UPDATE soulstone_timers SET
        next_spawn = NOW(),
        cycle_end_time = NOW() + INTERVAL '160 minutes',
        collected_used = FALSE
    WHERE map_id = p_map_id;

    SELECT json_build_object(
        'next_spawn', st.next_spawn,
        'cycle_end_time', st.cycle_end_time,
        'collected_used', st.collected_used,
        'updated_at', st.updated_at,
        'server_now', NOW()
    ) INTO result
    FROM soulstone_timers st WHERE st.map_id = p_map_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 即將出現靈石：next_spawn = NOW() + 10 minutes
CREATE OR REPLACE FUNCTION set_spawn_upcoming(p_map_id TEXT)
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    UPDATE soulstone_timers SET
        next_spawn = NOW() + INTERVAL '10 minutes',
        cycle_end_time = NOW() + INTERVAL '10 minutes',
        collected_used = FALSE
    WHERE map_id = p_map_id;

    SELECT json_build_object(
        'next_spawn', st.next_spawn,
        'cycle_end_time', st.cycle_end_time,
        'collected_used', st.collected_used,
        'updated_at', st.updated_at,
        'server_now', NOW()
    ) INTO result
    FROM soulstone_timers st WHERE st.map_id = p_map_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. 微調時間：next_spawn += N minutes (伺服器端加減)
CREATE OR REPLACE FUNCTION adjust_spawn_time(p_map_id TEXT, p_minutes INTEGER)
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    UPDATE soulstone_timers SET
        next_spawn = next_spawn + (p_minutes * INTERVAL '1 minute'),
        cycle_end_time = CASE
            WHEN cycle_end_time IS NOT NULL
            THEN cycle_end_time + (p_minutes * INTERVAL '1 minute')
            ELSE NULL
        END
    WHERE map_id = p_map_id;

    SELECT json_build_object(
        'next_spawn', st.next_spawn,
        'cycle_end_time', st.cycle_end_time,
        'collected_used', st.collected_used,
        'updated_at', st.updated_at,
        'server_now', NOW()
    ) INTO result
    FROM soulstone_timers st WHERE st.map_id = p_map_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. 已撿完：根據 remaining 決定 +120m 或 -20m
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

    -- 已使用過
    IF v_collected_used THEN
        RETURN json_build_object('error', 'already_collected');
    END IF;

    -- 沒設定時間
    IF v_next_spawn IS NULL THEN
        RETURN json_build_object('error', 'no_spawn_set');
    END IF;

    v_remaining := v_next_spawn - NOW();

    IF v_remaining <= INTERVAL '30 minutes' THEN
        -- 靈石出現中或即將出現：下次 = 本次出現時間 + 120m
        UPDATE soulstone_timers SET
            next_spawn = v_next_spawn + INTERVAL '120 minutes',
            collected_used = TRUE,
            cycle_end_time = v_next_spawn + INTERVAL '120 minutes'
        WHERE map_id = p_map_id;
    ELSE
        -- 等待中：縮短 20 分鐘
        UPDATE soulstone_timers SET
            next_spawn = next_spawn - INTERVAL '20 minutes',
            collected_used = TRUE
        WHERE map_id = p_map_id;
    END IF;

    SELECT json_build_object(
        'next_spawn', st.next_spawn,
        'cycle_end_time', st.cycle_end_time,
        'collected_used', st.collected_used,
        'updated_at', st.updated_at,
        'server_now', NOW()
    ) INTO result
    FROM soulstone_timers st WHERE st.map_id = p_map_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. 自動推進：next_spawn += 160 minutes
CREATE OR REPLACE FUNCTION auto_advance_spawn(p_map_id TEXT)
RETURNS json AS $$
DECLARE
    result json;
BEGIN
    UPDATE soulstone_timers SET
        next_spawn = next_spawn + INTERVAL '160 minutes',
        collected_used = FALSE
    WHERE map_id = p_map_id;

    SELECT json_build_object(
        'next_spawn', st.next_spawn,
        'cycle_end_time', st.cycle_end_time,
        'collected_used', st.collected_used,
        'updated_at', st.updated_at,
        'server_now', NOW()
    ) INTO result
    FROM soulstone_timers st WHERE st.map_id = p_map_id;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. 取得伺服器時間 (用於校準顯示倒數)
CREATE OR REPLACE FUNCTION get_server_time()
RETURNS json AS $$
BEGIN
    RETURN json_build_object('server_now', NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
