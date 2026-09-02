-- Nova origem de telemarketing: pessoas anteriormente atendidas pelo gabinete.
-- A operacao continua usando contatos_avulsos para herdar fila, reservas,
-- tentativas e historico; os dados de atendimento ficam normalizados e isolados.

ALTER TABLE public.telemarketing_campanhas
  ADD COLUMN IF NOT EXISTS origem_acao text;

ALTER TABLE public.telemarketing_contatos_avulsos
  ADD COLUMN IF NOT EXISTS origem_acao text,
  ADD COLUMN IF NOT EXISTS regiao text,
  ADD COLUMN IF NOT EXISTS quantidade_atendimentos integer,
  ADD COLUMN IF NOT EXISTS importacao_id uuid;

CREATE TABLE IF NOT EXISTS public.telemarketing_gabinete_importacoes(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  campanha_id uuid NOT NULL REFERENCES public.telemarketing_campanhas(id) ON DELETE CASCADE,
  lista_id uuid REFERENCES public.telemarketing_listas(id) ON DELETE SET NULL,
  nome_arquivo text,
  total_linhas integer NOT NULL DEFAULT 0,
  inseridos integer NOT NULL DEFAULT 0,
  atualizados integer NOT NULL DEFAULT 0,
  invalidos integer NOT NULL DEFAULT 0,
  duplicados_no_arquivo integer NOT NULL DEFAULT 0,
  criado_por uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.telemarketing_gabinete_atendimentos(
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  contato_id uuid NOT NULL REFERENCES public.telemarketing_contatos_avulsos(id) ON DELETE CASCADE,
  importacao_id uuid REFERENCES public.telemarketing_gabinete_importacoes(id) ON DELETE SET NULL,
  atendido_em date,
  area_atendimento text,
  posicao integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contato_id,atendido_em,area_atendimento)
);

CREATE INDEX IF NOT EXISTS idx_tele_gabinete_contatos_campanha
  ON public.telemarketing_contatos_avulsos(client_id,campanha_id,regiao)
  WHERE origem_acao='gabinete_atendidos';
CREATE INDEX IF NOT EXISTS idx_tele_gabinete_atendimentos_contato
  ON public.telemarketing_gabinete_atendimentos(contato_id,atendido_em DESC);
CREATE INDEX IF NOT EXISTS idx_tele_gabinete_atendimentos_area
  ON public.telemarketing_gabinete_atendimentos(client_id,area_atendimento);

ALTER TABLE public.telemarketing_gabinete_importacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemarketing_gabinete_atendimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tele_gabinete_importacoes_member ON public.telemarketing_gabinete_importacoes;
CREATE POLICY tele_gabinete_importacoes_member ON public.telemarketing_gabinete_importacoes
  FOR SELECT TO authenticated USING(public.user_can_access_client(client_id));
DROP POLICY IF EXISTS tele_gabinete_atendimentos_member ON public.telemarketing_gabinete_atendimentos;
CREATE POLICY tele_gabinete_atendimentos_member ON public.telemarketing_gabinete_atendimentos
  FOR SELECT TO authenticated USING(public.user_can_access_client(client_id));

CREATE OR REPLACE FUNCTION public.tele_import_gabinete_atendidos(
  _client_id uuid,_campanha_id uuid,_rows jsonb,_nome_arquivo text DEFAULT NULL,
  _assigned_operador_id uuid DEFAULT NULL,_lista_nome text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE
  v_import uuid;v_lista uuid;v_item jsonb;v_contato uuid;v_phone text;v_nome text;
  v_inserted integer:=0;v_updated integer:=0;v_invalid integer:=0;v_dup integer:=0;
  v_seen text[]:='{}';v_dates text[];v_areas text[];v_i integer;v_date date;v_area text;
BEGIN
  PERFORM public._tele_assert_client_admin(_client_id);
  IF NOT EXISTS(SELECT 1 FROM public.telemarketing_campanhas c
    WHERE c.id=_campanha_id AND c.client_id=_client_id) THEN RAISE EXCEPTION 'Fila invalida';END IF;

  IF nullif(btrim(coalesce(_lista_nome,'')),'') IS NOT NULL THEN
    INSERT INTO public.telemarketing_listas(client_id,campanha_id,nome)
    VALUES(_client_id,_campanha_id,btrim(_lista_nome)) RETURNING id INTO v_lista;
  END IF;
  INSERT INTO public.telemarketing_gabinete_importacoes(
    client_id,campanha_id,lista_id,nome_arquivo,total_linhas)
  VALUES(_client_id,_campanha_id,v_lista,nullif(btrim(coalesce(_nome_arquivo,'')),''),jsonb_array_length(coalesce(_rows,'[]')))
  RETURNING id INTO v_import;

  UPDATE public.telemarketing_campanhas SET origem_acao='gabinete_atendidos',updated_at=now()
  WHERE id=_campanha_id AND client_id=_client_id;

  FOR v_item IN SELECT value FROM jsonb_array_elements(coalesce(_rows,'[]')) LOOP
    v_nome:=nullif(btrim(v_item->>'nome'),'');
    v_phone:=public.tele_phone_key(v_item->>'telefone');
    IF v_nome IS NULL OR v_phone IS NULL THEN v_invalid:=v_invalid+1;CONTINUE;END IF;
    IF v_phone=ANY(v_seen) THEN v_dup:=v_dup+1; ELSE v_seen:=array_append(v_seen,v_phone); END IF;

    SELECT a.id INTO v_contato FROM public.telemarketing_contatos_avulsos a
    WHERE a.client_id=_client_id AND a.campanha_id=_campanha_id
      AND a.origem_acao='gabinete_atendidos' AND public.tele_phone_key(a.telefone)=v_phone
    ORDER BY a.created_at LIMIT 1;
    IF v_contato IS NULL THEN
      INSERT INTO public.telemarketing_contatos_avulsos(
        client_id,campanha_id,lista_id,nome,telefone,cidade,bairro,regiao,quantidade_atendimentos,ativo,
        assigned_operador_id,origem_acao,importacao_id,ligacao_status)
      VALUES(_client_id,_campanha_id,v_lista,v_nome,v_item->>'telefone',nullif(btrim(v_item->>'cidade'),''),
        nullif(btrim(v_item->>'bairro'),''),nullif(btrim(v_item->>'regiao'),''),
        nullif(v_item->>'quantidade_atendimentos','')::integer,true,
        _assigned_operador_id,'gabinete_atendidos',v_import,'pendente') RETURNING id INTO v_contato;
      v_inserted:=v_inserted+1;
    ELSE
      UPDATE public.telemarketing_contatos_avulsos SET
        nome=coalesce(v_nome,nome),cidade=coalesce(nullif(btrim(v_item->>'cidade'),''),cidade),
        bairro=coalesce(nullif(btrim(v_item->>'bairro'),''),bairro),
        regiao=coalesce(nullif(btrim(v_item->>'regiao'),''),regiao),
        quantidade_atendimentos=greatest(coalesce(quantidade_atendimentos,0),coalesce(nullif(v_item->>'quantidade_atendimentos','')::integer,0))
      WHERE id=v_contato;
      v_updated:=v_updated+1;
    END IF;

    v_dates:=regexp_split_to_array(coalesce(v_item->>'datas_atendimentos',''),'\s*[,;|]\s*');
    v_areas:=regexp_split_to_array(coalesce(v_item->>'areas_atendimento',''),'\s*[,;|]\s*');
    FOR v_i IN 1..greatest(coalesce(array_length(v_dates,1),0),coalesce(array_length(v_areas,1),0),1) LOOP
      BEGIN v_date:=nullif(btrim(v_dates[least(v_i,coalesce(array_length(v_dates,1),1))]),'')::date;
      EXCEPTION WHEN others THEN v_date:=NULL;END;
      v_area:=nullif(btrim(v_areas[least(v_i,coalesce(array_length(v_areas,1),1))]),'');
      IF v_date IS NOT NULL OR v_area IS NOT NULL THEN
        INSERT INTO public.telemarketing_gabinete_atendimentos(client_id,contato_id,importacao_id,atendido_em,area_atendimento,posicao)
        VALUES(_client_id,v_contato,v_import,v_date,v_area,v_i) ON CONFLICT DO NOTHING;
      END IF;
    END LOOP;
  END LOOP;

  UPDATE public.telemarketing_gabinete_importacoes SET inseridos=v_inserted,atualizados=v_updated,
    invalidos=v_invalid,duplicados_no_arquivo=v_dup WHERE id=v_import;
  UPDATE public.telemarketing_listas SET total_contatos=(SELECT count(*) FROM public.telemarketing_contatos_avulsos a WHERE a.lista_id=v_lista)
  WHERE id=v_lista;
  RETURN jsonb_build_object('importacao_id',v_import,'lista_id',v_lista,'inserted',v_inserted,
    'updated',v_updated,'invalid',v_invalid,'duplicates',v_dup);
END;$function$;

-- Contexto exibido ao operador. A autenticacao do operador impede consultar
-- livremente a base usando apenas o ID de um contato.
CREATE OR REPLACE FUNCTION public.tele_gabinete_contexto(
  _client_id uuid,_nome text,_senha text,_contato_id uuid
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE v jsonb;
BEGIN
  PERFORM public._tele_assert_operador(_client_id,_nome,_senha);
  SELECT jsonb_build_object('origem','gabinete_atendidos','regiao',a.regiao,
    'quantidade_atendimentos',greatest(coalesce(a.quantidade_atendimentos,0),count(h.id)::integer),'primeiro_atendimento',min(h.atendido_em),
    'ultimo_atendimento',max(h.atendido_em),'areas',coalesce(jsonb_agg(DISTINCT h.area_atendimento)
      FILTER(WHERE h.area_atendimento IS NOT NULL),'[]'::jsonb),
    'historico',coalesce(jsonb_agg(jsonb_build_object('data',h.atendido_em,'area',h.area_atendimento)
      ORDER BY h.atendido_em DESC NULLS LAST,h.posicao) FILTER(WHERE h.id IS NOT NULL),'[]'::jsonb))
  INTO v FROM public.telemarketing_contatos_avulsos a
  LEFT JOIN public.telemarketing_gabinete_atendimentos h ON h.contato_id=a.id
  WHERE a.id=_contato_id AND a.client_id=_client_id AND a.origem_acao='gabinete_atendidos'
  GROUP BY a.id,a.regiao,a.quantidade_atendimentos;
  RETURN coalesce(v,'{}'::jsonb);
END;$function$;

-- A fonte continua fisicamente em contatos_avulsos, mas o relatorio recebe
-- um rotulo proprio. Campanha e lista preservam a atribuicao exata da acao.
CREATE OR REPLACE FUNCTION public.tele_fila_report_rows_v2(_client_id uuid,_campanha_id uuid DEFAULT NULL)
RETURNS TABLE(contato_id uuid,tabela text,origem text,nome text,telefone text,cidade text,bairro text,
  ligacao_status text,status_telemarketing text,vota_candidato text,candidato_alternativo text,
  candidato_federal text,federal_status text,candidato_senador text,senador_status text,
  candidato_governador text,governador_status text,operador_nome text,ligacao_em timestamptz,
  total_tentativas integer,proxima_tentativa_em timestamptz,campanha_id uuid,campanha_nome text,
  indicador_id uuid,indicador_nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
  WITH base(id,tabela,origem,nome,telefone,cidade,bairro,ligacao_status,status_telemarketing,
    vota_candidato,candidato_alternativo,candidato_federal,federal_status,candidato_senador,
    senador_status,candidato_governador,governador_status,operador_nome,ligacao_em,total_tentativas,
    proxima_tentativa_em,campanha_id,indicador_id,indicador_nome) AS(
    SELECT c.id,'contratados'::text tabela,CASE WHEN c.is_lider THEN 'Lider (contratado)' ELSE 'Contratado' END origem,
      c.nome,c.telefone,c.cidade,c.bairro,c.ligacao_status,NULL::text status_telemarketing,c.vota_candidato,c.candidato_alternativo,
      c.candidato_federal,c.federal_status,c.candidato_senador,c.senador_status,c.candidato_governador,c.governador_status,
      c.operador_nome,c.ligacao_em,coalesce(c.tentativas_count,0),c.proxima_tentativa_em,c.campanha_id,NULL::uuid,NULL::text
    FROM public.contratados c WHERE c.client_id=_client_id
    UNION ALL SELECT i.id,'contratado_indicados','Indicado de contratado',i.nome,i.telefone,i.cidade,i.bairro,i.ligacao_status,i.status,
      i.vota_candidato,i.candidato_alternativo,i.candidato_federal,i.federal_status,i.candidato_senador,i.senador_status,
      i.candidato_governador,i.governador_status,i.operador_nome,i.ligacao_em,coalesce(i.tentativas_count,0),i.proxima_tentativa_em,
      i.campanha_id,i.contratado_id,ct.nome FROM public.contratado_indicados i LEFT JOIN public.contratados ct ON ct.id=i.contratado_id WHERE i.client_id=_client_id
    UNION ALL SELECT p.id,'eleicao_pessoas','Estrutura eleitoral',p.nome,p.telefone,p.cidade,p.bairro,p.ligacao_status,NULL,p.vota_candidato,
      p.candidato_alternativo,p.candidato_federal,p.federal_status,p.candidato_senador,p.senador_status,p.candidato_governador,p.governador_status,
      p.operador_nome,p.ligacao_em,coalesce(p.tentativas_count,0),p.proxima_tentativa_em,p.campanha_id,NULL::uuid,NULL::text
      FROM public.eleicao_pessoas p WHERE p.client_id=_client_id AND p.telefone IS NOT NULL
    UNION ALL SELECT ei.id,'eleicao_indicados','Indicado (eleicao)',ei.nome,ei.telefone,ei.cidade,ei.bairro,ei.ultimo_status_ligacao,
      ei.status_telemarketing,ei.vota_candidato,ei.candidato_alternativo,ei.candidato_federal,ei.federal_status,ei.candidato_senador,
      ei.senador_status,ei.candidato_governador,ei.governador_status,ei.operador_nome,ei.ultima_ligacao_em,coalesce(ei.total_tentativas,0),
      ei.proxima_tentativa_em,ei.campanha_id,ei.indicador_id,ep.nome FROM public.eleicao_indicados ei
      LEFT JOIN public.eleicao_pessoas ep ON ep.id=ei.indicador_id WHERE ei.client_id=_client_id
    UNION ALL SELECT a.id,'contatos_avulsos',CASE WHEN a.origem_acao='gabinete_atendidos' THEN 'Atendidos pelo gabinete' ELSE 'Lista externa / planilha' END,
      a.nome,a.telefone,a.cidade,a.bairro,a.ligacao_status,NULL,a.vota_candidato,a.candidato_alternativo,a.candidato_federal,a.federal_status,
      a.candidato_senador,a.senador_status,a.candidato_governador,a.governador_status,a.operador_nome,a.ligacao_em,
      coalesce(a.tentativas_count,0),a.proxima_tentativa_em,a.campanha_id,NULL::uuid,NULL::text
      FROM public.telemarketing_contatos_avulsos a WHERE a.client_id=_client_id AND coalesce(a.ativo,true)
  ) SELECT b.id,b.tabela,b.origem,b.nome,b.telefone,b.cidade,b.bairro,b.ligacao_status,b.status_telemarketing,b.vota_candidato,
    b.candidato_alternativo,b.candidato_federal,b.federal_status,b.candidato_senador,b.senador_status,b.candidato_governador,
    b.governador_status,b.operador_nome,b.ligacao_em,b.total_tentativas,b.proxima_tentativa_em,b.campanha_id,
    coalesce(cam.nome,'Sem fila'),b.indicador_id,b.indicador_nome
  FROM base b LEFT JOIN public.telemarketing_campanhas cam ON cam.id=b.campanha_id
  WHERE public.user_can_access_client(_client_id) AND(_campanha_id IS NULL OR b.campanha_id=_campanha_id)
  ORDER BY b.tabela,b.id;
$function$;

CREATE OR REPLACE FUNCTION public.tele_gabinete_report(_client_id uuid,_campanha_id uuid)
RETURNS TABLE(contato_id uuid,nome text,telefone text,bairro text,regiao text,areas text,
  ultimo_atendimento date,ligacao_status text,vota_candidato text,operador_nome text,total_tentativas integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $function$
 SELECT a.id,a.nome,a.telefone,a.bairro,a.regiao,
   coalesce(string_agg(DISTINCT h.area_atendimento,', '),'Sem area'),max(h.atendido_em),
   a.ligacao_status,a.vota_candidato,a.operador_nome,coalesce(a.tentativas_count,0)
 FROM public.telemarketing_contatos_avulsos a LEFT JOIN public.telemarketing_gabinete_atendimentos h ON h.contato_id=a.id
 WHERE a.client_id=_client_id AND a.campanha_id=_campanha_id AND a.origem_acao='gabinete_atendidos'
   AND public.user_can_access_client(_client_id)
 GROUP BY a.id;
$function$;

REVOKE ALL ON FUNCTION public.tele_import_gabinete_atendidos(uuid,uuid,jsonb,text,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tele_gabinete_contexto(uuid,text,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tele_gabinete_report(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_import_gabinete_atendidos(uuid,uuid,jsonb,text,uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.tele_gabinete_contexto(uuid,text,text,uuid) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tele_gabinete_report(uuid,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
