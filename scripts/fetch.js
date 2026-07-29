import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

/* 全局看门狗:Gemini 已单独限时,但 Supabase 调用、DNS、socket 都可能 hang,
   而 job 一挂死就会被 timeout-minutes 杀掉 → 每次给 Zion 发一封 cancelled 通知邮件。
   到点主动、干净地收工:已经写进库的数据不受影响,没抓完的下一轮继续。 */
const HARD_LIMIT_MS = 7 * 60 * 1000;
setTimeout(() => {
  console.log(`\n⏱  到硬时限 7 分钟,主动收工(已入库的数据不受影响,余下的下一轮再抓)`);
  process.exit(0);
}, HARD_LIMIT_MS).unref();

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

async function loadSources() {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('is_active', true);
  if (error) throw error;
  return data;
}

async function fetchRSS(source) {
  try {
    const feed = await parser.parseURL(source.feed_url);
    return feed.items.slice(0, 5).map(item => ({
      source_id:       source.id,
      source_name:     source.name,
      source_category: source.category,
      title:           item.title?.trim() || '',
      original_url:    item.link || item.guid || '',
      content:         (item.contentSnippet || item.content || item.summary || '').slice(0, 500),
      published_at:    item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
    })).filter(a => a.title && a.original_url);
  } catch (err) {
    console.error(`  RSS fetch failed for ${source.name}:`, err.message);
    return [];
  }
}

async function deduplicateArticles(articles) {
  const urls = articles.map(a => a.original_url);
  const { data } = await supabase
    .from('articles')
    .select('original_url')
    .in('original_url', urls);
  const existing = new Set((data || []).map(r => r.original_url));
  return articles.filter(a => !existing.has(a.original_url));
}

// Process all new articles in ONE Gemini call instead of one call per article.
async function processBatchWithGemini(articles) {
  if (!articles.length) return [];

  const articleList = articles.map((a, i) =>
    `[${i}] Source: ${a.source_name} | Category hint: ${a.source_category}\nTitle: ${a.title}\nSnippet: ${a.content.slice(0, 400)}`
  ).join('\n\n');

  const prompt = `You are an editorial assistant for QiZh Lens, a crypto × AI intelligence platform.
Analyze each of these ${articles.length} articles and return a JSON array. Respond with ONLY valid JSON — no markdown fences, no explanation.

Scoring:
- Source authority: a16z/Paradigm/Bloomberg = high; general blogs = low
- Market impact: BTC/ETH price-moving, regulatory, major tech shift = high
- Crypto×AI crossover gets a bonus

Return a JSON array with exactly ${articles.length} objects in the same order:
[
  {
    "summary": "<≤25-word English sentence capturing the key insight>",
    "summary_zh": "<≤25字中文，概括核心要点>",
    "editor_note": "<100-150 word opinion on why this matters for crypto/AI investors>",
    "importance_score": <1-10>,
    "tags": ["tag1", "tag2", "tag3"],
    "category": "<crypto|ai|cross|regulation|onchain>",
    "is_cross": <true|false>
  }
]

Articles to analyze:
${articleList}`;

  try {
    const result = await genWithTimeout(prompt);
    const text = result.response.text().trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(text);

    if (!Array.isArray(parsed)) {
      console.error('Batch Gemini: response is not an array');
      return articles.map(() => null);
    }

    // Pad with nulls if Gemini returned fewer items than expected
    while (parsed.length < articles.length) parsed.push(null);

    return parsed.map((p, i) => {
      if (!p) return null;
      return {
        importance_score: Math.min(10, Math.max(1, parseInt(p.importance_score) || 5)),
        summary:     (p.summary || '').slice(0, 500),
        summary_zh:  (p.summary_zh || '').slice(0, 200),
        editor_note: (p.editor_note || '').slice(0, 800),
        tags:        Array.isArray(p.tags) ? p.tags.slice(0, 6) : [],
        category:    ['crypto','ai','cross','regulation','onchain'].includes(p.category) ? p.category : articles[i].source_category,
        is_cross:    !!p.is_cross,
      };
    });
  } catch (err) {
    console.error('Batch Gemini failed:', err.message);
    return articles.map(() => null);
  }
}

async function insertArticle(article, r) {
  const { error } = await supabase.from('articles').insert({
    source_id:        article.source_id,
    title:            article.title,
    original_url:     article.original_url,
    content:          article.content,
    published_at:     article.published_at,
    summary:          r.summary,
    summary_zh:       r.summary_zh,
    editor_note:      r.editor_note,
    importance_score: r.importance_score,
    tags:             r.tags,
    category:         r.category,
    is_pro:           r.importance_score >= 9,
    is_featured:      false
  });
  if (error && !error.message.includes('duplicate')) {
    console.error(`  Insert failed for "${article.title}":`, error.message);
  }
}

async function generateMarketPulse() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: articles } = await supabase
    .from('articles')
    .select('title, summary, importance_score, category')
    .gte('published_at', since)
    .gte('importance_score', 7)
    .order('importance_score', { ascending: false })
    .limit(20);

  if (!articles?.length) {
    console.log('Market Pulse: no recent high-signal articles, skipping');
    return;
  }

  console.log(`\nGenerating Market Pulse from ${articles.length} articles...`);

  const articleList = articles
    .map(a => `[${a.importance_score}][${a.category}] ${a.title} — ${a.summary || ''}`)
    .join('\n');

  const prompt = `You are a senior crypto market analyst. Synthesize these ${articles.length} high-signal stories from the past 24 hours into a market intelligence brief.

Stories (format: [score][category] title — summary):
${articleList}

Return ONLY valid JSON — no markdown, no explanation:
{
  "summary_en": "<3-4 sentences: dominant trend, key developments, key risk, directional bias>",
  "summary_zh": "<3-4句中文：主要趋势、关键进展、核心风险、方向判断>",
  "sentiment": "<bullish|bearish|neutral|mixed>",
  "sentiment_score": <integer -10 to +10>,
  "key_themes": ["theme1", "theme2", "theme3", "theme4", "theme5"]
}`;

  try {
    const result = await genWithTimeout(prompt);
    const text = result.response.text().trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(text);

    const validSentiments = ['bullish', 'bearish', 'neutral', 'mixed'];
    await supabase.from('market_pulse').insert({
      summary_en:      (parsed.summary_en || '').slice(0, 1000),
      summary_zh:      (parsed.summary_zh || '').slice(0, 800),
      sentiment:       validSentiments.includes(parsed.sentiment) ? parsed.sentiment : 'neutral',
      sentiment_score: Math.min(10, Math.max(-10, parseInt(parsed.sentiment_score) || 0)),
      key_themes:      Array.isArray(parsed.key_themes) ? parsed.key_themes.slice(0, 6) : [],
      article_count:   articles.length,
    });

    const sign = parsed.sentiment_score > 0 ? '+' : '';
    console.log(`Market Pulse generated: ${parsed.sentiment} (${sign}${parsed.sentiment_score})`);
  } catch (err) {
    console.error('Market Pulse generation failed:', err.message);
  }
}

async function main() {
  console.log('QiZh Lens fetch started:', new Date().toISOString());

  const sources = await loadSources();
  console.log(`Loaded ${sources.length} active sources`);

  // Phase 1: fetch all RSS feeds + deduplicate
  const allNew = [];
  let totalFetched = 0;

  for (const source of sources) {
    process.stdout.write(`Fetching: ${source.name} ... `);
    const articles = await fetchRSS(source);
    totalFetched += articles.length;
    const newArticles = await deduplicateArticles(articles);
    console.log(`${articles.length} fetched, ${newArticles.length} new`);
    allNew.push(...newArticles);
    await supabase.from('sources').update({ last_fetched_at: new Date().toISOString() }).eq('id', source.id);
  }

  console.log(`\nTotal new articles: ${allNew.length}`);

  // Phase 2: one batched Gemini call for all new articles
  let totalInserted = 0;
  if (allNew.length > 0) {
    console.log(`Calling Gemini once for ${allNew.length} articles...`);
    const results = await processBatchWithGemini(allNew);

    for (let i = 0; i < allNew.length; i++) {
      const r = results[i];
      if (!r) {
        console.log(`  SKIP (no result): ${allNew[i].title.slice(0, 60)}`);
        continue;
      }
      if (r.importance_score < 7) {
        console.log(`  [${r.importance_score}] SKIP: ${allNew[i].title.slice(0, 60)}`);
        continue;
      }
      await insertArticle(allNew[i], r);
      totalInserted++;
      console.log(`  [${r.importance_score}${r.importance_score >= 9 ? ' PRO' : ''}] SAVED: ${allNew[i].title.slice(0, 60)}`);
    }
  }

  console.log(`\nDone. Fetched:${totalFetched} New:${allNew.length} Inserted:${totalInserted}`);

  // Phase 3: second Gemini call — Market Pulse synthesis
  await generateMarketPulse();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
