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
| `assets/app.js` | Feed engine. Exposes `setCategory`, `filterByTag`, `handleSubscribe`, `loadFeed`, `loadTodaysTop`, `loadSidebarTags` |
| `assets/affiliate.js` | Click tracking. Exposes `window.CL.affiliate.track()` |
| `scripts/fetch.js` | RSS → Gemini → Supabase. Run via GitHub Actions every 2h |
| `scripts/newsletter.js` | Send Resend emails. Run via GitHub Actions weekdays 08:00 UTC |
| `supabase-setup.sql` | Run once in Supabase SQL Editor to set up schema |

## Design System

```css
--bg: #0a0e1a  --cyan: #00d4ff  --purple: #7c3aed
Fonts: Space Grotesk + JetBrains Mono
```

## Secrets (GitHub Actions)

Set in GitHub repo → Settings → Secrets → Actions:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `RESEND_API_KEY`

## Supabase Architecture

- `articles` table: RLS enabled, no select policy = no direct API access
- `articles_public` view: postgres-owned, joins sources, conditionally returns `editor_note` for Pro users
- `users.is_pro`: set manually in Supabase dashboard after payment (MVP)
- To upgrade a user: Supabase → Table editor → users → find by email → set is_pro = true

## Deploy

```bash
git add -A
git commit -m "describe changes"
git push origin main
```

GitHub Pages auto-deploys from `main` branch root.

## Phase 2 Roadmap

- Stripe Webhook → Supabase Edge Function → auto-activate is_pro
- KOL Twitter/X monitoring (Trump, Musk, CZ, Justin Sun, Vitalik) Tier 0 ×2.0 weight
- Full-text search via Supabase
