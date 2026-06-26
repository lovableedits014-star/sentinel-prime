
CREATE TABLE public.ads_ai_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ads_campaign_id UUID REFERENCES public.ads_campaigns(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  titulo TEXT NOT NULL,
  descricao TEXT NOT NULL,
  motivo TEXT,
  acao_proposta JSONB NOT NULL DEFAULT '{}'::jsonb,
  impacto_estimado TEXT,
  prioridade TEXT NOT NULL DEFAULT 'media' CHECK (prioridade IN ('alta','media','baixa')),
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','recusada','expirada','executada')),
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  execution_result JSONB,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '48 hours'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_ai_suggestions TO authenticated;
GRANT ALL ON public.ads_ai_suggestions TO service_role;

ALTER TABLE public.ads_ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_with_client_access_can_view_suggestions"
  ON public.ads_ai_suggestions FOR SELECT TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()));

CREATE POLICY "users_with_client_access_can_manage_suggestions"
  ON public.ads_ai_suggestions FOR ALL TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()))
  WITH CHECK (public.user_has_client_access(client_id, auth.uid()));

CREATE INDEX idx_ads_ai_suggestions_client_status ON public.ads_ai_suggestions(client_id, status);
CREATE INDEX idx_ads_ai_suggestions_campaign ON public.ads_ai_suggestions(ads_campaign_id);

CREATE TRIGGER update_ads_ai_suggestions_updated_at
  BEFORE UPDATE ON public.ads_ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ads_tse_limits (cargo, ano_eleicao, uf, limite_total_cents, observacoes)
VALUES
  ('governador',         2026, NULL, 1000000000000, 'Teto referencial — confirmar valor oficial TSE 2026 por UF'),
  ('senador',            2026, NULL,  500000000000, 'Teto referencial — confirmar valor oficial TSE 2026 por UF'),
  ('deputado_federal',   2026, NULL,  300000000000, 'Teto referencial — confirmar valor oficial TSE 2026 por UF'),
  ('deputado_estadual',  2026, NULL,  200000000000, 'Teto referencial — confirmar valor oficial TSE 2026 por UF')
ON CONFLICT DO NOTHING;
