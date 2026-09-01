-- Fila dividida com transbordo automatico.
--
-- A divisao continua sendo respeitada enquanto o operador possui contatos
-- proprios disponiveis. Quando sua carteira imediata termina, ele passa a
-- enxergar e retirar atomicamente contatos ainda disponiveis das carteiras dos
-- demais operadores da mesma fila. A reserva global de tele_proximo_contato
-- continua impedindo que duas pessoas liguem para o mesmo telefone.

CREATE OR REPLACE FUNCTION public.tele_assign_visivel(
  _client_id uuid,
  _campanha_id uuid,
  _assigned uuid,
  _op_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    _assigned IS NULL
    OR _assigned = _op_id
    OR NOT EXISTS (
      SELECT 1
        FROM public.telemarketing_campanha_operadores co
       WHERE co.client_id = _client_id
         AND co.campanha_id = _campanha_id
         AND co.operador_id = _assigned
         AND co.ativo = true
    )
    OR NOT EXISTS (
      -- Se o operador nao tem nenhum contato proprio que possa ser chamado
      -- agora, a divisao vira uma preferencia e nao uma barreira.
      SELECT 1
      FROM (
        SELECT
          'contatos_avulsos'::text AS tabela,
          av.id,
          public.tele_phone_key(av.telefone) AS telefone_key
        FROM public.telemarketing_contatos_avulsos av
        WHERE av.client_id = _client_id
          AND av.campanha_id = _campanha_id
          AND av.assigned_operador_id = _op_id
          AND av.ativo = true
          AND COALESCE(av.ligacao_status, 'pendente') IN ('pendente', 'nao_atendeu', 'reagendou')
          AND (av.proxima_tentativa_em IS NULL OR av.proxima_tentativa_em <= now())

        UNION ALL

        SELECT
          'eleicao_indicados'::text,
          ei.id,
          public.tele_phone_key(ei.telefone)
        FROM public.eleicao_indicados ei
        WHERE ei.client_id = _client_id
          AND ei.campanha_id = _campanha_id
          AND ei.assigned_operador_id = _op_id
          AND COALESCE(ei.ultimo_status_ligacao, 'pendente') IN ('pendente', 'nao_atendeu', 'reagendou')
          AND (ei.proxima_tentativa_em IS NULL OR ei.proxima_tentativa_em <= now())

        UNION ALL

        SELECT
          'eleicao_pessoas'::text,
          ep.id,
          public.tele_phone_key(ep.telefone)
        FROM public.eleicao_pessoas ep
        WHERE ep.client_id = _client_id
          AND ep.campanha_id = _campanha_id
          AND ep.assigned_operador_id = _op_id
          AND ep.telefone IS NOT NULL
          AND length(btrim(ep.telefone)) >= 8
          AND COALESCE(ep.ligacao_status, 'pendente') IN ('pendente', 'nao_atendeu', 'reagendou')
          AND (ep.proxima_tentativa_em IS NULL OR ep.proxima_tentativa_em <= now())
      ) own
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.telemarketing_call_assignments a
        WHERE a.client_id = _client_id
          AND a.expires_at > now()
          AND (
            (own.telefone_key IS NOT NULL AND a.telefone_key = own.telefone_key)
            OR (own.telefone_key IS NULL AND a.tabela = own.tabela AND a.contato_id = own.id)
          )
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.telemarketing_phone_outcomes o
        WHERE o.client_id = _client_id
          AND own.telefone_key IS NOT NULL
          AND o.telefone_key = own.telefone_key
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.telemarketing_skip_cooldowns s
        WHERE s.client_id = _client_id
          AND s.operador_id = _op_id
          AND s.expires_at > now()
          AND s.lock_key = COALESCE(own.telefone_key, own.tabela || ':' || own.id::text)
      )
    );
$function$;

COMMENT ON FUNCTION public.tele_assign_visivel(uuid, uuid, uuid, uuid) IS
  'Respeita a carteira dividida enquanto houver contato proprio disponivel e permite transbordo automatico quando o operador ficar ocioso.';

REVOKE ALL ON FUNCTION public.tele_assign_visivel(uuid, uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;

