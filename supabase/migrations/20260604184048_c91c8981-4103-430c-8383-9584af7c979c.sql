
CREATE TABLE IF NOT EXISTS public.eleicao_indicacao_config (
  client_id uuid PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  meta_coordenador integer NOT NULL DEFAULT 30,
  meta_lider integer NOT NULL DEFAULT 30,
  meta_cabo integer NOT NULL DEFAULT 5,
  limite_diario_token integer NOT NULL DEFAULT 200,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eleicao_indicacao_config TO authenticated;
GRANT ALL ON public.eleicao_indicacao_config TO service_role;
GRANT SELECT ON public.eleicao_indicacao_config TO anon;
ALTER TABLE public.eleicao_indicacao_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team manages indicacao_config" ON public.eleicao_indicacao_config
  FOR ALL TO authenticated USING (public.user_can_access_client(client_id)) WITH CHECK (public.user_can_access_client(client_id));
CREATE POLICY "anon read indicacao_config" ON public.eleicao_indicacao_config
  FOR SELECT TO anon USING (true);

CREATE TABLE IF NOT EXISTS public.eleicao_indicacao_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  indicador_id uuid NOT NULL REFERENCES public.eleicao_pessoas(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  total_indicacoes integer NOT NULL DEFAULT 0,
  ultimo_acesso_em timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS eleicao_indicacao_tokens_indicador_ativo
  ON public.eleicao_indicacao_tokens(indicador_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS eleicao_indicacao_tokens_client ON public.eleicao_indicacao_tokens(client_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eleicao_indicacao_tokens TO authenticated;
GRANT ALL ON public.eleicao_indicacao_tokens TO service_role;
ALTER TABLE public.eleicao_indicacao_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team manages indicacao_tokens" ON public.eleicao_indicacao_tokens
  FOR ALL TO authenticated USING (public.user_can_access_client(client_id)) WITH CHECK (public.user_can_access_client(client_id));

CREATE TABLE IF NOT EXISTS public.eleicao_indicados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  indicador_id uuid NOT NULL REFERENCES public.eleicao_pessoas(id) ON DELETE CASCADE,
  indicador_tipo public.eleicao_tipo NOT NULL,
  token_id uuid REFERENCES public.eleicao_indicacao_tokens(id) ON DELETE SET NULL,
  nome text NOT NULL,
  telefone text NOT NULL,
  telefone_norm text NOT NULL,
  cidade text,
  bairro text,
  observacao text,
  origem text NOT NULL DEFAULT 'link_publico' CHECK (origem IN ('link_publico','manual_interno','import_csv')),
  criado_por_user_id uuid,
  status_telemarketing text NOT NULL DEFAULT 'pendente' CHECK (status_telemarketing IN ('pendente','agendado','concluido','descartado')),
  ultimo_status_ligacao text,
  ultima_ligacao_em timestamptz,
  total_tentativas integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS eleicao_indicados_dedupe ON public.eleicao_indicados(client_id, telefone_norm);
CREATE INDEX IF NOT EXISTS eleicao_indicados_by_indicador ON public.eleicao_indicados(client_id, indicador_id, created_at DESC);
CREATE INDEX IF NOT EXISTS eleicao_indicados_status ON public.eleicao_indicados(client_id, status_telemarketing);
CREATE INDEX IF NOT EXISTS eleicao_indicados_token ON public.eleicao_indicados(token_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.eleicao_indicados TO authenticated;
GRANT ALL ON public.eleicao_indicados TO service_role;
ALTER TABLE public.eleicao_indicados ENABLE ROW LEVEL SECURITY;
CREATE POLICY "team views indicados" ON public.eleicao_indicados
  FOR SELECT TO authenticated USING (public.user_can_access_client(client_id));
CREATE POLICY "team inserts indicados" ON public.eleicao_indicados
  FOR INSERT TO authenticated WITH CHECK (public.user_can_access_client(client_id));
CREATE POLICY "team updates indicados" ON public.eleicao_indicados
  FOR UPDATE TO authenticated USING (public.user_can_access_client(client_id));
CREATE POLICY "team deletes indicados" ON public.eleicao_indicados
  FOR DELETE TO authenticated USING (public.user_can_access_client(client_id));
CREATE POLICY "coord views own tree indicados" ON public.eleicao_indicados
  FOR SELECT TO authenticated USING (public.eleicao_pessoa_in_user_tree(indicador_id, auth.uid()));

CREATE OR REPLACE FUNCTION public.eleicao_indicacao_token_count_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.token_id IS NOT NULL THEN
      UPDATE public.eleicao_indicacao_tokens SET total_indicacoes = total_indicacoes + 1 WHERE id = NEW.token_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.token_id IS NOT NULL THEN
      UPDATE public.eleicao_indicacao_tokens SET total_indicacoes = GREATEST(total_indicacoes - 1, 0) WHERE id = OLD.token_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$fn$;
DROP TRIGGER IF EXISTS trg_eleicao_indicacao_token_count ON public.eleicao_indicados;
CREATE TRIGGER trg_eleicao_indicacao_token_count
  AFTER INSERT OR DELETE ON public.eleicao_indicados
  FOR EACH ROW EXECUTE FUNCTION public.eleicao_indicacao_token_count_sync();

CREATE OR REPLACE FUNCTION public.eleicao_indicados_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$fn$;
DROP TRIGGER IF EXISTS trg_eleicao_indicados_touch ON public.eleicao_indicados;
CREATE TRIGGER trg_eleicao_indicados_touch BEFORE UPDATE ON public.eleicao_indicados
  FOR EACH ROW EXECUTE FUNCTION public.eleicao_indicados_touch_updated();

CREATE OR REPLACE FUNCTION public.eleicao_gerar_token_indicador(_indicador_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_client_id uuid; v_token text;
BEGIN
  SELECT client_id INTO v_client_id FROM public.eleicao_pessoas WHERE id = _indicador_id;
  IF v_client_id IS NULL THEN RAISE EXCEPTION 'Indicador não encontrado'; END IF;
  IF NOT public.user_can_access_client(v_client_id) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  UPDATE public.eleicao_indicacao_tokens SET revoked_at = now()
    WHERE indicador_id = _indicador_id AND revoked_at IS NULL;
  v_token := encode(gen_random_bytes(24), 'base64');
  v_token := replace(replace(replace(v_token, '+','-'), '/','_'), '=','');
  INSERT INTO public.eleicao_indicacao_tokens(client_id, indicador_id, token)
    VALUES (v_client_id, _indicador_id, v_token);
  RETURN v_token;
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.eleicao_gerar_token_indicador(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.eleicao_indicador_info(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE v_rec record; v_meta integer; v_candidato text;
BEGIN
  SELECT t.id AS token_id, t.client_id, t.indicador_id, t.total_indicacoes, t.revoked_at,
         p.nome, p.tipo
    INTO v_rec
    FROM public.eleicao_indicacao_tokens t
    JOIN public.eleicao_pessoas p ON p.id = t.indicador_id
   WHERE t.token = _token;
  IF v_rec IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo','token_invalido'); END IF;
  IF v_rec.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo','token_revogado'); END IF;

  UPDATE public.eleicao_indicacao_tokens SET ultimo_acesso_em = now() WHERE id = v_rec.token_id;

  SELECT CASE v_rec.tipo
    WHEN 'coordenador' THEN COALESCE(meta_coordenador, 30)
    WHEN 'lider' THEN COALESCE(meta_lider, 30)
    WHEN 'cabo' THEN COALESCE(meta_cabo, 5)
  END INTO v_meta
  FROM public.eleicao_indicacao_config WHERE client_id = v_rec.client_id;
  IF v_meta IS NULL THEN v_meta := CASE v_rec.tipo WHEN 'cabo' THEN 5 ELSE 30 END; END IF;

  SELECT candidate_name INTO v_candidato FROM public.candidate_identity WHERE client_id = v_rec.client_id;

  RETURN jsonb_build_object(
    'ok', true,
    'indicador_nome', v_rec.nome,
    'indicador_tipo', v_rec.tipo,
    'candidato_nome', v_candidato,
    'total_indicacoes', v_rec.total_indicacoes,
    'meta', v_meta
  );
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.eleicao_indicador_info(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.eleicao_indicar_via_token(
  _token text, _nome text, _telefone text,
  _cidade text DEFAULT NULL, _bairro text DEFAULT NULL, _observacao text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_tok record; v_norm text; v_existing uuid; v_count_today integer; v_limite integer; v_id uuid;
BEGIN
  IF _nome IS NULL OR length(trim(_nome)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'motivo','nome_invalido');
  END IF;
  v_norm := regexp_replace(coalesce(_telefone,''), '\D', '', 'g');
  IF length(v_norm) < 10 OR length(v_norm) > 13 THEN
    RETURN jsonb_build_object('ok', false, 'motivo','telefone_invalido');
  END IF;
  SELECT t.id, t.client_id, t.indicador_id, p.tipo, t.revoked_at
    INTO v_tok
    FROM public.eleicao_indicacao_tokens t
    JOIN public.eleicao_pessoas p ON p.id = t.indicador_id
   WHERE t.token = _token;
  IF v_tok IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo','token_invalido'); END IF;
  IF v_tok.revoked_at IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'motivo','token_revogado'); END IF;

  SELECT COALESCE(limite_diario_token, 200) INTO v_limite
    FROM public.eleicao_indicacao_config WHERE client_id = v_tok.client_id;
  v_limite := COALESCE(v_limite, 200);

  SELECT count(*) INTO v_count_today
    FROM public.eleicao_indicados
   WHERE token_id = v_tok.id AND created_at > now() - interval '24 hours';
  IF v_count_today >= v_limite THEN
    RETURN jsonb_build_object('ok', false, 'motivo','limite_diario');
  END IF;

  SELECT id INTO v_existing FROM public.eleicao_indicados
   WHERE client_id = v_tok.client_id AND telefone_norm = v_norm;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'motivo','duplicado');
  END IF;

  INSERT INTO public.eleicao_indicados(
    client_id, indicador_id, indicador_tipo, token_id,
    nome, telefone, telefone_norm, cidade, bairro, observacao, origem
  ) VALUES (
    v_tok.client_id, v_tok.indicador_id, v_tok.tipo, v_tok.id,
    trim(_nome), trim(_telefone), v_norm,
    NULLIF(trim(coalesce(_cidade,'')),''),
    NULLIF(trim(coalesce(_bairro,'')),''),
    NULLIF(trim(coalesce(_observacao,'')),''),
    'link_publico'
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.eleicao_indicar_via_token(text,text,text,text,text,text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.eleicao_listar_indicacoes_token(_token text, _limit integer DEFAULT 20)
RETURNS TABLE(id uuid, nome text, telefone text, bairro text, created_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_tok_id uuid;
BEGIN
  SELECT id INTO v_tok_id FROM public.eleicao_indicacao_tokens
    WHERE token = _token AND revoked_at IS NULL;
  IF v_tok_id IS NULL THEN RETURN; END IF;
  RETURN QUERY
    SELECT i.id, i.nome, i.telefone, i.bairro, i.created_at
      FROM public.eleicao_indicados i
     WHERE i.token_id = v_tok_id
     ORDER BY i.created_at DESC
     LIMIT GREATEST(LEAST(_limit, 100), 1);
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.eleicao_listar_indicacoes_token(text,integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.eleicao_remover_indicacao_token(_token text, _indicado_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE v_tok_id uuid; v_ind record;
BEGIN
  SELECT id INTO v_tok_id FROM public.eleicao_indicacao_tokens
    WHERE token = _token AND revoked_at IS NULL;
  IF v_tok_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo','token_invalido'); END IF;
  SELECT id, created_at INTO v_ind FROM public.eleicao_indicados
    WHERE id = _indicado_id AND token_id = v_tok_id;
  IF v_ind IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo','nao_encontrado'); END IF;
  IF v_ind.created_at < now() - interval '1 hour' THEN
    RETURN jsonb_build_object('ok', false, 'motivo','prazo_expirado');
  END IF;
  DELETE FROM public.eleicao_indicados WHERE id = _indicado_id;
  RETURN jsonb_build_object('ok', true);
END;
$fn$;
GRANT EXECUTE ON FUNCTION public.eleicao_remover_indicacao_token(text,uuid) TO anon, authenticated;

CREATE OR REPLACE VIEW public.v_eleicao_indicadores_cobranca AS
SELECT
  p.id AS indicador_id, p.client_id, p.nome, p.tipo, p.telefone, p.regiao, p.cidade, p.parent_id,
  t.id AS token_id, t.token,
  COALESCE(t.total_indicacoes, 0) AS total_indicacoes,
  CASE p.tipo
    WHEN 'coordenador' THEN COALESCE(c.meta_coordenador, 30)
    WHEN 'lider' THEN COALESCE(c.meta_lider, 30)
    WHEN 'cabo' THEN COALESCE(c.meta_cabo, 5)
  END AS meta,
  t.ultimo_acesso_em
FROM public.eleicao_pessoas p
LEFT JOIN public.eleicao_indicacao_tokens t ON t.indicador_id = p.id AND t.revoked_at IS NULL
LEFT JOIN public.eleicao_indicacao_config c ON c.client_id = p.client_id;
GRANT SELECT ON public.v_eleicao_indicadores_cobranca TO authenticated;
