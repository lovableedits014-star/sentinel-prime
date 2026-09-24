CREATE TABLE IF NOT EXISTS public.eleicao_cabo_import_excecoes(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.eleicao_cabo_import_lotes(id) ON DELETE CASCADE,
  item_id bigint NOT NULL REFERENCES public.eleicao_cabo_import_itens(id) ON DELETE CASCADE,
  pessoa_criada_id uuid REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  pessoa_conflitante_id uuid REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  tipo text NOT NULL CHECK(tipo='telefone_compartilhado'), motivo text NOT NULL,
  aprovado_por uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  aprovado_em timestamptz NOT NULL DEFAULT now(), UNIQUE(item_id,tipo)
);
ALTER TABLE public.eleicao_cabo_import_excecoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY eleicao_cabo_import_excecoes_member ON public.eleicao_cabo_import_excecoes
  FOR SELECT TO authenticated USING((SELECT public.is_client_member(client_id)));
REVOKE ALL ON public.eleicao_cabo_import_excecoes FROM PUBLIC,anon;
GRANT SELECT ON public.eleicao_cabo_import_excecoes TO authenticated;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_contratos(p_lote_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE v_client uuid; v_result jsonb;
BEGIN
 SELECT client_id INTO v_client FROM public.eleicao_cabo_import_lotes WHERE id=p_lote_id;
 IF v_client IS NULL OR NOT(SELECT public.is_client_member(v_client)) THEN RAISE EXCEPTION 'Lote nao encontrado'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'item_id',i.id,'numero_linha',i.numero_linha,'classificacao',i.classificacao,'motivo',i.motivo,
  'nome_importado',i.nome,'cpf_importado',i.cpf_normalizado,'telefone_importado',i.telefone_normalizado,
  'pessoa_id',CASE WHEN p.importacao_lote_id=p_lote_id THEN p.id END,
  'nome',CASE WHEN p.importacao_lote_id=p_lote_id THEN p.nome ELSE i.nome END,
  'cpf',CASE WHEN p.importacao_lote_id=p_lote_id THEN p.cpf ELSE i.cpf_normalizado END,
  'telefone',CASE WHEN p.importacao_lote_id=p_lote_id THEN p.telefone ELSE i.telefone_normalizado END,
  'valor',CASE WHEN p.importacao_lote_id=p_lote_id THEN p.valor_contratacao END,
  'contrato_inicio',p.contrato_inicio,'contrato_fim',p.contrato_fim,'responsavel_id',p.parent_id,
  'responsavel_nome',r.nome,'arquivado_em',p.arquivado_em,
  'pertence_ao_lote',(p.importacao_lote_id=p_lote_id),'lote_contrato_id',p.importacao_lote_id,
  'lote_contrato_nome',origem.nome,'conflito_pessoa_id',CASE WHEN p.importacao_lote_id IS DISTINCT FROM p_lote_id THEN p.id END,
  'conflito_nome',CASE WHEN p.importacao_lote_id IS DISTINCT FROM p_lote_id THEN p.nome END,
  'conflito_telefone',CASE WHEN p.importacao_lote_id IS DISTINCT FROM p_lote_id THEN p.telefone END,
  'conflito_cpf',CASE WHEN p.importacao_lote_id IS DISTINCT FROM p_lote_id THEN p.cpf END,
  'conflito_responsavel',CASE WHEN p.importacao_lote_id IS DISTINCT FROM p_lote_id THEN r.nome END
 ) ORDER BY i.numero_linha),'[]'::jsonb) INTO v_result
 FROM public.eleicao_cabo_import_itens i
 LEFT JOIN public.eleicao_pessoas p ON p.id=i.pessoa_existente_id AND p.client_id=v_client
 LEFT JOIN public.eleicao_pessoas r ON r.id=p.parent_id AND r.client_id=v_client
 LEFT JOIN public.eleicao_cabo_import_lotes origem ON origem.id=p.importacao_lote_id
 WHERE i.lote_id=p_lote_id AND i.client_id=v_client;
 RETURN v_result;
END; $$;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_import_aprovar_telefone_compartilhado(
 p_lote_id uuid,p_item_id bigint,p_motivo text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_lote public.eleicao_cabo_import_lotes%ROWTYPE; v_item public.eleicao_cabo_import_itens%ROWTYPE;
 v_conflito uuid; v_nova uuid; v_total int; v_custo numeric;
BEGIN
 SELECT * INTO v_lote FROM public.eleicao_cabo_import_lotes WHERE id=p_lote_id FOR UPDATE;
 SELECT * INTO v_item FROM public.eleicao_cabo_import_itens WHERE id=p_item_id AND lote_id=p_lote_id FOR UPDATE;
 IF v_lote.id IS NULL OR v_item.id IS NULL OR NOT(SELECT public.is_client_member(v_lote.client_id)) THEN RAISE EXCEPTION 'Item nao encontrado'; END IF;
 IF v_item.classificacao NOT IN('duplicado_no_arquivo','duplicado_contrato_ativo') THEN RAISE EXCEPTION 'Este item nao e uma duplicidade aprovavel'; END IF;
 IF nullif(btrim(coalesce(p_motivo,'')),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da aprovacao manual'; END IF;
 IF v_item.telefone_normalizado IS NULL THEN RAISE EXCEPTION 'O item nao possui telefone valido'; END IF;
 SELECT p.id INTO v_conflito FROM public.eleicao_pessoas p WHERE p.client_id=v_lote.client_id
  AND public.eleicao_cabo_import_digits(p.telefone)=v_item.telefone_normalizado
  ORDER BY(p.arquivado_em IS NULL)DESC,p.created_at DESC LIMIT 1;
 IF v_conflito IS NULL THEN RAISE EXCEPTION 'O telefone conflitante nao foi encontrado'; END IF;
 IF EXISTS(SELECT 1 FROM public.eleicao_pessoas p WHERE p.id=v_conflito
  AND public.eleicao_nome_key(p.nome)=public.eleicao_nome_key(v_item.nome)) THEN
  RAISE EXCEPTION 'O nome e o telefone pertencem ao mesmo cadastro; edite o contrato existente';
 END IF;
 IF v_item.cpf_normalizado IS NOT NULL AND EXISTS(SELECT 1 FROM public.eleicao_pessoas p
  WHERE p.client_id=v_lote.client_id AND public.eleicao_cabo_import_digits(p.cpf)=v_item.cpf_normalizado) THEN
  RAISE EXCEPTION 'CPF ja cadastrado. A excecao permite compartilhar somente o telefone';
 END IF;
 INSERT INTO public.eleicao_pessoas(client_id,tipo,escopo,regiao,cidade,nome,telefone,endereco,bairro,parent_id,
  cpf,valor_contratacao,is_voluntario,created_by,contrato_inicio,contrato_fim,importacao_lote_id)
 VALUES(v_lote.client_id,'cabo',v_lote.escopo_padrao,v_lote.regiao_padrao,v_lote.cidade_padrao,v_item.nome,
  v_item.telefone_normalizado,coalesce(v_item.endereco,'Nao informado'),v_item.bairro,v_lote.parent_id_padrao,
  v_item.cpf_normalizado,v_lote.valor_unitario,false,(SELECT auth.uid()),v_lote.data_inicio,v_lote.data_fim,v_lote.id)
 RETURNING id INTO v_nova;
 UPDATE public.eleicao_cabo_import_itens SET pessoa_existente_id=v_nova,classificacao='confirmado',
  motivo='Telefone compartilhado aprovado manualmente: '||btrim(p_motivo),valor_aplicado=v_lote.valor_unitario,processado_em=now()
 WHERE id=v_item.id;
 INSERT INTO public.eleicao_cabo_import_excecoes(client_id,lote_id,item_id,pessoa_criada_id,pessoa_conflitante_id,tipo,motivo)
 VALUES(v_lote.client_id,p_lote_id,p_item_id,v_nova,v_conflito,'telefone_compartilhado',btrim(p_motivo));
 SELECT count(*)::int,coalesce(sum(valor_contratacao),0) INTO v_total,v_custo FROM public.eleicao_pessoas
 WHERE client_id=v_lote.client_id AND importacao_lote_id=p_lote_id AND arquivado_em IS NULL
  AND NOT coalesce(is_voluntario,false) AND coalesce(valor_contratacao,0)>0;
 UPDATE public.eleicao_cabo_import_lotes SET total_elegiveis=v_total,custo_confirmado=v_custo,
  total_repetidos_arquivo=(SELECT count(*) FROM public.eleicao_cabo_import_itens WHERE lote_id=p_lote_id AND classificacao='duplicado_no_arquivo'),
  total_duplicados=(SELECT count(*) FROM public.eleicao_cabo_import_itens WHERE lote_id=p_lote_id AND classificacao='duplicado_contrato_ativo')
 WHERE id=p_lote_id;
 RETURN jsonb_build_object('pessoa_id',v_nova,'contratos_ativos',v_total,'custo',v_custo);
END; $$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_import_aprovar_telefone_compartilhado(uuid,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_import_aprovar_telefone_compartilhado(uuid,bigint,text) TO authenticated,service_role;
NOTIFY pgrst,'reload schema';
