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

class SoulstoneTracker {
    constructor() {
        this.state = {};
        this.supabase = null;
        this.realtimeChannel = null;
        this.updateIntervals = {};

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
            const { data, error } = await this.supabase
                .from('soulstone_timers')
                .select('*');

            if (error) {
                console.error('Error fetching from Supabase:', error);
                return;
            }

            if (data && data.length > 0) {
                data.forEach(row => {
                    if (this.state[row.map_id]) {
                        this.state[row.map_id].nextSpawn = row.next_spawn ? new Date(row.next_spawn) : null;
                        this.state[row.map_id].spawnMinutes = row.spawn_minutes || [0, 20, 40];
                        this.state[row.map_id].lastUpdated = new Date(row.updated_at);
                        // 還原額外狀態
                        if (row.collected_used !== undefined) {
                            this.state[row.map_id].collectedUsed = row.collected_used;
                        }
                        if (row.cycle_end_time) {
                            this.state[row.map_id].cycleEndTime = new Date(row.cycle_end_time);
                        }
                        if (row.base_time) {
                            this.state[row.map_id].baseTime = new Date(row.base_time);
                        }
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
            const mapId = newRecord.map_id;
            if (mapId && this.state[mapId]) {
                this.state[mapId].nextSpawn = newRecord.next_spawn ? new Date(newRecord.next_spawn) : null;
                this.state[mapId].spawnMinutes = newRecord.spawn_minutes || [0, 20, 40];
                this.state[mapId].lastUpdated = new Date(newRecord.updated_at);
                if (newRecord.collected_used !== undefined) {
                    this.state[mapId].collectedUsed = newRecord.collected_used;
                }
                if (newRecord.cycle_end_time) {
                    this.state[mapId].cycleEndTime = new Date(newRecord.cycle_end_time);
                }
                if (newRecord.base_time) {
                    this.state[mapId].baseTime = new Date(newRecord.base_time);
                }
                this.updateAllDisplays();
                this.updateLastUpdated();
            }
        }
    }

    async saveToSupabase(mapId) {
        if (!this.supabase) {
            this.saveToLocalStorage();
            return;
        }

        const data = {
            map_id: mapId,
            next_spawn: this.state[mapId].nextSpawn ? this.state[mapId].nextSpawn.toISOString() : null,
            spawn_minutes: this.state[mapId].spawnMinutes,
            collected_used: this.state[mapId].collectedUsed,
            cycle_end_time: this.state[mapId].cycleEndTime ? this.state[mapId].cycleEndTime.toISOString() : null,
            base_time: this.state[mapId].baseTime ? this.state[mapId].baseTime.toISOString() : null,
            updated_at: new Date().toISOString()
        };

        try {
            const { error } = await this.supabase
                .from('soulstone_timers')
                .upsert(data, { onConflict: 'map_id' });

            if (error) {
                console.error('Error saving to Supabase:', error);
                this.saveToLocalStorage();
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
                    if (data[map.id]) {
                        this.state[map.id] = {
                            ...this.state[map.id],
                            ...data[map.id],
                            nextSpawn: data[map.id].nextSpawn ? new Date(data[map.id].nextSpawn) : null,
                            lastUpdated: data[map.id].lastUpdated ? new Date(data[map.id].lastUpdated) : null,
                            cycleEndTime: data[map.id].cycleEndTime ? new Date(data[map.id].cycleEndTime) : null,
                            baseTime: data[map.id].baseTime ? new Date(data[map.id].baseTime) : null
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
            const data = { maps: {} };
            CONFIG.MAPS.forEach(map => {
                data.maps[map.id] = {
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
        
        this.saveToSupabase(mapId);
        this.updateDisplay(mapId);
    }

    /**
     * 設定出現靈石（重新計算這輪的基準時間和下次出現時間）
     */
    setSpawnTime(mapId) {
        const now = new Date();
        
        this.state[mapId].collectedUsed = false; // 重置已撿完狀態
        this.state[mapId].cycleEndTime = new Date(now.getTime() + CONFIG.DEFAULT_INTERVAL);
        this.state[mapId].nextSpawn = new Date(now.getTime() + CONFIG.DEFAULT_INTERVAL);
        this.state[mapId].lastUpdated = now;

        this.saveToSupabase(mapId);
        this.updateDisplay(mapId);
    }

    /**
     * 已撿完按鈕（縮短下次出現時間，每輪只能執行一次）
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

        // 直接把目前的下次出現時間提早 20 分鐘
        if (mapState.nextSpawn) {
            mapState.nextSpawn = new Date(mapState.nextSpawn.getTime() - (CONFIG.DEFAULT_INTERVAL - CONFIG.COLLECTED_INTERVAL));
        }
        mapState.lastUpdated = new Date();

        this.saveToSupabase(mapId);
        this.updateDisplay(mapId);
        return true;
    }

    resetTimer(mapId) {
        this.state[mapId].nextSpawn = null;
        this.state[mapId].collectedUsed = false;
        this.state[mapId].cycleEndTime = null;
        this.state[mapId].baseTime = null;
        this.state[mapId].lastUpdated = new Date();

        this.saveToSupabase(mapId);
        this.updateDisplay(mapId);
    }

    /**
     * 接獲即將出現提醒，設定為 10 分鐘後出現
     */
    setNextIntervalTime(mapId) {
        const now = new Date();
        
        this.state[mapId].collectedUsed = false;
        // 直接從按下時設定為 10 分鐘後出現
        this.state[mapId].nextSpawn = new Date(now.getTime() + 10 * 60 * 1000);
        this.state[mapId].cycleEndTime = this.state[mapId].nextSpawn;
        this.state[mapId].lastUpdated = now;

        this.saveToSupabase(mapId);
        this.updateDisplay(mapId);

        const h = this.state[mapId].nextSpawn.getHours().toString().padStart(2, '0');
        const m = this.state[mapId].nextSpawn.getMinutes().toString().padStart(2, '0');
        this.showToast(`🔔 校正完成：靈石將於 ${h}:${m} 出現`);
    }

    // ================================
    // Display Updates
    // ================================

    updateAllDisplays() {
        CONFIG.MAPS.forEach(map => this.updateDisplay(map.id));
    }

    updateDisplay(mapId) {
        const state = this.state[mapId];
        const now = new Date();

        // Update timer value
        const nextEl = document.getElementById(`next-${mapId}`);
        const countdownEl = document.getElementById(`countdown-${mapId}`);
        const statusEl = document.getElementById(`status-${mapId}`);
        const cardEl = document.getElementById(`card-${mapId}`);
        const collectedBtn = cardEl.querySelector('.collected-btn');

        if (!state.nextSpawn) {
            nextEl.textContent = '--:--:--';
            countdownEl.textContent = '--:--:--';
            statusEl.textContent = '等待設定';
            statusEl.className = 'map-status';
            cardEl.classList.remove('urgent', 'soon');
            this.updateCollectedBtnState(collectedBtn, state, false);
            return;
        }

        // Format next spawn time
        nextEl.textContent = this.formatTime(state.nextSpawn);

        // Calculate remaining time
        const remaining = state.nextSpawn.getTime() - now.getTime();

        // 檢查是否已過了cycleEndTime，解除「已撿完」限制
        if (state.cycleEndTime && now >= state.cycleEndTime) {
            state.collectedUsed = false;
        }

        if (remaining <= 0) {
            // Spawn is active!
            countdownEl.textContent = '馬上出現！';
            countdownEl.className = 'timer-countdown danger';
            statusEl.textContent = '出現中！';
            statusEl.className = 'map-status danger';
            cardEl.classList.add('urgent');
            cardEl.classList.remove('soon');
        } else {
            // Show countdown
            countdownEl.textContent = this.formatDuration(remaining);
            
            // 根據collectedUsed顯示狀態
            if (state.collectedUsed) {
                statusEl.textContent = '已撿完';
                statusEl.className = 'map-status active';
            } else {
                statusEl.textContent = '未撿完';
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
            btn.textContent = '已撿完';
            return;
        }

        if (state.collectedUsed) {
            // 已使用過
            btn.classList.add('used');
            btn.classList.remove('disabled');
            btn.disabled = false;
            btn.textContent = '✓ 已使用';
        } else {
            // 可以使用
            btn.classList.remove('used', 'disabled');
            btn.disabled = false;
            btn.textContent = '已撿完';
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
            textEl.textContent = '已連線 (Supabase)';
        } else {
            dotEl.className = 'connection-dot offline';
            textEl.textContent = '離線 (本地模式)';
        }
    }

    updateLastUpdated() {
        const now = new Date();
        const text = `最後同步：${now.toLocaleTimeString('zh-TW')}`;
        const el = document.getElementById('last-updated');
        if (el) el.textContent = text;
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

        modalMessage.textContent = '確定出現即將出現靈石的圖案再點此按鈕？';
        modalSubMsg.innerHTML = '將自動設定為 **10分鐘後** 出現，並開始倒數計時。確認執行嗎？';

        modal.classList.add('active');

        const newConfirmBtn = modalConfirm.cloneNode(true);
        const newCancelBtn = modalCancel.cloneNode(true);
        modalConfirm.parentNode.replaceChild(newConfirmBtn, modalConfirm);
        modalCancel.parentNode.replaceChild(newCancelBtn, modalCancel);

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

        // 計算按下時的基準時間
        const now = new Date();
        const baseTime = this.calculateBaseTime(now);
        const nextSpawnTime = new Date(baseTime.getTime() + CONFIG.DEFAULT_INTERVAL);
        const baseTimeStr = `${baseTime.getHours().toString().padStart(2,'0')}:${baseTime.getMinutes().toString().padStart(2,'0')}`;
        const nextTimeStr = `${nextSpawnTime.getHours().toString().padStart(2,'0')}:${nextSpawnTime.getMinutes().toString().padStart(2,'0')}`;

        modalMessage.textContent = '確定靈石已出現了嗎？';
        modalSubMsg.innerHTML = `將以 <strong style="color:var(--accent-orange)">${baseTimeStr}</strong> 為基準，下次出現時間約為 <strong style="color:var(--accent-gold)">${nextTimeStr}</strong>（140分後）。<br>若靈石未撿完，則保持140分鐘倒計時。已撿完可按「已撿完」縮短20分鐘，每輪限一次。`;

        // 顯示 modal
        modal.classList.add('active');

        // 清理舊的事件監聽器
        const newConfirmBtn = modalConfirm.cloneNode(true);
        const newCancelBtn = modalCancel.cloneNode(true);
        modalConfirm.parentNode.replaceChild(newConfirmBtn, modalConfirm);
        modalCancel.parentNode.replaceChild(newCancelBtn, modalCancel);

        // 確認按鈕
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
