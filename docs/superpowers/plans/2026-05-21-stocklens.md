# StockLens Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build StockLens at `/home/test/StockLens-site/` — a US stock market AI intelligence site mirroring CryptoLens architecture, deployed to stocks.qizh.space.

**Architecture:** Pure static HTML/CSS/JS + Supabase (shared project, new tables) + Finnhub free-tier API for real-time stock prices. GitHub Pages deployment from a new `StockLens-site` repo. Shares auth, Pro subscription, and users table with CryptoLens.

**Tech Stack:** Vanilla HTML/CSS/JS · Supabase JS v2 · Finnhub WebSocket + REST · Lemon Squeezy (shared) · GitHub Pages

---

## File Map

| File | Action | Purpose |
|---|---|---|
| `/home/test/StockLens-site/` | Create | New project root |
| `CNAME` | Create | `stocks.qizh.space` |
| `index.html` | Create | Main page |
| `subscribe.html` | Create | Pro subscription |
| `about.html` | Create | About page |
| `privacy.html` | Create | Privacy policy |
| `assets/config.js` | Create | Supabase + Finnhub keys |
| `assets/auth.js` | Copy from CryptoLens | Auth logic (unchanged) |
| `assets/affiliate.js` | Copy from CryptoLens | Affiliate tracking (unchanged) |
| `assets/style.css` | Copy + modify | Design tokens + stock badge classes |
| `assets/app.js` | Create | All app logic |
| `supabase-stocklens-migration.sql` | Create | New DB tables |
| `/home/test/CryptoLens-site/index.html` | Modify | Add STOCKS ↗ nav link |

---

## Task 1: Project Scaffold

**Files:**
- Create: `/home/test/StockLens-site/` (directory)
- Create: `/home/test/StockLens-site/CNAME`

- [ ] **Step 1: Create directory structure and git repo**

```bash
mkdir -p /home/test/StockLens-site/assets
cd /home/test/StockLens-site
git init
git checkout -b main
```

Expected: `Initialized empty Git repository in /home/test/StockLens-site/.git/`

- [ ] **Step 2: Create CNAME**

```bash
echo "stocks.qizh.space" > /home/test/StockLens-site/CNAME
```

- [ ] **Step 3: Initial commit**

```bash
cd /home/test/StockLens-site
git add CNAME
git commit -m "chore: initial scaffold"
```

---

## Task 2: Supabase SQL Migration

**Files:**
- Create: `/home/test/StockLens-site/supabase-stocklens-migration.sql`

> **Note:** After creating this file, the user must run it manually in the Supabase Dashboard → SQL Editor at https://supabase.com/dashboard/project/uzvguynixndzusrlqryo/sql

- [ ] **Step 1: Create the SQL migration file**

Create `/home/test/StockLens-site/supabase-stocklens-migration.sql` with this exact content:

```sql
-- StockLens tables — run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS stock_articles (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       timestamptz DEFAULT now(),
  published_at     timestamptz DEFAULT now(),
  title            text        NOT NULL,
  summary          text,
  summary_zh       text,
  source_name      text,
  original_url     text,
  category         text,        -- tech | elon | macro | earnings | ai
  importance_score numeric      DEFAULT 7,
  tags             text[]       DEFAULT '{}',
  is_pro           boolean      DEFAULT false,
  editor_note      text
);

CREATE TABLE IF NOT EXISTS stock_pulses (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       timestamptz DEFAULT now(),
  sentiment        text        DEFAULT 'neutral',  -- bullish | bearish | neutral | mixed
  sentiment_score  numeric     DEFAULT 0,          -- -100 to 100
  article_count    integer     DEFAULT 0,
  summary_en       text,
  key_themes       text[]      DEFAULT '{}'
);

-- Public read access (frontend handles Pro paywall UI)
ALTER TABLE stock_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON stock_articles FOR SELECT USING (true);

ALTER TABLE stock_pulses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON stock_pulses FOR SELECT USING (true);

-- Sample data so the page renders on first load
INSERT INTO stock_pulses (sentiment, sentiment_score, article_count, summary_en, key_themes)
VALUES (
  'bullish', 42, 28,
  'Tech stocks rally on strong NVDA earnings beat. AI infrastructure spending accelerates across hyperscalers. Fed holds rates steady.',
  ARRAY['NVDA', 'AI infrastructure', 'Fed policy', 'earnings']
);

INSERT INTO stock_articles (title, summary, source_name, original_url, category, importance_score, tags)
VALUES
  ('NVIDIA Beats Q1 Estimates, Raises Guidance on AI Demand',
   'NVIDIA reported Q1 revenue of $26B, up 18% YoY, driven by data center GPU demand from hyperscalers.',
   'Reuters', 'https://reuters.com', 'tech', 9, ARRAY['NVDA', 'earnings', 'AI']),
  ('Tesla Cybertruck Production Ramp Ahead of Schedule',
   'Tesla confirms Cybertruck deliveries accelerating, targets 250k units annually by Q3.',
   'Bloomberg', 'https://bloomberg.com', 'elon', 8, ARRAY['TSLA', 'production']),
  ('Fed Signals Rate Hold Through Summer',
   'Federal Reserve officials indicate no rate changes expected until fall, citing persistent inflation.',
   'WSJ', 'https://wsj.com', 'macro', 8, ARRAY['Fed', 'rates', 'macro']),
  ('Palantir Wins $500M DoD AI Contract',
   'Palantir awarded major Pentagon contract for AI-driven logistics and battlefield intelligence.',
   'FT', 'https://ft.com', 'ai', 8, ARRAY['PLTR', 'government', 'AI']),
  ('S&P 500 Hits New All-Time High on Tech Surge',
   'SPY closes above 560, led by Magnificent Seven stocks gaining on AI optimism.',
   'CNBC', 'https://cnbc.com', 'macro', 7, ARRAY['SPY', 'market', 'ATH']);
```

- [ ] **Step 2: Commit the migration file**

```bash
cd /home/test/StockLens-site
git add supabase-stocklens-migration.sql
git commit -m "feat: add Supabase migration for stock_articles and stock_pulses"
```

---

## Task 3: Config + Copy Auth Assets

**Files:**
- Create: `assets/config.js`
- Create: `assets/auth.js` (copy)
- Create: `assets/affiliate.js` (copy)

- [ ] **Step 1: Create config.js**

Create `/home/test/StockLens-site/assets/config.js`:

```javascript
const SUPABASE_URL      = 'https://uzvguynixndzusrlqryo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_tHr8G_hSTCG9kDYpC48_bg_CWjXpeLN';
const LS_STORE           = 'YOUR_STORE_SLUG';
const LS_MONTHLY_VARIANT = 'YOUR_MONTHLY_VARIANT_ID';
const LS_YEARLY_VARIANT  = 'YOUR_YEARLY_VARIANT_ID';
const FINNHUB_API_KEY    = 'YOUR_FINNHUB_API_KEY';
```

> Note: `FINNHUB_API_KEY` must be filled in after registering at https://finnhub.io (free account, copy the API key from the dashboard). `LS_*` values are shared with CryptoLens — copy from `/home/test/CryptoLens-site/assets/config.js`.

- [ ] **Step 2: Copy auth.js and affiliate.js**

```bash
cp /home/test/CryptoLens-site/assets/auth.js /home/test/StockLens-site/assets/auth.js
cp /home/test/CryptoLens-site/assets/affiliate.js /home/test/StockLens-site/assets/affiliate.js
```

- [ ] **Step 3: Verify files exist**

```bash
ls /home/test/StockLens-site/assets/
```

Expected: `affiliate.js  auth.js  config.js`

- [ ] **Step 4: Commit**

```bash
cd /home/test/StockLens-site
git add assets/
git commit -m "feat: add config, auth, affiliate assets"
```

---

## Task 4: style.css

**Files:**
- Create: `assets/style.css` (copy from CryptoLens + stock additions)

- [ ] **Step 1: Copy CryptoLens CSS as base**

```bash
cp /home/test/CryptoLens-site/assets/style.css /home/test/StockLens-site/assets/style.css
```

- [ ] **Step 2: Append stock-specific styles**

Open `/home/test/StockLens-site/assets/style.css` and append these rules at the very end of the file:

```css
/* ── STOCKLENS: Category badge colours ── */
.badge-cat-tech     { background: rgba(96,165,250,.15);  color: #60a5fa; }
.badge-cat-elon     { background: rgba(255,71,87,.15);   color: #ff4757; }
.badge-cat-macro    { background: rgba(255,211,42,.15);  color: #ffd32a; }
.badge-cat-earnings { background: rgba(0,200,150,.15);   color: #00c896; }
.badge-cat-ai       { background: rgba(162,155,254,.15); color: #a29bfe; }

/* ── STOCKLENS: Price snapshot sidebar rows ── */
.price-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:10px 0; border-bottom:1px solid rgba(255,255,255,.05); }
.price-row:last-child { border-bottom:none; }
.pr-sym  { font-family:var(--font-mono); font-size:12px; font-weight:700; color:var(--white); min-width:36px; }
.pr-name { font-size:11px; color:var(--muted); min-width:64px; }
.pr-price { font-family:var(--font-mono); font-size:12px; color:var(--white); text-align:right; }
.pr-chg  { font-family:var(--font-mono); font-size:11px; text-align:right; min-width:48px; }
.pr-spark { width:52px; height:20px; flex-shrink:0; }
```

- [ ] **Step 3: Verify appended CSS is at end of file**

```bash
tail -20 /home/test/StockLens-site/assets/style.css
```

Expected: shows the stock badge classes and `.price-row` styles.

- [ ] **Step 4: Commit**

```bash
cd /home/test/StockLens-site
git add assets/style.css
git commit -m "feat: add style.css with stock-specific badge and price row styles"
```

---

## Task 5: index.html

**Files:**
- Create: `index.html`

- [ ] **Step 1: Create index.html**

Create `/home/test/StockLens-site/index.html` with this exact content:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="StockLens — Filtered stock × AI intelligence. Save 2 hours daily on noise.">
<title>StockLens — Stock × AI Intelligence</title>
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
    <h2>Sign in to StockLens</h2>
    <p>Enter your email — we'll send a magic link. No password needed.</p>
    <input type="email" id="modal-email" placeholder="you@example.com">
    <button class="btn btn-primary" style="width:100%" onclick="handleModalLogin()">Send Magic Link</button>
    <p class="msg" id="modal-msg"></p>
  </div>
</div>

<!-- NAV -->
<nav class="nav">
  <span class="nav-logo">STOCK<span>LENS</span></span>
  <div class="nav-filters">
    <button class="nav-filter active" data-cat="all"      onclick="setCategory('all')">ALL</button>
    <button class="nav-filter" data-cat="tech"            onclick="setCategory('tech')">TECH</button>
    <button class="nav-filter" data-cat="elon"            onclick="setCategory('elon')">ELON</button>
    <button class="nav-filter" data-cat="macro"           onclick="setCategory('macro')">MACRO</button>
    <button class="nav-filter" data-cat="earnings"        onclick="setCategory('earnings')">EARNINGS</button>
    <button class="nav-filter" data-cat="ai"              onclick="setCategory('ai')">AI</button>
  </div>
  <div class="nav-actions">
    <span class="badge badge-cat-tech hidden" id="nav-pro-label">PRO</span>
    <a href="https://lens.qizh.space" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">CRYPTO ↗</a>
    <button class="btn btn-ghost btn-sm" id="nav-login-btn"  onclick="CL.auth.openLoginModal()">Sign In</button>
    <button class="btn btn-ghost btn-sm hidden" id="nav-logout-btn" onclick="CL.auth.signOut()">Sign Out</button>
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
          <span id="live-status">SPY · FINNHUB</span>
        </div>
        <div class="btc-price-row">
          <span class="btc-big" id="spy-price">—</span>
          <span class="btc-chg" id="spy-chg"></span>
        </div>
        <div class="btc-range" id="spy-range"></div>
        <div id="btc-chart"></div>
        <div id="fear-greed-block" style="display:none"></div>
      </div>
    </div>
  </div>
</div>

<div class="container">
  <!-- TODAY'S TOP -->
  <div class="top-section">
    <div class="section-label">Today's Top Signal</div>
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
        <button id="load-more-btn" onclick="loadFeed()">Load more</button>
      </div>
    </main>

    <aside class="sidebar">
      <div class="sidebar-block" id="price-snapshot-block" style="display:none"></div>

      <div class="sidebar-block sidebar-subscribe">
        <div class="sidebar-title">Free Weekly Signal</div>
        <p>Top 10 stories every Monday. No spam.</p>
        <input type="email" id="sidebar-email" placeholder="your@email.com">
        <button class="btn btn-primary" style="width:100%" onclick="sidebarSubscribe()">Subscribe Free</button>
        <p class="msg" id="sidebar-msg"></p>
      </div>

      <div class="sidebar-block">
        <div class="sidebar-title">Trending Tags</div>
        <div class="sidebar-tags" id="sidebar-tags"></div>
      </div>

      <div class="sidebar-block affiliate-block">
        <span class="aff-label">Sponsored</span>
        <p>Trade US stocks on <a href="https://accounts.binance.com/register?ref=YOUR_REF" target="_blank" rel="noopener" onclick="CL.affiliate.track('binance', null)">Binance</a> — earn rebates on every trade.</p>
      </div>
    </aside>
  </div>
</div>

<footer class="footer">
  <p class="footer-disclaimer">StockLens aggregates information from third-party sources for informational purposes only. Nothing on this site constitutes financial or investment advice. Always do your own research before making any investment decisions. Stock investments carry significant risk.</p>
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
  await Promise.all([
    loadTodaysTop(),
    loadMarketPulse(),
    loadSidebarTags(),
    loadFearGreed(),
    loadHourlyChart(),
    loadPriceSnapshot(),
  ]);
  initSpyWebSocket();
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

- [ ] **Step 2: Verify file was created**

```bash
wc -l /home/test/StockLens-site/index.html
```

Expected: ~110 lines

- [ ] **Step 3: Commit**

```bash
cd /home/test/StockLens-site
git add index.html
git commit -m "feat: add index.html structure"
```

---

## Task 6: app.js — Supabase Feed, Top Signals, Market Pulse

**Files:**
- Create: `assets/app.js` (first portion)

- [ ] **Step 1: Create assets/app.js with feed and pulse logic**

Create `/home/test/StockLens-site/assets/app.js` with this exact content:

```javascript
// Requires: auth.js loaded first (sets window.CL.supabase)
const PAGE_SIZE = 20;
let currentOffset = 0;
let currentCategory = 'all';
let currentTag = null;
let isLoading = false;
let hasMore = true;

const CAT_BADGE_CLASS = {
  tech: 'badge-cat-tech', elon: 'badge-cat-elon',
  ai: 'badge-cat-ai', macro: 'badge-cat-macro', earnings: 'badge-cat-earnings'
};

function scoreClass(score) {
  if (score >= 9) return 'score-pro';
  if (score >= 8) return 'score-high';
  return 'score-mid';
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
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
  const catClass = CAT_BADGE_CLASS[article.category] || 'badge-cat-tech';
  const tags = (article.tags || []).slice(0, 4).map(t =>
    `<span class="tag" onclick="filterByTag('${escapeHtml(t)}')">#${escapeHtml(t)}</span>`
  ).join('');
  const url = escapeHtml(article.original_url || '#');

  return `
    <div class="card ${isTop ? 'top-card' : ''} ${article.is_pro ? 'pro-card' : ''}"
         onclick="openArticle('${url}')">
      <div class="card-meta">
        <span class="card-source">${escapeHtml(article.source_name || 'Unknown')} · ${timeAgo(article.published_at)}</span>
        <div class="card-badges">
          <span class="badge ${catClass}">${escapeHtml(article.category || 'tech')}</span>
          <span class="score-badge ${scoreClass(article.importance_score)}">●${escapeHtml(String(article.importance_score ?? 7))}</span>
        </div>
      </div>
      <a class="card-title" href="${url}" target="_blank"
         rel="noopener" onclick="event.stopPropagation()">
        ${escapeHtml(article.title)}
      </a>
      <p class="card-summary">${escapeHtml(article.summary || '')}${article.summary_zh ? `<span class="summary-zh">${escapeHtml(article.summary_zh)}</span>` : ''}</p>
      ${tags ? `<div class="card-tags">${tags}</div>` : ''}
      ${renderEditorNote(article)}
    </div>`;
}

async function loadTodaysTop() {
  const sb = window.CL.supabase;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data } = await sb
    .from('stock_articles')
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

  let q = sb.from('stock_articles').select('*')
    .order('importance_score', { ascending: false })
    .order('published_at', { ascending: false });
  if (currentCategory !== 'all') q = q.eq('category', currentCategory);
  if (currentTag) q = q.contains('tags', [currentTag]);
  q = q.range(currentOffset, currentOffset + PAGE_SIZE - 1);

  const { data } = await q;
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
  const { data } = await sb.from('stock_articles').select('tags').limit(100);
  const counts = {};
  (data || []).forEach(a => (a.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  const container = document.getElementById('sidebar-tags');
  if (!container) return;
  container.innerHTML = top.map(([t]) =>
    `<span class="tag" onclick="filterByTag('${escapeHtml(t)}')">#${escapeHtml(t)}</span>`
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
    .from('stock_pulses')
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
  const themes  = (latest.key_themes || []).map(t => `<span class="tag">#${escapeHtml(t)}</span>`).join('');
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
      <span class="pulse-label">MARKET PULSE</span>
      <span class="pulse-time">Based on ${escapeHtml(String(latest.article_count || '?'))} signals · ${timeAgo(latest.created_at)}</span>
    </div>
    <div class="pulse-hero-sentiment">
      <span class="pulse-hero-mood">${sentKey.toUpperCase()}</span>
      <span class="pulse-hero-score">${sign}${escapeHtml(String(latest.sentiment_score))}</span>
    </div>
    <p class="pulse-hero-en">${escapeHtml(latest.summary_en)}</p>
    ${themes ? `<div class="pulse-hero-themes">${themes}</div>` : ''}
    ${days.length > 0 ? `
    <div class="hero-hist-bars">
      <div class="hist-label">14-DAY HISTORY</div>
      <div class="hist-bars">${bars}</div>
      <div class="hist-dates"><span>${firstDay}</span><span>Today</span></div>
    </div>` : ''}`;
}

window.setCategory = setCategory;
window.filterByTag = filterByTag;
window.openArticle = openArticle;
window.handleSubscribe = handleSubscribe;
window.loadFeed = loadFeed;
window.loadTodaysTop = loadTodaysTop;
window.loadSidebarTags = loadSidebarTags;
window.loadMarketPulse = loadMarketPulse;
```

- [ ] **Step 2: Verify file created**

```bash
wc -l /home/test/StockLens-site/assets/app.js
```

Expected: ~185 lines

- [ ] **Step 3: Commit**

```bash
cd /home/test/StockLens-site
git add assets/app.js
git commit -m "feat: app.js feed, top signals, market pulse"
```

---

## Task 7: app.js — Finnhub SPY Price Panel + Hourly Chart

**Files:**
- Modify: `assets/app.js` (append)

- [ ] **Step 1: Append Finnhub WebSocket + SPY price + chart to app.js**

Open `/home/test/StockLens-site/assets/app.js` and append:

```javascript
/* ── HOURLY CHART ── */
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
      <stop offset="0%" stop-color="#00c896" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#00c896" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <line x1="${PL}" y1="${(PT+plotH*0.25).toFixed(1)}" x2="${W-PR}" y2="${(PT+plotH*0.25).toFixed(1)}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="4,3"/>
  <line x1="${PL}" y1="${(PT+plotH*0.60).toFixed(1)}" x2="${W-PR}" y2="${(PT+plotH*0.60).toFixed(1)}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="4,3"/>
  <line x1="${W-PR}" y1="${PT}" x2="${W-PR}" y2="${(PT+plotH).toFixed(1)}" stroke="rgba(0,200,150,0.12)" stroke-width="1"/>
  <path d="${fillD}" fill="url(#hg)"/>
  <path d="${pathD}" fill="none" stroke="#00c896" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="${lx}" cy="${ly}" r="3.5" fill="#00c896" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
  <circle cx="${lx}" cy="${ly}" r="7" fill="none" stroke="#00c896" stroke-width="1" opacity="0.3"/>
  <text x="${ax}" y="${(parseFloat(hiY)+8).toFixed(1)}" font-size="7" fill="rgba(0,200,150,0.65)" font-family="JetBrains Mono,monospace">${fmtK(max)}</text>
  <text x="${ax}" y="${(parseFloat(loY)-2).toFixed(1)}" font-size="7" fill="rgba(0,200,150,0.45)" font-family="JetBrains Mono,monospace">${fmtK(min)}</text>
</svg>`;
}

async function loadHourlyChart() {
  const el = document.getElementById('btc-chart');
  if (!el) return;
  try {
    const now  = Math.floor(Date.now() / 1000);
    const from = now - 86400;
    const url  = `https://finnhub.io/api/v1/stock/candle?symbol=SPY&resolution=60&from=${from}&to=${now}&token=${FINNHUB_API_KEY}`;
    const r = await fetch(url);
    const d = await r.json();
    if (!d.c || d.s !== 'ok' || d.c.length < 2) return;

    const sb = window.CL.supabase;
    const { data: pulses } = await sb
      .from('stock_pulses')
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
  setTimeout(loadHourlyChart, 30 * 60 * 1000);
}

/* ── FINNHUB WEBSOCKET (SPY) ── */
let _spyWs = null;
let _spyRetries = 0;
let _spyFallbackTimer = null;
let _lastSpyPrice = null;

function initSpyWebSocket() {
  // Initial REST call so price/range show immediately before WS connects
  fetch(`https://finnhub.io/api/v1/quote?symbol=SPY&token=${FINNHUB_API_KEY}`)
    .then(r => r.json())
    .then(d => {
      if (d.c) {
        updateSpyPrice(d.c, d.dp);
        const rangeEl = document.getElementById('spy-range');
        if (rangeEl && d.h && d.l)
          rangeEl.textContent = `Day 低: $${d.l.toFixed(2)} · 高: $${d.h.toFixed(2)} · Prev: $${d.pc?.toFixed(2) ?? '—'}`;
      }
    }).catch(() => {});

  if (_spyWs) { _spyWs.onclose = _spyWs.onerror = null; _spyWs.close(); _spyWs = null; }
  _spyWs = new WebSocket(`wss://ws.finnhub.io?token=${FINNHUB_API_KEY}`);

  _spyWs.onopen = () => {
    _spyWs.send(JSON.stringify({ type: 'subscribe', symbol: 'SPY' }));
    setLiveStatus(true);
    _spyRetries = 0;
    if (_spyFallbackTimer) { clearInterval(_spyFallbackTimer); _spyFallbackTimer = null; }
  };

  _spyWs.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.type !== 'trade' || !msg.data) return;
    const trade = msg.data[msg.data.length - 1];
    updateSpyPrice(trade.p, null);
  };

  _spyWs.onclose = _spyWs.onerror = () => {
    _spyWs.onclose = _spyWs.onerror = null;
    _spyWs = null;
    setLiveStatus(false);
    if (_spyRetries < 10) { _spyRetries++; setTimeout(initSpyWebSocket, 3000); }
    else { _startSpyFallbackPoll(); }
  };
}

function setLiveStatus(live) {
  const ring  = document.getElementById('live-ring');
  const label = document.getElementById('live-status');
  if (ring)  ring.style.background = live ? '#00c896' : 'rgba(255,255,255,0.2)';
  if (label) label.textContent = live ? 'SPY · FINNHUB · LIVE' : 'SPY · FINNHUB · ~15s';
}

function updateSpyPrice(price, pct) {
  const priceEl = document.getElementById('spy-price');
  const chgEl   = document.getElementById('spy-chg');
  if (!priceEl) return;

  if (_lastSpyPrice !== null) {
    priceEl.style.color = price > _lastSpyPrice ? '#00c896' : price < _lastSpyPrice ? '#ff4757' : '';
    setTimeout(() => { if (priceEl) priceEl.style.color = ''; }, 800);
  }
  _lastSpyPrice = price;
  priceEl.textContent = '$' + price.toFixed(2);

  if (pct !== null && pct !== undefined) {
    const sign = pct >= 0 ? '▲ +' : '▼ ';
    if (chgEl) { chgEl.textContent = sign + Math.abs(pct).toFixed(2) + '%'; chgEl.style.color = pct >= 0 ? '#00c896' : '#ff4757'; }
  }
}

function _startSpyFallbackPoll() {
  if (_spyFallbackTimer) return;
  async function poll() {
    try {
      const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=SPY&token=${FINNHUB_API_KEY}`);
      const d = await r.json();
      if (d.c) {
        updateSpyPrice(d.c, d.dp);
        const rangeEl = document.getElementById('spy-range');
        if (rangeEl && d.h && d.l)
          rangeEl.textContent = `Day 低: $${d.l.toFixed(2)} · 高: $${d.h.toFixed(2)} · Prev: $${d.pc?.toFixed(2) ?? '—'}`;
      }
    } catch (e) { console.warn('[SPY poll]', e.message); }
  }
  poll();
  _spyFallbackTimer = setInterval(poll, 15000);
}

window.loadHourlyChart = loadHourlyChart;
window.initSpyWebSocket = initSpyWebSocket;
```

- [ ] **Step 2: Verify line count grew**

```bash
wc -l /home/test/StockLens-site/assets/app.js
```

Expected: ~290 lines

- [ ] **Step 3: Commit**

```bash
cd /home/test/StockLens-site
git add assets/app.js
git commit -m "feat: app.js Finnhub SPY price panel and hourly chart"
```

---

## Task 8: app.js — CNN Fear & Greed + Price Snapshot

**Files:**
- Modify: `assets/app.js` (append)

- [ ] **Step 1: Append CNN Fear & Greed + price snapshot to app.js**

Open `/home/test/StockLens-site/assets/app.js` and append:

```javascript
/* ── CNN FEAR & GREED ── */
async function loadFearGreed() {
  const el = document.getElementById('fear-greed-block');
  if (!el) return;
  try {
    const r = await fetch('https://production.dataviz.cnn.io/index/fearandgreed/graphdata');
    const json = await r.json();
    const fg = json?.fear_and_greed;
    if (!fg) { el.style.display = 'none'; return; }

    const val = Math.round(Number(fg.score));
    if (!Number.isFinite(val)) { el.style.display = 'none'; return; }

    const ZH_LABEL = { 'Extreme Fear':'极度恐慌', 'Fear':'恐慌', 'Neutral':'中立', 'Greed':'贪婪', 'Extreme Greed':'极度贪婪' };
    const label = ZH_LABEL[fg.rating] || fg.rating || '';
    const color = val < 25 ? '#ff4757' : val < 45 ? '#ffd32a' : val < 55 ? '#a29bfe' : val < 75 ? '#26de81' : '#00c896';
    const yest = Math.round(Number(fg.previous_close));
    const week = Math.round(Number(fg.previous_1_week));

    el.style.display = 'block';
    el.innerHTML = `
      <div class="btc-meta" style="margin-bottom:0.4rem">恐贪指数</div>
      <div style="display:flex;align-items:baseline;gap:0.5rem;margin-bottom:0.25rem">
        <span style="font-family:var(--font-mono);font-size:1.3rem;font-weight:700;line-height:1;color:${color}">${val}</span>
        <span style="font-size:0.65rem;color:${color};font-family:var(--font-mono);letter-spacing:0.06em">${escapeHtml(label)}</span>
      </div>
      <div class="fg-bar-wrap">
        <div class="fg-bar" style="width:${val}%;background:linear-gradient(to right,#ff4757,#ffd32a 50%,#00c896)"></div>
      </div>
      <div class="fg-labels"><span>恐慌</span><span>中立</span><span>贪婪</span></div>
      <div class="fg-history">昨日: ${Number.isFinite(yest) ? yest : '—'} · 上周: ${Number.isFinite(week) ? week : '—'}</div>`;
  } catch { el.style.display = 'none'; }
}

/* ── PRICE SNAPSHOT SIDEBAR ── */
const SNAPSHOT_SYMS = ['NVDA', 'TSLA', 'AAPL', 'PLTR', 'SPY'];
const SNAPSHOT_META = { NVDA:'NVIDIA', TSLA:'Tesla', AAPL:'Apple', PLTR:'Palantir', SPY:'S&P 500' };

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
        fetch(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${FINNHUB_API_KEY}`).then(r => r.json())
      )),
      Promise.all(SNAPSHOT_SYMS.map(s =>
        fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${s}&resolution=5&from=${from}&to=${now}&token=${FINNHUB_API_KEY}`)
          .then(r => r.json()).then(d => d.s === 'ok' ? d.c : [])
      ))
    ]);

    const rows = SNAPSHOT_SYMS.map((sym, i) => {
      const q   = quotesArr[i] || {};
      const pts = _sparkPoints(candlesArr[i]);
      const pct = q.dp ?? 0;
      const up  = pct >= 0;
      const color = up ? '#00c896' : '#ff4757';
      const sign  = up ? '+' : '';
      return `<div class="price-row">
        <div>
          <div class="pr-sym">${sym}</div>
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

    el.innerHTML = `<div class="sidebar-title">Markets <span class="live-badge-sm">LIVE</span></div>${rows}`;
    el.style.display = '';
  } catch { el.style.display = 'none'; }
  setTimeout(loadPriceSnapshot, 30000);
}

window.loadFearGreed = loadFearGreed;
window.loadPriceSnapshot = loadPriceSnapshot;
```

- [ ] **Step 2: Verify final line count**

```bash
wc -l /home/test/StockLens-site/assets/app.js
```

Expected: ~375 lines

- [ ] **Step 3: Commit**

```bash
cd /home/test/StockLens-site
git add assets/app.js
git commit -m "feat: app.js CNN Fear & Greed and price snapshot sidebar"
```

---

## Task 9: subscribe.html + about.html + privacy.html

**Files:**
- Create: `subscribe.html`, `about.html`, `privacy.html`

- [ ] **Step 1: Copy and adapt subscribe.html**

```bash
cp /home/test/CryptoLens-site/subscribe.html /home/test/StockLens-site/subscribe.html
```

Then make these replacements in `/home/test/StockLens-site/subscribe.html`:
- `CryptoLens` → `StockLens` (in all visible text, title, headings)
- `CRYPTO<span>LENS</span>` → `STOCK<span>LENS</span>`
- Add this note under the plan price boxes: `<p style="font-size:12px;color:var(--muted);text-align:center;margin-top:8px">Pro unlocks both CryptoLens + StockLens</p>`
- Add CRYPTO ↗ nav link (same as index.html)
- Keep all JS logic unchanged (same LS variant IDs, same goCheckout function)

- [ ] **Step 2: Copy and adapt about.html**

```bash
cp /home/test/CryptoLens-site/about.html /home/test/StockLens-site/about.html
```

Replace in `/home/test/StockLens-site/about.html`:
- `CryptoLens` → `StockLens` everywhere in text
- `CRYPTO<span>LENS</span>` → `STOCK<span>LENS</span>`
- Update description to: "StockLens aggregates US equity market signals and uses AI to surface the most important developments daily."
- Update nav CRYPTO ↗ link

- [ ] **Step 3: Copy and adapt privacy.html**

```bash
cp /home/test/CryptoLens-site/privacy.html /home/test/StockLens-site/privacy.html
```

Replace in `/home/test/StockLens-site/privacy.html`:
- `CryptoLens` → `StockLens` everywhere
- `CRYPTO<span>LENS</span>` → `STOCK<span>LENS</span>`
- "Cryptocurrency investments" → "Stock market investments"

- [ ] **Step 4: Verify all three files exist**

```bash
ls /home/test/StockLens-site/*.html
```

Expected: `about.html  index.html  privacy.html  subscribe.html`

- [ ] **Step 5: Commit**

```bash
cd /home/test/StockLens-site
git add subscribe.html about.html privacy.html
git commit -m "feat: add subscribe, about, privacy pages"
```

---

## Task 10: Cross-Navigation — Add STOCKS ↗ to CryptoLens

**Files:**
- Modify: `/home/test/CryptoLens-site/index.html`

- [ ] **Step 1: Add STOCKS ↗ link to CryptoLens nav**

In `/home/test/CryptoLens-site/index.html`, find this line in `<div class="nav-actions">`:
```html
    <span class="badge badge-cat-cross hidden" id="nav-pro-label">PRO</span>
```

And add the STOCKS link immediately after it:
```html
    <span class="badge badge-cat-cross hidden" id="nav-pro-label">PRO</span>
    <a href="https://stocks.qizh.space" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">STOCKS ↗</a>
```

- [ ] **Step 2: Verify the change**

```bash
grep -n "STOCKS" /home/test/CryptoLens-site/index.html
```

Expected: one line showing the new STOCKS ↗ link.

- [ ] **Step 3: Commit and push CryptoLens**

```bash
cd /home/test/CryptoLens-site
git add index.html
git commit -m "feat: add STOCKS cross-navigation link to CryptoLens nav"
git push origin main
```

---

## Task 11: GitHub Deployment

> **This task requires manual steps by the user in GitHub.**

- [ ] **Step 1 (manual — user does this): Create GitHub repo**

Go to https://github.com/new and create:
- Repository name: `StockLens-site`
- Visibility: Public
- Do NOT initialize with README

- [ ] **Step 2: Push local repo to GitHub**

```bash
cd /home/test/StockLens-site
git remote add origin https://github.com/rAIn0x7/StockLens-site.git
git push -u origin main
```

- [ ] **Step 3 (manual — user does this): Enable GitHub Pages**

In the new repo: Settings → Pages → Source: `Deploy from a branch` → Branch: `main` → folder: `/ (root)` → Save

- [ ] **Step 4 (manual — user does this): Add DNS CNAME record**

In your DNS provider (wherever qizh.space is managed):
- Type: CNAME
- Name: `stocks`
- Value: `rain0x7.github.io`

Wait 5–30 minutes for DNS propagation.

- [ ] **Step 5 (manual — user does this): Set custom domain in GitHub Pages**

In GitHub Pages settings, enter `stocks.qizh.space` in the Custom domain field. GitHub will verify the CNAME.

- [ ] **Step 6 (manual — user does this): Fill in Finnhub API key**

1. Register free account at https://finnhub.io
2. Copy API key from dashboard
3. Edit `/home/test/StockLens-site/assets/config.js` — replace `YOUR_FINNHUB_API_KEY` with the real key
4. Copy LS_STORE / LS_MONTHLY_VARIANT / LS_YEARLY_VARIANT from CryptoLens config.js
5. Push:
```bash
cd /home/test/StockLens-site
git add assets/config.js
git commit -m "config: add Finnhub API key"
git push origin main
```

- [ ] **Step 7 (manual — user does this): Run Supabase migration**

Go to https://supabase.com/dashboard/project/uzvguynixndzusrlqryo/sql
Paste and run the contents of `supabase-stocklens-migration.sql`

---

## Self-Review Checklist

After all tasks complete, verify:

- [ ] `stocks.qizh.space` loads and shows StockLens branding
- [ ] Nav filters (ALL/TECH/ELON/MACRO/EARNINGS/AI) filter the feed correctly
- [ ] Hero panel shows SPY price updating in real-time (or ~15s fallback)
- [ ] Hourly SPY chart renders (24-bar SVG)
- [ ] CNN Fear & Greed block visible below chart
- [ ] Price snapshot sidebar shows 5 stocks with sparklines
- [ ] Market Pulse hero card shows data from `stock_pulses`
- [ ] Feed shows articles from `stock_articles`
- [ ] Sign In → magic link flow works
- [ ] `lens.qizh.space` nav shows STOCKS ↗ link
- [ ] `stocks.qizh.space` nav shows CRYPTO ↗ link
