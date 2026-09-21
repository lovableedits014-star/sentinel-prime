-- Remove integralmente o modulo de Trafego Pago / Meta Ads.
-- ATENCAO: esta migration apaga definitivamente os dados exclusivos do modulo.

DROP TABLE IF EXISTS public.ads_ai_suggestions;
DROP TABLE IF EXISTS public.ads_guard_checks;
DROP TABLE IF EXISTS public.ads_creatives;
DROP TABLE IF EXISTS public.ads_adsets;
DROP TABLE IF EXISTS public.ads_campaigns;
DROP TABLE IF EXISTS public.ads_identity_status;
DROP TABLE IF EXISTS public.ads_insights_daily;
DROP TABLE IF EXISTS public.ads_audit_log;
DROP TABLE IF EXISTS public.ads_accounts;
DROP TABLE IF EXISTS public.ads_tse_limits;

NOTIFY pgrst, 'reload schema';
