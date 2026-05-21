# StockLens Design Spec

**Goal:** Build StockLens (stocks.qizh.space) — a US stock market AI intelligence site mirroring CryptoLens architecture, sharing the same Supabase backend and Pro subscription.

**Architecture:** Pure static HTML/CSS/JS, GitHub Pages deployment, separate repo (`StockLens-site`). Shared Supabase project (new tables). Finnhub free tier for real-time prices. Cross-navigation links with CryptoLens.

**Tech Stack:** HTML/CSS/JS · Supabase JS v2 · Finnhub WebSocket + REST · Lemon Squeezy (shared) · GitHub Pages

---

## Site Structure

```
StockLens-site/
├── index.html        # Main page
├── subscribe.html    # Pro subscription (shared with CryptoLens)
├── about.html
├── privacy.html
├── CNAME             # stocks.qizh.space
└── assets/
    ├── config.js     # Supabase + Finnhub API key
    ├── style.css     # Same design tokens as CryptoLens
    ├── app.js        # Main logic
    ├── auth.js       # Copy from CryptoLens (unchanged)
    └── affiliate.js  # Copy from CryptoLens (unchanged)
```

---

## Pages

### index.html
Mirrors CryptoLens index.html exactly, with these substitutions:

| CryptoLens | StockLens |
|---|---|
| BTC/USD · BINANCE | S&P 500 · FINNHUB |
| Binance WebSocket | Finnhub WebSocket |
| Alternative.me Fear & Greed | CNN Fear & Greed |
| `pulses` table | `stock_pulses` table |
| `articles` table | `stock_articles` table |
| ALL/CROSS/CRYPTO/AI/REGULATION/ON-CHAIN | ALL/TECH/ELON/MACRO/EARNINGS/AI |
| 4-coin price snapshot | 5-stock price snapshot |

### subscribe.html
Same layout as CryptoLens. Add copy: "Pro unlocks both CryptoLens and StockLens." Uses same Lemon Squeezy variant IDs and same `is_pro` field.

### about.html / privacy.html
Copy from CryptoLens, update branding to StockLens.

---

## Data Sources

### Real-time Index Price (Hero Right Panel)
- **Source:** Finnhub WebSocket `wss://ws.finnhub.io?token=<API_KEY>`
- **Symbol:** `SPY` (S&P 500 ETF as proxy)
- **Subscribe message:** `{"type":"subscribe","symbol":"SPY"}`
- **Fallback:** Finnhub REST `GET https://finnhub.io/api/v1/quote?symbol=SPY&token=<KEY>` every 15s
- Display: price, % change, day range (high/low)

### Hourly Chart
- **Source:** Finnhub REST candles
- `GET https://finnhub.io/api/v1/stock/candle?symbol=SPY&resolution=60&from=<24h_ago>&to=<now>&token=<KEY>`
- Returns OHLCV arrays; use `c` (close) array
- Render: same SVG chart component as CryptoLens `renderHourlyChart()`

### CNN Fear & Greed Index
- **Source:** `https://production.dataviz.cnn.io/index/fearandgreed/graphdata`
- Free, no auth required
- Response: `{ fear_and_greed: { score, rating, previous_close, previous_1_week } }`
- Chinese labels: `极度恐慌 / 恐慌 / 中立 / 贪婪 / 极度贪婪`
- Fallback: hide block if fetch fails

### Price Snapshot Sidebar (5 stocks)
- **Source:** Finnhub REST `GET https://finnhub.io/api/v1/quote?symbol=<SYM>&token=<KEY>` (batched, one call per symbol)
- Symbols: `NVDA, TSLA, AAPL, PLTR, SPY`
- Sparkline: Finnhub candles `GET https://finnhub.io/api/v1/stock/candle?symbol=<SYM>&resolution=5&from=<1h_ago>&to=<now>&token=<KEY>` (12 data points)
- Refresh: every 30 seconds

### AI Signal Feed
- **Source:** Supabase `stock_articles` table (same schema as CryptoLens `articles`)
- Pagination: 10 per load, "Load more" button
- Category filter maps to `category` column values: `tech`, `elon`, `macro`, `earnings`, `ai`

### Today's Top Signals
- **Source:** Supabase `stock_pulses` table (same schema as CryptoLens `pulses`)
- Top 3 by `sentiment_score DESC` for today

### Market Pulse Hero Card
- **Source:** Supabase `stock_pulses` table, latest entry
- Same layout as CryptoLens pulse card

---

## Database Schema (new tables in existing Supabase project)

### `stock_pulses` (mirrors `pulses`)
```sql
CREATE TABLE stock_pulses (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  summary_en    text,
  summary_zh    text,
  sentiment_score numeric,  -- -100 to 100
  key_themes    text[],
  article_count integer,
  is_pro        boolean DEFAULT false
);
```

### `stock_articles` (mirrors `articles`)
```sql
CREATE TABLE stock_articles (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at    timestamptz DEFAULT now(),
  title         text,
  summary_en    text,
  summary_zh    text,
  source        text,
  source_url    text,
  category      text,  -- tech | elon | macro | earnings | ai
  sentiment_score numeric,
  tags          text[],
  is_pro        boolean DEFAULT false
);

ALTER TABLE stock_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_free" ON stock_articles FOR SELECT USING (is_pro = false);
CREATE POLICY "pro_all" ON stock_articles FOR SELECT USING (
  is_pro = false OR (
    auth.uid() IS NOT NULL AND
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND is_pro = true)
  )
);
```

Same RLS policies for `stock_pulses`.

---

## assets/config.js additions
```javascript
const FINNHUB_API_KEY = 'YOUR_FINNHUB_API_KEY';  // free tier from finnhub.io
```
Existing `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `LS_*` vars unchanged and reused.

---

## Cross-Navigation

### CryptoLens nav (add to existing nav-actions):
```html
<a href="https://stocks.qizh.space" target="_blank" rel="noopener"
   class="btn btn-ghost btn-sm">STOCKS ↗</a>
```

### StockLens nav (mirror):
```html
<a href="https://lens.qizh.space" target="_blank" rel="noopener"
   class="btn btn-ghost btn-sm">CRYPTO ↗</a>
```

---

## Tracked Stocks

| Symbol | Name | Category | Price Feed |
|---|---|---|---|
| SPY | S&P 500 ETF | macro | ✅ real-time |
| NVDA | NVIDIA | tech/ai | ✅ real-time |
| AAPL | Apple | tech | ✅ real-time |
| MSFT | Microsoft | tech | ✅ real-time |
| TSLA | Tesla | elon | ✅ real-time |
| GOOGL | Alphabet | tech/ai | ✅ real-time |
| AMZN | Amazon | tech | ✅ real-time |
| META | Meta | tech | ✅ real-time |
| PLTR | Palantir | ai | ✅ real-time |
| COIN | Coinbase | tech | ✅ real-time |
| MSTR | MicroStrategy | tech | ✅ real-time |
| RKLB | Rocket Lab | elon | ✅ real-time |
| QQQ | Nasdaq ETF | macro | ✅ real-time |
| SpaceX | SpaceX | elon | ❌ signals only |

---

## Finnhub Rate Limits (Free Tier)
- REST: 60 calls/minute
- WebSocket: 50 symbols simultaneously
- Price snapshot uses REST (5 calls per refresh × 2/min = well within limits)
- Hero chart uses REST (1 call on load)
- WebSocket used only for SPY real-time ticker

---

## Deployment
1. Create GitHub repo `StockLens-site` under `rAIn0x7`
2. Add `CNAME` file with `stocks.qizh.space`
3. Add DNS CNAME record: `stocks` → `rain0x7.github.io`
4. GitHub Pages: Settings → Pages → Source: `main` branch root
5. Run Supabase SQL migration for `stock_pulses` + `stock_articles`
6. Register Finnhub free account → copy API key to `config.js`
