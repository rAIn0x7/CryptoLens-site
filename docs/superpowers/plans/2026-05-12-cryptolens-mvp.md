# CryptoLens MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete CryptoLens MVP — static site on GitHub Pages with Supabase backend, Gemini-powered RSS pipeline, and Pro paywall enforced via RLS.

**Architecture:** Pure HTML/CSS/JS frontend on GitHub Pages queries Supabase directly via anon key. Supabase RLS blocks direct `articles` table access; a postgres-owned view (`articles_public`) conditionally returns `editor_note` only to Pro users. GitHub Actions runs Node.js scripts every 2 hours to fetch RSS, process via Gemini, and write scored articles to Supabase.

**Tech Stack:** Vanilla HTML/CSS/JS, Supabase JS SDK v2 (CDN in browser, npm in scripts), Gemini 2.0 Flash (`@google/generative-ai`), `rss-parser`, `resend`

---

## File Map

| File | Responsibility |
|------|---------------|
| `assets/config.js` | Supabase URL + anon key (safe to commit) |
| `assets/style.css` | Full design system: tokens, nav, card, paywall, pages |
| `assets/auth.js` | Supabase Auth: magic link, session, pro status, nav UI |
| `assets/app.js` | Feed load, card render, filters, infinite scroll, Today's Top |
| `assets/affiliate.js` | Affiliate click tracking to Supabase |
| `index.html` | Homepage: Today's Top + feed + sidebar |
| `category.html` | Filtered feed by `?cat=` or `?tag=` param |
| `article.html` | Article detail by `?id=` param |
| `subscribe.html` | Email subscribe + Pro upgrade |
| `about.html` | About + disclaimer |
| `CNAME` | `lens.qizh.space` |
| `CLAUDE.md` | Project docs for future Claude sessions |
| `package.json` | npm deps for scripts only |
| `.gitignore` | node_modules |
| `scripts/fetch.js` | RSS → Gemini → Supabase pipeline |
| `scripts/newsletter.js` | Query articles → Resend email dispatch |
| `.github/workflows/fetch.yml` | Cron every 2 hours |
| `.github/workflows/newsletter.yml` | Cron weekdays 08:00 UTC |

---

## Task 1: Project Setup

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `assets/config.js`
- Create: `assets/` `scripts/` `.github/workflows/` directories

- [ ] **Step 1: Create directory structure**

```bash
cd /home/test/CryptoLens-site
mkdir -p assets scripts .github/workflows
```

- [ ] **Step 2: Create package.json**

```json
{
  "name": "cryptolens-site",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "fetch": "node scripts/fetch.js",
    "newsletter": "node scripts/newsletter.js"
  },
  "dependencies": {
    "@google/generative-ai": "^0.21.0",
    "@supabase/supabase-js": "^2.39.0",
    "resend": "^4.0.0",
    "rss-parser": "^3.13.0"
  }
}
```

- [ ] **Step 3: Create .gitignore**

```
node_modules/
.env
.DS_Store
```

- [ ] **Step 4: Create assets/config.js**

Replace `YOUR_SUPABASE_URL` and `YOUR_SUPABASE_ANON_KEY` with values from Supabase dashboard → Settings → API. The anon key is intentionally public — RLS is the security layer.

```js
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
const STRIPE_PRO_MONTHLY_LINK = 'YOUR_STRIPE_PAYMENT_LINK_MONTHLY';
const STRIPE_PRO_YEARLY_LINK = 'YOUR_STRIPE_PAYMENT_LINK_YEARLY';
```

- [ ] **Step 5: Install dependencies**

```bash
npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore assets/config.js
git commit -m "feat: project setup and config"
```

---

## Task 2: Supabase Schema + RLS + Seed Sources

**Action:** Run this SQL in Supabase dashboard → SQL Editor (run in order).

- [ ] **Step 1: Create tables**

```sql
-- Sources table
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

-- Articles table (never accessed directly by frontend — use articles_public view)
create table articles (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references sources(id),
  title text not null,
  original_url text not null unique,
  content text,
  summary text,
  editor_note text,
  importance_score int,
  tags text[],
  category text,
  is_pro boolean default false,
  is_featured boolean default false,
  published_at timestamp,
  created_at timestamp default now()
);

-- Users table (linked to Supabase Auth)
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  is_pro boolean default false,
  stripe_customer_id text,
  subscribed_at timestamp,
  expires_at timestamp,
  created_at timestamp default now()
);

-- Newsletter subscribers (independent of auth)
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

- [ ] **Step 2: Create auth trigger (auto-creates users record on signup)**

```sql
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
```

- [ ] **Step 3: Enable RLS and set policies**

```sql
-- articles: block all direct access (frontend uses articles_public view)
alter table articles enable row level security;
-- No SELECT policy = no direct API access

-- users: each user reads/updates only their own record
alter table users enable row level security;

create policy "user reads own record" on users
  for select using (id = auth.uid());

create policy "user updates own record" on users
  for update using (id = auth.uid());

-- subscribers: anyone can insert, no read for anon
alter table subscribers enable row level security;

create policy "anyone can subscribe" on subscribers
  for insert with check (true);

-- affiliate_clicks: anyone can insert
alter table affiliate_clicks enable row level security;

create policy "anyone can track clicks" on affiliate_clicks
  for insert with check (true);
```

- [ ] **Step 4: Create articles_public view**

The view is owned by the postgres superuser, so it bypasses articles RLS and can read all rows. It returns `editor_note` only when the requesting user has `is_pro = true` in the users table.

```sql
create view articles_public as
  select
    a.id,
    a.title,
    a.original_url,
    a.summary,
    a.importance_score,
    a.tags,
    a.category,
    a.is_pro,
    a.is_featured,
    a.published_at,
    a.source_id,
    s.name as source_name,
    case
      when auth.uid() is not null and exists (
        select 1 from public.users u
        where u.id = auth.uid() and u.is_pro = true
      ) then a.editor_note
      else null
    end as editor_note
  from articles a
  left join sources s on s.id = a.source_id
  order by a.importance_score desc, a.published_at desc;

-- Grant view access to API roles
grant select on articles_public to anon, authenticated;
```

- [ ] **Step 5: Seed RSS sources**

```sql
insert into sources (name, url, feed_url, category) values
  ('CoinDesk',          'https://www.coindesk.com',                  'https://www.coindesk.com/arc/outboundfeeds/rss/',                       'crypto'),
  ('Decrypt',           'https://decrypt.co',                        'https://decrypt.co/feed',                                               'crypto'),
  ('The Block',         'https://www.theblock.co',                   'https://www.theblock.co/rss.xml',                                       'crypto'),
  ('Blockworks',        'https://blockworks.co',                     'https://blockworks.co/feed',                                            'crypto'),
  ('a16z crypto',       'https://a16zcrypto.com',                    'https://a16zcrypto.com/feed/',                                          'crypto'),
  ('Paradigm',          'https://www.paradigm.xyz',                  'https://www.paradigm.xyz/feed',                                         'crypto'),
  ('Import AI',         'https://importai.substack.com',             'https://importai.substack.com/feed',                                    'ai'),
  ('The Batch',         'https://www.deeplearning.ai/the-batch',     'https://www.deeplearning.ai/the-batch/feed/',                           'ai'),
  ('Hugging Face Blog', 'https://huggingface.co/blog',               'https://huggingface.co/blog/feed.xml',                                  'ai'),
  ('Reddit Crypto',     'https://reddit.com/r/CryptoCurrency',       'https://www.reddit.com/r/CryptoCurrency/.rss',                          'crypto'),
  ('Reddit AI',         'https://reddit.com/r/artificial',           'https://www.reddit.com/r/artificial/.rss',                              'ai');
```

- [ ] **Step 6: Configure Supabase Auth**

In Supabase dashboard → Authentication → Settings:
- Site URL: `https://lens.qizh.space`
- Add to "Redirect URLs": `https://lens.qizh.space`
- Enable "Magic Link" (should be on by default)

- [ ] **Step 7: Verify schema**

Run in SQL Editor:
```sql
select count(*) from sources;  -- should return 11
select * from articles_public limit 1;  -- should return empty with no error
```

---

## Task 3: Global Design System (assets/style.css)

**Files:**
- Create: `assets/style.css`

- [ ] **Step 1: Write complete style.css**

```css
/* ── RESET & TOKENS ── */
*, *::before, *::after { margin: 0; padding: 0; box-sizing: border-box; }

:root {
  --bg:        #0a0e1a;
  --bg-card:   #0f1524;
  --bg-hover:  #141928;
  --cyan:      #00d4ff;
  --cyan-dim:  rgba(0, 212, 255, 0.15);
  --purple:    #7c3aed;
  --white:     #e8eaf0;
  --muted:     #6b7280;
  --border:    rgba(0, 212, 255, 0.12);
  --border-hov:rgba(0, 212, 255, 0.28);
  --font-ui:   'Space Grotesk', sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
  --radius:    6px;
}

html { scroll-behavior: smooth; }

body {
  background: var(--bg);
  color: var(--white);
  font-family: var(--font-ui);
  font-weight: 400;
  line-height: 1.6;
  overflow-x: hidden;
  min-height: 100vh;
}

a { color: inherit; text-decoration: none; }

/* ── NAV ── */
.nav {
  position: sticky;
  top: 0;
  z-index: 100;
  background: rgba(10, 14, 26, 0.92);
  backdrop-filter: blur(12px);
  border-bottom: 1px solid var(--border);
  padding: 0 2rem;
  height: 56px;
  display: flex;
  align-items: center;
  gap: 2rem;
}

.nav-logo {
  font-family: var(--font-mono);
  font-size: 1rem;
  font-weight: 700;
  color: var(--cyan);
  letter-spacing: -0.02em;
  flex-shrink: 0;
}

.nav-logo span { color: var(--muted); font-weight: 400; }

.nav-filters {
  display: flex;
  gap: 0.25rem;
  flex: 1;
}

.nav-filter {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  padding: 0.3rem 0.75rem;
  border-radius: 4px;
  color: var(--muted);
  cursor: pointer;
  transition: all 0.15s;
  border: 1px solid transparent;
  background: none;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.nav-filter:hover { color: var(--white); border-color: var(--border); }
.nav-filter.active { color: var(--cyan); border-color: var(--border); background: var(--cyan-dim); }

.nav-actions { display: flex; gap: 0.75rem; align-items: center; margin-left: auto; }

.btn {
  font-family: var(--font-ui);
  font-size: 0.8rem;
  font-weight: 500;
  padding: 0.4rem 1rem;
  border-radius: var(--radius);
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}

.btn-ghost {
  background: none;
  border: 1px solid var(--border);
  color: var(--muted);
}
.btn-ghost:hover { color: var(--white); border-color: var(--border-hov); }

.btn-primary {
  background: var(--cyan);
  color: #000;
  font-weight: 600;
}
.btn-primary:hover { opacity: 0.9; }

.btn-sm { padding: 0.25rem 0.65rem; font-size: 0.75rem; }

/* ── LAYOUT ── */
.container { max-width: 1200px; margin: 0 auto; padding: 0 2rem; }

.page-grid {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 2rem;
  padding: 2rem 0;
}

@media (max-width: 900px) {
  .page-grid { grid-template-columns: 1fr; }
  .sidebar { display: none; }
}

/* ── TODAY'S TOP ── */
.top-section {
  padding: 1.5rem 0 1rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1.5rem;
}

.section-label {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--cyan);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 1rem;
}

.top-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1rem;
}

/* ── CARD ── */
.card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.1rem 1.25rem;
  transition: border-color 0.15s, background 0.15s;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.card:hover { border-color: var(--border-hov); background: var(--bg-hover); }
.card.top-card { border-color: rgba(0, 212, 255, 0.25); }
.card.pro-card { border-color: rgba(124, 58, 237, 0.35); }

.card-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.card-source {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--muted);
}

.card-badges { display: flex; gap: 0.4rem; align-items: center; }

.badge {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  padding: 0.15rem 0.45rem;
  border-radius: 3px;
  font-weight: 500;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.badge-cat-cross    { background: rgba(0,212,255,0.12);  color: var(--cyan); }
.badge-cat-crypto   { background: rgba(251,191,36,0.12); color: #fbbf24; }
.badge-cat-ai       { background: rgba(124,58,237,0.15); color: #a78bfa; }
.badge-cat-regulation { background: rgba(239,68,68,0.12); color: #f87171; }
.badge-cat-onchain  { background: rgba(52,211,153,0.12); color: #34d399; }

.score-badge {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  font-weight: 700;
}
.score-high   { color: var(--cyan); }
.score-mid    { color: var(--white); }
.score-pro    { color: #a78bfa; }

.card-title {
  font-size: 0.95rem;
  font-weight: 600;
  line-height: 1.4;
  color: var(--white);
}
.card-title:hover { color: var(--cyan); }

.card-summary {
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.card-tags { display: flex; gap: 0.35rem; flex-wrap: wrap; }

.tag {
  font-family: var(--font-mono);
  font-size: 0.63rem;
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0.1rem 0.4rem;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.tag:hover { color: var(--cyan); border-color: var(--cyan); }

/* ── PAYWALL OVERLAY ── */
.editor-note-wrap { position: relative; }

.editor-note {
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.55;
  border-left: 2px solid var(--cyan);
  padding-left: 0.75rem;
  margin-top: 0.25rem;
}

.editor-note-label {
  font-family: var(--font-mono);
  font-size: 0.63rem;
  color: var(--cyan);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 0.3rem;
}

.paywall-blur {
  position: relative;
  overflow: hidden;
  border-radius: 4px;
}

.paywall-blur::after {
  content: '';
  position: absolute;
  inset: 0;
  backdrop-filter: blur(4px);
  background: linear-gradient(135deg, rgba(10,14,26,0.7), rgba(124,58,237,0.1));
}

.paywall-cta {
  position: absolute;
  inset: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-size: 0.75rem;
  color: var(--muted);
  font-family: var(--font-mono);
}

.paywall-cta a {
  color: var(--cyan);
  text-decoration: underline;
  cursor: pointer;
}

/* ── SIDEBAR ── */
.sidebar { display: flex; flex-direction: column; gap: 1.5rem; padding-top: 0.5rem; }

.sidebar-block {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
}

.sidebar-title {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--cyan);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 0.75rem;
}

.sidebar-tags { display: flex; gap: 0.4rem; flex-wrap: wrap; }

.sidebar-subscribe {
  text-align: center;
  padding: 1.25rem 1rem;
}

.sidebar-subscribe p {
  font-size: 0.8rem;
  color: var(--muted);
  margin-bottom: 0.75rem;
}

.sidebar-subscribe input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--white);
  font-family: var(--font-ui);
  font-size: 0.8rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 0.5rem;
  outline: none;
  transition: border-color 0.15s;
}
.sidebar-subscribe input:focus { border-color: var(--cyan); }

.affiliate-block {
  font-size: 0.75rem;
  color: var(--muted);
  text-align: center;
  line-height: 1.5;
}

.affiliate-block a { color: var(--cyan); }
.affiliate-block .aff-label {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  margin-bottom: 0.4rem;
  display: block;
  color: var(--muted);
}

/* ── FEED ── */
.feed { display: flex; flex-direction: column; gap: 0.75rem; }

.load-more {
  text-align: center;
  padding: 1.5rem;
}

.load-more button {
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--muted);
  background: none;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem 1.5rem;
  cursor: pointer;
  transition: all 0.15s;
}
.load-more button:hover { color: var(--cyan); border-color: var(--cyan); }

/* ── ARTICLE DETAIL ── */
.article-page { max-width: 720px; margin: 0 auto; padding: 2rem 2rem 4rem; }

.article-back {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--muted);
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 1.5rem;
  transition: color 0.15s;
}
.article-back:hover { color: var(--cyan); }

.article-header { margin-bottom: 1.5rem; }

.article-title {
  font-size: 1.6rem;
  font-weight: 700;
  line-height: 1.25;
  margin-bottom: 0.75rem;
}

.article-meta {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.article-summary {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.1rem 1.25rem;
  font-size: 0.9rem;
  line-height: 1.65;
  color: var(--muted);
  margin: 1.5rem 0;
}

.article-editor-note {
  margin: 1.5rem 0;
  border-left: 2px solid var(--cyan);
  padding-left: 1rem;
}

.article-original-link {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-family: var(--font-mono);
  font-size: 0.78rem;
  color: var(--cyan);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0.5rem 1rem;
  margin-top: 1.5rem;
  transition: border-color 0.15s;
}
.article-original-link:hover { border-color: var(--cyan); }

/* ── SUBSCRIBE PAGE ── */
.subscribe-page {
  max-width: 680px;
  margin: 0 auto;
  padding: 3rem 2rem;
  text-align: center;
}

.subscribe-page h1 {
  font-size: 2rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.subscribe-page .sub-lead {
  color: var(--muted);
  font-size: 0.9rem;
  margin-bottom: 2.5rem;
}

.plans-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin: 2rem 0;
  text-align: left;
}

@media (max-width: 600px) { .plans-grid { grid-template-columns: 1fr; } }

.plan-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.5rem;
}

.plan-card.featured { border-color: rgba(0,212,255,0.4); }

.plan-name {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--cyan);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
}

.plan-price {
  font-size: 1.6rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.plan-price span { font-size: 0.85rem; font-weight: 400; color: var(--muted); }

.plan-features {
  list-style: none;
  margin: 1rem 0 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.plan-features li {
  font-size: 0.82rem;
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.plan-features li.has { color: var(--white); }
.plan-features li::before { content: '✓'; color: var(--muted); font-size: 0.7rem; }
.plan-features li.has::before { color: var(--cyan); }

.email-input-row {
  display: flex;
  gap: 0.5rem;
  max-width: 480px;
  margin: 0 auto 1rem;
}

.email-input-row input {
  flex: 1;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--white);
  font-family: var(--font-ui);
  font-size: 0.85rem;
  padding: 0.6rem 0.9rem;
  outline: none;
  transition: border-color 0.15s;
}
.email-input-row input:focus { border-color: var(--cyan); }

/* ── ABOUT PAGE ── */
.about-page { max-width: 680px; margin: 0 auto; padding: 3rem 2rem; }
.about-page h1 { font-size: 2rem; font-weight: 700; margin-bottom: 0.5rem; }
.about-page h2 { font-size: 1.1rem; font-weight: 600; margin: 2rem 0 0.75rem; }
.about-page p { font-size: 0.9rem; color: var(--muted); line-height: 1.7; margin-bottom: 0.75rem; }
.about-page a { color: var(--cyan); }

/* ── FOOTER ── */
.footer {
  border-top: 1px solid var(--border);
  padding: 2rem;
  margin-top: 3rem;
  text-align: center;
}

.footer-disclaimer {
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.6;
  max-width: 600px;
  margin: 0 auto 1rem;
}

.footer-links {
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  font-family: var(--font-mono);
  font-size: 0.68rem;
  color: var(--muted);
}
.footer-links a:hover { color: var(--cyan); }

/* ── HERO BAND ── */
.hero-band {
  background: linear-gradient(135deg, rgba(0,212,255,0.05), rgba(124,58,237,0.05));
  border-bottom: 1px solid var(--border);
  padding: 2rem;
  text-align: center;
}

.hero-band h1 {
  font-size: 2.2rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  margin-bottom: 0.4rem;
}

.hero-band h1 .accent { color: var(--cyan); }
.hero-band p { font-size: 0.9rem; color: var(--muted); }

/* ── LOADING SKELETON ── */
.skeleton {
  background: linear-gradient(90deg, var(--bg-card) 25%, var(--bg-hover) 50%, var(--bg-card) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.4s infinite;
  border-radius: 4px;
}
@keyframes shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }

/* ── AUTH MODAL ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
}
.modal-overlay.hidden { display: none; }

.modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 2rem;
  width: 100%;
  max-width: 400px;
}

.modal h2 { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.4rem; }
.modal p { font-size: 0.82rem; color: var(--muted); margin-bottom: 1.25rem; }

.modal input {
  width: 100%;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--white);
  font-family: var(--font-ui);
  font-size: 0.85rem;
  padding: 0.6rem 0.9rem;
  outline: none;
  margin-bottom: 0.75rem;
  transition: border-color 0.15s;
}
.modal input:focus { border-color: var(--cyan); }

.modal-close {
  position: absolute;
  top: 1rem; right: 1rem;
  background: none; border: none;
  color: var(--muted); cursor: pointer; font-size: 1.2rem;
}

.msg { font-size: 0.8rem; margin-top: 0.5rem; }
.msg-success { color: var(--cyan); }
.msg-error   { color: #f87171; }

/* ── CATEGORY PAGE HEADER ── */
.category-header {
  padding: 1.5rem 0 1rem;
  border-bottom: 1px solid var(--border);
  margin-bottom: 1.5rem;
}
.category-header h1 { font-size: 1.4rem; font-weight: 700; }
.category-header p  { font-size: 0.82rem; color: var(--muted); margin-top: 0.25rem; }
```

- [ ] **Step 2: Commit**

```bash
git add assets/style.css
git commit -m "feat: complete design system with deep-sea-blue theme"
```

---

## Task 4: Auth Module (assets/auth.js)

**Files:**
- Create: `assets/auth.js`

- [ ] **Step 1: Write assets/auth.js**

```js
// Requires: Supabase CDN loaded, config.js loaded before this file
const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;
let isProUser = false;

async function initAuth() {
  const { data: { session } } = await _supabase.auth.getSession();
  if (session?.user) {
    currentUser = session.user;
    await _loadProStatus();
  }
  _updateNavUI();

  _supabase.auth.onAuthStateChange(async (_event, session) => {
    currentUser = session?.user ?? null;
    isProUser = false;
    if (currentUser) await _loadProStatus();
    _updateNavUI();
    document.dispatchEvent(new CustomEvent('authChanged', { detail: { currentUser, isProUser } }));
  });
}

async function _loadProStatus() {
  const { data } = await _supabase
    .from('users')
    .select('is_pro')
    .eq('id', currentUser.id)
    .single();
  isProUser = data?.is_pro ?? false;
}

function _updateNavUI() {
  const loginBtn = document.getElementById('nav-login-btn');
  const logoutBtn = document.getElementById('nav-logout-btn');
  const proLabel = document.getElementById('nav-pro-label');

  if (!loginBtn) return;

  if (currentUser) {
    loginBtn.classList.add('hidden');
    if (logoutBtn) logoutBtn.classList.remove('hidden');
    if (proLabel) {
      proLabel.textContent = isProUser ? 'PRO' : '';
      proLabel.classList.toggle('hidden', !isProUser);
    }
  } else {
    loginBtn.classList.remove('hidden');
    if (logoutBtn) logoutBtn.classList.add('hidden');
    if (proLabel) proLabel.classList.add('hidden');
  }
}

async function sendMagicLink(email) {
  const { error } = await _supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  });
  return error;
}

async function signOut() {
  await _supabase.auth.signOut();
}

function openLoginModal() {
  document.getElementById('auth-modal')?.classList.remove('hidden');
}

function closeLoginModal() {
  document.getElementById('auth-modal')?.classList.add('hidden');
}

// Expose globals used by HTML onclick and app.js
window.CL = window.CL || {};
window.CL.auth = { initAuth, sendMagicLink, signOut, openLoginModal, closeLoginModal };
window.CL.supabase = _supabase;
window.CL.getUser = () => currentUser;
window.CL.isPro = () => isProUser;
```

- [ ] **Step 2: Commit**

```bash
git add assets/auth.js
git commit -m "feat: Supabase auth module with magic link and pro status"
```

---

## Task 5: App.js — Feed Engine (assets/app.js)

**Files:**
- Create: `assets/app.js`

- [ ] **Step 1: Write assets/app.js**

```js
// Requires: auth.js loaded first (sets window.CL.supabase)
const PAGE_SIZE = 20;
let currentOffset = 0;
let currentCategory = 'all';
let currentTag = null;
let isLoading = false;
let hasMore = true;

const CATEGORY_LABELS = {
  all: 'All', crypto: 'Crypto', ai: 'AI',
  cross: 'Crypto × AI', regulation: 'Regulation', onchain: 'On-chain'
};

const CAT_BADGE_CLASS = {
  cross: 'badge-cat-cross', crypto: 'badge-cat-crypto',
  ai: 'badge-cat-ai', regulation: 'badge-cat-regulation', onchain: 'badge-cat-onchain'
};

function scoreClass(score) {
  if (score >= 9) return 'score-pro';
  if (score >= 8) return 'score-high';
  return 'score-mid';
}

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / 3600000);
  if (h < 1) return 'just now';
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function renderEditorNote(article) {
  if (article.editor_note) {
    return `
      <div class="editor-note-wrap">
        <div class="editor-note-label">Editor's Take</div>
        <div class="editor-note">${article.editor_note}</div>
      </div>`;
  }
  if (article.is_pro && !window.CL.isPro()) {
    return `
      <div class="editor-note-wrap">
        <div class="editor-note-label">Editor's Take</div>
        <div class="paywall-blur">
          <div class="editor-note" style="filter:blur(4px);user-select:none;">
            This analysis covers key market implications and strategic context
            for investors monitoring this development closely.
          </div>
          <div class="paywall-cta">
            <span>Pro only —</span>
            <a href="subscribe.html">Upgrade</a>
          </div>
        </div>
      </div>`;
  }
  return '';
}

function renderCard(article, isTop = false) {
  const catClass = CAT_BADGE_CLASS[article.category] || 'badge-cat-crypto';
  const tags = (article.tags || []).slice(0, 4).map(t =>
    `<span class="tag" onclick="filterByTag('${t}')">#${t}</span>`
  ).join('');

  return `
    <div class="card ${isTop ? 'top-card' : ''} ${article.is_pro ? 'pro-card' : ''}"
         onclick="openArticle('${article.id}')">
      <div class="card-meta">
        <span class="card-source">${article.source_name || 'Unknown'} · ${timeAgo(article.published_at)}</span>
        <div class="card-badges">
          <span class="badge ${catClass}">${article.category || 'crypto'}</span>
          <span class="score-badge ${scoreClass(article.importance_score)}">●${article.importance_score}</span>
        </div>
      </div>
      <a class="card-title" href="${article.original_url}" target="_blank"
         rel="noopener" onclick="event.stopPropagation()">
        ${article.title}
      </a>
      <p class="card-summary">${article.summary || ''}</p>
      ${tags ? `<div class="card-tags">${tags}</div>` : ''}
      ${renderEditorNote(article)}
    </div>`;
}

async function loadTodaysTop() {
  const sb = window.CL.supabase;
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

  const { data } = await sb
    .from('articles_public')
    .select('*')
    .gte('published_at', since)
    .gte('importance_score', 8)
    .order('importance_score', { ascending: false })
    .limit(5);

  const container = document.getElementById('top-grid');
  if (!container) return;
  if (!data?.length) { container.closest('.top-section')?.classList.add('hidden'); return; }
  container.innerHTML = data.map(a => renderCard(a, true)).join('');
}

async function loadFeed(reset = false) {
  if (isLoading || (!hasMore && !reset)) return;
  if (reset) { currentOffset = 0; hasMore = true; }

  isLoading = true;
  const sb = window.CL.supabase;

  let q = sb.from('articles_public').select('*').order('importance_score', { ascending: false }).order('published_at', { ascending: false });

  if (currentCategory !== 'all') q = q.eq('category', currentCategory);
  if (currentTag) q = q.contains('tags', [currentTag]);

  q = q.range(currentOffset, currentOffset + PAGE_SIZE - 1);

  const { data } = await q;
  isLoading = false;

  if (!data?.length) { hasMore = false; _hideLoadMore(); return; }
  if (data.length < PAGE_SIZE) { hasMore = false; _hideLoadMore(); }

  const container = document.getElementById('feed');
  if (!container) return;

  if (reset) container.innerHTML = '';
  container.insertAdjacentHTML('beforeend', data.map(a => renderCard(a)).join(''));
  currentOffset += data.length;
}

function _hideLoadMore() {
  document.getElementById('load-more-btn')?.closest('.load-more')?.classList.add('hidden');
}

function setCategory(cat) {
  currentCategory = cat;
  currentTag = null;
  document.querySelectorAll('.nav-filter').forEach(el => {
    el.classList.toggle('active', el.dataset.cat === cat);
  });
  loadFeed(true);
}

function filterByTag(tag) {
  currentTag = tag;
  currentCategory = 'all';
  document.querySelectorAll('.nav-filter').forEach(el => el.classList.remove('active'));
  loadFeed(true);
}

function openArticle(id) {
  window.location.href = `article.html?id=${id}`;
}

async function loadSidebarTags() {
  const sb = window.CL.supabase;
  const { data } = await sb
    .from('articles_public')
    .select('tags')
    .limit(100);

  const counts = {};
  (data || []).forEach(a => (a.tags || []).forEach(t => { counts[t] = (counts[t] || 0) + 1; }));
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 15);

  const container = document.getElementById('sidebar-tags');
  if (!container) return;
  container.innerHTML = top.map(([t]) =>
    `<span class="tag" onclick="filterByTag('${t}')">#${t}</span>`
  ).join('');
}

async function handleSubscribe(email) {
  if (!email || !email.includes('@')) return { error: 'Invalid email' };
  const sb = window.CL.supabase;
  const { error } = await sb.from('subscribers').insert({ email });
  return { error };
}

// Expose to window for HTML
window.setCategory = setCategory;
window.filterByTag = filterByTag;
window.openArticle = openArticle;
window.handleSubscribe = handleSubscribe;
```

- [ ] **Step 2: Commit**

```bash
git add assets/app.js
git commit -m "feat: feed engine with category filters, card rendering, paywall"
```

---

## Task 6: Homepage (index.html)

**Files:**
- Create: `index.html`

- [ ] **Step 1: Write index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="description" content="CryptoLens — Filtered crypto × AI intelligence. Save 2 hours daily on noise.">
<title>CryptoLens — Crypto × AI Intelligence</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>

<!-- AUTH MODAL -->
<div class="modal-overlay hidden" id="auth-modal">
  <div class="modal" style="position:relative">
    <button class="modal-close" onclick="CL.auth.closeLoginModal()">×</button>
    <h2>Sign in to CryptoLens</h2>
    <p>Enter your email — we'll send a magic link. No password needed.</p>
    <input type="email" id="modal-email" placeholder="you@example.com">
    <button class="btn btn-primary" style="width:100%" onclick="handleModalLogin()">Send Magic Link</button>
    <p class="msg" id="modal-msg"></p>
  </div>
</div>

<!-- NAV -->
<nav class="nav">
  <span class="nav-logo">CRYPTO<span>LENS</span></span>
  <div class="nav-filters">
    <button class="nav-filter active" data-cat="all"        onclick="setCategory('all')">ALL</button>
    <button class="nav-filter"        data-cat="cross"      onclick="setCategory('cross')">CROSS</button>
    <button class="nav-filter"        data-cat="crypto"     onclick="setCategory('crypto')">CRYPTO</button>
    <button class="nav-filter"        data-cat="ai"         onclick="setCategory('ai')">AI</button>
    <button class="nav-filter"        data-cat="regulation" onclick="setCategory('regulation')">REGULATION</button>
    <button class="nav-filter"        data-cat="onchain"    onclick="setCategory('onchain')">ON-CHAIN</button>
  </div>
  <div class="nav-actions">
    <span class="badge badge-cat-cross hidden" id="nav-pro-label">PRO</span>
    <button class="btn btn-ghost btn-sm" id="nav-login-btn"  onclick="CL.auth.openLoginModal()">Sign In</button>
    <button class="btn btn-ghost btn-sm hidden" id="nav-logout-btn" onclick="CL.auth.signOut()">Sign Out</button>
    <a href="subscribe.html" class="btn btn-primary btn-sm">Subscribe</a>
  </div>
</nav>

<!-- HERO BAND -->
<div class="hero-band">
  <h1>Crypto <span class="accent">×</span> AI Intelligence</h1>
  <p>Filtered signal from 11 sources · Updated every 2 hours · Scored by Gemini AI</p>
</div>

<div class="container">
  <!-- TODAY'S TOP -->
  <div class="top-section">
    <div class="section-label">Today's Top Signal</div>
    <div class="top-grid" id="top-grid">
      <div class="card skeleton" style="height:160px"></div>
      <div class="card skeleton" style="height:160px"></div>
      <div class="card skeleton" style="height:160px"></div>
    </div>
  </div>

  <!-- MAIN GRID -->
  <div class="page-grid">
    <main>
      <div class="feed" id="feed">
        <div class="card skeleton" style="height:140px"></div>
        <div class="card skeleton" style="height:140px"></div>
        <div class="card skeleton" style="height:140px"></div>
      </div>
      <div class="load-more">
        <button id="load-more-btn" onclick="loadFeed()">Load more</button>
      </div>
    </main>

    <aside class="sidebar">
      <!-- SUBSCRIBE BLOCK -->
      <div class="sidebar-block sidebar-subscribe">
        <div class="sidebar-title">Free Weekly Signal</div>
        <p>Top 10 stories every Monday. No spam.</p>
        <input type="email" id="sidebar-email" placeholder="your@email.com">
        <button class="btn btn-primary" style="width:100%" onclick="sidebarSubscribe()">Subscribe Free</button>
        <p class="msg" id="sidebar-msg"></p>
      </div>

      <!-- TAGS -->
      <div class="sidebar-block">
        <div class="sidebar-title">Trending Tags</div>
        <div class="sidebar-tags" id="sidebar-tags"></div>
      </div>

      <!-- AFFILIATE -->
      <div class="sidebar-block affiliate-block">
        <span class="aff-label">Sponsored</span>
        <p>Trade crypto on <a href="https://accounts.binance.com/register?ref=YOUR_REF" target="_blank" rel="noopener" onclick="CL.affiliate.track('binance', null)">Binance</a> — earn rebates on every trade.</p>
      </div>
    </aside>
  </div>
</div>

<footer class="footer">
  <p class="footer-disclaimer">CryptoLens aggregates information from third-party sources for informational purposes only. Nothing on this site constitutes financial or investment advice. Always do your own research before making any investment decisions. Cryptocurrency investments carry significant risk.</p>
  <div class="footer-links">
    <a href="index.html">Home</a>
    <a href="subscribe.html">Subscribe</a>
    <a href="about.html">About</a>
  </div>
</footer>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="assets/config.js"></script>
<script src="assets/auth.js"></script>
<script src="assets/app.js"></script>
<script src="assets/affiliate.js"></script>
<script>
async function init() {
  await CL.auth.initAuth();
  await loadTodaysTop();
  await loadFeed(true);
  await loadSidebarTags();
}

async function handleModalLogin() {
  const email = document.getElementById('modal-email').value.trim();
  const msg = document.getElementById('modal-msg');
  const error = await CL.auth.sendMagicLink(email);
  if (error) { msg.className = 'msg msg-error'; msg.textContent = error.message; }
  else { msg.className = 'msg msg-success'; msg.textContent = 'Check your email for the magic link!'; }
}

async function sidebarSubscribe() {
  const email = document.getElementById('sidebar-email').value.trim();
  const msg = document.getElementById('sidebar-msg');
  const { error } = await handleSubscribe(email);
  if (error) { msg.className = 'msg msg-error'; msg.textContent = 'Already subscribed or invalid email.'; }
  else { msg.className = 'msg msg-success'; msg.textContent = 'Subscribed! Check your inbox Monday.'; }
}

// Re-render feed when auth state changes (pro unlock)
document.addEventListener('authChanged', () => { loadFeed(true); loadTodaysTop(); });

init();
</script>
</body>
</html>
```

- [ ] **Step 2: Open index.html in browser and verify**

Open `file:///home/test/CryptoLens-site/index.html` — you'll see skeletons then an empty feed (no articles yet). The nav, hero band, sidebar, and footer should render correctly with the deep-sea-blue theme.

- [ ] **Step 3: Commit**

```bash
git add index.html
git commit -m "feat: homepage with feed, Today's Top, sidebar, auth modal"
```

---

## Task 7: Category Page (category.html)

**Files:**
- Create: `category.html`

- [ ] **Step 1: Write category.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CryptoLens — Browse</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>

<div class="modal-overlay hidden" id="auth-modal">
  <div class="modal" style="position:relative">
    <button class="modal-close" onclick="CL.auth.closeLoginModal()">×</button>
    <h2>Sign in to CryptoLens</h2>
    <p>Enter your email — we'll send a magic link.</p>
    <input type="email" id="modal-email" placeholder="you@example.com">
    <button class="btn btn-primary" style="width:100%" onclick="handleModalLogin()">Send Magic Link</button>
    <p class="msg" id="modal-msg"></p>
  </div>
</div>

<nav class="nav">
  <a href="index.html" class="nav-logo">CRYPTO<span>LENS</span></a>
  <div class="nav-filters">
    <button class="nav-filter" data-cat="all"        onclick="setCategory('all')">ALL</button>
    <button class="nav-filter" data-cat="cross"      onclick="setCategory('cross')">CROSS</button>
    <button class="nav-filter" data-cat="crypto"     onclick="setCategory('crypto')">CRYPTO</button>
    <button class="nav-filter" data-cat="ai"         onclick="setCategory('ai')">AI</button>
    <button class="nav-filter" data-cat="regulation" onclick="setCategory('regulation')">REGULATION</button>
    <button class="nav-filter" data-cat="onchain"    onclick="setCategory('onchain')">ON-CHAIN</button>
  </div>
  <div class="nav-actions">
    <span class="badge badge-cat-cross hidden" id="nav-pro-label">PRO</span>
    <button class="btn btn-ghost btn-sm" id="nav-login-btn"  onclick="CL.auth.openLoginModal()">Sign In</button>
    <button class="btn btn-ghost btn-sm hidden" id="nav-logout-btn" onclick="CL.auth.signOut()">Sign Out</button>
    <a href="subscribe.html" class="btn btn-primary btn-sm">Subscribe</a>
  </div>
</nav>

<div class="container">
  <div class="category-header">
    <h1 id="cat-title">All Articles</h1>
    <p id="cat-desc"></p>
  </div>
  <div class="feed" id="feed"></div>
  <div class="load-more">
    <button id="load-more-btn" onclick="loadFeed()">Load more</button>
  </div>
</div>

<footer class="footer">
  <p class="footer-disclaimer">CryptoLens aggregates information from third-party sources for informational purposes only. Nothing on this site constitutes financial or investment advice. Always do your own research before making any investment decisions. Cryptocurrency investments carry significant risk.</p>
  <div class="footer-links">
    <a href="index.html">Home</a><a href="subscribe.html">Subscribe</a><a href="about.html">About</a>
  </div>
</footer>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="assets/config.js"></script>
<script src="assets/auth.js"></script>
<script src="assets/app.js"></script>
<script src="assets/affiliate.js"></script>
<script>
const CAT_DESCS = {
  all: 'All articles, ranked by importance score.',
  cross: 'Where crypto meets AI — the intersection that matters most.',
  crypto: 'Markets, protocols, and on-chain developments.',
  ai: 'Models, research, and AI industry moves.',
  regulation: 'Policy, legal, and government actions affecting crypto.',
  onchain: 'On-chain data anomalies and protocol metrics.'
};

async function init() {
  await CL.auth.initAuth();

  const params = new URLSearchParams(location.search);
  const cat = params.get('cat') || 'all';
  const tag = params.get('tag');

  if (tag) {
    document.getElementById('cat-title').textContent = `#${tag}`;
    document.getElementById('cat-desc').textContent = `Articles tagged with #${tag}`;
    currentTag = tag;
  } else {
    currentCategory = cat;
    document.getElementById('cat-title').textContent =
      { all:'All Articles', cross:'Crypto × AI', crypto:'Crypto', ai:'AI', regulation:'Regulation', onchain:'On-chain' }[cat] || cat;
    document.getElementById('cat-desc').textContent = CAT_DESCS[cat] || '';
    document.querySelector(`.nav-filter[data-cat="${cat}"]`)?.classList.add('active');
  }

  await loadFeed(true);
}

async function handleModalLogin() {
  const email = document.getElementById('modal-email').value.trim();
  const msg = document.getElementById('modal-msg');
  const error = await CL.auth.sendMagicLink(email);
  if (error) { msg.className='msg msg-error'; msg.textContent=error.message; }
  else { msg.className='msg msg-success'; msg.textContent='Check your email!'; }
}

document.addEventListener('authChanged', () => loadFeed(true));
init();
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add category.html
git commit -m "feat: category/tag filtered feed page"
```

---

## Task 8: Article Detail Page (article.html)

**Files:**
- Create: `article.html`

- [ ] **Step 1: Write article.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CryptoLens — Article</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>

<div class="modal-overlay hidden" id="auth-modal">
  <div class="modal" style="position:relative">
    <button class="modal-close" onclick="CL.auth.closeLoginModal()">×</button>
    <h2>Sign in to CryptoLens</h2>
    <p>Enter your email — we'll send a magic link.</p>
    <input type="email" id="modal-email" placeholder="you@example.com">
    <button class="btn btn-primary" style="width:100%" onclick="handleModalLogin()">Send Magic Link</button>
    <p class="msg" id="modal-msg"></p>
  </div>
</div>

<nav class="nav">
  <a href="index.html" class="nav-logo">CRYPTO<span>LENS</span></a>
  <div class="nav-filters"></div>
  <div class="nav-actions">
    <span class="badge badge-cat-cross hidden" id="nav-pro-label">PRO</span>
    <button class="btn btn-ghost btn-sm" id="nav-login-btn"  onclick="CL.auth.openLoginModal()">Sign In</button>
    <button class="btn btn-ghost btn-sm hidden" id="nav-logout-btn" onclick="CL.auth.signOut()">Sign Out</button>
    <a href="subscribe.html" class="btn btn-primary btn-sm">Subscribe</a>
  </div>
</nav>

<div class="article-page" id="article-content">
  <div class="card skeleton" style="height:400px"></div>
</div>

<footer class="footer">
  <p class="footer-disclaimer">CryptoLens aggregates information from third-party sources for informational purposes only. Nothing on this site constitutes financial or investment advice. Always do your own research before making any investment decisions. Cryptocurrency investments carry significant risk.</p>
  <div class="footer-links">
    <a href="index.html">Home</a><a href="subscribe.html">Subscribe</a><a href="about.html">About</a>
  </div>
</footer>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="assets/config.js"></script>
<script src="assets/auth.js"></script>
<script src="assets/app.js"></script>
<script src="assets/affiliate.js"></script>
<script>
async function init() {
  await CL.auth.initAuth();

  const id = new URLSearchParams(location.search).get('id');
  if (!id) { document.getElementById('article-content').innerHTML = '<p style="color:var(--muted)">Article not found.</p>'; return; }

  const { data: article } = await CL.supabase
    .from('articles_public')
    .select('*')
    .eq('id', id)
    .single();

  if (!article) { document.getElementById('article-content').innerHTML = '<p style="color:var(--muted)">Article not found.</p>'; return; }

  document.title = `${article.title} — CryptoLens`;

  const catClass = { cross:'badge-cat-cross', crypto:'badge-cat-crypto', ai:'badge-cat-ai', regulation:'badge-cat-regulation', onchain:'badge-cat-onchain' }[article.category] || 'badge-cat-crypto';
  const tags = (article.tags || []).map(t => `<span class="tag" onclick="location.href='category.html?tag=${t}'">#${t}</span>`).join('');

  let editorSection = '';
  if (article.editor_note) {
    editorSection = `
      <div class="article-editor-note">
        <div class="editor-note-label">Editor's Take</div>
        <p style="font-size:0.9rem;line-height:1.7;color:var(--muted)">${article.editor_note}</p>
      </div>`;
  } else if (article.is_pro && !window.CL.isPro()) {
    editorSection = `
      <div class="article-editor-note">
        <div class="editor-note-label">Editor's Take — Pro Only</div>
        <div class="paywall-blur">
          <p style="font-size:0.9rem;line-height:1.7;color:var(--muted);filter:blur(4px);user-select:none">
            This analysis provides strategic context for investors. Upgrade to Pro to read the full editor note and unlock all premium intelligence.
          </p>
          <div class="paywall-cta"><span>Pro only —</span><a href="subscribe.html">Upgrade $15/mo</a></div>
        </div>
      </div>`;
  }

  document.getElementById('article-content').innerHTML = `
    <a href="javascript:history.back()" class="article-back">← Back</a>
    <div class="article-header">
      <div class="article-meta">
        <span class="badge ${catClass}">${article.category}</span>
        <span class="score-badge ${scoreClass(article.importance_score)}">●${article.importance_score}</span>
        <span class="card-source">${article.source_name || ''} · ${timeAgo(article.published_at)}</span>
      </div>
      <h1 class="article-title" style="margin-top:0.75rem">${article.title}</h1>
      ${tags ? `<div class="card-tags" style="margin-top:0.5rem">${tags}</div>` : ''}
    </div>
    <div class="article-summary">${article.summary || ''}</div>
    ${editorSection}
    <a class="article-original-link" href="${article.original_url}" target="_blank" rel="noopener"
       onclick="CL.affiliate.trackRead('${article.id}')">
      Read original article ↗
    </a>
    <p style="font-size:0.72rem;color:var(--muted);margin-top:3rem">
      CryptoLens aggregates information from third-party sources for informational purposes only. Nothing on this site constitutes financial or investment advice.
    </p>`;
}

async function handleModalLogin() {
  const email = document.getElementById('modal-email').value.trim();
  const msg = document.getElementById('modal-msg');
  const error = await CL.auth.sendMagicLink(email);
  if (error) { msg.className='msg msg-error'; msg.textContent=error.message; }
  else { msg.className='msg msg-success'; msg.textContent='Check your email!'; }
}

document.addEventListener('authChanged', init);
init();
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add article.html
git commit -m "feat: article detail page with paywall and editor note"
```

---

## Task 9: Subscribe Page (subscribe.html)

**Files:**
- Create: `subscribe.html`

- [ ] **Step 1: Write subscribe.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CryptoLens — Subscribe</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>

<nav class="nav">
  <a href="index.html" class="nav-logo">CRYPTO<span>LENS</span></a>
  <div class="nav-filters"></div>
  <div class="nav-actions">
    <a href="index.html" class="btn btn-ghost btn-sm">← Back</a>
  </div>
</nav>

<div class="subscribe-page">
  <h1>Get the Signal</h1>
  <p class="sub-lead">Filtered crypto × AI intelligence. Save 2 hours daily on noise.</p>

  <div class="email-input-row">
    <input type="email" id="sub-email" placeholder="your@email.com">
    <button class="btn btn-primary" onclick="doSubscribe()">Subscribe Free</button>
  </div>
  <p class="msg" id="sub-msg"></p>

  <div class="plans-grid" style="margin-top:2.5rem">
    <!-- FREE -->
    <div class="plan-card">
      <div class="plan-name">Free</div>
      <div class="plan-price">$0 <span>/ forever</span></div>
      <ul class="plan-features">
        <li class="has">Full article feed & summaries</li>
        <li class="has">Weekly Newsletter (Top 10)</li>
        <li class="has">Category & tag filters</li>
        <li>Editor's Take (Pro only)</li>
        <li>Daily Newsletter</li>
        <li>7+ day article archive</li>
      </ul>
      <button class="btn btn-ghost" style="width:100%" onclick="document.getElementById('sub-email').focus()">Get Started Free</button>
    </div>

    <!-- PRO -->
    <div class="plan-card featured">
      <div class="plan-name">Pro</div>
      <div class="plan-price">$15 <span>/ month</span></div>
      <ul class="plan-features">
        <li class="has">Everything in Free</li>
        <li class="has">Editor's Take on every article</li>
        <li class="has">Daily Newsletter (Top 5 + analysis)</li>
        <li class="has">Full article archive</li>
        <li class="has">On-chain data interpretation</li>
      </ul>
      <a href="YOUR_STRIPE_PAYMENT_LINK_MONTHLY" class="btn btn-primary" style="width:100%;display:block;text-align:center">Upgrade to Pro →</a>
      <p style="text-align:center;font-size:0.72rem;color:var(--muted);margin-top:0.5rem">
        Or <a href="YOUR_STRIPE_PAYMENT_LINK_YEARLY" style="color:var(--cyan)">$120/year</a> (save $60)
      </p>
    </div>
  </div>

  <p style="font-size:0.72rem;color:var(--muted);margin-top:2.5rem;line-height:1.6">
    CryptoLens aggregates information from third-party sources for informational purposes only. Nothing on this site constitutes financial or investment advice. Always do your own research before making any investment decisions. Cryptocurrency investments carry significant risk.
  </p>
</div>

<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
<script src="assets/config.js"></script>
<script src="assets/auth.js"></script>
<script src="assets/app.js"></script>
<script src="assets/affiliate.js"></script>
<script>
async function doSubscribe() {
  const email = document.getElementById('sub-email').value.trim();
  const msg = document.getElementById('sub-msg');
  const { error } = await handleSubscribe(email);
  if (error) { msg.className='msg msg-error'; msg.textContent='Already subscribed or invalid email.'; }
  else { msg.className='msg msg-success'; msg.textContent='Subscribed! Weekly newsletter every Monday.'; }
}
CL.auth.initAuth();
</script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add subscribe.html
git commit -m "feat: subscribe page with free/pro plan comparison"
```

---

## Task 10: About Page (about.html)

**Files:**
- Create: `about.html`

- [ ] **Step 1: Write about.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CryptoLens — About</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/style.css">
</head>
<body>

<nav class="nav">
  <a href="index.html" class="nav-logo">CRYPTO<span>LENS</span></a>
  <div class="nav-filters"></div>
  <div class="nav-actions">
    <a href="index.html" class="btn btn-ghost btn-sm">← Back</a>
    <a href="subscribe.html" class="btn btn-primary btn-sm">Subscribe</a>
  </div>
</nav>

<div class="about-page">
  <h1>About CryptoLens</h1>
  <p style="color:var(--muted);margin-top:0.25rem;font-size:0.85rem">The only intelligence platform focused on the crypto × AI intersection.</p>

  <h2>What We Do</h2>
  <p>CryptoLens monitors 11+ sources across crypto media, AI research, and on-chain data. Every 2 hours, our pipeline fetches new content, scores it on a 1–10 importance scale using Gemini AI, and surfaces only the stories that matter (score ≥ 7).</p>
  <p>We don't just aggregate — we filter. The average score across all fetched content is around 5. You only see what scored 7 or above. Editor's Take provides context on why a story matters, not just what it says.</p>

  <h2>The Crypto × AI Angle</h2>
  <p>Most crypto media covers markets. Most AI media covers models. Nobody covers the intersection: AI agents on-chain, tokenized compute markets, AI-driven trading protocols, regulation touching both sectors. That's our focus.</p>

  <h2>Sources</h2>
  <p>CoinDesk · Decrypt · The Block · Blockworks · a16z crypto · Paradigm · Import AI · The Batch · Hugging Face Blog · Reddit r/CryptoCurrency · Reddit r/artificial</p>

  <h2>Scoring Dimensions</h2>
  <p>Each article is scored on: source authority, market cap relevance (BTC/ETH weighted higher), price/regulatory/technology impact, and crypto × AI crossover relevance (bonus points). Articles scoring ≥ 9 are marked Pro — they contain the highest-signal intelligence.</p>

  <h2>Disclaimer</h2>
  <p>CryptoLens aggregates information from third-party sources for informational purposes only. Nothing on this site constitutes financial or investment advice. Always do your own research before making any investment decisions. Cryptocurrency investments carry significant risk. Past performance is not indicative of future results.</p>

  <h2>Contact</h2>
  <p>Questions or feedback: <a href="mailto:hello@qizh.space">hello@qizh.space</a></p>
</div>

<footer class="footer">
  <div class="footer-links">
    <a href="index.html">Home</a><a href="subscribe.html">Subscribe</a>
  </div>
</footer>

</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add about.html
git commit -m "feat: about page with mission, scoring explanation, disclaimer"
```

---

## Task 11: Affiliate Tracking (assets/affiliate.js)

**Files:**
- Create: `assets/affiliate.js`

- [ ] **Step 1: Write assets/affiliate.js**

```js
// Tracks affiliate link clicks to Supabase (anonymous, no auth required)
window.CL = window.CL || {};
window.CL.affiliate = {
  async track(affiliateName, articleId) {
    await window.CL.supabase
      .from('affiliate_clicks')
      .insert({ affiliate_name: affiliateName, article_id: articleId || null });
  },
  trackRead(articleId) {
    // Called when user clicks "Read original article" — not an affiliate click, no-op here
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add assets/affiliate.js
git commit -m "feat: affiliate click tracking"
```

---

## Task 12: CNAME + CLAUDE.md

**Files:**
- Create: `CNAME`
- Create: `CLAUDE.md`

- [ ] **Step 1: Create CNAME**

```
lens.qizh.space
```

- [ ] **Step 2: Create CLAUDE.md**

```markdown
# CryptoLens — CLAUDE.md

Crypto × AI intelligence platform. Static site on GitHub Pages + Supabase backend.
Deployed at: https://lens.qizh.space

## File Structure

| File | Purpose |
|------|---------|
| `index.html` | Homepage: Today's Top + feed + sidebar |
| `category.html` | Filtered feed by `?cat=` or `?tag=` |
| `article.html` | Article detail by `?id=` |
| `subscribe.html` | Email subscribe + Pro upgrade |
| `about.html` | About + disclaimer |
| `assets/config.js` | SUPABASE_URL + SUPABASE_ANON_KEY (public, safe) |
| `assets/style.css` | Design system (deep-sea-blue, Space Grotesk + JetBrains Mono) |
| `assets/auth.js` | Supabase Auth magic link. Exposes `window.CL.auth` |
| `assets/app.js` | Feed engine. Exposes `setCategory`, `filterByTag`, `handleSubscribe` |
| `assets/affiliate.js` | Click tracking. Exposes `window.CL.affiliate.track()` |
| `scripts/fetch.js` | RSS → Gemini → Supabase. Run via GitHub Actions every 2h |
| `scripts/newsletter.js` | Send Resend emails. Run via GitHub Actions weekdays 08:00 UTC |

## Design System

```css
--bg: #0a0e1a  --cyan: #00d4ff  --purple: #7c3aed
Fonts: Space Grotesk + JetBrains Mono
```

## Secrets (GitHub Actions)

Set these in GitHub repo → Settings → Secrets → Actions:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (for scripts — bypasses RLS)
- `GEMINI_API_KEY`
- `RESEND_API_KEY`

## Supabase Architecture

- `articles` table: RLS enabled, no select policy → no direct access
- `articles_public` view: postgres-owned, conditionally returns `editor_note` for Pro users
- `users.is_pro`: set manually in Supabase dashboard after payment (MVP)
- To upgrade a user: Supabase dashboard → Table editor → users → find by email → set is_pro = true

## Deploy

```bash
git add -A
git commit -m "describe changes"
git push origin main
```
GitHub Pages auto-deploys from `main` branch root.

## Phase 2 Roadmap

- Stripe Webhook → Supabase Edge Function → auto-activate is_pro
- KOL Twitter/X monitoring (Trump, Musk, CZ, Justin Sun, Vitalik) with Tier 0 ×2.0 weight
- Full-text search via Supabase
```

- [ ] **Step 3: Commit**

```bash
git add CNAME CLAUDE.md
git commit -m "feat: CNAME and project documentation"
```

---

## Task 13: RSS Fetch Pipeline (scripts/fetch.js)

**Files:**
- Create: `scripts/fetch.js`

- [ ] **Step 1: Write scripts/fetch.js**

```js
import Parser from 'rss-parser';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const genai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genai.getGenerativeModel({ model: 'gemini-2.0-flash' });
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
    return feed.items.slice(0, 20).map(item => ({
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
  "summary": "<100-word English summary of the key insight>",
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
      await sleep(4000); // stay under 15 RPM
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
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
```

- [ ] **Step 2: Verify script runs (dry-run)**

Set env vars locally and run:
```bash
export SUPABASE_URL="your-url"
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
export GEMINI_API_KEY="your-gemini-key"
node scripts/fetch.js
```

Expected output: source names listed, articles logged with scores, "Done." summary at end. Check Supabase `articles` table — rows should appear.

- [ ] **Step 3: Commit**

```bash
git add scripts/fetch.js
git commit -m "feat: RSS fetch pipeline with Gemini scoring and Supabase write"
```

---

## Task 14: Newsletter Script (scripts/newsletter.js)

**Files:**
- Create: `scripts/newsletter.js`

- [ ] **Step 1: Write scripts/newsletter.js**

```js
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
const resend = new Resend(process.env.RESEND_API_KEY);

const TODAY = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
const DAY = new Date().getDay(); // 0=Sun, 1=Mon

async function getTopArticles(hoursBack) {
  const since = new Date(Date.now() - hoursBack * 3600000).toISOString();
  const { data } = await supabase
    .from('articles')
    .select('*, sources(name)')
    .gte('published_at', since)
    .gte('importance_score', 8)
    .order('importance_score', { ascending: false })
    .limit(10);
  return data || [];
}

function scoreColor(score) {
  if (score >= 9) return '#00d4ff';
  if (score >= 8) return '#e8eaf0';
  return '#6b7280';
}

function articleBlock(article, includePro) {
  const note = includePro && article.editor_note
    ? `<p style="border-left:2px solid #00d4ff;padding-left:12px;color:#9ca3af;font-size:13px;line-height:1.6;margin:8px 0 0">${article.editor_note}</p>`
    : includePro
    ? `<p style="border-left:2px solid #6b7280;padding-left:12px;color:#6b7280;font-size:12px;font-style:italic">No editor note yet.</p>`
    : '';

  return `
    <div style="border:1px solid rgba(0,212,255,0.15);border-radius:6px;padding:16px;margin-bottom:12px;background:#0f1524">
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-family:monospace;font-size:11px;color:#6b7280">${article.sources?.name || ''} · ${new Date(article.published_at).toLocaleDateString()}</span>
        <span style="font-family:monospace;font-size:13px;font-weight:700;color:${scoreColor(article.importance_score)}">●${article.importance_score}</span>
      </div>
      <a href="https://lens.qizh.space/article.html?id=${article.id}" style="color:#e8eaf0;font-size:15px;font-weight:600;text-decoration:none;line-height:1.3;display:block;margin-bottom:8px">${article.title}</a>
      <p style="color:#6b7280;font-size:13px;line-height:1.6;margin:0">${article.summary || ''}</p>
      ${note}
    </div>`;
}

function buildEmail(articles, isPro, isWeekly) {
  const subject = isWeekly
    ? `CryptoLens Weekly | ${TODAY} — Top ${articles.length}`
    : `CryptoLens Daily | ${TODAY} — Top ${Math.min(5, articles.length)}`;

  const sliced = isWeekly ? articles : articles.slice(0, 5);

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="background:#0a0e1a;color:#e8eaf0;font-family:'Helvetica Neue',Arial,sans-serif;margin:0;padding:0">
  <div style="max-width:600px;margin:0 auto;padding:32px 24px">
    <div style="margin-bottom:24px">
      <span style="font-family:monospace;font-size:18px;font-weight:700;color:#00d4ff">CRYPTOLENS</span>
      <span style="font-family:monospace;font-size:12px;color:#6b7280;margin-left:12px">${TODAY}${isPro ? ' · PRO' : ''}</span>
    </div>

    <p style="font-family:monospace;font-size:11px;color:#6b7280;letter-spacing:0.1em;text-transform:uppercase;margin-bottom:16px">
      ${isWeekly ? "This Week's Top Signal" : "Today's Top Signal"}
    </p>

    ${sliced.map(a => articleBlock(a, isPro)).join('')}

    <div style="border:1px solid rgba(0,212,255,0.12);border-radius:6px;padding:16px;margin:24px 0;text-align:center">
      <p style="font-family:monospace;font-size:10px;color:#6b7280;text-transform:uppercase;margin:0 0 8px">Partner</p>
      <p style="font-size:13px;color:#9ca3af;margin:0">Trade on <a href="https://accounts.binance.com/register?ref=YOUR_REF" style="color:#00d4ff">Binance</a> — earn rebates on every trade. ${isPro ? '' : '<a href="https://lens.qizh.space/subscribe.html" style="color:#7c3aed">Upgrade to Pro</a> for daily delivery + Editor\'s Take.'}</p>
    </div>

    <div style="border-top:1px solid rgba(0,212,255,0.1);padding-top:16px;font-size:11px;color:#6b7280;line-height:1.6">
      <p>CryptoLens aggregates information from third-party sources for informational purposes only. Nothing on this site constitutes financial or investment advice. Always do your own research. Cryptocurrency investments carry significant risk.</p>
      <p style="margin-top:8px"><a href="https://lens.qizh.space" style="color:#6b7280">Visit CryptoLens</a> · <a href="https://lens.qizh.space/subscribe.html" style="color:#6b7280">Manage subscription</a></p>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

async function getSubscribers(isPro) {
  const { data } = await supabase
    .from('subscribers')
    .select('email')
    .eq('is_active', true)
    .eq('is_pro', isPro);
  return (data || []).map(s => s.email);
}

async function sendBatch(emails, subject, html, tag) {
  if (!emails.length) { console.log(`  No ${tag} subscribers`); return; }

  // Resend supports up to 50 recipients per call
  const chunks = [];
  for (let i = 0; i < emails.length; i += 50) chunks.push(emails.slice(i, i + 50));

  for (const chunk of chunks) {
    const { error } = await resend.emails.send({
      from: 'CryptoLens <signal@lens.qizh.space>',
      to: chunk,
      subject,
      html
    });
    if (error) console.error(`  Send error (${tag}):`, error);
    else console.log(`  Sent to ${chunk.length} ${tag} subscribers`);
  }
}

async function main() {
  console.log('CryptoLens newsletter:', new Date().toISOString());

  const isWeekly = DAY === 1; // Monday
  const articles = await getTopArticles(isWeekly ? 168 : 24);
  console.log(`Found ${articles.length} articles`);

  if (!articles.length) { console.log('No articles to send.'); return; }

  // Free newsletter
  const freeEmails = await getSubscribers(false);
  const { subject: freeSubject, html: freeHtml } = buildEmail(articles, false, isWeekly);
  await sendBatch(freeEmails, freeSubject, freeHtml, 'free');

  // Pro newsletter (daily only, not weekly override)
  const proEmails = await getSubscribers(true);
  const { subject: proSubject, html: proHtml } = buildEmail(articles, true, isWeekly);
  await sendBatch(proEmails, proSubject, proHtml, 'pro');

  console.log('Done.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
```

- [ ] **Step 2: Commit**

```bash
git add scripts/newsletter.js
git commit -m "feat: newsletter script with free/pro email splits via Resend"
```

---

## Task 15: GitHub Actions Workflows

**Files:**
- Create: `.github/workflows/fetch.yml`
- Create: `.github/workflows/newsletter.yml`

- [ ] **Step 1: Create .github/workflows/fetch.yml**

```yaml
name: Fetch Articles

on:
  schedule:
    - cron: '0 */2 * * *'   # every 2 hours
  workflow_dispatch:          # allow manual trigger

jobs:
  fetch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Fetch and process articles
        run: node scripts/fetch.js
        env:
          SUPABASE_URL:              ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          GEMINI_API_KEY:            ${{ secrets.GEMINI_API_KEY }}
```

- [ ] **Step 2: Create .github/workflows/newsletter.yml**

```yaml
name: Send Newsletter

on:
  schedule:
    - cron: '0 8 * * 1-5'   # weekdays 08:00 UTC
  workflow_dispatch:

jobs:
  newsletter:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - run: npm ci

      - name: Send newsletter
        run: node scripts/newsletter.js
        env:
          SUPABASE_URL:              ${{ secrets.SUPABASE_URL }}
          SUPABASE_SERVICE_ROLE_KEY: ${{ secrets.SUPABASE_SERVICE_ROLE_KEY }}
          RESEND_API_KEY:            ${{ secrets.RESEND_API_KEY }}
```

- [ ] **Step 3: Commit**

```bash
git add .github/
git commit -m "feat: GitHub Actions workflows for fetch (2h) and newsletter (weekdays 8am UTC)"
```

---

## Task 16: Final Verification + Push

- [ ] **Step 1: Verify all files exist**

```bash
cd /home/test/CryptoLens-site
find . -not -path './.git/*' -not -path './node_modules/*' -type f | sort
```

Expected output includes:
```
./CLAUDE.md
./CNAME
./.github/workflows/fetch.yml
./.github/workflows/newsletter.yml
./about.html
./article.html
./assets/affiliate.js
./assets/app.js
./assets/auth.js
./assets/config.js
./assets/style.css
./category.html
./docs/superpowers/plans/2026-05-12-cryptolens-mvp.md
./docs/superpowers/specs/2026-05-12-cryptolens-mvp-design.md
./index.html
./package.json
./package-lock.json
./scripts/fetch.js
./scripts/newsletter.js
./subscribe.html
```

- [ ] **Step 2: Verify git log shows clean history**

```bash
git log --oneline
```

Expected: 15-16 commits, each for a distinct feature.

- [ ] **Step 3: Fill in config.js with real Supabase values**

Open Supabase dashboard → Settings → API. Copy:
- Project URL → `SUPABASE_URL`
- anon/public key → `SUPABASE_ANON_KEY`

Update `assets/config.js` with real values and commit:
```bash
git add assets/config.js
git commit -m "config: add Supabase project URL and anon key"
```

- [ ] **Step 4: Fill in subscribe.html Stripe links**

In Stripe dashboard, create two Payment Links (monthly $15, yearly $120).
Replace `YOUR_STRIPE_PAYMENT_LINK_MONTHLY` and `YOUR_STRIPE_PAYMENT_LINK_YEARLY` in `subscribe.html`.
Replace `YOUR_REF` in affiliate links in `index.html` and `scripts/newsletter.js` with your Binance referral code.

```bash
git add subscribe.html index.html scripts/newsletter.js
git commit -m "config: add Stripe payment links and affiliate codes"
```

- [ ] **Step 5: Add GitHub Actions secrets**

In the private GitHub repo → Settings → Secrets and variables → Actions → New repository secret:
- `SUPABASE_URL` — same as in config.js
- `SUPABASE_SERVICE_ROLE_KEY` — from Supabase → Settings → API → service_role key
- `GEMINI_API_KEY` — from Google AI Studio
- `RESEND_API_KEY` — from Resend dashboard

- [ ] **Step 6: Add remote and push**

```bash
git remote add origin https://github.com/YOUR_USERNAME/cryptolens-site.git
git push -u origin main
```

- [ ] **Step 7: Enable GitHub Pages**

GitHub repo → Settings → Pages → Source: Deploy from a branch → Branch: `main` / `(root)` → Save.

- [ ] **Step 8: Add CNAME DNS record**

In your domain registrar (qizh.space DNS):
```
Type: CNAME
Name: lens
Value: YOUR_GITHUB_USERNAME.github.io
TTL: 3600
```

Wait ~5 minutes, then visit `https://lens.qizh.space` — site should load.

- [ ] **Step 9: Trigger first fetch manually**

GitHub repo → Actions → "Fetch Articles" → Run workflow. Watch the logs. After ~5 minutes, refresh `https://lens.qizh.space` — articles should appear in the feed.
```
