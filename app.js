/**
 * 劍靈：革命 靈石追蹤器
 * Soulstone Tracker for Blade & Soul Revolution
 */

// ==============================================================================
// 靈石重生時間核心邏輯 (Core Spawn Logic) - 終極實機確認版
// ==============================================================================
// [基本參數]
// 1. 靈石出現後，會存在 20 分鐘 (DESPAWN_WINDOW)。
// 2. 全部預設都以「撿完」為基準，從「出生」到「下次出生」的完整大循環改為 **120 分鐘** (DEFAULT_INTERVAL)。
//    => 所以靈石自然消失後，畫面的倒數計時會從 **100 分鐘** 開始倒數！
//       (20分存在 + 100分等待 = 120 分鐘)
// ==============================================================================

// ================================
// Configuration
// ================================

const CONFIG = {
    // Default spawn interval: 160 min (20m alive + 140m wait)
    DEFAULT_INTERVAL: 160 * 60 * 1000,
    // When collected: 120 min
    COLLECTED_INTERVAL: 120 * 60 * 1000,
    // Warning time: 5 minutes before spawn
    WARNING_BEFORE: 5 * 60 * 1000,
    // Danger time: 1 minute before spawn
    DANGER_BEFORE: 1 * 60 * 1000,
    // Supabase config (loaded from Cloudflare Pages via window.APP_CONFIG)
    SUPABASE_URL: window.APP_CONFIG?.SUPABASE_URL || '',
    SUPABASE_KEY: window.APP_CONFIG?.SUPABASE_KEY || '',
    // Despawn window: 20 minutes after spawn
    DESPAWN_WINDOW: 20 * 60 * 1000,
    // Map definitions (4 maps × 2 channels = 8 entries)
    MAPS: [
        // Top row: Ch.1
        { id: 'spirit-stone-valley-ch1', name: '靈石谷', channel: 1, icon: '🏔️' },
        { id: 'yu-hwang-fortress-ch1',   name: '玉皇要塞', channel: 1, icon: '🏯' },
        { id: 'blood-ruffian-base-ch1',  name: '糾土地帶', channel: 1, icon: '🩸' },
        { id: 'red-dragon-forge-ch1',    name: '赤龍火山', channel: 1, icon: '🌋' },
        // Bottom row: Ch.2
        { id: 'spirit-stone-valley-ch2', name: '靈石谷', channel: 2, icon: '🏔️' },
        { id: 'yu-hwang-fortress-ch2',   name: '玉皇要塞', channel: 2, icon: '🏯' },
        { id: 'blood-ruffian-base-ch2',  name: '糾土地帶', channel: 2, icon: '🩸' },
        { id: 'red-dragon-forge-ch2',    name: '赤龍火山', channel: 2, icon: '🌋' }
    ]
};

// ================================
// State Management
// ================================

const I18N = {
    'zh': {
        'title': '靈石追蹤器',
        'subtitle': '劍靈：革命 · 及時掌握靈石動向',
        'despawning': '消失倒數',
        'statusUpcoming': '即將出現',
        'collected': '已撿完',
        'notCollected': '未撿完',
        'btnSpawned': '已出現靈石',
        'btnUpcoming': '即將出現靈石',
        'btnCollected': '已撿完',
        // maps
        'spirit-stone-valley-ch1': '靈石谷 Ch.1',
        'spirit-stone-valley-ch2': '靈石谷 Ch.2',
        'yu-hwang-fortress-ch1': '玉皇要塞 Ch.1',
        'yu-hwang-fortress-ch2': '玉皇要塞 Ch.2',
        'blood-ruffian-base-ch1': '糾土地帶 Ch.1',
        'blood-ruffian-base-ch2': '糾土地帶 Ch.2',
        'red-dragon-forge-ch1': '赤龍火山 Ch.1',
        'red-dragon-forge-ch2': '赤龍火山 Ch.2',
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
        'nextSpawn': 'Est. Next Spawn',
        'nextWave': 'Next Wave at',
        'remaining': 'Spawns in',
        'pending': 'Pending',
        'active': 'Currently Active',
        'spawning': 'Currently Active',
        'despawning': 'Despawns in',
        'statusUpcoming': 'Upcoming',
        'collected': 'Collected',
        'notCollected': 'Not Collected',
        'btnSpawned': 'Spawned',
        'btnUpcoming': 'Upcoming',
        'btnCollected': 'Collected',
        // maps
        'spirit-stone-valley-ch1': 'Spirit Stone Valley Ch.1',
        'spirit-stone-valley-ch2': 'Spirit Stone Valley Ch.2',
        'yu-hwang-fortress-ch1': 'Yu Hwang Fortress Ch.1',
        'yu-hwang-fortress-ch2': 'Yu Hwang Fortress Ch.2',
        'blood-ruffian-base-ch1': 'Blood Ruffian Base Ch.1',
        'blood-ruffian-base-ch2': 'Blood Ruffian Base Ch.2',
        'red-dragon-forge-ch1': 'Red Dragon Forge Ch.1',
        'red-dragon-forge-ch2': 'Red Dragon Forge Ch.2',
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

        // Audio Context unlocker for Autoplay policies
        this.audioCtx = null;
        this.hasInteracted = false;
        
        const unlockAudio = () => {
            if (this.hasInteracted) return;
            this.hasInteracted = true;
            try {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) {
                    this.audioCtx = new AudioContext();
                    if (this.audioCtx.state === 'suspended') {
                        this.audioCtx.resume();
                    }
                }
            } catch (e) {}
            
            document.removeEventListener('click', unlockAudio);
            document.removeEventListener('keydown', unlockAudio);
            document.removeEventListener('touchstart', unlockAudio);
        };
        
        document.addEventListener('click', unlockAudio);
        document.addEventListener('keydown', unlockAudio);
        document.addEventListener('touchstart', unlockAudio);

        this.init();
    }

    async init() {
        // Initialize maps state
        CONFIG.MAPS.forEach(map => {
            this.state[map.id] = {
                nextSpawn: null,
                lastUpdated: null,
                collectedUsed: false,
                baseTime: null    // 靈石真正出現的時間（用於消失倒數，不受微調影響）
            };
        });

        // Generate cards dynamically from CONFIG
        this.generateCards();

        // Try to initialize Supabase
        this.initSupabase();

        // Setup event listeners
        this.setupEventListeners();

        // Start update loop
        this.startUpdateLoop();

        // Check notification permission
        this.checkNotificationPermission();
    }

    /**
     * 從 CONFIG.MAPS 動態產生卡片
     */
    generateCards() {
        const grid = document.querySelector('.maps-grid');
        if (!grid) return;
        grid.innerHTML = '';

        CONFIG.MAPS.forEach(map => {
            const chLabel = map.channel ? ` Ch.${map.channel}` : '';
            const card = document.createElement('div');
            card.className = 'map-card';
            card.id = `card-${map.id}`;
            card.dataset.map = map.id;
            card.innerHTML = `
                <div class="card-header">
                    <div class="map-icon">${map.icon}</div>
                    <div class="map-info">
                        <h2 class="map-name" data-i18n="${map.id}">${map.name}${chLabel}</h2>
                        <span class="map-status" id="status-${map.id}" data-i18n="statusWaiting">等待設定</span>
                    </div>
                </div>
                <div class="timer-display" id="timer-${map.id}">
                    <div class="timer-row">
                        <span class="timer-label" data-i18n="nextSpawn">下次出現</span>
                        <div class="timer-value-container">
                            <span class="timer-value" id="next-${map.id}">--:--:--</span>
                            <div class="adjust-btns">
                                <button class="btn-adjust" data-action="adjust" data-amount="-10" data-map="${map.id}">-10</button>
                                <button class="btn-adjust" data-action="adjust" data-amount="-1" data-map="${map.id}">-1</button>
                                <button class="btn-adjust" data-action="adjust" data-amount="1" data-map="${map.id}">+1</button>
                                <button class="btn-adjust" data-action="adjust" data-amount="10" data-map="${map.id}">+10</button>
                            </div>
                        </div>
                    </div>
                    <div class="timer-row">
                        <span class="timer-label" id="timer-label-${map.id}" data-i18n="remaining">剩餘</span>
                        <span class="timer-countdown" id="countdown-${map.id}">--:--:--</span>
                    </div>
                </div>
                <div class="card-actions">
                    <div class="actions-top">
                        <button class="btn btn-primary set-btn" data-action="set" data-map="${map.id}" data-i18n="btnSpawned">已出現靈石</button>
                        <button class="btn btn-info interval-btn" data-action="interval" data-map="${map.id}" data-i18n="btnUpcoming">即將出現靈石</button>
                    </div>
                    <div class="actions-bottom">
                        <button class="btn btn-success collected-btn" data-action="collected" data-map="${map.id}" data-i18n="btnCollected">已撿完</button>
                    </div>
                </div>
            `;
            grid.appendChild(card);
        });
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
     * 透過 Supabase RPC get_server_time() 取得資料庫的 NOW() 作為權威時間
     */
    async syncServerTime() {
        try {
            const start = Date.now();
            if (this.supabase) {
                const { data, error } = await this.supabase.rpc('get_server_time');
                if (!error && data && data.server_now) {
                    const serverTime = new Date(data.server_now).getTime();
                    const now = Date.now();
                    const rtt = now - start;
                    this.serverTimeOffset = (serverTime + rtt / 2) - now;
                    this.lastSyncTime = this.getCurrentServerTime();
                    console.log(`[ClockSync] 伺服器時間已同步 (Supabase RPC)。偏移: ${this.serverTimeOffset}ms, RTT: ${rtt}ms`);
                } else {
                    console.warn('[ClockSync] RPC get_server_time 失敗:', error);
                }
            } else {
                // Fallback: same-origin HEAD request
                const response = await fetch(window.location.origin, { method: 'HEAD', cache: 'no-store' });
                const serverDateStr = response.headers.get('Date');
                if (serverDateStr) {
                    const serverTime = new Date(serverDateStr).getTime();
                    const now = Date.now();
                    this.serverTimeOffset = (serverTime + (now - start) / 2) - now;
                    this.lastSyncTime = this.getCurrentServerTime();
                    console.log(`[ClockSync] 伺服器時間已同步 (Same-Origin)。偏移: ${this.serverTimeOffset}ms`);
                }
            }
        } catch (e) {
            console.warn('[ClockSync] 對時失敗，將沿用上次校準或本地時間。', e);
        }
        this.updateLastUpdated();
    }

    /**
     * 獲取校準後的伺服器時間（僅用於顯示倒數計時）
     */
    getCurrentServerTime() {
        return new Date(Date.now() + this.serverTimeOffset);
    }

    /**
     * 將 RPC 回傳的結果套用到本地狀態，並重新校準時鐘
     * @param {string} mapId - 地圖 ID
     * @param {object} result - RPC 回傳的 JSON
     * @param {number} requestStart - 請求開始的 Date.now()
     */
    applyRpcResult(mapId, result, requestStart) {
        if (!result) return;

        // 校準時鐘：用 RPC 回傳的 server_now 更新偏移量
        if (result.server_now) {
            const serverTime = new Date(result.server_now).getTime();
            const now = Date.now();
            const rtt = now - requestStart;
            this.serverTimeOffset = (serverTime + rtt / 2) - now;
            this.lastSyncTime = this.getCurrentServerTime();
        }

        // 更新本地狀態
        if (this.state[mapId]) {
            this.state[mapId].nextSpawn = result.next_spawn ? new Date(result.next_spawn) : null;
            this.state[mapId].baseTime = result.base_time ? new Date(result.base_time) : null;
            this.state[mapId].collectedUsed = result.collected_used ?? false;
            this.state[mapId].lastUpdated = result.updated_at ? new Date(result.updated_at) : new Date();

            this.updateDisplay(mapId);
        }
        this.updateLastUpdated();
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
                    const rawPayload = payload.payload || payload;
                    const mapIdStr = rawPayload.mapId;
                    if (mapIdStr && mapIdStr.startsWith(`${currentServer}_`)) {
                        const localMapId = mapIdStr.replace(`${currentServer}_`, '');
                        if (this.state[localMapId] && rawPayload.data) {
                            this.state[localMapId].nextSpawn = rawPayload.data.nextSpawn ? new Date(rawPayload.data.nextSpawn) : null;
                            this.state[localMapId].lastUpdated = rawPayload.data.lastUpdated ? new Date(rawPayload.data.lastUpdated) : null;
                            this.state[localMapId].collectedUsed = rawPayload.data.collectedUsed ?? false;
                            this.state[localMapId].baseTime = rawPayload.data.baseTime ? new Date(rawPayload.data.baseTime) : null;
                            this.updateDisplay(localMapId);
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
                        this.state[localMapId].lastUpdated = new Date(row.updated_at);
                        this.state[localMapId].collectedUsed = row.collected_used ?? false;
                        this.state[localMapId].baseTime = row.base_time ? new Date(row.base_time) : null;
                    }
                });

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
                console.log(`[RealtimeSync] 收到資料庫更新 (${localMapId})，同步中...`);
                this.state[localMapId].nextSpawn = newRecord.next_spawn ? new Date(newRecord.next_spawn) : null;
                this.state[localMapId].lastUpdated = new Date(newRecord.updated_at);
                this.state[localMapId].collectedUsed = newRecord.collected_used ?? false;
                this.state[localMapId].baseTime = newRecord.base_time ? new Date(newRecord.base_time) : null;
                
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
            collected_used: this.state[mapId].collectedUsed,
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
                            lastUpdated: this.state[mapId].lastUpdated?.toISOString(),
                            collectedUsed: this.state[mapId].collectedUsed,
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

    /**
     * 微調時間：呼叫伺服器端 RPC，在資料庫上直接對 next_spawn 加減
     */
    async adjustTime(mapId, minutesToAdd) {
        const state = this.state[mapId];
        if (!state.nextSpawn) {
            this.showToast('尚未設定時間，無法微調');
            return;
        }

        if (!this.supabase) {
            // Fallback: 本地計算
            state.nextSpawn = new Date(state.nextSpawn.getTime() + minutesToAdd * 60 * 1000);
            if (state.cycleEndTime) state.cycleEndTime = new Date(state.cycleEndTime.getTime() + minutesToAdd * 60 * 1000);
            this.saveToLocalStorage();
            this.updateDisplay(mapId);
            this.showToast(t('toastAdjusted'));
            return;
        }

        const serverMapId = `${currentServer}_${mapId}`;
        const start = Date.now();
        try {
            const { data, error } = await this.supabase.rpc('adjust_spawn_time', {
                p_map_id: serverMapId,
                p_minutes: minutesToAdd
            });
            if (error) throw error;
            this.applyRpcResult(mapId, data, start);
            console.log(`[RPC] adjust_spawn_time(${mapId}, ${minutesToAdd}) 成功`);
        } catch (e) {
            console.error('[RPC] adjust_spawn_time 失敗:', e);
            // Fallback
            state.nextSpawn = new Date(state.nextSpawn.getTime() + minutesToAdd * 60 * 1000);
            this.saveToSupabase(mapId, true);
            this.updateDisplay(mapId);
        }
        this.showToast(t('toastAdjusted'));
    }

    /**
     * 設定出現靈石：呼叫伺服器端 RPC，使用資料庫的 NOW()
     * 完全不依賴客戶端時鐘
     */
    async setSpawnTime(mapId) {
        if (!this.supabase) {
            const now = new Date();
            this.state[mapId].nextSpawn = now;
            this.state[mapId].cycleEndTime = new Date(now.getTime() + CONFIG.DEFAULT_INTERVAL);
            this.state[mapId].collectedUsed = false;
            this.saveToLocalStorage();
            this.updateDisplay(mapId);
            return;
        }

        const serverMapId = `${currentServer}_${mapId}`;
        const start = Date.now();
        try {
            const { data, error } = await this.supabase.rpc('set_spawn_now', {
                p_map_id: serverMapId
            });
            if (error) throw error;
            this.applyRpcResult(mapId, data, start);
            console.log(`[RPC] set_spawn_now(${mapId}) 成功: next_spawn=${data.next_spawn}`);
        } catch (e) {
            console.error('[RPC] set_spawn_now 失敗:', e);
            // Fallback
            const now = this.getCurrentServerTime();
            this.state[mapId].nextSpawn = now;
            this.state[mapId].cycleEndTime = new Date(now.getTime() + CONFIG.DEFAULT_INTERVAL);
            this.state[mapId].collectedUsed = false;
            this.saveToSupabase(mapId, true);
            this.updateDisplay(mapId);
        }
    }

    /**
     * 已撿完：呼叫伺服器端 RPC，用資料庫的 NOW() 判斷 remaining
     */
    async markCollected(mapId) {
        const mapState = this.state[mapId];

        const now = this.getCurrentServerTime();
        let currentNextSpawn = mapState.nextSpawn ? mapState.nextSpawn.getTime() : 0;
        
        if (!currentNextSpawn) return false;

        // 計算目前實際位於哪個循環
        while (currentNextSpawn + CONFIG.DESPAWN_WINDOW <= now.getTime()) {
            currentNextSpawn += CONFIG.DEFAULT_INTERVAL; // 140m
        }
        
        const isCurrentCycleCollected = (currentNextSpawn === mapState.nextSpawn.getTime()) ? mapState.collectedUsed : false;

        if (isCurrentCycleCollected) {
            this.showToast('這輪已使用過「已撿完」');
            return false;
        }

        // 依照使用者指示：「最後一顆石頭被手動撿完，此時你在網頁按下已撿完，下次出現是當前時間 + 120分鐘」
        // 不再拘泥於原本的循環，直接以「按下按鈕的瞬間 (ToD)」起算 120 分鐘作為下次出現時間
        let newTargetTime = now.getTime() + 120 * 60 * 1000;

        if (!this.supabase) {
            // Fallback: 本地計算
            mapState.collectedUsed = true;
            mapState.nextSpawn = new Date(newTargetTime);
            mapState.cycleEndTime = mapState.nextSpawn;
            this.saveToLocalStorage();
            this.updateDisplay(mapId);
            this.showToast(t('toastCollected'));
            return true;
        }

        const serverMapId = `${currentServer}_${mapId}`;
        const start = Date.now();
        try {
            // 使用直接 table update 來迴避有 bug 的 RPC func
            const { data, error } = await this.supabase
                .from('soulstone_timers')
                .update({ 
                    next_spawn: new Date(newTargetTime).toISOString(), 
                    collected_used: true, 
                    updated_at: new Date().toISOString()
                })
                .eq('map_id', serverMapId)
                .select()
                .single();

            if (error) throw error;

            this.applyRpcResult(mapId, {
                next_spawn: data.next_spawn,
                collected_used: data.collected_used,
                server_now: new Date().toISOString()
            }, start);

            this.showToast(t('toastCollected'));
            console.log(`[DB] 已撿完更新成功(${mapId}): new_next_spawn=${data.next_spawn}`);
            return true;
        } catch (e) {
            console.error('[RPC] mark_collected_fn 失敗:', e);
            return false;
        }
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
     * 即將出現靈石：呼叫伺服器端 RPC，用資料庫的 NOW() + 10 minutes
     */
    async setNextIntervalTime(mapId) {
        if (!this.supabase) {
            const now = new Date();
            const finalSpawn = new Date(now.getTime() + 10 * 60 * 1000);
            this.state[mapId].nextSpawn = finalSpawn;
            this.state[mapId].cycleEndTime = finalSpawn;
            this.state[mapId].collectedUsed = false;
            this.saveToLocalStorage();
            this.updateDisplay(mapId);
            return;
        }

        const serverMapId = `${currentServer}_${mapId}`;
        const start = Date.now();
        try {
            const { data, error } = await this.supabase.rpc('set_spawn_upcoming', {
                p_map_id: serverMapId
            });
            if (error) throw error;
            this.applyRpcResult(mapId, data, start);
            console.log(`[RPC] set_spawn_upcoming(${mapId}) 成功: next_spawn=${data.next_spawn}`);

            const spawnDate = new Date(data.next_spawn);
            const h = spawnDate.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false, hour: '2-digit', minute: '2-digit' });
            this.showToast(`${t('toastReset')} ${h}`);
        } catch (e) {
            console.error('[RPC] set_spawn_upcoming 失敗:', e);
            const now = this.getCurrentServerTime();
            this.state[mapId].nextSpawn = new Date(now.getTime() + 10 * 60 * 1000);
            this.state[mapId].collectedUsed = false;
            this.saveToSupabase(mapId, true);
            this.updateDisplay(mapId);
        }
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

    /**
     * ====================================================================
     * updateDisplay - 核心顯示邏輯（v3 完全重寫）
     * 
     * 設計原則：
     * 1. 此函數「只讀不寫」— 永遠不修改 state 或寫入 DB
     * 2. 自動推進透過純計算處理，不觸發任何副作用
     * 3. 微調按鈕永遠不會意外觸發循環推進
     * 
     * 三個顯示階段：
     * Phase 1 (remaining > 0): 等待出現 → 顯示倒數
     * Phase 2 (0 < spawnAge < 20min): 靈石已出現 → 消失倒數
     * Phase 3 (spawnAge >= 20min): 已消失 → 計算下一輪倒數（純顯示）
     * ====================================================================
     */
    updateDisplay(mapId) {
        const state = this.state[mapId];
        const now = this.getCurrentServerTime();

        const nextEl = document.getElementById(`next-${mapId}`);
        const countdownEl = document.getElementById(`countdown-${mapId}`);
        const statusEl = document.getElementById(`status-${mapId}`);
        const cardEl = document.getElementById(`card-${mapId}`);
        if (!cardEl) return;
        const collectedBtn = cardEl.querySelector('.collected-btn');
        const timerLabel = document.getElementById(`timer-label-${mapId}`);

        // --- 無資料：等待設定 ---
        if (!state.nextSpawn) {
            nextEl.closest('.timer-row').querySelector('.timer-label').textContent = t('nextSpawn');
            nextEl.textContent = '--:--:--';
            countdownEl.textContent = '--:--:--';
            statusEl.textContent = t('statusWaiting');
            statusEl.className = 'map-status';
            cardEl.classList.remove('urgent', 'soon');
            this.updateCollectedBtnState(collectedBtn, state, false);
            return;
        }

        const DESPAWN = CONFIG.DESPAWN_WINDOW;
        const CYCLE = CONFIG.DEFAULT_INTERVAL;

        let currentNextSpawn = state.nextSpawn.getTime();

        // 無縫將時間推進到「與目前時間相關」的這一個循環
        while (currentNextSpawn + DESPAWN <= now.getTime()) {
            currentNextSpawn += CYCLE;
        }

        const remaining = currentNextSpawn - now.getTime();
        const spawnAge = -remaining; // 正數代表已經過了出現時間多久
        const isCurrentCycleCollected = (currentNextSpawn === state.nextSpawn.getTime()) ? state.collectedUsed : false;

        // === Phase 1: 等待出現 (remaining > 0) ===
        if (remaining > 0) {
            nextEl.closest('.timer-row').querySelector('.timer-label').textContent = t('nextSpawn');
            nextEl.textContent = this.formatTime(new Date(currentNextSpawn));
            if (timerLabel) timerLabel.textContent = t('remaining');
            countdownEl.textContent = this.formatDuration(remaining);

            // 警報
            if (remaining <= CONFIG.WARNING_BEFORE) {
                if (!this.alarmState[mapId]) {
                    this.alarmState[mapId] = true;
                    this.playAlarm();
                }
                statusEl.textContent = t('statusUpcoming');
                statusEl.className = 'map-status danger';
                cardEl.classList.add('soon');
                cardEl.classList.remove('urgent');
                countdownEl.className = remaining <= CONFIG.DANGER_BEFORE
                    ? 'timer-countdown danger'
                    : 'timer-countdown warning';
            } else {
                this.alarmState[mapId] = false;
                statusEl.textContent = isCurrentCycleCollected ? t('collected') : t('notCollected');
                statusEl.className = isCurrentCycleCollected ? 'map-status active' : 'map-status warning';
                cardEl.classList.remove('urgent', 'soon');
                countdownEl.className = 'timer-countdown';
            }

            this.updateCollectedBtnState(collectedBtn, state, true, isCurrentCycleCollected);
            return;
        }

        // === Phase 2: 靈石已出現，消失倒數 (0 <= spawnAge < 20min) ===
        if (spawnAge < DESPAWN) {
            const despawnRemaining = DESPAWN - spawnAge;
            const nextCycleTime = new Date(currentNextSpawn + CYCLE);

            nextEl.closest('.timer-row').querySelector('.timer-label').textContent = t('nextWave');
            nextEl.textContent = this.formatTime(nextCycleTime);
            if (timerLabel) timerLabel.textContent = t('despawning');
            countdownEl.textContent = this.formatDuration(despawnRemaining);
            countdownEl.className = 'timer-countdown danger';
            statusEl.textContent = t('spawning');
            statusEl.className = 'map-status danger blinking-text';
            cardEl.classList.add('urgent');
            cardEl.classList.remove('soon');

            this.updateCollectedBtnState(collectedBtn, state, true, isCurrentCycleCollected);
            return;
        }
    }

    updateCollectedBtnState(btn, state, hasTimer, isCollected = false) {
        if (!hasTimer || !state.nextSpawn) {
            btn.classList.remove('used', 'disabled');
            btn.disabled = false;
            btn.textContent = t('btnCollected');
            return;
        }

        if (isCollected) {
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
        return date.toLocaleTimeString('zh-TW', {
            timeZone: 'Asia/Taipei',
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
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
        if (!this.alarmEnabled || !this.hasInteracted || !this.audioCtx) return;

        try {
            const ctx = this.audioCtx;
            if (ctx.state === 'suspended') return; // Do not attempt to play if suspended
            
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
            // fail silently for audio errors
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
        // 直接執行，移除再次確認對話框
        this.setSpawnTime(mapId);
    }

    handleMarkCollected(mapId) {
        const state = this.state[mapId];

        if (state.collectedUsed) {
            // 不再跳出題視窗
            return;
        }

        if (!state.nextSpawn) {
            return;
        }

        // 直接執行已撿完，不顯示任何提示視窗
        this.markCollected(mapId);
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
