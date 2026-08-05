DROP FUNCTION IF EXISTS public.tele_operadores_ao_vivo(uuid);

CREATE OR REPLACE FUNCTION public.tele_operadores_ao_vivo(_client_id uuid)
RETURNS TABLE (
  operador_nome text,
  tabela text,
  contato_id uuid,
  contato_nome text,
  contato_telefone text,
  started_at timestamptz,
  expires_at timestamptz,
  lista_nome text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
          OR EXISTS (SELECT 1 FROM public.clients WHERE id=_client_id AND user_id=auth.uid())
          OR EXISTS (SELECT 1 FROM public.team_members WHERE client_id=_client_id AND user_id=auth.uid() AND status='active')) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT a.operador_nome, a.tabela, a.contato_id,
    COALESCE(
      (SELECT CAST(nome AS text) FROM public.contratados WHERE id=a.contato_id AND a.tabela='contratados'),
      (SELECT CAST(nome AS text) FROM public.contratado_indicados WHERE id=a.contato_id AND a.tabela='contratado_indicados'),
      (SELECT CAST(nome AS text) FROM public.telemarketing_contatos_avulsos WHERE id=a.contato_id AND a.tabela='contatos_avulsos'),
      (SELECT CAST(nome AS text) FROM public.eleicao_indicados WHERE id=a.contato_id AND a.tabela='eleicao_indicados'),
      (SELECT CAST(nome AS text) FROM public.eleicao_pessoas WHERE id=a.contato_id AND a.tabela='eleicao_pessoas')
    ),
    COALESCE(
      (SELECT CAST(telefone AS text) FROM public.contratados WHERE id=a.contato_id AND a.tabela='contratados'),
      (SELECT CAST(telefone AS text) FROM public.contratado_indicados WHERE id=a.contato_id AND a.tabela='contratado_indicados'),
      (SELECT CAST(telefone AS text) FROM public.telemarketing_contatos_avulsos WHERE id=a.contato_id AND a.tabela='contatos_avulsos'),
      (SELECT CAST(telefone AS text) FROM public.eleicao_indicados WHERE id=a.contato_id AND a.tabela='eleicao_indicados'),
      (SELECT CAST(telefone AS text) FROM public.eleicao_pessoas WHERE id=a.contato_id AND a.tabela='eleicao_pessoas')
    ),
    a.created_at, a.expires_at,
    (SELECT l.nome FROM public.telemarketing_listas l 
     JOIN public.telemarketing_contatos_avulsos tca ON tca.lista_id = l.id 
     WHERE tca.id = a.contato_id AND a.tabela = 'contatos_avulsos' LIMIT 1) as lista_nome
  FROM public.telemarketing_call_assignments a
  WHERE a.client_id = _client_id AND a.expires_at > now()
  ORDER BY a.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.tele_operadores_ao_vivo(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.tele_operadores_ao_vivo(uuid) TO service_role;