-- StockLens tables — run in Supabase Dashboard → SQL Editor

CREATE TABLE IF NOT EXISTS stock_articles (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       timestamptz DEFAULT now(),
  published_at     timestamptz DEFAULT now(),
  title            text        NOT NULL,
  summary          text,
  summary_zh       text,
  source_name      text,
  original_url     text,
  category         text,        -- tech | elon | macro | earnings | ai
  importance_score numeric      DEFAULT 7,
  tags             text[]       DEFAULT '{}',
  is_pro           boolean      DEFAULT false,
  editor_note      text
);

CREATE TABLE IF NOT EXISTS stock_pulses (
  id               uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at       timestamptz DEFAULT now(),
  sentiment        text        DEFAULT 'neutral',  -- bullish | bearish | neutral | mixed
  sentiment_score  numeric     DEFAULT 0,          -- -100 to 100
  article_count    integer     DEFAULT 0,
  summary_en       text,
  key_themes       text[]      DEFAULT '{}'
);

-- Public read access (frontend handles Pro paywall UI)
ALTER TABLE stock_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON stock_articles FOR SELECT USING (true);

ALTER TABLE stock_pulses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON stock_pulses FOR SELECT USING (true);

-- Sample data so the page renders on first load
INSERT INTO stock_pulses (sentiment, sentiment_score, article_count, summary_en, key_themes)
VALUES (
  'bullish', 42, 28,
  'Tech stocks rally on strong NVDA earnings beat. AI infrastructure spending accelerates across hyperscalers. Fed holds rates steady.',
  ARRAY['NVDA', 'AI infrastructure', 'Fed policy', 'earnings']
);

INSERT INTO stock_articles (title, summary, source_name, original_url, category, importance_score, tags)
VALUES
  ('NVIDIA Beats Q1 Estimates, Raises Guidance on AI Demand',
   'NVIDIA reported Q1 revenue of $26B, up 18% YoY, driven by data center GPU demand from hyperscalers.',
   'Reuters', 'https://reuters.com', 'tech', 9, ARRAY['NVDA', 'earnings', 'AI']),
  ('Tesla Cybertruck Production Ramp Ahead of Schedule',
   'Tesla confirms Cybertruck deliveries accelerating, targets 250k units annually by Q3.',
   'Bloomberg', 'https://bloomberg.com', 'elon', 8, ARRAY['TSLA', 'production']),
  ('Fed Signals Rate Hold Through Summer',
   'Federal Reserve officials indicate no rate changes expected until fall, citing persistent inflation.',
   'WSJ', 'https://wsj.com', 'macro', 8, ARRAY['Fed', 'rates', 'macro']),
  ('Palantir Wins $500M DoD AI Contract',
   'Palantir awarded major Pentagon contract for AI-driven logistics and battlefield intelligence.',
   'FT', 'https://ft.com', 'ai', 8, ARRAY['PLTR', 'government', 'AI']),
  ('S&P 500 Hits New All-Time High on Tech Surge',
   'SPY closes above 560, led by Magnificent Seven stocks gaining on AI optimism.',
   'CNBC', 'https://cnbc.com', 'macro', 7, ARRAY['SPY', 'market', 'ATH']);
