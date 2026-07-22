-- StartupLens tables — run in Supabase Dashboard → SQL Editor
-- Vertical: 创业 / 独立开发 / 出海 (startup / indie-hacker / going-global)
-- Schema is identical to stock_* / metal_*: *_articles has no source_id/content
-- columns, and *_pulses.sentiment_score ranges -100..100.

CREATE TABLE IF NOT EXISTS startup_articles (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       timestamptz DEFAULT now(),
  published_at     timestamptz DEFAULT now(),
  title            text        NOT NULL,
  summary          text,
  summary_zh       text,
  source_name      text,
  original_url     text,
  category         text,        -- startup | indie | overseas | ai | funding | tools
  importance_score numeric      DEFAULT 7,
  tags             text[]       DEFAULT '{}',
  is_pro           boolean      DEFAULT false,
  editor_note      text
);

CREATE TABLE IF NOT EXISTS startup_pulses (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       timestamptz DEFAULT now(),
  sentiment        text        DEFAULT 'neutral',  -- bullish | bearish | neutral | mixed
  sentiment_score  numeric     DEFAULT 0,          -- -100 to 100
  article_count    integer     DEFAULT 0,
  summary_en       text,
  key_themes       text[]      DEFAULT '{}'
);

-- Public read access (frontend handles Pro paywall UI)
ALTER TABLE startup_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON startup_articles FOR SELECT USING (true);

ALTER TABLE startup_pulses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON startup_pulses FOR SELECT USING (true);

-- Sample data so the page renders on first load
INSERT INTO startup_pulses (sentiment, sentiment_score, article_count, summary_en, key_themes)
VALUES (
  'bullish', 36, 24,
  'Indie hackers ship AI-native micro-SaaS at record pace. Solo founders lean on AI coding agents to reach revenue faster. Going-global (出海) momentum strong as Chinese teams launch to global markets. Seed funding steadies.',
  ARRAY['indie hacker', 'AI micro-SaaS', '出海', 'solo founder', 'seed']
);

INSERT INTO startup_articles (title, summary, source_name, original_url, category, importance_score, tags)
VALUES
  ('Solo Founder Hits $20k MRR With AI-Built Micro-SaaS',
   'A one-person team reached $20k monthly recurring revenue in six months, building the entire product with AI coding agents and shipping weekly.',
   'Indie Hackers', 'https://www.indiehackers.com', 'indie', 9, ARRAY['micro-SaaS', 'MRR', 'AI coding']),
  ('Chinese Dev Tools Startup Goes Global, Lands US Enterprise Deals',
   'A bootstrapped team pivots to English-first, cracks overseas distribution via Product Hunt and reaches paying US customers within a quarter.',
   'TechCrunch', 'https://techcrunch.com', 'overseas', 8, ARRAY['出海', 'go-global', 'distribution']),
  ('YC Announces New Batch Skewed Heavily Toward AI Agents',
   'The latest cohort is dominated by AI agent and vertical-SaaS startups, signaling where early-stage capital is flowing next.',
   'Hacker News', 'https://news.ycombinator.com', 'funding', 8, ARRAY['YC', 'AI agents', 'seed']),
  ('New Open-Source Stack Lets One Person Ship a Full SaaS in a Weekend',
   'A batteries-included toolkit bundles auth, billing and deploy, cutting the time for a solo founder to launch a paid product to days.',
   'Product Hunt', 'https://www.producthunt.com', 'tools', 8, ARRAY['open-source', 'boilerplate', 'ship-fast']),
  ('Bootstrapped Startup Turns Down VC, Crosses $1M ARR Profitably',
   'Founders share the playbook for reaching $1M annual recurring revenue without outside funding, staying lean and profitable.',
   'TechCrunch', 'https://techcrunch.com', 'startup', 7, ARRAY['bootstrapped', 'ARR', 'profitable']);
