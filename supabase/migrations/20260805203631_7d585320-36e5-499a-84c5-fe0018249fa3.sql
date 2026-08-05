-- 1. Tabela para armazenar o histórico de duplicatas encontradas
CREATE TABLE IF NOT EXISTS public.telemarketing_import_duplicatas (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id uuid REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
    lista_id uuid REFERENCES public.telemarketing_listas(id) ON DELETE CASCADE,
    nome text,
    telefone text,
    cidade text,
    bairro text,
    motivo text, -- 'global' ou 'lista'
    criado_em timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, DELETE ON public.telemarketing_import_duplicatas TO authenticated;
GRANT ALL ON public.telemarketing_import_duplicatas TO service_role;

ALTER TABLE public.telemarketing_import_duplicatas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can see their client's duplicates" 
ON public.telemarketing_import_duplicatas FOR SELECT 
TO authenticated USING (client_id IN (SELECT id FROM public.clients));

-- 2. Atualizar a RPC de importação para registrar duplicatas
CREATE OR REPLACE FUNCTION public.tele_import_contato_avulso_batch(
    _client_id uuid,
    _campanha_id uuid,
    _rows jsonb,
    _assigned_operador_id uuid DEFAULT NULL,
    _skip_global_dupes boolean DEFAULT true,
    _lista_nome text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE 
    v_inserted integer := 0;
    v_skipped_global integer := 0;
    v_lista_id uuid := NULL;
BEGIN
    PERFORM public._tele_assert_client_admin(_client_id);

    -- Criar a lista se um nome for fornecido
    IF _lista_nome IS NOT NULL THEN
        INSERT INTO public.telemarketing_listas (client_id, campanha_id, nome, total_contatos)
        VALUES (_client_id, _campanha_id, _lista_nome, 0)
        RETURNING id INTO v_lista_id;
    END IF;

    -- Registrar duplicatas globais ANTES de inserir (se solicitado)
    IF _skip_global_dupes THEN
        INSERT INTO public.telemarketing_import_duplicatas (client_id, lista_id, nome, telefone, cidade, bairro, motivo)
        SELECT _client_id, v_lista_id,
               NULLIF(trim(r->>'nome'),''),
               NULLIF(trim(r->>'telefone'),''),
               NULLIF(trim(r->>'cidade'),''),
               NULLIF(trim(r->>'bairro'),''),
               'global'
        FROM jsonb_array_elements(_rows) r
        WHERE NULLIF(trim(r->>'telefone'),'') IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM public.telemarketing_contatos_avulsos a 
              WHERE a.client_id = _client_id AND a.telefone = NULLIF(trim(r->>'telefone'),'')
          );
        
        GET DIAGNOSTICS v_skipped_global = ROW_COUNT;
    END IF;

    -- Inserir contatos válidos
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
       AND (
           NOT _skip_global_dupes OR 
           NOT EXISTS (
               SELECT 1 FROM public.telemarketing_contatos_avulsos a 
               WHERE a.client_id = _client_id AND a.telefone = NULLIF(trim(r->>'telefone'),'')
           )
       );

    GET DIAGNOSTICS v_inserted = ROW_COUNT;

    -- Atualizar o total real inserido na lista
    IF v_lista_id IS NOT NULL THEN
        UPDATE public.telemarketing_listas SET total_contatos = v_inserted WHERE id = v_lista_id;
    END IF;

    IF _assigned_operador_id IS NOT NULL AND v_inserted > 0 THEN
        INSERT INTO public.telemarketing_assignment_log(client_id, campanha_id, operador_id, acao, contatos_count, criado_por)
          VALUES (_client_id, _campanha_id, _assigned_operador_id, 'importar_atribuir', v_inserted, auth.uid());
    END IF;

    RETURN jsonb_build_object(
        'inserted', v_inserted, 
        'skipped_global', v_skipped_global,
        'lista_id', v_lista_id
    );
END;
$$;
