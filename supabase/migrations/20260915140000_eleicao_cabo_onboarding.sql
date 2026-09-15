-- Jornada publica dos cabos: contatos oficiais, escolha unica de grupo e moldura.

ALTER TABLE public.eleicao_notif_config
  ADD COLUMN IF NOT EXISTS escritorio_nome text NOT NULL DEFAULT 'Escritorio da campanha',
  ADD COLUMN IF NOT EXISTS escritorio_telefone text,
  ADD COLUMN IF NOT EXISTS candidato_nome text NOT NULL DEFAULT 'Candidato',
  ADD COLUMN IF NOT EXISTS candidato_telefone text,
  ADD COLUMN IF NOT EXISTS onboarding_mensagem text NOT NULL DEFAULT 'Ola, acabo de me cadastrar como cabo eleitoral.';

CREATE TABLE IF NOT EXISTS public.eleicao_cabo_onboarding_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.eleicao_pessoas(id) ON DELETE CASCADE,
  token uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  grupo_chave text,
  grupo_nome text,
  grupo_escolhido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id,pessoa_id)
);

CREATE INDEX IF NOT EXISTS idx_cabo_onboarding_token
  ON public.eleicao_cabo_onboarding_tokens(token);

ALTER TABLE public.eleicao_cabo_onboarding_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Equipe administra onboarding de cabos" ON public.eleicao_cabo_onboarding_tokens;
CREATE POLICY "Equipe administra onboarding de cabos"
  ON public.eleicao_cabo_onboarding_tokens FOR ALL TO authenticated
  USING (public.is_client_member(client_id))
  WITH CHECK (public.is_client_member(client_id));

CREATE OR REPLACE FUNCTION public.eleicao_cabo_onboarding_create(
  p_client_id uuid,p_pessoa_id uuid
) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v_token uuid;
BEGIN
  IF NOT public.is_client_member(p_client_id) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM eleicao_pessoas p
    WHERE p.id=p_pessoa_id AND p.client_id=p_client_id AND p.tipo='cabo' AND p.arquivado_em IS NULL
  ) THEN RAISE EXCEPTION 'Cabo eleitoral nao encontrado'; END IF;

  INSERT INTO eleicao_cabo_onboarding_tokens(client_id,pessoa_id)
  VALUES(p_client_id,p_pessoa_id)
  ON CONFLICT(client_id,pessoa_id) DO UPDATE SET updated_at=now()
  RETURNING token INTO v_token;
  RETURN v_token::text;
END;$function$;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_onboarding_info(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $function$
DECLARE v record; v_groups jsonb;
BEGIN
  SELECT t.client_id,t.pessoa_id,t.grupo_chave,t.grupo_nome,t.grupo_escolhido_em,
    p.nome pessoa_nome,c.name campanha_nome,c.logo_url,
    cfg.escritorio_nome,cfg.escritorio_telefone,cfg.candidato_nome,cfg.candidato_telefone,
    cfg.onboarding_mensagem,cfg.grupos_links
  INTO v
  FROM eleicao_cabo_onboarding_tokens t
  JOIN eleicao_pessoas p ON p.id=t.pessoa_id AND p.client_id=t.client_id
  JOIN clients c ON c.id=t.client_id
  LEFT JOIN eleicao_notif_config cfg ON cfg.client_id=t.client_id
  WHERE t.token::text=p_token AND p.arquivado_em IS NULL;

  IF v.client_id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Link invalido ou expirado'); END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('chave',x.key,'nome',coalesce(r.label,
    CASE WHEN x.key='__interior__' THEN 'Interior' ELSE initcap(replace(x.key,'_',' ')) END),
    'link',x.value) ORDER BY coalesce(r.label,x.key)),'[]'::jsonb)
  INTO v_groups
  FROM jsonb_each_text(coalesce(v.grupos_links,'{}'::jsonb)) x
  LEFT JOIN eleicao_regioes r ON r.client_id=v.client_id AND r.value=x.key
  WHERE btrim(x.value)<>'';

  RETURN jsonb_build_object(
    'ok',true,'client_id',v.client_id,'pessoa_nome',v.pessoa_nome,
    'campanha_nome',v.campanha_nome,'logo_url',v.logo_url,
    'escritorio_nome',coalesce(v.escritorio_nome,'Escritorio da campanha'),
    'escritorio_telefone',v.escritorio_telefone,
    'candidato_nome',coalesce(v.candidato_nome,v.campanha_nome,'Candidato'),
    'candidato_telefone',v.candidato_telefone,
    'mensagem',coalesce(v.onboarding_mensagem,'Ola, acabo de me cadastrar como cabo eleitoral.'),
    'grupos',v_groups,'grupo_chave',v.grupo_chave,'grupo_nome',v.grupo_nome,
    'grupo_link',CASE WHEN v.grupo_chave IS NULL THEN NULL ELSE v.grupos_links->>v.grupo_chave END,
    'grupo_escolhido_em',v.grupo_escolhido_em
  );
END;$function$;

CREATE OR REPLACE FUNCTION public.eleicao_cabo_onboarding_choose_group(
  p_token text,p_grupo_chave text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE v record; v_link text; v_nome text;
BEGIN
  SELECT t.id,t.client_id,t.grupo_chave,t.grupo_nome,cfg.grupos_links
  INTO v
  FROM eleicao_cabo_onboarding_tokens t
  LEFT JOIN eleicao_notif_config cfg ON cfg.client_id=t.client_id
  WHERE t.token::text=p_token FOR UPDATE OF t;

  IF v.id IS NULL THEN RETURN jsonb_build_object('ok',false,'error','Link invalido ou expirado'); END IF;
  IF v.grupo_chave IS NOT NULL THEN
    RETURN jsonb_build_object('ok',true,'locked',true,'grupo_chave',v.grupo_chave,'grupo_nome',v.grupo_nome);
  END IF;

  v_link:=v.grupos_links->>p_grupo_chave;
  IF coalesce(btrim(v_link),'')='' THEN RETURN jsonb_build_object('ok',false,'error','Grupo indisponivel'); END IF;

  SELECT coalesce(r.label,CASE WHEN p_grupo_chave='__interior__' THEN 'Interior'
    ELSE initcap(replace(p_grupo_chave,'_',' ')) END)
  INTO v_nome FROM eleicao_regioes r
  WHERE r.client_id=v.client_id AND r.value=p_grupo_chave;
  v_nome:=coalesce(v_nome,CASE WHEN p_grupo_chave='__interior__' THEN 'Interior'
    ELSE initcap(replace(p_grupo_chave,'_',' ')) END);

  UPDATE eleicao_cabo_onboarding_tokens SET grupo_chave=p_grupo_chave,grupo_nome=v_nome,
    grupo_escolhido_em=now(),updated_at=now() WHERE id=v.id;
  RETURN jsonb_build_object('ok',true,'locked',true,'grupo_chave',p_grupo_chave,'grupo_nome',v_nome,'link',v_link);
END;$function$;

REVOKE ALL ON FUNCTION public.eleicao_cabo_onboarding_create(uuid,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_onboarding_create(uuid,uuid) TO authenticated,service_role;
REVOKE ALL ON FUNCTION public.eleicao_cabo_onboarding_info(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.eleicao_cabo_onboarding_choose_group(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_onboarding_info(text) TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.eleicao_cabo_onboarding_choose_group(text,text) TO anon,authenticated,service_role;

NOTIFY pgrst,'reload schema';
