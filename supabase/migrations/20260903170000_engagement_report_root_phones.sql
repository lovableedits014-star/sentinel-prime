-- Disponibiliza o telefone dos responsaveis nos relatorios impressos.
CREATE OR REPLACE FUNCTION public.engagement_team_roots_contacts(p_client_id uuid)
RETURNS TABLE(root_id uuid, nome text, telefone text, tipo text, is_avulso boolean, pessoas integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY
  WITH RECURSIVE roots AS (
    SELECT p.id,p.nome,p.telefone,p.tipo::text tipo,
      (p.tipo::text='lider' AND p.parent_id IS NULL) avulso
    FROM eleicao_pessoas p
    WHERE p.client_id=p_client_id AND p.arquivado_em IS NULL
      AND (p.tipo::text='coordenador' OR (p.tipo::text='lider' AND p.parent_id IS NULL))
  ), tree AS (
    SELECT r.id root_id,r.id pessoa_id FROM roots r
    UNION ALL
    SELECT t.root_id,p.id FROM tree t JOIN eleicao_pessoas p ON p.parent_id=t.pessoa_id
    WHERE p.client_id=p_client_id AND p.arquivado_em IS NULL
  )
  SELECT r.id,r.nome,r.telefone,r.tipo,r.avulso,count(DISTINCT t.pessoa_id)::int
  FROM roots r LEFT JOIN tree t ON t.root_id=r.id
  GROUP BY r.id,r.nome,r.telefone,r.tipo,r.avulso
  ORDER BY r.avulso,r.nome;
END;
$function$;

REVOKE ALL ON FUNCTION public.engagement_team_roots_contacts(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.engagement_team_roots_contacts(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
