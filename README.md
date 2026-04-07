# 劍靈：革命 靈石追蹤器

及時追蹤四張地圖的靈石出現時間，支援多人即時同步！

## 📋 功能特色

- **四張地圖**：靈石谷、玉皇要塞、糾土地帶、赤龍火山
- **智慧計時**：自動計算下次出現時間
- **即時同步**：透過 Supabase 多人同時使用
- **瀏覽器通知**：快出現/已出現時提醒
- **手機優先**：完美適配手機與桌面

## 🚀 快速開始

### 方法一：直接開啟（僅本地模式）

```bash
# 使用 Python 啟動簡單伺服器
cd ~/ai-outputs/projects/soulstone-tracker
python3 -m http.server 8080

# 或使用 Node.js
npx serve .
```

然後用瀏覽器開啟 `http://localhost:8080`

### 方法二：設定 Supabase 即時同步

#### 1. 建立 Supabase 專案

1. 前往 [supabase.com](https://supabase.com) 免費開通專案
2. 進入 **SQL Editor**
3. 執行下方 SQL 語法

#### 2. 建立資料表

```sql
-- 建立靈石計時器資料表
CREATE TABLE soulstone_timers (
    id SERIAL PRIMARY KEY,
    map_id VARCHAR(50) UNIQUE NOT NULL,
    next_spawn TIMESTAMP WITH TIME ZONE,
    spawn_minutes INTEGER[] DEFAULT ARRAY[0, 20, 40],
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 啟用即時訂閱
ALTER PUBLICATION supabase_realtime ADD TABLE soulstone_timers;

-- 啟用 Row Level Security（可選）
ALTER TABLE soulstone_timers ENABLE ROW LEVEL SECURITY;

-- 允許所有使用者讀寫
CREATE POLICY "Allow all" ON soulstone_timers FOR ALL USING (true);
```

#### 3. 設定連線

編輯 `app.js`，填入你的 Supabase 專案資訊：

```javascript
const CONFIG = {
    // ... 其他設定
    SUPABASE_URL: 'https://你的專案.supabase.co',
    SUPABASE_KEY: '你的-anon-key'
};
```

在 Supabase 控制台取得 API Key：
- **Project Settings** → **API** → 複製 `anon public` key

## 📖 使用說明

### 按鈕功能

| 按鈕 | 情境 | 效果 |
|------|------|------|
| **設定出現時間** | 看到靈石出現 | 下次 = 現在 + 2小時20分鐘 |
| **已撿完** | 確定有人撿完 | 下次 = 現在 + 2小時 |
| **重新校正** | 需要重新開始 | 清除計時 |

### 出現分鐘設定

- 預設：`0, 20, 40`（每2小時的 0分、20分、40分出現）
- 可依據個人觀察調整
- 支援自訂：例如 `10, 30, 50`

### 通知設定

- 首次使用會詢問是否允許通知
- 「5 分鐘前」會收到警告
- 「1 分鐘前」會收到緊急提醒
- 「出現時」會收到通知 + 音效

## 🎨 自訂樣式

如需修改配色，編輯 `styles.css` 中的 CSS Variables：

```css
:root {
    --accent-orange: #ff6b35;    /* 主色調 */
    --accent-gold: #ffd700;      /* 強調色 */
    --bg-dark: #0a0a0f;          /* 背景色 */
}
```

## 📁 檔案結構

```
soulstone-tracker/
├── index.html      # 主頁面
├── styles.css      # 樣式檔
├── app.js          # 應用邏輯
├── README.md       # 說明文件
└── schema.sql      # Supabase 資料庫結構
```

## 🌐 部署選項

### Vercel / Netlify

1. 上傳整個資料夾
2. 靜態托管，無需伺服器

### GitHub Pages

1. 建立 repository
2. 啟用 Pages 功能
3. 上傳檔案即可

### 免費部署平台

- **Cloudflare Pages**
- **Render** (靜態網站)
- **Surge.sh**

## ⚠️ 注意事項

- 本工具僅供遊戲愛好者使用
- 時間計算基於預設規則，實際情況可能有所不同
- 建議觀察幾次後根據實際狀況調整「出現分鐘」設定
- Supabase 免費方案每月有用量限制，一般使用足夠

## 🔧 技術棧

- 純 HTML + CSS + JavaScript
- Supabase 即時資料庫
- Web Audio API（通知音效）
- Notifications API（瀏覽器通知）

---

**享受遊戲！💎**
