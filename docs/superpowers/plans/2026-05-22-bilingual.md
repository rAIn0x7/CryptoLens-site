# Bilingual Toggle (EN/中) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an EN/中 language toggle to CryptoLens and StockLens — default Chinese, persisted in localStorage — that switches article summaries, UI labels, and time strings without a page reload.

**Architecture:** A `STRINGS` object in each `app.js` holds EN/ZH translations. A `getLang()`/`t(key)` helper reads `localStorage`. `applyLangToDOM()` updates static `data-i18n` elements. Feed/pulse re-renders on toggle since they call `getLang()` at render time. English article titles are never translated (financial context).

**Tech Stack:** Vanilla JS · localStorage · `data-i18n` HTML attributes

---

## File Map

| File | Action |
|---|---|
| `/home/test/CryptoLens-site/assets/app.js` | Modify — add STRINGS, lang functions, update timeAgo/renderCard/loadMarketPulse/setLiveStatus/price snapshot |
| `/home/test/CryptoLens-site/index.html` | Modify — add lang toggle button, data-i18n attrs, call applyLangToDOM in init |
| `/home/test/StockLens-site/assets/app.js` | Modify — same pattern, SPY/FINNHUB strings |
| `/home/test/StockLens-site/index.html` | Modify — same as CryptoLens index.html changes |

---

## Task 1: CryptoLens app.js — bilingual support

**Files:**
- Modify: `/home/test/CryptoLens-site/assets/app.js`

- [ ] **Step 1: Add STRINGS + lang functions after `let hasMore = true;`**

Find this line in `/home/test/CryptoLens-site/assets/app.js`:
```javascript
let hasMore = true;
```

Replace with:
```javascript
let hasMore = true;

const STRINGS = {
  en: {
    timeJustNow: 'just now',
    timeHAgo: h => `${h}h ago`,
    timeDayAgo: d => `${d}d ago`,
    todayTop: "Today's Top Signal",
    trendingTags: 'Trending Tags',
    weeklySignal: 'Free Weekly Signal',
    weeklyDesc: 'Top 10 stories every Monday. No spam.',
    subFree: 'Subscribe Free',
    sponsored: 'Sponsored',
    loadMore: 'Load more',
    signIn: 'Sign In',
    signOut: 'Sign Out',
    marketPulse: 'MARKET PULSE',
    basedOn: (n, time) => `Based on ${n} signals · ${time}`,
    histLabel: '14-DAY HISTORY',
    today: 'Today',
    sentiment: { bullish: 'BULLISH', bearish: 'BEARISH', neutral: 'NEUTRAL', mixed: 'MIXED' },
    liveLabel: live => live ? 'BTC/USD · BINANCE · LIVE' : 'BTC/USD · BINANCE · ~10s',
    priceSnapshot: 'Price Snapshot',
  },
  zh: {
    timeJustNow: '刚刚',
    timeHAgo: h => `${h}小时前`,
    timeDayAgo: d => `${d}天前`,
    todayTop: '今日热点',
    trendingTags: '热门标签',
    weeklySignal: '每周免费信号',
    weeklyDesc: '每周一推送10条精选，不发垃圾邮件。',
    subFree: '免费订阅',
    sponsored: '赞助',
    loadMore: '加载更多',
    signIn: '登录',
    signOut: '退出',
    marketPulse: '市场脉搏',
    basedOn: (n, time) => `基于 ${n} 条信号 · ${time}`,
    histLabel: '14天历史',
    today: '今日',
    sentiment: { bullish: '看多', bearish: '看空', neutral: '中性', mixed: '混合' },
    liveLabel: live => live ? 'BTC/USD · BINANCE · 实时' : 'BTC/USD · BINANCE · ~10秒',
    priceSnapshot: '价格快照',
  }
};

function getLang() { return localStorage.getItem('lens_lang') || 'zh'; }
function t(key, ...args) {
  const s = STRINGS[getLang()][key];
  return typeof s === 'function' ? s(...args) : (s ?? key);
}
function setLang(lang) {
  localStorage.setItem('lens_lang', lang);
  applyLangToDOM();
  loadFeed(true);
  loadTodaysTop();
  loadMarketPulse();
}
function toggleLang() { setLang(getLang() === 'zh' ? 'en' : 'zh'); }
function applyLangToDOM() {
  const lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const s = STRINGS[lang][key];
    if (s && typeof s === 'string') el.textContent = s;
  });
  const toggle = document.getElementById('lang-toggle');
  if (toggle) toggle.textContent = lang === 'zh' ? 'EN' : '中';
}
```

- [ ] **Step 2: Modify `timeAgo` to use lang**

Find:
```javascript
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
```

Replace with:
```javascript
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return t('timeJustNow');
  if (h < 24) return t('timeHAgo', h);
  return t('timeDayAgo', Math.floor(h / 24));
}
```

- [ ] **Step 3: Modify `renderCard` summary line**

Find in `renderCard`:
```javascript
      <p class="card-summary">${article.summary || ''}${article.summary_zh ? `<span class="summary-zh">${article.summary_zh}</span>` : ''}</p>
```

Replace with:
```javascript
      <p class="card-summary">${getLang() === 'zh' ? (article.summary_zh || article.summary || '') : (article.summary || '')}</p>
```

- [ ] **Step 4: Modify `loadMarketPulse` strings**

Find these four strings inside `loadMarketPulse`:
```javascript
      <span class="pulse-label">MARKET PULSE</span>
      <span class="pulse-time">Based on ${escapeHtml(latest.article_count || '?')} signals · ${timeAgo(latest.created_at)}</span>
```
Replace with:
```javascript
      <span class="pulse-label">${t('marketPulse')}</span>
      <span class="pulse-time">${t('basedOn', escapeHtml(String(latest.article_count || '?')), timeAgo(latest.created_at))}</span>
```

Find:
```javascript
      <span class="pulse-hero-mood">${sentKey.toUpperCase()}</span>
```
Replace with:
```javascript
      <span class="pulse-hero-mood">${t('sentiment')[sentKey] || sentKey.toUpperCase()}</span>
```

Find:
```javascript
      <div class="hist-label">14-DAY HISTORY</div>
      <div class="hist-bars">${bars}</div>
      <div class="hist-dates"><span>${firstDay}</span><span>Today</span></div>
```
Replace with:
```javascript
      <div class="hist-label">${t('histLabel')}</div>
      <div class="hist-bars">${bars}</div>
      <div class="hist-dates"><span>${firstDay}</span><span>${t('today')}</span></div>
```

- [ ] **Step 5: Modify `setLiveStatus`**

Find:
```javascript
  if (label) label.textContent = live ? 'BTC/USD · BINANCE · LIVE' : 'BTC/USD · BINANCE · ~10s';
```
Replace with:
```javascript
  if (label) label.textContent = t('liveLabel', live);
```

- [ ] **Step 6: Modify price snapshot title**

Find:
```javascript
    el.innerHTML = `<div class="sidebar-title">Price Snapshot <span class="live-badge-sm">LIVE</span></div>${rows}`;
```
Replace with:
```javascript
    el.innerHTML = `<div class="sidebar-title">${t('priceSnapshot')} <span class="live-badge-sm">LIVE</span></div>${rows}`;
```

- [ ] **Step 7: Export new functions to window**

Find at the bottom of the file:
```javascript
window.setCategory = setCategory;
```
Add before it:
```javascript
window.toggleLang = toggleLang;
window.applyLangToDOM = applyLangToDOM;
```

- [ ] **Step 8: Verify changes**
```bash
grep -n "t('marketPulse')\|t('histLabel')\|getLang()\|STRINGS\|toggleLang\|applyLangToDOM" /home/test/CryptoLens-site/assets/app.js | head -20
```
Expected: all 6 functions/references appear.

- [ ] **Step 9: Commit**
```bash
cd /home/test/CryptoLens-site
git add assets/app.js
git commit -m "feat: add bilingual EN/ZH support to app.js"
```

---

## Task 2: CryptoLens index.html — toggle button + data-i18n

**Files:**
- Modify: `/home/test/CryptoLens-site/index.html`

- [ ] **Step 1: Add lang toggle button to nav-actions**

Find:
```html
    <button class="btn btn-ghost btn-sm" id="nav-login-btn"  onclick="CL.auth.openLoginModal()">Sign In</button>
    <button class="btn btn-ghost btn-sm hidden" id="nav-logout-btn" onclick="CL.auth.signOut()">Sign Out</button>
```
Replace with:
```html
    <button class="btn btn-ghost btn-sm" id="lang-toggle" onclick="toggleLang()">EN</button>
    <button class="btn btn-ghost btn-sm" id="nav-login-btn"  onclick="CL.auth.openLoginModal()" data-i18n="signIn">Sign In</button>
    <button class="btn btn-ghost btn-sm hidden" id="nav-logout-btn" onclick="CL.auth.signOut()" data-i18n="signOut">Sign Out</button>
```

- [ ] **Step 2: Add data-i18n to section label**

Find:
```html
    <div class="section-label">Today's Top Signal</div>
```
Replace with:
```html
    <div class="section-label" data-i18n="todayTop">Today's Top Signal</div>
```

- [ ] **Step 3: Add data-i18n to load more button**

Find:
```html
        <button id="load-more-btn" onclick="loadFeed()">Load more</button>
```
Replace with:
```html
        <button id="load-more-btn" onclick="loadFeed()" data-i18n="loadMore">Load more</button>
```

- [ ] **Step 4: Add data-i18n to sidebar strings**

Find:
```html
        <div class="sidebar-title">Free Weekly Signal</div>
        <p>Top 10 stories every Monday. No spam.</p>
```
Replace with:
```html
        <div class="sidebar-title" data-i18n="weeklySignal">Free Weekly Signal</div>
        <p data-i18n="weeklyDesc">Top 10 stories every Monday. No spam.</p>
```

Find:
```html
        <button class="btn btn-primary" style="width:100%" onclick="sidebarSubscribe()">Subscribe Free</button>
```
Replace with:
```html
        <button class="btn btn-primary" style="width:100%" onclick="sidebarSubscribe()" data-i18n="subFree">Subscribe Free</button>
```

Find:
```html
        <div class="sidebar-title">Trending Tags</div>
```
Replace with:
```html
        <div class="sidebar-title" data-i18n="trendingTags">Trending Tags</div>
```

Find:
```html
        <span class="aff-label">Sponsored</span>
```
Replace with:
```html
        <span class="aff-label" data-i18n="sponsored">Sponsored</span>
```

- [ ] **Step 5: Call applyLangToDOM in init()**

Find in the `<script>` block:
```javascript
async function init() {
  await CL.auth.initAuth();
```
Replace with:
```javascript
async function init() {
  await CL.auth.initAuth();
  applyLangToDOM();
```

- [ ] **Step 6: Verify**
```bash
grep -c "data-i18n" /home/test/CryptoLens-site/index.html
```
Expected: 8 (todayTop, loadMore, weeklySignal, weeklyDesc, subFree, trendingTags, sponsored, signIn, signOut — at least 7+)

- [ ] **Step 7: Commit**
```bash
cd /home/test/CryptoLens-site
git add index.html
git commit -m "feat: add lang toggle button and data-i18n attributes to CryptoLens"
```

---

## Task 3: StockLens app.js — bilingual support

**Files:**
- Modify: `/home/test/StockLens-site/assets/app.js`

- [ ] **Step 1: Add STRINGS + lang functions after `let hasMore = true;`**

Find this line in `/home/test/StockLens-site/assets/app.js`:
```javascript
let hasMore = true;
```

Replace with:
```javascript
let hasMore = true;

const STRINGS = {
  en: {
    timeJustNow: 'just now',
    timeHAgo: h => `${h}h ago`,
    timeDayAgo: d => `${d}d ago`,
    todayTop: "Today's Top Signal",
    trendingTags: 'Trending Tags',
    weeklySignal: 'Free Weekly Signal',
    weeklyDesc: 'Top 10 stories every Monday. No spam.',
    subFree: 'Subscribe Free',
    sponsored: 'Sponsored',
    loadMore: 'Load more',
    signIn: 'Sign In',
    signOut: 'Sign Out',
    marketPulse: 'MARKET PULSE',
    basedOn: (n, time) => `Based on ${n} signals · ${time}`,
    histLabel: '14-DAY HISTORY',
    today: 'Today',
    sentiment: { bullish: 'BULLISH', bearish: 'BEARISH', neutral: 'NEUTRAL', mixed: 'MIXED' },
    liveLabel: live => live ? 'SPY · FINNHUB · LIVE' : 'SPY · FINNHUB · ~15s',
    priceSnapshot: 'Markets',
  },
  zh: {
    timeJustNow: '刚刚',
    timeHAgo: h => `${h}小时前`,
    timeDayAgo: d => `${d}天前`,
    todayTop: '今日热点',
    trendingTags: '热门标签',
    weeklySignal: '每周免费信号',
    weeklyDesc: '每周一推送10条精选，不发垃圾邮件。',
    subFree: '免费订阅',
    sponsored: '赞助',
    loadMore: '加载更多',
    signIn: '登录',
    signOut: '退出',
    marketPulse: '市场脉搏',
    basedOn: (n, time) => `基于 ${n} 条信号 · ${time}`,
    histLabel: '14天历史',
    today: '今日',
    sentiment: { bullish: '看多', bearish: '看空', neutral: '中性', mixed: '混合' },
    liveLabel: live => live ? 'SPY · FINNHUB · 实时' : 'SPY · FINNHUB · ~15秒',
    priceSnapshot: '市场',
  }
};

function getLang() { return localStorage.getItem('lens_lang') || 'zh'; }
function t(key, ...args) {
  const s = STRINGS[getLang()][key];
  return typeof s === 'function' ? s(...args) : (s ?? key);
}
function setLang(lang) {
  localStorage.setItem('lens_lang', lang);
  applyLangToDOM();
  loadFeed(true);
  loadTodaysTop();
  loadMarketPulse();
}
function toggleLang() { setLang(getLang() === 'zh' ? 'en' : 'zh'); }
function applyLangToDOM() {
  const lang = getLang();
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const s = STRINGS[lang][key];
    if (s && typeof s === 'string') el.textContent = s;
  });
  const toggle = document.getElementById('lang-toggle');
  if (toggle) toggle.textContent = lang === 'zh' ? 'EN' : '中';
}
```

- [ ] **Step 2: Modify `timeAgo`**

Find:
```javascript
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
```
Replace with:
```javascript
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return t('timeJustNow');
  if (h < 24) return t('timeHAgo', h);
  return t('timeDayAgo', Math.floor(h / 24));
}
```

- [ ] **Step 3: Modify `renderCard` summary line**

Find in `renderCard`:
```javascript
      <p class="card-summary">${escapeHtml(article.summary || '')}${article.summary_zh ? `<span class="summary-zh">${escapeHtml(article.summary_zh)}</span>` : ''}</p>
```
Replace with:
```javascript
      <p class="card-summary">${escapeHtml(getLang() === 'zh' ? (article.summary_zh || article.summary || '') : (article.summary || ''))}</p>
```

- [ ] **Step 4: Modify `loadMarketPulse` strings**

Find:
```javascript
      <span class="pulse-label">MARKET PULSE</span>
      <span class="pulse-time">Based on ${escapeHtml(String(latest.article_count || '?'))} signals · ${timeAgo(latest.created_at)}</span>
```
Replace with:
```javascript
      <span class="pulse-label">${t('marketPulse')}</span>
      <span class="pulse-time">${t('basedOn', escapeHtml(String(latest.article_count || '?')), timeAgo(latest.created_at))}</span>
```

Find:
```javascript
      <span class="pulse-hero-mood">${sentKey.toUpperCase()}</span>
```
Replace with:
```javascript
      <span class="pulse-hero-mood">${t('sentiment')[sentKey] || sentKey.toUpperCase()}</span>
```

Find:
```javascript
      <div class="hist-label">14-DAY HISTORY</div>
      <div class="hist-bars">${bars}</div>
      <div class="hist-dates"><span>${firstDay}</span><span>Today</span></div>
```
Replace with:
```javascript
      <div class="hist-label">${t('histLabel')}</div>
      <div class="hist-bars">${bars}</div>
      <div class="hist-dates"><span>${firstDay}</span><span>${t('today')}</span></div>
```

- [ ] **Step 5: Modify `setLiveStatus`**

Find:
```javascript
  if (label) label.textContent = live ? 'SPY · FINNHUB · LIVE' : 'SPY · FINNHUB · ~15s';
```
Replace with:
```javascript
  if (label) label.textContent = t('liveLabel', live);
```

- [ ] **Step 6: Modify price snapshot title**

Find:
```javascript
    el.innerHTML = `<div class="sidebar-title">Markets <span class="live-badge-sm">LIVE</span></div>${rows}`;
```
Replace with:
```javascript
    el.innerHTML = `<div class="sidebar-title">${t('priceSnapshot')} <span class="live-badge-sm">LIVE</span></div>${rows}`;
```

- [ ] **Step 7: Export new functions to window**

Find at the bottom of the file:
```javascript
window.setCategory = setCategory;
```
Add before it:
```javascript
window.toggleLang = toggleLang;
window.applyLangToDOM = applyLangToDOM;
```

- [ ] **Step 8: Verify**
```bash
grep -n "t('marketPulse')\|getLang()\|STRINGS\|toggleLang\|applyLangToDOM" /home/test/StockLens-site/assets/app.js | head -15
```

- [ ] **Step 9: Commit**
```bash
cd /home/test/StockLens-site
git add assets/app.js
git commit -m "feat: add bilingual EN/ZH support to app.js"
```

---

## Task 4: StockLens index.html — toggle button + data-i18n

**Files:**
- Modify: `/home/test/StockLens-site/index.html`

- [ ] **Step 1: Add lang toggle button to nav-actions**

Find:
```html
    <button class="btn btn-ghost btn-sm" id="nav-login-btn"  onclick="CL.auth.openLoginModal()">Sign In</button>
    <button class="btn btn-ghost btn-sm hidden" id="nav-logout-btn" onclick="CL.auth.signOut()">Sign Out</button>
```
Replace with:
```html
    <button class="btn btn-ghost btn-sm" id="lang-toggle" onclick="toggleLang()">EN</button>
    <button class="btn btn-ghost btn-sm" id="nav-login-btn"  onclick="CL.auth.openLoginModal()" data-i18n="signIn">Sign In</button>
    <button class="btn btn-ghost btn-sm hidden" id="nav-logout-btn" onclick="CL.auth.signOut()" data-i18n="signOut">Sign Out</button>
```

- [ ] **Step 2: Add data-i18n to section label**

Find:
```html
    <div class="section-label">Today's Top Signal</div>
```
Replace with:
```html
    <div class="section-label" data-i18n="todayTop">Today's Top Signal</div>
```

- [ ] **Step 3: Add data-i18n to load more button**

Find:
```html
        <button id="load-more-btn" onclick="loadFeed()">Load more</button>
```
Replace with:
```html
        <button id="load-more-btn" onclick="loadFeed()" data-i18n="loadMore">Load more</button>
```

- [ ] **Step 4: Add data-i18n to sidebar strings**

Find:
```html
        <div class="sidebar-title">Free Weekly Signal</div>
        <p>Top 10 stories every Monday. No spam.</p>
```
Replace with:
```html
        <div class="sidebar-title" data-i18n="weeklySignal">Free Weekly Signal</div>
        <p data-i18n="weeklyDesc">Top 10 stories every Monday. No spam.</p>
```

Find:
```html
        <button class="btn btn-primary" style="width:100%" onclick="sidebarSubscribe()">Subscribe Free</button>
```
Replace with:
```html
        <button class="btn btn-primary" style="width:100%" onclick="sidebarSubscribe()" data-i18n="subFree">Subscribe Free</button>
```

Find:
```html
        <div class="sidebar-title">Trending Tags</div>
```
Replace with:
```html
        <div class="sidebar-title" data-i18n="trendingTags">Trending Tags</div>
```

Find:
```html
        <span class="aff-label">Sponsored</span>
```
Replace with:
```html
        <span class="aff-label" data-i18n="sponsored">Sponsored</span>
```

- [ ] **Step 5: Call applyLangToDOM in init()**

Find in the `<script>` block:
```javascript
async function init() {
  await CL.auth.initAuth();
```
Replace with:
```javascript
async function init() {
  await CL.auth.initAuth();
  applyLangToDOM();
```

- [ ] **Step 6: Verify**
```bash
grep -c "data-i18n" /home/test/StockLens-site/index.html
```
Expected: 8+

- [ ] **Step 7: Commit**
```bash
cd /home/test/StockLens-site
git add index.html
git commit -m "feat: add lang toggle button and data-i18n attributes to StockLens"
```

---

## Task 5: Push both sites

- [ ] **Step 1: Push CryptoLens**
```bash
cd /home/test/CryptoLens-site && git push origin main
```

- [ ] **Step 2: Push StockLens**
```bash
cd /home/test/StockLens-site && git push origin main
```

- [ ] **Step 3: Verify**
```bash
cd /home/test/CryptoLens-site && git log --oneline -3
cd /home/test/StockLens-site && git log --oneline -3
```
Expected: both show 2 new commits (app.js + index.html) on top.

---

## Self-Review

- [x] Spec coverage: STRINGS in both app.js ✓ · toggle button both index.html ✓ · timeAgo ✓ · renderCard summary pick ✓ · loadMarketPulse strings ✓ · setLiveStatus ✓ · price snapshot title ✓ · localStorage persist ✓ · applyLangToDOM on init ✓
- [x] No placeholders — all code is complete
- [x] Type consistency — `t()`, `getLang()`, `STRINGS` same signature in both files
