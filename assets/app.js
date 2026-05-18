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

window.setCategory = setCategory;
window.filterByTag = filterByTag;
window.openArticle = openArticle;
window.handleSubscribe = handleSubscribe;
window.loadFeed = loadFeed;
window.loadTodaysTop = loadTodaysTop;
function renderDailyBars(days) {
  const W = 600, H = 170;
  const PL = 8, PR = 8, PT = 18, PB = 32;
  const plotW = W - PL - PR;
  const plotH = H - PT - PB;
  const n = days.length;
  const midY = PT + plotH / 2;
  const COLOR = { bullish:'#00c896', bearish:'#ff4757', neutral:'#ffd32a', mixed:'#a29bfe' };

  const maxAbs = Math.max(...days.map(d => Math.abs(d.score)), 2);
  const scale  = (plotH / 2 - 4) / maxAbs;

  const barW = Math.min(plotW / n * 0.6, 36);
  const step  = plotW / n;

  const bars = days.map((d, i) => {
    const cx   = PL + (i + 0.5) * step;
    const bh   = Math.max(Math.abs(d.score) * scale, 3);
    const by   = d.score >= 0 ? midY - bh : midY;
    const c    = COLOR[d.sentiment] || '#a29bfe';
    const sign = d.score > 0 ? '+' : '';
    const ly   = d.score >= 0 ? by - 6 : by + bh + 14;
    const dl   = new Date(d.day + 'T12:00:00Z').toLocaleDateString('en', { month: 'short', day: 'numeric' });
    return `<rect x="${(cx-barW/2).toFixed(1)}" y="${by.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${c}" rx="2" opacity="0.85"/>
<text x="${cx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" font-size="9.5" fill="${c}" font-family="JetBrains Mono,monospace" font-weight="700">${sign}${d.score}</text>
<text x="${cx.toFixed(1)}" y="${H-5}" text-anchor="middle" font-size="8.5" fill="rgba(255,255,255,0.28)" font-family="JetBrains Mono,monospace">${dl}</text>`;
  }).join('');

  return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" style="width:100%;height:160px;display:block">
  <line x1="${PL}" y1="${midY}" x2="${W-PR}" y2="${midY}" stroke="rgba(255,255,255,0.1)" stroke-width="1" stroke-dasharray="4,3"/>
  ${bars}
</svg>`;
}

async function loadPulseTrend() {
  const container = document.getElementById('pulse-trend');
  if (!container) return;
  const sb = window.CL.supabase;
  // fetch enough for 14 days (12 readings/day × 14 = 168)
  const { data, error } = await sb
    .from('market_pulse_public')
    .select('sentiment_score, sentiment, created_at')
    .limit(200);
  if (error) { console.warn('pulse trend:', error.message); return; }
  if (!data || data.length < 2) { container.innerHTML = ''; return; }

  // aggregate by calendar day
  const byDay = {};
  data.forEach(r => {
    const day = r.created_at.slice(0, 10);
    if (!byDay[day]) byDay[day] = { scores: [], sentiments: [] };
    byDay[day].scores.push(r.sentiment_score);
    byDay[day].sentiments.push(r.sentiment);
  });

  const aggregated = Object.keys(byDay).sort().map(day => {
    const scores = byDay[day].scores;
    const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const sentCount = {};
    byDay[day].sentiments.forEach(s => { sentCount[s] = (sentCount[s] || 0) + 1; });
    const sentiment = Object.entries(sentCount).sort((a, b) => b[1] - a[1])[0][0];
    return { day, score: avg, sentiment };
  });

  if (aggregated.length < 2) { container.innerHTML = ''; return; }
  container.innerHTML = renderDailyBars(aggregated);
}

window.loadSidebarTags = loadSidebarTags;
window.loadMarketPulse = loadMarketPulse;
window.loadPulseTrend  = loadPulseTrend;
