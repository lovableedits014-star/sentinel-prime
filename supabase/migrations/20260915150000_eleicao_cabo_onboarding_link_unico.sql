-- Converte a jornada em um link unico e anonimo por campanha.

ALTER TABLE public.eleicao_notif_config
  ADD COLUMN IF NOT EXISTS onboarding_public_token uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS idx_eleicao_notif_onboarding_public_token
  ON public.eleicao_notif_config(onboarding_public_token);

CREATE TABLE IF NOT EXISTS public.eleicao_cabo_onboarding_choices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  visitor_key uuid NOT NULL,
  grupo_chave text NOT NULL,
  grupo_nome text NOT NULL,
  grupo_escolhido_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id,visitor_key)
);

ALTER TABLE public.eleicao_cabo_onboarding_choices ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_onboarding_public_link(p_client_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_token uuid;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  SELECT onboarding_public_token INTO v_token FROM eleicao_notif_config WHERE client_id=p_client_id;
  IF v_token IS NULL THEN
    INSERT INTO eleicao_notif_config(client_id) VALUES(p_client_id)
    ON CONFLICT(client_id) DO UPDATE SET client_id=excluded.client_id
    RETURNING onboarding_public_token INTO v_token;
  END IF;
  RETURN v_token::text;
END;$function$;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_onboarding_info(p_token text,p_visitor_key uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE v record; v_choice record; v_groups jsonb;
BEGIN
  SELECT cfg.client_id,c.name campanha_nome,c.logo_url,cfg.escritorio_nome,cfg.escritorio_telefone,
    cfg.candidato_nome,cfg.candidato_telefone,cfg.onboarding_mensagem,cfg.grupos_links
  INTO v FROM eleicao_notif_config cfg JOIN clients c ON c.id=cfg.client_id
  WHERE cfg.onboarding_public_token::text=p_token;
  IF v.client_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Link invalido ou expirado'); END IF;

  IF p_visitor_key IS NOT NULL THEN
    SELECT ch.grupo_chave,ch.grupo_nome,ch.grupo_escolhido_em INTO v_choice
    FROM eleicao_cabo_onboarding_choices ch
    WHERE ch.client_id=v.client_id AND ch.visitor_key=p_visitor_key;
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('chave',x.key,'nome',coalesce(r.label,
    CASE WHEN x.key='__interior__' THEN 'Interior' ELSE initcap(replace(x.key,'_',' ')) END),
    'link',x.value) ORDER BY coalesce(r.label,x.key)),'[]'::jsonb)
  INTO v_groups FROM jsonb_each_text(coalesce(v.grupos_links,'{}'::jsonb)) x
  LEFT JOIN eleicao_regioes r ON r.client_id=v.client_id AND r.value=x.key
  WHERE btrim(x.value)<>'';

  RETURN jsonb_build_object('ok',true,'client_id',v.client_id,'campanha_nome',v.campanha_nome,
    'logo_url',v.logo_url,'escritorio_nome',coalesce(v.escritorio_nome,'Escritorio da campanha'),
    'escritorio_telefone',v.escritorio_telefone,'candidato_nome',coalesce(v.candidato_nome,v.campanha_nome,'Candidato'),
    'candidato_telefone',v.candidato_telefone,'mensagem',coalesce(v.onboarding_mensagem,'Ola, acabo de me cadastrar como cabo eleitoral.'),
    'grupos',v_groups,'grupo_chave',v_choice.grupo_chave,'grupo_nome',v_choice.grupo_nome,
    'grupo_link',CASE WHEN v_choice.grupo_chave IS NULL THEN NULL ELSE v.grupos_links->>v_choice.grupo_chave END,
    'grupo_escolhido_em',v_choice.grupo_escolhido_em);
END;$function$;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_onboarding_choose_group(
  p_token text,p_visitor_key uuid,p_grupo_chave text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v record; v_existing record; v_link text; v_nome text;
BEGIN
  SELECT cfg.client_id,cfg.grupos_links INTO v FROM eleicao_notif_config cfg
  WHERE cfg.onboarding_public_token::text=p_token;
  IF v.client_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Link invalido ou expirado'); END IF;

  SELECT grupo_chave,grupo_nome INTO v_existing FROM eleicao_cabo_onboarding_choices
  WHERE client_id=v.client_id AND visitor_key=p_visitor_key;
  IF v_existing.grupo_chave IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'locked',true,'grupo_chave',v_existing.grupo_chave,
      'grupo_nome',v_existing.grupo_nome,'link',v.grupos_links->>v_existing.grupo_chave);
  END IF;

  v_link:=v.grupos_links->>p_grupo_chave;
  IF coalesce(btrim(v_link),'')='' THEN RETURN jsonb_build_object('ok',false,'error','Grupo indisponivel'); END IF;
  SELECT r.label INTO v_nome FROM eleicao_regioes r WHERE r.client_id=v.client_id AND r.value=p_grupo_chave;
  v_nome:=coalesce(v_nome,CASE WHEN p_grupo_chave='__interior__' THEN 'Interior' ELSE initcap(replace(p_grupo_chave,'_',' ')) END);

  INSERT INTO eleicao_cabo_onboarding_choices(client_id,visitor_key,grupo_chave,grupo_nome)
  VALUES(v.client_id,p_visitor_key,p_grupo_chave,v_nome)
  ON CONFLICT(client_id,visitor_key) DO NOTHING;
  SELECT grupo_chave,grupo_nome INTO v_existing FROM eleicao_cabo_onboarding_choices
  WHERE client_id=v.client_id AND visitor_key=p_visitor_key;
  RETURN jsonb_build_object('ok',true,'locked',true,'grupo_chave',v_existing.grupo_chave,
    'grupo_nome',v_existing.grupo_nome,'link',v.grupos_links->>v_existing.grupo_chave);
END;$function$;

DROP FUNCTION IF EXISTS public.eleicao_cabo_onboarding_choose_group(text,text);
REVOKE ALL ON FUNCTION public.eleicao_cabo_onboarding_public_link(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_onboarding_public_link(uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.eleicao_cabo_onboarding_info(text,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eleicao_cabo_onboarding_choose_group(text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_onboarding_info(text,uuid) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_onboarding_choose_group(text,uuid,text) TO anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
