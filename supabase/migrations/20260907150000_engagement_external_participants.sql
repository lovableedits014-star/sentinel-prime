-- Inventario de todas as pessoas que se identificaram pelos links de missao,
-- inclusive quem nao esta cadastrado ou nao possui contrato ativo.

CREATE OR REPLACE FUNCTION public.engagement_access_people_v2(p_client_id uuid,p_limit integer DEFAULT 3000)
RETURNS TABLE(participant_id uuid,nome text,telefone text,cargo text,regiao text,
  coordenador_id uuid,coordenador_nome text,coordenador_telefone text,
  missoes_acessadas bigint,missoes_concluidas bigint,pendentes bigint,
  ultimo_acesso timestamptz,vinculado boolean,tem_contrato boolean,origem_vinculo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY WITH RECURSIVE ancestry AS (
    SELECT e.id pessoa_id,e.id ancestor_id,e.parent_id,e.nome,e.telefone,0 depth
    FROM eleicao_pessoas e WHERE e.client_id=p_client_id
    UNION ALL
    SELECT a.pessoa_id,p.id,p.parent_id,p.nome,p.telefone,a.depth+1
    FROM ancestry a JOIN eleicao_pessoas p ON p.id=a.parent_id AND p.client_id=p_client_id
    WHERE a.depth<20
  ),raiz AS (
    SELECT DISTINCT ON(a.pessoa_id) a.pessoa_id,a.ancestor_id,a.nome,a.telefone
    FROM ancestry a ORDER BY a.pessoa_id,a.depth DESC
  )
  SELECT mp.id,mp.nome,mp.phone_e164,coalesce(ep.tipo::text,mp.cargo_snapshot,'cadastro pelo link'),
    coalesce(nullif(ep.regiao,''),ep.bairro,mp.regiao_snapshot),r.ancestor_id,r.nome,r.telefone,
    count(DISTINCT c.mission_id),count(DISTINCT c.mission_id) FILTER(WHERE c.concluido_em IS NOT NULL),
    count(DISTINCT c.mission_id) FILTER(WHERE c.concluido_em IS NULL),max(c.ultimo_acesso_em),
    (mp.pessoa_id IS NOT NULL OR mp.funcionario_id IS NOT NULL OR mp.contratado_id IS NOT NULL OR mp.crm_pessoa_id IS NOT NULL),
    CASE WHEN mp.contratado_id IS NOT NULL THEN true
      WHEN ep.id IS NOT NULL THEN NOT coalesce(ep.is_voluntario,false)
        AND coalesce(ep.valor_contratacao,0)>0
        AND coalesce(ep.status_contratacao::text,'confirmado')='confirmado'
        AND (ep.vigencia_inicio IS NULL OR ep.vigencia_inicio<=current_date)
        AND (ep.vigencia_fim IS NULL OR ep.vigencia_fim>=current_date)
      ELSE false END,
    CASE WHEN mp.pessoa_id IS NOT NULL THEN 'eleicao' WHEN mp.contratado_id IS NOT NULL THEN 'contratado'
      WHEN mp.funcionario_id IS NOT NULL THEN 'funcionario' WHEN mp.crm_pessoa_id IS NOT NULL THEN 'crm'
      ELSE 'nao_cadastrado' END
  FROM mission_participants mp
  LEFT JOIN eleicao_pessoas ep ON ep.id=mp.pessoa_id AND ep.client_id=p_client_id
  LEFT JOIN raiz r ON r.pessoa_id=ep.id
  LEFT JOIN mission_checkins c ON c.participant_id=mp.id
  WHERE mp.client_id=p_client_id
  GROUP BY mp.id,ep.id,ep.tipo,ep.regiao,ep.bairro,ep.is_voluntario,ep.valor_contratacao,
    ep.status_contratacao,ep.vigencia_inicio,ep.vigencia_fim,r.ancestor_id,r.nome,r.telefone
  ORDER BY (CASE WHEN mp.pessoa_id IS NULL AND mp.funcionario_id IS NULL AND mp.contratado_id IS NULL AND mp.crm_pessoa_id IS NULL THEN 0 ELSE 1 END),
    count(DISTINCT c.mission_id) FILTER(WHERE c.concluido_em IS NOT NULL) DESC,
    max(c.ultimo_acesso_em) DESC NULLS LAST,mp.nome
  LIMIT greatest(coalesce(p_limit,3000),1);
END;$function$;

REVOKE ALL ON FUNCTION public.engagement_access_people_v2(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_access_people_v2(uuid,integer) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
