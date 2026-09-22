-- Permite corrigir o valor de um lote confirmado sem perder a trilha de
-- auditoria. O ajuste atualiza apenas pessoas efetivamente confirmadas pelo
-- lote e recalcula os totais financeiros dentro da mesma transacao.

CREATE TABLE public.eleicao_cabo_import_valor_auditoria (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.eleicao_cabo_import_lotes(id) ON DELETE RESTRICT,
  valor_anterior numeric(12,2) NOT NULL CHECK (valor_anterior > 0),
  valor_novo numeric(12,2) NOT NULL CHECK (valor_novo > 0),
  custo_anterior numeric(14,2) NOT NULL CHECK (custo_anterior >= 0),
  custo_novo numeric(14,2) NOT NULL CHECK (custo_novo >= 0),
  contratos_atualizados integer NOT NULL CHECK (contratos_atualizados >= 0),
  motivo text NOT NULL CHECK (nullif(btrim(motivo),'') IS NOT NULL),
  alterado_por uuid NOT NULL DEFAULT auth.uid()
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  alterado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_eleicao_cabo_import_valor_auditoria_lote
  ON public.eleicao_cabo_import_valor_auditoria(client_id,lote_id,alterado_em DESC);

ALTER TABLE public.eleicao_cabo_import_valor_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY eleicao_cabo_import_valor_auditoria_member
  ON public.eleicao_cabo_import_valor_auditoria FOR SELECT TO authenticated
  USING ((SELECT public.is_client_member(client_id)));

REVOKE ALL ON public.eleicao_cabo_import_valor_auditoria FROM PUBLIC,anon;
GRANT SELECT ON public.eleicao_cabo_import_valor_auditoria TO authenticated;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_alterar_valor(
  p_lote_id uuid,
  p_valor_unitario numeric,
  p_motivo text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_lote public.eleicao_cabo_import_lotes%ROWTYPE;
  v_motivo text:=nullif(btrim(coalesce(p_motivo,'')),'');
  v_contratos integer;
  v_custo_anterior numeric(14,2);
  v_custo_novo numeric(14,2);
BEGIN
  IF p_valor_unitario IS NULL OR p_valor_unitario<=0 THEN
    RAISE EXCEPTION 'O novo valor deve ser maior que zero';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo da alteracao';
  END IF;

  SELECT l.* INTO v_lote
  FROM public.eleicao_cabo_import_lotes l
  WHERE l.id=p_lote_id
  FOR UPDATE;

  IF v_lote.id IS NULL OR NOT (SELECT public.is_client_member(v_lote.client_id)) THEN
    RAISE EXCEPTION 'Lote nao encontrado';
  END IF;
  IF v_lote.status<>'confirmado' THEN
    RAISE EXCEPTION 'Somente lotes confirmados podem ter o valor alterado';
  END IF;
  IF p_valor_unitario=v_lote.valor_unitario THEN
    RAISE EXCEPTION 'O novo valor e igual ao valor atual';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_lote.client_id::text)
  );

  UPDATE public.eleicao_pessoas p SET
    valor_contratacao=p_valor_unitario
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
  GET DIAGNOSTICS v_contratos = ROW_COUNT;

  UPDATE public.eleicao_cabo_import_itens i SET
    valor_aplicado=p_valor_unitario
  WHERE i.lote_id=v_lote.id
    AND i.client_id=v_lote.client_id
    AND i.classificacao='confirmado';

  SELECT count(*)::integer INTO v_contratos
  FROM public.eleicao_cabo_import_itens i
  WHERE i.lote_id=v_lote.id
    AND i.client_id=v_lote.client_id
    AND i.classificacao='confirmado';

  v_custo_anterior:=v_lote.custo_confirmado;
  v_custo_novo:=v_contratos*p_valor_unitario;

  UPDATE public.eleicao_cabo_import_lotes SET
    valor_unitario=p_valor_unitario,
    custo_bruto=total_linhas*p_valor_unitario,
    custo_previsto=total_elegiveis*p_valor_unitario,
    custo_confirmado=v_custo_novo
  WHERE id=v_lote.id;

  INSERT INTO public.eleicao_cabo_import_valor_auditoria(
    client_id,lote_id,valor_anterior,valor_novo,custo_anterior,custo_novo,
    contratos_atualizados,motivo,alterado_por
  ) VALUES (
    v_lote.client_id,v_lote.id,v_lote.valor_unitario,p_valor_unitario,
    v_custo_anterior,v_custo_novo,v_contratos,v_motivo,(SELECT auth.uid())
  );

  RETURN jsonb_build_object(
    'lote_id',v_lote.id,
    'valor_anterior',v_lote.valor_unitario,
    'valor_novo',p_valor_unitario,
    'contratos_atualizados',v_contratos,
    'custo_anterior',v_custo_anterior,
    'custo_novo',v_custo_novo
  );
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_alterar_valor(uuid,numeric,text)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_alterar_valor(uuid,numeric,text)
  TO authenticated;

COMMENT ON FUNCTION public.eleicao_cabo_import_alterar_valor(uuid,numeric,text) IS
  'Altera de forma transacional e auditavel o valor dos contratos confirmados de um lote.';

NOTIFY pgrst,'reload schema';
