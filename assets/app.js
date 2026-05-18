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
function fmtPrice(p) {
  return p >= 1000 ? '$' + (p / 1000).toFixed(1) + 'k' : '$' + Math.round(p);
}

function renderDailyBars(days, btcByDay) {
  const W = 600, H = 180;
  const PL = 8, PR = 46, PT = 18, PB = 32;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;
  const n = days.length;
  const midY = PT + plotH / 2;
  const COLOR = { bullish:'#00c896', bearish:'#ff4757', neutral:'#ffd32a', mixed:'#a29bfe' };

  // Sentiment scale
  const maxAbs = Math.max(...days.map(d => Math.abs(d.score)), 2);
  const sentScale = (plotH / 2 - 6) / maxAbs;
  const barW = Math.min(plotW / n * 0.55, 34);
  const step = plotW / n;

  // BTC price scale
  const btcPrices = days.map(d => btcByDay?.[d.day]).filter(p => p != null);
  const hasBtc = btcPrices.length >= 2;
  let btcMin, btcMax, btcLine = '', btcLabels = '';
  if (hasBtc) {
    btcMin = Math.min(...btcPrices);
    btcMax = Math.max(...btcPrices);
    const pad = (btcMax - btcMin) * 0.18 || btcMin * 0.01;
    btcMin -= pad; btcMax += pad;
    const btcScale = plotH / (btcMax - btcMin);
    const toY = p => PT + plotH - (p - btcMin) * btcScale;

    const pts = days.map((d, i) => {
      const p = btcByDay[d.day];
      if (p == null) return null;
      return { x: PL + (i + 0.5) * step, y: toY(p) };
    }).filter(Boolean);

    if (pts.length >= 2) {
      const path = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
      const dots = pts.map(p => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="2.8" fill="#f7931a" stroke="rgba(0,0,0,0.5)" stroke-width="0.8"/>`).join('');
      btcLine = `<path d="${path}" fill="none" stroke="#f7931a" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round" opacity="0.9"/>${dots}`;
      const ax = W - PR + 5;
      btcLabels = `<text x="${ax}" y="${(toY(btcMax)+8).toFixed(1)}" font-size="8" fill="#f7931a" font-family="JetBrains Mono,monospace" opacity="0.75">${fmtPrice(btcMax)}</text>
<text x="${ax}" y="${(toY(btcMin)-2).toFixed(1)}" font-size="8" fill="#f7931a" font-family="JetBrains Mono,monospace" opacity="0.75">${fmtPrice(btcMin)}</text>
<line x1="${W-PR}" y1="${PT}" x2="${W-PR}" y2="${PT+plotH}" stroke="rgba(247,147,26,0.15)" stroke-width="1"/>`;
    }
  }

  const bars = days.map((d, i) => {
    const cx = PL + (i + 0.5) * step;
    const bh = Math.max(Math.abs(d.score) * sentScale, 3);
    const by = d.score >= 0 ? midY - bh : midY;
    const c  = COLOR[d.sentiment] || '#a29bfe';
    const sign = d.score > 0 ? '+' : '';
    const ly = d.score >= 0 ? by - 6 : by + bh + 14;
    const dl = new Date(d.day + 'T12:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric' });
    return `<rect x="${(cx-barW/2).toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${c}" rx="2" opacity="0.7"/>
<text x="${cx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="9.5" fill="${c}" font-family="JetBrains Mono,monospace" font-weight="700">${sign}${d.score}</text>
<text x="${cx.toFixed(1)}" y="${H-5}" text-anchor="middle" font-size="8.5" fill="rgba(255,255,255,0.28)" font-family="JetBrains Mono,monospace">${dl}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:165px;display:block">
  <line x1="${PL}" y1="${midY}" x2="${W-PR}" y2="${midY}" stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="4,3"/>
  ${bars}
  ${btcLine}
  ${btcLabels}
</svg>`;
}

async function loadBtcTicker() {
  const el = document.getElementById('btc-ticker');
  if (!el) return;
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true');
    const d = await r.json();
    const price = d?.bitcoin?.usd;
    const change = d?.bitcoin?.usd_24h_change;
    if (price == null) return;
    const up = change >= 0;
    el.innerHTML = `<span class="btc-symbol">₿</span><span class="btc-price">$${Math.round(price).toLocaleString('en')}</span><span class="btc-change ${up ? 'up' : 'down'}">${up ? '▲' : '▼'} ${up ? '+' : ''}${change.toFixed(2)}%</span><span class="btc-label">24h</span>`;
  } catch { el.innerHTML = ''; }
}

async function loadPulseTrend() {
  const container = document.getElementById('pulse-trend');
  if (!container) return;
  try {
    const sb = window.CL.supabase;
    const { data, error } = await sb
      .from('market_pulse_public')
      .select('sentiment_score, sentiment, created_at')
      .limit(200);

    if (error) { console.warn('pulse trend query:', error.message); return; }
    if (!data || data.length < 1) { console.warn('pulse trend: no data'); return; }

    // aggregate sentiment by day
    const byDay = {};
    data.forEach(r => {
      const day = (r.created_at || '').slice(0, 10);
      if (!day) return;
      if (!byDay[day]) byDay[day] = { scores: [], sentiments: [] };
      byDay[day].scores.push(Number(r.sentiment_score) || 0);
      byDay[day].sentiments.push(r.sentiment || 'neutral');
    });
    const aggregated = Object.keys(byDay).sort().map(day => {
      const scores = byDay[day].scores;
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const sentCount = {};
      byDay[day].sentiments.forEach(s => { sentCount[s] = (sentCount[s] || 0) + 1; });
      const sentiment = Object.entries(sentCount).sort((a, b) => b[1] - a[1])[0][0];
      return { day, score: avg, sentiment };
    });
    if (aggregated.length < 1) { console.warn('pulse trend: empty after aggregation'); return; }

    // try BTC prices — render chart regardless of whether this succeeds
    let btcByDay = {};
    try {
      const r = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=14&interval=daily');
      const btcResp = await r.json();
      if (Array.isArray(btcResp?.prices)) {
        btcResp.prices.forEach(([ts, price]) => {
          btcByDay[new Date(ts).toISOString().slice(0, 10)] = price;
        });
      }
    } catch (e) { console.warn('BTC price fetch failed:', e.message); }

    container.innerHTML = renderDailyBars(aggregated, btcByDay);
  } catch (e) {
    console.error('loadPulseTrend error:', e);
  }
}

window.loadSidebarTags = loadSidebarTags;
window.loadMarketPulse = loadMarketPulse;
window.loadPulseTrend  = loadPulseTrend;
window.loadBtcTicker   = loadBtcTicker;

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
