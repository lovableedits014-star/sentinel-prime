ALTER TABLE public.ads_accounts
  ADD COLUMN IF NOT EXISTS nome text,
  ADD COLUMN IF NOT EXISTS moeda text,
  ADD COLUMN IF NOT EXISTS business_id text,
  ADD COLUMN IF NOT EXISTS business_name text,
  ADD COLUMN IF NOT EXISTS account_status integer;

CREATE UNIQUE INDEX IF NOT EXISTS ads_accounts_client_meta_uniq
  ON public.ads_accounts (client_id, meta_ad_account_id);