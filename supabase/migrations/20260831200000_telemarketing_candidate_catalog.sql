-- Catálogo canônico de candidatos e aliases por cliente/cargo.
CREATE TABLE IF NOT EXISTS public.telemarketing_candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cargo text NOT NULL CHECK (cargo IN ('estadual','federal','senador','governador')),
  nome_oficial text NOT NULL,
  nome_chave text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id,cargo,nome_chave)
);

CREATE TABLE IF NOT EXISTS public.telemarketing_candidato_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cargo text NOT NULL CHECK (cargo IN ('estadual','federal','senador','governador')),
  candidato_id uuid NOT NULL REFERENCES public.telemarketing_candidatos(id) ON DELETE CASCADE,
  alias text NOT NULL,
  alias_chave text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id,cargo,alias_chave)
);

ALTER TABLE public.telemarketing_candidatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemarketing_candidato_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY tele_candidatos_select ON public.telemarketing_candidatos FOR SELECT TO authenticated
  USING (public.user_can_access_client(client_id));
CREATE POLICY tele_candidato_aliases_select ON public.telemarketing_candidato_aliases FOR SELECT TO authenticated
  USING (public.user_can_access_client(client_id));

CREATE OR REPLACE FUNCTION public.tele_candidato_chave(_txt text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $function$
  SELECT NULLIF(regexp_replace(
    translate(lower(btrim(COALESCE(_txt,''))),
      'áàâãäéèêëíìîïóòôõöúùûüçñ','aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+','','g'),'');
$function$;

CREATE OR REPLACE FUNCTION public.tele_resolver_candidato(
  _client_id uuid,_cargo text,_nome text,_criar boolean DEFAULT true
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_nome text; v_chave text; v_id uuid; v_oficial text;
BEGIN
  IF _cargo NOT IN ('estadual','federal','senador','governador') THEN RAISE EXCEPTION 'Cargo inválido'; END IF;
  v_nome:=public.tele_norm_candidato(_nome);
  IF v_nome IS NULL THEN RETURN NULL; END IF;
  v_chave:=public.tele_candidato_chave(v_nome);
  -- Respostas de pesquisa não são pessoas e não devem poluir o catálogo.
  IF v_chave IN ('nenhum','ninguem','naosabe','naoquisresponder','naoquisopinar','indeciso','indecisa','estudandopropostas') THEN
    RETURN v_nome;
  END IF;

  SELECT c.id,c.nome_oficial INTO v_id,v_oficial
  FROM public.telemarketing_candidato_aliases a JOIN public.telemarketing_candidatos c ON c.id=a.candidato_id
  WHERE a.client_id=_client_id AND a.cargo=_cargo AND a.alias_chave=v_chave AND c.ativo=true LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_oficial; END IF;

  SELECT id,nome_oficial INTO v_id,v_oficial FROM public.telemarketing_candidatos
  WHERE client_id=_client_id AND cargo=_cargo AND nome_chave=v_chave AND ativo=true LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_oficial; END IF;
  IF NOT _criar THEN RETURN v_nome; END IF;

  INSERT INTO public.telemarketing_candidatos(client_id,cargo,nome_oficial,nome_chave)
  VALUES(_client_id,_cargo,v_nome,v_chave)
  ON CONFLICT(client_id,cargo,nome_chave) DO UPDATE SET updated_at=now()
  RETURNING id,nome_oficial INTO v_id,v_oficial;
  INSERT INTO public.telemarketing_candidato_aliases(client_id,cargo,candidato_id,alias,alias_chave)
  VALUES(_client_id,_cargo,v_id,v_nome,v_chave) ON CONFLICT(client_id,cargo,alias_chave) DO NOTHING;
  RETURN v_oficial;
END;
$function$;

-- Reaproveita a RPC já existente, agora consultando catálogo + aliases.
CREATE OR REPLACE FUNCTION public.tele_sugestoes_candidatos(
  _client_id uuid,_nome text,_senha text,_cargo text,_termo text DEFAULT NULL,_limite integer DEFAULT 8
) RETURNS TABLE(candidato text,mencoes bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_key text:=public.tele_candidato_chave(_termo); v_lim integer:=LEAST(GREATEST(COALESCE(_limite,8),1),30);
BEGIN
  PERFORM public._tele_assert_operador(_client_id,_nome,_senha);
  RETURN QUERY
  WITH mentions AS (
    SELECT CASE _cargo WHEN 'estadual' THEN l.candidato_alternativo WHEN 'federal' THEN l.candidato_federal
      WHEN 'senador' THEN l.candidato_senador ELSE l.candidato_governador END nome
    FROM public.telemarketing_call_log l WHERE l.client_id=_client_id
  )
  SELECT c.nome_oficial,(SELECT count(*) FROM mentions m
    WHERE public.tele_candidato_chave(m.nome)=c.nome_chave OR public.tele_candidato_chave(m.nome) IN
      (SELECT ax.alias_chave FROM public.telemarketing_candidato_aliases ax WHERE ax.candidato_id=c.id))::bigint
  FROM public.telemarketing_candidatos c
  WHERE c.client_id=_client_id AND c.cargo=_cargo AND c.ativo=true
    AND (v_key IS NULL OR c.nome_chave LIKE '%'||v_key||'%' OR EXISTS(
      SELECT 1 FROM public.telemarketing_candidato_aliases ax WHERE ax.candidato_id=c.id AND ax.alias_chave LIKE '%'||v_key||'%'))
  ORDER BY 2 DESC,c.nome_oficial LIMIT v_lim;
END;
$function$;

-- Transforma a implementação atual em núcleo e passa toda gravação pelo resolvedor.
ALTER FUNCTION public.tele_registrar_ligacao(uuid,text,text,text,uuid,text,text,text,text,text,text,timestamptz,text,text,text,text,text,text)
  RENAME TO tele_registrar_ligacao_core;

CREATE FUNCTION public.tele_registrar_ligacao(
  _client_id uuid,_nome text,_senha text,_tabela text,_id uuid,_ligacao_status text,_cidade text,_bairro text,
  _vota_candidato text DEFAULT NULL,_candidato_alternativo text DEFAULT NULL,_observacao text DEFAULT NULL,
  _proxima_tentativa_em timestamptz DEFAULT NULL,_candidato_federal text DEFAULT NULL,_federal_status text DEFAULT NULL,
  _candidato_senador text DEFAULT NULL,_senador_status text DEFAULT NULL,_candidato_governador text DEFAULT NULL,_governador_status text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  RETURN public.tele_registrar_ligacao_core(
    _client_id,_nome,_senha,_tabela,_id,_ligacao_status,_cidade,_bairro,_vota_candidato,
    CASE WHEN _candidato_alternativo IS NULL THEN NULL ELSE public.tele_resolver_candidato(_client_id,'estadual',_candidato_alternativo,true) END,
    _observacao,_proxima_tentativa_em,
    CASE WHEN _candidato_federal IS NULL THEN NULL ELSE public.tele_resolver_candidato(_client_id,'federal',_candidato_federal,true) END,_federal_status,
    CASE WHEN _candidato_senador IS NULL THEN NULL ELSE public.tele_resolver_candidato(_client_id,'senador',_candidato_senador,true) END,_senador_status,
    CASE WHEN _candidato_governador IS NULL THEN NULL ELSE public.tele_resolver_candidato(_client_id,'governador',_candidato_governador,true) END,_governador_status);
END;
$function$;

-- Correção conhecida e segura: variantes informadas pelo usuário para Reinaldo Azambuja.
DO $function$
DECLARE r record; v_id uuid;
BEGIN
  FOR r IN
    SELECT DISTINCT client_id FROM public.telemarketing_call_log
    WHERE public.tele_candidato_chave(candidato_senador) IN ('azambuja','reinaldoazambuja','reinadlazambuja')
  LOOP
    INSERT INTO public.telemarketing_candidatos(client_id,cargo,nome_oficial,nome_chave)
    VALUES(r.client_id,'senador','Reinaldo Azambuja','reinaldoazambuja')
    ON CONFLICT(client_id,cargo,nome_chave) DO UPDATE SET nome_oficial='Reinaldo Azambuja',updated_at=now()
    RETURNING id INTO v_id;
    INSERT INTO public.telemarketing_candidato_aliases(client_id,cargo,candidato_id,alias,alias_chave) VALUES
      (r.client_id,'senador',v_id,'Azambuja','azambuja'),
      (r.client_id,'senador',v_id,'Reinadl Azambuja','reinadlazambuja'),
      (r.client_id,'senador',v_id,'Reinaldo Azambuja','reinaldoazambuja')
    ON CONFLICT(client_id,cargo,alias_chave) DO UPDATE SET candidato_id=EXCLUDED.candidato_id;

    UPDATE public.telemarketing_call_log SET candidato_senador='Reinaldo Azambuja'
      WHERE client_id=r.client_id AND public.tele_candidato_chave(candidato_senador) IN ('azambuja','reinaldoazambuja','reinadlazambuja');
    UPDATE public.contratados SET candidato_senador='Reinaldo Azambuja' WHERE client_id=r.client_id AND public.tele_candidato_chave(candidato_senador) IN ('azambuja','reinaldoazambuja','reinadlazambuja');
    UPDATE public.contratado_indicados SET candidato_senador='Reinaldo Azambuja' WHERE client_id=r.client_id AND public.tele_candidato_chave(candidato_senador) IN ('azambuja','reinaldoazambuja','reinadlazambuja');
    UPDATE public.telemarketing_contatos_avulsos SET candidato_senador='Reinaldo Azambuja' WHERE client_id=r.client_id AND public.tele_candidato_chave(candidato_senador) IN ('azambuja','reinaldoazambuja','reinadlazambuja');
    UPDATE public.eleicao_indicados SET candidato_senador='Reinaldo Azambuja' WHERE client_id=r.client_id AND public.tele_candidato_chave(candidato_senador) IN ('azambuja','reinaldoazambuja','reinadlazambuja');
    UPDATE public.eleicao_pessoas SET candidato_senador='Reinaldo Azambuja' WHERE client_id=r.client_id AND public.tele_candidato_chave(candidato_senador) IN ('azambuja','reinaldoazambuja','reinadlazambuja');
  END LOOP;
END;
$function$;

-- Importa os demais nomes históricos para que o autocomplete já nasça útil.
DO $function$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT client_id,cargo,nome FROM (
      SELECT client_id,'estadual'::text cargo,candidato_alternativo nome FROM public.telemarketing_call_log
      UNION SELECT client_id,'federal',candidato_federal FROM public.telemarketing_call_log
      UNION SELECT client_id,'senador',candidato_senador FROM public.telemarketing_call_log
      UNION SELECT client_id,'governador',candidato_governador FROM public.telemarketing_call_log
    ) x
    WHERE nome IS NOT NULL AND public.tele_candidato_chave(nome) NOT IN
      ('nenhum','ninguem','naosabe','naoquisresponder','naoquisopinar','indeciso','indecisa','estudandopropostas')
  LOOP
    PERFORM public.tele_resolver_candidato(r.client_id,r.cargo,r.nome,true);
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.tele_candidato_chave(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tele_resolver_candidato(uuid,text,text,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tele_registrar_ligacao_core(uuid,text,text,text,uuid,text,text,text,text,text,text,timestamptz,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tele_sugestoes_candidatos(uuid,text,text,text,text,integer) TO anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tele_registrar_ligacao(uuid,text,text,text,uuid,text,text,text,text,text,text,timestamptz,text,text,text,text,text,text) TO anon,authenticated;
