-- A análise exibida na interface passa a ser apenas uma prévia. O lote usado
-- para calculá-la é removido logo após a resposta e só é recriado quando o
-- usuário confirma a importação.

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_descartar(p_lote_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_client_id uuid;
  v_deleted integer;
BEGIN
  SELECT l.client_id INTO v_client_id
  FROM public.eleicao_cabo_import_lotes l
  WHERE l.id=p_lote_id AND l.status='analisado';

  IF v_client_id IS NULL THEN RETURN false; END IF;
  IF NOT (SELECT public.is_client_member(v_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este lote';
  END IF;

  DELETE FROM public.eleicao_cabo_import_lotes l
  WHERE l.id=p_lote_id AND l.client_id=v_client_id AND l.status='analisado';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted=1;
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_descartar(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_descartar(uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_limpar_rascunhos(p_client_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente';
  END IF;
  DELETE FROM public.eleicao_cabo_import_lotes l
  WHERE l.client_id=p_client_id
    AND l.status='analisado'
    AND l.criado_por=(SELECT auth.uid());
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_limpar_rascunhos(uuid)
  FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_limpar_rascunhos(uuid)
  TO authenticated;

-- Remove somente prévias antigas que nunca foram confirmadas. Os itens são
-- eliminados em cascata; lotes confirmados e cancelados permanecem auditáveis.
DELETE FROM public.eleicao_cabo_import_lotes
WHERE status='analisado';

NOTIFY pgrst,'reload schema';
