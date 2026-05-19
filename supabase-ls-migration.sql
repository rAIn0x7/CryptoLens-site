-- Lemon Squeezy integration — run in Supabase Dashboard → SQL Editor

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS lemon_squeezy_customer_id     text,
  ADD COLUMN IF NOT EXISTS lemon_squeezy_subscription_id text;

-- Allow Edge Function (service role) to update is_pro
-- Service role bypasses RLS by default — no extra policy needed.
