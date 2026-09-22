-- Permite transferir um lote confirmado para outro lider ou coordenador. A
-- localizacao e herdada do novo responsavel pelos triggers ja existentes.

CREATE TABLE public.eleicao_cabo_import_responsavel_auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.eleicao_cabo_import_lotes(id) ON DELETE RESTRICT,
  responsavel_anterior_id uuid REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  responsavel_novo_id uuid NOT NULL REFERENCES public.eleicao_pessoas(id) ON DELETE RESTRICT,
  cabos_movidos integer NOT NULL CHECK (cabos_movidos >= 0),
  motivo text NOT NULL CHECK (nullif(btrim(motivo),'') IS NOT NULL),
  alterado_por uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  alterado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eleicao_cabo_import_responsavel_auditoria_lote
  ON public.eleicao_cabo_import_responsavel_auditoria(
    client_id,lote_id,alterado_em DESC
  );

ALTER TABLE public.eleicao_cabo_import_responsavel_auditoria
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY eleicao_cabo_import_responsavel_auditoria_member
  ON public.eleicao_cabo_import_responsavel_auditoria
  FOR SELECT TO authenticated
  USING ((SELECT public.is_client_member(client_id)));

REVOKE ALL ON public.eleicao_cabo_import_responsavel_auditoria
  FROM PUBLIC,anon;
GRANT SELECT ON public.eleicao_cabo_import_responsavel_auditoria
  TO authenticated;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_editar(
  p_lote_id uuid,
  p_valor_unitario numeric,
  p_parent_id uuid,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_lote public.eleicao_cabo_import_lotes%ROWTYPE;
  v_parent public.eleicao_pessoas%ROWTYPE;
  v_motivo text:=nullif(btrim(coalesce(p_motivo,'')),'');
  v_valor_alterado boolean;
  v_responsavel_alterado boolean;
  v_cabos_movidos integer:=0;
  v_valor_result jsonb;
  v_custo_novo numeric(14,2);
BEGIN
  SELECT l.* INTO v_lote
  FROM public.eleicao_cabo_import_lotes l
  WHERE l.id=p_lote_id
  FOR UPDATE;

  IF v_lote.id IS NULL OR NOT (SELECT public.is_client_member(v_lote.client_id)) THEN
    RAISE EXCEPTION 'Lote nao encontrado';
  END IF;
  IF v_lote.status<>'confirmado' THEN
    RAISE EXCEPTION 'Somente lotes confirmados podem ser alterados';
  END IF;
  IF p_valor_unitario IS NULL OR p_valor_unitario<=0 THEN
    RAISE EXCEPTION 'O valor por cabo deve ser maior que zero';
  END IF;
  IF p_parent_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o lider ou coordenador responsavel';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da alteracao';
  END IF;

  SELECT p.* INTO v_parent
  FROM public.eleicao_pessoas p
  WHERE p.id=p_parent_id
    AND p.client_id=v_lote.client_id
    AND p.arquivado_em IS NULL
    AND p.tipo::text IN ('coordenador','lider');
  IF v_parent.id IS NULL THEN
    RAISE EXCEPTION 'Responsavel invalido';
  END IF;

  v_valor_alterado:=p_valor_unitario<>v_lote.valor_unitario;
  v_responsavel_alterado:=p_parent_id IS DISTINCT FROM v_lote.parent_id_padrao;
  IF NOT v_valor_alterado AND NOT v_responsavel_alterado THEN
    RAISE EXCEPTION 'Nenhuma alteracao foi informada';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_lote.client_id::text)
  );

  IF v_valor_alterado THEN
    v_valor_result:=public.eleicao_cabo_import_alterar_valor(
      v_lote.id,p_valor_unitario,v_motivo
    );
  END IF;

  IF v_responsavel_alterado THEN
    UPDATE public.eleicao_cabo_import_lotes SET
      parent_id_padrao=v_parent.id
    WHERE id=v_lote.id;

    UPDATE public.eleicao_pessoas p SET
      parent_id=v_parent.id
    WHERE p.client_id=v_lote.client_id
      AND p.importacao_lote_id=v_lote.id
      AND EXISTS (
        SELECT 1
        FROM public.eleicao_cabo_import_itens i
        WHERE i.lote_id=v_lote.id
          AND i.client_id=v_lote.client_id
          AND i.pessoa_existente_id=p.id
          AND i.classificacao='confirmado'
      );
    GET DIAGNOSTICS v_cabos_movidos = ROW_COUNT;

    INSERT INTO public.eleicao_cabo_import_responsavel_auditoria(
      client_id,lote_id,responsavel_anterior_id,responsavel_novo_id,
      cabos_movidos,motivo,alterado_por
    ) VALUES (
      v_lote.client_id,v_lote.id,v_lote.parent_id_padrao,v_parent.id,
      v_cabos_movidos,v_motivo,(SELECT auth.uid())
    );
  END IF;

  SELECT l.custo_confirmado INTO v_custo_novo
  FROM public.eleicao_cabo_import_lotes l
  WHERE l.id=v_lote.id;

  RETURN jsonb_build_object(
    'lote_id',v_lote.id,
    'valor_alterado',v_valor_alterado,
    'responsavel_alterado',v_responsavel_alterado,
    'responsavel_anterior_id',v_lote.parent_id_padrao,
    'responsavel_novo_id',p_parent_id,
    'cabos_movidos',v_cabos_movidos,
    'contratos_atualizados',coalesce(
      (v_valor_result->>'contratos_atualizados')::integer,0
    ),
    'custo_novo',v_custo_novo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_editar(
  uuid,numeric,uuid,text
) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_editar(
  uuid,numeric,uuid,text
) TO authenticated;

COMMENT ON FUNCTION public.eleicao_cabo_import_editar(uuid,numeric,uuid,text) IS
  'Edita valor e responsavel de um lote confirmado com auditoria transacional.';

NOTIFY pgrst,'reload schema';
