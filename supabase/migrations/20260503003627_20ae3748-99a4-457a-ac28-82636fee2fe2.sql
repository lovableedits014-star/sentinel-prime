-- 94: tse_votacao_zona
CREATE TABLE public.tse_votacao_zona (
  id BIGSERIAL PRIMARY KEY,
  ano INT NOT NULL, turno INT NOT NULL, cargo TEXT NOT NULL,
  cod_municipio INT NOT NULL, municipio TEXT NOT NULL, uf TEXT NOT NULL,
  zona INT NOT NULL, numero INT, nome_urna TEXT, nome_completo TEXT,
  partido TEXT, situacao TEXT, votos INT NOT NULL DEFAULT 0,
  UNIQUE (ano, turno, cargo, cod_municipio, zona, numero)
);
CREATE INDEX idx_tse_vot_mun_cargo ON public.tse_votacao_zona(cod_municipio, ano, cargo, turno);
CREATE INDEX idx_tse_vot_uf ON public.tse_votacao_zona(uf, ano);
ALTER TABLE public.tse_votacao_zona ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tse_vot_public_read" ON public.tse_votacao_zona FOR SELECT USING (true);

-- 99: tse_votacao_local + bairro
CREATE TABLE public.tse_votacao_local (
  id BIGSERIAL PRIMARY KEY,
  ano INT NOT NULL, turno INT NOT NULL, cargo TEXT NOT NULL,
  cod_municipio INT NOT NULL, municipio TEXT NOT NULL, uf TEXT NOT NULL,
  zona INT NOT NULL, nr_local INT NOT NULL,
  nome_local TEXT, endereco TEXT, bairro TEXT,
  numero INT NOT NULL, nome_candidato TEXT,
  votos INT NOT NULL DEFAULT 0,
  UNIQUE (ano, turno, cargo, cod_municipio, zona, nr_local, numero)
);
CREATE INDEX idx_tse_local_municipio ON public.tse_votacao_local (cod_municipio, cargo, turno);
CREATE INDEX idx_tse_local_zona ON public.tse_votacao_local (zona, nr_local);
CREATE INDEX idx_tse_local_bairro ON public.tse_votacao_local (bairro) WHERE bairro IS NOT NULL;
ALTER TABLE public.tse_votacao_local ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can read TSE local data" ON public.tse_votacao_local FOR SELECT TO public USING (true);

CREATE FUNCTION public.get_tse_locais_summary(p_cargo text, p_turno int)
RETURNS TABLE (zona int, nr_local int, nome_local text, endereco text, bairro text, total_votos bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public AS $$
  SELECT zona, nr_local, MAX(nome_local), MAX(endereco), MAX(bairro), SUM(votos)::bigint
  FROM public.tse_votacao_local WHERE cargo = p_cargo AND turno = p_turno
  GROUP BY zona, nr_local ORDER BY SUM(votos) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_tse_locais_summary(text, int) TO anon, authenticated;

-- 104: candidate_identity
CREATE TABLE public.candidate_identity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  logo_url text, logo_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.candidate_identity ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Team members manage candidate_identity" ON public.candidate_identity FOR ALL TO authenticated
  USING (client_id IN (SELECT tm.client_id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active') OR public.is_super_admin())
  WITH CHECK (client_id IN (SELECT tm.client_id FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active') OR public.is_super_admin());
CREATE POLICY "Client owner manage candidate_identity" ON public.candidate_identity FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = candidate_identity.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = candidate_identity.client_id AND clients.user_id = auth.uid()));
CREATE TRIGGER trg_candidate_identity_updated_at BEFORE UPDATE ON public.candidate_identity
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO storage.buckets (id, name, public) VALUES ('candidate-identity', 'candidate-identity', true) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Public read candidate-identity" ON storage.objects FOR SELECT USING (bucket_id = 'candidate-identity');
CREATE POLICY "Team upload candidate-identity" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'candidate-identity' AND ((storage.foldername(name))[1] IN
  (SELECT tm.client_id::text FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active')
  OR public.is_super_admin()));
CREATE POLICY "Team update candidate-identity" ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'candidate-identity' AND ((storage.foldername(name))[1] IN
  (SELECT tm.client_id::text FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active')
  OR public.is_super_admin()));
CREATE POLICY "Team delete candidate-identity" ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'candidate-identity' AND ((storage.foldername(name))[1] IN
  (SELECT tm.client_id::text FROM public.team_members tm WHERE tm.user_id = auth.uid() AND tm.status = 'active')
  OR public.is_super_admin()));

-- 106: índices + get_chapa_candidates
CREATE INDEX idx_tse_vot_ano_cargo_partido ON public.tse_votacao_zona (ano, cargo, partido);
CREATE INDEX idx_tse_vot_ano_uf_municipio ON public.tse_votacao_zona (ano, uf, municipio);
CREATE INDEX idx_tse_vot_nome_completo ON public.tse_votacao_zona (lower(nome_completo));

CREATE OR REPLACE FUNCTION public.get_chapa_candidates(
  p_uf text DEFAULT NULL, p_municipio text DEFAULT NULL,
  p_anos int[] DEFAULT ARRAY[2022, 2024], p_cargos text[] DEFAULT NULL,
  p_partido text DEFAULT NULL, p_min_votos int DEFAULT 0, p_search text DEFAULT NULL)
RETURNS TABLE (nome_completo text, nome_urna text, partido text, cargos text, ufs text,
  municipios text, votos_2022 bigint, votos_2024 bigint, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT lower(public.unaccent(coalesce(nome_completo, nome_urna, ''))) || '|' || coalesce(partido, '') AS chave,
      max(coalesce(nome_completo, nome_urna)) AS nome_completo,
      max(nome_urna) AS nome_urna, max(partido) AS partido,
      string_agg(DISTINCT cargo, ', ' ORDER BY cargo) AS cargos,
      string_agg(DISTINCT uf, ', ' ORDER BY uf) AS ufs,
      string_agg(DISTINCT municipio, ', ' ORDER BY municipio) AS municipios,
      sum(CASE WHEN ano = 2022 THEN votos ELSE 0 END)::bigint AS votos_2022,
      sum(CASE WHEN ano = 2024 THEN votos ELSE 0 END)::bigint AS votos_2024,
      sum(votos)::bigint AS total
    FROM public.tse_votacao_zona
    WHERE ano = ANY(p_anos)
      AND (p_uf IS NULL OR uf = p_uf)
      AND (p_municipio IS NULL OR municipio = p_municipio)
      AND (p_cargos IS NULL OR cargo = ANY(p_cargos))
      AND (p_partido IS NULL OR partido = p_partido)
      AND (p_search IS NULL OR p_search = '' OR
        lower(public.unaccent(coalesce(nome_completo, '') || ' ' || coalesce(nome_urna, ''))) LIKE '%' || lower(public.unaccent(p_search)) || '%')
      AND nome_completo IS NOT NULL
    GROUP BY chave
  )
  SELECT nome_completo, nome_urna, partido, cargos, ufs, municipios, votos_2022, votos_2024, total
  FROM base WHERE total >= COALESCE(p_min_votos, 0) ORDER BY total DESC LIMIT 5000;
$$;
GRANT EXECUTE ON FUNCTION public.get_chapa_candidates(text, text, int[], text[], text, int, text) TO anon, authenticated;

-- 108: get_candidate_breakdown
CREATE OR REPLACE FUNCTION public.get_candidate_breakdown(
  p_nome text, p_partido text DEFAULT NULL,
  p_anos int[] DEFAULT ARRAY[2022,2024], p_uf text DEFAULT NULL, p_cargo text DEFAULT NULL)
RETURNS TABLE (uf text, municipio text, cargo text, ano int, partido text, nome_urna text, votos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.uf, t.municipio, t.cargo, t.ano, max(t.partido), max(t.nome_urna), sum(t.votos)::bigint
  FROM public.tse_votacao_zona t
  WHERE t.ano = ANY(p_anos)
    AND lower(unaccent(t.nome_completo)) = lower(unaccent(p_nome))
    AND (p_partido IS NULL OR t.partido = p_partido)
    AND (p_uf IS NULL OR t.uf = p_uf)
    AND (p_cargo IS NULL OR t.cargo = p_cargo)
  GROUP BY t.uf, t.municipio, t.cargo, t.ano ORDER BY sum(t.votos) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_candidate_breakdown(text, text, int[], text, text) TO anon, authenticated;

-- 109: get_tse_municipios + get_tse_partidos
CREATE OR REPLACE FUNCTION public.get_tse_municipios()
RETURNS TABLE (uf text, municipio text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT uf, municipio FROM public.tse_votacao_zona
  WHERE uf IS NOT NULL AND municipio IS NOT NULL ORDER BY uf, municipio;
$$;
CREATE OR REPLACE FUNCTION public.get_tse_partidos()
RETURNS TABLE (partido text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT partido FROM public.tse_votacao_zona
  WHERE partido IS NOT NULL AND partido <> '' ORDER BY partido;
$$;
GRANT EXECUTE ON FUNCTION public.get_tse_municipios() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_tse_partidos() TO anon, authenticated;

-- 110: get_partido_evolucao + get_migracoes_partidarias
CREATE OR REPLACE FUNCTION public.get_partido_evolucao(p_uf text DEFAULT NULL, p_cargo text DEFAULT NULL)
RETURNS TABLE (partido text, votos_2022 bigint, votos_2024 bigint, candidatos_2022 bigint,
  candidatos_2024 bigint, municipios_2022 bigint, municipios_2024 bigint, variacao_votos bigint, variacao_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT partido, ano, sum(votos)::bigint AS votos,
      count(DISTINCT lower(unaccent(coalesce(nome_completo, nome_urna, '')))) AS candidatos,
      count(DISTINCT municipio) AS municipios
    FROM public.tse_votacao_zona
    WHERE partido IS NOT NULL AND partido <> '' AND ano IN (2022, 2024)
      AND (p_uf IS NULL OR uf = p_uf) AND (p_cargo IS NULL OR cargo = p_cargo)
    GROUP BY partido, ano
  ), agg AS (
    SELECT partido,
      coalesce(sum(CASE WHEN ano = 2022 THEN votos END), 0)::bigint AS votos_2022,
      coalesce(sum(CASE WHEN ano = 2024 THEN votos END), 0)::bigint AS votos_2024,
      coalesce(sum(CASE WHEN ano = 2022 THEN candidatos END), 0)::bigint AS candidatos_2022,
      coalesce(sum(CASE WHEN ano = 2024 THEN candidatos END), 0)::bigint AS candidatos_2024,
      coalesce(sum(CASE WHEN ano = 2022 THEN municipios END), 0)::bigint AS municipios_2022,
      coalesce(sum(CASE WHEN ano = 2024 THEN municipios END), 0)::bigint AS municipios_2024
    FROM base GROUP BY partido
  )
  SELECT partido, votos_2022, votos_2024, candidatos_2022, candidatos_2024,
    municipios_2022, municipios_2024, (votos_2024 - votos_2022)::bigint,
    CASE WHEN votos_2022 = 0 AND votos_2024 > 0 THEN NULL
      WHEN votos_2022 = 0 THEN 0
      ELSE round(((votos_2024 - votos_2022)::numeric / votos_2022::numeric) * 100, 2) END
  FROM agg ORDER BY (votos_2022 + votos_2024) DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_partido_evolucao(text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_migracoes_partidarias(p_uf text DEFAULT NULL, p_min_votos integer DEFAULT 100)
RETURNS TABLE (nome_completo text, partido_2022 text, partido_2024 text, cargo_2022 text,
  cargo_2024 text, votos_2022 bigint, votos_2024 bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT lower(unaccent(coalesce(nome_completo, nome_urna, ''))) AS chave,
      max(coalesce(nome_completo, nome_urna)) AS nome_completo, ano, partido,
      string_agg(DISTINCT cargo, ', ' ORDER BY cargo) AS cargos,
      sum(votos)::bigint AS votos
    FROM public.tse_votacao_zona
    WHERE partido IS NOT NULL AND partido <> '' AND ano IN (2022, 2024)
      AND nome_completo IS NOT NULL AND (p_uf IS NULL OR uf = p_uf)
    GROUP BY chave, ano, partido
  ), pivot AS (
    SELECT chave, max(nome_completo) AS nome_completo,
      max(CASE WHEN ano = 2022 THEN partido END) AS partido_2022,
      max(CASE WHEN ano = 2024 THEN partido END) AS partido_2024,
      max(CASE WHEN ano = 2022 THEN cargos END) AS cargo_2022,
      max(CASE WHEN ano = 2024 THEN cargos END) AS cargo_2024,
      coalesce(sum(CASE WHEN ano = 2022 THEN votos END), 0)::bigint AS votos_2022,
      coalesce(sum(CASE WHEN ano = 2024 THEN votos END), 0)::bigint AS votos_2024
    FROM base GROUP BY chave
  )
  SELECT nome_completo, partido_2022, partido_2024, cargo_2022, cargo_2024, votos_2022, votos_2024
  FROM pivot WHERE partido_2022 IS NOT NULL AND partido_2024 IS NOT NULL
    AND partido_2022 <> partido_2024
    AND (votos_2022 + votos_2024) >= COALESCE(p_min_votos, 0)
  ORDER BY (votos_2022 + votos_2024) DESC LIMIT 2000;
$$;
GRANT EXECUTE ON FUNCTION public.get_migracoes_partidarias(text, integer) TO anon, authenticated;

-- 111: get_votos_por_municipio
CREATE OR REPLACE FUNCTION public.get_votos_por_municipio(
  p_anos integer[] DEFAULT ARRAY[2022, 2024], p_partido text DEFAULT NULL,
  p_uf text DEFAULT NULL, p_cargo text DEFAULT NULL)
RETURNS TABLE(uf text, municipio text, votos_2022 bigint, votos_2024 bigint,
  total bigint, candidatos bigint, partidos bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT uf, municipio,
    COALESCE(SUM(CASE WHEN ano = 2022 THEN votos END), 0)::bigint,
    COALESCE(SUM(CASE WHEN ano = 2024 THEN votos END), 0)::bigint,
    SUM(votos)::bigint,
    COUNT(DISTINCT lower(public.unaccent(coalesce(nome_completo, nome_urna, ''))))::bigint,
    COUNT(DISTINCT partido)::bigint
  FROM public.tse_votacao_zona
  WHERE ano = ANY(p_anos) AND (p_partido IS NULL OR partido = p_partido)
    AND (p_uf IS NULL OR uf = p_uf) AND (p_cargo IS NULL OR cargo = p_cargo)
    AND uf IS NOT NULL AND municipio IS NOT NULL
  GROUP BY uf, municipio ORDER BY SUM(votos) DESC LIMIT 5000;
$$;

-- 112: media_alert_rules + media_alert_events (uso clients.user_id em vez de profiles.client_id)
CREATE TABLE public.media_alert_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  uf TEXT, municipio TEXT,
  country TEXT NOT NULL DEFAULT 'BR',
  language TEXT, domains TEXT[] DEFAULT '{}', exclude_terms TEXT[] DEFAULT '{}',
  timespan TEXT NOT NULL DEFAULT '6h',
  alert_type TEXT NOT NULL DEFAULT 'both' CHECK (alert_type IN ('volume','sentiment','both')),
  min_volume INTEGER NOT NULL DEFAULT 10,
  volume_growth_pct NUMERIC NOT NULL DEFAULT 100,
  negative_tone_threshold NUMERIC NOT NULL DEFAULT -2.0,
  negative_ratio_threshold NUMERIC NOT NULL DEFAULT 0.5,
  cooldown_minutes INTEGER NOT NULL DEFAULT 120,
  last_checked_at TIMESTAMPTZ, last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_alert_rules_client ON public.media_alert_rules(client_id);
CREATE INDEX idx_media_alert_rules_active ON public.media_alert_rules(is_active) WHERE is_active = true;
ALTER TABLE public.media_alert_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner manage media rules" ON public.media_alert_rules FOR ALL
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = media_alert_rules.client_id AND clients.user_id = auth.uid()) OR public.is_super_admin())
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = media_alert_rules.client_id AND clients.user_id = auth.uid()) OR public.is_super_admin());
CREATE TRIGGER trg_media_alert_rules_updated_at BEFORE UPDATE ON public.media_alert_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.media_alert_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.media_alert_rules(id) ON DELETE CASCADE,
  rule_name TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trigger_kind TEXT NOT NULL CHECK (trigger_kind IN ('volume_spike','negative_sentiment','both')),
  severity TEXT NOT NULL DEFAULT 'aviso' CHECK (severity IN ('info','aviso','critico')),
  total_articles INTEGER NOT NULL DEFAULT 0,
  previous_articles INTEGER, growth_pct NUMERIC, avg_tone NUMERIC,
  negatives INTEGER NOT NULL DEFAULT 0, positives INTEGER NOT NULL DEFAULT 0,
  neutrals INTEGER NOT NULL DEFAULT 0, negative_ratio NUMERIC,
  query_snapshot TEXT, sample_articles JSONB DEFAULT '[]'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  read_at TIMESTAMPTZ, read_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_alert_events_client ON public.media_alert_events(client_id, triggered_at DESC);
CREATE INDEX idx_media_alert_events_rule ON public.media_alert_events(rule_id, triggered_at DESC);
CREATE INDEX idx_media_alert_events_unread ON public.media_alert_events(client_id, is_read) WHERE is_read = false;
ALTER TABLE public.media_alert_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner view media events" ON public.media_alert_events FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = media_alert_events.client_id AND clients.user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "Client owner update media events" ON public.media_alert_events FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = media_alert_events.client_id AND clients.user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "Client owner delete media events" ON public.media_alert_events FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = media_alert_events.client_id AND clients.user_id = auth.uid()) OR public.is_super_admin());

-- 113: media_saved_searches
CREATE TABLE public.media_saved_searches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL, terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  uf TEXT, municipio TEXT,
  timespan TEXT NOT NULL DEFAULT '7d',
  country TEXT NOT NULL DEFAULT 'BR',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_media_saved_searches_client ON public.media_saved_searches(client_id, created_at DESC);
ALTER TABLE public.media_saved_searches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users view own client saved searches" ON public.media_saved_searches FOR SELECT TO authenticated
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));
CREATE POLICY "users insert own saved searches" ON public.media_saved_searches FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));
CREATE POLICY "users update own saved searches" ON public.media_saved_searches FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users delete own saved searches" ON public.media_saved_searches FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE TRIGGER update_media_saved_searches_updated_at BEFORE UPDATE ON public.media_saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();