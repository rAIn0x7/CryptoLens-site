# CryptoLens MVP — Design Spec
**Date:** 2026-05-12  
**Status:** Approved  
**Domain:** lens.qizh.space (CNAME subdomain of qizh.space)

---

## 1. Product Summary

CryptoLens is an English-language static site that aggregates crypto × AI crossover intelligence from curated RSS sources. It filters noise via Gemini AI scoring, surfaces the top stories with 100-word summaries and editor notes, and monetizes through affiliate links and a Pro newsletter subscription.

**Target users:** Experienced crypto investors and AI practitioners who need daily signal without the noise.  
**Core value:** Filtered intelligence, not information aggregation — with a unique crypto × AI crossover angle.

---

## 2. Tech Stack

| Layer | Technology | Cost |
|-------|-----------|------|
| Frontend | Pure HTML + CSS + JS (no framework) | Free |
| Hosting | GitHub Pages | Free |
| Database | Supabase (free tier: 500MB, 50K MAU) | Free |
| AI Processing | Gemini 2.0 Flash API | Free |
| Scheduled Jobs | GitHub Actions (≤720 runs/month @ 2hr interval) | Free |
| Email | Resend (3,000 emails/month) | Free |
| Payments | Stripe (no monthly fee, 2.9%+$0.30/txn) | Free to open |
| Domain | Subdomain of qizh.space (CNAME) | Free |

**Total fixed monthly cost: $0**

---

## 3. Visual Design System

```css
--bg:       #0a0e1a   /* main background */
--bg-card:  #0f1524   /* card background */
--bg-hover: #141928   /* hover state */
--cyan:     #00d4ff   /* primary accent */
--purple:   #7c3aed   /* secondary accent */
--white:    #e8eaf0   /* body text */
--muted:    #6b7280   /* secondary text */
--border:   rgba(0,212,255,.12)
```

**Fonts:** Space Grotesk (headings/UI) + JetBrains Mono (scores/tags/numbers)  
**Tone:** Cold, deep, professional — Bloomberg meets crypto-native

---

## 4. Architecture

```
GitHub Actions (every 2 hours)
  └─ scripts/fetch.js
       ├─ Fetch all active RSS sources from Supabase
       ├─ Deduplicate against existing original_url
       ├─ Process each new item through Gemini API
       │    └─ Returns: summary, editor_note draft, importance_score, tags, category
       ├─ Filter: drop score < 7, mark score ≥ 9 as is_pro=true
       └─ Write to Supabase articles table

GitHub Actions (weekdays 08:00 UTC)
  └─ scripts/newsletter.js
       ├─ Query top 5 articles from last 24h (score ≥ 8)
       ├─ Send free version (no editor_note) to non-Pro subscribers
       └─ Send Pro version (with editor_note, uses service_role key) to Pro subscribers

GitHub Pages (static)
  └─ Frontend JS queries Supabase via anon key
       └─ Supabase RLS enforces field-level access:
            editor_note → null for non-Pro users
            editor_note → full text for is_pro=true users
```

**Security boundary:** Supabase RLS is the paywall enforcement layer. The anon key is intentionally public — Row Level Security policies prevent unauthorized data access at the database level.

---

## 5. File Structure

```
CryptoLens-site/
├── index.html              # Feed + Today's Top
├── category.html           # Category view (?cat=ai|crypto|cross|regulation|onchain)
├── article.html            # Article detail (?id=xxx)
├── subscribe.html          # Subscribe + Pro upgrade
├── about.html              # About + disclaimer
├── CNAME                   # lens.qizh.space
│
├── assets/
│   ├── style.css           # Global design system
│   ├── app.js              # Feed, filters, infinite scroll
│   ├── auth.js             # Supabase Auth: magic link login, session state
│   └── affiliate.js        # Affiliate click tracking
│
├── scripts/                # Node.js — GitHub Actions only, not in browser
│   ├── fetch.js            # RSS → Gemini → Supabase pipeline
│   └── newsletter.js       # Resend email dispatch
│
├── package.json
└── .github/workflows/
    ├── fetch.yml           # cron: every 2 hours
    └── newsletter.yml      # cron: weekdays 08:00 UTC
```

---

## 6. Data Pipeline Detail

### RSS Sources (Phase 1)

| Category | Source | Method |
|----------|--------|--------|
| Crypto media | CoinDesk, Decrypt, The Block, Blockworks | RSS |
| Crypto research | a16z crypto blog, Paradigm blog | RSS |
| AI media | Import AI, The Batch, Hugging Face blog | RSS |
| Community | Reddit r/cryptocurrency, r/artificial | RSS |

### Gemini Processing

**Prompt output (strict JSON):**
```json
{
  "summary": "100-word English summary",
  "editor_note": "150-word opinion draft for manual editing",
  "importance_score": 8,
  "tags": ["BTC", "AI-Agent"],
  "category": "cross",
  "is_cross": true
}
```

**Scoring dimensions told to Gemini:**
- Source authority (a16z > general blog)
- Market cap relevance (BTC/ETH weighted higher)
- Price/regulation/technology impact
- Crypto × AI crossover: bonus points

**Rate limiting:** 4-second delay between Gemini calls (stays under 15 RPM free limit)

### Filter Rules
- Score < 7 → discard
- Score ≥ 9 → `is_pro = true` (paywalled)
- `editor_note` always stored; shown only to Pro users via RLS view

---

## 7. Database Schema

```sql
-- Sources
create table sources (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  url text not null,
  feed_url text,
  category text,
  is_active boolean default true,
  last_fetched_at timestamp,
  created_at timestamp default now()
);

-- Articles (queried via articles_public view by frontend)
create table articles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id),
  title text not null,
  original_url text not null unique,
  content text,
  summary text,
  editor_note text,         -- RLS-gated; manually edited in Supabase dashboard
  importance_score int,
  tags text[],
  category text,            -- crypto | ai | cross | regulation | onchain
  is_pro boolean default false,
  is_featured boolean default false,
  published_at timestamp,
  created_at timestamp default now()
);

-- RLS view: returns editor_note only for Pro users
-- Uses users table lookup (avoids needing custom JWT claims)
create view articles_public as
  select
    id, title, original_url, summary, importance_score,
    tags, category, is_pro, is_featured, published_at, source_id,
    case
      when exists (
        select 1 from users
        where id = auth.uid() and is_pro = true
      ) then editor_note
      else null
    end as editor_note
  from articles;

-- Users
create table users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  is_pro boolean default false,
  stripe_customer_id text,
  subscribed_at timestamp,
  expires_at timestamp,
  created_at timestamp default now()
);

-- Newsletter subscribers
create table subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  is_active boolean default true,
  is_pro boolean default false,
  created_at timestamp default now()
);

-- Affiliate click tracking
create table affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_name text,
  article_id uuid references articles(id),
  clicked_at timestamp default now()
);
```

---

## 8. Paywall Implementation

### Authentication
- **Method:** Supabase Magic Link (passwordless, email-based)
- **Session:** Supabase JS SDK manages JWT automatically in localStorage
- **Pro check:** `auth.jwt() ->> 'is_pro'` evaluated server-side in RLS policy

### Payment Flow (MVP — Manual)
1. User clicks "Upgrade to Pro" → Stripe Payment Link (pre-configured, no code needed)
2. User pays → you manually set `is_pro=true` in Supabase dashboard
3. User logs in → session JWT reflects pro status → RLS unlocks `editor_note`

### Payment Flow (Phase 2 — Automated)
- Supabase Edge Function receives Stripe Webhook
- Automatically updates `users.is_pro=true` on payment success
- Handles subscription expiry via `expires_at`

---

## 9. Newsletter System

### Free Newsletter (weekly, every Monday)
- Top 10 articles of the week by score
- Summary only, no editor_note
- Affiliate links in footer

### Pro Newsletter (weekdays, 08:00 UTC)
- Top 5 articles of last 24h
- Includes editor_note (fetched server-side with service_role key)
- Sent only to `subscribers` where `is_pro=true`

### Email Template Structure
```
Subject: CryptoLens Daily | {date} — Top 5

[Logo] CryptoLens · {date}

TODAY'S TOP SIGNAL
━━━━━━━━━━━━━━━━━
[●9.2] Article Title
Source · Published
Summary text...
Editor's Take: [full text for Pro, upgrade prompt for free]

[Affiliate sponsor block]

━━━━━━━━━━━━━━━━━
Unsubscribe · Disclaimer
```

---

## 10. Monetization

**Priority order:**

1. **Affiliate links** (fastest revenue)
   - Binance: 20-40% commission on trading fees
   - Bybit: $30-50/valid registration
   - Ledger: 15% hardware wallet commission
   - Placement: inline with relevant articles + newsletter footer

2. **Pro subscriptions**
   - $15/month or $120/year
   - Target: 100 paying users by month 6 = $1,500/month

3. **Newsletter sponsorship** (after 500 subscribers)
   - $200-500/issue, direct outreach to crypto tools/projects

4. **Display ads** (after 10K monthly PV)
   - Google AdSense, crypto vertical CPM $5-15

---

## 11. Content Operations

### Phase 1 Cold Start (months 1-2)
- Reddit (r/cryptocurrency, r/artificial): answer questions, link to site
- Twitter/X: post 1-2 daily content summaries, drive to site
- Hacker News: submit high-quality crypto × AI crossover pieces
- Product Hunt: launch for initial exposure

### Editor Note Workflow
1. Gemini generates 150-word draft stored in `editor_note` field
2. You review and edit directly in Supabase table editor
3. Frontend renders final version for Pro users

### Phase 2 KOL Source Weighting
```
Tier 0 (×2.0): Trump, Musk, CZ, Justin Sun, Vitalik — Twitter/X or Nitter RSS
Tier 1 (×1.5): a16z crypto, Paradigm, Multicoin
Tier 2 (×1.0): CoinDesk, The Block, Decrypt
Tier 3 (×0.8): Reddit communities
```

---

## 12. Disclaimer

Displayed in footer, each article, newsletters, and subscribe page:

> CryptoLens aggregates information from third-party sources for informational purposes only. Nothing on this site constitutes financial or investment advice. Always do your own research before making any investment decisions. Cryptocurrency investments carry significant risk.

---

## 13. Out of Scope (MVP)

- Social features, comments
- Real-time price data
- Trading functionality
- Mobile app
- Stripe Webhook automation (Phase 2)
- KOL social media monitoring (Phase 2)
- Search (Phase 2 — Supabase full-text)
