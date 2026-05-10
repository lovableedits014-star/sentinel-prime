
ALTER TABLE public.tea_municipios_ms
  ADD COLUMN IF NOT EXISTS pop_0_5 integer,
  ADD COLUMN IF NOT EXISTS pop_6_14 integer,
  ADD COLUMN IF NOT EXISTS pop_15_17 integer,
  ADD COLUMN IF NOT EXISTS pop_18_mais integer,
  ADD COLUMN IF NOT EXISTS est_tea_0_5_min integer,
  ADD COLUMN IF NOT EXISTS est_tea_0_5_max integer,
  ADD COLUMN IF NOT EXISTS est_tea_6_14_min integer,
  ADD COLUMN IF NOT EXISTS est_tea_6_14_max integer,
  ADD COLUMN IF NOT EXISTS est_tea_15_17_min integer,
  ADD COLUMN IF NOT EXISTS est_tea_15_17_max integer,
  ADD COLUMN IF NOT EXISTS est_tea_adultos_min integer,
  ADD COLUMN IF NOT EXISTS est_tea_adultos_max integer,
  ADD COLUMN IF NOT EXISTS est_tea_homens_min integer,
  ADD COLUMN IF NOT EXISTS est_tea_homens_max integer,
  ADD COLUMN IF NOT EXISTS est_tea_mulheres_min integer,
  ADD COLUMN IF NOT EXISTS est_tea_mulheres_max integer,
  ADD COLUMN IF NOT EXISTS matriculas_tea_municipal integer,
  ADD COLUMN IF NOT EXISTS matriculas_tea_estadual integer,
  ADD COLUMN IF NOT EXISTS matriculas_tea_privada integer,
  ADD COLUMN IF NOT EXISTS matriculas_tea_creche integer,
  ADD COLUMN IF NOT EXISTS matriculas_tea_fundamental integer,
  ADD COLUMN IF NOT EXISTS matriculas_tea_medio integer,
  ADD COLUMN IF NOT EXISTS escolas_com_aee integer,
  ADD COLUMN IF NOT EXISTS profs_aee integer,
  ADD COLUMN IF NOT EXISTS gap_escolar_real_min integer,
  ADD COLUMN IF NOT EXISTS gap_escolar_real_max integer,
  ADD COLUMN IF NOT EXISTS pct_cobertura_escolar numeric,
  ADD COLUMN IF NOT EXISTS caps_i_qtd integer,
  ADD COLUMN IF NOT EXISTS caps_ii_qtd integer,
  ADD COLUMN IF NOT EXISTS caps_iii_qtd integer,
  ADD COLUMN IF NOT EXISTS caps_ad_qtd integer,
  ADD COLUMN IF NOT EXISTS cer_qtd integer,
  ADD COLUMN IF NOT EXISTS ubs_qtd integer,
  ADD COLUMN IF NOT EXISTS pediatras_qtd integer,
  ADD COLUMN IF NOT EXISTS psicologos_qtd integer,
  ADD COLUMN IF NOT EXISTS fonoaudiologos_qtd integer,
  ADD COLUMN IF NOT EXISTS terapeutas_ocup_qtd integer,
  ADD COLUMN IF NOT EXISTS tempo_diag_estimado_meses integer,
  ADD COLUMN IF NOT EXISTS bpc_def_0_17 integer,
  ADD COLUMN IF NOT EXISTS bpc_def_pct_estimado_tea numeric,
  ADD COLUMN IF NOT EXISTS cras_qtd integer,
  ADD COLUMN IF NOT EXISTS creas_qtd integer,
  ADD COLUMN IF NOT EXISTS lei_ciptea boolean,
  ADD COLUMN IF NOT EXISTS lei_ciptea_numero text,
  ADD COLUMN IF NOT EXISTS lei_fila_zero boolean,
  ADD COLUMN IF NOT EXISTS centro_referencia_tea boolean,
  ADD COLUMN IF NOT EXISTS politica_capacitacao boolean,
  ADD COLUMN IF NOT EXISTS legislacao_atualizado_em timestamp with time zone;

CREATE TABLE IF NOT EXISTS public.tea_legislacao_municipal (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_ibge bigint NOT NULL,
  municipio text NOT NULL,
  uf text NOT NULL,
  tipo text NOT NULL,
  numero text,
  ano integer,
  ementa text,
  url_fonte text,
  status text DEFAULT 'auto',
  encontrado_via text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

ALTER TABLE public.tea_legislacao_municipal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tea_leis_select_authenticated" ON public.tea_legislacao_municipal;
CREATE POLICY "tea_leis_select_authenticated"
  ON public.tea_legislacao_municipal FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "tea_leis_modify_authenticated" ON public.tea_legislacao_municipal;
CREATE POLICY "tea_leis_modify_authenticated"
  ON public.tea_legislacao_municipal FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_tea_leis_ibge ON public.tea_legislacao_municipal(codigo_ibge);
CREATE INDEX IF NOT EXISTS idx_tea_leis_tipo ON public.tea_legislacao_municipal(tipo);

CREATE TABLE IF NOT EXISTS public.tea_fonte_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_ibge bigint NOT NULL,
  fonte text NOT NULL,
  payload jsonb NOT NULL,
  coletado_em timestamp with time zone DEFAULT now(),
  UNIQUE (codigo_ibge, fonte)
);
ALTER TABLE public.tea_fonte_cache ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tea_cache_select_authenticated" ON public.tea_fonte_cache;
CREATE POLICY "tea_cache_select_authenticated"
  ON public.tea_fonte_cache FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.tea_ranking_ms(p_codigo_ibge bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  resultado jsonb := '{}'::jsonb;
  total_munis integer;
BEGIN
  SELECT count(*) INTO total_munis FROM tea_municipios_ms WHERE uf='MS';

  WITH base AS (
    SELECT codigo_ibge, nome, populacao, est_tea_total_max, capsi_qtd, caps_qtd, hab_por_caps,
           pct_cobertura_escolar, bpc_def_qtd, bpc_def_pct_estimado_tea,
           CASE WHEN lei_ciptea THEN 1 ELSE 0 END AS tem_ciptea
    FROM tea_municipios_ms WHERE uf='MS'
  ),
  rk AS (
    SELECT codigo_ibge,
      RANK() OVER (ORDER BY populacao DESC NULLS LAST) AS rk_pop,
      RANK() OVER (ORDER BY est_tea_total_max DESC NULLS LAST) AS rk_tea,
      RANK() OVER (ORDER BY capsi_qtd DESC NULLS LAST) AS rk_capsi,
      RANK() OVER (ORDER BY caps_qtd DESC NULLS LAST) AS rk_caps,
      RANK() OVER (ORDER BY hab_por_caps ASC NULLS LAST) AS rk_hab_por_caps,
      RANK() OVER (ORDER BY pct_cobertura_escolar DESC NULLS LAST) AS rk_cob_escolar,
      RANK() OVER (ORDER BY bpc_def_pct_estimado_tea DESC NULLS LAST) AS rk_bpc_cob
    FROM base
  )
  SELECT jsonb_build_object(
    'total_municipios', total_munis,
    'rank_populacao', rk.rk_pop,
    'rank_tea_estimado', rk.rk_tea,
    'rank_capsi', rk.rk_capsi,
    'rank_caps', rk.rk_caps,
    'rank_habitantes_por_caps', rk.rk_hab_por_caps,
    'rank_cobertura_escolar', rk.rk_cob_escolar,
    'rank_cobertura_bpc', rk.rk_bpc_cob,
    'media_estado', (SELECT jsonb_build_object(
      'capsi_qtd', AVG(capsi_qtd)::numeric(10,2),
      'caps_qtd', AVG(caps_qtd)::numeric(10,2),
      'hab_por_caps', AVG(hab_por_caps)::numeric(10,2),
      'pct_cobertura_escolar', AVG(pct_cobertura_escolar)::numeric(10,2),
      'bpc_def_pct_estimado_tea', AVG(bpc_def_pct_estimado_tea)::numeric(10,2)
    ) FROM base)
  ) INTO resultado
  FROM rk WHERE rk.codigo_ibge = p_codigo_ibge;

  RETURN COALESCE(resultado, '{}'::jsonb);
END;
$$;
