import { Scraper } from 'agent-twitter-client';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genai.getGenerativeModel({ model: 'gemini-2.5-flash' });

const sleep = ms => new Promise(r => setTimeout(r, ms));

const KOLS = [
  { handle: 'realDonaldTrump', display_name: 'Donald Trump' },
  { handle: 'elonmusk',        display_name: 'Elon Musk' },
  { handle: 'cz_binance',      display_name: 'CZ' },
  { handle: 'justinsuntron',   display_name: 'Justin Sun' },
  { handle: 'VitalikButerin',  display_name: 'Vitalik' },
  { handle: 'saylor',          display_name: 'Michael Saylor' },
];

// Score threshold — no is_crypto_relevant gate, score alone decides
const MIN_SCORE = 4;

const GEMINI_PROMPT = (handle, content) => `You are a crypto market analyst tracking KOL signals. Analyze this tweet from @${handle}.
Respond with ONLY valid JSON — no markdown, no explanation.

Tweet: ${content}

Consider BOTH direct AND indirect crypto market impact:
- Direct: mentions crypto, Bitcoin, NFT, DeFi, blockchain, exchange, stablecoin, regulation
- Indirect (especially for Trump/Musk): interest rates, inflation, USD policy, tariffs, government debt,
  tech regulation, AI policy, risk appetite signals, recession/growth outlook, geopolitical tension,
  Tesla/SpaceX news, DOGE references, SEC/CFTC, any financial market commentary

{
  "summary_en": "<one sentence in English, ≤20 words, on how this tweet could move crypto>",
  "summary_zh": "<一句话中文，25字以内，说明该推文对加密市场的潜在影响>",
  "importance_score": <1-10 integer>,
  "tags": ["<tag1>", "<tag2>"]
}

Scoring:
9-10: Direct crypto-moving (policy announcement, major buy/sell, exchange crisis, regulatory decision)
7-8: Strong indirect impact (rate/inflation policy, USD direction, major market event, explicit crypto mention)
5-6: Moderate indirect (economic outlook, tech policy, geopolitical risk, sector sentiment)
4:   Weak but worth tracking (general commentary from this figure that could shift risk appetite)
1-3: Personal/entertainment — unrelated to markets`;

async function getExistingTweetIds(handles) {
  const { data } = await supabase
    .from('kol_tweets')
    .select('tweet_id')
    .in('handle', handles);
  return new Set((data || []).map(r => r.tweet_id));
}

async function fetchTweets(scraper, handle, maxTweets = 25) {
  const tweets = [];
  try {
    for await (const tweet of scraper.getTweets(handle, maxTweets)) {
      tweets.push(tweet);
    }
  } catch (err) {
    console.error(`  fetchTweets failed for @${handle}:`, err.message);
  }
  return tweets;
}

async function analyzeWithGemini(handle, content) {
  try {
    const result = await model.generateContent(GEMINI_PROMPT(handle, content));
    const text = result.response.text().trim().replace(/^```json\n?/, '').replace(/\n?```$/, '');
    const parsed = JSON.parse(text);
    return {
      summary_en:       (parsed.summary_en || '').slice(0, 300),
      summary_zh:       (parsed.summary_zh || '').slice(0, 200),
      importance_score: Math.min(10, Math.max(1, parseInt(parsed.importance_score) || 1)),
      tags:             Array.isArray(parsed.tags) ? parsed.tags.slice(0, 5) : [],
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

  const scraper = new Scraper();

  const authToken = process.env.TWITTER_AUTH_TOKEN;
  const ct0       = process.env.TWITTER_CT0;
  if (!authToken || !ct0) {
    console.error('TWITTER_AUTH_TOKEN / TWITTER_CT0 not set. Aborting.');
    process.exit(1);
  }
  await scraper.setCookies([
    `auth_token=${authToken}; Domain=.twitter.com; Path=/; Secure`,
    `ct0=${ct0}; Domain=.twitter.com; Path=/; Secure`,
  ]);
  console.log('Cookies set, verifying login...');
  const loggedIn = await scraper.isLoggedIn();
  if (!loggedIn) {
    console.error('Cookie auth failed — token may have expired, refresh auth_token + ct0.');
    process.exit(1);
  }
  console.log('Login OK (cookie auth)');

  let totalInserted = 0;

  for (const kol of KOLS) {
    console.log(`\nFetching @${kol.handle}`);
    const tweets = await fetchTweets(scraper, kol.handle);
    console.log(`  Got ${tweets.length} tweets`);

    const candidates = tweets.filter(t => {
      if (!t.timeParsed || t.timeParsed < cutoff) return false;
      if (t.isRetweet) return false;
      if (!t.id || existingIds.has(t.id)) return false;
      return true;
    });

    console.log(`  ${candidates.length} new tweets to analyze (after dedup + cutoff)`);

    for (const tweet of candidates) {
      await sleep(2500);
      const content = tweet.text || '';
      const analysis = await analyzeWithGemini(kol.handle, content);
      if (!analysis) continue;

      if (analysis.importance_score < MIN_SCORE) {
        console.log(`  [${analysis.importance_score}] SKIP: ${content.slice(0, 70)}`);
        continue;
      }

      const tweetUrl = tweet.permanentUrl || `https://x.com/${kol.handle}/status/${tweet.id}`;

      const { error } = await supabase.from('kol_tweets').insert({
        tweet_id:         tweet.id,
        handle:           kol.handle,
        display_name:     kol.display_name,
        content:          content,
        tweet_url:        tweetUrl,
        summary_en:       analysis.summary_en,
        summary_zh:       analysis.summary_zh,
        importance_score: analysis.importance_score,
        tags:             analysis.tags,
        published_at:     tweet.timeParsed.toISOString(),
      });

      if (error && !error.message.includes('duplicate')) {
        console.error(`  Insert failed:`, error.message);
      } else if (!error) {
        existingIds.add(tweet.id);
        totalInserted++;
        console.log(`  [${analysis.importance_score}] SAVED: ${content.slice(0, 70)}`);
      }
    }
  }

  console.log(`\nDone. Inserted: ${totalInserted}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
