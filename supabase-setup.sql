-- =============================================================
-- CryptoLens Supabase Setup
-- Run this entire file in Supabase dashboard → SQL Editor
-- Run sections in order (1 → 2 → 3 → 4 → 5)
-- =============================================================

-- ── SECTION 1: TABLES ────────────────────────────────────────

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

create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  is_pro boolean default false,
  stripe_customer_id text,
  subscribed_at timestamp,
  expires_at timestamp,
  created_at timestamp default now()
);

create table subscribers (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  is_active boolean default true,
  is_pro boolean default false,
  created_at timestamp default now()
);

create table affiliate_clicks (
  id uuid primary key default gen_random_uuid(),
  affiliate_name text,
  article_id uuid references articles(id),
  clicked_at timestamp default now()
);

-- ── SECTION 2: AUTH TRIGGER ──────────────────────────────────
-- Auto-creates a public.users row when someone signs up via magic link

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

-- ── SECTION 3: RLS POLICIES ──────────────────────────────────

-- articles: block ALL direct access (frontend must use articles_public view)
alter table articles enable row level security;
-- intentionally NO select policy = no direct API access

-- users: each user reads/updates only their own record
alter table users enable row level security;

create policy "user reads own record" on users
  for select using (id = auth.uid());

create policy "user updates own record" on users
  for update using (id = auth.uid());

-- subscribers: anyone can insert (subscribe form)
alter table subscribers enable row level security;

create policy "anyone can subscribe" on subscribers
  for insert with check (true);

-- affiliate_clicks: anyone can insert
alter table affiliate_clicks enable row level security;

create policy "anyone can track clicks" on affiliate_clicks
  for insert with check (true);

-- ── SECTION 4: articles_public VIEW ──────────────────────────
-- This view bypasses articles RLS (postgres-owned).
-- Returns editor_note only to logged-in Pro users.

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

grant select on articles_public to anon, authenticated;

-- ── SECTION 5: SEED RSS SOURCES ─────────────────────────────

insert into sources (name, url, feed_url, category) values
  ('CoinDesk',          'https://www.coindesk.com',               'https://www.coindesk.com/arc/outboundfeeds/rss/',        'crypto'),
  ('Decrypt',           'https://decrypt.co',                     'https://decrypt.co/feed',                               'crypto'),
  ('The Block',         'https://www.theblock.co',                'https://www.theblock.co/rss.xml',                       'crypto'),
  ('Blockworks',        'https://blockworks.co',                  'https://blockworks.co/feed',                            'crypto'),
  ('a16z crypto',       'https://a16zcrypto.com',                 'https://a16zcrypto.com/feed/',                          'crypto'),
  ('Paradigm',          'https://www.paradigm.xyz',               'https://www.paradigm.xyz/feed',                         'crypto'),
  ('Import AI',         'https://importai.substack.com',          'https://importai.substack.com/feed',                    'ai'),
  ('The Batch',         'https://www.deeplearning.ai/the-batch',  'https://www.deeplearning.ai/the-batch/feed/',           'ai'),
  ('Hugging Face Blog', 'https://huggingface.co/blog',            'https://huggingface.co/blog/feed.xml',                  'ai'),
  ('Reddit Crypto',     'https://reddit.com/r/CryptoCurrency',    'https://www.reddit.com/r/CryptoCurrency/.rss',          'crypto'),
  ('Reddit AI',         'https://reddit.com/r/artificial',        'https://www.reddit.com/r/artificial/.rss',              'ai');

-- ── VERIFY ───────────────────────────────────────────────────
select count(*) from sources;           -- should be 11
select * from articles_public limit 1;  -- should return empty, no error
