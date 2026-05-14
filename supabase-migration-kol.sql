-- CryptoLens Migration — KOL Tweets + Bilingual Summary
-- Run in Supabase dashboard → SQL Editor

-- ── 1. Add summary_zh column to articles ─────────────────────
alter table articles add column if not exists summary_zh text;

-- ── 2. Recreate articles_public view with summary_zh ─────────
drop view if exists articles_public;

create view articles_public as
  select
    a.id,
    a.title,
    a.original_url,
    a.summary,
    a.summary_zh,
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

-- ── 3. Create kol_tweets table ────────────────────────────────
create table if not exists kol_tweets (
  id            uuid primary key default gen_random_uuid(),
  tweet_id      text unique not null,
  handle        text not null,
  display_name  text,
  content       text not null,
  tweet_url     text,
  summary_en    text,
  summary_zh    text,
  importance_score int,
  tags          text[],
  published_at  timestamp,
  created_at    timestamp default now()
);

alter table kol_tweets enable row level security;

-- ── 4. Create kol_tweets_public view ─────────────────────────
create view kol_tweets_public as
  select
    id, tweet_id, handle, display_name, content, tweet_url,
    summary_en, summary_zh, importance_score, tags, published_at
  from kol_tweets
  order by importance_score desc, published_at desc;

grant select on kol_tweets_public to anon, authenticated;
