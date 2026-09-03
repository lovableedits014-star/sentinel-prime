-- Expõe a composição das equipes para relatórios gerenciais.
-- Inclui também quem ficou sem atribuições no período, evitando que líderes
-- com resultado zero desapareçam do relatório.
CREATE OR REPLACE FUNCTION public.engagement_report_team_hierarchy(p_client_id uuid)
RETURNS TABLE(
  root_id uuid,
  pessoa_id uuid,
  parent_id uuid,
  nome text,
  telefone text,
  tipo text,
  nivel integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN
    RAISE EXCEPTION 'Sem permissao';
  END IF;

  RETURN QUERY
  WITH RECURSIVE roots AS (
    SELECT p.id
    FROM public.eleicao_pessoas p
    WHERE p.client_id = p_client_id
      AND p.arquivado_em IS NULL
      AND (p.tipo::text = 'coordenador'
        OR (p.tipo::text = 'lider' AND p.parent_id IS NULL))
  ), tree AS (
    SELECT r.id AS root_id, p.id AS pessoa_id, p.parent_id, p.nome,
      p.telefone, p.tipo::text AS tipo, 0 AS nivel
    FROM roots r
    JOIN public.eleicao_pessoas p ON p.id = r.id
    UNION ALL
    SELECT t.root_id, p.id, p.parent_id, p.nome, p.telefone,
      p.tipo::text, t.nivel + 1
    FROM tree t
    JOIN public.eleicao_pessoas p ON p.parent_id = t.pessoa_id
    WHERE p.client_id = p_client_id AND p.arquivado_em IS NULL
  )
  SELECT t.root_id, t.pessoa_id, t.parent_id, t.nome, t.telefone, t.tipo, t.nivel
  FROM tree t
  ORDER BY t.root_id, t.nivel, t.nome;
END;
$function$;

REVOKE ALL ON FUNCTION public.engagement_report_team_hierarchy(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.engagement_report_team_hierarchy(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
