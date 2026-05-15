-- CryptoLens Migration — Market Pulse + Source Updates
-- Run in Supabase dashboard → SQL Editor

-- ── 1. Update sources ────────────────────────────────────────

-- Disable low-signal Reddit sources
UPDATE sources SET is_active = false
WHERE name IN ('Reddit Crypto', 'Reddit AI');

-- Add high-signal sources
INSERT INTO sources (name, url, feed_url, category) VALUES
  ('CoinTelegraph',  'https://cointelegraph.com',          'https://cointelegraph.com/rss',                         'crypto'),
  ('Bitcoin Magazine','https://bitcoinmagazine.com',       'https://bitcoinmagazine.com/.rss/full/',                'crypto'),
  ('The Defiant',    'https://thedefiant.io',              'https://thedefiant.io/feed',                            'crypto'),
  ('Bankless',       'https://bankless.com',               'https://bankless.substack.com/feed',                    'crypto'),
  ('CryptoSlate',    'https://cryptoslate.com',            'https://cryptoslate.com/feed/',                         'crypto'),
  ('Milk Road',      'https://milkroad.com',               'https://milkroad.com/feed',                             'crypto')
ON CONFLICT DO NOTHING;

-- ── 2. Create market_pulse table ─────────────────────────────
CREATE TABLE IF NOT EXISTS market_pulse (
  id              uuid primary key default gen_random_uuid(),
  summary_en      text,
  summary_zh      text,
  sentiment       text,        -- bullish | bearish | neutral | mixed
  sentiment_score int,         -- -10 to +10
  key_themes      text[],
  article_count   int,
  created_at      timestamp default now()
);

ALTER TABLE market_pulse ENABLE ROW LEVEL SECURITY;

-- ── 3. Create market_pulse_public view ───────────────────────
CREATE OR REPLACE VIEW market_pulse_public AS
  SELECT id, summary_en, summary_zh, sentiment, sentiment_score, key_themes, article_count, created_at
  FROM market_pulse
  ORDER BY created_at DESC;

GRANT SELECT ON market_pulse_public TO anon, authenticated;
