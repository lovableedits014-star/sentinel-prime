
CREATE OR REPLACE FUNCTION public.tele_admin_listar_contatos_full(_client_id uuid)
RETURNS TABLE(
  tabela text,
  id uuid,
  nome text,
  telefone text,
  cidade text,
  bairro text,
  ligacao_status text,
  vota_candidato text,
  candidato_alternativo text,
  operador_nome text,
  ligacao_em timestamp with time zone,
  tipo text,
  lider_id uuid,
  contratado_id uuid,
  campanha_id uuid,
  campanha_nome text,
  is_lider boolean
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 'contratados'::text AS tabela,
         c.id, c.nome, c.telefone, c.cidade, c.bairro,
         c.ligacao_status, c.vota_candidato, c.candidato_alternativo,
         c.operador_nome, c.ligacao_em,
         CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END AS tipo,
         c.lider_id, NULL::uuid AS contratado_id,
         c.campanha_id, cam.nome AS campanha_nome,
         c.is_lider
    FROM public.contratados c
    LEFT JOIN public.telemarketing_campanhas cam ON cam.id = c.campanha_id
   WHERE c.client_id = _client_id
  UNION ALL
  SELECT 'contratado_indicados', i.id, i.nome, i.telefone, i.cidade, i.bairro,
         i.ligacao_status, i.vota_candidato, i.candidato_alternativo,
         i.operador_nome, i.ligacao_em,
         'indicado', NULL::uuid, i.contratado_id,
         i.campanha_id, cam.nome, false
    FROM public.contratado_indicados i
    LEFT JOIN public.telemarketing_campanhas cam ON cam.id = i.campanha_id
   WHERE i.client_id = _client_id
  UNION ALL
  SELECT 'eleicao_pessoas', p.id, p.nome, p.telefone, p.cidade, p.bairro,
         p.ligacao_status, p.vota_candidato, p.candidato_alternativo,
         p.operador_nome, p.ligacao_em,
         'eleicao_pessoa', NULL::uuid, NULL::uuid,
         p.campanha_id, cam.nome, false
    FROM public.eleicao_pessoas p
    LEFT JOIN public.telemarketing_campanhas cam ON cam.id = p.campanha_id
   WHERE p.client_id = _client_id AND p.telefone IS NOT NULL
  UNION ALL
  SELECT 'eleicao_indicados', ei.id, ei.nome, ei.telefone, ei.cidade, ei.bairro,
         ei.ultimo_status_ligacao, ei.vota_candidato, ei.candidato_alternativo,
         ei.operador_nome, ei.ultima_ligacao_em,
         'eleicao_indicado', NULL::uuid, NULL::uuid,
         ei.campanha_id, cam.nome, false
    FROM public.eleicao_indicados ei
    LEFT JOIN public.telemarketing_campanhas cam ON cam.id = ei.campanha_id
   WHERE ei.client_id = _client_id
  UNION ALL
  SELECT 'contatos_avulsos', a.id, a.nome, a.telefone, a.cidade, a.bairro,
         a.ligacao_status, a.vota_candidato, a.candidato_alternativo,
         a.operador_nome, a.ligacao_em,
         'avulso', NULL::uuid, NULL::uuid,
         a.campanha_id, cam.nome, false
    FROM public.telemarketing_contatos_avulsos a
    LEFT JOIN public.telemarketing_campanhas cam ON cam.id = a.campanha_id
   WHERE a.client_id = _client_id AND COALESCE(a.ativo, true) = true;
$$;

GRANT EXECUTE ON FUNCTION public.tele_admin_listar_contatos_full(uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_call_log_client_created ON public.telemarketing_call_log(client_id, created_at DESC);
