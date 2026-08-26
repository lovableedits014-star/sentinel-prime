-- 1. Tabela de operadores marcados por fila
CREATE TABLE IF NOT EXISTS public.telemarketing_campanha_operadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  campanha_id uuid NOT NULL REFERENCES public.telemarketing_campanhas(id) ON DELETE CASCADE,
  operador_id uuid NOT NULL REFERENCES public.telemarketing_operadores(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campanha_id, operador_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.telemarketing_campanha_operadores TO authenticated;
GRANT ALL ON public.telemarketing_campanha_operadores TO service_role;

ALTER TABLE public.telemarketing_campanha_operadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner manages campanha operadores"
  ON public.telemarketing_campanha_operadores FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = telemarketing_campanha_operadores.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = telemarketing_campanha_operadores.client_id AND c.user_id = auth.uid()));

CREATE POLICY "Team members read campanha operadores"
  ON public.telemarketing_campanha_operadores FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = telemarketing_campanha_operadores.client_id AND tm.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_tele_camp_ops_campanha ON public.telemarketing_campanha_operadores(campanha_id, operador_id) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_tele_camp_ops_operador ON public.telemarketing_campanha_operadores(operador_id) WHERE ativo;

CREATE TRIGGER trg_tele_camp_ops_updated
  BEFORE UPDATE ON public.telemarketing_campanha_operadores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Modo de designação na fila
ALTER TABLE public.telemarketing_campanhas
  ADD COLUMN IF NOT EXISTS modo_designacao text NOT NULL DEFAULT 'compartilhada';

-- 3. Backfill: filas existentes ficam com todos os operadores ativos marcados
INSERT INTO public.telemarketing_campanha_operadores (client_id, campanha_id, operador_id)
SELECT c.client_id, c.id, o.id
  FROM public.telemarketing_campanhas c
  JOIN public.telemarketing_operadores o
    ON o.client_id = c.client_id AND o.ativo = true
ON CONFLICT (campanha_id, operador_id) DO NOTHING;

-- 4. Trava do operador: próxima ligação
CREATE OR REPLACE FUNCTION public.tele_proximo_contato(_client_id uuid, _nome text, _senha text, _campanha_id uuid DEFAULT NULL::uuid, _ttl_seconds integer DEFAULT 300)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_expires timestamptz;
  v_cand record;
  v_inserted boolean;
  v_op_id uuid;
  v_lista_id uuid;
BEGIN
  BEGIN
    v_op_id := public._tele_assert_operador(_client_id, _nome, _senha);
  EXCEPTION WHEN OTHERS THEN
    SELECT id INTO v_op_id FROM public.telemarketing_operadores
      WHERE client_id = _client_id AND nome = _nome AND ativo = true LIMIT 1;
    IF v_op_id IS NULL THEN
       RAISE EXCEPTION 'Operador inválido';
    END IF;
  END;

  SELECT lista_atual_id INTO v_lista_id FROM public.telemarketing_operadores WHERE id = v_op_id;

  DELETE FROM public.telemarketing_call_assignments WHERE expires_at < now();
  v_expires := now() + make_interval(secs => GREATEST(_ttl_seconds, 60));

  FOR v_cand IN
    WITH allowed AS (
      SELECT co.campanha_id FROM public.telemarketing_campanha_operadores co
       WHERE co.client_id = _client_id AND co.operador_id = v_op_id AND co.ativo = true
    ),
    locked_phones AS (
      SELECT DISTINCT lower(btrim(COALESCE(
        (SELECT telefone FROM public.contratados WHERE id=a.contato_id AND a.tabela='contratados'),
        (SELECT telefone FROM public.contratado_indicados WHERE id=a.contato_id AND a.tabela='contratado_indicados'),
        (SELECT telefone FROM public.telemarketing_contatos_avulsos WHERE id=a.contato_id AND a.tabela='contatos_avulsos'),
        (SELECT telefone FROM public.eleicao_indicados WHERE id=a.contato_id AND a.tabela='eleicao_indicados'),
        (SELECT telefone FROM public.eleicao_pessoas WHERE id=a.contato_id AND a.tabela='eleicao_pessoas')
      ))) AS tel
      FROM public.telemarketing_call_assignments a
      WHERE a.client_id = _client_id
        AND a.expires_at > now()
        AND a.operador_nome <> _nome
    ),
    candidates AS (
      SELECT 'contatos_avulsos'::text as tabela, av.id, av.telefone,
             COALESCE(av.tentativas_count,0) AS tentativas, av.created_at, av.ligacao_status, av.proxima_tentativa_em,
             0 as priority
      FROM public.telemarketing_contatos_avulsos av
      WHERE av.client_id = _client_id
        AND av.ativo = true
        AND (_campanha_id IS NULL OR av.campanha_id = _campanha_id)
        AND av.campanha_id IN (SELECT campanha_id FROM allowed)
        AND (av.assigned_operador_id IS NULL OR av.assigned_operador_id = v_op_id)
        AND (v_lista_id IS NULL OR av.lista_id = v_lista_id)
        AND (v_lista_id IS NULL OR av.lista_id IS NOT NULL)
        AND COALESCE(av.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')

      UNION ALL

      SELECT 'contratados'::text AS tabela, c.id, c.telefone,
             COALESCE(c.tentativas_count, 0) AS tentativas,
             c.created_at, c.ligacao_status, c.proxima_tentativa_em, 2 as priority
      FROM public.contratados c
      WHERE v_lista_id IS NULL AND c.client_id = _client_id
        AND (_campanha_id IS NULL OR c.campanha_id = _campanha_id)
        AND c.campanha_id IN (SELECT campanha_id FROM allowed)
        AND COALESCE(c.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')

      UNION ALL

      SELECT 'contratado_indicados'::text as tabela, i.id, i.telefone,
             COALESCE(i.tentativas_count,0) as tentativas, i.created_at, i.ligacao_status, i.proxima_tentativa_em, 2 as priority
      FROM public.contratado_indicados i
      WHERE v_lista_id IS NULL AND i.client_id = _client_id
        AND (_campanha_id IS NULL OR i.campanha_id = _campanha_id)
        AND i.campanha_id IN (SELECT campanha_id FROM allowed)
        AND COALESCE(i.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')

      UNION ALL

      SELECT 'eleicao_indicados'::text as tabela, ei.id, ei.telefone,
             COALESCE(ei.total_tentativas,0) as tentativas, ei.created_at, ei.ultimo_status_ligacao as ligacao_status, ei.proxima_tentativa_em, 1 as priority
      FROM public.eleicao_indicados ei
      WHERE v_lista_id IS NULL AND ei.client_id = _client_id
        AND ei.campanha_id IS NOT NULL
        AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
        AND ei.campanha_id IN (SELECT campanha_id FROM allowed)
        AND (ei.assigned_operador_id IS NULL OR ei.assigned_operador_id = v_op_id)
        AND COALESCE(ei.ultimo_status_ligacao,'pendente') IN ('pendente','nao_atendeu','reagendou')

      UNION ALL

      SELECT 'eleicao_pessoas'::text as tabela, p.id, p.telefone,
             COALESCE(p.tentativas_count,0) as tentativas, p.created_at, p.ligacao_status, p.proxima_tentativa_em, 2 as priority
      FROM public.eleicao_pessoas p
      WHERE v_lista_id IS NULL AND p.client_id = _client_id
        AND p.campanha_id IS NOT NULL
        AND p.telefone IS NOT NULL
        AND length(btrim(p.telefone)) >= 8
        AND (_campanha_id IS NULL OR p.campanha_id = _campanha_id)
        AND p.campanha_id IN (SELECT campanha_id FROM allowed)
        AND (p.assigned_operador_id IS NULL OR p.assigned_operador_id = v_op_id)
        AND COALESCE(p.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')
    )
    SELECT c.tabela, c.id, c.telefone, c.tentativas, c.created_at
    FROM candidates c
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id = _client_id AND a.tabela = c.tabela
     AND a.contato_id = c.id AND a.expires_at > now()
    WHERE a.id IS NULL
      AND (c.proxima_tentativa_em IS NULL OR c.proxima_tentativa_em <= now())
      AND lower(btrim(COALESCE(c.telefone,''))) NOT IN (SELECT tel FROM locked_phones WHERE tel IS NOT NULL AND tel <> '')
    ORDER BY
      c.priority ASC,
      CASE WHEN c.ligacao_status IS NULL OR c.ligacao_status = 'pendente' THEN 0 ELSE 1 END,
      c.tentativas ASC,
      c.created_at ASC
    LIMIT 50
  LOOP
    BEGIN
      INSERT INTO public.telemarketing_call_assignments(
        client_id, tabela, contato_id, operador_nome, expires_at)
      VALUES (_client_id, v_cand.tabela, v_cand.id, _nome, v_expires);
      v_inserted := true;
    EXCEPTION WHEN unique_violation THEN
      v_inserted := false;
    END;

    IF v_inserted THEN
      RETURN jsonb_build_object('found', true, 'tabela', v_cand.tabela, 'contato_id', v_cand.id,
        'expires_at', v_expires, 'lista_id', v_lista_id);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('found', false, 'lista_id', v_lista_id);
END;
$function$;

-- 5. Trava do operador: lista de contatos
CREATE OR REPLACE FUNCTION public.tele_list_contatos(_client_id uuid, _nome text, _senha text, _campanha_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(id uuid, nome text, telefone text, cidade text, bairro text, ligacao_status text, vota_candidato text, candidato_alternativo text, operador_nome text, ligacao_em timestamp with time zone, tipo text, tabela text, proxima_tentativa_em timestamp with time zone, tentativas_count integer, observacao_tele text, locked_by text, locked_until timestamp with time zone, campanha_id uuid, indicador_nome text, indicador_tipo text, lista_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_op_id uuid;
  v_lista_id uuid;
BEGIN
  v_op_id := public._tele_assert_operador(_client_id, _nome, _senha);

  SELECT op.lista_atual_id INTO v_lista_id
    FROM public.telemarketing_operadores AS op
   WHERE op.id = v_op_id;

  RETURN QUERY
  WITH allowed AS (
    SELECT co.campanha_id FROM public.telemarketing_campanha_operadores co
     WHERE co.client_id = _client_id AND co.operador_id = v_op_id AND co.ativo = true
  )
    SELECT av.id, av.nome, av.telefone, av.cidade, av.bairro,
           av.ligacao_status, av.vota_candidato, av.candidato_alternativo,
           av.operador_nome, av.ligacao_em, 'avulso'::text, 'contatos_avulsos'::text,
           av.proxima_tentativa_em, COALESCE(av.tentativas_count, 0), av.observacao_tele,
           a.operador_nome, a.expires_at, av.campanha_id,
           NULL::text, NULL::text, av.lista_id
      FROM public.telemarketing_contatos_avulsos AS av
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = av.client_id AND a.tabela = 'contatos_avulsos'
       AND a.contato_id = av.id AND a.expires_at > now()
     WHERE av.client_id = _client_id
       AND av.ativo = true
       AND (_campanha_id IS NULL OR av.campanha_id = _campanha_id)
       AND av.campanha_id IN (SELECT campanha_id FROM allowed)
       AND (av.assigned_operador_id IS NULL OR av.assigned_operador_id = v_op_id)
       AND (v_lista_id IS NULL OR av.lista_id = v_lista_id)

    UNION ALL

    SELECT c.id, c.nome, c.telefone, c.cidade, c.bairro,
           c.ligacao_status, c.vota_candidato, c.candidato_alternativo,
           c.operador_nome, c.ligacao_em,
           CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END, 'contratados'::text,
           c.proxima_tentativa_em, COALESCE(c.tentativas_count, 0), c.observacao_tele,
           a.operador_nome, a.expires_at, c.campanha_id,
           NULL::text, NULL::text, NULL::uuid
      FROM public.contratados AS c
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = c.client_id AND a.tabela = 'contratados'
       AND a.contato_id = c.id AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND c.client_id = _client_id
       AND (_campanha_id IS NULL OR c.campanha_id = _campanha_id)
       AND c.campanha_id IN (SELECT campanha_id FROM allowed)

    UNION ALL

    SELECT i.id, i.nome, i.telefone, i.cidade, i.bairro,
           i.ligacao_status, i.vota_candidato, i.candidato_alternativo,
           i.operador_nome, i.ligacao_em, 'indicado'::text, 'contratado_indicados'::text,
           i.proxima_tentativa_em, COALESCE(i.tentativas_count, 0), i.observacao_tele,
           a.operador_nome, a.expires_at, i.campanha_id,
           NULL::text, NULL::text, NULL::uuid
      FROM public.contratado_indicados AS i
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = i.client_id AND a.tabela = 'contratado_indicados'
       AND a.contato_id = i.id AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND i.client_id = _client_id
       AND (_campanha_id IS NULL OR i.campanha_id = _campanha_id)
       AND i.campanha_id IN (SELECT campanha_id FROM allowed)

    UNION ALL

    SELECT ei.id, ei.nome, ei.telefone, ei.cidade, ei.bairro,
           ei.ultimo_status_ligacao, ei.vota_candidato, ei.candidato_alternativo,
           ei.operador_nome, ei.ultima_ligacao_em, 'indicado_eleicao'::text, 'eleicao_indicados'::text,
           ei.proxima_tentativa_em, COALESCE(ei.total_tentativas, 0), ei.observacao_tele,
           a.operador_nome, a.expires_at, ei.campanha_id,
           p.nome, ei.indicador_tipo::text, NULL::uuid
      FROM public.eleicao_indicados AS ei
      LEFT JOIN public.eleicao_pessoas AS p ON p.id = ei.indicador_id
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = ei.client_id AND a.tabela = 'eleicao_indicados'
       AND a.contato_id = ei.id AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND ei.client_id = _client_id
       AND ei.campanha_id IS NOT NULL
       AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
       AND ei.campanha_id IN (SELECT campanha_id FROM allowed)
       AND (ei.assigned_operador_id IS NULL OR ei.assigned_operador_id = v_op_id)

    UNION ALL

    SELECT ep.id, ep.nome, ep.telefone, ep.cidade, ep.bairro,
           ep.ligacao_status, ep.vota_candidato, ep.candidato_alternativo,
           ep.operador_nome, ep.ligacao_em, ep.tipo::text, 'eleicao_pessoas'::text,
           ep.proxima_tentativa_em, COALESCE(ep.tentativas_count, 0), ep.observacao_tele,
           a.operador_nome, a.expires_at, ep.campanha_id,
           NULL::text, NULL::text, NULL::uuid
      FROM public.eleicao_pessoas AS ep
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = ep.client_id AND a.tabela = 'eleicao_pessoas'
       AND a.contato_id = ep.id AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND ep.client_id = _client_id
       AND ep.campanha_id IS NOT NULL
       AND ep.telefone IS NOT NULL
       AND length(regexp_replace(COALESCE(ep.telefone,''),'\D','','g')) >= 8
       AND (_campanha_id IS NULL OR ep.campanha_id = _campanha_id)
       AND ep.campanha_id IN (SELECT campanha_id FROM allowed)
       AND (ep.assigned_operador_id IS NULL OR ep.assigned_operador_id = v_op_id);
END;
$function$;

-- 6. Trava do operador: busca de contato
CREATE OR REPLACE FUNCTION public.tele_buscar_contato(_client_id uuid, _nome text, _senha text, _termo text, _campanha_id uuid DEFAULT NULL::uuid, _limite integer DEFAULT 30)
 RETURNS TABLE(id uuid, nome text, telefone text, cidade text, bairro text, ligacao_status text, vota_candidato text, candidato_alternativo text, operador_nome text, ligacao_em timestamp with time zone, tipo text, tabela text, proxima_tentativa_em timestamp with time zone, tentativas_count integer, observacao_tele text, locked_by text, locked_until timestamp with time zone, campanha_id uuid, indicador_nome text, indicador_tipo text, lista_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_op_id uuid;
  v_lista_id uuid;
  v_termo text;
  v_digits text;
  v_like text;
  v_lim integer;
BEGIN
  v_op_id := public._tele_assert_operador(_client_id, _nome, _senha);

  SELECT op.lista_atual_id INTO v_lista_id
    FROM public.telemarketing_operadores AS op
   WHERE op.id = v_op_id;

  v_termo := btrim(COALESCE(_termo, ''));
  IF length(v_termo) < 3 THEN
    RETURN;
  END IF;
  v_like := '%' || lower(v_termo) || '%';
  v_digits := regexp_replace(v_termo, '\D', '', 'g');
  IF length(v_digits) > 8 THEN
    v_digits := right(v_digits, 8);
  END IF;
  v_lim := LEAST(GREATEST(COALESCE(_limite, 30), 1), 100);

  RETURN QUERY
  WITH allowed AS (
    SELECT co.campanha_id FROM public.telemarketing_campanha_operadores co
     WHERE co.client_id = _client_id AND co.operador_id = v_op_id AND co.ativo = true
  ),
  base AS (
    SELECT av.id, av.nome, av.telefone, av.cidade, av.bairro,
           av.ligacao_status, av.vota_candidato, av.candidato_alternativo,
           av.operador_nome, av.ligacao_em, 'avulso'::text AS tipo, 'contatos_avulsos'::text AS tabela,
           av.proxima_tentativa_em, COALESCE(av.tentativas_count, 0) AS tentativas_count, av.observacao_tele,
           a.operador_nome AS locked_by, a.expires_at AS locked_until, av.campanha_id,
           NULL::text AS indicador_nome, NULL::text AS indicador_tipo, av.lista_id
      FROM public.telemarketing_contatos_avulsos AS av
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = av.client_id AND a.tabela = 'contatos_avulsos'
       AND a.contato_id = av.id AND a.expires_at > now()
     WHERE av.client_id = _client_id
       AND av.ativo = true
       AND (_campanha_id IS NULL OR av.campanha_id = _campanha_id)
       AND av.campanha_id IN (SELECT campanha_id FROM allowed)
       AND (av.assigned_operador_id IS NULL OR av.assigned_operador_id = v_op_id)
       AND (v_lista_id IS NULL OR av.lista_id = v_lista_id)

    UNION ALL

    SELECT c.id, c.nome, c.telefone, c.cidade, c.bairro,
           c.ligacao_status, c.vota_candidato, c.candidato_alternativo,
           c.operador_nome, c.ligacao_em,
           CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END, 'contratados'::text,
           c.proxima_tentativa_em, COALESCE(c.tentativas_count, 0), c.observacao_tele,
           a.operador_nome, a.expires_at, c.campanha_id,
           NULL::text, NULL::text, NULL::uuid
      FROM public.contratados AS c
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = c.client_id AND a.tabela = 'contratados'
       AND a.contato_id = c.id AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND c.client_id = _client_id
       AND (_campanha_id IS NULL OR c.campanha_id = _campanha_id)
       AND c.campanha_id IN (SELECT campanha_id FROM allowed)

    UNION ALL

    SELECT i.id, i.nome, i.telefone, i.cidade, i.bairro,
           i.ligacao_status, i.vota_candidato, i.candidato_alternativo,
           i.operador_nome, i.ligacao_em, 'indicado'::text, 'contratado_indicados'::text,
           i.proxima_tentativa_em, COALESCE(i.tentativas_count, 0), i.observacao_tele,
           a.operador_nome, a.expires_at, i.campanha_id,
           NULL::text, NULL::text, NULL::uuid
      FROM public.contratado_indicados AS i
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = i.client_id AND a.tabela = 'contratado_indicados'
       AND a.contato_id = i.id AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND i.client_id = _client_id
       AND (_campanha_id IS NULL OR i.campanha_id = _campanha_id)
       AND i.campanha_id IN (SELECT campanha_id FROM allowed)

    UNION ALL

    SELECT ei.id, ei.nome, ei.telefone, ei.cidade, ei.bairro,
           ei.ultimo_status_ligacao, ei.vota_candidato, ei.candidato_alternativo,
           ei.operador_nome, ei.ultima_ligacao_em, 'indicado_eleicao'::text, 'eleicao_indicados'::text,
           ei.proxima_tentativa_em, COALESCE(ei.total_tentativas, 0), ei.observacao_tele,
           a.operador_nome, a.expires_at, ei.campanha_id,
           p.nome, ei.indicador_tipo::text, NULL::uuid
      FROM public.eleicao_indicados AS ei
      LEFT JOIN public.eleicao_pessoas AS p ON p.id = ei.indicador_id
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = ei.client_id AND a.tabela = 'eleicao_indicados'
       AND a.contato_id = ei.id AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND ei.client_id = _client_id
       AND ei.campanha_id IS NOT NULL
       AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
       AND ei.campanha_id IN (SELECT campanha_id FROM allowed)
       AND (ei.assigned_operador_id IS NULL OR ei.assigned_operador_id = v_op_id)

    UNION ALL

    SELECT ep.id, ep.nome, ep.telefone, ep.cidade, ep.bairro,
           ep.ligacao_status, ep.vota_candidato, ep.candidato_alternativo,
           ep.operador_nome, ep.ligacao_em, ep.tipo::text, 'eleicao_pessoas'::text,
           ep.proxima_tentativa_em, COALESCE(ep.tentativas_count, 0), ep.observacao_tele,
           a.operador_nome, a.expires_at, ep.campanha_id,
           NULL::text, NULL::text, NULL::uuid
      FROM public.eleicao_pessoas AS ep
      LEFT JOIN public.telemarketing_call_assignments AS a
        ON a.client_id = ep.client_id AND a.tabela = 'eleicao_pessoas'
       AND a.contato_id = ep.id AND a.expires_at > now()
     WHERE v_lista_id IS NULL
       AND ep.client_id = _client_id
       AND ep.campanha_id IS NOT NULL
       AND ep.telefone IS NOT NULL
       AND (_campanha_id IS NULL OR ep.campanha_id = _campanha_id)
       AND ep.campanha_id IN (SELECT campanha_id FROM allowed)
       AND (ep.assigned_operador_id IS NULL OR ep.assigned_operador_id = v_op_id)
  )
  SELECT b.*
    FROM base AS b
   WHERE lower(COALESCE(b.nome, '')) LIKE v_like
      OR (
        length(v_digits) >= 6
        AND regexp_replace(COALESCE(b.telefone, ''), '\D', '', 'g') LIKE '%' || v_digits
      )
   ORDER BY b.nome
   LIMIT v_lim;
END;
$function$;

-- 7. Filas visíveis para o operador
CREATE OR REPLACE FUNCTION public.tele_operador_campanhas(_client_id uuid, _nome text, _senha text)
 RETURNS TABLE(campanha_id uuid, nome text, descricao text, pendentes_meus bigint, pendentes_livres bigint, total_meus bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_operador_id uuid;
BEGIN
  v_operador_id := public._tele_assert_operador(_client_id, _nome, _senha);

  RETURN QUERY
  WITH allowed AS (
    SELECT co.campanha_id FROM public.telemarketing_campanha_operadores co
     WHERE co.client_id = _client_id AND co.operador_id = v_operador_id AND co.ativo = true
  ),
  mine AS (
    SELECT t.campanha_id,
           count(*) FILTER (WHERE COALESCE(t.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')) AS pend,
           count(*) AS tot
      FROM public.telemarketing_contatos_avulsos t
     WHERE t.client_id = _client_id AND t.ativo = true
       AND t.assigned_operador_id = v_operador_id
     GROUP BY t.campanha_id
  ),
  free AS (
    SELECT t.campanha_id,
           count(*) FILTER (WHERE COALESCE(t.ligacao_status,'pendente') IN ('pendente','nao_atendeu','reagendou')) AS pend
      FROM public.telemarketing_contatos_avulsos t
     WHERE t.client_id = _client_id AND t.ativo = true
       AND t.assigned_operador_id IS NULL
     GROUP BY t.campanha_id
  )
  SELECT c.id, c.nome, c.descricao,
         COALESCE(m.pend, 0), COALESCE(f.pend, 0), COALESCE(m.tot, 0)
    FROM public.telemarketing_campanhas c
    LEFT JOIN mine m ON m.campanha_id = c.id
    LEFT JOIN free f ON f.campanha_id = c.id
   WHERE c.client_id = _client_id
     AND c.ativo = true
     AND c.id IN (SELECT campanha_id FROM allowed)
   ORDER BY (COALESCE(m.pend, 0) + COALESCE(f.pend, 0)) DESC, c.nome ASC;
END;
$function$;

-- 8. Resumo da fila com contagem de operadores marcados
DROP FUNCTION IF EXISTS public.tele_fila_summary(uuid);
CREATE OR REPLACE FUNCTION public.tele_fila_summary(_client_id uuid)
 RETURNS TABLE(campanha_id uuid, nome text, descricao text, ativo boolean, created_at timestamp with time zone, total bigint, ligados bigint, pendentes bigint, confirmados bigint, operadores_marcados bigint, modo_designacao text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH base AS (
    SELECT campanha_id, ligacao_status, vota_candidato FROM public.contratados WHERE client_id=_client_id AND campanha_id IS NOT NULL
    UNION ALL
    SELECT campanha_id, ligacao_status, vota_candidato FROM public.contratado_indicados WHERE client_id=_client_id AND campanha_id IS NOT NULL
    UNION ALL
    SELECT campanha_id, ligacao_status, vota_candidato FROM public.telemarketing_contatos_avulsos WHERE client_id=_client_id AND campanha_id IS NOT NULL AND ativo=true
    UNION ALL
    SELECT campanha_id, ultimo_status_ligacao, vota_candidato FROM public.eleicao_indicados WHERE client_id=_client_id AND campanha_id IS NOT NULL
    UNION ALL
    SELECT campanha_id, ligacao_status, vota_candidato FROM public.eleicao_pessoas WHERE client_id=_client_id AND campanha_id IS NOT NULL AND telefone IS NOT NULL
  ),
  ops AS (
    SELECT co.campanha_id, count(*)::bigint AS marcados
      FROM public.telemarketing_campanha_operadores co
      JOIN public.telemarketing_operadores o ON o.id = co.operador_id AND o.ativo = true
     WHERE co.client_id = _client_id AND co.ativo = true
     GROUP BY co.campanha_id
  )
  SELECT c.id, c.nome, c.descricao, c.ativo, c.created_at,
         COALESCE(COUNT(b.*),0)::bigint AS total,
         COALESCE(COUNT(b.*) FILTER (WHERE b.ligacao_status IS NOT NULL AND b.ligacao_status <> 'pendente'),0)::bigint AS ligados,
         COALESCE(COUNT(b.*) FILTER (WHERE b.ligacao_status IS NULL OR b.ligacao_status='pendente'),0)::bigint AS pendentes,
         COALESCE(COUNT(b.*) FILTER (WHERE b.ligacao_status='atendeu' AND b.vota_candidato='sim'),0)::bigint AS confirmados,
         COALESCE(MAX(o.marcados),0)::bigint AS operadores_marcados,
         COALESCE(c.modo_designacao,'compartilhada') AS modo_designacao
  FROM public.telemarketing_campanhas c
  LEFT JOIN base b ON b.campanha_id = c.id
  LEFT JOIN ops o ON o.campanha_id = c.id
  WHERE c.client_id=_client_id
  GROUP BY c.id, c.nome, c.descricao, c.ativo, c.created_at, c.modo_designacao
  ORDER BY c.created_at DESC;
$function$;

-- 9. Ler operadores de uma fila (admin)
CREATE OR REPLACE FUNCTION public.tele_fila_operadores(_client_id uuid, _campanha_id uuid)
 RETURNS TABLE(operador_id uuid, nome text, ativo boolean, marcado boolean, pendentes bigint, ligados bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  RETURN QUERY
  WITH contatos AS (
    SELECT av.assigned_operador_id AS op, av.ligacao_status AS st
      FROM public.telemarketing_contatos_avulsos av
     WHERE av.client_id = _client_id AND av.campanha_id = _campanha_id AND av.ativo = true
    UNION ALL
    SELECT ei.assigned_operador_id, ei.ultimo_status_ligacao
      FROM public.eleicao_indicados ei
     WHERE ei.client_id = _client_id AND ei.campanha_id = _campanha_id
    UNION ALL
    SELECT ep.assigned_operador_id, ep.ligacao_status
      FROM public.eleicao_pessoas ep
     WHERE ep.client_id = _client_id AND ep.campanha_id = _campanha_id
  ),
  agg AS (
    SELECT op,
           count(*) FILTER (WHERE COALESCE(st,'pendente') IN ('pendente','nao_atendeu','reagendou'))::bigint AS pend,
           count(*) FILTER (WHERE st IS NOT NULL AND st <> 'pendente')::bigint AS lig
      FROM contatos WHERE op IS NOT NULL GROUP BY op
  )
  SELECT o.id, o.nome, o.ativo,
         EXISTS (SELECT 1 FROM public.telemarketing_campanha_operadores co
                  WHERE co.campanha_id = _campanha_id AND co.operador_id = o.id AND co.ativo = true) AS marcado,
         COALESCE(a.pend,0), COALESCE(a.lig,0)
    FROM public.telemarketing_operadores o
    LEFT JOIN agg a ON a.op = o.id
   WHERE o.client_id = _client_id
   ORDER BY o.ativo DESC, o.nome;
END;
$function$;

-- 10. Salvar operadores da fila (admin)
CREATE OR REPLACE FUNCTION public.tele_fila_set_operadores(
  _client_id uuid,
  _campanha_id uuid,
  _operador_ids uuid[],
  _modo text DEFAULT 'compartilhada',
  _acao_remocao text DEFAULT 'devolver',
  _repassar_para uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_removidos uuid[];
  v_afetados integer := 0;
  v_n integer;
  v_ids uuid[] := COALESCE(_operador_ids, ARRAY[]::uuid[]);
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);

  IF NOT EXISTS (SELECT 1 FROM public.telemarketing_campanhas c
                  WHERE c.id = _campanha_id AND c.client_id = _client_id) THEN
    RAISE EXCEPTION 'Fila não encontrada';
  END IF;

  IF _acao_remocao = 'repassar' AND _repassar_para IS NULL THEN
    RAISE EXCEPTION 'Escolha o operador que vai receber os contatos';
  END IF;

  SELECT COALESCE(array_agg(co.operador_id), ARRAY[]::uuid[]) INTO v_removidos
    FROM public.telemarketing_campanha_operadores co
   WHERE co.campanha_id = _campanha_id AND co.ativo = true
     AND NOT (co.operador_id = ANY (v_ids));

  -- marca / desmarca
  UPDATE public.telemarketing_campanha_operadores
     SET ativo = false
   WHERE campanha_id = _campanha_id AND ativo = true AND NOT (operador_id = ANY (v_ids));

  INSERT INTO public.telemarketing_campanha_operadores (client_id, campanha_id, operador_id, ativo)
  SELECT _client_id, _campanha_id, x, true
    FROM unnest(v_ids) AS x
  ON CONFLICT (campanha_id, operador_id) DO UPDATE SET ativo = true, updated_at = now();

  UPDATE public.telemarketing_campanhas
     SET modo_designacao = CASE WHEN _modo IN ('compartilhada','dividida') THEN _modo ELSE 'compartilhada' END
   WHERE id = _campanha_id AND client_id = _client_id;

  -- contatos de quem saiu
  IF array_length(v_removidos, 1) IS NOT NULL AND _acao_remocao <> 'manter' THEN
    UPDATE public.telemarketing_contatos_avulsos
       SET assigned_operador_id = CASE WHEN _acao_remocao = 'repassar' THEN _repassar_para ELSE NULL END
     WHERE client_id = _client_id AND campanha_id = _campanha_id
       AND assigned_operador_id = ANY (v_removidos);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_afetados := v_afetados + v_n;

    UPDATE public.eleicao_indicados
       SET assigned_operador_id = CASE WHEN _acao_remocao = 'repassar' THEN _repassar_para ELSE NULL END
     WHERE client_id = _client_id AND campanha_id = _campanha_id
       AND assigned_operador_id = ANY (v_removidos);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_afetados := v_afetados + v_n;

    UPDATE public.eleicao_pessoas
       SET assigned_operador_id = CASE WHEN _acao_remocao = 'repassar' THEN _repassar_para ELSE NULL END
     WHERE client_id = _client_id AND campanha_id = _campanha_id
       AND assigned_operador_id = ANY (v_removidos);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_afetados := v_afetados + v_n;
  END IF;

  -- libera travas ativas de quem saiu nesta fila
  DELETE FROM public.telemarketing_call_assignments a
   WHERE a.client_id = _client_id
     AND a.operador_nome IN (SELECT o.nome FROM public.telemarketing_operadores o
                              WHERE o.id = ANY (COALESCE(v_removidos, ARRAY[]::uuid[])));

  RETURN jsonb_build_object(
    'ok', true,
    'marcados', COALESCE(array_length(v_ids,1),0),
    'removidos', COALESCE(array_length(v_removidos,1),0),
    'contatos_afetados', v_afetados
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.tele_fila_operadores(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_fila_set_operadores(uuid, uuid, uuid[], text, text, uuid) TO authenticated;