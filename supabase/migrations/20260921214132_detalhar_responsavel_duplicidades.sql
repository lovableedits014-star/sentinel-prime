-- Explicita quem gerencia cada cadastro envolvido na duplicidade. O frontend
-- usa responsavel_id + responsavel_tipo para montar pastas inequívocas por
-- coordenador ou líder, inclusive quando existem pessoas com o mesmo nome.

CREATE OR REPLACE FUNCTION public.eleicao_auditar_duplicidades(p_client_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_result jsonb;
BEGIN
  IF NOT (SELECT public.is_client_member(p_client_id)) THEN
    RAISE EXCEPTION 'Sem permissao para este cliente';
  END IF;

  WITH chaves AS (
    SELECT 'telefone'::text tipo,public.tele_phone_key(p.telefone) chave
    FROM public.eleicao_pessoas p
    WHERE p.client_id=p_client_id AND p.arquivado_em IS NULL
      AND public.tele_phone_key(p.telefone) IS NOT NULL
    GROUP BY public.tele_phone_key(p.telefone) HAVING count(*)>1
    UNION ALL
    SELECT 'cpf',public.eleicao_cabo_import_digits(p.cpf)
    FROM public.eleicao_pessoas p
    WHERE p.client_id=p_client_id AND p.arquivado_em IS NULL
      AND length(public.eleicao_cabo_import_digits(p.cpf))=11
    GROUP BY public.eleicao_cabo_import_digits(p.cpf) HAVING count(*)>1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'tipo',c.tipo,'chave',c.chave,'cadastros',(
      SELECT jsonb_agg(jsonb_build_object(
        'id',p.id,'nome',p.nome,'tipo',p.tipo::text,'telefone',p.telefone,
        'responsavel_id',coalesce(pai.id,
          CASE WHEN p.tipo::text IN ('coordenador','lider') THEN p.id END),
        'responsavel_nome',coalesce(pai.nome,
          CASE WHEN p.tipo::text IN ('coordenador','lider') THEN p.nome END),
        'responsavel_tipo',coalesce(pai.tipo::text,
          CASE WHEN p.tipo::text IN ('coordenador','lider') THEN p.tipo::text END),
        'valor_contratacao',p.valor_contratacao,'is_voluntario',p.is_voluntario,
        'contrato_fim',p.contrato_fim
      ) ORDER BY p.nome,p.id)
      FROM public.eleicao_pessoas p
      LEFT JOIN public.eleicao_pessoas pai
        ON pai.id=p.parent_id AND pai.client_id=p_client_id
        AND pai.arquivado_em IS NULL
        AND pai.tipo::text IN ('coordenador','lider')
      WHERE p.client_id=p_client_id AND p.arquivado_em IS NULL AND (
        (c.tipo='telefone' AND public.tele_phone_key(p.telefone)=c.chave)
        OR (c.tipo='cpf' AND public.eleicao_cabo_import_digits(p.cpf)=c.chave)
      )
    )
  ) ORDER BY c.tipo,c.chave),'[]'::jsonb)
  INTO v_result FROM chaves c;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.eleicao_auditar_duplicidades(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_auditar_duplicidades(uuid)
  TO authenticated,service_role;

NOTIFY pgrst,'reload schema';
