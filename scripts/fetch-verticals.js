// QiZh Lens + QiZh Lens content pipeline.
// Lives in the CryptoLens repo so it reuses the same GitHub Actions secrets
// (SUPABASE_SERVICE_ROLE_KEY / GEMINI_API_KEY) — runs right after fetch.js.
// Tables: stock_articles/stock_pulses, metal_articles/metal_pulses
// (NOTE: schema differs from crypto `articles`: no source_id/content columns,
//  and *_pulses.sentiment_score is -100..100, not -10..10.)
import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

/* Gemini 调用必须有超时:实测过一次 job 卡了 5 小时(GitHub 默认允许 6h),
   之后被后续调度取消 → 每次都给 Zion 发一封 cancelled 通知邮件。
   SDK 本身不带超时,这里用 Promise.race 兜住,超时按"这批失败"处理走原有降级逻辑。 */
const GEN_TIMEOUT_MS = 90000;
async function genWithTimeout(prompt, label) {
  let timer;
  try {
    return await Promise.race([
      model.generateContent(prompt),
      new Promise((_, rej) => { timer = setTimeout(() => rej(new Error(`Gemini timeout ${GEN_TIMEOUT_MS}ms (${label || 'gen'})`)), GEN_TIMEOUT_MS); }),
    ]);
  } finally { clearTimeout(timer); }
}
const parser = new Parser({ timeout: 10000 });

const VERTICALS = [
  {
    name: 'QiZh Lens',
    articlesTable: 'stock_articles',
    pulsesTable: 'stock_pulses',
    categories: ['tech', 'elon', 'macro', 'earnings', 'ai'],
    persona: 'QiZh Lens, a stocks × AI intelligence platform (US equities, tech, macro, earnings)',
    pulsePersona: 'senior equity market analyst',
    sources: [
      { name: 'CNBC Top News',   feed_url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html', category: 'macro' },
      { name: 'CNBC Earnings',   feed_url: 'https://www.cnbc.com/id/15839135/device/rss/rss.html',  category: 'earnings' },
      { name: 'MarketWatch',     feed_url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories', category: 'macro' },
      { name: 'Yahoo Finance',   feed_url: 'https://finance.yahoo.com/news/rssindex',               category: 'tech' },
      { name: 'Google News · Markets', feed_url: 'https://news.google.com/rss/search?q=stock%20market%20OR%20nasdaq%20OR%20earnings%20when:1d&hl=en-US&gl=US&ceid=US:en', category: 'macro' },
    ],
  },
  {
    name: 'QiZh Lens',
    articlesTable: 'metal_articles',
    pulsesTable: 'metal_pulses',
    categories: ['gold', 'silver', 'oil', 'macro', 'ai'],
    persona: 'QiZh Lens, a commodities × AI intelligence platform (gold, silver, oil, macro)',
    pulsePersona: 'senior commodities market analyst',
    sources: [
      { name: 'Mining.com',      feed_url: 'https://www.mining.com/feed/',  category: 'gold' },
      { name: 'OilPrice.com',    feed_url: 'https://oilprice.com/rss/main', category: 'oil' },
      { name: 'Google News · Metals', feed_url: 'https://news.google.com/rss/search?q=gold%20OR%20silver%20OR%20copper%20price%20when:1d&hl=en-US&gl=US&ceid=US:en', category: 'gold' },
      { name: 'Google News · Oil',    feed_url: 'https://news.google.com/rss/search?q=oil%20price%20OR%20OPEC%20when:1d&hl=en-US&gl=US&ceid=US:en', category: 'oil' },
    ],
  },
  {
    name: 'QiZh Lens',
    articlesTable: 'startup_articles',
    pulsesTable: 'startup_pulses',
    categories: ['startup', 'indie', 'overseas', 'ai', 'funding', 'tools'],
    persona: 'QiZh Lens, a startup × indie-hacker × going-global intelligence platform (solo founders, bootstrapping, product launches, overseas/出海 expansion, AI tools & funding)',
    pulsePersona: 'senior startup & indie-hacker analyst who advises solo founders',
    sources: [
      { name: 'Hacker News Front', feed_url: 'https://hnrss.org/frontpage',                 category: 'tools' },
      { name: 'TechCrunch Startups', feed_url: 'https://techcrunch.com/category/startups/feed/', category: 'startup' },
      { name: 'Product Hunt',      feed_url: 'https://www.producthunt.com/feed',            category: 'tools' },
      { name: '36Kr',              feed_url: 'https://36kr.com/feed',                        category: 'startup' },
      { name: 'Google News · Indie', feed_url: 'https://news.google.com/rss/search?q=indie%20hacker%20OR%20solo%20founder%20OR%20bootstrapped%20startup%20when:2d&hl=en-US&gl=US&ceid=US:en', category: 'indie' },
      { name: 'Google News · 出海', feed_url: 'https://news.google.com/rss/search?q=%E5%87%BA%E6%B5%B7%20OR%20%E5%93%81%E7%89%8C%E5%87%BA%E6%B5%B7%20OR%20%E8%B7%A8%E5%A2%83%20when:2d&hl=zh-CN&gl=CN&ceid=CN:zh', category: 'overseas' },
      { name: 'Google News · Funding', feed_url: 'https://news.google.com/rss/search?q=startup%20funding%20OR%20seed%20round%20OR%20YC%20when:2d&hl=en-US&gl=US&ceid=US:en', category: 'funding' },
    ],
  },
];

async function fetchRSS(source) {
  try {
    const feed = await parser.parseURL(source.feed_url);
    return feed.items.slice(0, 6).map(item => ({
      source_name:     source.name,
      source_category: source.category,
      title:           (item.title || '').trim(),
      original_url:    item.link || item.guid || '',
      content:         (item.contentSnippet || item.content || item.summary || '').slice(0, 500),
      published_at:    item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString(),
    })).filter(a => a.title && a.original_url);
  } catch (err) {
    console.error(`  RSS fetch failed for ${source.name}:`, err.message);
    return [];
  }
}

async function dedupe(table, articles) {
  if (!articles.length) return [];
  const urls = articles.map(a => a.original_url);
  const { data } = await supabase.from(table).select('original_url').in('original_url', urls);
  const existing = new Set((data || []).map(r => r.original_url));
  // also de-dup within the batch (Google News overlaps direct feeds)
  const seen = new Set();
  return articles.filter(a => {
    if (existing.has(a.original_url) || seen.has(a.original_url)) return false;
    seen.add(a.original_url);
    return true;
  });
}

async function scoreBatch(v, articles) {
  if (!articles.length) return [];
  const list = articles.map((a, i) =>
    `[${i}] Source: ${a.source_name} | Category hint: ${a.source_category}\nTitle: ${a.title}\nSnippet: ${a.content.slice(0, 400)}`
  ).join('\n\n');

  const prompt = `You are an editorial assistant for ${v.persona}.
Analyze each of these ${articles.length} articles and return a JSON array. Respond with ONLY valid JSON — no markdown fences, no explanation.

Scoring: major-outlet, market-moving, or structural-trend stories = high; clickbait/minor = low. AI×market crossover gets a bonus.

Return a JSON array with exactly ${articles.length} objects in the same order:
[
  {
    "summary": "<≤25-word English sentence capturing the key insight>",
    "summary_zh": "<≤25字中文，概括核心要点>",
    "editor_note": "<80-120 word opinion on why this matters for investors>",
    "importance_score": <1-10>,
    "tags": ["tag1", "tag2", "tag3"],
    "category": "<${v.categories.join('|')}>"
  }
]

Articles to analyze:
${list}`;

  try {
    const result = await genWithTimeout(prompt);
    const text = result.response.text().trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed)) return articles.map(() => null);
    while (parsed.length < articles.length) parsed.push(null);
    return parsed.map((p, i) => {
      if (!p) return null;
      return {
        importance_score: Math.min(10, Math.max(1, parseInt(p.importance_score) || 5)),
        summary:     (p.summary || '').slice(0, 500),
        summary_zh:  (p.summary_zh || '').slice(0, 200),
        editor_note: (p.editor_note || '').slice(0, 800),
        tags:        Array.isArray(p.tags) ? p.tags.slice(0, 6) : [],
        category:    v.categories.includes(p.category) ? p.category : articles[i].source_category,
      };
    });
  } catch (err) {
    console.error(`  ${v.name} Gemini batch failed:`, err.message);
    return articles.map(() => null);
  }
}

async function generatePulse(v) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: articles } = await supabase
    .from(v.articlesTable)
    .select('title, summary, importance_score, category')
    .gte('published_at', since)
    .gte('importance_score', 7)
    .order('importance_score', { ascending: false })
    .limit(20);

  if (!articles?.length) { console.log(`${v.name} pulse: no recent high-signal articles, skipping`); return; }

  const list = articles.map(a => `[${a.importance_score}][${a.category}] ${a.title} — ${a.summary || ''}`).join('\n');
  const prompt = `You are a ${v.pulsePersona}. Synthesize these ${articles.length} high-signal stories from the past 24 hours into a market intelligence brief.

Stories (format: [score][category] title — summary):
${list}

Return ONLY valid JSON — no markdown, no explanation:
{
  "summary_en": "<3-4 sentences: dominant trend, key developments, key risk, directional bias>",
  "sentiment": "<bullish|bearish|neutral|mixed>",
  "sentiment_score": <integer -100 to +100>,
  "key_themes": ["theme1", "theme2", "theme3", "theme4", "theme5"]
}`;

  try {
    const result = await genWithTimeout(prompt);
    const text = result.response.text().trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(text);
    const valid = ['bullish', 'bearish', 'neutral', 'mixed'];
    await supabase.from(v.pulsesTable).insert({
      summary_en:      (parsed.summary_en || '').slice(0, 1000),
      sentiment:       valid.includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
      sentiment_score: Math.min(100, Math.max(-100, parseInt(parsed.sentiment_score) || 0)),
      key_themes:      Array.isArray(parsed.key_themes) ? parsed.key_themes.slice(0, 6) : [],
      article_count:   articles.length,
    });
    console.log(`${v.name} pulse: ${parsed.sentiment} (${parsed.sentiment_score})`);
  } catch (err) {
    console.error(`${v.name} pulse failed:`, err.message);
  }
}

async function runVertical(v) {
  console.log(`\n=== ${v.name} ===`);
  const all = [];
  for (const source of v.sources) {
    process.stdout.write(`Fetching: ${source.name} ... `);
    const items = await fetchRSS(source);
    console.log(`${items.length} fetched`);
    all.push(...items);
  }
  const fresh = await dedupe(v.articlesTable, all);
  console.log(`New articles: ${fresh.length}/${all.length}`);
  // 省 Gemini 额度:没新文章就别空跑 pulse(pulse 只在真有新文章入库后刷新)
  if (!fresh.length) { console.log(`${v.name}: no fresh, skip pulse`); return; }

  const scored = await scoreBatch(v, fresh);
  let inserted = 0;
  for (let i = 0; i < fresh.length; i++) {
    const r = scored[i];
    if (!r) continue;
    if (r.importance_score < 7) { console.log(`  [${r.importance_score}] SKIP: ${fresh[i].title.slice(0, 60)}`); continue; }
    const { error } = await supabase.from(v.articlesTable).insert({
      title:            fresh[i].title,
      original_url:     fresh[i].original_url,
      published_at:     fresh[i].published_at,
      source_name:      fresh[i].source_name,
      summary:          r.summary,
      summary_zh:       r.summary_zh,
      editor_note:      r.editor_note,
      importance_score: r.importance_score,
      tags:             r.tags,
      category:         r.category,
      is_pro:           r.importance_score >= 9,
    });
    if (error && !error.message.includes('duplicate')) {
      console.error(`  Insert failed for "${fresh[i].title.slice(0, 50)}":`, error.message);
    } else if (!error) {
      inserted++;
      console.log(`  [${r.importance_score}${r.importance_score >= 9 ? ' PRO' : ''}] SAVED: ${fresh[i].title.slice(0, 60)}`);
    }
  }
  console.log(`${v.name} inserted: ${inserted}`);
  // 省 Gemini 额度:只有真有高信号文章入库才刷新 pulse
  if (inserted > 0) await generatePulse(v);
  else console.log(`${v.name}: 0 inserted, skip pulse`);
}

async function main() {
  console.log('Verticals fetch started:', new Date().toISOString());
  for (const v of VERTICALS) {
    try { await runVertical(v); }
    catch (err) { console.error(`${v.name} fatal:`, err.message); }
  }
  console.log('\nVerticals fetch done.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
