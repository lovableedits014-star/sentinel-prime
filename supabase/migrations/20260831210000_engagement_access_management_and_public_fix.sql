-- Corrige o timeout do publico monitorado e transforma os cadastros feitos pelo
-- link da missao em uma fila gerencial auditavel.

CREATE OR REPLACE FUNCTION public.engagement_entidades_leves(p_client_id uuid)
RETURNS TABLE(
  ref_id uuid, origem text, cargo text, nome text, telefone text, supporter_id uuid,
  regiao text, cidade text, instagram_handle text, facebook_key text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH ent AS (
    SELECT f.id ref_id, 'funcionarios'::text origem, 'funcionario'::text cargo, 1 prio,
      f.nome, f.telefone, f.supporter_id, f.bairro regiao, f.cidade
    FROM funcionarios f WHERE f.client_id = p_client_id
    UNION ALL
    SELECT e.id, 'eleicao_pessoas', e.tipo::text,
      CASE e.tipo::text WHEN 'coordenador' THEN 2 WHEN 'lider' THEN 3 ELSE 4 END,
      e.nome, e.telefone, e.supporter_id, coalesce(nullif(e.regiao,''),nullif(e.bairro,'')), e.cidade
    FROM eleicao_pessoas e WHERE e.client_id = p_client_id AND e.arquivado_em IS NULL
    UNION ALL
    SELECT c.id, 'contratados', 'contratado', 5, c.nome, c.telefone, c.supporter_id, c.bairro, c.cidade
    FROM contratados c WHERE c.client_id = p_client_id
    UNION ALL
    SELECT p.id, 'pessoas', coalesce(p.tipo_pessoa::text,'apoiador'), 6,
      p.nome, p.telefone, p.supporter_id, p.bairro, p.cidade
    FROM pessoas p WHERE p.client_id = p_client_id
    UNION ALL
    SELECT s.id, 'supporter_accounts', 'portal', 7, s.name, s.phone, s.supporter_id, s.neighborhood, s.city
    FROM supporter_accounts s WHERE s.client_id = p_client_id
    UNION ALL
    SELECT mp.id, 'participant', coalesce(mp.cargo_snapshot,'cadastro pelo link'), 8,
      mp.nome, mp.phone_e164, NULL::uuid, mp.regiao_snapshot, NULL::text
    FROM mission_participants mp WHERE mp.client_id = p_client_id
  ), dedup AS (
    SELECT e.*, row_number() OVER (
      PARTITION BY coalesce(public.normalize_br_phone(e.telefone),'n:'||coalesce(public.normalize_person_name(e.nome),e.ref_id::text))
      ORDER BY e.prio,e.nome,e.ref_id
    ) rn FROM ent e
  ), profiles AS (
    SELECT sp.supporter_id,
      max(lower(regexp_replace(coalesce(sp.platform_user_id,''),'^@',''))) FILTER (WHERE sp.platform='instagram') ig,
      max(sp.platform_user_id) FILTER (WHERE sp.platform='facebook') fb
    FROM supporter_profiles sp GROUP BY sp.supporter_id
  )
  SELECT d.ref_id,d.origem,d.cargo,d.nome,d.telefone,d.supporter_id,d.regiao,d.cidade,p.ig,p.fb
  FROM dedup d LEFT JOIN profiles p ON p.supporter_id=d.supporter_id
  WHERE d.rn=1 AND public.is_client_member(p_client_id)
$$;

CREATE OR REPLACE FUNCTION public.engagement_publico_candidatos(
  p_client_id uuid, p_grupo_id uuid DEFAULT NULL, p_busca text DEFAULT NULL, p_limit integer DEFAULT 800
) RETURNS TABLE(origem text,ref_id uuid,nome text,cargo text,telefone text,regiao text,cidade text,
  instagram_handle text,facebook_key text,no_publico boolean,dispensado boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY
  WITH base AS (
    SELECT e.origem,e.ref_id,e.nome,e.cargo,e.telefone,e.regiao,e.cidade,e.instagram_handle,e.facebook_key,
      coalesce(ep.incluido,false) AND NOT coalesce(ep.dispensado,false) no_publico,
      coalesce(ep.dispensado,false) dispensado
    FROM public.engagement_entidades_leves(p_client_id) e
    LEFT JOIN engagement_publico ep ON ep.client_id=p_client_id AND ep.origem=e.origem AND ep.ref_id=e.ref_id
      AND ((p_grupo_id IS NULL AND ep.grupo_id IS NULL) OR ep.grupo_id=p_grupo_id)
    UNION ALL
    SELECT 'manual',ep.ref_id,ep.nome,coalesce(ep.cargo,'manual'),ep.telefone,ep.regiao,ep.cidade,
      max(lower(regexp_replace(sp.platform_user_id,'^@',''))) FILTER(WHERE sp.platform='instagram'),
      max(sp.platform_user_id) FILTER(WHERE sp.platform='facebook'),
      coalesce(ep.incluido,false) AND NOT coalesce(ep.dispensado,false),coalesce(ep.dispensado,false)
    FROM engagement_publico ep LEFT JOIN supporter_profiles sp ON sp.supporter_id=ep.supporter_id
    WHERE ep.client_id=p_client_id AND ep.origem='manual'
      AND ((p_grupo_id IS NULL AND ep.grupo_id IS NULL) OR ep.grupo_id=p_grupo_id)
    GROUP BY ep.ref_id,ep.nome,ep.cargo,ep.telefone,ep.regiao,ep.cidade,ep.incluido,ep.dispensado
  )
  SELECT b.* FROM base b
  WHERE nullif(btrim(p_busca),'') IS NULL
    OR public.normalize_person_name(b.nome) LIKE '%'||public.normalize_person_name(p_busca)||'%'
    OR public.only_digits(coalesce(b.telefone,'')) LIKE '%'||public.only_digits(p_busca)||'%'
  ORDER BY b.no_publico DESC,b.nome LIMIT greatest(coalesce(p_limit,800),1);
END $$;

CREATE OR REPLACE FUNCTION public.engagement_publico_alvo(
  p_client_id uuid,p_cargos text[] DEFAULT '{}',p_regioes text[] DEFAULT '{}',p_cidades text[] DEFAULT '{}',
  p_modo text DEFAULT 'automatico',p_grupo_id uuid DEFAULT NULL
) RETURNS TABLE(ref_id uuid,origem text,cargo text,nome text,telefone text,regiao text,cidade text,
  phone_norm text,instagram_handle text,facebook_key text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY
  WITH todos AS (
    SELECT e.ref_id,e.origem,e.cargo,e.nome,e.telefone,e.regiao,e.cidade,
      public.normalize_br_phone(e.telefone) phone_norm,e.instagram_handle,e.facebook_key
    FROM public.engagement_entidades_leves(p_client_id) e
  ), selecionados AS (
    SELECT t.* FROM todos t WHERE coalesce(p_modo,'automatico')='automatico'
      AND (cardinality(coalesce(p_cargos,'{}'))=0 OR t.cargo=ANY(p_cargos))
      AND (cardinality(coalesce(p_regioes,'{}'))=0 OR coalesce(t.regiao,'')=ANY(p_regioes))
      AND (cardinality(coalesce(p_cidades,'{}'))=0 OR coalesce(t.cidade,'')=ANY(p_cidades))
    UNION
    SELECT t.* FROM todos t JOIN engagement_publico ep ON ep.client_id=p_client_id
      AND ep.origem=t.origem AND ep.ref_id=t.ref_id AND ep.incluido AND NOT ep.dispensado
      AND ((p_grupo_id IS NULL AND ep.grupo_id IS NULL) OR ep.grupo_id=p_grupo_id)
    UNION
    SELECT ep.ref_id,'manual',coalesce(ep.cargo,'manual'),ep.nome,ep.telefone,ep.regiao,ep.cidade,
      public.normalize_br_phone(ep.telefone),
      max(lower(regexp_replace(sp.platform_user_id,'^@',''))) FILTER(WHERE sp.platform='instagram'),
      max(sp.platform_user_id) FILTER(WHERE sp.platform='facebook')
    FROM engagement_publico ep LEFT JOIN supporter_profiles sp ON sp.supporter_id=ep.supporter_id
    WHERE ep.client_id=p_client_id AND ep.origem='manual' AND ep.incluido AND NOT ep.dispensado
      AND ((p_grupo_id IS NULL AND ep.grupo_id IS NULL) OR ep.grupo_id=p_grupo_id)
    GROUP BY ep.ref_id,ep.cargo,ep.nome,ep.telefone,ep.regiao,ep.cidade
  )
  SELECT s.* FROM selecionados s WHERE NOT EXISTS (
    SELECT 1 FROM engagement_publico d WHERE d.client_id=p_client_id AND d.origem=s.origem
      AND d.ref_id=s.ref_id AND d.dispensado
      AND ((p_grupo_id IS NULL AND d.grupo_id IS NULL) OR d.grupo_id=p_grupo_id));
END $$;

CREATE OR REPLACE FUNCTION public.engagement_publico_definir(
  p_client_id uuid,p_origem text,p_ref_id uuid,p_incluido boolean,p_grupo_id uuid DEFAULT NULL,
  p_dispensado boolean DEFAULT false,p_observacao text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v record;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  IF p_origem='manual' THEN
    UPDATE engagement_publico SET incluido=p_incluido,dispensado=p_dispensado,
      observacao=coalesce(p_observacao,observacao),updated_at=now()
    WHERE client_id=p_client_id AND origem='manual' AND ref_id=p_ref_id;
    RETURN;
  END IF;
  SELECT e.nome,e.cargo,e.telefone,e.regiao,e.cidade INTO v
  FROM engagement_entidades_leves(p_client_id) e WHERE e.origem=p_origem AND e.ref_id=p_ref_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pessoa nao encontrada neste cliente'; END IF;
  IF NOT p_incluido AND NOT p_dispensado THEN
    DELETE FROM engagement_publico WHERE client_id=p_client_id AND origem=p_origem AND ref_id=p_ref_id
      AND ((p_grupo_id IS NULL AND grupo_id IS NULL) OR grupo_id=p_grupo_id);
    RETURN;
  END IF;
  UPDATE engagement_publico SET incluido=p_incluido,dispensado=p_dispensado,
    observacao=coalesce(p_observacao,observacao),nome=v.nome,cargo=v.cargo,telefone=v.telefone,
    regiao=v.regiao,cidade=v.cidade,updated_at=now()
  WHERE client_id=p_client_id AND origem=p_origem AND ref_id=p_ref_id
    AND ((p_grupo_id IS NULL AND grupo_id IS NULL) OR grupo_id=p_grupo_id);
  IF NOT FOUND THEN
    INSERT INTO engagement_publico(client_id,grupo_id,origem,ref_id,nome,cargo,telefone,regiao,cidade,incluido,dispensado,observacao)
    VALUES(p_client_id,p_grupo_id,p_origem,p_ref_id,v.nome,v.cargo,v.telefone,v.regiao,v.cidade,p_incluido,p_dispensado,p_observacao);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.engagement_publico_set_telefone(p_client_id uuid,p_origem text,p_ref_id uuid,p_telefone text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_tel text;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  v_tel:=nullif(regexp_replace(coalesce(p_telefone,''),'\D','','g'),'');
  IF v_tel IS NULL THEN RAISE EXCEPTION 'Telefone invalido'; END IF;
  CASE p_origem
    WHEN 'eleicao_pessoas' THEN UPDATE eleicao_pessoas SET telefone=v_tel WHERE id=p_ref_id AND client_id=p_client_id;
    WHEN 'contratados' THEN UPDATE contratados SET telefone=v_tel WHERE id=p_ref_id AND client_id=p_client_id;
    WHEN 'funcionarios' THEN UPDATE funcionarios SET telefone=v_tel WHERE id=p_ref_id AND client_id=p_client_id;
    WHEN 'pessoas' THEN UPDATE pessoas SET telefone=v_tel WHERE id=p_ref_id AND client_id=p_client_id;
    WHEN 'supporter_accounts' THEN UPDATE supporter_accounts SET phone=v_tel WHERE id=p_ref_id AND client_id=p_client_id;
    WHEN 'participant' THEN UPDATE mission_participants SET phone_e164=v_tel,updated_at=now() WHERE id=p_ref_id AND client_id=p_client_id;
    WHEN 'manual' THEN NULL;
    ELSE RAISE EXCEPTION 'Origem nao suportada: %',p_origem;
  END CASE;
  UPDATE engagement_publico SET telefone=v_tel,updated_at=now()
  WHERE client_id=p_client_id AND origem=p_origem AND ref_id=p_ref_id;
END $$;

CREATE OR REPLACE FUNCTION public.engagement_publico_pendencias(
  p_client_id uuid,p_grupo_id uuid DEFAULT NULL,p_regra_id uuid DEFAULT NULL
) RETURNS TABLE(origem text,ref_id uuid,nome text,cargo text,telefone text,regiao text,cidade text,
  instagram_handle text,facebook_key text,sem_instagram boolean,sem_facebook boolean,sem_telefone boolean,
  sem_prova boolean,pronta_para_cobranca boolean,motivo_bloqueio text,ultimo_comentario timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_cargos text[] := '{}'; v_regioes text[] := '{}'; v_cidades text[] := '{}';
  v_modo text := CASE WHEN p_grupo_id IS NULL THEN 'automatico' ELSE 'manual' END; v_grupo uuid := p_grupo_id;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  IF p_regra_id IS NOT NULL THEN
    SELECT coalesce(r.cargos,'{}'),coalesce(r.regioes,'{}'),coalesce(r.cidades,'{}'),
      coalesce(r.modo_publico,v_modo),coalesce(r.grupo_id,p_grupo_id)
    INTO v_cargos,v_regioes,v_cidades,v_modo,v_grupo
    FROM engagement_regras r WHERE r.id=p_regra_id AND r.client_id=p_client_id;
  END IF;
  RETURN QUERY
  WITH alvo AS (SELECT * FROM engagement_publico_alvo(p_client_id,v_cargos,v_regioes,v_cidades,v_modo,v_grupo)),
  ult AS (
    SELECT lower(c.platform_user_id) chave,max(c.created_at) em FROM comments c
    WHERE c.client_id=p_client_id AND NOT c.is_page_owner GROUP BY lower(c.platform_user_id)
  ), calc AS (
    SELECT a.*,coalesce(a.instagram_handle,'')='' si,coalesce(a.facebook_key,'')='' sf,
      coalesce(a.phone_norm,'')='' st,greatest(ui.em,uf.em) uc
    FROM alvo a LEFT JOIN ult ui ON ui.chave=lower(a.instagram_handle)
      LEFT JOIN ult uf ON uf.chave=lower(a.facebook_key)
  )
  SELECT c.origem,c.ref_id,c.nome,c.cargo,c.telefone,c.regiao,c.cidade,c.instagram_handle,c.facebook_key,
    c.si,c.sf,c.st,c.si AND c.sf AND c.st,NOT(c.si AND c.sf AND c.st),
    CASE WHEN c.si AND c.sf AND c.st THEN 'Sem rede social e sem telefone: nao ha como comprovar'
      WHEN c.si AND c.sf THEN 'Sem rede social: somente acessos pelo link podem ser comprovados'
      WHEN c.st THEN 'Sem telefone: nao e possivel identificar o acesso pelo link' END,c.uc
  FROM calc c ORDER BY c.nome;
END $$;

-- Todo check-in concluido passa a confirmar a obrigacao correspondente.
CREATE OR REPLACE FUNCTION public.engagement_sync_checkin_obligation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_phone text;
BEGIN
  IF NEW.concluido_em IS NULL THEN RETURN NEW; END IF;
  SELECT public.normalize_br_phone(mp.phone_e164) INTO v_phone FROM mission_participants mp WHERE mp.id=NEW.participant_id;
  UPDATE engagement_obrigacoes o SET status='cumprida',cumprida_em=coalesce(o.cumprida_em,NEW.concluido_em),
    evidencia_nivel=coalesce(o.evidencia_nivel,'E2'),pontos=o.pontos_possiveis,updated_at=now()
  WHERE o.client_id=NEW.client_id AND o.mission_id=NEW.mission_id AND o.status<>'dispensada' AND (
    (NEW.pessoa_id IS NOT NULL AND o.ref_id=NEW.pessoa_id AND o.origem IN ('eleicao','eleicao_pessoas')) OR
    (NEW.funcionario_id IS NOT NULL AND o.ref_id=NEW.funcionario_id AND o.origem IN ('funcionario','funcionarios')) OR
    (NEW.contratado_id IS NOT NULL AND o.ref_id=NEW.contratado_id AND o.origem IN ('contratado','contratados')) OR
    (o.origem='participant' AND o.ref_id=NEW.participant_id) OR
    (v_phone IS NOT NULL AND public.normalize_br_phone(o.telefone)=v_phone));
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_engagement_sync_checkin_obligation ON mission_checkins;
CREATE TRIGGER trg_engagement_sync_checkin_obligation AFTER INSERT OR UPDATE OF concluido_em
ON mission_checkins FOR EACH ROW EXECUTE FUNCTION engagement_sync_checkin_obligation();

-- Repara conclusoes historicas que ficaram isoladas das obrigacoes.
UPDATE engagement_obrigacoes o SET status='cumprida',cumprida_em=coalesce(o.cumprida_em,c.concluido_em),
  evidencia_nivel=coalesce(o.evidencia_nivel,'E2'),pontos=o.pontos_possiveis,updated_at=now()
FROM mission_checkins c JOIN mission_participants mp ON mp.id=c.participant_id
WHERE c.concluido_em IS NOT NULL AND o.client_id=c.client_id AND o.mission_id=c.mission_id
  AND o.status<>'dispensada' AND (
    (c.pessoa_id IS NOT NULL AND o.ref_id=c.pessoa_id AND o.origem IN ('eleicao','eleicao_pessoas')) OR
    (c.funcionario_id IS NOT NULL AND o.ref_id=c.funcionario_id AND o.origem IN ('funcionario','funcionarios')) OR
    (c.contratado_id IS NOT NULL AND o.ref_id=c.contratado_id AND o.origem IN ('contratado','contratados')) OR
    (o.origem='participant' AND o.ref_id=c.participant_id) OR
    public.normalize_br_phone(o.telefone)=public.normalize_br_phone(mp.phone_e164));

CREATE OR REPLACE FUNCTION public.engagement_access_summary(p_client_id uuid)
RETURNS TABLE(cadastrados bigint,vinculados bigint,nao_vinculados bigint,acessaram bigint,
  conclusoes bigint,pessoas_concluiram bigint,aguardando_conclusao bigint,sem_acesso bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY WITH s AS (
    SELECT mp.id,(mp.pessoa_id IS NOT NULL OR mp.funcionario_id IS NOT NULL OR mp.contratado_id IS NOT NULL OR mp.crm_pessoa_id IS NOT NULL) vinc,
      count(c.id) acessos,count(c.id) FILTER(WHERE c.concluido_em IS NOT NULL) feitos
    FROM mission_participants mp LEFT JOIN mission_checkins c ON c.participant_id=mp.id
    WHERE mp.client_id=p_client_id GROUP BY mp.id
  ) SELECT count(*),count(*) FILTER(WHERE vinc),count(*) FILTER(WHERE NOT vinc),count(*) FILTER(WHERE acessos>0),
    coalesce(sum(feitos),0)::bigint,count(*) FILTER(WHERE feitos>0),count(*) FILTER(WHERE acessos>feitos),count(*) FILTER(WHERE acessos=0) FROM s;
END $$;

-- Vinculo conservador: somente quando o telefone identifica uma unica pessoa
-- da estrutura eleitoral. Casos ambiguos permanecem sinalizados para revisao.
WITH candidatos AS (
  SELECT mp.id participant_id,(array_agg(ep.id ORDER BY ep.id))[1] pessoa_id,count(*) quantidade
  FROM mission_participants mp JOIN eleicao_pessoas ep ON ep.client_id=mp.client_id
    AND public.normalize_br_phone(ep.telefone)=public.normalize_br_phone(mp.phone_e164)
  WHERE mp.pessoa_id IS NULL AND ep.arquivado_em IS NULL
  GROUP BY mp.id
)
UPDATE mission_participants mp SET pessoa_id=c.pessoa_id,match_source='phone_unique',matched_at=coalesce(mp.matched_at,now()),updated_at=now()
FROM candidatos c WHERE c.participant_id=mp.id AND c.quantidade=1;

CREATE OR REPLACE FUNCTION public.engagement_access_people(p_client_id uuid,p_limit integer DEFAULT 3000)
RETURNS TABLE(participant_id uuid,nome text,telefone text,cargo text,regiao text,coordenador_id uuid,
  coordenador_nome text,coordenador_telefone text,missoes_acessadas bigint,missoes_concluidas bigint,
  pendentes bigint,ultimo_acesso timestamptz,vinculado boolean)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  RETURN QUERY WITH RECURSIVE ancestry AS (
    SELECT e.id pessoa_id,e.id ancestor_id,e.parent_id,e.nome,e.telefone,0 depth
    FROM eleicao_pessoas e WHERE e.client_id=p_client_id
    UNION ALL
    SELECT a.pessoa_id,p.id,p.parent_id,p.nome,p.telefone,a.depth+1
    FROM ancestry a JOIN eleicao_pessoas p ON p.id=a.parent_id AND p.client_id=p_client_id
    WHERE a.depth<20
  ), raiz AS (
    SELECT DISTINCT ON (a.pessoa_id) a.pessoa_id,a.ancestor_id,a.nome,a.telefone
    FROM ancestry a ORDER BY a.pessoa_id,a.depth DESC
  )
  SELECT mp.id,mp.nome,mp.phone_e164,coalesce(ep.tipo::text,mp.cargo_snapshot,'cadastro pelo link'),
    coalesce(nullif(ep.regiao,''),ep.bairro,mp.regiao_snapshot),r.ancestor_id,r.nome,r.telefone,
    count(DISTINCT c.mission_id),count(DISTINCT c.mission_id) FILTER(WHERE c.concluido_em IS NOT NULL),
    count(DISTINCT c.mission_id) FILTER(WHERE c.concluido_em IS NULL),max(c.ultimo_acesso_em),
    (mp.pessoa_id IS NOT NULL OR mp.funcionario_id IS NOT NULL OR mp.contratado_id IS NOT NULL OR mp.crm_pessoa_id IS NOT NULL)
  FROM mission_participants mp LEFT JOIN eleicao_pessoas ep ON ep.id=mp.pessoa_id AND ep.client_id=p_client_id
    LEFT JOIN raiz r ON r.pessoa_id=ep.id
    LEFT JOIN mission_checkins c ON c.participant_id=mp.id
  WHERE mp.client_id=p_client_id GROUP BY mp.id,ep.tipo,ep.regiao,ep.bairro,r.ancestor_id,r.nome,r.telefone
  ORDER BY count(DISTINCT c.mission_id) FILTER(WHERE c.concluido_em IS NULL) DESC,max(c.ultimo_acesso_em) DESC NULLS LAST,mp.nome
  LIMIT greatest(coalesce(p_limit,3000),1);
END $$;

CREATE OR REPLACE FUNCTION public.engagement_registrar_cobranca(
  p_client_id uuid,p_origem text,p_ref_id uuid,p_canal text DEFAULT 'whatsapp',
  p_texto text DEFAULT NULL,p_resultado text DEFAULT 'registrada'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid; v_nome text; v_ind numeric; v_dias integer;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  SELECT i.nome,i.indice,i.periodo_dias INTO v_nome,v_ind,v_dias FROM engagement_indices_diarios i
  WHERE i.client_id=p_client_id AND i.origem=p_origem AND i.ref_id=p_ref_id ORDER BY i.dia DESC LIMIT 1;
  IF v_nome IS NULL THEN SELECT o.nome INTO v_nome FROM engagement_obrigacoes o
    WHERE o.client_id=p_client_id AND o.origem=p_origem AND o.ref_id=p_ref_id LIMIT 1; END IF;
  IF v_nome IS NULL AND p_origem='participant' THEN SELECT mp.nome INTO v_nome FROM mission_participants mp
    WHERE mp.client_id=p_client_id AND mp.id=p_ref_id; END IF;
  INSERT INTO engagement_cobrancas(client_id,origem,ref_id,nome,indice_no_momento,periodo_dias,canal,texto,resultado,registrado_por)
  VALUES(p_client_id,p_origem,p_ref_id,coalesce(v_nome,'—'),v_ind,coalesce(v_dias,30),coalesce(p_canal,'whatsapp'),p_texto,coalesce(p_resultado,'registrada'),auth.uid())
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION engagement_entidades_leves(uuid) FROM anon;
REVOKE ALL ON FUNCTION engagement_access_summary(uuid) FROM anon;
REVOKE ALL ON FUNCTION engagement_access_people(uuid,integer) FROM anon;
GRANT EXECUTE ON FUNCTION engagement_entidades_leves(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION engagement_access_summary(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION engagement_access_people(uuid,integer) TO authenticated,service_role;

CREATE INDEX IF NOT EXISTS idx_mission_checkins_client_participant ON mission_checkins(client_id,participant_id,mission_id);
CREATE INDEX IF NOT EXISTS idx_engagement_obrigacoes_client_phone ON engagement_obrigacoes(client_id,phone_norm);
