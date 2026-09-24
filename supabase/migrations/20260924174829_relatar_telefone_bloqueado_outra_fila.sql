-- Mantem a deduplicacao global por telefone, mas explica no relatorio quando
-- um indicado pendente nao sera entregue porque o numero ja foi concluido em
-- outro cadastro. O resultado inclui a fila e os dados da ligacao de origem.

DROP FUNCTION IF EXISTS public.tele_indicador_report_rows(uuid);

CREATE FUNCTION public.tele_indicador_report_rows(_client_id uuid)
RETURNS TABLE(
  contato_id uuid,
  indicador_id uuid,
  indicador_nome text,
  indicador_tipo text,
  indicador_regiao text,
  nome text,
  telefone text,
  cidade text,
  bairro text,
  status_telemarketing text,
  ultimo_status_ligacao text,
  vota_candidato text,
  candidato_alternativo text,
  operador_nome text,
  ultima_ligacao_em timestamptz,
  total_tentativas integer,
  proxima_tentativa_em timestamptz,
  campanha_id uuid,
  campanha_nome text,
  inativo boolean,
  inativado_em timestamptz,
  bloqueado_por_outro_cadastro boolean,
  bloqueio_tabela text,
  bloqueio_contato_id uuid,
  bloqueio_contato_nome text,
  bloqueio_campanha_id uuid,
  bloqueio_campanha_nome text,
  bloqueio_status text,
  bloqueio_operador_nome text,
  bloqueio_em timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH outcome_details AS MATERIALIZED (
    SELECT
      o.client_id,
      o.telefone_key,
      o.tabela,
      o.contato_id,
      o.ligacao_status,
      o.operador_nome,
      o.concluded_at,
      COALESCE(av.nome, ci.nome, ct.nome, ei.nome, ep.nome) AS contato_nome,
      COALESCE(
        av.campanha_id,
        ci.campanha_id,
        ct.campanha_id,
        ei.campanha_id,
        ep.campanha_id
      ) AS campanha_id
    FROM public.telemarketing_phone_outcomes o
    LEFT JOIN public.telemarketing_contatos_avulsos av
      ON o.tabela = 'contatos_avulsos' AND av.id = o.contato_id
        AND av.client_id = o.client_id
    LEFT JOIN public.contratado_indicados ci
      ON o.tabela = 'contratado_indicados' AND ci.id = o.contato_id
        AND ci.client_id = o.client_id
    LEFT JOIN public.contratados ct
      ON o.tabela = 'contratados' AND ct.id = o.contato_id
        AND ct.client_id = o.client_id
    LEFT JOIN public.eleicao_indicados ei
      ON o.tabela = 'eleicao_indicados' AND ei.id = o.contato_id
        AND ei.client_id = o.client_id
    LEFT JOIN public.eleicao_pessoas ep
      ON o.tabela = 'eleicao_pessoas' AND ep.id = o.contato_id
        AND ep.client_id = o.client_id
    WHERE o.client_id = _client_id
  )
  SELECT
    ei.id,
    ei.indicador_id,
    indicador.nome,
    ei.indicador_tipo::text,
    indicador.regiao,
    ei.nome,
    ei.telefone,
    ei.cidade,
    ei.bairro,
    ei.status_telemarketing,
    ei.ultimo_status_ligacao,
    ei.vota_candidato,
    ei.candidato_alternativo,
    ei.operador_nome,
    ei.ultima_ligacao_em,
    COALESCE(ei.total_tentativas, 0),
    ei.proxima_tentativa_em,
    ei.campanha_id,
    campanha.nome,
    (inativo.contato_id IS NOT NULL),
    inativo.inativado_em,
    (
      outcome.contato_id IS NOT NULL
      AND (outcome.tabela <> 'eleicao_indicados' OR outcome.contato_id <> ei.id)
      AND ei.ultima_ligacao_em IS NULL
      AND COALESCE(ei.total_tentativas, 0) = 0
    ),
    outcome.tabela,
    outcome.contato_id,
    outcome.contato_nome,
    outcome.campanha_id,
    CASE
      WHEN outcome.contato_id IS NULL THEN NULL
      ELSE COALESCE(campanha_bloqueio.nome, 'Sem fila vinculada')
    END,
    outcome.ligacao_status,
    outcome.operador_nome,
    outcome.concluded_at
  FROM public.eleicao_indicados ei
  JOIN public.eleicao_pessoas indicador ON indicador.id = ei.indicador_id
  LEFT JOIN public.telemarketing_campanhas campanha ON campanha.id = ei.campanha_id
  LEFT JOIN public.telemarketing_inactive_contacts inativo
    ON inativo.client_id = ei.client_id
      AND inativo.tabela = 'eleicao_indicados'
      AND inativo.contato_id = ei.id
      AND inativo.reativado_em IS NULL
  LEFT JOIN outcome_details outcome
    ON outcome.client_id = ei.client_id
      AND outcome.telefone_key = public.tele_phone_key(ei.telefone)
  LEFT JOIN public.telemarketing_campanhas campanha_bloqueio
    ON campanha_bloqueio.id = outcome.campanha_id
      AND campanha_bloqueio.client_id = ei.client_id
  WHERE ei.client_id = _client_id
    AND public.user_can_access_client(_client_id)
  ORDER BY indicador.nome, ei.nome;
$function$;

REVOKE ALL ON FUNCTION public.tele_indicador_report_rows(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_indicador_report_rows(uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.tele_indicador_report_rows(uuid) IS
  'Relatorio por indicador com explicacao da deduplicacao global por telefone e fila que originou o bloqueio.';

NOTIFY pgrst, 'reload schema';
