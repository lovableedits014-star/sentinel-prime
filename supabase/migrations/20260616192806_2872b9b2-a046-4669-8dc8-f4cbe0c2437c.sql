
CREATE OR REPLACE FUNCTION public.eleicao_garantir_token_indicador(_indicador_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  v_client_id uuid;
  v_token text;
BEGIN
  SELECT token INTO v_token
    FROM public.eleicao_indicacao_tokens
   WHERE indicador_id = _indicador_id AND revoked_at IS NULL
   LIMIT 1;
  IF v_token IS NOT NULL THEN
    RETURN v_token;
  END IF;

  SELECT client_id INTO v_client_id FROM public.eleicao_pessoas WHERE id = _indicador_id;
  IF v_client_id IS NULL THEN
    RAISE EXCEPTION 'Indicador não encontrado';
  END IF;

  v_token := replace(extensions.gen_random_uuid()::text, '-', '')
          || replace(extensions.gen_random_uuid()::text, '-', '');

  INSERT INTO public.eleicao_indicacao_tokens(client_id, indicador_id, token)
       VALUES (v_client_id, _indicador_id, v_token)
  ON CONFLICT DO NOTHING;

  IF NOT FOUND THEN
    SELECT token INTO v_token
      FROM public.eleicao_indicacao_tokens
     WHERE indicador_id = _indicador_id AND revoked_at IS NULL
     LIMIT 1;
  END IF;

  RETURN v_token;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.eleicao_garantir_token_indicador(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.eleicao_pessoas_garantir_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF NEW.tipo IN ('coordenador','lider','cabo') THEN
    PERFORM public.eleicao_garantir_token_indicador(NEW.id);
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_eleicao_pessoas_garantir_token ON public.eleicao_pessoas;
CREATE TRIGGER trg_eleicao_pessoas_garantir_token
  AFTER INSERT ON public.eleicao_pessoas
  FOR EACH ROW EXECUTE FUNCTION public.eleicao_pessoas_garantir_token();

DO $backfill$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.id
      FROM public.eleicao_pessoas p
      LEFT JOIN public.eleicao_indicacao_tokens t
        ON t.indicador_id = p.id AND t.revoked_at IS NULL
     WHERE t.id IS NULL
       AND p.tipo IN ('coordenador','lider','cabo')
  LOOP
    PERFORM public.eleicao_garantir_token_indicador(r.id);
  END LOOP;
END;
$backfill$;

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
  SELECT user_id INTO v_owner
    FROM public.eleicao_pessoas
   WHERE id = _coordenador_id AND tipo = 'coordenador';
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  RETURN QUERY
  WITH RECURSIVE team AS (
    SELECT id FROM public.eleicao_pessoas WHERE id = _coordenador_id
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
