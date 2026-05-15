import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });
const parser = new Parser({ timeout: 10000 });

const sleep = ms => new Promise(r => setTimeout(r, ms));

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
      source_id: source.id,
      source_name: source.name,
      source_category: source.category,
      title: item.title?.trim() || '',
      original_url: item.link || item.guid || '',
      content: (item.contentSnippet || item.content || item.summary || '').slice(0, 3000),
      published_at: item.pubDate ? new Date(item.pubDate).toISOString() : new Date().toISOString()
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

const GEMINI_PROMPT = (title, content, sourceName) => `
You are an editorial assistant for CryptoLens, a crypto × AI intelligence platform.
Analyze this article and respond with ONLY a valid JSON object — no markdown, no explanation.

Article:
Source: ${sourceName}
Title: ${title}
Content: ${content}

Scoring dimensions:
- Source authority: a16z/Paradigm=high, Reddit=low
- Market cap relevance: BTC/ETH mentions add weight
- Impact: price-moving, regulatory, or major technology shift
- Crypto×AI crossover: significant bonus if both domains intersect

Return exactly this JSON:
{
  "summary": "<one punchy sentence in English, ≤25 words, capturing the key insight>",
  "summary_zh": "<一句话中文，25字以内，概括核心要点>",
  "editor_note": "<150-word opinion on why this matters for crypto/AI investors>",
  "importance_score": <integer 1-10>,
  "tags": ["<tag1>", "<tag2>", "<tag3>"],
  "category": "<one of: crypto | ai | cross | regulation | onchain>",
  "is_cross": <true|false>
}`;

async function processWithGemini(article) {
  try {
    const prompt = GEMINI_PROMPT(article.title, article.content, article.source_name);
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(text);
    return {
      importance_score: Math.min(10, Math.max(1, parseInt(parsed.importance_score) || 5)),
      summary: (parsed.summary || '').slice(0, 500),
      summary_zh: (parsed.summary_zh || '').slice(0, 200),
      editor_note: (parsed.editor_note || '').slice(0, 800),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 6) : [],
      category: ['crypto','ai','cross','regulation','onchain'].includes(parsed.category) ? parsed.category : article.source_category,
      is_cross: !!parsed.is_cross
    };
  } catch (err) {
    console.error(`  Gemini failed for "${article.title}":`, err.message);
    return null;
  }
}

async function insertArticle(article, geminiResult) {
  const { error } = await supabase.from('articles').insert({
    source_id:        article.source_id,
    title:            article.title,
    original_url:     article.original_url,
    content:          article.content,
    published_at:     article.published_at,
    summary:          geminiResult.summary,
    summary_zh:       geminiResult.summary_zh,
    editor_note:      geminiResult.editor_note,
    importance_score: geminiResult.importance_score,
    tags:             geminiResult.tags,
    category:         geminiResult.category,
    is_pro:           geminiResult.importance_score >= 9,
    is_featured:      false
  });
  if (error && !error.message.includes('duplicate')) {
    console.error(`  Insert failed for "${article.title}":`, error.message);
  }
}

async function updateSourceTimestamp(sourceId) {
  await supabase.from('sources').update({ last_fetched_at: new Date().toISOString() }).eq('id', sourceId);
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
  "summary_en": "<3-4 sentences in English: dominant trend, key developments, key risk, directional bias>",
  "summary_zh": "<3-4句中文：主要趋势、关键进展、核心风险、方向判断>",
  "sentiment": "<bullish|bearish|neutral|mixed>",
  "sentiment_score": <integer -10 to +10, negative=bearish, positive=bullish>,
  "key_themes": ["<theme1>", "<theme2>", "<theme3>", "<theme4>", "<theme5>"]
}`;

  try {
    const result = await model.generateContent(prompt);
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
  console.log('CryptoLens fetch started:', new Date().toISOString());

  const sources = await loadSources();
  console.log(`Loaded ${sources.length} active sources`);

  let totalFetched = 0, totalNew = 0, totalProcessed = 0, totalInserted = 0;

  for (const source of sources) {
    console.log(`\nFetching: ${source.name}`);
    const articles = await fetchRSS(source);
    totalFetched += articles.length;
    console.log(`  Got ${articles.length} items`);

    const newArticles = await deduplicateArticles(articles);
    totalNew += newArticles.length;
    console.log(`  ${newArticles.length} new (after dedup)`);

    for (const article of newArticles) {
      await sleep(4000);
      const result = await processWithGemini(article);
      if (!result) continue;
      totalProcessed++;

      if (result.importance_score < 7) {
        console.log(`  [${result.importance_score}] SKIP: ${article.title.slice(0, 60)}`);
        continue;
      }

      await insertArticle(article, result);
      totalInserted++;
      console.log(`  [${result.importance_score}${result.importance_score >= 9 ? ' PRO' : ''}] SAVED: ${article.title.slice(0, 60)}`);
    }

    await updateSourceTimestamp(source.id);
  }

  console.log(`\nDone. Fetched:${totalFetched} New:${totalNew} Processed:${totalProcessed} Inserted:${totalInserted}`);
  await generateMarketPulse();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
