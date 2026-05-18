// Requires: auth.js loaded first (sets window.CL.supabase)
const PAGE_SIZE = 20;
let currentOffset = 0;
let currentCategory = 'all';
let currentTag = null;
let isLoading = false;
let hasMore = true;

const CAT_BADGE_CLASS = {
  cross: 'badge-cat-cross', crypto: 'badge-cat-crypto',
  ai: 'badge-cat-ai', regulation: 'badge-cat-regulation', onchain: 'badge-cat-onchain'
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
        <div class="editor-note">${article.editor_note}</div>
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
  const catClass = CAT_BADGE_CLASS[article.category] || 'badge-cat-crypto';
  const tags = (article.tags || []).slice(0, 4).map(t =>
    `<span class="tag" onclick="filterByTag('${t}')">#${t}</span>`
  ).join('');

  return `
    <div class="card ${isTop ? 'top-card' : ''} ${article.is_pro ? 'pro-card' : ''}"
         onclick="openArticle('${article.id}')">
      <div class="card-meta">
        <span class="card-source">${article.source_name || 'Unknown'} · ${timeAgo(article.published_at)}</span>
        <div class="card-badges">
          <span class="badge ${catClass}">${article.category || 'crypto'}</span>
          <span class="score-badge ${scoreClass(article.importance_score)}">●${article.importance_score}</span>
        </div>
      </div>
      <a class="card-title" href="${article.original_url}" target="_blank"
         rel="noopener" onclick="event.stopPropagation()">
        ${article.title}
      </a>
      <p class="card-summary">${article.summary || ''}${article.summary_zh ? `<span class="summary-zh">${article.summary_zh}</span>` : ''}</p>
      ${tags ? `<div class="card-tags">${tags}</div>` : ''}
      ${renderEditorNote(article)}
    </div>`;
}

async function loadTodaysTop() {
  const sb = window.CL.supabase;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data } = await sb
    .from('articles_public')
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

  let q = sb.from('articles_public').select('*')
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

function openArticle(id) {
  window.location.href = `article.html?id=${id}`;
}

async function loadSidebarTags() {
  const sb = window.CL.supabase;
  const { data } = await sb
    .from('articles_public')
    .select('tags')
    .limit(100);

  const counts = {};
  (data || []).forEach(a => (a.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);

  const container = document.getElementById('sidebar-tags');
  if (!container) return;
  container.innerHTML = top.map(([t]) =>
    `<span class="tag" onclick="filterByTag('${t}')">#${t}</span>`
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
    .from('market_pulse_public')
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
      <span class="pulse-time">Based on ${escapeHtml(latest.article_count || '?')} signals · ${timeAgo(latest.created_at)}</span>
    </div>
    <div class="pulse-hero-sentiment">
      <span class="pulse-hero-mood">${sentKey.toUpperCase()}</span>
      <span class="pulse-hero-score">${sign}${escapeHtml(latest.sentiment_score)}</span>
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
    ws.onclose = ws.onerror = null;
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

function _startBtcFallbackPoll() {
  if (_btcWsFallbackTimer) return;
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
    } catch (e) { console.warn('[BTC poll]', e.message); }
  }
  poll();
  _btcWsFallbackTimer = setInterval(poll, 10000);
}

window.setCategory = setCategory;
window.filterByTag = filterByTag;
window.openArticle = openArticle;
window.handleSubscribe = handleSubscribe;
window.loadFeed = loadFeed;
window.loadTodaysTop = loadTodaysTop;
window.initBtcWebSocket = initBtcWebSocket;
window.loadSidebarTags = loadSidebarTags;
window.loadMarketPulse = loadMarketPulse;

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
  <line x1="${PL}" y1="${(PT + plotH * 0.60).toFixed(1)}" x2="${W-PR}" y2="${(PT + plotH * 0.60).toFixed(1)}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="4,3"/>
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

/* ── PRICE SNAPSHOT SIDEBAR ── */
function _sparkPoints(ticker) {
  const open  = parseFloat(ticker.openPrice);
  const close = parseFloat(ticker.lastPrice);
  const hi    = parseFloat(ticker.highPrice);
  const lo    = parseFloat(ticker.lowPrice);
  const range = hi - lo || 1;
  const toY   = p => ((hi - p) / range * 16 + 2).toFixed(1);
  const up    = close >= open;
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
    if (!Number.isFinite(val)) { el.style.display = 'none'; return; }
    const ZH_LABEL = { 'Extreme Fear':'极度恐慌', 'Fear':'恐慌', 'Neutral':'中立', 'Greed':'贪婪', 'Extreme Greed':'极度贪婪' };
    const label = ZH_LABEL[today.value_classification] || today.value_classification || '';
    const color = val >= 75 ? '#00c896' : val >= 55 ? '#ffd32a' : val >= 30 ? '#f7931a' : '#ff4757';

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
      <div class="fg-history">昨日: ${escapeHtml(yest.value)} · 上周: ${escapeHtml(week.value)}</div>`;
    el.style.display = '';
  } catch { el.style.display = 'none'; }
}

window.loadFearGreed = loadFearGreed;
