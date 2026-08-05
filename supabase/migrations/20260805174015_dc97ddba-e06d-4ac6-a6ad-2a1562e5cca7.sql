
-- 4. Função para listar resumo das listas por campanha
CREATE OR REPLACE FUNCTION public.tele_admin_resumo_listas(_client_id uuid, _campanha_id uuid DEFAULT NULL)
RETURNS TABLE (
    id uuid,
    campanha_id uuid,
    campanha_nome text,
    nome text,
    total integer,
    ligados integer,
    pendentes integer,
    criado_em timestamptz
) LANGUAGE plpgsql STABLE SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
    PERFORM public._tele_assert_client_admin(_client_id);
    RETURN QUERY
    SELECT 
        l.id,
        l.campanha_id,
        c.nome as campanha_nome,
        l.nome,
        l.total_contatos as total,
        (SELECT count(*)::int FROM public.telemarketing_contatos_avulsos a 
         WHERE a.lista_id = l.id AND a.ligacao_status IS NOT NULL AND a.ligacao_status <> 'pendente'),
        (SELECT count(*)::int FROM public.telemarketing_contatos_avulsos a 
         WHERE a.lista_id = l.id AND (a.ligacao_status IS NULL OR a.ligacao_status = 'pendente')),
        l.criado_em
    FROM public.telemarketing_listas l
    JOIN public.telemarketing_campanhas c ON c.id = l.campanha_id
    WHERE l.client_id = _client_id
      AND (_campanha_id IS NULL OR l.campanha_id = _campanha_id)
    ORDER BY l.criado_em DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_admin_resumo_listas(uuid, uuid) TO authenticated;

-- 5. Atualizar tele_import_contato_avulso_batch para aceitar um nome de lista e criar o registro
DROP FUNCTION IF EXISTS public.tele_import_contato_avulso_batch(uuid, uuid, jsonb, uuid);
DROP FUNCTION IF EXISTS public.tele_import_contato_avulso_batch(uuid, uuid, jsonb, uuid, boolean);

CREATE OR REPLACE FUNCTION public.tele_import_contato_avulso_batch(
    _client_id uuid,
    _campanha_id uuid,
    _rows jsonb,
    _assigned_operador_id uuid DEFAULT NULL,
    _skip_global_dupes boolean DEFAULT false,
    _lista_nome text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
    v_count integer := 0;
    v_lista_id uuid := NULL;
BEGIN
    PERFORM public._tele_assert_client_admin(_client_id);

    -- Criar a lista se um nome for fornecido
    IF _lista_nome IS NOT NULL THEN
        INSERT INTO public.telemarketing_listas (client_id, campanha_id, nome, total_contatos)
        VALUES (_client_id, _campanha_id, _lista_nome, jsonb_array_length(_rows))
        RETURNING id INTO v_lista_id;
    END IF;

    -- Inserção com tratamento de duplicidade opcional
    IF _skip_global_dupes THEN
        INSERT INTO public.telemarketing_contatos_avulsos(client_id, campanha_id, lista_id, nome, telefone, cidade, bairro, assigned_operador_id)
        SELECT _client_id, _campanha_id, v_lista_id,
               NULLIF(trim(r->>'nome'),''),
               NULLIF(trim(r->>'telefone'),''),
               NULLIF(trim(r->>'cidade'),''),
               NULLIF(trim(r->>'bairro'),''),
               _assigned_operador_id
          FROM jsonb_array_elements(_rows) r
         WHERE NULLIF(trim(r->>'nome'),'') IS NOT NULL
           AND NULLIF(trim(r->>'telefone'),'') IS NOT NULL
           AND NOT EXISTS (
               SELECT 1 FROM public.telemarketing_contatos_avulsos a 
               WHERE a.client_id = _client_id AND a.telefone = NULLIF(trim(r->>'telefone'),'')
           );
    ELSE
        INSERT INTO public.telemarketing_contatos_avulsos(client_id, campanha_id, lista_id, nome, telefone, cidade, bairro, assigned_operador_id)
        SELECT _client_id, _campanha_id, v_lista_id,
               NULLIF(trim(r->>'nome'),''),
               NULLIF(trim(r->>'telefone'),''),
               NULLIF(trim(r->>'cidade'),''),
               NULLIF(trim(r->>'bairro'),''),
               _assigned_operador_id
          FROM jsonb_array_elements(_rows) r
         WHERE NULLIF(trim(r->>'nome'),'') IS NOT NULL
           AND NULLIF(trim(r->>'telefone'),'') IS NOT NULL;
    END IF;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    -- Atualizar o total real inserido na lista
    IF v_lista_id IS NOT NULL THEN
        UPDATE public.telemarketing_listas SET total_contatos = v_count WHERE id = v_lista_id;
    END IF;

    IF _assigned_operador_id IS NOT NULL AND v_count > 0 THEN
        INSERT INTO public.telemarketing_assignment_log(client_id, campanha_id, operador_id, acao, contatos_count, criado_por)
          VALUES (_client_id, _campanha_id, _assigned_operador_id, 'importar_atribuir', v_count, auth.uid());
    END IF;

    RETURN jsonb_build_object('inserted', v_count, 'lista_id', v_lista_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_import_contato_avulso_batch(uuid, uuid, jsonb, uuid, boolean, text) TO authenticated;

-- 6. Função para designar uma lista para um operador
CREATE OR REPLACE FUNCTION public.tele_designar_lista_operador(
    _client_id uuid,
    _operador_id uuid,
    _lista_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public._tele_assert_client_admin(_client_id);

    UPDATE public.telemarketing_operadores
       SET lista_atual_id = _lista_id
     WHERE id = _operador_id AND client_id = _client_id;

    -- Também atribuímos os contatos da lista que ainda estão pendentes
    IF _lista_id IS NOT NULL THEN
        UPDATE public.telemarketing_contatos_avulsos
           SET assigned_operador_id = _operador_id
         WHERE client_id = _client_id 
           AND lista_id = _lista_id
           AND (ligacao_status IS NULL OR ligacao_status = 'pendente');
    END IF;

    RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_designar_lista_operador(uuid, uuid, uuid) TO authenticated;
