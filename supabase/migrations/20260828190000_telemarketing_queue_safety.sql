-- Segurança de concorrência da fila:
-- 1) uma única reserva por telefone em todas as origens;
-- 2) reserva longa o bastante para chamadas feitas fora do navegador;
-- 3) retomada da mesma sessão;
-- 4) cooldown ao pular um contato;
-- 5) contatos já concluídos por um cadastro duplicado não voltam à fila ativa.

CREATE OR REPLACE FUNCTION public.tele_phone_key(_telefone text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $function$
  SELECT CASE
    WHEN length(regexp_replace(COALESCE(_telefone,''),'\D','','g')) < 8 THEN NULL
    WHEN length(regexp_replace(COALESCE(_telefone,''),'\D','','g')) > 11
      THEN right(regexp_replace(COALESCE(_telefone,''),'\D','','g'),11)
    ELSE regexp_replace(COALESCE(_telefone,''),'\D','','g')
  END;
$function$;

CREATE OR REPLACE FUNCTION public._tele_contact_phone_key(_client_id uuid, _tabela text, _id uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_phone text;
BEGIN
  CASE _tabela
    WHEN 'contratados' THEN SELECT telefone INTO v_phone FROM public.contratados WHERE client_id=_client_id AND id=_id;
    WHEN 'contratado_indicados' THEN SELECT telefone INTO v_phone FROM public.contratado_indicados WHERE client_id=_client_id AND id=_id;
    WHEN 'contatos_avulsos' THEN SELECT telefone INTO v_phone FROM public.telemarketing_contatos_avulsos WHERE client_id=_client_id AND id=_id;
    WHEN 'eleicao_indicados' THEN SELECT telefone INTO v_phone FROM public.eleicao_indicados WHERE client_id=_client_id AND id=_id;
    WHEN 'eleicao_pessoas' THEN SELECT telefone INTO v_phone FROM public.eleicao_pessoas WHERE client_id=_client_id AND id=_id;
    ELSE RAISE EXCEPTION 'Tabela inválida';
  END CASE;
  RETURN public.tele_phone_key(v_phone);
END;
$function$;

ALTER TABLE public.telemarketing_call_assignments ADD COLUMN IF NOT EXISTS telefone_key text;
ALTER TABLE public.telemarketing_call_log ADD COLUMN IF NOT EXISTS telefone_key text;

UPDATE public.telemarketing_call_assignments a
   SET telefone_key=public._tele_contact_phone_key(a.client_id,a.tabela,a.contato_id)
 WHERE a.telefone_key IS NULL;

UPDATE public.telemarketing_call_log l
   SET telefone_key=public._tele_contact_phone_key(l.client_id,l.tabela,l.contato_id)
 WHERE l.telefone_key IS NULL;

-- Preserva somente a reserva mais recente quando já havia cadastros duplicados.
DELETE FROM public.telemarketing_call_assignments old
USING public.telemarketing_call_assignments keep
WHERE old.client_id=keep.client_id AND old.telefone_key=keep.telefone_key
  AND old.telefone_key IS NOT NULL
  AND (old.expires_at,old.created_at,old.id) < (keep.expires_at,keep.created_at,keep.id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_tele_assignment_phone
  ON public.telemarketing_call_assignments(client_id,telefone_key)
  WHERE telefone_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tele_call_log_phone_status
  ON public.telemarketing_call_log(client_id,telefone_key,ligacao_status,created_at DESC);

-- Registro definitivo por telefone. Cobre também dados antigos cujo contato
-- concluído possua uma cópia pendente em outra origem.
CREATE TABLE IF NOT EXISTS public.telemarketing_phone_outcomes(
  client_id uuid NOT NULL,
  telefone_key text NOT NULL,
  ligacao_status text NOT NULL CHECK(ligacao_status IN('atendeu','recusou','invalido')),
  tabela text NOT NULL,
  contato_id uuid NOT NULL,
  operador_nome text,
  observacao text,
  concluded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(client_id,telefone_key)
);
ALTER TABLE public.telemarketing_phone_outcomes ENABLE ROW LEVEL SECURITY;

INSERT INTO public.telemarketing_phone_outcomes(
  client_id,telefone_key,ligacao_status,tabela,contato_id,operador_nome,observacao,concluded_at)
SELECT DISTINCT ON (x.client_id,x.telefone_key)
  x.client_id,x.telefone_key,x.ligacao_status,x.tabela,x.contato_id,x.operador_nome,x.observacao,x.concluded_at
FROM (
  SELECT c.client_id,public.tele_phone_key(c.telefone) telefone_key,c.ligacao_status,
    'contratados'::text tabela,c.id contato_id,c.operador_nome,c.observacao_tele observacao,COALESCE(c.ligacao_em,c.created_at) concluded_at
  FROM public.contratados c WHERE c.ligacao_status IN('atendeu','recusou','invalido')
  UNION ALL
  SELECT i.client_id,public.tele_phone_key(i.telefone),i.ligacao_status,'contratado_indicados',i.id,
    i.operador_nome,i.observacao_tele,COALESCE(i.ligacao_em,i.created_at)
  FROM public.contratado_indicados i WHERE i.ligacao_status IN('atendeu','recusou','invalido')
  UNION ALL
  SELECT a.client_id,public.tele_phone_key(a.telefone),a.ligacao_status,'contatos_avulsos',a.id,
    a.operador_nome,a.observacao_tele,COALESCE(a.ligacao_em,a.created_at)
  FROM public.telemarketing_contatos_avulsos a WHERE a.ligacao_status IN('atendeu','recusou','invalido')
  UNION ALL
  SELECT i.client_id,public.tele_phone_key(i.telefone),i.ultimo_status_ligacao,'eleicao_indicados',i.id,
    i.operador_nome,i.observacao_tele,COALESCE(i.ultima_ligacao_em,i.created_at)
  FROM public.eleicao_indicados i WHERE i.ultimo_status_ligacao IN('atendeu','recusou','invalido')
  UNION ALL
  SELECT p.client_id,public.tele_phone_key(p.telefone),p.ligacao_status,'eleicao_pessoas',p.id,
    p.operador_nome,p.observacao_tele,COALESCE(p.ligacao_em,p.created_at)
  FROM public.eleicao_pessoas p WHERE p.ligacao_status IN('atendeu','recusou','invalido')
) x
WHERE x.telefone_key IS NOT NULL
ORDER BY x.client_id,x.telefone_key,x.concluded_at DESC
ON CONFLICT(client_id,telefone_key) DO UPDATE SET
  ligacao_status=EXCLUDED.ligacao_status,tabela=EXCLUDED.tabela,contato_id=EXCLUDED.contato_id,
  operador_nome=EXCLUDED.operador_nome,observacao=EXCLUDED.observacao,concluded_at=EXCLUDED.concluded_at
WHERE EXCLUDED.concluded_at>=public.telemarketing_phone_outcomes.concluded_at;

CREATE OR REPLACE FUNCTION public.tele_call_log_set_phone_key()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  NEW.telefone_key:=public._tele_contact_phone_key(NEW.client_id,NEW.tabela,NEW.contato_id);
  IF NEW.telefone_key IS NOT NULL AND NEW.ligacao_status IN('atendeu','recusou','invalido') THEN
    INSERT INTO public.telemarketing_phone_outcomes(
      client_id,telefone_key,ligacao_status,tabela,contato_id,operador_nome,observacao,concluded_at)
    VALUES(NEW.client_id,NEW.telefone_key,NEW.ligacao_status,NEW.tabela,NEW.contato_id,
      NEW.operador_nome,NEW.observacao,COALESCE(NEW.created_at,now()))
    ON CONFLICT(client_id,telefone_key) DO UPDATE SET
      ligacao_status=EXCLUDED.ligacao_status,tabela=EXCLUDED.tabela,contato_id=EXCLUDED.contato_id,
      operador_nome=EXCLUDED.operador_nome,observacao=EXCLUDED.observacao,concluded_at=EXCLUDED.concluded_at
    WHERE EXCLUDED.concluded_at>=public.telemarketing_phone_outcomes.concluded_at;
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_tele_call_log_set_phone_key ON public.telemarketing_call_log;
CREATE TRIGGER trg_tele_call_log_set_phone_key BEFORE INSERT OR UPDATE OF tabela,contato_id
ON public.telemarketing_call_log FOR EACH ROW EXECUTE FUNCTION public.tele_call_log_set_phone_key();

CREATE TABLE IF NOT EXISTS public.telemarketing_skip_cooldowns(
  client_id uuid NOT NULL,
  operador_id uuid NOT NULL REFERENCES public.telemarketing_operadores(id) ON DELETE CASCADE,
  lock_key text NOT NULL,
  tabela text NOT NULL,
  contato_id uuid NOT NULL,
  motivo text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(client_id,operador_id,lock_key)
);
CREATE INDEX IF NOT EXISTS idx_tele_skip_expiry ON public.telemarketing_skip_cooldowns(expires_at);

CREATE OR REPLACE FUNCTION public.tele_claim_contato(
  _client_id uuid,_nome text,_senha text,_tabela text,_id uuid,
  _ttl_seconds integer DEFAULT 1800,_session_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $function$
DECLARE v_row record; v_expires timestamptz; v_session text; v_phone text; v_key text;
BEGIN
  PERFORM public._tele_assert_operador(_client_id,_nome,_senha);
  IF _tabela NOT IN ('contratados','contratado_indicados','contatos_avulsos','eleicao_indicados','eleicao_pessoas') THEN RAISE EXCEPTION 'Tabela inválida'; END IF;
  v_session:=NULLIF(btrim(_session_id),'');
  v_phone:=public._tele_contact_phone_key(_client_id,_tabela,_id);
  v_key:=COALESCE(v_phone,_tabela||':'||_id::text);
  PERFORM pg_advisory_xact_lock(hashtextextended(_client_id::text||':'||v_key,0));
  DELETE FROM public.telemarketing_call_assignments WHERE expires_at<=now();
  SELECT * INTO v_row FROM public.telemarketing_call_assignments
   WHERE client_id=_client_id AND expires_at>now()
     AND ((v_phone IS NOT NULL AND telefone_key=v_phone) OR (v_phone IS NULL AND tabela=_tabela AND contato_id=_id))
   LIMIT 1;
  IF v_row.id IS NOT NULL AND (v_row.operador_nome<>_nome OR v_row.session_id IS DISTINCT FROM v_session) THEN
    RETURN jsonb_build_object('claimed',false,'operador_nome',v_row.operador_nome,'expires_at',v_row.expires_at,'same_phone',v_row.tabela<>_tabela OR v_row.contato_id<>_id);
  END IF;
  IF v_row.id IS NOT NULL THEN DELETE FROM public.telemarketing_call_assignments WHERE id=v_row.id; END IF;
  v_expires:=now()+make_interval(secs=>GREATEST(_ttl_seconds,1800));
  INSERT INTO public.telemarketing_call_assignments(client_id,tabela,contato_id,operador_nome,expires_at,session_id,telefone_key)
  VALUES(_client_id,_tabela,_id,_nome,v_expires,v_session,v_phone);
  RETURN jsonb_build_object('claimed',true,'expires_at',v_expires,'resumed',v_row.id IS NOT NULL);
END;$function$;

CREATE OR REPLACE FUNCTION public.tele_heartbeat_contato(
  _client_id uuid,_nome text,_senha text,_tabela text,_id uuid,
  _ttl_seconds integer DEFAULT 1800,_session_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $function$
DECLARE v_count int; v_phone text;
BEGIN
  PERFORM public._tele_assert_operador(_client_id,_nome,_senha);
  v_phone:=public._tele_contact_phone_key(_client_id,_tabela,_id);
  UPDATE public.telemarketing_call_assignments SET expires_at=now()+make_interval(secs=>GREATEST(_ttl_seconds,1800))
   WHERE client_id=_client_id AND operador_nome=_nome
     AND session_id IS NOT DISTINCT FROM NULLIF(btrim(_session_id),'')
     AND ((v_phone IS NOT NULL AND telefone_key=v_phone) OR (v_phone IS NULL AND tabela=_tabela AND contato_id=_id));
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('renewed',v_count>0);
END;$function$;

CREATE OR REPLACE FUNCTION public.tele_release_contato(
  _client_id uuid,_nome text,_senha text,_tabela text,_id uuid,_session_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $function$
DECLARE v_count int; v_phone text;
BEGIN
  PERFORM public._tele_assert_operador(_client_id,_nome,_senha);
  v_phone:=public._tele_contact_phone_key(_client_id,_tabela,_id);
  DELETE FROM public.telemarketing_call_assignments WHERE client_id=_client_id AND operador_nome=_nome
   AND session_id IS NOT DISTINCT FROM NULLIF(btrim(_session_id),'')
   AND ((v_phone IS NOT NULL AND telefone_key=v_phone) OR (v_phone IS NULL AND tabela=_tabela AND contato_id=_id));
  GET DIAGNOSTICS v_count=ROW_COUNT;
  RETURN jsonb_build_object('released',v_count>0);
END;$function$;

CREATE OR REPLACE FUNCTION public.tele_skip_contato(
  _client_id uuid,_nome text,_senha text,_tabela text,_id uuid,
  _session_id text DEFAULT NULL,_motivo text DEFAULT NULL,_cooldown_seconds integer DEFAULT 900
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_op_id uuid; v_phone text; v_key text;
BEGIN
  v_op_id:=public._tele_assert_operador(_client_id,_nome,_senha);
  v_phone:=public._tele_contact_phone_key(_client_id,_tabela,_id);
  v_key:=COALESCE(v_phone,_tabela||':'||_id::text);
  INSERT INTO public.telemarketing_skip_cooldowns(client_id,operador_id,lock_key,tabela,contato_id,motivo,expires_at)
  VALUES(_client_id,v_op_id,v_key,_tabela,_id,NULLIF(btrim(_motivo),''),now()+make_interval(secs=>GREATEST(_cooldown_seconds,300)))
  ON CONFLICT(client_id,operador_id,lock_key) DO UPDATE SET tabela=EXCLUDED.tabela,contato_id=EXCLUDED.contato_id,
    motivo=EXCLUDED.motivo,expires_at=EXCLUDED.expires_at,created_at=now();
  PERFORM public.tele_release_contato(_client_id,_nome,_senha,_tabela,_id,_session_id);
  RETURN jsonb_build_object('skipped',true,'cooldown_until',now()+make_interval(secs=>GREATEST(_cooldown_seconds,300)));
END;$function$;

CREATE OR REPLACE FUNCTION public.tele_proximo_contato(
  _client_id uuid,_nome text,_senha text,_campanha_id uuid DEFAULT NULL,
  _ttl_seconds integer DEFAULT 1800,_session_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions' AS $function$
DECLARE v_expires timestamptz; v_cand record; v_inserted boolean; v_op_id uuid; v_lista_id uuid; v_session text; v_existing record; v_lock_key text;
BEGIN
  v_op_id:=public._tele_assert_operador(_client_id,_nome,_senha);
  v_session:=NULLIF(btrim(_session_id),'');
  SELECT lista_atual_id INTO v_lista_id FROM public.telemarketing_operadores WHERE id=v_op_id;
  DELETE FROM public.telemarketing_call_assignments WHERE expires_at<=now();
  DELETE FROM public.telemarketing_skip_cooldowns WHERE expires_at<=now();
  SELECT * INTO v_existing FROM public.telemarketing_call_assignments
   WHERE client_id=_client_id AND operador_nome=_nome AND session_id IS NOT DISTINCT FROM v_session AND expires_at>now()
   ORDER BY expires_at DESC LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    UPDATE public.telemarketing_call_assignments SET expires_at=now()+make_interval(secs=>GREATEST(_ttl_seconds,1800)) WHERE id=v_existing.id;
    RETURN jsonb_build_object('found',true,'tabela',v_existing.tabela,'contato_id',v_existing.contato_id,'expires_at',now()+make_interval(secs=>GREATEST(_ttl_seconds,1800)),'resumed',true,'lista_id',v_lista_id);
  END IF;
  v_expires:=now()+make_interval(secs=>GREATEST(_ttl_seconds,1800));
  FOR v_cand IN
    WITH allowed AS(SELECT co.campanha_id FROM public.telemarketing_campanha_operadores co WHERE co.client_id=_client_id AND co.operador_id=v_op_id AND co.ativo=true),
    candidates AS(
      SELECT 'contatos_avulsos'::text tabela,av.id,av.telefone,public.tele_phone_key(av.telefone) phone_key,COALESCE(av.tentativas_count,0) tentativas,av.created_at,av.ligacao_status,av.proxima_tentativa_em,0 priority
      FROM public.telemarketing_contatos_avulsos av WHERE av.client_id=_client_id AND av.ativo=true AND (_campanha_id IS NULL OR av.campanha_id=_campanha_id) AND av.campanha_id IN(SELECT campanha_id FROM allowed) AND public.tele_assign_visivel(_client_id,av.campanha_id,av.assigned_operador_id,v_op_id) AND (v_lista_id IS NULL OR av.lista_id=v_lista_id) AND COALESCE(av.ligacao_status,'pendente') IN('pendente','nao_atendeu','reagendou')
      UNION ALL SELECT 'contratados',c.id,c.telefone,public.tele_phone_key(c.telefone),COALESCE(c.tentativas_count,0),c.created_at,c.ligacao_status,c.proxima_tentativa_em,2 FROM public.contratados c WHERE v_lista_id IS NULL AND c.client_id=_client_id AND (_campanha_id IS NULL OR c.campanha_id=_campanha_id) AND c.campanha_id IN(SELECT campanha_id FROM allowed) AND COALESCE(c.ligacao_status,'pendente') IN('pendente','nao_atendeu','reagendou')
      UNION ALL SELECT 'contratado_indicados',i.id,i.telefone,public.tele_phone_key(i.telefone),COALESCE(i.tentativas_count,0),i.created_at,i.ligacao_status,i.proxima_tentativa_em,2 FROM public.contratado_indicados i WHERE v_lista_id IS NULL AND i.client_id=_client_id AND (_campanha_id IS NULL OR i.campanha_id=_campanha_id) AND i.campanha_id IN(SELECT campanha_id FROM allowed) AND COALESCE(i.ligacao_status,'pendente') IN('pendente','nao_atendeu','reagendou')
      UNION ALL SELECT 'eleicao_indicados',ei.id,ei.telefone,public.tele_phone_key(ei.telefone),COALESCE(ei.total_tentativas,0),ei.created_at,ei.ultimo_status_ligacao,ei.proxima_tentativa_em,1 FROM public.eleicao_indicados ei WHERE v_lista_id IS NULL AND ei.client_id=_client_id AND ei.campanha_id IS NOT NULL AND (_campanha_id IS NULL OR ei.campanha_id=_campanha_id) AND ei.campanha_id IN(SELECT campanha_id FROM allowed) AND public.tele_assign_visivel(_client_id,ei.campanha_id,ei.assigned_operador_id,v_op_id) AND COALESCE(ei.ultimo_status_ligacao,'pendente') IN('pendente','nao_atendeu','reagendou')
      UNION ALL SELECT 'eleicao_pessoas',p.id,p.telefone,public.tele_phone_key(p.telefone),COALESCE(p.tentativas_count,0),p.created_at,p.ligacao_status,p.proxima_tentativa_em,2 FROM public.eleicao_pessoas p WHERE v_lista_id IS NULL AND p.client_id=_client_id AND p.campanha_id IS NOT NULL AND p.telefone IS NOT NULL AND length(btrim(p.telefone))>=8 AND (_campanha_id IS NULL OR p.campanha_id=_campanha_id) AND p.campanha_id IN(SELECT campanha_id FROM allowed) AND public.tele_assign_visivel(_client_id,p.campanha_id,p.assigned_operador_id,v_op_id) AND COALESCE(p.ligacao_status,'pendente') IN('pendente','nao_atendeu','reagendou')
    )
    SELECT c.* FROM candidates c
    WHERE (c.proxima_tentativa_em IS NULL OR c.proxima_tentativa_em<=now())
      AND NOT EXISTS(SELECT 1 FROM public.telemarketing_call_assignments a WHERE a.client_id=_client_id AND a.expires_at>now() AND ((c.phone_key IS NOT NULL AND a.telefone_key=c.phone_key) OR (c.phone_key IS NULL AND a.tabela=c.tabela AND a.contato_id=c.id)))
      AND NOT EXISTS(SELECT 1 FROM public.telemarketing_skip_cooldowns s WHERE s.client_id=_client_id AND s.operador_id=v_op_id AND s.expires_at>now() AND s.lock_key=COALESCE(c.phone_key,c.tabela||':'||c.id::text))
      AND NOT EXISTS(SELECT 1 FROM public.telemarketing_phone_outcomes o WHERE o.client_id=_client_id AND c.phone_key IS NOT NULL AND o.telefone_key=c.phone_key)
    ORDER BY c.priority,CASE WHEN c.ligacao_status IS NULL OR c.ligacao_status='pendente' THEN 0 ELSE 1 END,c.tentativas,c.created_at LIMIT 100
  LOOP
    v_lock_key:=COALESCE(v_cand.phone_key,v_cand.tabela||':'||v_cand.id::text);
    PERFORM pg_advisory_xact_lock(hashtextextended(_client_id::text||':'||v_lock_key,0));
    BEGIN
      INSERT INTO public.telemarketing_call_assignments(client_id,tabela,contato_id,operador_nome,expires_at,session_id,telefone_key)
      VALUES(_client_id,v_cand.tabela,v_cand.id,_nome,v_expires,v_session,v_cand.phone_key);
      v_inserted:=true;
    EXCEPTION WHEN unique_violation THEN v_inserted:=false;
    END;
    IF v_inserted THEN RETURN jsonb_build_object('found',true,'tabela',v_cand.tabela,'contato_id',v_cand.id,'expires_at',v_expires,'resumed',false,'lista_id',v_lista_id); END IF;
  END LOOP;
  RETURN jsonb_build_object('found',false,'lista_id',v_lista_id);
END;$function$;

CREATE OR REPLACE FUNCTION public.tele_registrar_ligacao_sessao(
  _client_id uuid,_nome text,_senha text,_tabela text,_id uuid,_ligacao_status text,_cidade text,_bairro text,
  _vota_candidato text DEFAULT NULL,_candidato_alternativo text DEFAULT NULL,_observacao text DEFAULT NULL,_proxima_tentativa_em timestamptz DEFAULT NULL,
  _candidato_federal text DEFAULT NULL,_federal_status text DEFAULT NULL,_candidato_senador text DEFAULT NULL,_senador_status text DEFAULT NULL,
  _candidato_governador text DEFAULT NULL,_governador_status text DEFAULT NULL,_session_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_lock record; v_result jsonb; v_phone text;
BEGIN
  PERFORM public._tele_assert_operador(_client_id,_nome,_senha);
  v_phone:=public._tele_contact_phone_key(_client_id,_tabela,_id);
  SELECT operador_nome,session_id,expires_at,tabela,contato_id INTO v_lock FROM public.telemarketing_call_assignments
   WHERE client_id=_client_id AND expires_at>now() AND ((v_phone IS NOT NULL AND telefone_key=v_phone) OR (v_phone IS NULL AND tabela=_tabela AND contato_id=_id)) LIMIT 1;
  IF v_lock.operador_nome IS NULL THEN RETURN jsonb_build_object('updated',0,'conflict',true,'lock_owner','reserva expirada','lock_expired',true); END IF;
  IF v_lock.operador_nome<>_nome OR v_lock.session_id IS DISTINCT FROM NULLIF(btrim(_session_id),'') OR v_lock.tabela<>_tabela OR v_lock.contato_id<>_id THEN
    RETURN jsonb_build_object('updated',0,'conflict',true,'lock_owner',v_lock.operador_nome,'lock_expires',v_lock.expires_at);
  END IF;
  SELECT public.tele_registrar_ligacao(_client_id,_nome,_senha,_tabela,_id,_ligacao_status,_cidade,_bairro,_vota_candidato,_candidato_alternativo,_observacao,_proxima_tentativa_em,_candidato_federal,_federal_status,_candidato_senador,_senador_status,_candidato_governador,_governador_status) INTO v_result;
  RETURN v_result;
END;$function$;

REVOKE ALL ON FUNCTION public.tele_phone_key(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._tele_contact_phone_key(uuid,text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tele_skip_contato(uuid,text,text,text,uuid,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_claim_contato(uuid,text,text,text,uuid,integer,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tele_heartbeat_contato(uuid,text,text,text,uuid,integer,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tele_release_contato(uuid,text,text,text,uuid,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tele_skip_contato(uuid,text,text,text,uuid,text,text,integer) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tele_proximo_contato(uuid,text,text,uuid,integer,text) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tele_registrar_ligacao_sessao(uuid,text,text,text,uuid,text,text,text,text,text,text,timestamptz,text,text,text,text,text,text,text) TO anon,authenticated;

-- Busca de chamadas de retorno: ignora a distribuicao estatica por carteira,
-- respeita as campanhas liberadas e encontra bloqueios pelo telefone global.
CREATE OR REPLACE FUNCTION public.tele_buscar_retorno(
 _client_id uuid,_nome text,_senha text,_termo text,_campanha_id uuid DEFAULT NULL,_limite integer DEFAULT 30)
RETURNS TABLE(id uuid,nome text,telefone text,cidade text,bairro text,ligacao_status text,
 vota_candidato text,candidato_alternativo text,operador_nome text,ligacao_em timestamptz,
 tipo text,tabela text,proxima_tentativa_em timestamptz,tentativas_count integer,
 observacao_tele text,locked_by text,locked_until timestamptz,campanha_id uuid,
 indicador_nome text,indicador_tipo text,lista_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_op uuid; v_term text:=btrim(COALESCE(_termo,'')); v_digits text; v_lim int:=LEAST(GREATEST(COALESCE(_limite,30),1),100);
BEGIN
 v_op:=public._tele_assert_operador(_client_id,_nome,_senha);
 IF length(v_term)<3 THEN RETURN; END IF;
 v_digits:=regexp_replace(v_term,'\D','','g'); IF length(v_digits)>8 THEN v_digits:=right(v_digits,8); END IF;
 RETURN QUERY WITH allowed AS(
  SELECT co.campanha_id FROM public.telemarketing_campanha_operadores co
   WHERE co.client_id=_client_id AND co.operador_id=v_op AND co.ativo=true
 ), base AS(
  SELECT a.id,a.nome,a.telefone,a.cidade,a.bairro,a.ligacao_status,a.vota_candidato,a.candidato_alternativo,
   a.operador_nome,a.ligacao_em,'avulso'::text tipo,'contatos_avulsos'::text tabela,a.proxima_tentativa_em,
   COALESCE(a.tentativas_count,0) tentativas_count,a.observacao_tele,a.campanha_id,NULL::text indicador_nome,NULL::text indicador_tipo,a.lista_id
  FROM public.telemarketing_contatos_avulsos a WHERE a.client_id=_client_id AND a.ativo=true
  UNION ALL SELECT c.id,c.nome,c.telefone,c.cidade,c.bairro,c.ligacao_status,c.vota_candidato,c.candidato_alternativo,
   c.operador_nome,c.ligacao_em,CASE WHEN c.is_lider THEN 'lider' ELSE 'liderado' END,'contratados',c.proxima_tentativa_em,
   COALESCE(c.tentativas_count,0),c.observacao_tele,c.campanha_id,NULL,NULL,NULL::uuid FROM public.contratados c WHERE c.client_id=_client_id
  UNION ALL SELECT i.id,i.nome,i.telefone,i.cidade,i.bairro,i.ligacao_status,i.vota_candidato,i.candidato_alternativo,
   i.operador_nome,i.ligacao_em,'indicado','contratado_indicados',i.proxima_tentativa_em,COALESCE(i.tentativas_count,0),
   i.observacao_tele,i.campanha_id,NULL,NULL,NULL::uuid FROM public.contratado_indicados i WHERE i.client_id=_client_id
  UNION ALL SELECT i.id,i.nome,i.telefone,i.cidade,i.bairro,i.ultimo_status_ligacao,i.vota_candidato,i.candidato_alternativo,
   i.operador_nome,i.ultima_ligacao_em,'indicado_eleicao','eleicao_indicados',i.proxima_tentativa_em,COALESCE(i.total_tentativas,0),
   i.observacao_tele,i.campanha_id,p.nome,i.indicador_tipo::text,NULL::uuid FROM public.eleicao_indicados i
   LEFT JOIN public.eleicao_pessoas p ON p.id=i.indicador_id WHERE i.client_id=_client_id
  UNION ALL SELECT p.id,p.nome,p.telefone,p.cidade,p.bairro,p.ligacao_status,p.vota_candidato,p.candidato_alternativo,
   p.operador_nome,p.ligacao_em,p.tipo::text,'eleicao_pessoas',p.proxima_tentativa_em,COALESCE(p.tentativas_count,0),
   p.observacao_tele,p.campanha_id,NULL,NULL,NULL::uuid FROM public.eleicao_pessoas p WHERE p.client_id=_client_id AND p.telefone IS NOT NULL
 ), matched AS(
  SELECT b.* FROM base b WHERE b.campanha_id IN(SELECT a.campanha_id FROM allowed a)
   AND (_campanha_id IS NULL OR b.campanha_id=_campanha_id)
   AND (lower(COALESCE(b.nome,'')) LIKE '%'||lower(v_term)||'%'
    OR (length(v_digits)>=6 AND regexp_replace(COALESCE(b.telefone,''),'\D','','g') LIKE '%'||v_digits))
 )
 SELECT m.id,m.nome,m.telefone,m.cidade,m.bairro,m.ligacao_status,m.vota_candidato,m.candidato_alternativo,
  m.operador_nome,m.ligacao_em,m.tipo,m.tabela,m.proxima_tentativa_em,m.tentativas_count,m.observacao_tele,
  l.operador_nome,l.expires_at,m.campanha_id,m.indicador_nome,m.indicador_tipo,m.lista_id
 FROM matched m LEFT JOIN LATERAL(
  SELECT x.operador_nome,x.expires_at FROM public.telemarketing_call_assignments x
   WHERE x.client_id=_client_id AND x.expires_at>now()
    AND ((public.tele_phone_key(m.telefone) IS NOT NULL AND x.telefone_key=public.tele_phone_key(m.telefone))
     OR (public.tele_phone_key(m.telefone) IS NULL AND x.tabela=m.tabela AND x.contato_id=m.id))
   ORDER BY x.expires_at DESC LIMIT 1
 ) l ON true ORDER BY m.nome LIMIT v_lim;
END;$function$;

REVOKE ALL ON FUNCTION public.tele_buscar_retorno(uuid,text,text,text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_buscar_retorno(uuid,text,text,text,uuid,integer) TO anon,authenticated;
