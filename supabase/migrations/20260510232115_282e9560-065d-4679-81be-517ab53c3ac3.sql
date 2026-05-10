
-- Tabela com dados TEA (autismo) por município de MS.
-- Estimativas: CDC 2023 ≈ 1:36 (2,8%) e OMS ≈ 1:100 (1,0%).
-- Dados de cobertura (matrículas INEP, CAPS CNES) coletados via edge function.

CREATE TABLE IF NOT EXISTS public.tea_municipios_ms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_ibge BIGINT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  uf TEXT NOT NULL DEFAULT 'MS',
  populacao BIGINT,
  populacao_ano INTEGER,
  -- Estimativas calculadas
  est_tea_total_min INTEGER,   -- preval. OMS 1%
  est_tea_total_max INTEGER,   -- preval. CDC 2,8%
  est_tea_0_17_min INTEGER,
  est_tea_0_17_max INTEGER,
  -- Cobertura (real, quando disponível)
  matriculas_tea_inep INTEGER,
  matriculas_tea_ano INTEGER,
  capsi_qtd INTEGER DEFAULT 0,    -- CAPS Infantojuvenil
  caps_qtd INTEGER DEFAULT 0,     -- Total CAPS (todos tipos)
  bpc_def_qtd INTEGER,            -- Beneficiários BPC por deficiência
  -- Indicadores derivados
  gap_escolar_min INTEGER,        -- est_tea_0_17_min - matriculas
  gap_escolar_max INTEGER,
  hab_por_caps NUMERIC,
  -- Metadados
  fonte_json JSONB DEFAULT '{}'::jsonb,
  observacoes TEXT,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tea_ms_uf ON public.tea_municipios_ms(uf);
CREATE INDEX IF NOT EXISTS idx_tea_ms_pop ON public.tea_municipios_ms(populacao DESC);

ALTER TABLE public.tea_municipios_ms ENABLE ROW LEVEL SECURITY;

-- Dados públicos: qualquer usuário autenticado lê
CREATE POLICY "tea_ms_read_authenticated"
  ON public.tea_municipios_ms FOR SELECT
  TO authenticated
  USING (true);

-- Apenas service_role (edge function) escreve
-- (sem policy de INSERT/UPDATE/DELETE para usuários comuns)

-- Log de sincronização TEA
CREATE TABLE IF NOT EXISTS public.tea_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uf TEXT NOT NULL DEFAULT 'MS',
  status TEXT NOT NULL,                  -- 'success' | 'partial' | 'error'
  municipios_processados INTEGER DEFAULT 0,
  caps_coletados INTEGER DEFAULT 0,
  erros JSONB DEFAULT '[]'::jsonb,
  duracao_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tea_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tea_sync_log_read_authenticated"
  ON public.tea_sync_log FOR SELECT
  TO authenticated
  USING (true);
