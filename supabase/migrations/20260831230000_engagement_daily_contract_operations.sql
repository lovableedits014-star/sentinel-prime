-- Operacao aprovada: toda missao nova e monitorada automaticamente para os
-- contratados ativos. Voluntarios sao preservados e podem ser incluidos por configuracao.

ALTER TABLE public.engagement_config
  ADD COLUMN IF NOT EXISTS incluir_voluntarios_missao boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS prazo_missao_horas integer NOT NULL DEFAULT 24;

CREATE OR REPLACE FUNCTION public.engagement_auto_snapshot_daily_mission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_vol boolean:=false; v_prazo integer:=24; v_total integer:=0;
BEGIN
  IF NEW.archived_at IS NOT NULL OR NOT coalesce(NEW.is_active,true) THEN RETURN NEW; END IF;
  SELECT coalesce(c.incluir_voluntarios_missao,false),greatest(coalesce(c.prazo_missao_horas,24),1)
    INTO v_vol,v_prazo FROM engagement_config c WHERE c.client_id=NEW.client_id;

  INSERT INTO engagement_obrigacoes(client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
    phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,assigned_at,eligible_from,assignment_source,snapshot_version)
  SELECT NEW.client_id,NEW.id,'eleicao',x.id,x.nome,x.cargo,x.telefone,x.regiao,x.cidade,
    public.normalize_br_phone(x.telefone),'checkin',1,coalesce(NEW.publicado_em,NEW.created_at,now())+make_interval(hours=>v_prazo),
    1,now(),x.elegivel_desde,'daily_contract_auto',3
  FROM (
    SELECT DISTINCT ON (coalesce(public.normalize_br_phone(e.telefone),'id:'||e.id::text))
      e.id,e.nome,CASE WHEN e.is_voluntario THEN 'voluntario' ELSE e.tipo::text END cargo,e.telefone,
      coalesce(nullif(e.regiao,''),e.bairro) regiao,e.cidade,
      CASE WHEN e.is_voluntario THEN coalesce(e.voluntario_marcado_em,e.created_at)
        ELSE coalesce(e.confirmado_em,e.created_at) END elegivel_desde,e.created_at
    FROM eleicao_pessoas e WHERE e.client_id=NEW.client_id AND e.arquivado_em IS NULL
      AND ((NOT e.is_voluntario AND coalesce(e.valor_contratacao,0)>0) OR (v_vol AND e.is_voluntario))
      AND (e.vigencia_inicio IS NULL OR e.vigencia_inicio<=current_date)
      AND (e.vigencia_fim IS NULL OR e.vigencia_fim>=current_date)
    ORDER BY coalesce(public.normalize_br_phone(e.telefone),'id:'||e.id::text),e.created_at,e.id
  ) x ON CONFLICT(mission_id,origem,ref_id) DO NOTHING;

  -- Mantem compatibilidade com a base historica do modulo Contratados. Quando
  -- a mesma pessoa existe na Eleicao, o telefone impede a obrigacao duplicada.
  INSERT INTO engagement_obrigacoes(client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
    phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,assigned_at,eligible_from,assignment_source,snapshot_version)
  SELECT NEW.client_id,NEW.id,'contratados',c.id,c.nome,
    CASE WHEN coalesce(c.is_lider,false) THEN 'lider' ELSE 'contratado' END,c.telefone,c.bairro,c.cidade,
    public.normalize_br_phone(c.telefone),'checkin',1,
    coalesce(NEW.publicado_em,NEW.created_at,now())+make_interval(hours=>v_prazo),1,now(),
    coalesce(c.contrato_aceito_em,c.created_at),
    'daily_contract_legacy_auto',3
  FROM contratados c
  WHERE c.client_id=NEW.client_id AND c.status='ativo'
    AND NOT EXISTS (
      SELECT 1 FROM engagement_obrigacoes o
      WHERE o.mission_id=NEW.id AND public.mission_phone_key(o.telefone)=public.mission_phone_key(c.telefone)
    )
  ON CONFLICT(mission_id,origem,ref_id) DO NOTHING;

  SELECT count(*)::int INTO v_total FROM engagement_obrigacoes o WHERE o.mission_id=NEW.id AND o.status<>'dispensada';
  UPDATE portal_missions SET monitorada=true,tracking_enabled=true,publicado_em=coalesce(publicado_em,created_at,now()),
    audience_snapshotted_at=coalesce(audience_snapshotted_at,now()),eligible_count=v_total
  WHERE id=NEW.id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_engagement_auto_snapshot_daily_mission ON portal_missions;
CREATE TRIGGER trg_engagement_auto_snapshot_daily_mission AFTER INSERT ON portal_missions
FOR EACH ROW EXECUTE FUNCTION engagement_auto_snapshot_daily_mission();

-- Remove a regra provisoria que acrescentava contratacoes novas a missoes ja
-- publicadas. O publico correto e imutavel a partir do momento do disparo.
DROP TRIGGER IF EXISTS trg_engagement_eleicao_contract_today ON eleicao_pessoas;
DROP TRIGGER IF EXISTS trg_engagement_legacy_contract_today ON contratados;
DROP FUNCTION IF EXISTS public.engagement_add_new_contract_to_today();

-- Corrige somente obrigacoes geradas por esta automacao para pessoas que ainda
-- nao estavam contratadas no momento da publicacao. Eventos e check-ins ficam
-- preservados como historico de alcance, mas deixam de representar cobranca.
DELETE FROM engagement_obrigacoes o
USING portal_missions m,eleicao_pessoas e
WHERE o.mission_id=m.id AND o.ref_id=e.id AND o.origem IN('eleicao','eleicao_pessoas')
  AND o.assignment_source IN('daily_contract_auto','daily_contract_backfill','contract_added_today')
  AND (CASE WHEN e.is_voluntario THEN coalesce(e.voluntario_marcado_em,e.created_at)
        ELSE coalesce(e.confirmado_em,e.created_at) END)>coalesce(m.publicado_em,m.created_at);

DELETE FROM engagement_obrigacoes o
USING portal_missions m,contratados c
WHERE o.mission_id=m.id AND o.ref_id=c.id AND o.origem IN('contratado','contratados')
  AND o.assignment_source IN('daily_contract_legacy_auto','daily_contract_legacy_backfill','contract_added_today')
  AND coalesce(c.contrato_aceito_em,c.created_at)>coalesce(m.publicado_em,m.created_at);

-- Inclui com seguranca as missoes de hoje que foram criadas antes da automacao.
INSERT INTO engagement_obrigacoes(client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
  phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,assigned_at,eligible_from,assignment_source,snapshot_version)
SELECT z.client_id,z.mission_id,'eleicao',z.pessoa_id,z.nome,z.cargo,z.telefone,z.regiao,z.cidade,z.phone_norm,
  'checkin',1,z.publicado_em+make_interval(hours=>z.prazo),1,now(),z.elegivel_desde,'daily_contract_backfill',3
FROM (
  SELECT DISTINCT ON(m.id,coalesce(public.normalize_br_phone(e.telefone),'id:'||e.id::text))
    m.client_id,m.id mission_id,e.id pessoa_id,e.nome,CASE WHEN e.is_voluntario THEN 'voluntario' ELSE e.tipo::text END cargo,
    e.telefone,coalesce(nullif(e.regiao,''),e.bairro) regiao,e.cidade,public.normalize_br_phone(e.telefone) phone_norm,
    coalesce(m.publicado_em,m.created_at) publicado_em,
    CASE WHEN e.is_voluntario THEN coalesce(e.voluntario_marcado_em,e.created_at)
      ELSE coalesce(e.confirmado_em,e.created_at) END elegivel_desde,
    greatest(coalesce(cfg.prazo_missao_horas,24),1) prazo
  FROM portal_missions m JOIN eleicao_pessoas e ON e.client_id=m.client_id
  LEFT JOIN engagement_config cfg ON cfg.client_id=m.client_id
  WHERE m.archived_at IS NULL AND coalesce(m.is_active,true) AND coalesce(m.publicado_em,m.created_at)::date=current_date
    AND e.arquivado_em IS NULL
    AND ((NOT e.is_voluntario AND coalesce(e.valor_contratacao,0)>0) OR (coalesce(cfg.incluir_voluntarios_missao,false) AND e.is_voluntario))
    AND (CASE WHEN e.is_voluntario THEN coalesce(e.voluntario_marcado_em,e.created_at)
      ELSE coalesce(e.confirmado_em,e.created_at) END)<=coalesce(m.publicado_em,m.created_at)
    AND (e.vigencia_inicio IS NULL OR e.vigencia_inicio<=current_date) AND (e.vigencia_fim IS NULL OR e.vigencia_fim>=current_date)
  ORDER BY m.id,coalesce(public.normalize_br_phone(e.telefone),'id:'||e.id::text),e.created_at,e.id
) z ON CONFLICT(mission_id,origem,ref_id) DO NOTHING;

-- Acrescenta a base historica de contratados ativos, deduplicando-a contra a
-- estrutura da Eleicao e contra obrigacoes ja existentes pelo telefone.
INSERT INTO engagement_obrigacoes(client_id,mission_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,
  phone_norm,tipo_obrigacao,esperado,prazo_em,pontos_possiveis,assigned_at,eligible_from,assignment_source,snapshot_version)
SELECT m.client_id,m.id,'contratados',c.id,
  c.nome,CASE WHEN coalesce(c.is_lider,false) THEN 'lider' ELSE 'contratado' END,c.telefone,c.bairro,c.cidade,
  public.normalize_br_phone(c.telefone),'checkin',1,
  coalesce(m.publicado_em,m.created_at)+make_interval(hours=>greatest(coalesce(cfg.prazo_missao_horas,24),1)),
  1,now(),coalesce(c.contrato_aceito_em,c.created_at),'daily_contract_legacy_backfill',3
FROM portal_missions m
JOIN contratados c ON c.client_id=m.client_id AND c.status='ativo'
LEFT JOIN engagement_config cfg ON cfg.client_id=m.client_id
WHERE m.archived_at IS NULL AND coalesce(m.is_active,true)
  AND coalesce(m.publicado_em,m.created_at)::date=current_date
  AND coalesce(c.contrato_aceito_em,c.created_at)<=coalesce(m.publicado_em,m.created_at)
  AND NOT EXISTS (
    SELECT 1 FROM engagement_obrigacoes o
    WHERE o.mission_id=m.id AND public.mission_phone_key(o.telefone)=public.mission_phone_key(c.telefone)
  )
ON CONFLICT(mission_id,origem,ref_id) DO NOTHING;

UPDATE portal_missions m SET monitorada=true,tracking_enabled=true,publicado_em=coalesce(m.publicado_em,m.created_at),
  audience_snapshotted_at=coalesce(m.audience_snapshotted_at,now()),
  eligible_count=(SELECT count(*)::int FROM engagement_obrigacoes o WHERE o.mission_id=m.id AND o.status<>'dispensada')
WHERE m.archived_at IS NULL AND coalesce(m.is_active,true) AND coalesce(m.publicado_em,m.created_at)::date=current_date;

CREATE OR REPLACE FUNCTION public.engagement_daily_missions(p_client_id uuid,p_dia date DEFAULT current_date)
RETURNS TABLE(mission_id uuid,titulo text,plataforma text,publicado_em timestamptz,publico_congelado integer,
  publico_valido integer,concluiram integer,abriram_sem_concluir integer,nao_abriram integer,dispensados integer,taxa numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY WITH fatos AS (
    SELECT o.mission_id,o.status,
      (o.status='cumprida' OR EXISTS(SELECT 1 FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
        WHERE c.client_id=p_client_id AND c.mission_id=o.mission_id AND c.concluido_em IS NOT NULL AND (
          c.pessoa_id=o.ref_id OR mp.pessoa_id=o.ref_id OR
          public.mission_phone_key(mp.phone_e164)=public.mission_phone_key(o.telefone)))) concluiu,
      EXISTS(SELECT 1 FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
        WHERE c.client_id=p_client_id AND c.mission_id=o.mission_id AND (
          c.pessoa_id=o.ref_id OR mp.pessoa_id=o.ref_id OR
          public.mission_phone_key(mp.phone_e164)=public.mission_phone_key(o.telefone))) acessou
    FROM engagement_obrigacoes o WHERE o.client_id=p_client_id
  ), ob AS (
    SELECT f.mission_id,count(*) FILTER(WHERE f.status<>'dispensada')::int validos,
      count(*) FILTER(WHERE f.status<>'dispensada' AND f.concluiu)::int feitos,
      count(*) FILTER(WHERE f.status<>'dispensada' AND f.acessou AND NOT f.concluiu)::int abriu,
      count(*) FILTER(WHERE f.status='dispensada')::int disp
    FROM fatos f GROUP BY f.mission_id
  ) SELECT m.id,coalesce(m.title,m.post_url,'Missao'),m.platform,coalesce(m.publicado_em,m.created_at),
    coalesce(m.eligible_count,o.validos,0),coalesce(o.validos,0),coalesce(o.feitos,0),
    coalesce(o.abriu,0),greatest(coalesce(o.validos,0)-coalesce(o.feitos,0)-coalesce(o.abriu,0),0),
    coalesce(o.disp,0),CASE WHEN coalesce(o.validos,0)>0 THEN round(100.0*coalesce(o.feitos,0)/o.validos,1) ELSE 0 END
  FROM portal_missions m LEFT JOIN ob o ON o.mission_id=m.id
  WHERE m.client_id=p_client_id AND m.archived_at IS NULL AND coalesce(m.publicado_em,m.created_at)::date=p_dia
  ORDER BY coalesce(m.publicado_em,m.created_at) DESC;
END $$;

-- Repara obrigacoes historicas cujo telefone foi digitado com variacao de
-- mascara ou com/sem o nono digito. A mesma chave ja e usada no fluxo publico.
WITH conclusoes AS (
  SELECT o.id obrigacao_id,min(c.concluido_em) concluido_em
  FROM engagement_obrigacoes o
  JOIN mission_checkins c ON c.client_id=o.client_id AND c.mission_id=o.mission_id
  JOIN mission_participants mp ON mp.id=c.participant_id
  WHERE c.concluido_em IS NOT NULL AND o.status<>'dispensada' AND (
    c.pessoa_id=o.ref_id OR mp.pessoa_id=o.ref_id OR
    public.mission_phone_key(mp.phone_e164)=public.mission_phone_key(o.telefone)
  )
  GROUP BY o.id
)
UPDATE engagement_obrigacoes o
SET status='cumprida',
    cumprida_em=coalesce(o.cumprida_em,c.concluido_em),
    evidencia_nivel=coalesce(o.evidencia_nivel,'E2'),
    pontos=o.pontos_possiveis,
    updated_at=now()
FROM conclusoes c
WHERE o.id=c.obrigacao_id;

CREATE OR REPLACE FUNCTION public.engagement_daily_reach(p_client_id uuid,p_dia date DEFAULT current_date)
RETURNS TABLE(mission_id uuid,eventos bigint,pessoas_identificadas bigint,grupos_alcancados bigint,
  aberturas bigint,cliques bigint,confirmacoes bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY SELECT m.id,count(e.id),count(DISTINCT e.participant_id) FILTER(WHERE e.participant_id IS NOT NULL),
    count(DISTINCT e.distribution_id) FILTER(WHERE e.distribution_id IS NOT NULL),
    count(e.id) FILTER(WHERE e.event_type::text='open'),
    count(e.id) FILTER(WHERE e.event_type::text LIKE 'click_%'),
    count(DISTINCT e.participant_id) FILTER(WHERE e.event_type::text='declared_done' AND e.participant_id IS NOT NULL)
  FROM portal_missions m LEFT JOIN mission_events e ON e.mission_id=m.id AND e.client_id=p_client_id AND NOT coalesce(e.is_bot,false)
  WHERE m.client_id=p_client_id AND m.archived_at IS NULL AND coalesce(m.publicado_em,m.created_at)::date=p_dia
  GROUP BY m.id;
END $$;

CREATE OR REPLACE FUNCTION public.engagement_campaign_team(p_client_id uuid,p_dias integer DEFAULT 30)
RETURNS TABLE(pessoa_id uuid,nome text,telefone text,cargo text,regiao text,coordenador_id uuid,
  coordenador_nome text,coordenador_telefone text,contratado boolean,voluntario boolean,missoes integer,
  concluidas integer,pendentes integer,taxa numeric,ultima_atividade timestamptz,status_hoje text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY WITH RECURSIVE pessoas AS (
    SELECT e.* FROM eleicao_pessoas e WHERE e.client_id=p_client_id AND e.arquivado_em IS NULL
      AND ((NOT e.is_voluntario AND coalesce(e.valor_contratacao,0)>0) OR e.is_voluntario)
  ), anc AS (
    SELECT p.id pessoa_id,p.id ancestral,p.parent_id,p.nome,p.telefone,0 nivel FROM pessoas p
    UNION ALL SELECT a.pessoa_id,e.id,e.parent_id,e.nome,e.telefone,a.nivel+1 FROM anc a
      JOIN eleicao_pessoas e ON e.id=a.parent_id AND e.client_id=p_client_id WHERE a.nivel<20
  ), raiz AS (
    SELECT DISTINCT ON(a.pessoa_id) a.pessoa_id,a.ancestral,a.nome,a.telefone
    FROM anc a ORDER BY a.pessoa_id,a.nivel DESC
  ),
  hist AS (
    SELECT o.ref_id,count(DISTINCT o.mission_id)::int total,count(DISTINCT o.mission_id) FILTER(WHERE o.status='cumprida')::int feitas,
      max(coalesce(o.cumprida_em,o.updated_at)) ultima,bool_or(o.status='cumprida' AND coalesce(m.publicado_em,m.created_at)::date=current_date) fez_hoje,
      bool_or(o.status<>'cumprida' AND o.status<>'dispensada' AND coalesce(m.publicado_em,m.created_at)::date=current_date) falta_hoje
    FROM engagement_obrigacoes o JOIN portal_missions m ON m.id=o.mission_id WHERE o.client_id=p_client_id
      AND o.origem IN('eleicao','eleicao_pessoas') AND coalesce(m.publicado_em,m.created_at)>=now()-make_interval(days=>greatest(coalesce(p_dias,30),1))
    GROUP BY o.ref_id
  ) SELECT p.id,p.nome,p.telefone,CASE WHEN p.is_voluntario THEN 'voluntario' ELSE p.tipo::text END,
    coalesce(nullif(p.regiao,''),p.bairro),r.ancestral,r.nome,r.telefone,NOT p.is_voluntario AND coalesce(p.valor_contratacao,0)>0,p.is_voluntario,
    coalesce(h.total,0),coalesce(h.feitas,0),greatest(coalesce(h.total,0)-coalesce(h.feitas,0),0),
    CASE WHEN coalesce(h.total,0)>0 THEN round(100.0*h.feitas/h.total,1) ELSE 0 END,h.ultima,
    CASE WHEN h.fez_hoje THEN 'concluiu' WHEN h.falta_hoje THEN 'pendente' ELSE 'sem_missao' END
  FROM pessoas p LEFT JOIN raiz r ON r.pessoa_id=p.id LEFT JOIN hist h ON h.ref_id=p.id
  ORDER BY CASE WHEN h.falta_hoje THEN 0 WHEN NOT h.fez_hoje THEN 1 ELSE 2 END,r.nome,p.nome;
END $$;

GRANT EXECUTE ON FUNCTION engagement_daily_missions(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION engagement_daily_reach(uuid,date) TO authenticated;
GRANT EXECUTE ON FUNCTION engagement_campaign_team(uuid,integer) TO authenticated;
NOTIFY pgrst, 'reload schema';
