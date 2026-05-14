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

const NITTER_INSTANCES = [
  'https://nitter.poast.org',
  'https://nitter.privacydev.net',
  'https://nitter.1d4.us',
];

const KOLS = [
  { handle: 'realDonaldTrump', display_name: 'Donald Trump' },
  { handle: 'elonmusk',        display_name: 'Elon Musk' },
  { handle: 'cz_binance',      display_name: 'CZ' },
  { handle: 'justinsuntron',   display_name: 'Justin Sun' },
  { handle: 'VitalikButerin',  display_name: 'Vitalik' },
  { handle: 'saylor',          display_name: 'Michael Saylor' },
];

function cleanHtml(text) {
  return text
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractTweetId(link) {
  const m = link.match(/\/status\/(\d+)/);
  return m ? m[1] : null;
}

async function fetchKolRSS(handle) {
  for (const instance of NITTER_INSTANCES) {
    try {
      const url = `${instance}/${handle}/rss`;
      const feed = await parser.parseURL(url);
      return feed.items;
    } catch (err) {
      console.error(`  Nitter ${instance} failed for @${handle}:`, err.message);
    }
  }
  console.error(`  All nitter instances failed for @${handle}`);
  return [];
}

async function getExistingTweetIds(handles) {
  const { data } = await supabase
    .from('kol_tweets')
    .select('tweet_id')
    .in('handle', handles);
  return new Set((data || []).map(r => r.tweet_id));
}

async function analyzeWithGemini(handle, content) {
  try {
    const prompt = `You are a crypto market analyst. Analyze this tweet from @${handle} for crypto market impact.
Respond with ONLY valid JSON — no markdown, no explanation.

Tweet: ${content}

{
  "summary_en": "<one sentence in English, ≤20 words, on crypto market impact>",
  "summary_zh": "<一句话中文，25字以内，说明对加密市场的影响>",
  "importance_score": <1-10 integer>,
  "tags": ["<tag1>", "<tag2>"],
  "is_crypto_relevant": <true|false>
}

Score guide:
9-10: Direct crypto action (policy announcement, major purchase/sale, exchange issues)
7-8: High market impact (economic policy, explicit crypto mention, regulatory stance)
5-6: Moderate relevance (inflation, tech, market sentiment)
1-4: Irrelevant to crypto markets`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(text);
    return {
      summary_en: (parsed.summary_en || '').slice(0, 300),
      summary_zh: (parsed.summary_zh || '').slice(0, 200),
      importance_score: Math.min(10, Math.max(1, parseInt(parsed.importance_score) || 1)),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
      is_crypto_relevant: !!parsed.is_crypto_relevant
    };
  } catch (err) {
    console.error(`  Gemini failed for @${handle}:`, err.message);
    return null;
  }
}

async function main() {
  console.log('CryptoLens KOL fetch started:', new Date().toISOString());

  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const handles = KOLS.map(k => k.handle);
  const existingIds = await getExistingTweetIds(handles);
  console.log(`Existing tweet IDs in DB: ${existingIds.size}`);

  let totalInserted = 0;

  for (const kol of KOLS) {
    console.log(`\nFetching @${kol.handle}`);
    const items = await fetchKolRSS(kol.handle);
    console.log(`  Got ${items.length} items from RSS`);

    const newTweets = [];
    for (const item of items) {
      const pubDate = item.pubDate ? new Date(item.pubDate) : null;
      if (!pubDate || pubDate < cutoff) continue;

      const rawContent = cleanHtml(item.content || item.contentSnippet || item.title || '');
      if (rawContent.startsWith('RT @') || rawContent.startsWith('@')) continue;

      const link = item.link || item.guid || '';
      const tweetId = extractTweetId(link);
      if (!tweetId) continue;
      if (existingIds.has(tweetId)) continue;

      newTweets.push({ tweetId, rawContent, link, pubDate });
    }

    console.log(`  ${newTweets.length} new tweets to analyze`);

    for (const tweet of newTweets) {
      await sleep(3000);
      const analysis = await analyzeWithGemini(kol.handle, tweet.rawContent);
      if (!analysis) continue;

      if (!analysis.is_crypto_relevant || analysis.importance_score < 6) {
        console.log(`  [${analysis.importance_score}] SKIP: ${tweet.rawContent.slice(0, 60)}`);
        continue;
      }

      const { error } = await supabase.from('kol_tweets').insert({
        tweet_id:         tweet.tweetId,
        handle:           kol.handle,
        display_name:     kol.display_name,
        content:          tweet.rawContent,
        tweet_url:        `https://x.com/${kol.handle}/status/${tweet.tweetId}`,
        summary_en:       analysis.summary_en,
        summary_zh:       analysis.summary_zh,
        importance_score: analysis.importance_score,
        tags:             analysis.tags,
        published_at:     tweet.pubDate.toISOString()
      });

      if (error && !error.message.includes('duplicate')) {
        console.error(`  Insert failed for tweet ${tweet.tweetId}:`, error.message);
      } else if (!error) {
        existingIds.add(tweet.tweetId);
        totalInserted++;
        console.log(`  [${analysis.importance_score}] SAVED: ${tweet.rawContent.slice(0, 60)}`);
      }
    }
  }

  console.log(`\nDone. Inserted: ${totalInserted}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
