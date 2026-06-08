
-- 1. Vincular contatos a uma campanha
ALTER TABLE public.contratados
  ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES public.telemarketing_campanhas(id) ON DELETE SET NULL;
ALTER TABLE public.contratado_indicados
  ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES public.telemarketing_campanhas(id) ON DELETE SET NULL;
ALTER TABLE public.eleicao_pessoas
  ADD COLUMN IF NOT EXISTS campanha_id uuid REFERENCES public.telemarketing_campanhas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contratados_campanha ON public.contratados(client_id, campanha_id);
CREATE INDEX IF NOT EXISTS idx_contratado_indicados_campanha ON public.contratado_indicados(client_id, campanha_id);
CREATE INDEX IF NOT EXISTS idx_eleicao_pessoas_campanha ON public.eleicao_pessoas(client_id, campanha_id);

-- 2. tele_list_contatos com filtro opcional por campanha
DROP FUNCTION IF EXISTS public.tele_list_contatos(uuid, text, text);
DROP FUNCTION IF EXISTS public.tele_list_contatos(uuid, text, text, uuid);
CREATE OR REPLACE FUNCTION public.tele_list_contatos(
  _client_id uuid, _nome text, _senha text, _campanha_id uuid DEFAULT NULL
) RETURNS TABLE(
  id uuid, nome text, telefone text, cidade text, bairro text,
  ligacao_status text, vota_candidato text, candidato_alternativo text,
  operador_nome text, ligacao_em timestamptz, tipo text, tabela text,
  proxima_tentativa_em timestamptz, tentativas_count integer, observacao_tele text,
  locked_by text, locked_until timestamptz, campanha_id uuid,
  indicador_nome text, indicador_tipo text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
BEGIN
  PERFORM public._tele_assert_operador(_client_id, _nome, _senha);

  RETURN QUERY
    SELECT c.id, c.nome, c.telefone, c.cidade, c.bairro,
           c.ligacao_status, c.vota_candidato, c.candidato_alternativo,
           c.operador_nome, c.ligacao_em,
           CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END, 'contratados'::text,
           c.proxima_tentativa_em, COALESCE(c.tentativas_count,0), c.observacao_tele,
           a.operador_nome, a.expires_at, c.campanha_id,
           NULL::text, NULL::text
    FROM public.contratados c
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=c.client_id AND a.tabela='contratados' AND a.contato_id=c.id AND a.expires_at>now()
    WHERE c.client_id=_client_id
      AND (_campanha_id IS NULL OR c.campanha_id = _campanha_id)
    UNION ALL
    SELECT i.id, i.nome, i.telefone, i.cidade, i.bairro,
           i.ligacao_status, i.vota_candidato, i.candidato_alternativo,
           i.operador_nome, i.ligacao_em,
           'indicado'::text, 'contratado_indicados'::text,
           i.proxima_tentativa_em, COALESCE(i.tentativas_count,0), i.observacao_tele,
           a.operador_nome, a.expires_at, i.campanha_id,
           NULL::text, NULL::text
    FROM public.contratado_indicados i
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=i.client_id AND a.tabela='contratado_indicados' AND a.contato_id=i.id AND a.expires_at>now()
    WHERE i.client_id=_client_id
      AND (_campanha_id IS NULL OR i.campanha_id = _campanha_id)
    UNION ALL
    SELECT av.id, av.nome, av.telefone, av.cidade, av.bairro,
           av.ligacao_status, av.vota_candidato, av.candidato_alternativo,
           av.operador_nome, av.ligacao_em,
           'avulso'::text, 'contatos_avulsos'::text,
           av.proxima_tentativa_em, COALESCE(av.tentativas_count,0), av.observacao_tele,
           a.operador_nome, a.expires_at, av.campanha_id,
           NULL::text, NULL::text
    FROM public.telemarketing_contatos_avulsos av
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=av.client_id AND a.tabela='contatos_avulsos' AND a.contato_id=av.id AND a.expires_at>now()
    WHERE av.client_id=_client_id AND av.ativo=true
      AND (_campanha_id IS NULL OR av.campanha_id = _campanha_id)
    UNION ALL
    SELECT ei.id, ei.nome, ei.telefone, ei.cidade, ei.bairro,
           ei.ultimo_status_ligacao, ei.vota_candidato, ei.candidato_alternativo,
           ei.operador_nome, ei.ultima_ligacao_em,
           'eleicao_indicado'::text, 'eleicao_indicados'::text,
           ei.proxima_tentativa_em, COALESCE(ei.total_tentativas,0), ei.observacao_tele,
           a.operador_nome, a.expires_at, ei.campanha_id,
           ep.nome, ei.indicador_tipo::text
    FROM public.eleicao_indicados ei
    LEFT JOIN public.eleicao_pessoas ep ON ep.id = ei.indicador_id
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=ei.client_id AND a.tabela='eleicao_indicados' AND a.contato_id=ei.id AND a.expires_at>now()
    WHERE ei.client_id=_client_id
      AND ei.campanha_id IS NOT NULL
      AND (_campanha_id IS NULL OR ei.campanha_id = _campanha_id)
    UNION ALL
    SELECT p.id, p.nome, p.telefone, p.cidade, p.bairro,
           p.ligacao_status, p.vota_candidato, p.candidato_alternativo,
           p.operador_nome, p.ligacao_em,
           'estrutura'::text, 'eleicao_pessoas'::text,
           p.proxima_tentativa_em, COALESCE(p.tentativas_count,0), p.observacao_tele,
           a.operador_nome, a.expires_at, p.campanha_id,
           NULL::text, p.tipo::text
    FROM public.eleicao_pessoas p
    LEFT JOIN public.telemarketing_call_assignments a
      ON a.client_id=p.client_id AND a.tabela='eleicao_pessoas' AND a.contato_id=p.id AND a.expires_at>now()
    WHERE p.client_id=_client_id
      AND p.telefone IS NOT NULL
      AND length(btrim(p.telefone)) >= 8
      AND (_campanha_id IS NULL OR p.campanha_id = _campanha_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_list_contatos(uuid, text, text, uuid) TO anon, authenticated, service_role;

-- 3. Listagem de campanhas com contadores (para o painel "Filas")
CREATE OR REPLACE FUNCTION public.tele_fila_summary(_client_id uuid)
RETURNS TABLE(
  campanha_id uuid, nome text, descricao text, ativo boolean, created_at timestamptz,
  total bigint, ligados bigint, pendentes bigint, confirmados bigint
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  )
  SELECT c.id, c.nome, c.descricao, c.ativo, c.created_at,
         COALESCE(COUNT(b.*),0)::bigint AS total,
         COALESCE(COUNT(b.*) FILTER (WHERE b.ligacao_status IS NOT NULL AND b.ligacao_status <> 'pendente'),0)::bigint AS ligados,
         COALESCE(COUNT(b.*) FILTER (WHERE b.ligacao_status IS NULL OR b.ligacao_status='pendente'),0)::bigint AS pendentes,
         COALESCE(COUNT(b.*) FILTER (WHERE b.ligacao_status='atendeu' AND b.vota_candidato='sim'),0)::bigint AS confirmados
  FROM public.telemarketing_campanhas c
  LEFT JOIN base b ON b.campanha_id = c.id
  WHERE c.client_id=_client_id
  GROUP BY c.id, c.nome, c.descricao, c.ativo, c.created_at
  ORDER BY c.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.tele_fila_summary(uuid) TO authenticated, service_role;

-- 4. Assistente "Nova fila" — cria campanha + atribui contatos por origem
CREATE OR REPLACE FUNCTION public.tele_create_fila_wizard(
  _client_id uuid,
  _nome text,
  _descricao text,
  _script_intro text,
  _script_perguntas text[],
  _tags_rapidas text[],
  _origem text,           -- 'csv' | 'estrutura' | 'indicados_eleicao' | 'contratados' | 'indicados_contratados'
  _filtros jsonb DEFAULT '{}'::jsonb,
  _csv_rows jsonb DEFAULT '[]'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE
  v_campanha_id uuid;
  v_total int := 0;
  v_cidade text := NULLIF(trim(COALESCE(_filtros->>'cidade','')),'');
  v_bairro text := NULLIF(trim(COALESCE(_filtros->>'bairro','')),'');
  v_tipo   text := NULLIF(trim(COALESCE(_filtros->>'tipo','')),'');           -- usado por 'estrutura' e 'indicados_eleicao'
  v_indicador_id uuid := NULLIF(_filtros->>'indicador_id','')::uuid;
  v_apenas_pendentes boolean := COALESCE((_filtros->>'apenas_pendentes')::boolean, true);
  v_substituir boolean := COALESCE((_filtros->>'substituir')::boolean, false);
BEGIN
  IF _client_id IS NULL OR NULLIF(trim(_nome),'') IS NULL THEN
    RAISE EXCEPTION 'Cliente e nome são obrigatórios';
  END IF;

  INSERT INTO public.telemarketing_campanhas(
    client_id, nome, descricao, script_intro, script_perguntas, tags_rapidas, ativo
  ) VALUES (
    _client_id, trim(_nome), NULLIF(trim(COALESCE(_descricao,'')),''),
    NULLIF(trim(COALESCE(_script_intro,'')),''),
    COALESCE(_script_perguntas, ARRAY[]::text[]),
    COALESCE(_tags_rapidas, ARRAY[]::text[]),
    true
  ) RETURNING id INTO v_campanha_id;

  IF _origem = 'csv' THEN
    INSERT INTO public.telemarketing_contatos_avulsos(
      client_id, campanha_id, nome, telefone, cidade, bairro, ativo
    )
    SELECT _client_id, v_campanha_id,
      NULLIF(trim(r->>'nome'),''), NULLIF(regexp_replace(r->>'telefone','\D','','g'),''),
      NULLIF(trim(r->>'cidade'),''), NULLIF(trim(r->>'bairro'),''), true
    FROM jsonb_array_elements(_csv_rows) r
    WHERE NULLIF(trim(r->>'nome'),'') IS NOT NULL
      AND length(regexp_replace(COALESCE(r->>'telefone',''),'\D','','g')) >= 8;
    GET DIAGNOSTICS v_total = ROW_COUNT;

  ELSIF _origem = 'estrutura' THEN
    UPDATE public.eleicao_pessoas p
       SET campanha_id = v_campanha_id
     WHERE p.client_id = _client_id
       AND p.telefone IS NOT NULL AND length(btrim(p.telefone)) >= 8
       AND (v_substituir OR p.campanha_id IS NULL)
       AND (v_cidade IS NULL OR p.cidade ILIKE v_cidade)
       AND (v_bairro IS NULL OR p.bairro ILIKE v_bairro)
       AND (v_tipo   IS NULL OR p.tipo::text = v_tipo)
       AND (NOT v_apenas_pendentes OR p.ligacao_status IS NULL OR p.ligacao_status='pendente');
    GET DIAGNOSTICS v_total = ROW_COUNT;

  ELSIF _origem = 'indicados_eleicao' THEN
    UPDATE public.eleicao_indicados ei
       SET campanha_id = v_campanha_id
     WHERE ei.client_id = _client_id
       AND ei.telefone IS NOT NULL AND length(btrim(ei.telefone)) >= 8
       AND (v_substituir OR ei.campanha_id IS NULL)
       AND (v_cidade IS NULL OR ei.cidade ILIKE v_cidade)
       AND (v_bairro IS NULL OR ei.bairro ILIKE v_bairro)
       AND (v_indicador_id IS NULL OR ei.indicador_id = v_indicador_id)
       AND (v_tipo IS NULL OR ei.indicador_tipo::text = v_tipo)
       AND (NOT v_apenas_pendentes OR ei.ultimo_status_ligacao IS NULL OR ei.ultimo_status_ligacao='pendente');
    GET DIAGNOSTICS v_total = ROW_COUNT;

  ELSIF _origem = 'contratados' THEN
    UPDATE public.contratados c
       SET campanha_id = v_campanha_id
     WHERE c.client_id = _client_id
       AND c.telefone IS NOT NULL AND length(btrim(c.telefone)) >= 8
       AND (v_substituir OR c.campanha_id IS NULL)
       AND (v_cidade IS NULL OR c.cidade ILIKE v_cidade)
       AND (v_bairro IS NULL OR c.bairro ILIKE v_bairro)
       AND (v_tipo IS NULL
            OR (v_tipo='lider' AND c.is_lider=true)
            OR (v_tipo='liderado' AND COALESCE(c.is_lider,false)=false))
       AND (NOT v_apenas_pendentes OR c.ligacao_status IS NULL OR c.ligacao_status='pendente');
    GET DIAGNOSTICS v_total = ROW_COUNT;

  ELSIF _origem = 'indicados_contratados' THEN
    UPDATE public.contratado_indicados i
       SET campanha_id = v_campanha_id
     WHERE i.client_id = _client_id
       AND i.telefone IS NOT NULL AND length(btrim(i.telefone)) >= 8
       AND (v_substituir OR i.campanha_id IS NULL)
       AND (v_cidade IS NULL OR i.cidade ILIKE v_cidade)
       AND (v_bairro IS NULL OR i.bairro ILIKE v_bairro)
       AND (NOT v_apenas_pendentes OR i.ligacao_status IS NULL OR i.ligacao_status='pendente');
    GET DIAGNOSTICS v_total = ROW_COUNT;

  ELSE
    RAISE EXCEPTION 'Origem inválida: %', _origem;
  END IF;

  RETURN jsonb_build_object('campanha_id', v_campanha_id, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_create_fila_wizard(uuid, text, text, text, text[], text[], text, jsonb, jsonb) TO authenticated, service_role;

-- 5. Operador de teste rápido (idempotente)
CREATE OR REPLACE FUNCTION public.tele_ensure_test_operador(_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public','extensions'
AS $$
DECLARE v_senha text := 'teste1234'; v_id uuid;
BEGIN
  IF _client_id IS NULL THEN RAISE EXCEPTION 'client_id obrigatório'; END IF;

  SELECT id INTO v_id FROM public.telemarketing_operadores
   WHERE client_id=_client_id AND nome='Teste Admin';

  IF v_id IS NULL THEN
    INSERT INTO public.telemarketing_operadores(client_id, nome, senha, ativo)
    VALUES (_client_id, 'Teste Admin', extensions.crypt(v_senha, extensions.gen_salt('bf', 10)), true);
  ELSE
    UPDATE public.telemarketing_operadores
       SET senha = extensions.crypt(v_senha, extensions.gen_salt('bf', 10)),
           ativo=true, failed_attempts=0, locked_until=NULL,
           password_updated_at=now()
     WHERE id=v_id;
  END IF;

  RETURN jsonb_build_object('nome','Teste Admin','senha', v_senha);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_ensure_test_operador(uuid) TO authenticated, service_role;
