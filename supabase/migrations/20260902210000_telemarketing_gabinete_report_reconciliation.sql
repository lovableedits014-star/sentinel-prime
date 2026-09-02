-- Reconcilia o relatorio do gabinete com o historico imutavel de ligacoes.
-- Tambem permite consultar toda a base do gabinete sem exigir uma fila.

DROP FUNCTION IF EXISTS public.tele_gabinete_report(uuid,uuid);
CREATE FUNCTION public.tele_gabinete_report(
  _client_id uuid,_campanha_id uuid DEFAULT NULL
) RETURNS TABLE(
  contato_id uuid,nome text,telefone text,bairro text,regiao text,areas text,
  ultimo_atendimento date,ligacao_status text,vota_candidato text,operador_nome text,
  ligacao_em timestamptz,total_tentativas integer
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
 SELECT a.id,a.nome,a.telefone,a.bairro,a.regiao,
   coalesce(string_agg(DISTINCT h.area_atendimento,', '),'Sem area'),max(h.atendido_em),
   coalesce(lg.ligacao_status,a.ligacao_status),coalesce(lg.vota_candidato,a.vota_candidato),
   coalesce(lg.operador_nome,a.operador_nome),coalesce(lg.ligacao_em,a.ligacao_em),
   greatest(coalesce(a.tentativas_count,0),coalesce(lg.tentativas,0))
 FROM public.telemarketing_contatos_avulsos a
 LEFT JOIN public.telemarketing_gabinete_atendimentos h ON h.contato_id=a.id
 LEFT JOIN LATERAL(
   SELECT (array_agg(l.ligacao_status ORDER BY l.created_at DESC))[1] ligacao_status,
     (array_agg(l.vota_candidato ORDER BY l.created_at DESC))[1] vota_candidato,
     (array_agg(l.operador_nome ORDER BY l.created_at DESC))[1] operador_nome,
     max(l.created_at) ligacao_em,count(*)::integer tentativas
   FROM public.telemarketing_call_log l
   WHERE l.client_id=a.client_id AND l.tabela='contatos_avulsos' AND l.contato_id=a.id
 ) lg ON true
 WHERE a.client_id=_client_id AND(_campanha_id IS NULL OR a.campanha_id=_campanha_id)
   AND a.origem_acao='gabinete_atendidos'
   AND public.user_can_access_client(_client_id)
 GROUP BY a.id,lg.ligacao_status,lg.vota_candidato,lg.operador_nome,lg.ligacao_em,lg.tentativas;
$function$;

REVOKE ALL ON FUNCTION public.tele_gabinete_report(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_gabinete_report(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
