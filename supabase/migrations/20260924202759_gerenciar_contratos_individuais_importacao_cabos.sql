-- Gerenciamento linha a linha dos contratos criados por uma importacao.
-- Linhas recusadas continuam visiveis, mas contratos preexistentes de outros
-- lotes sao somente informativos para evitar alteracoes acidentais.

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_contratos(p_lote_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_client uuid; v_result jsonb;
BEGIN
  SELECT client_id INTO v_client FROM public.eleicao_cabo_import_lotes WHERE id=p_lote_id;
  IF v_client IS NULL OR NOT (SELECT public.is_client_member(v_client)) THEN
    RAISE EXCEPTION 'Lote nao encontrado' USING ERRCODE='42501';
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'item_id',i.id,'numero_linha',i.numero_linha,'classificacao',i.classificacao,
    'motivo',i.motivo,'nome_importado',i.nome,'cpf_importado',i.cpf_normalizado,
    'telefone_importado',i.telefone_normalizado,'pessoa_id',p.id,'nome',p.nome,
    'cpf',p.cpf,'telefone',p.telefone,'valor',p.valor_contratacao,
    'contrato_inicio',p.contrato_inicio,'contrato_fim',p.contrato_fim,
    'responsavel_id',p.parent_id,'responsavel_nome',r.nome,
    'arquivado_em',p.arquivado_em,'pertence_ao_lote',(p.importacao_lote_id=p_lote_id),
    'lote_contrato_id',p.importacao_lote_id,'lote_contrato_nome',origem.nome
  ) ORDER BY i.numero_linha),'[]'::jsonb) INTO v_result
  FROM public.eleicao_cabo_import_itens i
  LEFT JOIN public.eleicao_pessoas p ON p.id=i.pessoa_existente_id AND p.client_id=v_client
  LEFT JOIN public.eleicao_pessoas r ON r.id=p.parent_id AND r.client_id=v_client
  LEFT JOIN public.eleicao_cabo_import_lotes origem ON origem.id=p.importacao_lote_id
  WHERE i.lote_id=p_lote_id AND i.client_id=v_client;
  RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_editar_contrato(
  p_lote_id uuid,p_item_id bigint,p_nome text,p_cpf text,p_telefone text,
  p_valor numeric,p_parent_id uuid,p_inicio date,p_fim date,p_ativo boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_client uuid; v_pessoa uuid; v_total int; v_custo numeric;
BEGIN
  SELECT l.client_id,i.pessoa_existente_id INTO v_client,v_pessoa
  FROM public.eleicao_cabo_import_lotes l
  JOIN public.eleicao_cabo_import_itens i ON i.lote_id=l.id AND i.id=p_item_id
  WHERE l.id=p_lote_id FOR UPDATE OF l,i;
  IF v_client IS NULL OR NOT (SELECT public.is_client_member(v_client)) THEN
    RAISE EXCEPTION 'Lote ou item nao encontrado' USING ERRCODE='42501';
  END IF;
  IF v_pessoa IS NULL OR NOT EXISTS(SELECT 1 FROM public.eleicao_pessoas p
    WHERE p.id=v_pessoa AND p.client_id=v_client AND p.importacao_lote_id=p_lote_id) THEN
    RAISE EXCEPTION 'Este registro pertence a outro lote e esta disponivel apenas para consulta';
  END IF;
  IF nullif(btrim(p_nome),'') IS NULL THEN RAISE EXCEPTION 'Informe o nome'; END IF;
  IF p_valor IS NULL OR p_valor<=0 THEN RAISE EXCEPTION 'Informe um valor maior que zero'; END IF;
  IF p_fim IS NOT NULL AND p_fim<p_inicio THEN RAISE EXCEPTION 'Periodo invalido'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.eleicao_pessoas r WHERE r.id=p_parent_id
    AND r.client_id=v_client AND r.tipo::text IN('coordenador','lider') AND r.arquivado_em IS NULL) THEN
    RAISE EXCEPTION 'Responsavel invalido';
  END IF;

  UPDATE public.eleicao_pessoas SET nome=btrim(p_nome),cpf=nullif(public.eleicao_cabo_import_digits(p_cpf),''),
    telefone=coalesce(nullif(public.eleicao_cabo_import_digits(p_telefone),''),telefone),
    valor_contratacao=p_valor,parent_id=p_parent_id,contrato_inicio=p_inicio,contrato_fim=p_fim,
    is_voluntario=false,
    arquivado_em=CASE WHEN p_ativo THEN NULL ELSE coalesce(arquivado_em,now()) END,
    arquivado_por=CASE WHEN p_ativo THEN NULL ELSE (SELECT auth.uid()) END,
    arquivamento_motivo=CASE WHEN p_ativo THEN NULL ELSE 'Excluido no gerenciamento do lote de importacao' END,
    arquivamento_lote_id=CASE WHEN p_ativo THEN NULL ELSE p_lote_id END
  WHERE id=v_pessoa;
  UPDATE public.eleicao_cabo_import_itens SET nome=btrim(p_nome),
    cpf_normalizado=nullif(public.eleicao_cabo_import_digits(p_cpf),''),
    telefone_normalizado=nullif(public.eleicao_cabo_import_digits(p_telefone),''),
    valor_aplicado=CASE WHEN p_ativo THEN p_valor ELSE 0 END,
    motivo=CASE WHEN p_ativo THEN 'Contrato editado e ativo' ELSE 'Contrato arquivado manualmente' END
  WHERE id=p_item_id;
  SELECT count(*)::int,coalesce(sum(valor_contratacao),0) INTO v_total,v_custo
  FROM public.eleicao_pessoas WHERE client_id=v_client AND importacao_lote_id=p_lote_id
    AND arquivado_em IS NULL AND NOT coalesce(is_voluntario,false) AND coalesce(valor_contratacao,0)>0;
  UPDATE public.eleicao_cabo_import_lotes SET total_elegiveis=v_total,custo_confirmado=v_custo WHERE id=p_lote_id;
  RETURN jsonb_build_object('pessoa_id',v_pessoa,'ativo',p_ativo,'contratos_ativos',v_total,'custo',v_custo);
END; $$;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_arquivar_todos(p_lote_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_client uuid; v_count int;
BEGIN
  SELECT client_id INTO v_client FROM public.eleicao_cabo_import_lotes WHERE id=p_lote_id FOR UPDATE;
  IF v_client IS NULL OR NOT (SELECT public.is_client_member(v_client)) THEN
    RAISE EXCEPTION 'Lote nao encontrado' USING ERRCODE='42501';
  END IF;
  UPDATE public.eleicao_pessoas SET arquivado_em=coalesce(arquivado_em,now()),
    arquivado_por=(SELECT auth.uid()),arquivamento_motivo='Lote excluido no gerenciamento da importacao',
    arquivamento_lote_id=p_lote_id
  WHERE client_id=v_client AND importacao_lote_id=p_lote_id AND arquivado_em IS NULL;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  UPDATE public.eleicao_cabo_import_itens SET valor_aplicado=0,
    motivo=CASE WHEN classificacao='confirmado' THEN 'Contrato arquivado com o lote' ELSE motivo END
  WHERE lote_id=p_lote_id AND client_id=v_client AND pessoa_existente_id IN(
    SELECT id FROM public.eleicao_pessoas WHERE client_id=v_client AND importacao_lote_id=p_lote_id);
  UPDATE public.eleicao_cabo_import_lotes SET total_elegiveis=0,custo_confirmado=0 WHERE id=p_lote_id;
  RETURN jsonb_build_object('arquivados',v_count);
END; $$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_contratos(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_cabo_import_editar_contrato(uuid,bigint,text,text,text,numeric,uuid,date,date,boolean) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.eleicao_cabo_import_arquivar_todos(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_contratos(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_editar_contrato(uuid,bigint,text,text,text,numeric,uuid,date,date,boolean) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_arquivar_todos(uuid) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
