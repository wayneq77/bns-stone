/**
 * 劍靈：革命 靈石追蹤器
 * Soulstone Tracker for Blade & Soul Revolution
 */

// ================================
// Configuration
// ================================

const CONFIG = {
    // Default spawn interval: 2 hours 20 minutes (140 min)
    DEFAULT_INTERVAL: 140 * 60 * 1000,
    // When collected: 2 hours only (120 min)
    COLLECTED_INTERVAL: 120 * 60 * 1000,
    // Warning time: 5 minutes before spawn
    WARNING_BEFORE: 5 * 60 * 1000,
    // Danger time: 1 minute before spawn
    DANGER_BEFORE: 1 * 60 * 1000,
    // Supabase config (loaded from Cloudflare Pages via window.APP_CONFIG)
    SUPABASE_URL: window.APP_CONFIG?.SUPABASE_URL || '',
    SUPABASE_KEY: window.APP_CONFIG?.SUPABASE_KEY || '',
    // Map definitions
    MAPS: [
        { id: 'spirit-stone-valley', name: '靈石谷', icon: '🏔️' },
        { id: 'yu-hwang-fortress', name: '玉皇要塞', icon: '🏯' },
        { id: 'blood-ruffian-base', name: '糾土地帶', icon: '🩸' },
        { id: 'red-dragon-forge', name: '赤龍火山', icon: '🌋' }
    ]
};

// ================================
// State Management
// ================================

const I18N = {
    'zh': {
        'title': '靈石追蹤器',
        'subtitle': '劍靈：革命 · 及時掌握靈石動向',
        'nextSpawn': '下次出現',
        'remaining': '剩餘',
        'pending': '等待設定',
        'active': '已出現',
        'spawning': '已出現',
        'despawning': '消失倒數',
        'statusUpcoming': '即將出現',
        'collected': '已撿完',
        'notCollected': '未撿完',
        'btnSpawned': '已出現靈石',
        'btnUpcoming': '即將出現靈石',
        'btnCollected': '已撿完',
        // maps
        'spirit-stone-valley': '靈石谷',
        'yu-hwang-fortress': '玉皇要塞',
        'blood-ruffian-base': '糾土地帶',
        'red-dragon-forge': '赤龍火山',
        // toasts & modals
        'toastShorten': '✅ 採集完成！已縮短 20 分鐘',
        'toastCollected': '✅ 採集完成！下輪出現時間：120 分鐘後',
        'toastAdjusted': '✅ 時間已微調',
        'toastReset': '🔔 校正完成：靈石將出現在',
        // modal 1
        'modalSpawnedTitle': '確定靈石已出現了嗎？',
        'modalSpawnedSub': (base, next) => `靈石將從現在 <strong style="color:var(--accent-orange)">${base}</strong> 開始出現（預計存在 20 分鐘）。<br>下輪出現時間設定為 <strong style="color:var(--accent-gold)">${next}</strong> (140分後)。`,
        // modal 2
        'modalUpcomingTitle': '確定出現即將出現靈石的圖案再點此按鈕？',
        'modalUpcomingSub': '將自動設定為 **10分鐘後** 出現，並開始倒數計時。確認執行嗎？',
        // toggle
        'langToggle': 'English',
        'modalConfirm': '確定',
        'modalCancel': '取消',
        'statusWaiting': '等待設定',
        'globalStatusFormat': (active, warning) => `目前狀態：${active} 個出現中，${warning} 個即將出現`,
        'lastUpdated': '最後同步：',
        'alarmOn': '警報開啟',
        'alarmOff': '警報已關閉'
    },
    'en': {
        'title': 'Soulstone Tracker',
        'subtitle': 'B&S Revolution · Realtime Tracker',
        'nextSpawn': 'Next Spawn',
        'remaining': 'Remaining',
        'pending': 'Pending',
        'active': 'Spawned',
        'spawning': 'Spawned',
        'despawning': 'Despawning in',
        'statusUpcoming': 'Upcoming',
        'collected': 'Collected',
        'notCollected': 'Unknown',
        'btnSpawned': 'Spawned',
        'btnUpcoming': 'Upcoming',
        'btnCollected': 'Collected',
        // maps
        'spirit-stone-valley': 'Spirit Stone Valley',
        'yu-hwang-fortress': 'Yu Hwang Fortress',
        'blood-ruffian-base': 'Blood Ruffian Base',
        'red-dragon-forge': 'Red Dragon Forge',
        // toasts & modals
        'toastShorten': '✅ Collected! Timer shortened by 20m',
        'toastCollected': '✅ Collected! Next spawn in 120m',
        'toastAdjusted': '✅ Time adjusted',
        'toastReset': '🔔 Calibrated! Next spawn at',
        // modal 1
        'modalSpawnedTitle': 'Confirm Soulstone spawned?',
        'modalSpawnedSub': (base, next) => `Stones spawning starting from <strong style="color:var(--accent-orange)">${base}</strong> (lasts 20m).<br>Next spawn scheduled for <strong style="color:var(--accent-gold)">${next}</strong> (in 140m).`,
        // modal 2
        'modalUpcomingTitle': 'Confirm upcoming warning?',
        'modalUpcomingSub': 'This will set the spawn time to exactly **10 minutes from now**. Confirm?',
        'langToggle': '繁體中文',
        'modalConfirm': 'Confirm',
        'modalCancel': 'Cancel',
        'statusWaiting': 'Pending',
        'globalStatusFormat': (active, warning) => `Status: ${active} active, ${warning} upcoming`,
        'lastUpdated': 'Last sync: ',
        'alarmOn': 'Alarm ON',
        'alarmOff': 'Alarm OFF'
    }
};

let currentLang = localStorage.getItem('soulstone-lang') || 'zh';

// Determine Server from Path (allow asia1 and ct1)
const ALLOWED_SERVERS = ['asia1', 'ct1'];

function getServerFromPath() {
    const path = window.location.pathname.replace(/\/+$/, '').substring(1).toLowerCase();
    
    // 沒有輸入後綴，或不在允許清單內 → 404
    if (!path || !ALLOWED_SERVERS.includes(path)) {
        document.body.innerHTML = '<div style="display:flex; height:100vh; align-items:center; justify-content:center; flex-direction:column; color:white;"><h1 style="font-size:3rem; margin:0;">404</h1><p>Server Not Found / 找不到伺服器</p></div>';
        throw new Error('Invalid server');
    }
    
    return path;
}
const currentServer = getServerFromPath();
const currentServerLabel = currentServer === 'ct1' ? 'CT 1' : 'Asia 1';

function t(key, ...args) {
    const text = I18N[currentLang][key];
    if (typeof text === 'function') {
        return text(...args);
    }
    return text !== undefined ? text : key;
}

class SoulstoneTracker {
    constructor() {
        this.state = {};
        this.supabase = null;
        this.realtimeChannel = null;
        this.updateIntervals = {};
        this.alarmEnabled = localStorage.getItem('soulstone-alarm-enabled') === 'true';
        this.alarmState = {}; // 紀錄已經響過的 mapId
        this.serverTimeOffset = 0; // 伺服器與本地時間的毫秒差 (Supabase - Local)
        this.lastSyncTime = null;

        this.init();
    }

    async init() {
        // Initialize maps state
        CONFIG.MAPS.forEach(map => {
            this.state[map.id] = {
                nextSpawn: null,
                spawnMinutes: [0, 20, 40],
                lastUpdated: null,
                // 新增：追蹤已撿完狀態
                collectedUsed: false,     // 這輪是否已使用「已撿完」
                cycleEndTime: null,        // 這輪結束時間
                baseTime: null            // 這輪基準時間（用於計算下次）
            };
        });

        // Try to initialize Supabase
        this.initSupabase();

        // Setup event listeners
        this.setupEventListeners();

        // Start update loop
        this.startUpdateLoop();

        // Check notification permission
        this.checkNotificationPermission();
    }

    // ================================
    // Supabase Integration
    // ================================

    initSupabase() {
        if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) {
            console.log('Supabase not configured, using localStorage only');
            this.loadFromLocalStorage();
            return;
        }

        const doInit = () => {
            try {
                // supabase-js UMD build exposes window.supabase
                const lib = window.supabase;
                if (!lib || !lib.createClient) {
                    throw new Error('Supabase library unavailable');
                }
                this.supabase = lib.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
                this.connectRealtime();
            } catch (error) {
                console.error('Failed to initialize Supabase:', error);
                this.loadFromLocalStorage();
            }
        };

        if (window.supabase && window.supabase.createClient) {
            // Already loaded
            doInit();
        } else {
            // Wait for CDN script onload
            const script = document.getElementById('supabase-cdn');
            if (script) {
                script.addEventListener('load', doInit);
                script.addEventListener('error', () => {
                    console.warn('Supabase CDN failed to load, using localStorage');
                    this.loadFromLocalStorage();
                });
            } else {
                // Fallback: small delay
                setTimeout(doInit, 1000);
            }
        }
    }

    /**
     * 同步伺服器時間校準
     * 透過讀取 Supabase 的 HTTP Header 中的 Date 欄位來獲取權威系統時間
     */
    async syncServerTime() {
        if (!CONFIG.SUPABASE_URL || !CONFIG.SUPABASE_KEY) return;
        try {
            const start = Date.now();
            // 使用 GET 請求並帶上 apikey。CORS 通常允許這種類型的授權請求。
            // 限制取回的資料量 (select=id&limit=1) 以節省頻寬。
            const url = `${CONFIG.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/soulstone_timers?select=id&limit=1`;
            const response = await fetch(url, { 
                method: 'GET',
                headers: {
                    'apikey': CONFIG.SUPABASE_KEY,
                    'Content-Type': 'application/json'
                }
            });
            
            const serverDateStr = response.headers.get('Date');
            if (serverDateStr) {
                const serverTime = new Date(serverDateStr).getTime();
                const now = Date.now();
                const rttOffset = (now - start) / 2;
                this.serverTimeOffset = (serverTime + rttOffset) - now;
                this.lastSyncTime = this.getCurrentServerTime();
                console.log(`[ClockSync] 伺服器時間已同步。偏移: ${this.serverTimeOffset}ms`);
            } else {
                console.warn('[ClockSync] 伺服器未傳回 Date 標頭');
            }
        } catch (e) {
            console.warn('[ClockSync] 伺服器時間同步失敗，將沿用上次校準或本地時間。', e);
        }
        this.updateLastUpdated();
    }

    /**
     * 獲取校準後的伺服器時間
     */
    getCurrentServerTime() {
        return new Date(Date.now() + this.serverTimeOffset);
    }

    async connectRealtime() {
        if (!this.supabase) return;

        try {
            await this.ensureTable();

            this.realtimeChannel = this.supabase
                .channel('soulstone-tracker')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'soulstone_timers'
                    },
                    (payload) => this.handleRealtimeUpdate(payload)
                )
                .on('broadcast', { event: 'sync' }, (payload) => {
                    if (payload.payload) { // Supabase wraps broadcast data
                        const rawPayload = payload.payload;
                        if (rawPayload.mapId && rawPayload.mapId.startsWith(`${currentServer}_`)) {
                            const localMapId = rawPayload.mapId.replace(`${currentServer}_`, '');
                            this.state[localMapId] = {
                                ...this.state[localMapId],
                                ...rawPayload.data
                            };
                            // Parse string dates back to Date objects
                            this.state[localMapId].nextSpawn = rawPayload.data.nextSpawn ? new Date(rawPayload.data.nextSpawn) : null;
                            this.state[localMapId].lastUpdated = rawPayload.data.lastUpdated ? new Date(rawPayload.data.lastUpdated) : null;
                            this.state[localMapId].cycleEndTime = rawPayload.data.cycleEndTime ? new Date(rawPayload.data.cycleEndTime) : null;
                            this.state[localMapId].baseTime = rawPayload.data.baseTime ? new Date(rawPayload.data.baseTime) : null;

                            this.updateDisplay(localMapId);
                        }
                    } else {
                        // Fallback for older code version, not applying server scope
                        const rawPayload = payload;
                        if (rawPayload.mapId) {
                            this.state[rawPayload.mapId] = {
                                ...this.state[rawPayload.mapId],
                                ...rawPayload.data
                            };
                            // Parse string dates back to Date objects
                            this.state[rawPayload.mapId].nextSpawn = rawPayload.data.nextSpawn ? new Date(rawPayload.data.nextSpawn) : null;
                            this.state[rawPayload.mapId].lastUpdated = rawPayload.data.lastUpdated ? new Date(rawPayload.data.lastUpdated) : null;
                            this.state[rawPayload.mapId].cycleEndTime = rawPayload.data.cycleEndTime ? new Date(rawPayload.data.cycleEndTime) : null;
                            this.state[rawPayload.mapId].baseTime = rawPayload.data.baseTime ? new Date(rawPayload.data.baseTime) : null;

                            this.updateDisplay(rawPayload.mapId);
                        }
                    }
                })
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') {
                        this.updateConnectionStatus(true);
                        await this.fetchFromSupabase();
                    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                        this.updateConnectionStatus(false);
                    }
                });

        } catch (error) {
            console.error('Failed to connect to Supabase:', error);
            this.updateConnectionStatus(false);
            this.loadFromLocalStorage();
        }
    }

    async ensureTable() {
        try {
            const { error } = await this.supabase
                .from('soulstone_timers')
                .select('*')
                .limit(1);

            if (error && error.code === '42P01') {
                console.warn('soulstone_timers table does not exist.');
            }
        } catch (e) {
            console.warn('Could not verify table existence:', e);
        }
    }

    async fetchFromSupabase() {
        if (!this.supabase) return;

        try {
            // 獲取數據的同時一併同步時鐘
            await this.syncServerTime();

            const { data, error } = await this.supabase
                .from('soulstone_timers')
                .select('*')
                .like('map_id', `${currentServer}_%`);

            if (error) {
                console.error('Error fetching from Supabase:', error);
                return;
            }

            if (data && data.length > 0) {
                data.forEach(row => {
                    const localMapId = row.map_id.replace(`${currentServer}_`, '');
                    if (this.state[localMapId]) {
                        this.state[localMapId].nextSpawn = row.next_spawn ? new Date(row.next_spawn) : null;
                        this.state[localMapId].spawnMinutes = row.spawn_minutes || [0, 20, 40];
                        this.state[localMapId].lastUpdated = new Date(row.updated_at);
                        // 還原額外狀態
                        if (row.collected_used !== undefined) {
                            this.state[localMapId].collectedUsed = row.collected_used;
                        }
                        if (row.cycle_end_time) {
                            this.state[localMapId].cycleEndTime = new Date(row.cycle_end_time);
                        }
                        if (row.base_time) {
                            this.state[localMapId].baseTime = new Date(row.base_time);
                        }
                    }
                });

                // 計算伺服器時間偏移：取最後一個更新紀錄的 updated_at 作為基準 (簡化版處理)
                const latestRecord = data.sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at))[0];
                if (latestRecord) {
                    // 這邊僅輔助用，真正的漂移透過 handleRealtimeUpdate 的攔截來處理
                }

                this.updateAllDisplays();
                this.updateLastUpdated();
            }
        } catch (error) {
            console.error('Failed to fetch from Supabase:', error);
        }
    }

    handleRealtimeUpdate(payload) {
        const { eventType, new: newRecord } = payload;

        if (eventType === 'UPDATE' || eventType === 'INSERT') {
            const serverMapId = newRecord.map_id;
            if (!serverMapId || !serverMapId.startsWith(`${currentServer}_`)) return;

            const localMapId = serverMapId.replace(`${currentServer}_`, '');
            if (localMapId && this.state[localMapId]) {
                const now = this.getCurrentServerTime();
                const newState = {
                    nextSpawn: newRecord.next_spawn ? new Date(newRecord.next_spawn) : null,
                    collectedUsed: newRecord.collected_used,
                    cycleEndTime: newRecord.cycle_end_time ? new Date(newRecord.cycle_end_time) : null,
                    baseTime: newRecord.base_time ? new Date(newRecord.base_time) : null,
                    updatedAt: new Date(newRecord.updated_at)
                };

                // --- 智慧校正攔截 (Update Sanitization) ---
                // 如果是「手動校準 (isManual)」，則無視任何過濾規則，絕對優先採用
                const isManual = !!(payload.payload?.isManual || payload.isManual);
                
                if (this.state[localMapId].nextSpawn && newState.nextSpawn && !isManual) {
                    const diff = Math.abs(this.state[localMapId].nextSpawn.getTime() - newState.nextSpawn.getTime());
                    const fiveMinutes = 5 * 60 * 1000;
                    
                    // 只有當新資料與本地相比「大幅跳變」超過 5 分鐘（代表有人進行了手動校正），我們才接受更新
                    if (diff > 0 && diff < fiveMinutes) {
                        console.log(`[SmartSync] 偵測到微小偏差 (${(diff/1000).toFixed(1)}s)，判定為時鐘雜訊，已忽略該同步。`);
                        return; 
                    }
                }

                if (isManual) {
                    console.log(`[SmartSync] 收到權威手動更新 (${localMapId})，強制覆蓋。`);
                }

                this.state[localMapId].nextSpawn = newState.nextSpawn;
                this.state[localMapId].spawnMinutes = newRecord.spawn_minutes || [0, 20, 40];
                this.state[localMapId].lastUpdated = newState.updatedAt;
                this.state[localMapId].collectedUsed = newState.collectedUsed;
                this.state[localMapId].cycleEndTime = newState.cycleEndTime;
                this.state[localMapId].baseTime = newState.baseTime;
                
                this.updateAllDisplays();
                this.updateLastUpdated();
            }
        }
    }

    async saveToSupabase(mapId, isManual = false) {
        if (!this.supabase) {
            this.saveToLocalStorage();
            return;
        }

        const serverMapId = `${currentServer}_${mapId}`;
        const data = {
            map_id: serverMapId,
            next_spawn: this.state[mapId].nextSpawn ? this.state[mapId].nextSpawn.toISOString() : null,
            spawn_minutes: this.state[mapId].spawnMinutes,
            collected_used: this.state[mapId].collectedUsed,
            cycle_end_time: this.state[mapId].cycleEndTime ? this.state[mapId].cycleEndTime.toISOString() : null,
            base_time: this.state[mapId].baseTime ? this.state[mapId].baseTime.toISOString() : null,
            updated_at: this.getCurrentServerTime().toISOString()
        };

        try {
            const { error } = await this.supabase
                .from('soulstone_timers')
                .upsert(data, { onConflict: 'map_id' });

            if (error) {
                console.error('Error saving to Supabase:', error);
                this.saveToLocalStorage();
            }

            // Broadcast
            if (this.realtimeChannel) {
                this.realtimeChannel.send({
                    type: 'broadcast',
                    event: 'sync',
                    payload: {
                        mapId: serverMapId,
                        isManual: isManual,
                        data: {
                            nextSpawn: this.state[mapId].nextSpawn?.toISOString(),
                            spawnMinutes: this.state[mapId].spawnMinutes,
                            lastUpdated: this.state[mapId].lastUpdated?.toISOString(),
                            collectedUsed: this.state[mapId].collectedUsed,
                            cycleEndTime: this.state[mapId].cycleEndTime?.toISOString(),
                            baseTime: this.state[mapId].baseTime ? this.state[mapId].baseTime.toISOString() : null
                        }
                    }
                });
            }
        } catch (error) {
            console.error('Failed to save to Supabase:', error);
            this.saveToLocalStorage();
        }
    }

    // ================================
    // Local Storage Fallback
    // ================================

    loadFromLocalStorage() {
        try {
            const saved = localStorage.getItem('soulstone-tracker-data');
            if (saved) {
                const data = JSON.parse(saved);
                CONFIG.MAPS.forEach(map => {
                    const serverMapId = `${currentServer}_${map.id}`;
                    if (data.maps && data.maps[serverMapId]) {
                        this.state[map.id] = {
                            ...this.state[map.id],
                            ...data.maps[serverMapId],
                            nextSpawn: data.maps[serverMapId].nextSpawn ? new Date(data.maps[serverMapId].nextSpawn) : null,
                            lastUpdated: data.maps[serverMapId].lastUpdated ? new Date(data.maps[serverMapId].lastUpdated) : null,
                            cycleEndTime: data.maps[serverMapId].cycleEndTime ? new Date(data.maps[serverMapId].cycleEndTime) : null,
                            baseTime: data.maps[serverMapId].baseTime ? new Date(data.maps[serverMapId].baseTime) : null
                        };
                    }
                });
                this.updateAllDisplays();
            }
        } catch (error) {
            console.error('Failed to load from localStorage:', error);
        }
    }

    saveToLocalStorage() {
        try {
            // Fetch existing so we don't overwrite other servers
            const existing = localStorage.getItem('soulstone-tracker-data');
            let data = { maps: {} };
            if (existing) {
                const parsed = JSON.parse(existing);
                if (parsed.maps) data = parsed;
            }

            CONFIG.MAPS.forEach(map => {
                const serverMapId = `${currentServer}_${map.id}`;
                data.maps[serverMapId] = {
                    nextSpawn: this.state[map.id].nextSpawn,
                    spawnMinutes: this.state[map.id].spawnMinutes,
                    lastUpdated: this.state[map.id].lastUpdated,
                    collectedUsed: this.state[map.id].collectedUsed,
                    cycleEndTime: this.state[map.id].cycleEndTime,
                    baseTime: this.state[map.id].baseTime
                };
            });
            localStorage.setItem('soulstone-tracker-data', JSON.stringify(data));
        } catch (error) {
            console.error('Failed to save to localStorage:', error);
        }
    }

    // ================================
    // 時間計算與調整邏輯
    // ================================

    /**
     * 將時間對齊至最近的 20 分鐘標記 (:00, :20, :40) 且秒數歸零
     * 這符合遊戲中靈石谷/要塞 140m 或 120m 的循環規律
     */
    snapToGamerCycle(date) {
        if (!date) return null;
        const snapped = new Date(date);
        snapped.setSeconds(0);
        snapped.setMilliseconds(0);
        
        const minutes = snapped.getMinutes();
        const remainder = minutes % 20;
        
        if (remainder < 10) {
            snapped.setMinutes(minutes - remainder);
        } else {
            snapped.setMinutes(minutes + (20 - remainder));
        }
        return snapped;
    }

    adjustTime(mapId, minutesToAdd) {
        const state = this.state[mapId];
        if (!state.nextSpawn) {
            this.showToast('尚未設定時間，無法微調');
            return;
        }

        const msToAdd = minutesToAdd * 60 * 1000;
        state.nextSpawn = new Date(state.nextSpawn.getTime() + msToAdd);
        if (state.cycleEndTime) {
            state.cycleEndTime = new Date(state.cycleEndTime.getTime() + msToAdd);
        }
        state.lastUpdated = new Date();
        
        this.saveToSupabase(mapId, true);
        this.updateDisplay(mapId);
        this.showToast(t('toastAdjusted'));
    }

    /**
     * 設定出現靈石（靈石「現在」出現）
     * 將 nextSpawn 設為「現在」，讓畫面立即進入「消失倒數 20 分鐘」模式。
     * 20 分鐘後，updateDisplay 的自動推算邏輯會接手：
     *   nextSpawn += 140m → 進入「等待下一輪」倒數。
     * cycleEndTime 記錄本輪的預期結束時間，供 markCollected 計算用。
     */
    setSpawnTime(mapId) {
        const now = this.getCurrentServerTime();
        const existingSpawn = this.state[mapId].nextSpawn;
        let finalSpawn = now;

        // --- 智慧吸附 (Smart Snapping) ---
        // 如果現在的時間與原本預計出現的時間相差不到 10 分鐘，則採用原本預計的時間為基準，消除漂移
        if (existingSpawn) {
            const diff = Math.abs(now.getTime() - existingSpawn.getTime());
            const tenMinutes = 10 * 60 * 1000;
            if (diff < tenMinutes) {
                console.log(`[SmartCalibration] 偵測到點擊延遲 (${(diff/1000).toFixed(1)}s)，已自動回填至正確排程。`);
                finalSpawn = existingSpawn;
            }
        }
        
        this.state[mapId].collectedUsed = false; 
        this.state[mapId].nextSpawn = finalSpawn;
        this.state[mapId].cycleEndTime = new Date(finalSpawn.getTime() + CONFIG.DEFAULT_INTERVAL);
        this.state[mapId].lastUpdated = now;

        this.saveToSupabase(mapId, true);
        this.updateDisplay(mapId);
    }

    /**
     * 已撿完按鈕（縮短下次出現時間，每輪只能執行一次）
     * 
     * nextSpawn 的意義：
     *  - 靈石出現中：nextSpawn = 出現時間（remaining 為負）
     *  - 等待中：nextSpawn = 下輪出現時間（remaining 為正）
     *  - auto-advance 後：nextSpawn = 出現時間 + 140m
     * 
     * 已撿完邏輯：下輪出現 = 出現時間 + 120m
     */
    markCollected(mapId) {
        const mapState = this.state[mapId];

        // 檢查：這輪是否已使用過
        if (mapState.collectedUsed) {
            console.log('這輪已使用過「已撿完」');
            return false;
        }

        // 標記已使用
        mapState.collectedUsed = true;

        const now = this.getCurrentServerTime();
        const scheduledSpawn = mapState.nextSpawn;
        const remaining = scheduledSpawn.getTime() - now.getTime();

        if (remaining <= 30 * 60 * 1000) {
            // 靈石出現中（remaining <= 0）或即將出現（remaining 在 30m 內）
            // scheduledSpawn = 出現時間，nextSpawn = 出現時間 + 120m
            // 這樣算出的「下次出現」不會因為玩家晚按而飄移
            mapState.nextSpawn = new Date(scheduledSpawn.getTime() + CONFIG.COLLECTED_INTERVAL);
            mapState.cycleEndTime = mapState.nextSpawn;
            this.showToast(t('toastCollected'));
        } else {
            // 等待中（remaining > 30m）── 正常 140m 循環
            // 直接將原本預計的時間扣除 20 分鐘 (140 - 120 = 20)
            mapState.nextSpawn = new Date(scheduledSpawn.getTime() - (CONFIG.DEFAULT_INTERVAL - CONFIG.COLLECTED_INTERVAL));
            this.showToast(t('toastShorten'));
        }
        
        mapState.lastUpdated = now;

        this.saveToSupabase(mapId, true);
        this.updateDisplay(mapId);
        return true;
    }

    resetTimer(mapId) {
        this.state[mapId].nextSpawn = null;
        this.state[mapId].collectedUsed = false;
        this.state[mapId].cycleEndTime = null;
        this.state[mapId].baseTime = null;
        this.state[mapId].lastUpdated = this.getCurrentServerTime();

        this.saveToSupabase(mapId, true);
        this.updateDisplay(mapId);
    }

    /**
     * 接獲即將出現提醒，設定為 10 分鐘後出現
     * 注意：不 snap，保留地圖的自然偏移量，讓遊戲實際時間與追蹤器同步
     */
    setNextIntervalTime(mapId) {
        const now = this.getCurrentServerTime();
        const upcomingSpawn = new Date(now.getTime() + 10 * 60 * 1000);
        const existingSpawn = this.state[mapId].nextSpawn;
        let finalSpawn = upcomingSpawn;

        // --- 智慧吸附 (Smart Snapping) ---
        // 如果「10分鐘後」的時間與原本預計的時間相差不到 5 分鐘，維持原本的時間，避免破壞精準度
        if (existingSpawn) {
            const diff = Math.abs(upcomingSpawn.getTime() - existingSpawn.getTime());
            const fiveMinutes = 5 * 60 * 1000;
            if (diff < fiveMinutes) {
                console.log(`[SmartCalibration] 收到警報，與預計時間吻合，維持原計時器以確保秒數精準。`);
                finalSpawn = existingSpawn;
            }
        }
        
        this.state[mapId].collectedUsed = false;
        this.state[mapId].nextSpawn = finalSpawn;
        this.state[mapId].cycleEndTime = this.state[mapId].nextSpawn;
        this.state[mapId].lastUpdated = now;

        this.saveToSupabase(mapId, true);
        this.updateDisplay(mapId);

        const h = this.state[mapId].nextSpawn.getHours().toString().padStart(2, '0');
        const m = this.state[mapId].nextSpawn.getMinutes().toString().padStart(2, '0');
        this.showToast(t('toastReset', h, m));
    }

    // ================================
    // Display Updates
    // ================================

    updateAllDisplays() {
        CONFIG.MAPS.forEach(map => this.updateDisplay(map.id));
        
        const activeCount = Object.values(this.state).filter(s => s.nextSpawn).length;
        const warningCount = Object.values(this.state).filter(s => s.nextSpawn && (s.nextSpawn.getTime() - this.getCurrentServerTime().getTime()) <= CONFIG.WARNING_BEFORE).length;
        const globalStatusEl = document.getElementById('global-status');
        if (globalStatusEl) {
            globalStatusEl.textContent = t('globalStatusFormat', activeCount, warningCount);
        }
    }

    updateDisplay(mapId) {
        const state = this.state[mapId];
        const now = this.getCurrentServerTime();

        // Update timer value
        const nextEl = document.getElementById(`next-${mapId}`);
        const countdownEl = document.getElementById(`countdown-${mapId}`);
        const statusEl = document.getElementById(`status-${mapId}`);
        const cardEl = document.getElementById(`card-${mapId}`);
        const collectedBtn = cardEl.querySelector('.collected-btn');

        if (!state.nextSpawn) {
            nextEl.textContent = '--:--:--';
            countdownEl.textContent = '--:--:--';
            statusEl.textContent = t('statusWaiting');
            statusEl.className = 'map-status';
            cardEl.classList.remove('urgent', 'soon');
            this.updateCollectedBtnState(collectedBtn, state, false);
            return;
        }

        // Format next spawn time natively (will be overridden below if active)
        nextEl.textContent = this.formatTime(state.nextSpawn);
        const timerLabel = countdownEl.previousElementSibling;

        // Calculate remaining time
        const remaining = state.nextSpawn.getTime() - now.getTime();

        // 檢查並觸發音效警報 (剩餘時間 <= 警告時間)
        if (remaining <= CONFIG.WARNING_BEFORE && remaining > 0) {
            if (!this.alarmState[mapId]) {
                this.alarmState[mapId] = true;
                this.playAlarm();
            }
        } else if (remaining > CONFIG.WARNING_BEFORE) {
            // 已被重置到未來，重新解鎖警報
            this.alarmState[mapId] = false;
        }

        // 已經超過存在時間 (20分鐘)，自動將排程推到下一輪 (未撿完的 140分鐘)
        if (remaining <= -20 * 60 * 1000) {
            state.nextSpawn = new Date(state.nextSpawn.getTime() + 140 * 60 * 1000);
            state.collectedUsed = false;
            // 自動進位標記為非手動，防止覆蓋其他裝置的新進度
            this.saveToSupabase(mapId, false);
            return this.updateDisplay(mapId);
        }

        // 檢查是否已過了cycleEndTime，解除「已撿完」限制
        if (state.cycleEndTime && now >= state.cycleEndTime) {
            state.collectedUsed = false;
        }

        if (remaining <= 0) {
            // Spawn is active! showing the time left until despawn
            const despawnRemaining = (20 * 60 * 1000) + remaining;
            
            // 下次出現時間要往後推 140 分鐘來顯示 (滿足玩家看到下一輪時間的需求)
            const nextCycleTime = new Date(state.nextSpawn.getTime() + 140 * 60 * 1000);
            nextEl.textContent = this.formatTime(nextCycleTime);

            if (timerLabel) timerLabel.textContent = t('despawning'); // changed to 消失倒數
            countdownEl.textContent = this.formatDuration(despawnRemaining);
            countdownEl.className = 'timer-countdown danger';
            statusEl.textContent = t('spawning'); // which now translates to 已出現
            statusEl.className = 'map-status danger';
            cardEl.classList.add('urgent');
            cardEl.classList.remove('soon');
        } else {
            // Show countdown
            nextEl.textContent = this.formatTime(state.nextSpawn); // revert back to normal

            if (timerLabel) timerLabel.textContent = t('remaining');
            countdownEl.textContent = this.formatDuration(remaining);
            
            // 根據collectedUsed顯示狀態
            if (state.collectedUsed) {
                statusEl.textContent = t('collected');
                statusEl.className = 'map-status active';
            } else if (remaining <= CONFIG.WARNING_BEFORE) {
                statusEl.textContent = t('statusUpcoming');
                statusEl.className = 'map-status danger';
            } else {
                statusEl.textContent = t('notCollected');
                statusEl.className = 'map-status warning';
            }
            
            cardEl.classList.remove('urgent');

            // Add 'soon' class when within warning time
            if (remaining <= CONFIG.WARNING_BEFORE) {
                cardEl.classList.add('soon');
                countdownEl.className = remaining <= CONFIG.DANGER_BEFORE
                    ? 'timer-countdown danger'
                    : 'timer-countdown warning';
            } else {
                cardEl.classList.remove('soon');
                countdownEl.className = 'timer-countdown';
            }
        }

        // 更新「已撿完」按鈕狀態
        this.updateCollectedBtnState(collectedBtn, state, true);
    }

    updateCollectedBtnState(btn, state, hasTimer) {
        if (!hasTimer || !state.nextSpawn) {
            btn.classList.remove('used', 'disabled');
            btn.disabled = false;
            btn.textContent = t('btnCollected');
            return;
        }

        if (state.collectedUsed) {
            // 已使用過（按鈕變暗，但維持文字）
            btn.classList.add('used');
            btn.classList.remove('disabled');
            btn.disabled = false;
            btn.textContent = t('btnCollected');
        } else {
            // 未使用過（亮綠色）
            btn.classList.remove('used', 'disabled');
            btn.disabled = false;
            btn.textContent = t('btnCollected');
        }
    }

    formatTime(date) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        const seconds = date.getSeconds().toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    }

    formatDuration(ms) {
        const totalSeconds = Math.floor(ms / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;

        if (hours > 0) {
            return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    updateConnectionStatus(online) {
        const statusEl = document.getElementById('connection-status');
        const dotEl = statusEl.querySelector('.connection-dot');
        const textEl = statusEl.querySelector('.connection-text');

        if (online) {
            dotEl.className = 'connection-dot online';
            textEl.textContent = currentLang === 'en' ? 'Online (Supabase)' : '已連線 (Supabase)';
        } else {
            dotEl.className = 'connection-dot offline';
            textEl.textContent = currentLang === 'en' ? 'Offline (Local)' : '離線 (本地模式)';
        }
    }

    updateLastUpdated() {
        const el = document.getElementById('last-updated');
        if (!el) return;

        if (!this.lastSyncTime) {
            el.textContent = currentLang === 'en' ? '🕒 Initializing clock sync...' : '🕒 正在與伺服器同步計時...';
            return;
        }

        const timeStr = this.lastSyncTime.toLocaleTimeString(currentLang === 'en' ? 'en-US' : 'zh-TW');
        el.textContent = `${t('lastUpdated')}${timeStr} (Server)`;
    }

    updateLanguage() {
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            const translation = t(key);
            if (translation) {
                // Ignore title, handled below
                if (key !== 'title') el.textContent = translation;
            }
        });
        
        const toggleBtn = document.getElementById('lang-toggle');
        if (toggleBtn) toggleBtn.textContent = t('langToggle');

        // Update Title with Server Info
        document.title = `${currentServerLabel} | ${t('title')}`;
        const logoText = document.querySelector('.logo-text');
        if (logoText) {
            logoText.textContent = `${t('title')} (${currentServerLabel})`;
        }

        this.updateAllDisplays();
        this.updateConnectionStatus(this.supabase !== null);
        this.updateLastUpdated();
        this.updateAlarmBtn(document.getElementById('alarm-toggle'));
    }

    updateAlarmBtn(btn) {
        if (!btn) return;
        btn.textContent = this.alarmEnabled ? '🔔' : '🔕';
        btn.style.background = this.alarmEnabled ? 'var(--accent-orange)' : '#374151';
        btn.title = this.alarmEnabled ? t('alarmOn') : t('alarmOff');
    }

    playAlarm() {
        if (!this.alarmEnabled) return;
        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            if (!AudioContext) return;
            const ctx = new AudioContext();
            
            // 產生一個清脆的雙聲提示音效 ("Ding-Dong")
            const playTone = (freq, startTime, duration) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);
                
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.5, startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            const now = ctx.currentTime;
            playTone(880, now, 0.5);       // A5
            playTone(1108.73, now + 0.15, 0.5); // C#6
        } catch (e) {
            console.error('Audio play failed', e);
        }
    }

    startUpdateLoop() {
        // Update every second
        setInterval(() => {
            this.updateAllDisplays();
        }, 1000);
    }

    // ================================
    // Event Listeners
    // ================================

    setupEventListeners() {
        // 警報切換 button
        const alarmToggle = document.getElementById('alarm-toggle');
        if (alarmToggle) {
            this.updateAlarmBtn(alarmToggle);
            alarmToggle.addEventListener('click', () => {
                this.alarmEnabled = !this.alarmEnabled;
                localStorage.setItem('soulstone-alarm-enabled', this.alarmEnabled);
                this.updateAlarmBtn(alarmToggle);
                
                // 開啟時立刻試播一聲讓玩家確認音量
                if (this.alarmEnabled) this.playAlarm();
            });
        }

        // 語言切換 button
        const langToggle = document.getElementById('lang-toggle');
        if (langToggle) {
            langToggle.addEventListener('click', () => {
                currentLang = currentLang === 'zh' ? 'en' : 'zh';
                localStorage.setItem('soulstone-lang', currentLang);
                this.updateLanguage();
            });
        }

        // 初始套用語言
        this.updateLanguage();

        // 出現靈石 buttons
        document.querySelectorAll('.set-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mapId = e.currentTarget.dataset.map;
                this.handleSetSpawn(mapId);
            });
        });

        // 校正（收到提醒）buttons — 顯示確認視窗
        document.querySelectorAll('.interval-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mapId = e.currentTarget.dataset.map;
                this.handleSetIntervalSpawn(mapId);
            });
        });

        // 時間微調 buttons
        document.querySelectorAll('.btn-adjust').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mapId = e.currentTarget.dataset.map;
                const amount = parseInt(e.currentTarget.dataset.amount, 10);
                this.adjustTime(mapId, amount);
            });
        });

        // 已撿完 buttons
        document.querySelectorAll('.collected-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mapId = e.currentTarget.dataset.map;
                this.handleMarkCollected(mapId);
            });
        });
    }

    // ================================
    // 確認對話框處理
    // ================================

    handleSetIntervalSpawn(mapId) {
        const modal = document.getElementById('confirm-modal');
        const modalMessage = document.getElementById('modal-message');
        const modalSubMsg = document.getElementById('modal-submsg');
        const modalConfirm = document.getElementById('modal-confirm');
        const modalCancel = document.getElementById('modal-cancel');

        modalMessage.textContent = t('modalUpcomingTitle');
        modalSubMsg.innerHTML = t('modalUpcomingSub');

        modal.classList.add('active');

        const newConfirmBtn = modalConfirm.cloneNode(true);
        const newCancelBtn = modalCancel.cloneNode(true);
        modalConfirm.parentNode.replaceChild(newConfirmBtn, modalConfirm);
        modalCancel.parentNode.replaceChild(newCancelBtn, modalCancel);
        
        newConfirmBtn.textContent = t('modalConfirm');
        newCancelBtn.textContent = t('modalCancel');

        newConfirmBtn.addEventListener('click', () => {
            modal.classList.remove('active');
            this.setNextIntervalTime(mapId);
        });

        newCancelBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        const bgClose = (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                modal.removeEventListener('click', bgClose);
            }
        };
        modal.addEventListener('click', bgClose);
    }

    handleSetSpawn(mapId) {
        const modal = document.getElementById('confirm-modal');
        const modalMessage = document.getElementById('modal-message');
        const modalSubMsg = document.getElementById('modal-submsg');
        const modalConfirm = document.getElementById('modal-confirm');
        const modalCancel = document.getElementById('modal-cancel');

        // 計算按下時的基準時間與下輪預計時間 (140分後)
        const now = this.getCurrentServerTime();
        const nextSpawnTime = new Date(now.getTime() + CONFIG.DEFAULT_INTERVAL);
        const baseTimeStr = `${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
        const nextTimeStr = `${nextSpawnTime.getHours().toString().padStart(2,'0')}:${nextSpawnTime.getMinutes().toString().padStart(2,'0')}`;

        modalMessage.textContent = t('modalSpawnedTitle');
        modalSubMsg.innerHTML = t('modalSpawnedSub', baseTimeStr, nextTimeStr);

        // 顯示 modal
        modal.classList.add('active');

        const newConfirmBtn = modalConfirm.cloneNode(true);
        const newCancelBtn = modalCancel.cloneNode(true);
        modalConfirm.parentNode.replaceChild(newConfirmBtn, modalConfirm);
        modalCancel.parentNode.replaceChild(newCancelBtn, modalCancel);

        newConfirmBtn.addEventListener('click', () => {
            modal.classList.remove('active');
            this.setSpawnTime(mapId);
        });

        // 取消按鈕
        newCancelBtn.addEventListener('click', () => {
            modal.classList.remove('active');
        });

        // 點擊背景也關閉
        const bgClose = (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
                modal.removeEventListener('click', bgClose);
            }
        };
        modal.addEventListener('click', bgClose);
    }

    handleMarkCollected(mapId) {
        const state = this.state[mapId];

        // 檢查是否已使用
        if (state.collectedUsed) {
            this.showToast('這輪已使用過「已撿完」功能');
            return;
        }

        // 檢查是否有對時器
        if (!state.nextSpawn) {
            this.showToast('請先按「已出現靈石」設定時間');
            return;
        }

        // 執行已撿完
        const success = this.markCollected(mapId);
        if (success) {
            this.showToast('已記錄撿完，下次出現時間縮短20分鐘');
        }
    }

    showToast(message) {
        // 建立 toast 元素
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        document.body.appendChild(toast);

        // 顯示動畫
        requestAnimationFrame(() => {
            toast.classList.add('active');
        });

        // 3秒後移除
        setTimeout(() => {
            toast.classList.remove('active');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ================================
    // Notifications (保留原有功能)
    // ================================

    checkNotificationPermission() {
        if (!('Notification' in window)) {
            console.log('This browser does not support notifications');
            return;
        }
    }

    async requestNotificationPermission() {
        if (!('Notification' in window)) return;

        try {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                this.showNotification('靈石追蹤器', '🔔 通知已開啟！當靈石快出現時，我會提醒你。');
            }
        } catch (error) {
            console.error('Error requesting notification permission:', error);
        }
    }

    showNotification(title, body) {
        if (Notification.permission !== 'granted') return;

        try {
            const notification = new Notification(title, {
                body,
                icon: '💎',
                badge: '💎',
                tag: title
            });

            setTimeout(() => notification.close(), 10000);
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
        } catch (error) {
            console.error('Error showing notification:', error);
        }
    }
}

// ================================
// Initialize App
// ================================

document.addEventListener('DOMContentLoaded', () => {
    window.soulstoneTracker = new SoulstoneTracker();
});
