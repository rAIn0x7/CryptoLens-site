# MetalLens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build MetalLens at `/home/test/MetalLens-site/` — a precious metals & commodities AI intelligence site at metals.qizh.space, mirroring StockLens architecture with bilingual support built in from day one.

**Architecture:** Pure static HTML/CSS/JS, GitHub Pages deployment. Shared Supabase project (new `metal_articles` + `metal_pulses` tables). Finnhub REST polling for XAU/USD price and candles (no WebSocket — forex not on free-tier WS). Cross-navigation to both CryptoLens and StockLens.

**Tech Stack:** Vanilla HTML/CSS/JS · Supabase JS v2 · Finnhub REST (forex endpoints) · Lemon Squeezy (shared) · GitHub Pages

---

## Key differences from StockLens

| StockLens | MetalLens |
|---|---|
| SPY WebSocket | XAU REST poll every 15s (no WS on free tier) |
| `/stock/candle` endpoint | `/forex/candle` endpoint |
| `symbol=SPY` | `symbol=OANDA:XAU_USD` |
| Categories: tech/elon/macro/earnings/ai | Categories: gold/silver/oil/macro/ai |
| 5 stocks snapshot | 5 metals snapshot (XAU/XAG/XCU/XPT/OIL) |
| CRYPTO ↗ cross-link | CRYPTO ↗ + STOCKS ↗ cross-links |
| `stock_articles` / `stock_pulses` tables | `metal_articles` / `metal_pulses` tables |

---

## File Map

| File | Action |
|---|---|
| `/home/test/MetalLens-site/` | Create |
| `CNAME` | Create — `metals.qizh.space` |
| `index.html` | Create |
| `subscribe.html` | Create (copy+adapt from StockLens) |
| `about.html` | Create (copy+adapt from StockLens) |
| `privacy.html` | Create (copy+adapt from StockLens) |
| `assets/config.js` | Create |
| `assets/auth.js` | Copy from CryptoLens |
| `assets/affiliate.js` | Copy from CryptoLens |
| `assets/style.css` | Copy from StockLens + metal badge classes |
| `assets/app.js` | Create (bilingual, forex endpoints) |
| `supabase-metallens-migration.sql` | Create |
| `/home/test/CryptoLens-site/index.html` | Modify — add METALS ↗ link |
| `/home/test/StockLens-site/index.html` | Modify — add METALS ↗ link |

---

## Task 1: Project Scaffold

**Files:**
- Create: `/home/test/MetalLens-site/` + `CNAME`

- [ ] **Step 1: Create directories and git repo**
```bash
mkdir -p /home/test/MetalLens-site/assets
cd /home/test/MetalLens-site
git init
git checkout -b main
```

- [ ] **Step 2: Create CNAME**
```bash
echo "metals.qizh.space" > /home/test/MetalLens-site/CNAME
```

- [ ] **Step 3: Initial commit**
```bash
cd /home/test/MetalLens-site
git add CNAME
git commit -m "chore: initial scaffold"
```

- [ ] **Step 4: Verify**
```bash
cat /home/test/MetalLens-site/CNAME
cd /home/test/MetalLens-site && git log --oneline
```
Expected: `metals.qizh.space`, 1 commit.

---

## Task 2: Supabase SQL Migration

**Files:**
- Create: `/home/test/MetalLens-site/supabase-metallens-migration.sql`

> User runs this manually in: https://supabase.com/dashboard/project/uzvguynixndzusrlqryo/sql

- [ ] **Step 1: Create migration file**

Create `/home/test/MetalLens-site/supabase-metallens-migration.sql`:

```sql
-- MetalLens tables — run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS metal_articles (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       timestamptz DEFAULT now(),
  published_at     timestamptz DEFAULT now(),
  title            text        NOT NULL,
  summary          text,
  summary_zh       text,
  source_name      text,
  original_url     text,
  category         text,        -- gold | silver | oil | macro | ai
  importance_score numeric      DEFAULT 7,
  tags             text[]       DEFAULT '{}',
  is_pro           boolean      DEFAULT false,
  editor_note      text
);

CREATE TABLE IF NOT EXISTS metal_pulses (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       timestamptz DEFAULT now(),
  sentiment        text        DEFAULT 'neutral',  -- bullish | bearish | neutral | mixed
  sentiment_score  numeric     DEFAULT 0,          -- -100 to 100
  article_count    integer     DEFAULT 0,
  summary_en       text,
  key_themes       text[]      DEFAULT '{}'
);

ALTER TABLE metal_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON metal_articles FOR SELECT USING (true);

ALTER TABLE metal_pulses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON metal_pulses FOR SELECT USING (true);

-- Sample data
INSERT INTO metal_pulses (sentiment, sentiment_score, article_count, summary_en, key_themes)
VALUES (
  'bullish', 38, 22,
  'Gold rallies on Fed rate cut expectations and safe-haven demand amid geopolitical tensions. Silver follows. Oil steady on OPEC+ production discipline.',
  ARRAY['XAU', 'Fed policy', 'safe-haven', 'OPEC+']
);

INSERT INTO metal_articles (title, summary, source_name, original_url, category, importance_score, tags)
VALUES
  ('Gold Hits $2,400 on Fed Rate Cut Bets',
   'Gold surged to $2,400/oz as traders priced in earlier Fed rate cuts following softer CPI data.',
   'Reuters', 'https://reuters.com', 'gold', 9, ARRAY['XAU', 'Fed', 'rate-cut']),
  ('Silver Outperforms on Industrial Demand Surge',
   'Silver gained 4% this week, driven by solar panel manufacturing demand and gold''s rally.',
   'Bloomberg', 'https://bloomberg.com', 'silver', 8, ARRAY['XAG', 'solar', 'industrial']),
  ('OPEC+ Extends Output Cuts Through Q3',
   'OPEC+ agrees to maintain production discipline, supporting Brent crude above $85/barrel.',
   'FT', 'https://ft.com', 'oil', 8, ARRAY['oil', 'OPEC', 'supply']),
  ('Central Banks Add Record Gold Reserves',
   'Global central banks purchased 290 tonnes of gold in Q1, the highest in decades.',
   'WSJ', 'https://wsj.com', 'gold', 8, ARRAY['XAU', 'central-banks', 'reserves']),
  ('Copper Rally Signals Global Growth Optimism',
   'Copper prices hit 2-year highs as China manufacturing PMI beats expectations.',
   'CNBC', 'https://cnbc.com', 'macro', 7, ARRAY['XCU', 'China', 'PMI']);
```

- [ ] **Step 2: Commit**
```bash
cd /home/test/MetalLens-site
git add supabase-metallens-migration.sql
git commit -m "feat: add Supabase migration for metal_articles and metal_pulses"
```

---

## Task 3: Config + Auth Assets

**Files:**
- Create: `assets/config.js`
- Copy: `assets/auth.js`, `assets/affiliate.js`

- [ ] **Step 1: Create config.js**

Create `/home/test/MetalLens-site/assets/config.js`:
```javascript
const SUPABASE_URL      = 'https://uzvguynixndzusrlqryo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_tHr8G_hSTCG9kDYpC48_bg_CWjXpeLN';
const LS_STORE           = 'YOUR_STORE_SLUG';
const LS_MONTHLY_VARIANT = 'YOUR_MONTHLY_VARIANT_ID';
const LS_YEARLY_VARIANT  = 'YOUR_YEARLY_VARIANT_ID';
const FINNHUB_API_KEY    = 'd87eb1hr01ql0hsle8r0d87eb1hr01ql0hsle8rg';
```

- [ ] **Step 2: Copy auth + affiliate**
```bash
cp /home/test/CryptoLens-site/assets/auth.js /home/test/MetalLens-site/assets/auth.js
cp /home/test/CryptoLens-site/assets/affiliate.js /home/test/MetalLens-site/assets/affiliate.js
```

- [ ] **Step 3: Commit**
```bash
cd /home/test/MetalLens-site
git add assets/
git commit -m "feat: add config, auth, affiliate assets"
```

---

## Task 4: style.css

**Files:**
- Create: `assets/style.css` (copy StockLens + metal badge classes)

- [ ] **Step 1: Copy StockLens CSS**
```bash
cp /home/test/StockLens-site/assets/style.css /home/test/MetalLens-site/assets/style.css
```

- [ ] **Step 2: Append metal badge classes at end of file**

Append to `/home/test/MetalLens-site/assets/style.css`:
```css
/* ── METALLENS: Category badge colours ── */
.badge-cat-gold    { background: rgba(201,168,76,.18);  color: #c9a84c; }
.badge-cat-silver  { background: rgba(172,172,184,.18); color: #b0b0bc; }
.badge-cat-oil     { background: rgba(255,150,50,.15);  color: #ff9632; }
.badge-cat-macro   { background: rgba(255,211,42,.15);  color: #ffd32a; }
.badge-cat-ai      { background: rgba(162,155,254,.15); color: #a29bfe; }
```

Note: `.price-row` and `.pr-*` classes are already in the copied StockLens CSS — no need to add them again.

- [ ] **Step 3: Verify**
```bash
tail -10 /home/test/MetalLens-site/assets/style.css
```
Expected: shows metal badge classes.

- [ ] **Step 4: Commit**
```bash
cd /home/test/MetalLens-site
git add assets/style.css
git commit -m "feat: add style.css with metal badge classes"
```

---

## Task 5: index.html

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create index.html**

Create `/home/test/MetalLens-site/index.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="MetalLens — Filtered commodities × AI intelligence. Gold, silver, oil signals daily.">
<title>MetalLens — Commodities × AI Intelligence</title>
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-2184467660826262" crossorigin="anonymous"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>

<!-- AUTH MODAL -->
<div class="modal-overlay hidden" id="auth-modal">
  <div class="modal" style="position:relative">
    <button class="modal-close" onclick="CL.auth.closeLoginModal()">×</button>
    <h2>Sign in to MetalLens</h2>
    <p>Enter your email — we'll send a magic link. No password needed.</p>
    <input type="email" id="modal-email" placeholder="you@example.com">
    <button class="btn btn-primary" style="width:100%" onclick="handleModalLogin()">Send Magic Link</button>
    <p class="msg" id="modal-msg"></p>
  </div>
</div>

<!-- NAV -->
<nav class="nav">
  <span class="nav-logo">METAL<span>LENS</span></span>
  <div class="nav-filters">
    <button class="nav-filter active" data-cat="all"    onclick="setCategory('all')">ALL</button>
    <button class="nav-filter" data-cat="gold"          onclick="setCategory('gold')">GOLD</button>
    <button class="nav-filter" data-cat="silver"        onclick="setCategory('silver')">SILVER</button>
    <button class="nav-filter" data-cat="oil"           onclick="setCategory('oil')">OIL</button>
    <button class="nav-filter" data-cat="macro"         onclick="setCategory('macro')">MACRO</button>
    <button class="nav-filter" data-cat="ai"            onclick="setCategory('ai')">AI</button>
  </div>
  <div class="nav-actions">
    <span class="badge badge-cat-gold hidden" id="nav-pro-label">PRO</span>
    <a href="https://lens.qizh.space" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">CRYPTO ↗</a>
    <a href="https://stocks.qizh.space" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">STOCKS ↗</a>
    <button class="btn btn-ghost btn-sm" id="lang-toggle" onclick="toggleLang()">EN</button>
    <button class="btn btn-ghost btn-sm" id="nav-login-btn"  onclick="CL.auth.openLoginModal()" data-i18n="signIn">Sign In</button>
    <button class="btn btn-ghost btn-sm hidden" id="nav-logout-btn" onclick="CL.auth.signOut()" data-i18n="signOut">Sign Out</button>
    <a href="subscribe.html" class="btn btn-primary btn-sm">Subscribe</a>
  </div>
</nav>

<!-- MARKET PULSE HERO -->
<div class="pulse-hero" id="pulse-hero">
  <div class="pulse-hero-glow"></div>
  <div class="container">
    <div class="pulse-hero-grid">
      <div class="pulse-hero-inner" id="pulse-card">
        <div class="card skeleton" style="height:200px"></div>
      </div>
      <div class="btc-panel">
        <div class="btc-meta">
          <span class="live-ring" id="live-ring"></span>
          <span id="live-status">XAU · FINNHUB</span>
        </div>
        <div class="btc-price-row">
          <span class="btc-big" id="gold-price">—</span>
          <span class="btc-chg" id="gold-chg"></span>
        </div>
        <div class="btc-range" id="gold-range"></div>
        <div id="gold-chart"></div>
        <div id="fear-greed-block" style="display:none"></div>
      </div>
    </div>
  </div>
</div>

<div class="container">
  <!-- TODAY'S TOP -->
  <div class="top-section">
    <div class="section-label" data-i18n="todayTop">Today's Top Signal</div>
    <div class="top-grid" id="top-grid">
      <div class="card skeleton" style="height:160px"></div>
      <div class="card skeleton" style="height:160px"></div>
      <div class="card skeleton" style="height:160px"></div>
    </div>
  </div>

  <!-- MAIN GRID -->
  <div class="page-grid">
    <main>
      <div class="feed" id="feed">
        <div class="card skeleton" style="height:140px"></div>
        <div class="card skeleton" style="height:140px"></div>
        <div class="card skeleton" style="height:140px"></div>
      </div>
      <div class="load-more">
        <button id="load-more-btn" onclick="loadFeed()" data-i18n="loadMore">Load more</button>
      </div>
    </main>

    <aside class="sidebar">
      <div class="sidebar-block" id="price-snapshot-block" style="display:none"></div>

      <div class="sidebar-block sidebar-subscribe">
        <div class="sidebar-title" data-i18n="weeklySignal">Free Weekly Signal</div>
        <p data-i18n="weeklyDesc">Top 10 stories every Monday. No spam.</p>
        <input type="email" id="sidebar-email" placeholder="your@email.com">
        <button class="btn btn-primary" style="width:100%" onclick="sidebarSubscribe()" data-i18n="subFree">Subscribe Free</button>
        <p class="msg" id="sidebar-msg"></p>
      </div>

      <div class="sidebar-block">
        <div class="sidebar-title" data-i18n="trendingTags">Trending Tags</div>
        <div class="sidebar-tags" id="sidebar-tags"></div>
      </div>

      <div class="sidebar-block affiliate-block">
        <span class="aff-label" data-i18n="sponsored">Sponsored</span>
        <p>Trade gold & commodities on <a href="https://accounts.binance.com/register?ref=YOUR_REF" target="_blank" rel="noopener" onclick="CL.affiliate.track('binance', null)">Binance</a> — earn rebates on every trade.</p>
      </div>
    </aside>
  </div>
</div>

<footer class="footer">
  <p class="footer-disclaimer">MetalLens aggregates information from third-party sources for informational purposes only. Nothing on this site constitutes financial or investment advice. Commodity investments carry significant risk.</p>
  <div class="footer-links">
    <a href="index.html">Home</a>
    <a href="subscribe.html">Subscribe</a>
    <a href="about.html">About</a>
    <a href="privacy.html">Privacy Policy</a>
  </div>
</footer>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="assets/config.js"></script>
<script src="assets/auth.js"></script>
<script src="assets/app.js"></script>
<script src="assets/affiliate.js"></script>
<script>
async function init() {
  await CL.auth.initAuth();
  applyLangToDOM();
  await Promise.all([
    loadTodaysTop(),
    loadMarketPulse(),
    loadSidebarTags(),
    loadHourlyChart(),
    loadPriceSnapshot(),
  ]);
  initGoldPricePoll();
  await loadFeed(true);
}

async function handleModalLogin() {
  const email = document.getElementById('modal-email').value.trim();
  const msg = document.getElementById('modal-msg');
  const error = await CL.auth.sendMagicLink(email);
  if (error) { msg.className = 'msg msg-error'; msg.textContent = error.message; }
  else { msg.className = 'msg msg-success'; msg.textContent = 'Check your email for the magic link!'; }
}

async function sidebarSubscribe() {
  const email = document.getElementById('sidebar-email').value.trim();
  const msg = document.getElementById('sidebar-msg');
  const { error } = await handleSubscribe(email);
  if (error) { msg.className = 'msg msg-error'; msg.textContent = 'Already subscribed or invalid email.'; }
  else { msg.className = 'msg msg-success'; msg.textContent = 'Subscribed! Check your inbox Monday.'; }
}

document.addEventListener('authChanged', () => { loadFeed(true); loadTodaysTop(); });

init();
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**
```bash
cd /home/test/MetalLens-site
git add index.html
git commit -m "feat: add index.html structure"
```

---

## Task 6: app.js — Feed, Pulse, Bilingual

**Files:**
- Create: `assets/app.js`

- [ ] **Step 1: Create assets/app.js**

Create `/home/test/MetalLens-site/assets/app.js` with this exact content:

```javascript
// Requires: auth.js loaded first (sets window.CL.supabase)
const PAGE_SIZE = 20;
let currentOffset = 0;
let currentCategory = 'all';
let currentTag = null;
let isLoading = false;
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
    liveLabel: () => 'XAU · FINNHUB · ~15s',
    priceSnapshot: 'Metals',
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
    liveLabel: () => 'XAU · FINNHUB · ~15秒',
    priceSnapshot: '金属',
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

const CAT_BADGE_CLASS = {
  gold: 'badge-cat-gold', silver: 'badge-cat-silver',
  oil: 'badge-cat-oil', macro: 'badge-cat-macro', ai: 'badge-cat-ai'
};

function scoreClass(score) {
  if (score >= 9) return 'score-pro';
  if (score >= 8) return 'score-high';
  return 'score-mid';
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return t('timeJustNow');
  if (h < 24) return t('timeHAgo', h);
  return t('timeDayAgo', Math.floor(h / 24));
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function renderEditorNote(article) {
  if (article.editor_note) {
    return `
      <div class="editor-note-wrap">
        <div class="editor-note-label">Editor's Take</div>
        <div class="editor-note">${escapeHtml(article.editor_note)}</div>
      </div>`;
  }
  if (article.is_pro && !window.CL.isPro()) {
    return `
      <div class="editor-note-wrap">
        <div class="editor-note-label">Editor's Take</div>
        <div class="paywall-blur">
          <div class="editor-note" style="filter:blur(4px);user-select:none;">
            This analysis covers key market implications and strategic context
            for investors monitoring this development closely.
          </div>
          <div class="paywall-cta">
            <span>Pro only —</span>
            <a href="subscribe.html">Upgrade</a>
          </div>
        </div>
      </div>`;
  }
  return '';
}

function renderCard(article, isTop) {
  const catClass = CAT_BADGE_CLASS[article.category] || 'badge-cat-gold';
  const tags = (article.tags || []).slice(0, 4).map(tag =>
    `<span class="tag" onclick="filterByTag('${escapeHtml(tag)}')">#${escapeHtml(tag)}</span>`
  ).join('');
  const url = escapeHtml(article.original_url || '#');
  const summary = getLang() === 'zh' ? (article.summary_zh || article.summary || '') : (article.summary || '');

  return `
    <div class="card ${isTop ? 'top-card' : ''} ${article.is_pro ? 'pro-card' : ''}"
         onclick="openArticle('${url}')">
      <div class="card-meta">
        <span class="card-source">${escapeHtml(article.source_name || 'Unknown')} · ${timeAgo(article.published_at)}</span>
        <div class="card-badges">
          <span class="badge ${catClass}">${escapeHtml(article.category || 'gold')}</span>
          <span class="score-badge ${scoreClass(article.importance_score)}">●${escapeHtml(String(article.importance_score ?? 7))}</span>
        </div>
      </div>
      <a class="card-title" href="${url}" target="_blank"
         rel="noopener" onclick="event.stopPropagation()">
        ${escapeHtml(article.title)}
      </a>
      <p class="card-summary">${escapeHtml(summary)}</p>
      ${tags ? `<div class="card-tags">${tags}</div>` : ''}
      ${renderEditorNote(article)}
    </div>`;
}

async function loadTodaysTop() {
  const sb = window.CL.supabase;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await sb
    .from('metal_articles')
    .select('*')
    .gte('published_at', since)
    .gte('importance_score', 8)
    .order('importance_score', { ascending: false })
    .limit(5);

  const container = document.getElementById('top-grid');
  if (!container) return;
  if (!data?.length) { container.closest('.top-section')?.classList.add('hidden'); return; }
  container.innerHTML = data.map(a => renderCard(a, true)).join('');
}

async function loadFeed(reset) {
  if (isLoading || (!hasMore && !reset)) return;
  if (reset) { currentOffset = 0; hasMore = true; }
  isLoading = true;
  const sb = window.CL.supabase;

  let q = sb.from('metal_articles').select('*')
    .order('importance_score', { ascending: false })
    .order('published_at', { ascending: false });
  if (currentCategory !== 'all') q = q.eq('category', currentCategory);
  if (currentTag) q = q.contains('tags', [currentTag]);
  q = q.range(currentOffset, currentOffset + PAGE_SIZE - 1);

  let data;
  try {
    const res = await q;
    data = res.data;
  } catch (e) {
    isLoading = false;
    return;
  }
  isLoading = false;

  if (!data?.length) { hasMore = false; _hideLoadMore(); return; }
  if (data.length < PAGE_SIZE) { hasMore = false; _hideLoadMore(); }

  const container = document.getElementById('feed');
  if (!container) return;
  if (reset) container.innerHTML = '';
  container.insertAdjacentHTML('beforeend', data.map(a => renderCard(a, false)).join(''));
  currentOffset += data.length;
}

function _hideLoadMore() {
  document.getElementById('load-more-btn')?.closest('.load-more')?.classList.add('hidden');
}

function setCategory(cat) {
  currentCategory = cat;
  currentTag = null;
  document.querySelectorAll('.nav-filter').forEach(el => {
    el.classList.toggle('active', el.dataset.cat === cat);
  });
  loadFeed(true);
}

function filterByTag(tag) {
  currentTag = tag;
  currentCategory = 'all';
  document.querySelectorAll('.nav-filter').forEach(el => el.classList.remove('active'));
  loadFeed(true);
}

function openArticle(url) {
  if (url && url !== '#') window.open(url, '_blank', 'noopener');
}

async function loadSidebarTags() {
  const sb = window.CL.supabase;
  const { data } = await sb.from('metal_articles').select('tags').limit(100);
  const counts = {};
  (data || []).forEach(a => (a.tags || []).forEach(tag => { counts[tag] = (counts[tag] || 0) + 1; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const container = document.getElementById('sidebar-tags');
  if (!container) return;
  container.innerHTML = top.map(([tag]) =>
    `<span class="tag" onclick="filterByTag('${escapeHtml(tag)}')">#${escapeHtml(tag)}</span>`
  ).join('');
}

async function handleSubscribe(email) {
  if (!email || !email.includes('@')) return { error: 'Invalid email' };
  const sb = window.CL.supabase;
  const { error } = await sb.from('subscribers').insert({ email });
  return { error };
}

async function loadMarketPulse() {
  const sb = window.CL.supabase;
  const { data } = await sb
    .from('metal_pulses')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  const container = document.getElementById('pulse-card');
  const hero = document.getElementById('pulse-hero');
  if (!container) return;

  if (!data?.length) {
    container.innerHTML = '<p class="pulse-empty">Market pulse will appear after the next fetch cycle.</p>';
    return;
  }

  const latest  = data[0];
  const sentKey = ['bullish','bearish','neutral','mixed'].includes(latest.sentiment) ? latest.sentiment : 'neutral';
  const sign    = latest.sentiment_score > 0 ? '+' : '';
  const themes  = (latest.key_themes || []).map(th => `<span class="tag">#${escapeHtml(th)}</span>`).join('');
  if (hero) hero.className = `pulse-hero pulse-${sentKey}`;

  const byDay = {};
  data.forEach(r => {
    const day = (r.created_at || '').slice(0, 10);
    if (!day) return;
    if (!byDay[day]) byDay[day] = { scores: [], sentiments: [] };
    byDay[day].scores.push(Number(r.sentiment_score) || 0);
    byDay[day].sentiments.push(r.sentiment || 'neutral');
  });
  const days = Object.keys(byDay).sort().slice(-14).map(day => {
    const scores = byDay[day].scores;
    const avg    = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const cnt    = {};
    byDay[day].sentiments.forEach(s => { cnt[s] = (cnt[s] || 0) + 1; });
    const sentiment = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0][0];
    return { day, score: avg, sentiment };
  });

  const COLOR    = { bullish:'#00c896', bearish:'#ff4757', neutral:'#ffd32a', mixed:'#a29bfe' };
  const maxScore = Math.max(...days.map(d => Math.abs(d.score)), 1);
  const bars = days.map(d => {
    const c  = COLOR[d.sentiment] || '#ffd32a';
    const h  = Math.max(Math.round((Math.abs(d.score) / maxScore) * 100), 4);
    const op = Math.min(0.4 + Math.abs(d.score) / 100 * 0.6, 1.0).toFixed(2);
    return `<div class="hist-bar" style="height:${h}%;background:${c};opacity:${op}"></div>`;
  }).join('');
  const firstDay = days[0]?.day
    ? new Date(days[0].day + 'T12:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric' })
    : '';

  container.innerHTML = `
    <div class="pulse-hero-meta">
      <span class="pulse-label">${t('marketPulse')}</span>
      <span class="pulse-time">${t('basedOn', escapeHtml(String(latest.article_count || '?')), timeAgo(latest.created_at))}</span>
    </div>
    <div class="pulse-hero-sentiment">
      <span class="pulse-hero-mood">${t('sentiment')[sentKey] || sentKey.toUpperCase()}</span>
      <span class="pulse-hero-score">${sign}${escapeHtml(String(latest.sentiment_score))}</span>
    </div>
    <p class="pulse-hero-en">${escapeHtml(latest.summary_en)}</p>
    ${themes ? `<div class="pulse-hero-themes">${themes}</div>` : ''}
    ${days.length > 0 ? `
    <div class="hero-hist-bars">
      <div class="hist-label">${t('histLabel')}</div>
      <div class="hist-bars">${bars}</div>
      <div class="hist-dates"><span>${firstDay}</span><span>${t('today')}</span></div>
    </div>` : ''}`;
}

window.toggleLang = toggleLang;
window.applyLangToDOM = applyLangToDOM;
window.setCategory = setCategory;
window.filterByTag = filterByTag;
window.openArticle = openArticle;
window.handleSubscribe = handleSubscribe;
window.loadFeed = loadFeed;
window.loadTodaysTop = loadTodaysTop;
window.loadSidebarTags = loadSidebarTags;
window.loadMarketPulse = loadMarketPulse;
```

- [ ] **Step 2: Verify**
```bash
wc -l /home/test/MetalLens-site/assets/app.js
```
Expected: ~200+ lines

- [ ] **Step 3: Commit**
```bash
cd /home/test/MetalLens-site
git add assets/app.js
git commit -m "feat: app.js feed, pulse, bilingual"
```

---

## Task 7: app.js — Gold Price Poll + Hourly Chart

**Files:**
- Modify: `assets/app.js` (append)

- [ ] **Step 1: Append gold price + chart to app.js**

Append to end of `/home/test/MetalLens-site/assets/app.js`:

```javascript
/* ── HOURLY CHART (forex candle) ── */
let _hourlyChartTimer = null;

function fmtK(p) {
  return p >= 1000 ? '$' + (p / 1000).toFixed(1) + 'k' : '$' + p.toFixed(2);
}

function renderHourlyChart(closes) {
  const W = 380, H = 88;
  const PL = 4, PR = 44, PT = 12, PB = 8;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const pad = (max - min) * 0.15 || min * 0.005;
  const lo = min - pad, hi = max + pad;
  const scaleY = plotH / (hi - lo);
  const toY = p => PT + plotH - (p - lo) * scaleY;
  const n = closes.length;
  const step = plotW / Math.max(n - 1, 1);
  const pts = closes.map((p, i) => ({ x: PL + i * step, y: toY(p) }));
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const fillD = pathD + ` L${pts[pts.length-1].x.toFixed(1)},${(PT+plotH).toFixed(1)} L${PL},${(PT+plotH).toFixed(1)} Z`;
  const lx = pts[pts.length-1].x.toFixed(1);
  const ly = pts[pts.length-1].y.toFixed(1);
  const hiY = toY(max).toFixed(1);
  const loY = toY(min).toFixed(1);
  const ax = W - PR + 5;
  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:88px;display:block">
  <defs>
    <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#c9a84c" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#c9a84c" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <line x1="${PL}" y1="${(PT+plotH*0.25).toFixed(1)}" x2="${W-PR}" y2="${(PT+plotH*0.25).toFixed(1)}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="4,3"/>
  <line x1="${PL}" y1="${(PT+plotH*0.60).toFixed(1)}" x2="${W-PR}" y2="${(PT+plotH*0.60).toFixed(1)}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="4,3"/>
  <line x1="${W-PR}" y1="${PT}" x2="${W-PR}" y2="${(PT+plotH).toFixed(1)}" stroke="rgba(201,168,76,0.12)" stroke-width="1"/>
  <path d="${fillD}" fill="url(#hg)"/>
  <path d="${pathD}" fill="none" stroke="#c9a84c" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="${lx}" cy="${ly}" r="3.5" fill="#c9a84c" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
  <circle cx="${lx}" cy="${ly}" r="7" fill="none" stroke="#c9a84c" stroke-width="1" opacity="0.3"/>
  <text x="${ax}" y="${(parseFloat(hiY)+8).toFixed(1)}" font-size="7" fill="rgba(201,168,76,0.65)" font-family="JetBrains Mono,monospace">${fmtK(max)}</text>
  <text x="${ax}" y="${(parseFloat(loY)-2).toFixed(1)}" font-size="7" fill="rgba(201,168,76,0.45)" font-family="JetBrains Mono,monospace">${fmtK(min)}</text>
</svg>`;
}

async function loadHourlyChart() {
  const el = document.getElementById('gold-chart');
  if (!el) return;
  try {
    const now  = Math.floor(Date.now() / 1000);
    const from = now - 86400;
    const url  = `https://finnhub.io/api/v1/forex/candle?symbol=OANDA:XAU_USD&resolution=60&from=${from}&to=${now}&token=${FINNHUB_API_KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d.c || d.s !== 'ok' || d.c.length < 2) return;

    const sb = window.CL.supabase;
    const { data: pulses } = await sb
      .from('metal_pulses')
      .select('sentiment_score, sentiment')
      .order('created_at', { ascending: false })
      .limit(12);

    const COLOR = { bullish:'#00c896', bearish:'#ff4757', neutral:'#ffd32a', mixed:'#a29bfe' };
    const band = pulses?.length ? '<div class="sent-band">' +
      [...pulses].reverse().map(p => {
        const c  = COLOR[p.sentiment] || '#ffd32a';
        const op = Math.min(0.4 + Math.abs(p.sentiment_score || 0) / 100 * 0.6, 1.0).toFixed(2);
        return `<div class="sb-seg" style="background:${c};opacity:${op}"></div>`;
      }).join('') + '</div>' : '';

    el.innerHTML = renderHourlyChart(d.c) + band +
      `<div class="chart-foot"><span>24h ago</span><span style="color:rgba(255,255,255,0.1)">▓ sentiment</span><span>now</span></div>`;
  } catch (e) {
    console.warn('[loadHourlyChart]', e.message);
  }
  if (_hourlyChartTimer) clearTimeout(_hourlyChartTimer);
  _hourlyChartTimer = setTimeout(loadHourlyChart, 30 * 60 * 1000);
}

/* ── GOLD PRICE POLL (REST only — forex WS requires paid Finnhub plan) ── */
let _lastGoldPrice = null;

function updateGoldPrice(price, pct) {
  const priceEl = document.getElementById('gold-price');
  const chgEl   = document.getElementById('gold-chg');
  if (!priceEl) return;

  if (_lastGoldPrice !== null) {
    priceEl.style.color = price > _lastGoldPrice ? '#c9a84c' : price < _lastGoldPrice ? '#ff4757' : '';
    setTimeout(() => { if (priceEl) priceEl.style.color = ''; }, 800);
  }
  _lastGoldPrice = price;
  priceEl.textContent = '$' + price.toFixed(2);

  if (pct !== null && pct !== undefined) {
    const sign = pct >= 0 ? '▲ +' : '▼ ';
    if (chgEl) { chgEl.textContent = sign + Math.abs(pct).toFixed(2) + '%'; chgEl.style.color = pct >= 0 ? '#c9a84c' : '#ff4757'; }
  }
}

function setLiveStatus() {
  const ring  = document.getElementById('live-ring');
  const label = document.getElementById('live-status');
  if (ring)  ring.style.background = 'rgba(201,168,76,0.6)';
  if (label) label.textContent = t('liveLabel')();
}

function initGoldPricePoll() {
  setLiveStatus();
  async function poll() {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=OANDA:XAU_USD&token=${FINNHUB_API_KEY}`);
      const d = await r.json();
      if (d.c) {
        updateGoldPrice(d.c, d.dp);
        const rangeEl = document.getElementById('gold-range');
        if (rangeEl && d.h && d.l)
          rangeEl.textContent = `Day 低: $${d.l.toFixed(2)} · 高: $${d.h.toFixed(2)} · Prev: $${d.pc?.toFixed(2) ?? '—'}`;
      }
    } catch (e) { console.warn('[XAU poll]', e.message); }
  }
  poll();
  setInterval(poll, 15000);
}

window.loadHourlyChart = loadHourlyChart;
window.initGoldPricePoll = initGoldPricePoll;
```

- [ ] **Step 2: Verify**
```bash
wc -l /home/test/MetalLens-site/assets/app.js
grep -n "loadHourlyChart\|initGoldPricePoll\|OANDA:XAU_USD\|forex/candle\|updateGoldPrice" /home/test/MetalLens-site/assets/app.js | head -10
```
Expected: 350+ lines, all 5 functions present.

- [ ] **Step 3: Commit**
```bash
cd /home/test/MetalLens-site
git add assets/app.js
git commit -m "feat: app.js gold price poll and hourly chart"
```

---

## Task 8: app.js — Metals Price Snapshot

**Files:**
- Modify: `assets/app.js` (append)

- [ ] **Step 1: Append metals snapshot to app.js**

Append to end of `/home/test/MetalLens-site/assets/app.js`:

```javascript
/* ── METALS PRICE SNAPSHOT ── */
const SNAPSHOT_SYMS = ['OANDA:XAU_USD','OANDA:XAG_USD','OANDA:XCU_USD','OANDA:XPT_USD','OANDA:BCO_USD'];
const SNAPSHOT_DISPLAY = {
  'OANDA:XAU_USD': 'XAU', 'OANDA:XAG_USD': 'XAG',
  'OANDA:XCU_USD': 'XCU', 'OANDA:XPT_USD': 'XPT', 'OANDA:BCO_USD': 'OIL'
};
const SNAPSHOT_META = {
  'OANDA:XAU_USD': 'Gold', 'OANDA:XAG_USD': 'Silver',
  'OANDA:XCU_USD': 'Copper', 'OANDA:XPT_USD': 'Platinum', 'OANDA:BCO_USD': 'Brent'
};
let _priceSnapshotTimer = null;

function _sparkPoints(closes) {
  if (!closes?.length) return '';
  const min = Math.min(...closes), max = Math.max(...closes);
  const range = max - min || 1;
  return closes.map((p, i) => {
    const x = (i / (closes.length - 1)) * 50;
    const y = 18 - ((p - min) / range) * 16;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
}

async function loadPriceSnapshot() {
  const el = document.getElementById('price-snapshot-block');
  if (!el) return;
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - 3600;

    const [quotesArr, candlesArr] = await Promise.all([
      Promise.all(SNAPSHOT_SYMS.map(s =>
        fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(s)}&token=${FINNHUB_API_KEY}`).then(r => r.json())
      )),
      Promise.all(SNAPSHOT_SYMS.map(s =>
        fetch(`https://finnhub.io/api/v1/forex/candle?symbol=${encodeURIComponent(s)}&resolution=5&from=${from}&to=${now}&token=${FINNHUB_API_KEY}`)
          .then(r => r.json()).then(d => d.s === 'ok' ? d.c : [])
      ))
    ]);

    const rows = SNAPSHOT_SYMS.map((sym, i) => {
      const q   = quotesArr[i] || {};
      const pts = _sparkPoints(candlesArr[i]);
      const pct = q.dp ?? 0;
      const up  = pct >= 0;
      const color = up ? '#c9a84c' : '#ff4757';
      const sign  = up ? '+' : '';
      return `<div class="price-row">
        <div>
          <div class="pr-sym">${SNAPSHOT_DISPLAY[sym]}</div>
          <div class="pr-name">${SNAPSHOT_META[sym]}</div>
        </div>
        <svg class="pr-spark" viewBox="0 0 52 20" preserveAspectRatio="none">
          ${pts ? `<polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>` : ''}
        </svg>
        <div>
          <div class="pr-price">$${(q.c ?? 0).toFixed(2)}</div>
          <div class="pr-chg" style="color:${color}">${sign}${pct.toFixed(2)}%</div>
        </div>
      </div>`;
    }).join('');

    el.innerHTML = `<div class="sidebar-title">${t('priceSnapshot')} <span class="live-badge-sm">~15s</span></div>${rows}`;
    el.style.display = '';
  } catch { el.style.display = 'none'; }
  if (_priceSnapshotTimer) clearTimeout(_priceSnapshotTimer);
  _priceSnapshotTimer = setTimeout(loadPriceSnapshot, 30000);
}

window.loadPriceSnapshot = loadPriceSnapshot;
```

- [ ] **Step 2: Verify**
```bash
wc -l /home/test/MetalLens-site/assets/app.js
grep -n "SNAPSHOT_SYMS\|loadPriceSnapshot\|OANDA:XAG\|forex/candle" /home/test/MetalLens-site/assets/app.js | head -10
```
Expected: 420+ lines.

- [ ] **Step 3: Commit**
```bash
cd /home/test/MetalLens-site
git add assets/app.js
git commit -m "feat: app.js metals price snapshot"
```

---

## Task 9: Support Pages

**Files:**
- Create: `subscribe.html`, `about.html`, `privacy.html`

- [ ] **Step 1: Copy and adapt subscribe.html**
```bash
cp /home/test/StockLens-site/subscribe.html /home/test/MetalLens-site/subscribe.html
```
Edit `/home/test/MetalLens-site/subscribe.html`:
- `<title>` → `MetalLens — Subscribe`
- Nav logo: `STOCK<span>LENS</span>` → `METAL<span>LENS</span>`
- All text "StockLens" → "MetalLens"
- Nav cross-links: remove `CRYPTO ↗` and add both:
  ```html
  <a href="https://lens.qizh.space" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">CRYPTO ↗</a>
  <a href="https://stocks.qizh.space" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">STOCKS ↗</a>
  ```
- "Pro unlocks both CryptoLens + StockLens" → "Pro unlocks CryptoLens, StockLens + MetalLens"
- "stock × AI" or similar → "commodities × AI"

- [ ] **Step 2: Copy and adapt about.html**
```bash
cp /home/test/StockLens-site/about.html /home/test/MetalLens-site/about.html
```
Edit `/home/test/MetalLens-site/about.html`:
- `<title>` → `MetalLens — About`
- Nav logo: `STOCK<span>LENS</span>` → `METAL<span>LENS</span>`
- All text "StockLens" → "MetalLens"
- Description → "MetalLens aggregates precious metals and commodities market signals and uses AI to surface the most important developments daily."
- Same dual nav cross-links as subscribe.html

- [ ] **Step 3: Copy and adapt privacy.html**
```bash
cp /home/test/StockLens-site/privacy.html /home/test/MetalLens-site/privacy.html
```
Edit:
- Nav logo: `STOCK<span>LENS</span>` → `METAL<span>LENS</span>`
- All "StockLens" → "MetalLens"
- Same dual nav cross-links

- [ ] **Step 4: Verify**
```bash
ls /home/test/MetalLens-site/*.html
grep -c "StockLens" /home/test/MetalLens-site/subscribe.html
grep -c "StockLens" /home/test/MetalLens-site/about.html
```
Expected: 4 html files; StockLens count = 1 (in the "Pro unlocks" note), about = 0.

- [ ] **Step 5: Commit**
```bash
cd /home/test/MetalLens-site
git add subscribe.html about.html privacy.html
git commit -m "feat: add subscribe, about, privacy pages"
```

---

## Task 10: Cross-Navigation

**Files:**
- Modify: `/home/test/CryptoLens-site/index.html`
- Modify: `/home/test/StockLens-site/index.html`

- [ ] **Step 1: Add METALS ↗ to CryptoLens**

In `/home/test/CryptoLens-site/index.html`, find:
```html
    <a href="https://stocks.qizh.space" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">STOCKS ↗</a>
```
Add immediately after:
```html
    <a href="https://metals.qizh.space" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">METALS ↗</a>
```

- [ ] **Step 2: Add METALS ↗ to StockLens**

In `/home/test/StockLens-site/index.html`, find:
```html
    <a href="https://lens.qizh.space" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">CRYPTO ↗</a>
```
Add immediately after:
```html
    <a href="https://metals.qizh.space" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">METALS ↗</a>
```

- [ ] **Step 3: Verify both**
```bash
grep -n "METALS" /home/test/CryptoLens-site/index.html
grep -n "METALS" /home/test/StockLens-site/index.html
```
Expected: one line each.

- [ ] **Step 4: Commit + push both**
```bash
cd /home/test/CryptoLens-site
git add index.html
git commit -m "feat: add METALS cross-navigation link"
git push origin main

cd /home/test/StockLens-site
git add index.html
git commit -m "feat: add METALS cross-navigation link"
git push origin main
```

---

## Task 11: GitHub Deployment

- [ ] **Step 1: Create GitHub repo**
```bash
gh repo create rAIn0x7/MetalLens-site --public --description "MetalLens — Commodities × AI Intelligence"
```

- [ ] **Step 2: Add remote and push**
```bash
cd /home/test/MetalLens-site
git remote add origin https://github.com/rAIn0x7/MetalLens-site.git
git push -u origin main
```

- [ ] **Step 3: Enable GitHub Pages**
```bash
gh api repos/rAIn0x7/MetalLens-site/pages \
  --method POST \
  --field source[branch]=main \
  --field source[path]='/'
```

- [ ] **Step 4: Set custom domain**
```bash
gh api repos/rAIn0x7/MetalLens-site/pages \
  --method PUT \
  --field cname=metals.qizh.space
```

- [ ] **Step 5: Verify**
```bash
gh api repos/rAIn0x7/MetalLens-site/pages --jq '{cname, status}'
```
Expected: `{"cname": "metals.qizh.space", "status": null}` (null = building)

> **User manual step:** Add DNS CNAME record: `metals` → `rain0x7.github.io`
> Also run `supabase-metallens-migration.sql` in Supabase Dashboard.

- [ ] **Step 6: Trigger first deploy**
```bash
cd /home/test/MetalLens-site
git commit --allow-empty -m "chore: trigger GitHub Pages deploy"
git push
```
