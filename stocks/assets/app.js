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
      <p class="card-summary">${escapeHtml(getLang() === 'zh' ? (article.summary_zh || article.summary || '') : (article.summary || ''))}</p>
      ${tags ? `<div class="card-tags">${tags}</div>` : ''}
      ${renderEditorNote(article)}
    </div>`;
}

function renderBriefItem(a, i) {
  const sum = escapeHtml(getLang() === 'zh' ? (a.summary_zh || a.summary || '') : (a.summary || ''));
  const url = escapeHtml(a.original_url || '#');
  const src = a.original_url
    ? `<a class="brief-src" href="${url}" target="_blank" rel="noopener">${escapeHtml(a.source_name || 'source')} →</a>` : '';
  return `<div class="brief-item">
    <span class="brief-num">${String(i + 1).padStart(2, '0')}</span>
    <div class="brief-body">
      <div class="brief-row"><span class="brief-h">${escapeHtml(a.title)}</span><span class="brief-tag">${escapeHtml(a.category || 'tech')} ●${escapeHtml(String(a.importance_score ?? 7))}</span></div>
      <div class="brief-sum">${sum} ${src}</div>
    </div>
  </div>`;
}

async function loadTodaysTop() {
  const sb = window.CL.supabase;
  const since = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  let { data } = await sb.from('stock_articles').select('*')
    .gte('published_at', since).order('importance_score', { ascending: false }).limit(4);
  if (!data?.length) {
    ({ data } = await sb.from('stock_articles').select('*').order('importance_score', { ascending: false }).limit(4));
  }
  // Honest freshness: stamp the NEWEST article's date, not today's
  const dateEl = document.getElementById('brief-date');
  if (dateEl) {
    const newest = data?.length
      ? new Date(Math.max(...data.map(a => +new Date(a.published_at || a.created_at))))
      : new Date();
    dateEl.textContent = newest.toLocaleDateString(
      getLang() === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
  const container = document.getElementById('top-grid');
  if (!container) return;
  if (!data?.length) { container.closest('.brief-section')?.classList.add('hidden'); return; }
  container.innerHTML = data.map((a, i) => renderBriefItem(a, i)).join('');
}

/* ── MAINSTREAM (featured) vs AUXILIARY split — pure front-end filter ── */
const MAINSTREAM_SCORE = 8; // importance_score >= this always counts as mainstream
const MAINSTREAM_RE = /(标普|标普500|s&p|\bspx\b|sp500|纳指|nasdaq|\bndx\b|英伟达|\bnvda\b|nvidia|苹果|\baapl\b|apple|微软|\bmsft\b|microsoft|特斯拉|\btsla\b|tesla)/i;

function isMainstream(a) {
  const hay = [a.title, a.category, ...(a.tags || [])].join(' ').toLowerCase();
  return MAINSTREAM_RE.test(hay);
}

let _auxBuffer = [];      // auxiliary articles not yet painted (rendered lazily on open)
let _auxCount = 0;
let _auxRendered = false; // becomes true once <details> is opened

function _resetAux() {
  _auxBuffer = []; _auxCount = 0; _auxRendered = false;
  const f = document.getElementById('aux-feed'); if (f) f.innerHTML = '';
  const d = document.getElementById('aux-details'); if (d) { d.open = false; d.style.display = 'none'; }
}

function _pushAux(items) {
  _auxCount += items.length;
  if (_auxRendered) {
    document.getElementById('aux-feed')?.insertAdjacentHTML('beforeend', items.map(a => renderCard(a, false)).join(''));
  } else {
    _auxBuffer.push(...items);
  }
  const d = document.getElementById('aux-details'); if (d) d.style.display = '';
  const s = document.getElementById('aux-summary'); if (s) s.textContent = `辅助 · 更多 · MORE (${_auxCount})`;
  _bindAuxToggle();
}

function _bindAuxToggle() {
  const d = document.getElementById('aux-details');
  if (!d || d._bound) return;
  d._bound = true;
  d.addEventListener('toggle', () => {
    if (d.open && !_auxRendered) {
      _auxRendered = true;
      const f = document.getElementById('aux-feed');
      if (f && _auxBuffer.length) {
        f.insertAdjacentHTML('beforeend', _auxBuffer.map(a => renderCard(a, false)).join(''));
        _auxBuffer = [];
      }
    }
  });
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

  let data, err;
  try { const res = await q; data = res.data; err = res.error; }
  catch (e) { err = e; }
  isLoading = false;

  const container = document.getElementById('feed');
  if (err) {
    if (reset && container) container.innerHTML = '<div class="feed-error">加载失败 / Couldn’t load <button onclick="loadFeed(true)">重试 Retry</button></div>';
    _hideLoadMore(); return;
  }
  if (!data?.length) {
    if (reset && container) container.innerHTML = '<div class="feed-empty">暂无内容 / Nothing here yet</div>';
    hasMore = false; _hideLoadMore(); return;
  }
  if (data.length < PAGE_SIZE) { hasMore = false; _hideLoadMore(); }
  if (!container) return;
  if (reset) { container.innerHTML = ''; _resetAux(); }

  // Front-end split: mainstream (featured) pinned in the main feed, rest into the collapsed aux section
  let main = [], aux = [];
  for (const a of data) (isMainstream(a) ? main : aux).push(a);
  // Graceful degradation: if the very first page surfaces zero mainstream, just list everything
  if (reset && main.length === 0) { main = data; aux = []; }

  if (main.length) container.insertAdjacentHTML('beforeend', main.map(a => renderCard(a, false)).join(''));
  if (aux.length) _pushAux(aux);
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

/* ── HOURLY CHART ── */
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
    const r = await fetch(`https://finnhub.io/api/v1/quote?symbol=SPY&token=${FINNHUB_API_KEY}`);
    const d = await r.json();
    if (!d.c) return;

    // Reconstruct a smooth intraday curve from OHLC: pc→o→midpoint→c
    // Interpolate 12 points to make the chart look natural
    const segments = [
      [d.pc, d.o],
      [d.o,  d.c >= d.o ? d.l : d.h],
      [d.c >= d.o ? d.l : d.h, d.c],
    ];
    const closes = [];
    segments.forEach(([from, to]) => {
      for (let i = 0; i < 4; i++) closes.push(from + (to - from) * (i / 4));
    });
    closes.push(d.c);
    if (closes.length < 2) return;

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

    el.innerHTML = renderHourlyChart(closes) + band +
      `<div class="chart-foot"><span>prev close</span><span style="color:rgba(255,255,255,0.1)">▓ sentiment</span><span>now</span></div>`;
  } catch (e) {
    console.warn('[loadHourlyChart]', e.message);
  }
  if (_hourlyChartTimer) clearTimeout(_hourlyChartTimer);
  _hourlyChartTimer = setTimeout(loadHourlyChart, 30 * 60 * 1000);
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
  if (label) label.textContent = t('liveLabel', live);
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
let _priceSnapshotTimer = null;
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
    const quotesArr = await Promise.all(
      SNAPSHOT_SYMS.map(s =>
        fetch(`https://finnhub.io/api/v1/quote?symbol=${s}&token=${FINNHUB_API_KEY}`).then(r => r.json())
      )
    );

    const rows = SNAPSHOT_SYMS.map((sym, i) => {
      const q = quotesArr[i] || {};
      // Build OHLC-derived sparkline from free quote data: pc→o→(low or high)→c
      const ohlc = [q.pc, q.o, q.c >= q.o ? q.l : q.h, q.c].filter(v => v && !isNaN(v));
      const pts = _sparkPoints(ohlc);
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

    el.innerHTML = `<div class="sidebar-title">${t('priceSnapshot')} <span class="live-badge-sm">LIVE</span></div>${rows}`;
    el.style.display = '';
  } catch { el.style.display = 'none'; }
  if (_priceSnapshotTimer) clearTimeout(_priceSnapshotTimer);
  _priceSnapshotTimer = setTimeout(loadPriceSnapshot, 30000);
}

window.loadFearGreed = loadFearGreed;
window.loadPriceSnapshot = loadPriceSnapshot;
