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

// Determine Server / Mode from Path (allow asia1, ct1, and blood)
const ALLOWED_SERVERS = ['asia1', 'ct1', 'blood'];

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
const isBloodMode = currentServer === 'blood';
const currentServerLabel = currentServer === 'ct1' ? 'CT 1' : (isBloodMode ? '血風高原' : 'Asia 1');

const CONFIG = {
    // Default spawn interval: Soulstone = 140m (20m alive + 120m wait), Blood Boss = 200m (20m alive + 180m wait)
    DEFAULT_INTERVAL: (isBloodMode ? 200 : 140) * 60 * 1000,
    // When collected / boss killed: Soulstone = 120 min, Blood Boss = 180 min (3 hours)
    COLLECTED_INTERVAL: (isBloodMode ? 180 : 120) * 60 * 1000,
    // Warning time: 10 minutes before spawn (UI color change)
    WARNING_BEFORE: 10 * 60 * 1000,
    // Danger time: 1 minute before spawn (UI color change)
    DANGER_BEFORE: 1 * 60 * 1000,
    // Default alarm time before spawn (user-customizable, stored in localStorage)
    ALARM_BEFORE_OPTIONS: [1, 3, 5], // available options in minutes
    get ALARM_BEFORE() {
        const saved = parseInt(localStorage.getItem('soulstone-alarm-minutes'), 10);
        return (saved && CONFIG.ALARM_BEFORE_OPTIONS.includes(saved) ? saved : 3) * 60 * 1000;
    },
    // Supabase config (loaded from Cloudflare Pages via window.APP_CONFIG)
    SUPABASE_URL: window.APP_CONFIG?.SUPABASE_URL || '',
    SUPABASE_KEY: window.APP_CONFIG?.SUPABASE_KEY || '',
    // Despawn window: 20 minutes after spawn
    DESPAWN_WINDOW: 20 * 60 * 1000,
    // Map definitions
    MAPS: isBloodMode ? [
        // 左側：血風高原 (5分流)
        { id: 'bloodwind-ch1', dbId: 'blood_bloodwind-ch1', server: 'blood', board: 'highland', name: '血風高原', region: 'highland', channel: 1, icon: '👹' },
        { id: 'bloodwind-ch2', dbId: 'blood_bloodwind-ch2', server: 'blood', board: 'highland', name: '血風高原', region: 'highland', channel: 2, icon: '👹' },
        { id: 'bloodwind-ch3', dbId: 'blood_bloodwind-ch3', server: 'blood', board: 'highland', name: '血風高原', region: 'highland', channel: 3, icon: '👹' },
        { id: 'bloodwind-ch4', dbId: 'blood_bloodwind-ch4', server: 'blood', board: 'highland', name: '血風高原', region: 'highland', channel: 4, icon: '👹' },
        { id: 'bloodwind-ch5', dbId: 'blood_bloodwind-ch5', server: 'blood', board: 'highland', name: '血風高原', region: 'highland', channel: 5, icon: '👹' },
        // 右側：血風平原 繁體1 (2分流)
        { id: 'bloodplain-ch1', dbId: 'ct1_bloodplain-ch1', server: 'ct1', board: 'plain-tw', name: '血風平原', region: 'plain', channel: 1, icon: '⚔️' },
        { id: 'bloodplain-ch2', dbId: 'ct1_bloodplain-ch2', server: 'ct1', board: 'plain-tw', name: '血風平原', region: 'plain', channel: 2, icon: '⚔️' },
        // 右側：血風平原 ASIA1 (2分流)
        { id: 'bloodplain-ch1-asia', dbId: 'asia1_bloodplain-ch1', server: 'asia1', board: 'plain-asia', name: '血風平原', region: 'plain', channel: 1, icon: '⚔️' },
        { id: 'bloodplain-ch2-asia', dbId: 'asia1_bloodplain-ch2', server: 'asia1', board: 'plain-asia', name: '血風平原', region: 'plain', channel: 2, icon: '⚔️' }
    ] : [
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

// 停用狀態的設定列：存在 soulstone_timers，spawn_minutes 存放「被停用的分流編號」
// blood 模式完全不會使用 spawn_minutes 欄位，因此借用它來存停用清單（每個 board 一列）
const CHANNEL_SETTINGS_ROWS = {
    'highland': 'settings_blood_highland',
    'plain-tw': 'settings_blood_plain_tw',
    'plain-asia': 'settings_blood_plain_asia'
};

const I18N = {
    'zh': {
        'title': isBloodMode ? '血風高原 & 平原 BOSS 追蹤器' : '靈石追蹤器',
        'subtitle': isBloodMode ? '劍靈：革命 · 掌握血風高原(5分流)與血風平原(2分流) BOSS 重生動向' : '劍靈：革命 · 及時掌握靈石動向',
        'nextSpawn': '預計出現時間',
        'nextWave': '下波預計時間',
        'remaining': '距離出現還有',
        'pending': '等待出現中',
        'active': isBloodMode ? 'BOSS 出現中' : '靈石出現中',
        'spawning': isBloodMode ? 'BOSS 出現中' : '靈石出現中',
        'despawning': isBloodMode ? '出現狀態倒數' : '本波消失倒數',
        'statusUpcoming': '即將出現',
        'collected': isBloodMode ? 'BOSS 已死掉 (3小時倒數)' : '手動撿完靈石',
        'notCollected': isBloodMode ? '等待 BOSS 出現' : '靈石自動消失',
        'btnSpawned': isBloodMode ? 'BOSS 已出現' : '已出現靈石',
        'btnUpcoming': isBloodMode ? '即將出現 (10分)' : '即將出現靈石',
        'btnCollected': isBloodMode ? '已死掉 (重置3小時)' : '已撿完',
        'editTimeHint': '點擊手動編輯出現時間',
        'btnSaveTime': '儲存',
        'btnCancelEdit': '取消',
        'qkLabel': (n) => `血風${n}`,
        'qkStateWaiting': '等待設定',
        'qkStateWaitingBoss': '等待中',
        'qkStateUpcoming': '即將出現',
        'qkStateActive': '出現中',
        'qkStateDead': '已死掉',
        'qkHintLive': '點擊標記此分流 BOSS 已死掉（重置 3 小時）',
        'qkHintIdle': 'BOSS 尚未出現，點擊仍會重置 3 小時（請確認）',
        'qkHintDead': '此分流 BOSS 已死掉，無需重複點擊',
        'qkStateDisabled': '已停用',
        'qkHintDisabled': '此分流已停用，點擊不會更新時間',
        'btnDisableChannel': '停用',
        'btnEnableChannel': '啟用',
        'statusDisabled': '已停用',
        'toggleDisableHint': '停用後此分流固定排在最下面',
        'toggleEnableHint': '啟用後恢復依時間排序',
        'toggleSaveFailed': '停用狀態儲存失敗，請稍後再試一次',
        'bloodBannerTitle': '血風高原 BOSS (5分流)',
        'bloodBannerDesc': '死掉後 3 小時（180 分鐘）再次出現 · 即將出現預告 10 分鐘',
        'bloodPlainBannerTitle': '血風平原 BOSS (2分流)',
        'bloodPlainBannerDesc': '死掉後 3 小時（180 分鐘）再次出現 · 即將出現預告 10 分鐘',
        // maps
        'spirit-stone-valley-ch1': '靈石谷 Ch.1',
        'spirit-stone-valley-ch2': '靈石谷 Ch.2',
        'yu-hwang-fortress-ch1': '玉皇要塞 Ch.1',
        'yu-hwang-fortress-ch2': '玉皇要塞 Ch.2',
        'blood-ruffian-base-ch1': '糾土地帶 Ch.1',
        'blood-ruffian-base-ch2': '糾土地帶 Ch.2',
        'red-dragon-forge-ch1': '赤龍火山 Ch.1',
        'red-dragon-forge-ch2': '赤龍火山 Ch.2',
        'bloodwind-ch1': '血風高原',
        'bloodwind-ch2': '血風高原',
        'bloodwind-ch3': '血風高原',
        'bloodwind-ch4': '血風高原',
        'bloodwind-ch5': '血風高原',
        'bloodplain-ch1': '血風平原',
        'bloodplain-ch2': '血風平原',
        'bloodplain-ch1-asia': '血風平原',
        'bloodplain-ch2-asia': '血風平原',
        // toasts & modals
        'toastShorten': '✅ 採集完成！已縮短 20 分鐘',
        'toastCollected': isBloodMode ? '✅ 已紀錄擊殺！下輪出現時間：180 分鐘（3小時）後' : '✅ 採集完成！下輪出現時間：120 分鐘後',
        'toastAdjusted': '✅ 時間已微調',
        'toastReset': '🔔 校正完成：將出現在',
        // modal 1
        'modalSpawnedTitle': isBloodMode ? '確定 BOSS 已出現了嗎？' : '確定靈石已出現了嗎？',
        'modalSpawnedSub': (base, next) => `將從現在 <strong style="color:var(--accent-orange)">${base}</strong> 開始出現。<br>下輪出現時間設定為 <strong style="color:var(--accent-gold)">${next}</strong>。`,
        // modal 2
        'modalUpcomingTitle': '確定出現即將出現的預告再點此按鈕？',
        'modalUpcomingSub': '將自動設定為 **10分鐘後** 出現，並開始倒數計時。確認執行嗎？',
        // toggle
        'langToggle': 'English',
        'modalConfirm': '確定',
        'modalCancel': '取消',
        'statusWaiting': '等待設定',
        'globalStatusFormat': (active, warning) => `目前狀態：${active} 個已設定，${warning} 個即將出現`,
        'lastUpdated': '最後同步：',
        'alarmOn': '警報開啟',
        'alarmOff': '警報已關閉',
        'alarmSetting': (min) => `提前 ${min} 分鐘提醒`
    },
    'en': {
        'title': isBloodMode ? 'Bloodwind Boss Tracker' : 'Soulstone Tracker',
        'subtitle': isBloodMode ? 'B&S Revolution · Bloodwind Highland 5-Ch Boss Timer' : 'B&S Revolution · Realtime Tracker',
        'nextSpawn': 'Next Spawn',
        'nextWave': 'Next Wave',
        'remaining': 'Spawns In',
        'pending': 'Pending',
        'active': isBloodMode ? 'BOSS Active' : 'Active',
        'spawning': isBloodMode ? 'BOSS Active' : 'Active',
        'despawning': 'Despawns In',
        'statusUpcoming': 'Upcoming',
        'collected': isBloodMode ? 'Boss Killed (3h Timer)' : 'Manually Collected',
        'notCollected': isBloodMode ? 'Waiting for Boss' : 'Auto Despawned',
        'btnSpawned': isBloodMode ? 'Boss Spawned' : 'Spawned',
        'btnUpcoming': isBloodMode ? 'Upcoming (10m)' : 'Upcoming',
        'btnCollected': isBloodMode ? 'Boss Killed (3h)' : 'Collected',
        'editTimeHint': 'Click to edit spawn time',
        'btnSaveTime': 'Save',
        'btnCancelEdit': 'Cancel',
        'qkLabel': (n) => `BW${n}`,
        'qkStateWaiting': 'Pending',
        'qkStateWaitingBoss': 'Waiting',
        'qkStateUpcoming': 'Upcoming',
        'qkStateActive': 'Active',
        'qkStateDead': 'Dead',
        'qkHintLive': 'Click to mark this channel as killed (reset 3h)',
        'qkHintIdle': 'Boss has not spawned yet — clicking still resets 3h (please confirm)',
        'qkHintDead': 'This channel boss is already dead, no need to click again',
        'qkStateDisabled': 'Disabled',
        'qkHintDisabled': 'This channel is disabled - clicking will not update the time',
        'btnDisableChannel': 'Disable',
        'btnEnableChannel': 'Enable',
        'statusDisabled': 'Disabled',
        'toggleDisableHint': 'Disabled channels are pinned to the bottom',
        'toggleEnableHint': 'Enable to resume sorting by time',
        'toggleSaveFailed': 'Failed to save the disabled state, please try again',
        'bloodBannerTitle': 'Bloodwind Highland BOSS (5 Ch)',
        'bloodBannerDesc': 'Respawns 3 hours (180m) after death · 10m upcoming warning',
        'bloodPlainBannerTitle': 'Bloodwind Plain BOSS (2 Ch)',
        'bloodPlainBannerDesc': 'Respawns 3 hours (180m) after death · 10m upcoming warning',
        // maps
        'spirit-stone-valley-ch1': 'Spirit Stone Valley Ch.1',
        'spirit-stone-valley-ch2': 'Spirit Stone Valley Ch.2',
        'yu-hwang-fortress-ch1': 'Yu Hwang Fortress Ch.1',
        'yu-hwang-fortress-ch2': 'Yu Hwang Fortress Ch.2',
        'blood-ruffian-base-ch1': 'Blood Ruffian Base Ch.1',
        'blood-ruffian-base-ch2': 'Blood Ruffian Base Ch.2',
        'red-dragon-forge-ch1': 'Red Dragon Forge Ch.1',
        'red-dragon-forge-ch2': 'Red Dragon Forge Ch.2',
        'bloodwind-ch1': 'Bloodwind Highland',
        'bloodwind-ch2': 'Bloodwind Highland',
        'bloodwind-ch3': 'Bloodwind Highland',
        'bloodwind-ch4': 'Bloodwind Highland',
        'bloodwind-ch5': 'Bloodwind Highland',
        'bloodplain-ch1': 'Bloodwind Plain',
        'bloodplain-ch2': 'Bloodwind Plain',
        'bloodplain-ch1-asia': 'Bloodwind Plain',
        'bloodplain-ch2-asia': 'Bloodwind Plain',
        // toasts & modals
        'toastShorten': '✅ Collected! Timer shortened by 20m',
        'toastCollected': isBloodMode ? '✅ Boss Killed! Next spawn in 180m (3h)' : '✅ Collected! Next spawn in 120m',
        'toastAdjusted': '✅ Time adjusted',
        'toastReset': '🔔 Calibrated! Next spawn at',
        // modal 1
        'modalSpawnedTitle': isBloodMode ? 'Confirm Boss spawned?' : 'Confirm Soulstone spawned?',
        'modalSpawnedSub': (base, next) => `Spawning starting from <strong style="color:var(--accent-orange)">${base}</strong>.<br>Next spawn scheduled for <strong style="color:var(--accent-gold)">${next}</strong>.`,
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
        'alarmOff': 'Alarm OFF',
        'alarmSetting': (min) => `Alert ${min}m before`
    }
};

let currentLang = localStorage.getItem('soulstone-lang') || 'zh';

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
        this.alarmMinutes = parseInt(localStorage.getItem('soulstone-alarm-minutes'), 10) || 3;
        this.alarmState = {}; // 紀錄「提前警報」已經響過的 mapId
        this.spawnAlarmState = {}; // 紀錄「已出現」音效已經響過的 mapId
        this.lastRemaining = {}; // 紀錄上一次的倒數時間，用來精準判斷跨越時間點
        this.serverTimeOffset = 0; // 伺服器與本地時間的毫秒差 (Supabase - Local)
        this.lastSyncTime = null;
        this.currentTimeZone = localStorage.getItem('soulstone-timezone') || 'Asia/Taipei';
        // 被停用的分流：board → Set(分流編號)
        this.disabledChannels = {};
        Object.keys(CHANNEL_SETTINGS_ROWS).forEach(board => this.disabledChannels[board] = new Set());

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

    /**
     * 本地 map id → 資料庫 map_id
     * 血風模式的平原分流分屬不同伺服器（繁體1 / ASIA1），前綴不同
     */
    getServerMapId(localMapId) {
        const map = CONFIG.MAPS.find(m => m.id === localMapId);
        return map && map.dbId ? map.dbId : `${currentServer}_${localMapId}`;
    }

    /**
     * 資料庫 map_id → 本地 map id（找不到回傳 null）
     */
    getLocalMapId(serverMapId) {
        const map = CONFIG.MAPS.find(m => m.dbId === serverMapId);
        if (map) return map.id;

        const prefix = `${currentServer}_`;
        return serverMapId.startsWith(prefix) ? serverMapId.slice(prefix.length) : null;
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

        if (isBloodMode) {
            document.body.classList.add('blood-mode');
            grid.classList.add('blood-grid');

            const logoIcon = document.querySelector('.logo-icon');
            if (logoIcon) logoIcon.textContent = '👹';

            // 左邊：血風高原 (5分流)
            const highlandBoard = document.createElement('div');
            highlandBoard.className = 'blood-hero-board highland-board';
            highlandBoard.innerHTML = `
                <div class="blood-hero-header">
                    <div class="blood-hero-icon">👹</div>
                    <div class="blood-hero-text">
                        <h2 class="blood-hero-title" data-i18n="bloodBannerTitle">血風高原 BOSS (5分流)</h2>
                        <p class="blood-hero-desc" data-i18n="bloodBannerDesc">死掉後 3 小時（180 分鐘）再次出現 · 即將出現預告 10 分鐘</p>
                    </div>
                </div>
                <div class="blood-quick-bar" id="highland-quick-bar"></div>
                <div class="blood-channels-container" id="highland-channels"></div>
            `;

            // 右邊：血風平原 — 繁體1 / ASIA1 各一份 (各 2分流)
            const plainBoards = document.createElement('div');
            plainBoards.className = 'plain-boards';

            const plainServers = [
                { id: 'plain-tw', containerId: 'plain-channels', tag: '繁體1', tagClass: 'server-tag-tw' },
                { id: 'plain-asia', containerId: 'plain-channels-asia', tag: 'ASIA1', tagClass: 'server-tag-asia' }
            ];

            plainServers.forEach(server => {
                const board = document.createElement('div');
                board.className = 'blood-hero-board plain-board';
                board.innerHTML = `
                    <div class="blood-hero-header">
                        <div class="blood-hero-icon plain-icon">⚔️</div>
                        <div class="blood-hero-text">
                            <h2 class="blood-hero-title" data-i18n="bloodPlainBannerTitle">血風平原 BOSS (2分流)</h2>
                            <p class="blood-hero-desc" data-i18n="bloodPlainBannerDesc">死掉後 3 小時（180 分鐘）再次出現 · 即將出現預告 10 分鐘</p>
                        </div>
                        <span class="server-tag ${server.tagClass}">${server.tag}</span>
                    </div>
                    <div class="blood-channels-container" id="${server.containerId}"></div>
                `;
                plainBoards.appendChild(board);
            });

            grid.appendChild(highlandBoard);
            grid.appendChild(plainBoards);

            const highlandContainer = highlandBoard.querySelector('#highland-channels');
            const plainContainer = plainBoards.querySelector('#plain-channels');
            const plainAsiaContainer = plainBoards.querySelector('#plain-channels-asia');

            // 血風高原快捷列：血風1~血風5 位置固定，不受下方卡片自動排序影響
            const quickBar = highlandBoard.querySelector('#highland-quick-bar');
            CONFIG.MAPS.filter(map => map.board === 'highland').forEach(map => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'quick-kill-btn qk-idle';
                btn.dataset.map = map.id;
                btn.dataset.channel = map.channel;
                btn.innerHTML = `
                    <span class="qk-name">${t('qkLabel', map.channel)}</span>
                    <span class="qk-state">${t('qkStateWaiting')}</span>
                `;
                quickBar.appendChild(btn);
            });

            CONFIG.MAPS.forEach(map => {
                const isPlain = map.region === 'plain';
                const card = document.createElement('div');
                card.className = `map-card blood-channel-card ${isPlain ? 'plain-channel-card' : 'highland-channel-card'}`;
                card.id = `card-${map.id}`;
                card.dataset.map = map.id;
                card.innerHTML = `
                    <div class="card-header">
                        <div class="header-left-group">
                            <div class="map-icon blood-ch-badge ${isPlain ? 'plain-badge' : ''}">Ch.${map.channel}</div>
                            <h2 class="map-name" data-i18n="${map.id}">${map.name}</h2>
                        </div>
                        <div class="header-right-group">
                            <span class="map-status" id="status-${map.id}" data-i18n="statusWaiting">等待設定</span>
                            <button type="button" class="channel-toggle-btn" data-map="${map.id}">停用</button>
                        </div>
                    </div>
                    <div class="timer-display" id="timer-${map.id}">
                        <div class="timer-row">
                            <span class="timer-label" data-i18n="nextSpawn">下次出現</span>
                            <div class="timer-value-container">
                                <span class="timer-value" id="next-${map.id}">--:--:--</span>
                                <div class="adjust-btns">
                                    <button class="btn-adjust" data-action="adjust" data-amount="-10" data-map="${map.id}">-10</button>
                                    <button class="btn-adjust" data-action="adjust" data-amount="10" data-map="${map.id}">+10</button>
                                    <button class="btn-adjust" data-action="adjust" data-amount="-1" data-map="${map.id}">-1</button>
                                    <button class="btn-adjust" data-action="adjust" data-amount="1" data-map="${map.id}">+1</button>
                                </div>
                                <div class="time-editor" hidden>
                                    <input type="datetime-local" step="1" class="time-editor-input" data-map="${map.id}">
                                    <button class="btn btn-primary btn-sm time-editor-save" data-map="${map.id}" data-i18n="btnSaveTime">儲存</button>
                                    <button class="btn btn-ghost btn-sm time-editor-cancel" data-map="${map.id}" data-i18n="btnCancelEdit">取消</button>
                                    <span class="time-editor-hint"></span>
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
                            <button class="btn btn-primary set-btn" data-action="set" data-map="${map.id}" data-i18n="btnSpawned">BOSS 已出現</button>
                            <button class="btn btn-info interval-btn" data-action="interval" data-map="${map.id}" data-i18n="btnUpcoming">即將出現 (10分)</button>
                        </div>
                        <div class="actions-bottom">
                            <button class="btn btn-success collected-btn" data-action="collected" data-map="${map.id}" data-i18n="btnCollected">已死掉 (重置3小時)</button>
                        </div>
                    </div>
                `;
                if (map.board === 'plain-asia') {
                    plainAsiaContainer.appendChild(card);
                } else if (map.board === 'plain-tw') {
                    plainContainer.appendChild(card);
                } else {
                    highlandContainer.appendChild(card);
                }
            });

            // 更新機制說明區塊為血風高原 & 血風平原 BOSS 專屬說明
            const expBox = document.querySelector('.explanation-box');
            if (expBox) {
                expBox.innerHTML = `
                    <h3 style="color: var(--accent-gold); margin-top: 0; margin-bottom: 1rem; font-size: 1.1rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 8px;">機制說明 / Mechanism Explanation (血風高原 & 血風平原 BOSS)</h3>
                    <div style="margin-bottom: 1.2rem;">
                        <div style="color: white; font-weight: bold; margin-bottom: 4px;">🇹🇼 [TW] 繁體中文</div>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li><strong>手動點擊「已死掉 (重置3小時)」：</strong>血風高原（左・5分流）或血風平原（右・2分流）BOSS 被擊殺後，點擊此按鈕會將該分流的下次出現時間設定為 <strong>當下時間的 180 分鐘（3小時）後</strong>。</li>
                            <li><strong>點擊「即將出現 (10分)」：</strong>當遊戲中跳出 BOSS 即將出現預告時點擊，系統會自動設定為 <strong>10 分鐘後</strong> 出現。</li>
                            <li><strong>時間微調 (+10, -10, +1, -1)：</strong>若晚了幾分鐘才按按鈕，可使用微調按鈕往前或往後修正，讓各分流的倒數完美貼近真實時間。</li>
                            <li><strong>停用 / 啟用：</strong>卡片右上角的「停用」可把目前沒在使用的分流（例如未開的 Ch.5）關閉，停用後該分流固定排在最下面、上方快捷按鈕也會變暗不可點；再按一次「啟用」即可恢復。設定會同步到資料庫，所有人看到的都一樣。</li>
                        </ul>
                    </div>
                    <div style="margin-bottom: 0;">
                        <div style="color: white; font-weight: bold; margin-bottom: 4px;">🇬🇧 [EN] English</div>
                        <ul style="margin: 0; padding-left: 20px;">
                            <li><strong>"Boss Killed (3h)" Button:</strong> When the Bloodwind Highland (Left, 5-Ch) or Bloodwind Plain (Right, 2-Ch) Boss dies, click this button to set the channel's next spawn to <strong>180 minutes (3 hours)</strong> from now.</li>
                            <li><strong>"Upcoming (10m)" Button:</strong> Click when the 10-minute warning icon appears in-game to set the countdown to <strong>10 minutes</strong>.</li>
                            <li><strong>Adjust Buttons (+10, -10, +1, -1):</strong> Use these to fine-tune each channel's spawn timer if recorded slightly late.</li>
                            <li><strong>Disable / Enable:</strong> The "停用" button on each card switches off an unused channel (e.g. Ch.5). Disabled channels are pinned to the bottom and their quick button turns grey and stops working. Click "啟用" to bring it back. The setting is stored in the database, so everyone sees the same state.</li>
                        </ul>
                    </div>
                `;
            }
            return;
        }

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
                                <button class="btn-adjust" data-action="adjust" data-amount="10" data-map="${map.id}">+10</button>
                                <button class="btn-adjust" data-action="adjust" data-amount="-1" data-map="${map.id}">-1</button>
                                <button class="btn-adjust" data-action="adjust" data-amount="1" data-map="${map.id}">+1</button>
                            </div>
                            <div class="time-editor" hidden>
                                <input type="datetime-local" step="1" class="time-editor-input" data-map="${map.id}">
                                <button class="btn btn-primary btn-sm time-editor-save" data-map="${map.id}" data-i18n="btnSaveTime">儲存</button>
                                <button class="btn btn-ghost btn-sm time-editor-cancel" data-map="${map.id}" data-i18n="btnCancelEdit">取消</button>
                                <span class="time-editor-hint"></span>
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
                    const localMapId = this.getLocalMapId(mapIdStr);
                    if (localMapId) {
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

            // 一次撈出本頁所有分流（含不同伺服器前綴）+ 停用狀態設定列
            const dbIds = CONFIG.MAPS.map(m => this.getServerMapId(m.id));
            const settingsIds = Object.values(CHANNEL_SETTINGS_ROWS);
            const { data, error } = await this.supabase
                .from('soulstone_timers')
                .select('*')
                .in('map_id', [...dbIds, ...settingsIds]);

            if (error) {
                console.error('Error fetching from Supabase:', error);
                return;
            }

            if (data && data.length > 0) {
                data.forEach(row => {
                    const settingsBoard = this.getSettingsBoard(row.map_id);
                    if (settingsBoard) {
                        this.applyDisabledChannelsFromRow(settingsBoard, row.spawn_minutes);
                        return;
                    }

                    const localMapId = this.getLocalMapId(row.map_id);
                    if (!localMapId) return;
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

            // 停用狀態設定列
            const settingsBoard = this.getSettingsBoard(serverMapId);
            if (settingsBoard) {
                console.log(`[RealtimeSync] 收到停用狀態更新 (${settingsBoard})，同步中...`);
                this.applyDisabledChannelsFromRow(settingsBoard, newRecord.spawn_minutes);
                this.updateAllDisplays();
                this.updateLastUpdated();
                return;
            }

            const localMapId = this.getLocalMapId(serverMapId);
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

        const serverMapId = this.getServerMapId(mapId);
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
                    const serverMapId = this.getServerMapId(map.id);
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
                const serverMapId = this.getServerMapId(map.id);
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
     * 這符合遊戲中靈石谷/要塞的循環規律
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
            return;
        }

        if (!this.supabase) {
            // Fallback: 本地計算
            state.nextSpawn = new Date(state.nextSpawn.getTime() + minutesToAdd * 60 * 1000);
            if (state.cycleEndTime) state.cycleEndTime = new Date(state.cycleEndTime.getTime() + minutesToAdd * 60 * 1000);
            this.saveToLocalStorage();
            this.updateDisplay(mapId);
        // No toast
            return;
        }

        const serverMapId = this.getServerMapId(mapId);
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
        // No toast
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

        const serverMapId = this.getServerMapId(mapId);
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
     * ================================
     * 手動編輯預計出現時間
     * ================================
     */

    /**
     * 取得資料庫（Supabase）目前的時間
     */
    async getDatabaseTime() {
        try {
            const { data, error } = await this.supabase.rpc('get_server_time');
            if (!error && data && data.server_now) return new Date(data.server_now);
        } catch (e) {
            console.warn('[ManualTime] 取不到資料庫時間，改用已校準的本地時間');
        }
        return this.getCurrentServerTime();
    }

    /**
     * 取得某時區在指定時刻的 UTC 偏移（毫秒）
     */
    getTimeZoneOffset(date, timeZone) {
        const parts = {};
        new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour12: false,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });

        const asUTC = Date.UTC(
            parseInt(parts.year, 10), parseInt(parts.month, 10) - 1, parseInt(parts.day, 10),
            parseInt(parts.hour, 10) % 24, parseInt(parts.minute, 10), parseInt(parts.second, 10)
        );
        return asUTC - date.getTime();
    }

    /**
     * 把 "YYYY-MM-DDTHH:MM:SS" 視為 timeZone 的當地時間，轉成 Date
     */
    parseLocalInput(value, timeZone) {
        const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(value || '');
        if (!m) return null;

        const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
        // 兩段式校正，避免夏令時間造成誤差
        let ts = wall - this.getTimeZoneOffset(new Date(wall), timeZone);
        ts = wall - this.getTimeZoneOffset(new Date(ts), timeZone);
        return new Date(ts);
    }

    /**
     * 把 Date 格式化成 timeZone 的 "YYYY-MM-DDTHH:MM:SS"
     */
    formatLocalInput(date, timeZone) {
        const parts = {};
        new Intl.DateTimeFormat('en-US', {
            timeZone,
            hour12: false,
            year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        }).formatToParts(date).forEach(p => { parts[p.type] = p.value; });

        const hour = parseInt(parts.hour, 10) % 24;
        return `${parts.year}-${parts.month}-${parts.day}T${String(hour).padStart(2, '0')}:${parts.minute}:${parts.second}`;
    }

    /**
     * 開啟時間編輯器
     */
    openTimeEditor(mapId) {
        const card = document.getElementById(`card-${mapId}`);
        if (!card) return;

        const editor = card.querySelector('.time-editor');
        const input = editor?.querySelector('.time-editor-input');
        const hint = editor?.querySelector('.time-editor-hint');
        if (!editor || !input) return;

        const state = this.state[mapId];
        input.value = this.formatLocalInput(state.nextSpawn || this.getCurrentServerTime(), this.currentTimeZone);
        if (hint) {
            hint.textContent = `時區 ${this.currentTimeZone} · 可直接輸入到秒`;
            hint.className = 'time-editor-hint';
        }

        editor.hidden = false;
        card.querySelector('.timer-value')?.setAttribute('hidden', '');
        card.querySelector('.adjust-btns')?.setAttribute('hidden', '');
        input.focus();
    }

    /**
     * 關閉時間編輯器
     */
    closeTimeEditor(mapId) {
        const card = document.getElementById(`card-${mapId}`);
        if (!card) return;

        const editor = card.querySelector('.time-editor');
        if (editor) editor.hidden = true;
        card.querySelector('.timer-value')?.removeAttribute('hidden');
        card.querySelector('.adjust-btns')?.removeAttribute('hidden');
    }

    /**
     * 儲存手動編輯的時間
     * 以資料庫時間為基準寫入，寫完再讀回該列比對，確保與資料庫一致
     */
    async saveManualTime(mapId) {
        const card = document.getElementById(`card-${mapId}`);
        const editor = card?.querySelector('.time-editor');
        const input = editor?.querySelector('.time-editor-input');
        const hint = editor?.querySelector('.time-editor-hint');
        if (!input || !input.value) return;

        const target = this.parseLocalInput(input.value, this.currentTimeZone);
        if (!target) {
            if (hint) {
                hint.textContent = '時間格式不正確';
                hint.className = 'time-editor-hint err';
            }
            return;
        }

        if (!this.supabase) {
            this.state[mapId].nextSpawn = target;
            this.state[mapId].collectedUsed = false;
            this.updateDisplay(mapId);
            this.closeTimeEditor(mapId);
            return;
        }

        const dbNow = await this.getDatabaseTime();
        const serverMapId = this.getServerMapId(mapId);

        // collected_used 代表「已擊殺、等待重生」。
        // 設定未來時間 → 保留原本狀態；設定過去時間 → BOSS 正在場上，重設為 false
        const collectedUsed = target.getTime() > dbNow.getTime()
            ? (this.state[mapId]?.collectedUsed ?? false)
            : false;

        const { error } = await this.supabase
            .from('soulstone_timers')
            .upsert({
                map_id: serverMapId,
                next_spawn: target.toISOString(),
                cycle_end_time: new Date(target.getTime() + CONFIG.DEFAULT_INTERVAL).toISOString(),
                collected_used: collectedUsed,
                updated_at: dbNow.toISOString()
            }, { onConflict: 'map_id' });

        if (error) {
            console.error('[ManualTime] 寫入失敗:', error);
            if (hint) {
                hint.textContent = `寫入失敗：${error.message}`;
                hint.className = 'time-editor-hint err';
            }
            return;
        }

        // 讀回資料庫的值做一致性驗證
        const { data: row, error: readError } = await this.supabase
            .from('soulstone_timers')
            .select('*')
            .eq('map_id', serverMapId)
            .single();

        if (readError || !row) {
            if (hint) {
                hint.textContent = '已寫入，但讀回驗證失敗';
                hint.className = 'time-editor-hint err';
            }
            return;
        }

        const stored = new Date(row.next_spawn).getTime();
        const delta = Math.abs(stored - target.getTime());
        const dbText = this.formatLocalInput(new Date(stored), this.currentTimeZone);

        console.log(`[ManualTime] ${serverMapId} 目標=${target.toISOString()} DB=${row.next_spawn} 差=${delta}ms`);

        this.state[mapId].nextSpawn = new Date(stored);
        this.state[mapId].lastUpdated = new Date(row.updated_at);
        this.state[mapId].collectedUsed = row.collected_used ?? false;
        this.state[mapId].cycleEndTime = row.cycle_end_time ? new Date(row.cycle_end_time) : null;
        this.updateDisplay(mapId);

        if (hint) {
            hint.textContent = `✓ DB 已同步 ${dbText}（誤差 ${(delta / 1000).toFixed(3)} 秒）`;
            hint.className = 'time-editor-hint ok';
        }
        setTimeout(() => this.closeTimeEditor(mapId), 2500);
    }

    /**
     * 已撿完 / BOSS 已死掉
     */
    async markCollected(mapId) {
        const mapState = this.state[mapId];

        const now = this.getCurrentServerTime();
        let currentNextSpawn = mapState.nextSpawn ? mapState.nextSpawn.getTime() : 0;
        
        if (!isBloodMode) {
            if (!currentNextSpawn) return false;

            // 計算目前實際位於哪個循環
            let advanced = false;
            while (currentNextSpawn + CONFIG.DESPAWN_WINDOW <= now.getTime()) {
                currentNextSpawn += CONFIG.DEFAULT_INTERVAL;
                advanced = true;
            }

            // 如果已經跨越到新的循環，重置已撿完標記
            if (advanced) {
                mapState.collectedUsed = false;
                mapState.nextSpawn = new Date(currentNextSpawn);
            }

            // 核心修正：若新一波靈石已出現，忽略並重置舊有的「已採集」標記，以順利執行本次「已撿完」動作
            if (mapState.nextSpawn && mapState.nextSpawn.getTime() <= now.getTime()) {
                mapState.collectedUsed = false;
            }
            
            if (mapState.collectedUsed) {
                return false;
            }
        }

        // 靈石：當前時間 + 120分鐘；血風高原 BOSS：死掉後 3 小時（當前時間 + 180分鐘）
        let newTargetTime = now.getTime() + CONFIG.COLLECTED_INTERVAL;

        if (!this.supabase) {
            // Fallback: 本地計算
            mapState.collectedUsed = true;
            mapState.nextSpawn = new Date(newTargetTime);
            mapState.cycleEndTime = mapState.nextSpawn;
            this.saveToLocalStorage();
            this.updateDisplay(mapId);
            return true;
        }

        const serverMapId = this.getServerMapId(mapId);
        const start = Date.now();
        try {
            // 使用 upsert 確保新分流 (如 blood_bloodwind-ch1~ch5) 尚未存在於資料表時也能自動新增並更新
            const { data, error } = await this.supabase
                .from('soulstone_timers')
                .upsert({ 
                    map_id: serverMapId,
                    next_spawn: new Date(newTargetTime).toISOString(), 
                    collected_used: true, 
                    updated_at: new Date().toISOString()
                }, { onConflict: 'map_id' })
                .select()
                .single();

            if (error) throw error;

            this.applyRpcResult(mapId, {
                next_spawn: data.next_spawn,
                collected_used: data.collected_used,
                server_now: new Date().toISOString()
            }, start);

            console.log(`[DB] 已撿完/擊殺更新成功(${mapId}): new_next_spawn=${data.next_spawn}`);
            return true;
        } catch (e) {
            console.error('[RPC] markCollected 失敗:', e);
            // Fallback: 本地與 saveToSupabase
            mapState.collectedUsed = true;
            mapState.nextSpawn = new Date(newTargetTime);
            mapState.cycleEndTime = mapState.nextSpawn;
            this.saveToSupabase(mapId, true);
            this.updateDisplay(mapId);
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

        const serverMapId = this.getServerMapId(mapId);
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
        // No toast
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
        CONFIG.MAPS.forEach(map => this.updateQuickButton(map.id));
        CONFIG.MAPS.forEach(map => this.updateChannelToggle(map.id));
        
        const activeCount = Object.values(this.state).filter(s => s.nextSpawn).length;
        const warningCount = Object.values(this.state).filter(s => s.nextSpawn && (s.nextSpawn.getTime() - this.getCurrentServerTime().getTime()) <= CONFIG.WARNING_BEFORE).length;
        const globalStatusEl = document.getElementById('global-status');
        if (globalStatusEl) {
            globalStatusEl.textContent = t('globalStatusFormat', activeCount, warningCount);
        }

        // 血風卡片依「出現時間」自動排序：最快出現的置頂
        this.sortBloodChannels();
    }

    /**
     * 更新血風高原快捷按鈕（血風1~血風5）的狀態與外觀
     *   - live：BOSS 即將出現或已出現 → 綠色，可點擊
     *   - dead：BOSS 已死掉、等待重生 → 變暗，不可重複點擊
     *   - idle：尚未接近出現時間 → 中性
     */
    updateQuickButton(mapId) {
        const btn = document.querySelector(`.quick-kill-btn[data-map="${mapId}"]`);
        if (!btn) return;

        const state = this.state[mapId];
        const stateEl = btn.querySelector('.qk-state');
        const nameEl = btn.querySelector('.qk-name');
        let kind = 'idle';
        let label = t('qkStateWaiting');
        let hint = t('qkHintIdle');

        if (nameEl) nameEl.textContent = t('qkLabel', btn.dataset.channel);

        if (this.isChannelDisabled(mapId)) {
            kind = 'off';
            label = t('qkStateDisabled');
            hint = t('qkHintDisabled');
        } else if (state && state.nextSpawn) {
            const now = this.getCurrentServerTime().getTime();
            let spawn = state.nextSpawn.getTime();
            while (spawn + CONFIG.DESPAWN_WINDOW <= now) spawn += CONFIG.DEFAULT_INTERVAL;
            const remaining = spawn - now;

            if (remaining <= 0) {
                kind = 'live';
                label = t('qkStateActive');
                hint = t('qkHintLive');
            } else if (remaining <= CONFIG.WARNING_BEFORE) {
                kind = 'live';
                label = t('qkStateUpcoming');
                hint = t('qkHintLive');
            } else if (state.collectedUsed) {
                kind = 'dead';
                label = t('qkStateDead');
                hint = t('qkHintDead');
            } else {
                kind = 'idle';
                label = t('qkStateWaitingBoss');
            }
        }

        btn.classList.remove('qk-idle', 'qk-live', 'qk-dead', 'qk-off');
        btn.classList.add(`qk-${kind}`);
        btn.title = hint;
        btn.setAttribute('aria-label', `${t('qkLabel', btn.dataset.channel)} - ${label}`);
        if (stateEl) stateEl.textContent = label;
    }

    /**
     * 依出現時間重新排列血風高原 / 血風平原的卡片
     *   - 已經出現中（20 分鐘存活窗內）的 BOSS 排最前面
     *   - 其餘依出現時間由近到遠，越慢的越往下
     *   - 尚未設定時間的排最後
     */
    sortBloodChannels() {
        if (!isBloodMode) return;

        document.querySelectorAll('.blood-channels-container').forEach(container => {
            const cards = Array.from(container.children);
            const sorted = cards.slice().sort((a, b) => {
                const keyA = this.getSpawnSortKey(a.dataset.map);
                const keyB = this.getSpawnSortKey(b.dataset.map);
                return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
            });

            // 順序沒變就不動 DOM，避免每秒重排造成畫面閃爍
            if (cards.every((card, index) => card === sorted[index])) return;

            sorted.forEach(card => container.appendChild(card));
        });
    }

    // ================================
    // 分流停用 / 啟用
    // ================================

    /**
     * 取得設定列所對應的 board（不是設定列則回傳 null）
     */
    getSettingsBoard(serverMapId) {
        return Object.keys(CHANNEL_SETTINGS_ROWS).find(board => CHANNEL_SETTINGS_ROWS[board] === serverMapId) || null;
    }

    /**
     * 套用資料庫設定列的停用清單
     */
    applyDisabledChannelsFromRow(board, spawnMinutes) {
        const set = this.disabledChannels[board];
        if (!set) return;

        set.clear();
        (Array.isArray(spawnMinutes) ? spawnMinutes : []).forEach(value => {
            const channel = parseInt(value, 10);
            if (!isNaN(channel)) set.add(channel);
        });
    }

    /**
     * 該分流是否已被停用
     */
    isChannelDisabled(mapId) {
        const map = CONFIG.MAPS.find(m => m.id === mapId);
        if (!map) return false;

        const set = this.disabledChannels[map.board];
        return !!(set && set.has(map.channel));
    }

    /**
     * 切換分流的停用狀態：停用後固定排在最下面，狀態寫入資料庫供所有人同步
     */
    async toggleChannelDisabled(mapId) {
        const map = CONFIG.MAPS.find(m => m.id === mapId);
        if (!map) return;

        const board = map.board;
        const settingsRow = CHANNEL_SETTINGS_ROWS[board];
        if (!settingsRow) return;

        const set = this.disabledChannels[board];
        const previous = new Set(set);
        if (set.has(map.channel)) {
            set.delete(map.channel);
        } else {
            set.add(map.channel);
        }

        // 先更新畫面，再寫入資料庫
        this.updateAllDisplays();

        if (!this.supabase) {
            console.warn('[ChannelToggle] 未連線資料庫，停用狀態僅暫存於本頁');
            return;
        }

        const channels = Array.from(set).sort((a, b) => a - b);
        try {
            const { error } = await this.supabase
                .from('soulstone_timers')
                .upsert({
                    map_id: settingsRow,
                    spawn_minutes: channels,
                    updated_at: this.getCurrentServerTime().toISOString()
                }, { onConflict: 'map_id' });

            if (error) throw error;

            // 讀回比對，確保寫入成功且其他人看到相同狀態
            const { data, error: readError } = await this.supabase
                .from('soulstone_timers')
                .select('spawn_minutes')
                .eq('map_id', settingsRow)
                .maybeSingle();

            if (readError) throw readError;

            this.applyDisabledChannelsFromRow(board, data ? data.spawn_minutes : channels);
            this.updateAllDisplays();
            console.log(`[ChannelToggle] ${mapId} 停用狀態已寫入 (${channels.join(',') || '無'})`);
        } catch (e) {
            console.error('[ChannelToggle] 寫入停用狀態失敗:', e);
            this.disabledChannels[board] = previous;
            this.updateAllDisplays();
            alert(t('toggleSaveFailed'));
        }
    }

    /**
     * 更新卡片上的停用/啟用按鈕
     */
    updateChannelToggle(mapId) {
        const btn = document.querySelector(`.channel-toggle-btn[data-map="${mapId}"]`);
        if (!btn) return;

        const disabled = this.isChannelDisabled(mapId);
        btn.textContent = disabled ? t('btnEnableChannel') : t('btnDisableChannel');
        btn.classList.toggle('is-disabled', disabled);
        btn.title = disabled ? t('toggleEnableHint') : t('toggleDisableHint');
        btn.setAttribute('aria-pressed', disabled ? 'true' : 'false');
    }

    /**
     * 停用中的分流：狀態文字改為「已停用」，卡片內容變暗
     */
    applyDisabledState(mapId) {
        const cardEl = document.getElementById(`card-${mapId}`);
        if (!cardEl) return;

        const disabled = this.isChannelDisabled(mapId);
        cardEl.classList.toggle('channel-disabled', disabled);
        if (!disabled) return;

        const statusEl = document.getElementById(`status-${mapId}`);
        if (statusEl) {
            statusEl.textContent = t('statusDisabled');
            statusEl.className = 'map-status disabled';
        }
    }

    /**
     * 排序用的時間鍵：越小越先出現
     */
    getSpawnSortKey(mapId) {
        // 已停用的分流一律排在最下面
        if (this.isChannelDisabled(mapId)) return Number.MAX_SAFE_INTEGER;

        const state = this.state[mapId];
        if (!state || !state.nextSpawn) return Number.MAX_SAFE_INTEGER - 1;

        const spawnTime = state.nextSpawn.getTime();
        const now = this.getCurrentServerTime().getTime();

        // 已經出現中 → 當下就是最優先
        return spawnTime <= now ? now : spawnTime;
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
        this.updateDisplayInner(mapId);
        this.applyDisabledState(mapId);
    }

    updateDisplayInner(mapId) {
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
            this.updateCollectedBtnState(collectedBtn, isBloodMode);
            return;
        }

        const DESPAWN = CONFIG.DESPAWN_WINDOW;
        const CYCLE = CONFIG.DEFAULT_INTERVAL;

        // 無縫將時間推進到「與目前時間相關」的這一個循環
        let currentNextSpawn = state.nextSpawn.getTime();
        while (currentNextSpawn + DESPAWN <= now.getTime()) {
            currentNextSpawn += CYCLE;
        }

        // 重要：如果發現時間已經跨越到新的循環，立刻重置本地狀態
        if (currentNextSpawn !== state.nextSpawn.getTime()) {
            state.nextSpawn = new Date(currentNextSpawn);
            state.collectedUsed = false;
        }

        // 核心修正：如果下一次出現時間 (nextSpawn) 已經到達或過去，代表這是新一波靈石，
        // 必須將採集狀態 (collectedUsed) 視為未採集 (false)，避免舊標記阻擋「已撿完」按鈕點擊。
        if (state.nextSpawn && state.nextSpawn.getTime() <= now.getTime()) {
            state.collectedUsed = false;
        }

        const remaining = currentNextSpawn - now.getTime();
        const spawnAge = -remaining; // 正數代表已經過了出現時間多久
        const isCurrentCycleCollected = (currentNextSpawn === state.nextSpawn.getTime()) ? state.collectedUsed : false;

        // 取得上一次的倒數時間，用來精準判斷「跨越時間點」的瞬間
        const prevRemaining = this.lastRemaining[mapId];
        this.lastRemaining[mapId] = remaining;

        // === Phase 1: 等待出現 (remaining > 0) ===
        if (remaining > 0) {
            nextEl.closest('.timer-row').querySelector('.timer-label').textContent = t('nextSpawn');
            nextEl.textContent = this.formatTime(new Date(currentNextSpawn));
            if (timerLabel) timerLabel.textContent = t('remaining');
            countdownEl.textContent = this.formatDuration(remaining);

            // 警報 (精準判斷：跨過提前時間時觸發)
            if (remaining <= CONFIG.ALARM_BEFORE && prevRemaining > CONFIG.ALARM_BEFORE) {
                this.playAlarm();
            }
            
            if (remaining <= CONFIG.WARNING_BEFORE) {
                statusEl.textContent = t('statusUpcoming');
                statusEl.className = 'map-status danger';
                cardEl.classList.add('soon');
                cardEl.classList.remove('urgent');
                countdownEl.className = remaining <= CONFIG.DANGER_BEFORE
                    ? 'timer-countdown danger'
                    : 'timer-countdown warning';
            } else {
                statusEl.textContent = isCurrentCycleCollected ? t('collected') : t('notCollected');
                statusEl.className = isCurrentCycleCollected ? 'map-status active' : 'map-status warning';
                cardEl.classList.remove('urgent', 'soon');
                countdownEl.className = 'timer-countdown';
            }

            this.updateCollectedBtnState(collectedBtn, isBloodMode);
            return;
        }

        // === Phase 2: 靈石已出現，消失倒數 (0 <= spawnAge < 20min) ===
        if (spawnAge < DESPAWN) {
            const despawnRemaining = DESPAWN - spawnAge;
            const nextCycleTime = new Date(currentNextSpawn + CYCLE);

            // 靈石剛出現時觸發專屬音效（精準判斷：從大於0變成小於等於0的瞬間）
            if (remaining <= 0 && prevRemaining > 0) {
                this.playSpawnSound();
            }

            nextEl.closest('.timer-row').querySelector('.timer-label').textContent = t('nextWave');
            nextEl.textContent = this.formatTime(nextCycleTime);
            if (timerLabel) timerLabel.textContent = t('despawning');
            countdownEl.textContent = this.formatDuration(despawnRemaining);
            countdownEl.className = 'timer-countdown danger';
            statusEl.textContent = t('spawning');
            statusEl.className = 'map-status danger blinking-text';
            cardEl.classList.add('urgent');
            cardEl.classList.remove('soon');

            this.updateCollectedBtnState(collectedBtn, true);
            return;
        }
    }

    updateCollectedBtnState(btn, canCollect) {
        if (!canCollect) {
            btn.classList.add('disabled');
            btn.classList.remove('used');
            btn.disabled = true;
            btn.style.opacity = '0.5';
            btn.style.cursor = 'not-allowed';
            btn.textContent = t('btnCollected');
        } else {
            btn.classList.remove('disabled', 'used');
            btn.disabled = false;
            btn.style.opacity = '1';
            btn.style.cursor = 'pointer';
            btn.textContent = t('btnCollected');
        }
    }

    formatTime(date) {
        return date.toLocaleTimeString('zh-TW', {
            timeZone: this.currentTimeZone,
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
        document.title = isBloodMode ? t('title') : `${currentServerLabel} | ${t('title')}`;
        const logoText = document.querySelector('.logo-text');
        if (logoText) {
            logoText.textContent = isBloodMode ? t('title') : `${t('title')} (${currentServerLabel})`;
        }

        this.updateAllDisplays();
        this.updateConnectionStatus(this.supabase !== null);
        this.updateLastUpdated();
        this.updateAlarmBtn(document.getElementById('alarm-toggle'));

        // 時間值可點擊手動編輯
        document.querySelectorAll('.timer-value').forEach(el => {
            el.title = t('editTimeHint');
        });
    }

    updateAlarmBtn(btn) {
        if (!btn) return;
        btn.textContent = this.alarmEnabled ? '🔔' : '🔕';
        btn.style.background = this.alarmEnabled ? 'var(--accent-orange)' : '#374151';
        const statusText = this.alarmEnabled ? t('alarmOn') : t('alarmOff');
        const settingText = t('alarmSetting', this.alarmMinutes);
        btn.title = `${statusText} | ${settingText}\n(右鍵切換提醒時間)`;
    }

    // 提前警報音效：柔和的 Ding-Dong
    playAlarm() {
        if (!this.alarmEnabled || !this.hasInteracted || !this.audioCtx) return;

        try {
            const ctx = this.audioCtx;
            if (ctx.state === 'suspended') return;
            
            const playTone = (freq, startTime, duration) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.4, startTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(startTime);
                osc.stop(startTime + duration);
            };

            const now = ctx.currentTime;
            playTone(880, now, 0.4);           // A5 - ding
            playTone(1108.73, now + 0.2, 0.4); // C#6 - dong
        } catch (e) { /* fail silently */ }
    }

    // 靈石出現音效：木琴聲 (兩聲)
    playSpawnSound() {
        if (!this.alarmEnabled || !this.hasInteracted || !this.audioCtx) return;

        try {
            const ctx = this.audioCtx;
            if (ctx.state === 'suspended') return;
            const now = ctx.currentTime;

            // 產生木琴般的短促敲擊聲
            const playMarimbaTone = (freq, startTime) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                
                // Sine 波加上極快的衰減，模仿木琴的共鳴
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, startTime);
                
                gain.gain.setValueAtTime(0, startTime);
                gain.gain.linearRampToValueAtTime(0.8, startTime + 0.01); // 極快的 Attack
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.3); // 短促的 Decay
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(startTime);
                osc.stop(startTime + 0.35);
            };

            // 四聲清脆的木琴敲擊
            playMarimbaTone(1046.50, now);          // C6
            playMarimbaTone(1174.66, now + 0.15);   // D6
            playMarimbaTone(1318.51, now + 0.3);    // E6
            playMarimbaTone(1567.98, now + 0.45);   // G6
        } catch (e) { /* fail silently */ }
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
        // 警報切換 button (click = on/off)
        const alarmToggle = document.getElementById('alarm-toggle');
        const alarmTimeBtn = document.getElementById('alarm-time');

        const updateAlarmTimeBtn = () => {
            if (alarmTimeBtn) {
                alarmTimeBtn.textContent = `${this.alarmMinutes}m`;
            }
        };
        updateAlarmTimeBtn();

        if (alarmToggle) {
            this.updateAlarmBtn(alarmToggle);
            alarmToggle.addEventListener('click', () => {
                this.alarmEnabled = !this.alarmEnabled;
                localStorage.setItem('soulstone-alarm-enabled', this.alarmEnabled);
                this.updateAlarmBtn(alarmToggle);
                
                // 開啟時立刻試播一聲讓玩家確認音量
                if (this.alarmEnabled) this.playAlarm();
            });

            // 保留右鍵切換（電腦用戶方便）
            alarmToggle.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                const opts = CONFIG.ALARM_BEFORE_OPTIONS;
                const currentIdx = opts.indexOf(this.alarmMinutes);
                const nextIdx = (currentIdx + 1) % opts.length;
                this.alarmMinutes = opts[nextIdx];
                localStorage.setItem('soulstone-alarm-minutes', this.alarmMinutes);
                this.updateAlarmBtn(alarmToggle);
                updateAlarmTimeBtn();
                this.showToast(t('alarmSetting', this.alarmMinutes));
            });
        }

        // 提醒時間按鈕 (點擊循環 1 → 3 → 5 → 1...)
        if (alarmTimeBtn) {
            alarmTimeBtn.addEventListener('click', () => {
                const opts = CONFIG.ALARM_BEFORE_OPTIONS;
                const currentIdx = opts.indexOf(this.alarmMinutes);
                const nextIdx = (currentIdx + 1) % opts.length;
                this.alarmMinutes = opts[nextIdx];
                localStorage.setItem('soulstone-alarm-minutes', this.alarmMinutes);
                updateAlarmTimeBtn();
                if (alarmToggle) this.updateAlarmBtn(alarmToggle);
                this.showToast(t('alarmSetting', this.alarmMinutes));
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

        // 時區切換 select
        const tzSelect = document.getElementById('timezone-select');
        if (tzSelect) {
            tzSelect.value = this.currentTimeZone;
            tzSelect.addEventListener('change', (e) => {
                this.currentTimeZone = e.target.value;
                localStorage.setItem('soulstone-timezone', this.currentTimeZone);
                this.updateAllDisplays();
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

        // 手動編輯預計出現時間：點擊時間值開啟編輯器
        document.querySelectorAll('.timer-value').forEach(el => {
            el.addEventListener('click', () => {
                this.openTimeEditor(el.id.replace('next-', ''));
            });
        });

        document.querySelectorAll('.time-editor-save').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.saveManualTime(e.currentTarget.dataset.map);
            });
        });

        document.querySelectorAll('.time-editor-cancel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.closeTimeEditor(e.currentTarget.dataset.map);
            });
        });

        document.querySelectorAll('.time-editor-input').forEach(input => {
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.saveManualTime(input.dataset.map);
                } else if (e.key === 'Escape') {
                    this.closeTimeEditor(input.dataset.map);
                }
            });
        });

        // 已撿完 buttons
        document.querySelectorAll('.collected-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mapId = e.currentTarget.dataset.map;
                this.handleMarkCollected(mapId);
            });
        });

        // 停用 / 啟用分流：停用後固定排在最下面
        document.querySelectorAll('.channel-toggle-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleChannelDisabled(e.currentTarget.dataset.map);
            });
        });

        // 血風高原快捷按鈕（血風1~血風5）：位置固定，避免卡片重排後點錯分流
        document.querySelectorAll('.quick-kill-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const mapId = e.currentTarget.dataset.map;
                const state = this.state[mapId];

                // 事件結束後 currentTarget 會變 null，先取出按鈕參照
                const btn = e.currentTarget;

                // 已停用 → 不做任何事，避免誤寫入
                if (this.isChannelDisabled(mapId)) {
                    console.warn(`[QuickKill] ${mapId} 已停用，略過`);
                    btn.classList.add('qk-shake');
                    setTimeout(() => btn.classList.remove('qk-shake'), 400);
                    return;
                }

                // 已死掉 → 不重複推算，避免多人同時點擊把時間越推越遠
                const alreadyDead = state && state.nextSpawn && state.collectedUsed
                    && state.nextSpawn.getTime() > this.getCurrentServerTime().getTime();
                if (alreadyDead) {
                    console.warn(`[QuickKill] ${mapId} 已是死亡狀態，略過重複點擊`);
                    btn.classList.add('qk-shake');
                    setTimeout(() => btn.classList.remove('qk-shake'), 400);
                    return;
                }

                await this.markCollected(mapId);
                this.updateQuickButton(mapId);
            });
        });
    }

    // ================================
    // 確認對話框處理
    // ================================

    handleSetIntervalSpawn(mapId) {
        // 直接執行，移除再次確認對話框
        this.setNextIntervalTime(mapId);
    }

    handleSetSpawn(mapId) {
        // 直接執行，移除再次確認對話框
        this.setSpawnTime(mapId);
    }

    handleMarkCollected(mapId) {
        const state = this.state[mapId];

        if (!state.nextSpawn && !isBloodMode) {
            return;
        }

        // 直接執行已撿完 / BOSS 已死掉，內部的 markCollected 會處理循環重置與狀態檢查
        this.markCollected(mapId);
    }

    showToast(message) {
        // Disabled based on user request
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
