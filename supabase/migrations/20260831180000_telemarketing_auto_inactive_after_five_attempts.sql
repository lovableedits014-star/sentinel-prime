-- Inativação reversível de contatos após cinco tentativas sem atendimento.
-- O cadastro e todo o histórico permanecem intactos.

CREATE TABLE IF NOT EXISTS public.telemarketing_inactive_contacts (
  client_id uuid NOT NULL,
  tabela text NOT NULL CHECK (tabela IN ('contratados','contratado_indicados','contatos_avulsos','eleicao_indicados','eleicao_pessoas')),
  contato_id uuid NOT NULL,
  telefone_key text,
  motivo text NOT NULL DEFAULT 'limite_tentativas_sem_atendimento',
  tentativas_no_momento integer NOT NULL,
  inativado_em timestamptz NOT NULL DEFAULT now(),
  inativado_por text,
  reativado_em timestamptz,
  reativado_por text,
  PRIMARY KEY (client_id, tabela, contato_id)
);

CREATE INDEX IF NOT EXISTS idx_tele_inactive_active
  ON public.telemarketing_inactive_contacts(client_id, inativado_em DESC)
  WHERE reativado_em IS NULL;

ALTER TABLE public.telemarketing_inactive_contacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tele_inactive_client_access ON public.telemarketing_inactive_contacts;
CREATE POLICY tele_inactive_client_access ON public.telemarketing_inactive_contacts
  FOR SELECT TO authenticated
  USING (public.user_can_access_client(client_id));

-- O bloqueio por telefone já é respeitado atomicamente pelo seletor da fila.
ALTER TABLE public.telemarketing_phone_outcomes
  DROP CONSTRAINT IF EXISTS telemarketing_phone_outcomes_ligacao_status_check;
ALTER TABLE public.telemarketing_phone_outcomes
  ADD CONSTRAINT telemarketing_phone_outcomes_ligacao_status_check
  CHECK (ligacao_status IN ('atendeu','recusou','invalido','inativo'));

CREATE OR REPLACE FUNCTION public.tele_attempt_count(_client_id uuid, _tabela text, _id uuid)
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_count integer;
BEGIN
  CASE _tabela
    WHEN 'contratados' THEN SELECT tentativas_count INTO v_count FROM public.contratados WHERE client_id=_client_id AND id=_id;
    WHEN 'contratado_indicados' THEN SELECT tentativas_count INTO v_count FROM public.contratado_indicados WHERE client_id=_client_id AND id=_id;
    WHEN 'contatos_avulsos' THEN SELECT tentativas_count INTO v_count FROM public.telemarketing_contatos_avulsos WHERE client_id=_client_id AND id=_id;
    WHEN 'eleicao_indicados' THEN SELECT total_tentativas INTO v_count FROM public.eleicao_indicados WHERE client_id=_client_id AND id=_id;
    WHEN 'eleicao_pessoas' THEN SELECT tentativas_count INTO v_count FROM public.eleicao_pessoas WHERE client_id=_client_id AND id=_id;
    ELSE RAISE EXCEPTION 'Tabela inválida';
  END CASE;
  RETURN COALESCE(v_count,0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.tele_auto_inactivate_contact()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_attempts integer; v_phone text;
BEGIN
  IF NEW.ligacao_status <> 'nao_atendeu' THEN RETURN NEW; END IF;
  v_attempts := public.tele_attempt_count(NEW.client_id,NEW.tabela,NEW.contato_id);
  IF v_attempts < 5 THEN RETURN NEW; END IF;
  v_phone := public._tele_contact_phone_key(NEW.client_id,NEW.tabela,NEW.contato_id);

  INSERT INTO public.telemarketing_inactive_contacts(
    client_id,tabela,contato_id,telefone_key,tentativas_no_momento,inativado_em,inativado_por,reativado_em,reativado_por)
  VALUES(NEW.client_id,NEW.tabela,NEW.contato_id,v_phone,v_attempts,COALESCE(NEW.created_at,now()),NEW.operador_nome,NULL,NULL)
  ON CONFLICT(client_id,tabela,contato_id) DO UPDATE SET
    telefone_key=EXCLUDED.telefone_key,tentativas_no_momento=EXCLUDED.tentativas_no_momento,
    inativado_em=EXCLUDED.inativado_em,inativado_por=EXCLUDED.inativado_por,reativado_em=NULL,reativado_por=NULL;

  IF v_phone IS NOT NULL THEN
    INSERT INTO public.telemarketing_phone_outcomes(client_id,telefone_key,ligacao_status,tabela,contato_id,operador_nome,observacao,concluded_at)
    VALUES(NEW.client_id,v_phone,'inativo',NEW.tabela,NEW.contato_id,NEW.operador_nome,'Inativado automaticamente após 5 tentativas sem atendimento',COALESCE(NEW.created_at,now()))
    ON CONFLICT(client_id,telefone_key) DO UPDATE SET ligacao_status='inativo',tabela=EXCLUDED.tabela,
      contato_id=EXCLUDED.contato_id,operador_nome=EXCLUDED.operador_nome,observacao=EXCLUDED.observacao,concluded_at=EXCLUDED.concluded_at
    WHERE public.telemarketing_phone_outcomes.ligacao_status='inativo';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_tele_auto_inactivate_contact ON public.telemarketing_call_log;
CREATE TRIGGER trg_tele_auto_inactivate_contact AFTER INSERT ON public.telemarketing_call_log
FOR EACH ROW EXECUTE FUNCTION public.tele_auto_inactivate_contact();

-- Aplica a mesma proteção aos contatos que já chegaram ao limite antes desta migração.
WITH existing AS (
  SELECT client_id,'contratados'::text tabela,id contato_id,telefone,COALESCE(tentativas_count,0) attempts,operador_nome
    FROM public.contratados WHERE ligacao_status='nao_atendeu' AND COALESCE(tentativas_count,0)>=5
  UNION ALL SELECT client_id,'contratado_indicados',id,telefone,COALESCE(tentativas_count,0),operador_nome
    FROM public.contratado_indicados WHERE ligacao_status='nao_atendeu' AND COALESCE(tentativas_count,0)>=5
  UNION ALL SELECT client_id,'contatos_avulsos',id,telefone,COALESCE(tentativas_count,0),operador_nome
    FROM public.telemarketing_contatos_avulsos WHERE ligacao_status='nao_atendeu' AND COALESCE(tentativas_count,0)>=5
  UNION ALL SELECT client_id,'eleicao_indicados',id,telefone,COALESCE(total_tentativas,0),operador_nome
    FROM public.eleicao_indicados WHERE ultimo_status_ligacao='nao_atendeu' AND COALESCE(total_tentativas,0)>=5
  UNION ALL SELECT client_id,'eleicao_pessoas',id,telefone,COALESCE(tentativas_count,0),operador_nome
    FROM public.eleicao_pessoas WHERE ligacao_status='nao_atendeu' AND COALESCE(tentativas_count,0)>=5
)
INSERT INTO public.telemarketing_inactive_contacts(client_id,tabela,contato_id,telefone_key,tentativas_no_momento,inativado_por)
SELECT client_id,tabela,contato_id,public.tele_phone_key(telefone),attempts,operador_nome FROM existing
ON CONFLICT(client_id,tabela,contato_id) DO NOTHING;

INSERT INTO public.telemarketing_phone_outcomes(client_id,telefone_key,ligacao_status,tabela,contato_id,operador_nome,observacao,concluded_at)
SELECT DISTINCT ON (ic.client_id,ic.telefone_key) ic.client_id,ic.telefone_key,'inativo',ic.tabela,ic.contato_id,
  ic.inativado_por,'Inativado automaticamente após 5 tentativas sem atendimento',ic.inativado_em
FROM public.telemarketing_inactive_contacts ic
WHERE ic.reativado_em IS NULL AND ic.telefone_key IS NOT NULL
ORDER BY ic.client_id,ic.telefone_key,ic.inativado_em DESC
ON CONFLICT(client_id,telefone_key) DO UPDATE SET ligacao_status='inativo',tabela=EXCLUDED.tabela,
  contato_id=EXCLUDED.contato_id,operador_nome=EXCLUDED.operador_nome,observacao=EXCLUDED.observacao,concluded_at=EXCLUDED.concluded_at
WHERE public.telemarketing_phone_outcomes.ligacao_status='inativo';

CREATE OR REPLACE FUNCTION public.tele_reativar_contato(_client_id uuid,_tabela text,_id uuid,_reativado_por text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_phone text; v_count integer;
BEGIN
  IF NOT public.user_can_access_client(_client_id) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  UPDATE public.telemarketing_inactive_contacts SET reativado_em=now(),reativado_por=COALESCE(NULLIF(btrim(_reativado_por),''),auth.uid()::text)
   WHERE client_id=_client_id AND tabela=_tabela AND contato_id=_id AND reativado_em IS NULL
   RETURNING telefone_key INTO v_phone;
  GET DIAGNOSTICS v_count=ROW_COUNT;
  IF v_count>0 AND v_phone IS NOT NULL THEN
    DELETE FROM public.telemarketing_phone_outcomes WHERE client_id=_client_id AND telefone_key=v_phone AND ligacao_status='inativo';
  END IF;
  RETURN jsonb_build_object('reactivated',v_count>0);
END;
$function$;

CREATE OR REPLACE FUNCTION public.tele_proximo_inativo(
  _client_id uuid,_nome text,_senha text,_campanha_id uuid DEFAULT NULL,
  _ttl_seconds integer DEFAULT 1800,_session_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_op uuid; v_item record; v_claim jsonb;
BEGIN
  v_op:=public._tele_assert_operador(_client_id,_nome,_senha);
  SELECT ic.* INTO v_item
  FROM public.telemarketing_inactive_contacts ic
  JOIN LATERAL (
    SELECT l.campanha_id FROM public.telemarketing_call_log l
    WHERE l.client_id=ic.client_id AND l.tabela=ic.tabela AND l.contato_id=ic.contato_id
    ORDER BY l.created_at DESC LIMIT 1
  ) last_call ON true
  WHERE ic.client_id=_client_id AND ic.reativado_em IS NULL
    AND (_campanha_id IS NULL OR last_call.campanha_id=_campanha_id)
    AND EXISTS (SELECT 1 FROM public.telemarketing_campanha_operadores co
      WHERE co.client_id=_client_id AND co.operador_id=v_op AND co.campanha_id=last_call.campanha_id AND co.ativo=true)
  ORDER BY ic.inativado_em,ic.contato_id LIMIT 1 FOR UPDATE OF ic SKIP LOCKED;
  IF v_item.contato_id IS NULL THEN RETURN jsonb_build_object('found',false); END IF;

  UPDATE public.telemarketing_inactive_contacts SET reativado_em=now(),reativado_por=_nome
   WHERE client_id=_client_id AND tabela=v_item.tabela AND contato_id=v_item.contato_id;
  IF v_item.telefone_key IS NOT NULL THEN
    DELETE FROM public.telemarketing_phone_outcomes
     WHERE client_id=_client_id AND telefone_key=v_item.telefone_key AND ligacao_status='inativo';
  END IF;
  SELECT public.tele_claim_contato(_client_id,_nome,_senha,v_item.tabela,v_item.contato_id,_ttl_seconds,_session_id) INTO v_claim;
  RETURN jsonb_build_object('found',true,'tabela',v_item.tabela,'contato_id',v_item.contato_id,'claim',v_claim);
END;
$function$;

DROP FUNCTION IF EXISTS public.tele_indicador_report_rows(uuid);
CREATE FUNCTION public.tele_indicador_report_rows(_client_id uuid)
RETURNS TABLE(
  contato_id uuid, indicador_id uuid, indicador_nome text, indicador_tipo text, indicador_regiao text,
  nome text, telefone text, cidade text, bairro text, status_telemarketing text, ultimo_status_ligacao text,
  vota_candidato text, candidato_alternativo text, operador_nome text, ultima_ligacao_em timestamptz,
  total_tentativas integer, proxima_tentativa_em timestamptz, campanha_id uuid, campanha_nome text,
  inativo boolean, inativado_em timestamptz
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
  SELECT ei.id,ei.indicador_id,ep.nome,ei.indicador_tipo::text,ep.regiao,ei.nome,ei.telefone,ei.cidade,ei.bairro,
    ei.status_telemarketing,ei.ultimo_status_ligacao,ei.vota_candidato,ei.candidato_alternativo,ei.operador_nome,
    ei.ultima_ligacao_em,COALESCE(ei.total_tentativas,0),ei.proxima_tentativa_em,ei.campanha_id,tc.nome,
    (ic.contato_id IS NOT NULL),ic.inativado_em
  FROM public.eleicao_indicados ei JOIN public.eleicao_pessoas ep ON ep.id=ei.indicador_id
  LEFT JOIN public.telemarketing_campanhas tc ON tc.id=ei.campanha_id
  LEFT JOIN public.telemarketing_inactive_contacts ic ON ic.client_id=ei.client_id AND ic.tabela='eleicao_indicados'
    AND ic.contato_id=ei.id AND ic.reativado_em IS NULL
  WHERE ei.client_id=_client_id AND public.user_can_access_client(_client_id)
  ORDER BY ep.nome,ei.nome;
$function$;

REVOKE ALL ON FUNCTION public.tele_attempt_count(uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tele_reativar_contato(uuid,text,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tele_proximo_inativo(uuid,text,text,uuid,integer,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tele_indicador_report_rows(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_reativar_contato(uuid,text,uuid,text) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.tele_proximo_inativo(uuid,text,text,uuid,integer,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tele_indicador_report_rows(uuid) TO authenticated,service_role;
