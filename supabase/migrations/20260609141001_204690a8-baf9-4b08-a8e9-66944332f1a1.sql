
-- Update tele_ranking_indicadores: meta vem de eleicao_indicacao_config / contratados.quota_indicados
CREATE OR REPLACE FUNCTION public.tele_ranking_indicadores(
  _client_id uuid,
  _campanha_id uuid DEFAULT NULL,
  _data_de timestamptz DEFAULT NULL,
  _data_ate timestamptz DEFAULT NULL,
  _universo text DEFAULT 'eleicao'
)
RETURNS TABLE(
  pessoa_id uuid,
  pessoa_nome text,
  pessoa_tipo text,
  cidade text,
  bairro text,
  coordenador_id uuid,
  coordenador_nome text,
  filhos_count integer,
  indicados_diretos integer,
  indicados_total integer,
  ligados integer,
  confirmados integer,
  indecisos integer,
  rejeitados integer,
  pendentes integer,
  taxa_conversao numeric,
  meta integer,
  ultima_atividade timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_meta_coord int;
  v_meta_lider int;
  v_meta_cabo int;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.clients WHERE id=_client_id AND user_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members WHERE client_id=_client_id AND user_id=auth.uid() AND status='active')
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT COALESCE(cfg.meta_coordenador, 30), COALESCE(cfg.meta_lider, 30), COALESCE(cfg.meta_cabo, 5)
    INTO v_meta_coord, v_meta_lider, v_meta_cabo
  FROM public.eleicao_indicacao_config cfg
  WHERE cfg.client_id = _client_id;
  v_meta_coord := COALESCE(v_meta_coord, 30);
  v_meta_lider := COALESCE(v_meta_lider, 30);
  v_meta_cabo  := COALESCE(v_meta_cabo, 5);

  IF _universo = 'eleicao' THEN
    RETURN QUERY
    WITH base_ind AS (
      SELECT ei.*
      FROM public.eleicao_indicados ei
      WHERE ei.client_id = _client_id
        AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
        AND (_data_de IS NULL OR ei.created_at >= _data_de)
        AND (_data_ate IS NULL OR ei.created_at <= _data_ate)
    ),
    direto AS (
      SELECT indicador_id AS pid,
             count(*) AS qtd,
             count(*) FILTER (WHERE ultimo_status_ligacao IS NOT NULL AND ultimo_status_ligacao <> 'pendente') AS lig,
             count(*) FILTER (WHERE vota_candidato = 'sim') AS conf,
             count(*) FILTER (WHERE vota_candidato = 'indeciso') AS ind,
             count(*) FILTER (WHERE vota_candidato = 'nao') AS rej,
             max(ultima_ligacao_em) AS ult
      FROM base_ind
      WHERE indicador_id IS NOT NULL
      GROUP BY indicador_id
    ),
    pessoas AS (
      SELECT p.id, p.nome, p.tipo::text AS tipo, p.cidade, p.bairro, p.parent_id
      FROM public.eleicao_pessoas p
      WHERE p.client_id = _client_id
    ),
    filhos AS (
      SELECT parent_id AS pid, count(*)::int AS qt
      FROM pessoas WHERE parent_id IS NOT NULL
      GROUP BY parent_id
    ),
    rollup AS (
      SELECT p.id AS pid,
        COALESCE((SELECT sum(d.qtd) FROM direto d WHERE d.pid = p.id OR d.pid IN (SELECT id FROM pessoas WHERE parent_id = p.id)), 0)::int AS qtd,
        COALESCE((SELECT sum(d.lig) FROM direto d WHERE d.pid = p.id OR d.pid IN (SELECT id FROM pessoas WHERE parent_id = p.id)), 0)::int AS lig,
        COALESCE((SELECT sum(d.conf) FROM direto d WHERE d.pid = p.id OR d.pid IN (SELECT id FROM pessoas WHERE parent_id = p.id)), 0)::int AS conf,
        COALESCE((SELECT sum(d.ind) FROM direto d WHERE d.pid = p.id OR d.pid IN (SELECT id FROM pessoas WHERE parent_id = p.id)), 0)::int AS ind,
        COALESCE((SELECT sum(d.rej) FROM direto d WHERE d.pid = p.id OR d.pid IN (SELECT id FROM pessoas WHERE parent_id = p.id)), 0)::int AS rej,
        (SELECT max(d.ult) FROM direto d WHERE d.pid = p.id OR d.pid IN (SELECT id FROM pessoas WHERE parent_id = p.id)) AS ult
      FROM pessoas p
    )
    SELECT
      p.id, p.nome, p.tipo, p.cidade, p.bairro,
      p.parent_id, parent.nome,
      COALESCE(f.qt, 0),
      COALESCE(d.qtd, 0)::int,
      r.qtd, r.lig, r.conf, r.ind, r.rej,
      GREATEST(r.qtd - r.lig, 0),
      CASE WHEN r.lig > 0 THEN round((r.conf::numeric / r.lig::numeric) * 100, 1) ELSE NULL END,
      CASE WHEN p.tipo = 'coordenador' THEN v_meta_coord ELSE v_meta_lider END,
      r.ult
    FROM pessoas p
    LEFT JOIN pessoas parent ON parent.id = p.parent_id
    LEFT JOIN filhos f ON f.pid = p.id
    LEFT JOIN direto d ON d.pid = p.id
    LEFT JOIN rollup r ON r.pid = p.id
    ORDER BY r.conf DESC NULLS LAST, r.lig DESC NULLS LAST, p.nome;

  ELSE
    RETURN QUERY
    WITH base_ind AS (
      SELECT ci.*
      FROM public.contratado_indicados ci
      WHERE ci.client_id = _client_id
        AND (_campanha_id IS NULL OR ci.campanha_id = _campanha_id)
        AND (_data_de IS NULL OR ci.created_at >= _data_de)
        AND (_data_ate IS NULL OR ci.created_at <= _data_ate)
    ),
    direto AS (
      SELECT contratado_id AS pid,
             count(*) AS qtd,
             count(*) FILTER (WHERE ligacao_status IS NOT NULL AND ligacao_status <> 'pendente') AS lig,
             count(*) FILTER (WHERE vota_candidato = 'sim') AS conf,
             count(*) FILTER (WHERE vota_candidato = 'indeciso') AS ind,
             count(*) FILTER (WHERE vota_candidato = 'nao') AS rej,
             max(ligacao_em) AS ult
      FROM base_ind
      WHERE contratado_id IS NOT NULL
      GROUP BY contratado_id
    ),
    pessoas AS (
      SELECT c.id, c.nome, CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END AS tipo,
             c.cidade, c.bairro, c.lider_id AS parent_id, c.is_lider,
             COALESCE(c.quota_indicados, v_meta_cabo) AS quota
      FROM public.contratados c
      WHERE c.client_id = _client_id
    ),
    filhos AS (
      SELECT parent_id AS pid, count(*)::int AS qt
      FROM pessoas WHERE parent_id IS NOT NULL
      GROUP BY parent_id
    ),
    rollup AS (
      SELECT p.id AS pid,
        COALESCE((SELECT sum(d.qtd) FROM direto d WHERE d.pid = p.id OR (p.is_lider AND d.pid IN (SELECT id FROM pessoas WHERE parent_id = p.id))), 0)::int AS qtd,
        COALESCE((SELECT sum(d.lig) FROM direto d WHERE d.pid = p.id OR (p.is_lider AND d.pid IN (SELECT id FROM pessoas WHERE parent_id = p.id))), 0)::int AS lig,
        COALESCE((SELECT sum(d.conf) FROM direto d WHERE d.pid = p.id OR (p.is_lider AND d.pid IN (SELECT id FROM pessoas WHERE parent_id = p.id))), 0)::int AS conf,
        COALESCE((SELECT sum(d.ind) FROM direto d WHERE d.pid = p.id OR (p.is_lider AND d.pid IN (SELECT id FROM pessoas WHERE parent_id = p.id))), 0)::int AS ind,
        COALESCE((SELECT sum(d.rej) FROM direto d WHERE d.pid = p.id OR (p.is_lider AND d.pid IN (SELECT id FROM pessoas WHERE parent_id = p.id))), 0)::int AS rej,
        (SELECT max(d.ult) FROM direto d WHERE d.pid = p.id OR (p.is_lider AND d.pid IN (SELECT id FROM pessoas WHERE parent_id = p.id))) AS ult
      FROM pessoas p
    )
    SELECT
      p.id, p.nome, p.tipo, p.cidade, p.bairro,
      p.parent_id, parent.nome,
      COALESCE(f.qt, 0),
      COALESCE(d.qtd, 0)::int,
      r.qtd, r.lig, r.conf, r.ind, r.rej,
      GREATEST(r.qtd - r.lig, 0),
      CASE WHEN r.lig > 0 THEN round((r.conf::numeric / r.lig::numeric) * 100, 1) ELSE NULL END,
      CASE WHEN p.is_lider THEN v_meta_lider ELSE p.quota::int END,
      r.ult
    FROM pessoas p
    LEFT JOIN pessoas parent ON parent.id = p.parent_id
    LEFT JOIN filhos f ON f.pid = p.id
    LEFT JOIN direto d ON d.pid = p.id
    LEFT JOIN rollup r ON r.pid = p.id
    ORDER BY r.conf DESC NULLS LAST, r.lig DESC NULLS LAST, p.nome;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_ranking_indicadores(uuid, uuid, timestamptz, timestamptz, text) TO authenticated;

-- Nova RPC: lista de indicados de uma pessoa específica
CREATE OR REPLACE FUNCTION public.tele_ranking_indicados_da_pessoa(
  _client_id uuid,
  _pessoa_id uuid,
  _universo text DEFAULT 'eleicao',
  _incluir_filhos boolean DEFAULT false,
  _campanha_id uuid DEFAULT NULL,
  _data_de timestamptz DEFAULT NULL,
  _data_ate timestamptz DEFAULT NULL
)
RETURNS TABLE(
  indicado_id uuid,
  nome text,
  telefone text,
  cidade text,
  bairro text,
  vota_candidato text,
  candidato_alternativo text,
  ultimo_status_ligacao text,
  operador_nome text,
  observacao_tele text,
  ultima_ligacao_em timestamptz,
  total_tentativas integer,
  indicador_id uuid,
  indicador_nome text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.clients WHERE id=_client_id AND user_id=auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members WHERE client_id=_client_id AND user_id=auth.uid() AND status='active')
  ) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF _universo = 'eleicao' THEN
    RETURN QUERY
    WITH alvos AS (
      SELECT _pessoa_id AS id
      UNION
      SELECT p.id FROM public.eleicao_pessoas p
      WHERE _incluir_filhos AND p.parent_id = _pessoa_id AND p.client_id = _client_id
    )
    SELECT
      ei.id, ei.nome, ei.telefone, ei.cidade, ei.bairro,
      ei.vota_candidato, ei.candidato_alternativo,
      ei.ultimo_status_ligacao, ei.operador_nome, ei.observacao_tele,
      ei.ultima_ligacao_em, COALESCE(ei.total_tentativas, 0),
      ei.indicador_id, ind.nome,
      ei.created_at
    FROM public.eleicao_indicados ei
    LEFT JOIN public.eleicao_pessoas ind ON ind.id = ei.indicador_id
    WHERE ei.client_id = _client_id
      AND ei.indicador_id IN (SELECT id FROM alvos)
      AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
      AND (_data_de IS NULL OR ei.created_at >= _data_de)
      AND (_data_ate IS NULL OR ei.created_at <= _data_ate)
    ORDER BY ei.ultima_ligacao_em DESC NULLS LAST, ei.created_at DESC;
  ELSE
    RETURN QUERY
    WITH alvos AS (
      SELECT _pessoa_id AS id
      UNION
      SELECT c.id FROM public.contratados c
      WHERE _incluir_filhos AND c.lider_id = _pessoa_id AND c.client_id = _client_id
    )
    SELECT
      ci.id, ci.nome, ci.telefone, ci.cidade, ci.bairro,
      ci.vota_candidato, ci.candidato_alternativo,
      ci.ligacao_status, ci.operador_nome, ci.observacao_tele,
      ci.ligacao_em, COALESCE(ci.total_tentativas, 0),
      ci.contratado_id, c.nome,
      ci.created_at
    FROM public.contratado_indicados ci
    LEFT JOIN public.contratados c ON c.id = ci.contratado_id
    WHERE ci.client_id = _client_id
      AND ci.contratado_id IN (SELECT id FROM alvos)
      AND (_campanha_id IS NULL OR ci.campanha_id = _campanha_id)
      AND (_data_de IS NULL OR ci.created_at >= _data_de)
      AND (_data_ate IS NULL OR ci.created_at <= _data_ate)
    ORDER BY ci.ligacao_em DESC NULLS LAST, ci.created_at DESC;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_ranking_indicados_da_pessoa(uuid, uuid, text, boolean, uuid, timestamptz, timestamptz) TO authenticated;
