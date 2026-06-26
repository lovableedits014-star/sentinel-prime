
-- ============================================================
-- Fase 1: Tráfego Pago Meta Ads — Fundação
-- ============================================================

-- 1) ads_accounts: vínculo conta de anúncio Meta ao client
CREATE TABLE public.ads_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  meta_ad_account_id text NOT NULL,           -- ex: act_123456789
  business_manager_id text,
  pixel_id text,
  page_id text,                                -- ID da página vinculada
  instagram_id text,
  cnpj_eleitoral text,                         -- CNPJ da campanha eleitoral
  disclaimer_pago_por text,                    -- "Pago por Fulano - CNPJ XX..."
  candidato_nome text,
  candidato_numero text,                       -- ex: 13, 1234, 12345
  candidato_cargo text,                        -- governador, senador, dep_federal, dep_estadual, prefeito, vereador
  identidade_meta_confirmada boolean DEFAULT false,
  identidade_expira_em date,
  ativa boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, meta_ad_account_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_accounts TO authenticated;
GRANT ALL ON public.ads_accounts TO service_role;
ALTER TABLE public.ads_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client members can view ads_accounts" ON public.ads_accounts
  FOR SELECT TO authenticated USING (public.user_has_client_access(client_id, auth.uid()));
CREATE POLICY "Client members can manage ads_accounts" ON public.ads_accounts
  FOR ALL TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()))
  WITH CHECK (public.user_has_client_access(client_id, auth.uid()));

-- 2) ads_identity_status: diagnóstico Meta (checklist)
CREATE TABLE public.ads_identity_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ads_account_id uuid REFERENCES public.ads_accounts(id) ON DELETE CASCADE,
  checked_at timestamptz NOT NULL DEFAULT now(),
  has_ads_management boolean DEFAULT false,
  has_ads_read boolean DEFAULT false,
  has_business_management boolean DEFAULT false,
  has_leads_retrieval boolean DEFAULT false,
  has_pages_manage_ads boolean DEFAULT false,
  business_manager_linked boolean DEFAULT false,
  ad_account_active boolean DEFAULT false,
  pixel_configured boolean DEFAULT false,
  political_identity_confirmed boolean DEFAULT false,
  political_identity_expires_at date,
  authorized_advertiser_linked boolean DEFAULT false,
  disclaimer_configured boolean DEFAULT false,
  cnpj_eleitoral_set boolean DEFAULT false,
  raw_response jsonb,
  issues jsonb DEFAULT '[]'::jsonb,             -- lista de problemas com instruções
  overall_status text DEFAULT 'unknown',        -- ok | warning | blocked | unknown
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_identity_status TO authenticated;
GRANT ALL ON public.ads_identity_status TO service_role;
ALTER TABLE public.ads_identity_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client members can view identity status" ON public.ads_identity_status
  FOR SELECT TO authenticated USING (public.user_has_client_access(client_id, auth.uid()));
CREATE POLICY "Service role manages identity status" ON public.ads_identity_status
  FOR ALL TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()))
  WITH CHECK (public.user_has_client_access(client_id, auth.uid()));
CREATE INDEX idx_ads_identity_status_client ON public.ads_identity_status(client_id, checked_at DESC);

-- 3) ads_campaigns: espelho campanhas Meta
CREATE TABLE public.ads_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  ads_account_id uuid REFERENCES public.ads_accounts(id) ON DELETE CASCADE,
  meta_campaign_id text NOT NULL,
  nome text NOT NULL,
  objetivo text,                                -- OUTCOME_LEADS, OUTCOME_AWARENESS, etc
  status text,                                  -- ACTIVE, PAUSED, ARCHIVED, DELETED
  special_ad_categories text[] DEFAULT '{}',
  is_political boolean DEFAULT false,
  daily_budget_cents integer,
  lifetime_budget_cents integer,
  start_time timestamptz,
  stop_time timestamptz,
  created_by_user_id uuid REFERENCES auth.users(id),
  guard_status text DEFAULT 'pending',          -- pending | passed | failed
  last_synced_at timestamptz DEFAULT now(),
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, meta_campaign_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_campaigns TO authenticated;
GRANT ALL ON public.ads_campaigns TO service_role;
ALTER TABLE public.ads_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client members manage campaigns" ON public.ads_campaigns
  FOR ALL TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()))
  WITH CHECK (public.user_has_client_access(client_id, auth.uid()));
CREATE INDEX idx_ads_campaigns_client ON public.ads_campaigns(client_id, status);

-- 4) ads_adsets
CREATE TABLE public.ads_adsets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.ads_campaigns(id) ON DELETE CASCADE,
  meta_adset_id text NOT NULL,
  nome text NOT NULL,
  status text,
  daily_budget_cents integer,
  targeting jsonb,
  optimization_goal text,
  billing_event text,
  start_time timestamptz,
  end_time timestamptz,
  last_synced_at timestamptz DEFAULT now(),
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, meta_adset_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_adsets TO authenticated;
GRANT ALL ON public.ads_adsets TO service_role;
ALTER TABLE public.ads_adsets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client members manage adsets" ON public.ads_adsets
  FOR ALL TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()))
  WITH CHECK (public.user_has_client_access(client_id, auth.uid()));
CREATE INDEX idx_ads_adsets_campaign ON public.ads_adsets(campaign_id);

-- 5) ads_creatives
CREATE TABLE public.ads_creatives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  adset_id uuid REFERENCES public.ads_adsets(id) ON DELETE CASCADE,
  meta_ad_id text,
  meta_creative_id text,
  nome text,
  copy_text text,
  copy_headline text,
  copy_description text,
  call_to_action text,
  image_url text,
  video_url text,
  gerado_por_ia boolean DEFAULT false,
  rotulo_ia_aplicado boolean DEFAULT false,
  status text,
  raw_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_creatives TO authenticated;
GRANT ALL ON public.ads_creatives TO service_role;
ALTER TABLE public.ads_creatives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client members manage creatives" ON public.ads_creatives
  FOR ALL TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()))
  WITH CHECK (public.user_has_client_access(client_id, auth.uid()));
CREATE INDEX idx_ads_creatives_adset ON public.ads_creatives(adset_id);

-- 6) ads_insights_daily: métricas diárias
CREATE TABLE public.ads_insights_daily (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  level text NOT NULL,                          -- account | campaign | adset | ad
  level_id text NOT NULL,                       -- meta id correspondente
  date date NOT NULL,
  spend_cents integer DEFAULT 0,
  impressions integer DEFAULT 0,
  reach integer DEFAULT 0,
  clicks integer DEFAULT 0,
  ctr numeric(8,4),
  cpc_cents integer,
  cpm_cents integer,
  leads integer DEFAULT 0,
  cpr_cents integer,                            -- custo por resultado
  conversions integer DEFAULT 0,
  raw_data jsonb,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, level, level_id, date)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ads_insights_daily TO authenticated;
GRANT ALL ON public.ads_insights_daily TO service_role;
ALTER TABLE public.ads_insights_daily ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client members view insights" ON public.ads_insights_daily
  FOR ALL TO authenticated
  USING (public.user_has_client_access(client_id, auth.uid()))
  WITH CHECK (public.user_has_client_access(client_id, auth.uid()));
CREATE INDEX idx_ads_insights_lookup ON public.ads_insights_daily(client_id, level, date DESC);

-- 7) ads_audit_log: log imutável (TSE)
CREATE TABLE public.ads_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id),
  action text NOT NULL,                         -- ex: create_campaign, edit_budget, publish_ad, guard_failed
  target_type text,                             -- campaign | adset | ad | account
  target_id text,
  details jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ads_audit_log TO authenticated;
GRANT ALL ON public.ads_audit_log TO service_role;
ALTER TABLE public.ads_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client members view audit log" ON public.ads_audit_log
  FOR SELECT TO authenticated USING (public.user_has_client_access(client_id, auth.uid()));
CREATE POLICY "Authenticated can insert audit log" ON public.ads_audit_log
  FOR INSERT TO authenticated WITH CHECK (public.user_has_client_access(client_id, auth.uid()));
CREATE INDEX idx_ads_audit_client_date ON public.ads_audit_log(client_id, created_at DESC);

-- 8) ads_guard_checks: histórico do Guard Eleitoral
CREATE TABLE public.ads_guard_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES public.ads_campaigns(id) ON DELETE CASCADE,
  creative_id uuid REFERENCES public.ads_creatives(id) ON DELETE CASCADE,
  triggered_by uuid REFERENCES auth.users(id),
  check_periodo boolean,
  check_categoria_politica boolean,
  check_disclaimer boolean,
  check_numero_cargo boolean,
  check_sem_adversario boolean,
  check_sem_termos_proibidos boolean,
  check_limite_tse boolean,
  check_identidade_valida boolean,
  check_rotulo_ia boolean,
  passed boolean NOT NULL DEFAULT false,
  failures jsonb DEFAULT '[]'::jsonb,
  warnings jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ads_guard_checks TO authenticated;
GRANT ALL ON public.ads_guard_checks TO service_role;
ALTER TABLE public.ads_guard_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client members view guard checks" ON public.ads_guard_checks
  FOR SELECT TO authenticated USING (public.user_has_client_access(client_id, auth.uid()));
CREATE POLICY "Client members insert guard checks" ON public.ads_guard_checks
  FOR INSERT TO authenticated WITH CHECK (public.user_has_client_access(client_id, auth.uid()));

-- 9) ads_tse_limits: limites legais TSE (tabela de referência pública para autenticados)
CREATE TABLE public.ads_tse_limits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano_eleicao integer NOT NULL,
  cargo text NOT NULL,                          -- presidente, governador, senador, dep_federal, dep_estadual, prefeito, vereador
  uf text,                                       -- NULL se nacional
  limite_total_cents bigint NOT NULL,
  limite_pre_campanha_cents bigint,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(ano_eleicao, cargo, uf)
);
GRANT SELECT ON public.ads_tse_limits TO authenticated;
GRANT ALL ON public.ads_tse_limits TO service_role;
ALTER TABLE public.ads_tse_limits ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read tse limits" ON public.ads_tse_limits
  FOR SELECT TO authenticated USING (true);

-- Triggers de updated_at
CREATE TRIGGER trg_ads_accounts_updated BEFORE UPDATE ON public.ads_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ads_campaigns_updated BEFORE UPDATE ON public.ads_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ads_adsets_updated BEFORE UPDATE ON public.ads_adsets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_ads_creatives_updated BEFORE UPDATE ON public.ads_creatives
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed inicial limites TSE 2026 (valores de referência — ajustáveis após publicação oficial pelo TSE)
INSERT INTO public.ads_tse_limits (ano_eleicao, cargo, uf, limite_total_cents, observacoes) VALUES
  (2026, 'presidente', NULL, 7500000000, 'Valor referencial — confirmar publicação oficial TSE'),
  (2026, 'governador', NULL, 0, 'Varia por UF conforme eleitorado — atualizar com tabela oficial TSE 2026'),
  (2026, 'senador', NULL, 0, 'Varia por UF — atualizar com tabela oficial TSE 2026'),
  (2026, 'dep_federal', NULL, 0, 'Varia por UF — atualizar com tabela oficial TSE 2026'),
  (2026, 'dep_estadual', NULL, 0, 'Varia por UF — atualizar com tabela oficial TSE 2026');
