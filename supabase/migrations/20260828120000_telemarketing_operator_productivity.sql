-- Relatorio de produtividade dos operadores (evolucao aditiva).
ALTER TABLE public.telemarketing_call_log
  ADD COLUMN IF NOT EXISTS operador_id uuid REFERENCES public.telemarketing_operadores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tele_call_log_client_operator_date
  ON public.telemarketing_call_log (client_id, operador_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.tele_call_log_resolve_operador_id()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NEW.operador_id IS NULL THEN
    SELECT o.id INTO NEW.operador_id FROM public.telemarketing_operadores o
     WHERE o.client_id = NEW.client_id
       AND lower(btrim(o.nome)) = lower(btrim(NEW.operador_nome))
     ORDER BY o.ativo DESC, o.created_at DESC LIMIT 1;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_tele_call_log_resolve_operador ON public.telemarketing_call_log;
CREATE TRIGGER trg_tele_call_log_resolve_operador
BEFORE INSERT ON public.telemarketing_call_log
FOR EACH ROW EXECUTE FUNCTION public.tele_call_log_resolve_operador_id();

-- Historico antigo: associa apenas nomes sem ambiguidade dentro do cliente.
UPDATE public.telemarketing_call_log l SET operador_id = match.id
FROM (
  SELECT client_id, lower(btrim(nome)) AS nome_norm, min(id::text)::uuid AS id
  FROM public.telemarketing_operadores
  GROUP BY client_id, lower(btrim(nome)) HAVING count(*) = 1
) match
WHERE l.operador_id IS NULL AND l.client_id = match.client_id
  AND lower(btrim(l.operador_nome)) = match.nome_norm;

CREATE OR REPLACE FUNCTION public.tele_produtividade_ligacoes(
  _client_id uuid, _inicio timestamptz, _fim timestamptz, _campanha_id uuid DEFAULT NULL
)
RETURNS TABLE(
  id uuid, operador_id uuid, operador_nome text, created_at timestamptz,
  ligacao_status text, vota_candidato text, tabela text, contato_id uuid,
  campanha_id uuid, cidade text, bairro text, proxima_tentativa_em timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.is_client_member(_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  IF _inicio IS NULL OR _fim IS NULL OR _fim <= _inicio THEN RAISE EXCEPTION 'Periodo invalido'; END IF;
  IF _fim - _inicio > interval '366 days' THEN RAISE EXCEPTION 'O periodo maximo e de 366 dias'; END IF;
  RETURN QUERY
  SELECT l.id, l.operador_id, l.operador_nome, l.created_at, l.ligacao_status,
         l.vota_candidato, l.tabela, l.contato_id, l.campanha_id,
         l.cidade, l.bairro, l.proxima_tentativa_em
  FROM public.telemarketing_call_log l
  WHERE l.client_id = _client_id AND l.created_at >= _inicio AND l.created_at < _fim
    AND (_campanha_id IS NULL OR l.campanha_id = _campanha_id)
  ORDER BY l.created_at DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.tele_produtividade_ligacoes(uuid,timestamptz,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_produtividade_ligacoes(uuid,timestamptz,timestamptz,uuid) TO authenticated;
