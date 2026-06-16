CREATE OR REPLACE FUNCTION public.eleicao_listar_indicadores_team(_coordenador_id uuid)
RETURNS TABLE (
  indicador_id uuid,
  client_id uuid,
  nome text,
  tipo text,
  telefone text,
  regiao text,
  cidade text,
  parent_id uuid,
  token text,
  total_indicacoes integer,
  meta integer,
  ultimo_acesso_em timestamptz,
  ultima_cobranca_em timestamptz,
  cobrancas_enviadas bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_owner uuid;
BEGIN
  SELECT p.user_id INTO v_owner
    FROM public.eleicao_pessoas p
   WHERE p.id = _coordenador_id
     AND p.tipo = 'coordenador'::eleicao_tipo;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  RETURN QUERY
  WITH RECURSIVE team AS (
    SELECT ep.id FROM public.eleicao_pessoas ep WHERE ep.id = _coordenador_id
    UNION ALL
    SELECT p.id
      FROM public.eleicao_pessoas p
      JOIN team ON p.parent_id = team.id
  )
  SELECT v.indicador_id,
         v.client_id,
         v.nome,
         v.tipo::text,
         v.telefone,
         v.regiao,
         v.cidade,
         v.parent_id,
         v.token,
         v.total_indicacoes,
         v.meta,
         v.ultimo_acesso_em,
         v.ultima_cobranca_em,
         v.cobrancas_enviadas
    FROM public.v_eleicao_indicadores_cobranca v
    JOIN team ON team.id = v.indicador_id
   ORDER BY (CASE v.tipo::text WHEN 'coordenador' THEN 0 WHEN 'lider' THEN 1 ELSE 2 END), v.nome;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.eleicao_listar_indicadores_team(uuid) TO authenticated;