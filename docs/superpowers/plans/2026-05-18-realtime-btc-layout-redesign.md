# Real-time BTC + Layout Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static Market Pulse hero with a 2-panel hero (sentiment left, live BTC right), wire up Binance WebSocket for real-time BTC price, add a 24h hourly chart, and expand the sidebar to 340px with Price Snapshot and Fear & Greed widgets.

**Architecture:** Pure client-side changes to `index.html`, `assets/style.css`, and `assets/app.js`. No server or Supabase schema changes. Binance public APIs (WebSocket + REST klines) replace the CoinGecko chart data. The existing `market_pulse_public` Supabase view remains the data source for sentiment.

**Tech Stack:** Vanilla JS, SVG, Binance WebSocket (`wss://stream.binance.com:9443/ws/btcusdt@ticker`), Binance REST (`api.binance.com`), Alternative.me Fear & Greed API (`api.alternative.me/fng/`), Supabase JS client.

---

## Task 1: HTML — Hero Restructure

**Files:**
- Modify: `index.html:46-55`

Remove the current single-column hero content (`#pulse-card`, `#btc-ticker`, `#pulse-trend`) and replace with a 2-column grid. The left panel reuses `id="pulse-card"` (populated by `loadMarketPulse()`). The right panel has static scaffolding with IDs for JS to update.

- [ ] **Step 1: Replace the hero inner HTML**

In `index.html`, replace:
```html
<!-- MARKET PULSE HERO -->
<div class="pulse-hero" id="pulse-hero">
  <div class="pulse-hero-glow"></div>
  <div class="container">
    <div class="pulse-hero-inner" id="pulse-card">
      <div class="card skeleton" style="height:180px"></div>
    </div>
    <div class="btc-ticker-bar" id="btc-ticker"></div>
    <div class="pulse-trend-wrap" id="pulse-trend"></div>
  </div>
</div>
```

With:
```html
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
          <span id="live-status">BTC/USD · BINANCE</span>
        </div>
        <div class="btc-price-row">
          <span class="btc-big" id="btc-price">—</span>
          <span class="btc-chg" id="btc-chg"></span>
        </div>
        <div class="btc-range" id="btc-range"></div>
        <div id="btc-chart"></div>
      </div>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Verify structure in browser**

Open `index.html` locally (or `lens.qizh.space`). The hero area should show two skeleton columns side by side. The right column will be empty until JS loads. No console errors about missing elements.

- [ ] **Step 3: Commit**

```bash
cd /home/test/CryptoLens-site
git add index.html
git commit -m "feat: restructure hero to 2-panel grid layout"
```

---

## Task 2: HTML — Sidebar Restructure

**Files:**
- Modify: `index.html:81-99`

Add Price Snapshot and Fear & Greed blocks before the existing subscribe block. Both start hidden (`display:none`) and are shown by JS on successful data fetch.

- [ ] **Step 1: Replace the aside element**

In `index.html`, replace:
```html
    <aside class="sidebar">
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
        <p>Trade crypto on <a href="https://accounts.binance.com/register?ref=YOUR_REF" target="_blank" rel="noopener" onclick="CL.affiliate.track('binance', null)">Binance</a> — earn rebates on every trade.</p>
      </div>
    </aside>
```

With:
```html
    <aside class="sidebar">
      <div class="sidebar-block" id="price-snapshot-block" style="display:none"></div>

      <div class="sidebar-block" id="fear-greed-block" style="display:none"></div>

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
        <p>Trade crypto on <a href="https://accounts.binance.com/register?ref=YOUR_REF" target="_blank" rel="noopener" onclick="CL.affiliate.track('binance', null)">Binance</a> — earn rebates on every trade.</p>
      </div>
    </aside>
```

- [ ] **Step 2: Commit**

```bash
git add index.html
git commit -m "feat: add price-snapshot and fear-greed sidebar slots"
```

---

## Task 3: CSS — New Styles

**Files:**
- Modify: `assets/style.css`

Three groups of changes: (a) widen sidebar and hero grid, (b) new hero-right / BTC panel classes, (c) new sidebar widget classes.

- [ ] **Step 1: Widen sidebar and add hero grid**

In `style.css`, change line:
```css
  grid-template-columns: 1fr 280px;
```
To:
```css
  grid-template-columns: 1fr 340px;
```

Then find `.pulse-hero-inner` (around line 604) and **add** the following block immediately before it:
```css
.pulse-hero-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2.5rem;
  position: relative;
  z-index: 1;
}

@media (max-width: 900px) {
  .pulse-hero-grid { grid-template-columns: 1fr; }
  .btc-panel { border-left: none !important; padding-left: 0 !important; border-top: 1px solid rgba(255,255,255,0.06); padding-top: 1.2rem; margin-top: 1.2rem; }
}
```

- [ ] **Step 2: Update glow gradient direction**

In `style.css`, replace all four `.pulse-hero.pulse-*` glow rules:
```css
.pulse-hero.pulse-bullish .pulse-hero-glow { background: linear-gradient(to bottom, rgba(0,200,150,0.18)  0%, transparent 100%); }
.pulse-hero.pulse-bearish .pulse-hero-glow { background: linear-gradient(to bottom, rgba(255,71,87,0.18)   0%, transparent 100%); }
.pulse-hero.pulse-neutral .pulse-hero-glow { background: linear-gradient(to bottom, rgba(255,211,42,0.15)  0%, transparent 100%); }
.pulse-hero.pulse-mixed   .pulse-hero-glow { background: linear-gradient(to bottom, rgba(162,155,254,0.18) 0%, transparent 100%); }
```
With:
```css
.pulse-hero.pulse-bullish .pulse-hero-glow { background: linear-gradient(160deg, rgba(0,200,150,0.18)  0%, transparent 60%); }
.pulse-hero.pulse-bearish .pulse-hero-glow { background: linear-gradient(160deg, rgba(255,71,87,0.18)   0%, transparent 60%); }
.pulse-hero.pulse-neutral .pulse-hero-glow { background: linear-gradient(160deg, rgba(255,211,42,0.15)  0%, transparent 60%); }
.pulse-hero.pulse-mixed   .pulse-hero-glow { background: linear-gradient(160deg, rgba(162,155,254,0.18) 0%, transparent 60%); }
```

- [ ] **Step 3: Add BTC panel styles**

At the end of `style.css`, append:
```css
/* ── BTC PANEL (hero right) ── */
.btc-panel {
  border-left: 1px solid rgba(255,255,255,0.06);
  padding-left: 2.5rem;
}

.btc-meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.1em;
  color: rgba(255,255,255,0.28);
  text-transform: uppercase;
  margin-bottom: 0.6rem;
}

.live-ring {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255,255,255,0.2);
  flex-shrink: 0;
  animation: livepulse 1.4s ease-in-out infinite;
}

@keyframes livepulse {
  0%, 100% { opacity: 1; box-shadow: 0 0 0 0 currentColor; }
  50%       { opacity: 0.5; box-shadow: 0 0 0 4px transparent; }
}

.btc-price-row {
  display: flex;
  align-items: baseline;
  gap: 0.6rem;
  margin-bottom: 0.15rem;
}

.btc-big {
  font-family: var(--font-mono);
  font-size: 1.9rem;
  font-weight: 700;
  color: var(--white);
  transition: text-shadow 0.3s;
}

.btc-chg {
  font-family: var(--font-mono);
  font-size: 0.82rem;
  font-weight: 700;
}

.btc-range {
  font-size: 0.62rem;
  font-family: var(--font-mono);
  color: rgba(255,255,255,0.2);
  margin-bottom: 0.8rem;
}

/* ── HOURLY CHART ── */
.sent-band {
  display: flex;
  gap: 2px;
  height: 6px;
  margin-top: 5px;
  border-radius: 2px;
  overflow: hidden;
}

.sb-seg { flex: 1; }

.chart-foot {
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
}

.chart-foot span {
  font-size: 0.52rem;
  color: rgba(255,255,255,0.16);
  font-family: var(--font-mono);
}

/* ── 14-DAY MINI BARS ── */
.hero-hist-bars { margin-top: 0.9rem; }

.hist-label {
  font-size: 0.54rem;
  font-family: var(--font-mono);
  color: rgba(255,255,255,0.2);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  margin-bottom: 4px;
}

.hist-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 34px;
}

.hist-bar {
  flex: 1;
  border-radius: 2px 2px 0 0;
  min-height: 3px;
}

.hist-dates {
  display: flex;
  justify-content: space-between;
  margin-top: 3px;
}

.hist-dates span {
  font-size: 0.52rem;
  color: rgba(255,255,255,0.16);
  font-family: var(--font-mono);
}

/* ── PRICE SNAPSHOT ── */
.price-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}

.price-row:last-child { border-bottom: none; padding-bottom: 0; }
.price-row:first-child { padding-top: 0; }

.pr-sym {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  font-weight: 700;
  width: 36px;
  color: rgba(255,255,255,0.55);
}

.pr-name { font-size: 0.68rem; color: rgba(255,255,255,0.35); flex: 1; }

.pr-price {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--white);
}

.pr-chg {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  min-width: 52px;
  text-align: right;
}

.pr-spark { width: 52px; height: 20px; flex-shrink: 0; }

.live-badge-sm {
  display: inline-block;
  background: rgba(0,200,150,0.12);
  color: #00c896;
  border-radius: 2px;
  font-size: 0.52rem;
  font-family: var(--font-mono);
  padding: 1px 5px;
  font-weight: 700;
  letter-spacing: 0.04em;
  margin-left: 0.4rem;
  vertical-align: middle;
}

/* ── FEAR & GREED ── */
.fg-bar-wrap {
  background: rgba(255,255,255,0.04);
  border-radius: 4px;
  height: 10px;
  position: relative;
  overflow: hidden;
  margin-bottom: 0.35rem;
}

.fg-bar {
  position: absolute;
  left: 0; top: 0; bottom: 0;
  border-radius: 4px;
}

.fg-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.58rem;
  color: rgba(255,255,255,0.22);
  font-family: var(--font-mono);
  margin-bottom: 0.4rem;
}

.fg-history {
  font-size: 0.6rem;
  color: rgba(255,255,255,0.22);
  font-family: var(--font-mono);
}
```

- [ ] **Step 4: Verify layout in browser**

Open `index.html`. The hero should show two equal-width columns. Sidebar should be visibly wider. The glow diagonal angle should lean to the left corner rather than straight down.

- [ ] **Step 5: Commit**

```bash
git add assets/style.css
git commit -m "feat: add CSS for hero grid, BTC panel, chart, price-snapshot, fear-greed"
```

---

## Task 4: JS — Binance WebSocket

**Files:**
- Modify: `assets/app.js`

Add `initBtcWebSocket()`, `updateBtcPrice()`, `setLiveStatus()`, and `startBtcFallbackPoll()`. These replace `loadBtcTicker()` (kept for now, removed in Task 9).

- [ ] **Step 1: Add WebSocket functions to `app.js`**

Append to `assets/app.js` (before the `window.` export lines):
```javascript
/* ── BINANCE WEBSOCKET ── */
let _btcWsRetries = 0;
let _btcWsFallbackTimer = null;

function initBtcWebSocket() {
  const ws = new WebSocket('wss://stream.binance.com:9443/ws/btcusdt@ticker');

  ws.onopen = () => {
    setLiveStatus(true);
    _btcWsRetries = 0;
    if (_btcWsFallbackTimer) { clearInterval(_btcWsFallbackTimer); _btcWsFallbackTimer = null; }
  };

  ws.onmessage = (e) => {
    const d = JSON.parse(e.data);
    updateBtcPrice({
      price:  parseFloat(d.c),
      change: parseFloat(d.P),
      high:   parseFloat(d.h),
      low:    parseFloat(d.l),
      volume: parseFloat(d.v),
    });
  };

  ws.onclose = ws.onerror = () => {
    setLiveStatus(false);
    if (_btcWsRetries < 10) {
      _btcWsRetries++;
      setTimeout(initBtcWebSocket, 3000);
    } else {
      _startBtcFallbackPoll();
    }
  };
}

function setLiveStatus(live) {
  const ring  = document.getElementById('live-ring');
  const label = document.getElementById('live-status');
  if (ring)  ring.style.background = live ? '#00c896' : 'rgba(255,255,255,0.2)';
  if (label) label.textContent = live ? 'BTC/USD · BINANCE · LIVE' : 'BTC/USD · BINANCE · ~10s';
}

function updateBtcPrice({ price, change, high, low, volume }) {
  const priceStr = '$' + Math.round(price).toLocaleString('en');
  const up  = change >= 0;
  const chgStr = (up ? '▲ +' : '▼ ') + Math.abs(change).toFixed(2) + '%';

  ['btc-price', 'sb-btc'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = priceStr;
    el.style.textShadow = '0 0 10px rgba(247,147,26,0.5)';
    setTimeout(() => { el.style.textShadow = ''; }, 350);
  });

  const chgEl = document.getElementById('btc-chg');
  if (chgEl) { chgEl.textContent = chgStr; chgEl.style.color = up ? '#00c896' : '#ff4757'; }

  const rangeEl = document.getElementById('btc-range');
  if (rangeEl && high && low) {
    rangeEl.textContent =
      `24h 低: $${Math.round(low).toLocaleString('en')} · 高: $${Math.round(high).toLocaleString('en')} · Vol: ${(volume / 1000).toFixed(1)}k BTC`;
  }
}

async function _startBtcFallbackPoll() {
  async function poll() {
    try {
      const r = await fetch('https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT');
      const d = await r.json();
      updateBtcPrice({
        price:  parseFloat(d.lastPrice),
        change: parseFloat(d.priceChangePercent),
        high:   parseFloat(d.highPrice),
        low:    parseFloat(d.lowPrice),
        volume: parseFloat(d.volume),
      });
    } catch {}
  }
  poll();
  _btcWsFallbackTimer = setInterval(poll, 10000);
}

window.initBtcWebSocket = initBtcWebSocket;
```

- [ ] **Step 2: Verify in browser**

Open the page. Within 2 seconds the BTC price in the hero right panel should show a real price (e.g. `$103,420`) and the live-ring dot should turn green. Every price tick produces a brief orange text-shadow flash. Open DevTools → Network → WS tab — you should see a WebSocket connection to `stream.binance.com`.

- [ ] **Step 3: Commit**

```bash
git add assets/app.js
git commit -m "feat: add Binance WebSocket for real-time BTC price"
```

---

## Task 5: JS — 24h Hourly Chart

**Files:**
- Modify: `assets/app.js`

Add `fmtK()`, `renderHourlyChart()`, `renderSentBand()`, and `loadHourlyChart()`.

- [ ] **Step 1: Add chart functions to `app.js`**

Append to `assets/app.js` (before `window.` exports):
```javascript
/* ── HOURLY CHART ── */
function fmtK(p) {
  return p >= 1000 ? '$' + (p / 1000).toFixed(1) + 'k' : '$' + Math.round(p);
}

function renderHourlyChart(closes) {
  const W = 380, H = 88;
  const PL = 4, PR = 44, PT = 12, PB = 8;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const pad = (max - min) * 0.15 || min * 0.005;
  const lo = min - pad;
  const hi = max + pad;
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
  const ax  = W - PR + 5;

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:88px;display:block">
  <defs>
    <linearGradient id="hg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f7931a" stop-opacity="0.22"/>
      <stop offset="100%" stop-color="#f7931a" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <line x1="${PL}" y1="${(PT + plotH * 0.25).toFixed(1)}" x2="${W-PR}" y2="${(PT + plotH * 0.25).toFixed(1)}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="4,3"/>
  <line x1="${PL}" y1="${(PT + plotH * 0.65).toFixed(1)}" x2="${W-PR}" y2="${(PT + plotH * 0.65).toFixed(1)}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="4,3"/>
  <line x1="${W-PR}" y1="${PT}" x2="${W-PR}" y2="${(PT+plotH).toFixed(1)}" stroke="rgba(247,147,26,0.12)" stroke-width="1"/>
  <path d="${fillD}" fill="url(#hg)"/>
  <path d="${pathD}" fill="none" stroke="#f7931a" stroke-width="1.8" stroke-linejoin="round"/>
  <circle cx="${lx}" cy="${ly}" r="3.5" fill="#f7931a" stroke="rgba(0,0,0,0.5)" stroke-width="1.5"/>
  <circle cx="${lx}" cy="${ly}" r="7" fill="none" stroke="#f7931a" stroke-width="1" opacity="0.3"/>
  <text x="${ax}" y="${(parseFloat(hiY)+8).toFixed(1)}" font-size="7" fill="rgba(247,147,26,0.65)" font-family="JetBrains Mono,monospace">${fmtK(max)}</text>
  <text x="${ax}" y="${(parseFloat(loY)-2).toFixed(1)}" font-size="7" fill="rgba(247,147,26,0.45)" font-family="JetBrains Mono,monospace">${fmtK(min)}</text>
</svg>`;
}

function renderSentBand(pulses) {
  const COLOR = { bullish:'#00c896', bearish:'#ff4757', neutral:'#ffd32a', mixed:'#a29bfe' };
  return '<div class="sent-band">' +
    pulses.map(p => {
      const c  = COLOR[p.sentiment] || '#ffd32a';
      const op = Math.min(0.4 + Math.abs(p.sentiment_score || 0) / 100 * 0.6, 1.0).toFixed(2);
      return `<div class="sb-seg" style="background:${c};opacity:${op}"></div>`;
    }).join('') +
  '</div>';
}

async function loadHourlyChart() {
  const el = document.getElementById('btc-chart');
  if (!el) return;
  try {
    const r = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=24');
    const klines = await r.json();
    if (!Array.isArray(klines) || klines.length < 2) return;
    const closes = klines.map(k => parseFloat(k[4]));

    const sb = window.CL.supabase;
    const { data: pulses } = await sb
      .from('market_pulse_public')
      .select('sentiment_score, sentiment')
      .limit(12);

    const band = pulses && pulses.length > 0 ? renderSentBand([...pulses].reverse()) : '';

    el.innerHTML =
      renderHourlyChart(closes) +
      band +
      `<div class="chart-foot">
        <span>24h ago</span>
        <span style="color:rgba(255,255,255,0.1)">▓ sentiment</span>
        <span>now</span>
      </div>`;
  } catch (e) {
    console.warn('loadHourlyChart error:', e.message);
  }
  setTimeout(loadHourlyChart, 30 * 60 * 1000);
}

window.loadHourlyChart = loadHourlyChart;
```

- [ ] **Step 2: Verify in browser**

Reload the page. The right panel should show an orange BTC price line chart with a gradient fill underneath and a small pulsing dot at the rightmost point. Below the chart a thin coloured strip (sentiment band) should appear. The footer shows "24h ago … now".

- [ ] **Step 3: Commit**

```bash
git add assets/app.js
git commit -m "feat: add 24h hourly BTC chart with sentiment color band"
```

---

## Task 6: JS — Refactor `loadMarketPulse()`

**Files:**
- Modify: `assets/app.js:179-215`

Fetch the last 200 pulses in one query. Use `data[0]` (newest) for the hero sentiment display. Aggregate all by day for the 14-day mini bars. Render everything into `#pulse-card`.

- [ ] **Step 1: Replace `loadMarketPulse()` in `app.js`**

Replace the existing `loadMarketPulse` function (lines ~179-215):
```javascript
async function loadMarketPulse() {
  const sb = window.CL.supabase;
  const { data } = await sb
    .from('market_pulse_public')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const container = document.getElementById('pulse-card');
  const hero = document.getElementById('pulse-hero');
  if (!container) return;

  if (!data) {
    container.innerHTML = '<p class="pulse-empty">Market pulse will appear after the next fetch cycle.</p>';
    return;
  }

  const sentKey = ['bullish','bearish','neutral','mixed'].includes(data.sentiment) ? data.sentiment : 'neutral';
  const sign = data.sentiment_score > 0 ? '+' : '';
  const themes = (data.key_themes || []).map(t => `<span class="tag">#${t}</span>`).join('');

  if (hero) hero.className = `pulse-hero pulse-${sentKey}`;

  container.innerHTML = `
    <div class="pulse-hero-meta">
      <span class="pulse-label">MARKET PULSE</span>
      <span class="pulse-time">Based on ${data.article_count || '?'} signals · ${timeAgo(data.created_at)}</span>
    </div>
    <div class="pulse-hero-sentiment">
      <span class="pulse-hero-mood">${sentKey.toUpperCase()}</span>
      <span class="pulse-hero-score">${sign}${data.sentiment_score}</span>
    </div>
    <p class="pulse-hero-en">${data.summary_en || ''}</p>
    <p class="pulse-hero-zh">${data.summary_zh || ''}</p>
    ${themes ? `<div class="pulse-hero-themes">${themes}</div>` : ''}`;
}
```

With:
```javascript
async function loadMarketPulse() {
  const sb = window.CL.supabase;
  // Fetch last 200 pulses (view orders DESC so newest is first)
  const { data } = await sb
    .from('market_pulse_public')
    .select('*')
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
  const themes  = (latest.key_themes || []).map(t => `<span class="tag">#${t}</span>`).join('');
  if (hero) hero.className = `pulse-hero pulse-${sentKey}`;

  // Aggregate by calendar day for 14-day mini bars
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
      <span class="pulse-time">Based on ${latest.article_count || '?'} signals · ${timeAgo(latest.created_at)}</span>
    </div>
    <div class="pulse-hero-sentiment">
      <span class="pulse-hero-mood">${sentKey.toUpperCase()}</span>
      <span class="pulse-hero-score">${sign}${latest.sentiment_score}</span>
    </div>
    <p class="pulse-hero-en">${latest.summary_en || ''}</p>
    ${themes ? `<div class="pulse-hero-themes">${themes}</div>` : ''}
    ${days.length > 0 ? `
    <div class="hero-hist-bars">
      <div class="hist-label">14-DAY HISTORY</div>
      <div class="hist-bars">${bars}</div>
      <div class="hist-dates"><span>${firstDay}</span><span>Today</span></div>
    </div>` : ''}`;
}
```

- [ ] **Step 2: Verify in browser**

Reload. The hero left panel should show: BULLISH/BEARISH/NEUTRAL mood word + score, the AI summary in English, theme tags, and the 14-day mini bars at the bottom. The hero glow colour should match the sentiment.

- [ ] **Step 3: Commit**

```bash
git add assets/app.js
git commit -m "feat: refactor loadMarketPulse to include 14-day mini bars in hero"
```

---

## Task 7: JS — Price Snapshot Sidebar Widget

**Files:**
- Modify: `assets/app.js`

Add `loadPriceSnapshot()` and its helper `_sparkPoints()`. Fetches BTC/ETH/SOL/BNB in one Binance batch call. Renders into `#price-snapshot-block`. Also sets up 30s auto-refresh.

- [ ] **Step 1: Add `loadPriceSnapshot()` to `app.js`**

Append to `assets/app.js` (before `window.` exports):
```javascript
/* ── PRICE SNAPSHOT SIDEBAR ── */
function _sparkPoints(ticker) {
  const open  = parseFloat(ticker.openPrice);
  const close = parseFloat(ticker.lastPrice);
  const hi    = parseFloat(ticker.highPrice);
  const lo    = parseFloat(ticker.lowPrice);
  const range = hi - lo || 1;
  const toY   = p => ((hi - p) / range * 16 + 2).toFixed(1);
  const up    = close >= open;
  // 6 points from open → intraday swing → close
  const pts = [
    { x: 0,  p: open },
    { x: 10, p: up ? lo : hi },
    { x: 22, p: (open + close) / 2 },
    { x: 36, p: up ? hi : lo },
    { x: 46, p: close * 0.99 + open * 0.01 },
    { x: 52, p: close },
  ];
  return pts.map(pt => `${pt.x},${toY(pt.p)}`).join(' ');
}

async function loadPriceSnapshot() {
  const el = document.getElementById('price-snapshot-block');
  if (!el) return;
  try {
    const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT'];
    const r = await fetch(
      `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`
    );
    const data = await r.json();
    if (!Array.isArray(data)) return;

    const META = {
      BTCUSDT: { sym: 'BTC', name: 'Bitcoin',  id: 'sb-btc' },
      ETHUSDT: { sym: 'ETH', name: 'Ethereum',  id: '' },
      SOLUSDT: { sym: 'SOL', name: 'Solana',    id: '' },
      BNBUSDT: { sym: 'BNB', name: 'BNB Chain', id: '' },
    };

    const rows = data.map(d => {
      const m      = META[d.symbol] || { sym: d.symbol.replace('USDT',''), name: d.symbol, id: '' };
      const price  = parseFloat(d.lastPrice);
      const pctChg = parseFloat(d.priceChangePercent);
      const up     = pctChg >= 0;
      const priceStr = price >= 1000
        ? '$' + Math.round(price).toLocaleString('en')
        : '$' + price.toFixed(2);
      const chgStr = (up ? '+' : '') + pctChg.toFixed(2) + '%';
      const color  = up ? '#00c896' : '#ff4757';
      const idAttr = m.id ? `id="${m.id}"` : '';
      return `<div class="price-row">
        <span class="pr-sym">${m.sym}</span>
        <span class="pr-name">${m.name}</span>
        <span class="pr-price" ${idAttr}>${priceStr}</span>
        <span class="pr-chg" style="color:${color}">${chgStr}</span>
        <svg class="pr-spark" viewBox="0 0 52 20" preserveAspectRatio="none">
          <polyline points="${_sparkPoints(d)}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
      </div>`;
    }).join('');

    el.innerHTML = `<div class="sidebar-title">Price Snapshot <span class="live-badge-sm">LIVE</span></div>${rows}`;
    el.style.display = '';
  } catch { el.style.display = 'none'; }

  setTimeout(loadPriceSnapshot, 30000);
}

window.loadPriceSnapshot = loadPriceSnapshot;
```

- [ ] **Step 2: Verify in browser**

Reload. At the top of the sidebar a "Price Snapshot" block should appear with BTC, ETH, SOL, BNB rows, each showing price, % change in green/red, and a small sparkline. The LIVE badge should be visible.

- [ ] **Step 3: Commit**

```bash
git add assets/app.js
git commit -m "feat: add Price Snapshot sidebar widget (Binance batch ticker)"
```

---

## Task 8: JS — Fear & Greed Sidebar Widget

**Files:**
- Modify: `assets/app.js`

Add `loadFearGreed()`. Fetches from `api.alternative.me/fng/`. Renders numeric value, label, gradient bar, and yesterday/last-week comparison into `#fear-greed-block`.

- [ ] **Step 1: Add `loadFearGreed()` to `app.js`**

Append to `assets/app.js` (before `window.` exports):
```javascript
/* ── FEAR & GREED SIDEBAR ── */
async function loadFearGreed() {
  const el = document.getElementById('fear-greed-block');
  if (!el) return;
  try {
    const r = await fetch('https://api.alternative.me/fng/?limit=8');
    const json = await r.json();
    const entries = json?.data;
    if (!Array.isArray(entries) || !entries.length) { el.style.display = 'none'; return; }

    const today = entries[0];
    const yest  = entries[1] || today;
    const week  = entries[7] || entries[entries.length - 1] || today;

    const val   = parseInt(today.value, 10);
    const label = today.value_classification || '';
    const color = val >= 75 ? '#00c896' : val >= 55 ? '#ffd32a' : val >= 30 ? '#f7931a' : '#ff4757';

    el.innerHTML = `
      <div class="sidebar-title">Crypto Fear &amp; Greed</div>
      <div style="font-family:var(--font-mono);font-size:1.3rem;font-weight:700;line-height:1;color:${color};margin-bottom:0.2rem">${val}</div>
      <div style="font-size:0.65rem;color:${color};font-family:var(--font-mono);margin-bottom:0.6rem;letter-spacing:0.06em">${label.toUpperCase()}</div>
      <div class="fg-bar-wrap">
        <div class="fg-bar" style="width:${val}%;background:linear-gradient(to right,#ff4757,#ffd32a 50%,#00c896)"></div>
      </div>
      <div class="fg-labels"><span>Fear</span><span>Neutral</span><span>Greed</span></div>
      <div class="fg-history">昨日: ${yest.value} · 上周: ${week.value}</div>`;
    el.style.display = '';
  } catch { el.style.display = 'none'; }
}

window.loadFearGreed = loadFearGreed;
```

- [ ] **Step 2: Verify in browser**

Reload. A "Crypto Fear & Greed" block should appear in the sidebar with a number (0-100), a colour-coded label (e.g. GREED), a gradient bar, and yesterday/last-week comparison text.

- [ ] **Step 3: Commit**

```bash
git add assets/app.js
git commit -m "feat: add Fear & Greed Index sidebar widget"
```

---

## Task 9: Wire up `init()` and Remove Old Code

**Files:**
- Modify: `index.html` (the inline `<script>` block)
- Modify: `assets/app.js` (remove `loadBtcTicker`, `loadPulseTrend`, `renderDailyBars`, `fmtPrice`)

- [ ] **Step 1: Update `init()` in `index.html`**

In `index.html`, replace the inline `<script>` block:
```javascript
async function init() {
  await CL.auth.initAuth();
  await Promise.all([loadTodaysTop(), loadMarketPulse(), loadBtcTicker(), loadPulseTrend(), loadSidebarTags()]);
  await loadFeed(true);
}
```
With:
```javascript
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
  initBtcWebSocket();
  await loadFeed(true);
}
```

- [ ] **Step 2: Remove dead functions from `app.js`**

In `assets/app.js`, delete the following functions entirely:
- `fmtPrice()` (lines ~223-225) — replaced by `fmtK()`
- `renderDailyBars()` (lines ~227-290) — replaced by `renderHourlyChart()`
- `loadBtcTicker()` (lines ~292-304) — replaced by WebSocket
- `loadPulseTrend()` (lines ~306-354) — logic merged into `loadMarketPulse()`

Also remove these lines from the `window.` export block at the bottom of `app.js`:
```javascript
window.loadPulseTrend  = loadPulseTrend;
window.loadBtcTicker   = loadBtcTicker;
```

- [ ] **Step 3: Full smoke test in browser**

Open `lens.qizh.space` (after push) and verify each element:
- [ ] Hero left: mood word + score + summary + theme tags + 14-day bars
- [ ] Hero right: live BTC price (green dot, updates every ~1s), price range, 24h chart with orange line + sentiment band
- [ ] Sidebar: Price Snapshot (4 coins + sparklines), Fear & Greed index, subscribe box, trending tags
- [ ] Article feed loads correctly
- [ ] Category filter buttons still work
- [ ] No console errors

- [ ] **Step 4: Commit and push**

```bash
git add index.html assets/app.js
git commit -m "feat: wire up init(), remove deprecated ticker/trend/bar functions"
git push origin main
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ Binance WebSocket with auto-reconnect and REST fallback → Task 4
- ✅ 24h hourly chart (Binance klines) → Task 5
- ✅ Sentiment color band 12 segments → Task 5 (`renderSentBand`)
- ✅ Hero 2-panel layout → Tasks 1, 3
- ✅ 14-day mini bars in hero left → Task 6
- ✅ `#btc-ticker` and `#pulse-trend` divs removed → Task 1
- ✅ Sidebar width 280→340px → Task 3
- ✅ Price Snapshot (BTC/ETH/SOL/BNB) → Task 7
- ✅ Fear & Greed → Task 8
- ✅ `#sb-btc` updated per WebSocket tick → Task 4 (`updateBtcPrice`)
- ✅ Chart refreshes every 30 min → Task 5 (`setTimeout`)
- ✅ Error handling: all network calls wrapped in try/catch → Tasks 4–8
- ✅ Mobile responsive for hero grid → Task 3

**Function name consistency:**
- `fmtK()` used in `renderHourlyChart()` — defined in Task 5 ✅
- `renderSentBand()` used in `loadHourlyChart()` — defined in Task 5 ✅
- `_sparkPoints()` used in `loadPriceSnapshot()` — defined in Task 7 ✅
- `updateBtcPrice()` used by WebSocket and fallback poll — defined in Task 4 ✅
- `setLiveStatus()` used in `initBtcWebSocket()` — defined in Task 4 ✅
