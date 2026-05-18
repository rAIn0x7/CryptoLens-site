# CryptoLens — Real-time BTC + Layout Redesign

**Date:** 2026-05-18  
**Status:** Approved  
**Scope:** `assets/app.js`, `assets/style.css`, `index.html`

---

## Summary

Three coordinated changes to CryptoLens:

1. **Binance WebSocket** replaces CoinGecko polling for BTC price — true real-time (sub-second ticks)
2. **24h hourly BTC chart** replaces the 14-day daily chart — Binance klines API, no key required
3. **Layout redesign** — Hero becomes 2-panel (sentiment left, BTC right); sidebar expands to 340px with new widgets

---

## 1. Hero Redesign (Layout C)

### Structure

```
┌─────────────────────────────────────────────────────┐
│  MARKET PULSE · 47 SIGNALS · 2H AGO                │
│  ┌──────────────────┐  ┌──────────────────────────┐ │
│  │  BULLISH  +68    │  │  $103,420  ▲ +2.34%      │ │
│  │  Summary text    │  │  ● LIVE · BTC/USD         │ │
│  │  Theme tags      │  │  [24h hourly line chart]  │ │
│  │  [14d mini bars] │  │  [sentiment color band]   │ │
│  └──────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### Left panel (unchanged data source)
- Large mood word + score from `market_pulse_public` (Supabase)
- AI summary (EN + ZH, EN shown in hero)
- Theme tags
- 14-day mini bar chart (existing `loadPulseTrend` data, rendered smaller)

### Right panel (new)
- BTC price, 24h change — from Binance WebSocket
- 24h/7d low/high range — from Binance REST on load
- 24h hourly price line chart — from Binance klines
- Sentiment color band underneath chart (matches left panel colors, aligned to same hour intervals as klines)
- Blinking green dot + "LIVE" label while WebSocket is connected; falls back to "~10s" label if WS fails

### Hero background glow
- Existing behavior: `.pulse-bullish/.pulse-bearish/.pulse-neutral/.pulse-mixed` classes on `.pulse-hero`
- Glow direction changes from `to bottom` → `160deg` for more visual interest

---

## 2. Binance WebSocket Integration

### Connection
```
wss://stream.binance.com:9443/ws/btcusdt@ticker
```
Public stream, no API key, no account required.

### Message shape (relevant fields)
```json
{ "c": "103420.00", "P": "2.34", "h": "104233.00", "l": "100812.00", "v": "28400.00" }
```
- `c` = last price, `P` = 24h change %, `h`/`l` = 24h high/low, `v` = volume

### Reconnection
Auto-reconnect on `onclose` / `onerror` with 3s delay, max 10 retries. After 10 failures, fall back to Binance REST polling every 10s.

### Flash animation
On each price tick: `text-shadow: 0 0 10px rgba(247,147,26,0.5)` for 350ms on the price element.

### Elements updated per tick
- `#btc-price` in hero
- `#sb-btc` in sidebar Price Snapshot

---

## 3. 24h Hourly Chart

### Data source
```
GET https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=24
```
Returns array of `[openTime, open, high, low, close, volume, ...]`. Use `close` price at index 4.

### Chart spec
- SVG, `viewBox="0 0 380 88"`, `preserveAspectRatio="none"`, `width:100%; height:88px`
- Gradient fill under line (`#f7931a` → transparent)
- Animated "live dot" at rightmost point (pulsing ring)
- Price labels: current high/low on right axis (font-size 7, JetBrains Mono)
- Subtle grid lines at 25% and 60% height

### Sentiment color band
- Sits 5px below the chart SVG, height 6px
- Segments correspond to `market_pulse` readings for the same 24h window (2h intervals = 12 segments)
- Colors: `#00c896` bullish · `#ff4757` bearish · `#ffd32a` neutral · `#a29bfe` mixed
- Opacity encodes score magnitude (score 0–100 → opacity 0.4–1.0)

### Refresh cadence
- Chart data: fetch on page load, re-fetch every 30 minutes
- WebSocket handles live price — chart only needs periodic historical refresh

---

## 4. Wide Sidebar (340px)

Sidebar width: `280px → 340px`. Four blocks in order:

### Block 1: Price Snapshot (new)
Coins: BTC, ETH, SOL, BNB  
Per row: symbol · name · price · 24h% · 48px sparkline (7 data points, 24h)  
Data source: `GET https://api.binance.com/api/v3/ticker/24hr?symbols=["BTCUSDT","ETHUSDT","SOLUSDT","BNBUSDT"]`  
Refresh: every 30s (REST poll; WebSocket tick also updates BTC row)

### Block 2: Fear & Greed Index (new)
Source: `https://api.alternative.me/fng/` (free, no key)  
Shows: numeric value · label (Fear / Neutral / Greed) · gradient progress bar · yesterday / last week comparison  
Refresh: once on page load (index updates daily)

### Block 3: Subscribe (existing, restyled)
Slight visual refresh — cyan accent border, subscriber count line ("已有 X 位读者")  
No functional change

### Block 4: Trending Tags (existing, expanded)
Add 2–3 more tags from recent pulse themes (currently capped at ~5, expand to ~9)

---

## 5. File Changes

| File | Changes |
|------|---------|
| `assets/app.js` | Add `initBtcWebSocket()`, `loadHourlyChart()`, `loadPriceSnapshot()`, `loadFearGreed()`. Refactor `loadBtcTicker()` → replaced by WS. Refactor `renderDailyBars()` → `renderHourlyChart()`. Update `loadPulseTrend()` to use smaller bar render for hero left panel. Update `loadSidebarTags()` to accept more tags. Update `init()` to call new functions. |
| `assets/style.css` | Sidebar width `280px → 340px`. Hero grid `grid-template-columns: 1fr 1fr`. New styles: `.btc-panel`, `.price-row`, `.pr-spark`, `.fg-bar-wrap`, `.fg-bar`, `.live-ring`, `.sent-band`. Minor glow gradient update. |
| `index.html` | Update hero inner HTML structure (add `.btc-panel` div). Update sidebar HTML (add Price Snapshot and Fear & Greed blocks). |

---

## 6. Error Handling

- **WebSocket fails to connect**: fall back to Binance REST poll every 10s, show "~10s" instead of "LIVE"
- **Binance klines fails**: show empty chart container, no crash
- **Fear & Greed API fails**: hide the block silently
- **Price Snapshot fails**: show last cached values or hide rows

All async functions wrapped in try/catch. No crashes propagate to break other UI sections.

---

## 7. Out of Scope

- No server changes (purely client-side JS)
- No Supabase schema changes
- No changes to article feed, category filters, auth flow
- Mobile responsive adjustments are minimal — sidebar stacks below feed on narrow screens (existing behavior)
