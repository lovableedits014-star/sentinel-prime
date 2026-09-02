-- Contratados avulsos: obrigatorios que nao possuem coordenador ancestral na
-- arvore da Eleicao. Coordenadores raiz nao entram nesta lista.

CREATE OR REPLACE FUNCTION public.engagement_mission_standalone_contracts(
  p_client_id uuid,p_mission_id uuid
) RETURNS TABLE(
  pessoa_id uuid,nome text,telefone text,cargo text,regiao text,cidade text,
  status text,primeiro_acesso_em timestamptz,cumprido_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY
  WITH RECURSIVE required AS MATERIALIZED (
    SELECT o.ref_id,p.nome,p.telefone,p.tipo::text cargo,
      coalesce(nullif(p.regiao,''),p.bairro) regiao,p.cidade,o.status obrig_status,o.cumprida_em
    FROM engagement_obrigacoes o JOIN eleicao_pessoas p ON p.id=o.ref_id AND p.client_id=o.client_id
    WHERE o.client_id=p_client_id AND o.mission_id=p_mission_id
      AND o.status<>'dispensada' AND o.origem IN('eleicao','eleicao_pessoas')
      AND p.arquivado_em IS NULL AND NOT coalesce(p.is_voluntario,false)
      AND coalesce(p.valor_contratacao,0)>0 AND p.tipo::text<>'coordenador'
  ), ancestry AS MATERIALIZED (
    SELECT r.ref_id obrigado_id,p.id,p.parent_id,p.tipo::text tipo,0 depth,ARRAY[p.id] caminho
    FROM required r JOIN eleicao_pessoas p ON p.id=r.ref_id AND p.client_id=p_client_id
    UNION ALL
    SELECT a.obrigado_id,p.id,p.parent_id,p.tipo::text,a.depth+1,a.caminho||p.id
    FROM ancestry a JOIN eleicao_pessoas p ON p.id=a.parent_id AND p.client_id=p_client_id
    WHERE a.depth<20 AND p.arquivado_em IS NULL AND NOT p.id=ANY(a.caminho)
  ), avulsos AS MATERIALIZED (
    SELECT r.* FROM required r WHERE NOT EXISTS(
      SELECT 1 FROM ancestry a WHERE a.obrigado_id=r.ref_id
        AND a.tipo='coordenador' AND a.id<>r.ref_id)
  ), facts AS MATERIALIZED (
    SELECT a.ref_id,min(c.primeiro_acesso_em) primeiro,max(c.concluido_em) concluido
    FROM avulsos a LEFT JOIN mission_checkins c
      JOIN mission_participants mp ON mp.id=c.participant_id
      ON c.client_id=p_client_id AND c.mission_id=p_mission_id AND (
        c.pessoa_id=a.ref_id OR mp.pessoa_id=a.ref_id OR
        (public.mission_phone_key(a.telefone) IS NOT NULL AND
         public.mission_phone_key(a.telefone)=public.mission_phone_key(mp.phone_e164)))
    GROUP BY a.ref_id
  )
  SELECT a.ref_id,a.nome,a.telefone,a.cargo,a.regiao,a.cidade,
    CASE WHEN f.concluido IS NOT NULL OR a.obrig_status='cumprida' THEN 'cumpriu'
      WHEN f.primeiro IS NOT NULL THEN 'abriu' ELSE 'nao_abriu' END,
    f.primeiro,coalesce(f.concluido,a.cumprida_em)
  FROM avulsos a LEFT JOIN facts f ON f.ref_id=a.ref_id
  ORDER BY CASE WHEN f.concluido IS NOT NULL OR a.obrig_status='cumprida' THEN 2
    WHEN f.primeiro IS NOT NULL THEN 1 ELSE 0 END,a.nome;
END;$function$;

REVOKE ALL ON FUNCTION public.engagement_mission_standalone_contracts(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_mission_standalone_contracts(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
