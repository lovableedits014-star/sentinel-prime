-- Lote C1 — extend llm_usage_log for correlation/retries/cost tracking
ALTER TABLE public.llm_usage_log
  ADD COLUMN IF NOT EXISTS correlation_id text,
  ADD COLUMN IF NOT EXISTS retries integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_cost_usd numeric(12,6),
  ADD COLUMN IF NOT EXISTS error_type text,
  ADD COLUMN IF NOT EXISTS parent_function text;

CREATE INDEX IF NOT EXISTS idx_llm_usage_log_client_created
  ON public.llm_usage_log (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_log_correlation
  ON public.llm_usage_log (correlation_id) WHERE correlation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_usage_log_function_created
  ON public.llm_usage_log (function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_log_provider_created
  ON public.llm_usage_log (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_log_errors
  ON public.llm_usage_log (client_id, created_at DESC) WHERE success = false;

-- Retention helper: purge logs older than 90 days (can be invoked by cron later)
CREATE OR REPLACE FUNCTION public.purge_llm_usage_log(p_days integer DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count integer;
BEGIN
  DELETE FROM public.llm_usage_log
  WHERE created_at < now() - (p_days || ' days')::interval;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END; $$;