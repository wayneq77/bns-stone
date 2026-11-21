/**
 * 快捷列「已死掉」按鈕的時段檢查
 *
 * 問題背景（2026-11-22 修正）：
 *   卡片顯示的出現時間用「原始值 + 200 分鐘」外推，
 *   快捷列卻用「原始值 + 180 分鐘」外推，兩套週期各推各的，
 *   結果畫面顯示「出現中」，快捷鈕卻還不能點（BOSS 出來了也標不了已死掉）。
 *
 * 本測試驗證兩個不變條件：
 *   1. 卡片顯示的出現時間 == 快捷列判斷用的出現時間（永遠同一個值）
 *   2. 只要畫面顯示「出現中」（出現後 20 分鐘內），快捷鈕一定可點
 *
 * 執行：node tests/quick-timing.test.js
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ================================
// 載入 app.js（用假的瀏覽器環境，不依賴任何 npm 套件）
// ================================
function loadTrackerClass() {
    const appPath = path.join(__dirname, '..', 'app.js');
    const code = fs.readFileSync(appPath, 'utf8');

    const sandbox = {
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        Date,
        Math,
        JSON,
        Promise,
        localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
        navigator: { userAgent: 'node', language: 'zh-TW' },
        location: { pathname: '/blood', href: 'https://example.test/blood' },
        document: {
            addEventListener: () => {},
            querySelector: () => null,
            querySelectorAll: () => [],
            getElementById: () => null,
            createElement: () => ({ classList: { add() {}, remove() {}, toggle() {} }, style: {} }),
            body: { appendChild() {} },
            documentElement: { style: {} },
        },
    };
    sandbox.window = sandbox;
    sandbox.window.APP_CONFIG = { SUPABASE_URL: '', SUPABASE_KEY: '' };

    vm.createContext(sandbox);
    vm.runInContext(code, sandbox, { filename: 'app.js' });
    // class 宣告會落在 context 的全域詞法環境，不會掛在 globalThis 上，另外取出來
    vm.runInContext('globalThis.__Tracker = SoulstoneTracker;', sandbox);
    return sandbox;
}

const sandbox = loadTrackerClass();
const TrackerClass = sandbox.__Tracker;

// ================================
// 測試工具
// ================================
let passed = 0;
let failed = 0;

function check(name, condition, detail) {
    if (condition) {
        passed++;
        console.log(`  ✓ ${name}`);
    } else {
        failed++;
        console.log(`  ✗ ${name}${detail ? ` → ${detail}` : ''}`);
    }
}

function makeTracker(mapId, nextSpawnMs, offsetMs = 0) {
    const tracker = Object.create(TrackerClass.prototype);
    tracker.state = { [mapId]: { nextSpawn: new Date(nextSpawnMs), collectedUsed: false, cycleEndTime: null } };
    tracker.rawNextSpawn = { [mapId]: new Date(nextSpawnMs) };
    tracker.disabledChannels = {};
    tracker.serverTimeOffset = offsetMs;
    tracker.lastRemaining = {};
    return tracker;
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// 血風平原 ASIA1 兩個分流的真實線上資料（2026-11-21 18:40Z 讀取）
const ASIA_PLAIN_CH1 = Date.parse('2026-11-21T12:09:00Z');
const ASIA_PLAIN_CH2 = Date.parse('2026-11-21T12:18:00Z');
// 血風高原分流（剛被標記擊殺 → 下次 = 當下 + 180 分鐘）
const HIGHLAND_CH1 = Date.parse('2026-11-21T19:02:20Z');

// ================================
// 測試 1：卡片顯示時間 == 快捷列時間
// ================================
console.log('\n[1] 卡片顯示的出現時間 與 快捷列判斷用的時間必須一致');

{
    const mapId = 'bloodplain-ch1-asia';
    // 從原始值往後推 12 小時，每 10 分鐘取樣一次
    let mismatch = 0;
    for (let m = 0; m <= 12 * 60; m += 10) {
        const now = ASIA_PLAIN_CH1 + m * MIN;
        const tracker = makeTracker(mapId, ASIA_PLAIN_CH1, now - Date.now());
        const spawn = tracker.getCurrentSpawnTime(mapId);
        const timing = tracker.getQuickClickTiming(mapId);
        if (!spawn || !timing || spawn.getTime() !== timing.anchor.getTime()) mismatch++;
    }
    check('原始值往後推 12 小時內，兩邊時間都一致', mismatch === 0, `不一致 ${mismatch} 次`);
}

{
    // 舊的錯誤做法：用 180 分鐘外推，會與顯示層的 200 分鐘愈推愈遠
    const mapId = 'bloodplain-ch1-asia';
    const now = ASIA_PLAIN_CH1 + 5 * HOUR;
    const tracker = makeTracker(mapId, ASIA_PLAIN_CH1, now - Date.now());
    const spawn = tracker.getCurrentSpawnTime(mapId);
    const timing = tracker.getQuickClickTiming(mapId);
    check(
        '快捷列的錨點就是卡片顯示的出現時間',
        spawn.getTime() === timing.anchor.getTime(),
        `顯示 ${spawn.toISOString()} / 快捷列 ${timing.anchor.toISOString()}`
    );
}

// ================================
// 測試 2：畫面顯示「出現中」時，快捷鈕一定可點
// ================================
console.log('\n[2] 只要畫面顯示「出現中」（出現後 20 分鐘內），快捷鈕必定可點');

{
    const mapId = 'bloodplain-ch1-asia';
    let bad = 0;
    let badDetail = '';
    // 從原始值往後推 8 小時，每分鐘取樣
    for (let m = 0; m <= 8 * 60; m++) {
        const now = ASIA_PLAIN_CH1 + m * MIN;
        const tracker = makeTracker(mapId, ASIA_PLAIN_CH1, now - Date.now());
        const spawn = tracker.getCurrentSpawnTime(mapId);
        const timing = tracker.getQuickClickTiming(mapId);
        const bossIsUp = now >= spawn.getTime() && now < spawn.getTime() + 20 * MIN;
        if (bossIsUp && !timing.clickable) {
            bad++;
            if (!badDetail) badDetail = `出現時間 ${spawn.toISOString()}，當下 ${new Date(now).toISOString()}`;
        }
    }
    check('BOSS 出現的整段時間快捷鈕都可點', bad === 0, badDetail);
}

{
    // 剛好落在「出現後 20 分鐘」的邊界：應該還可點
    const mapId = 'bloodplain-ch2-asia';
    const spawn = ASIA_PLAIN_CH2;
    const tracker = makeTracker(mapId, spawn, spawn + 19 * MIN - Date.now());
    const timing = tracker.getQuickClickTiming(mapId);
    check('出現後第 19 分鐘仍可點', timing.clickable === true);

    const tracker2 = makeTracker(mapId, spawn, spawn + 20 * MIN - Date.now());
    const timing2 = tracker2.getQuickClickTiming(mapId);
    check('超過 20 分鐘後自動關閉（下一輪開始）', timing2.clickable === false);
}

{
    // 太早點：應該不可點，且剩餘時間提示是對的
    const mapId = 'bloodplain-ch1-asia';
    const now = ASIA_PLAIN_CH1 + 2 * HOUR;
    const tracker = makeTracker(mapId, ASIA_PLAIN_CH1, now - Date.now());
    const timing = tracker.getQuickClickTiming(mapId);
    const waitMin = Math.ceil((timing.remaining - 3 * MIN) / MIN);
    check('還沒到時間時不可點', timing.clickable === false);
    check('提示的剩餘分鐘數為正數', waitMin > 0, `waitMin=${waitMin}`);
}

// ================================
// 測試 3：剛標記擊殺後，應立刻變成不可點（等待下一輪）
// ================================
console.log('\n[3] 標記「已死掉」後，下一輪之前不會再誤觸發');

{
    const mapId = 'bloodwind-ch1';
    const now = Date.parse('2026-11-21T16:02:20Z');
    const tracker = makeTracker(mapId, HIGHLAND_CH1, now - Date.now());
    const timing = tracker.getQuickClickTiming(mapId);
    check('下一輪（+180 分鐘）之前不可點', timing.clickable === false);

    // 下一輪的前 3 分鐘應該開窗
    const tracker2 = makeTracker(mapId, HIGHLAND_CH1, HIGHLAND_CH1 - 2 * MIN - Date.now());
    const timing2 = tracker2.getQuickClickTiming(mapId);
    check('下一輪前 3 分鐘開始可點', timing2.clickable === true);
}

// ================================
// 測試 4：沒有設定時間的分流不會爆掉
// ================================
console.log('\n[4] 未設定時間的分流');

{
    const tracker = Object.create(TrackerClass.prototype);
    tracker.state = { 'x': { nextSpawn: null, collectedUsed: false } };
    tracker.rawNextSpawn = {};
    tracker.disabledChannels = {};
    tracker.serverTimeOffset = 0;
    check('getCurrentSpawnTime 回傳 null', tracker.getCurrentSpawnTime('x') === null);
    check('getQuickClickTiming 回傳 null', tracker.getQuickClickTiming('x') === null);
}

// ================================
console.log(`\n結果：${passed} 通過，${failed} 失敗\n`);
process.exit(failed === 0 ? 0 : 1);
