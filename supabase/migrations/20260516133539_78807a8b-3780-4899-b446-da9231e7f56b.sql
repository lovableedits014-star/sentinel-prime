-- =====================================================================
-- Hybrid LLM Routing — additive, reversible, zero breaking change
-- =====================================================================

-- 1. Modo de operação por cliente (simple = legacy, hybrid = tiers)
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS llm_mode text NOT NULL DEFAULT 'simple'
    CHECK (llm_mode IN ('simple', 'hybrid'));

-- 2. Colunas por tier (todas nullable; usam o mesmo enum llm_provider)
ALTER TABLE public.integrations
  ADD COLUMN IF NOT EXISTS llm_provider_fast       public.llm_provider,
  ADD COLUMN IF NOT EXISTS llm_api_key_fast        text,
  ADD COLUMN IF NOT EXISTS llm_model_fast          text,
  ADD COLUMN IF NOT EXISTS llm_provider_classify   public.llm_provider,
  ADD COLUMN IF NOT EXISTS llm_api_key_classify    text,
  ADD COLUMN IF NOT EXISTS llm_model_classify      text,
  ADD COLUMN IF NOT EXISTS llm_provider_reasoning  public.llm_provider,
  ADD COLUMN IF NOT EXISTS llm_api_key_reasoning   text,
  ADD COLUMN IF NOT EXISTS llm_model_reasoning     text,
  ADD COLUMN IF NOT EXISTS llm_provider_deep       public.llm_provider,
  ADD COLUMN IF NOT EXISTS llm_api_key_deep        text,
  ADD COLUMN IF NOT EXISTS llm_model_deep          text;

COMMENT ON COLUMN public.integrations.llm_mode IS 'simple = usa llm_provider/llm_api_key/llm_model (legacy). hybrid = roteia por tier.';

-- 3. Tabela de telemetria de uso de LLM
CREATE TABLE IF NOT EXISTS public.llm_usage_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id           uuid,
  function_name     text NOT NULL,
  tier              text NOT NULL CHECK (tier IN ('fast','classify','reasoning','deep','legacy','multimodal')),
  provider          text NOT NULL,
  model             text NOT NULL,
  latency_ms        integer,
  prompt_tokens     integer,
  completion_tokens integer,
  total_tokens      integer,
  request_id        text NOT NULL,
  success           boolean NOT NULL,
  error_code        text,
  error_message     text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_llm_usage_log_client_created
  ON public.llm_usage_log(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_log_function_created
  ON public.llm_usage_log(function_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_log_request
  ON public.llm_usage_log(request_id);

ALTER TABLE public.llm_usage_log ENABLE ROW LEVEL SECURITY;

-- SELECT: super admin OU usuário com acesso ao client
DROP POLICY IF EXISTS "llm_usage_log: super admin or client access can view"
  ON public.llm_usage_log;
CREATE POLICY "llm_usage_log: super admin or client access can view"
  ON public.llm_usage_log
  FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin()
    OR public.user_has_client_access(client_id, auth.uid())
  );

-- INSERT/UPDATE/DELETE: bloqueado para usuários. Apenas service role escreve (RLS bypass).
-- Nenhuma policy de INSERT/UPDATE/DELETE = negado para authenticated/anon.

COMMENT ON TABLE public.llm_usage_log IS 'Telemetria de chamadas LLM. Escrita apenas via service role. Leitura: super admin ou usuário com acesso ao client.';
