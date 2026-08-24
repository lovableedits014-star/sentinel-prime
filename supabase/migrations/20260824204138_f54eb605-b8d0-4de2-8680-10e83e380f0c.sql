-- ============ TABELAS ============
CREATE TABLE public.reunioes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  data_reuniao date NOT NULL,
  local text,
  observacoes text,
  status text NOT NULL DEFAULT 'aberta',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reunioes TO authenticated;
GRANT ALL ON public.reunioes TO service_role;
ALTER TABLE public.reunioes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reuniao_sessoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reuniao_id uuid NOT NULL REFERENCES public.reunioes(id) ON DELETE CASCADE,
  label text NOT NULL,
  hora_inicio time,
  hora_fim time,
  vagas integer NOT NULL DEFAULT 20,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reuniao_sessoes TO authenticated;
GRANT ALL ON public.reuniao_sessoes TO service_role;
ALTER TABLE public.reuniao_sessoes ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reuniao_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reuniao_id uuid NOT NULL REFERENCES public.reunioes(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT replace(gen_random_uuid()::text, '-', ''),
  label text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reuniao_links TO authenticated;
GRANT ALL ON public.reuniao_links TO service_role;
ALTER TABLE public.reuniao_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.reuniao_inscricoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reuniao_id uuid NOT NULL REFERENCES public.reunioes(id) ON DELETE CASCADE,
  sessao_id uuid NOT NULL REFERENCES public.reuniao_sessoes(id) ON DELETE CASCADE,
  link_id uuid REFERENCES public.reuniao_links(id) ON DELETE SET NULL,
  nome text NOT NULL,
  telefone text NOT NULL,
  eleicao_pessoa_id uuid REFERENCES public.eleicao_pessoas(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'confirmado',
  presenca text,
  checkin_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reuniao_inscricoes TO authenticated;
GRANT ALL ON public.reuniao_inscricoes TO service_role;
ALTER TABLE public.reuniao_inscricoes ENABLE ROW LEVEL SECURITY;

CREATE UNIQUE INDEX reuniao_inscricoes_uniq_tel ON public.reuniao_inscricoes(reuniao_id, telefone) WHERE status <> 'cancelado';
CREATE INDEX reuniao_inscricoes_sessao_idx ON public.reuniao_inscricoes(sessao_id);
CREATE INDEX reuniao_sessoes_reuniao_idx ON public.reuniao_sessoes(reuniao_id);
CREATE INDEX reuniao_links_reuniao_idx ON public.reuniao_links(reuniao_id);
CREATE INDEX reunioes_client_idx ON public.reunioes(client_id, data_reuniao DESC);

-- ============ HELPER DE ACESSO ============
CREATE OR REPLACE FUNCTION public.reuniao_user_can_access(_reuniao_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.reunioes r
    WHERE r.id = _reuniao_id
      AND (
        public.has_role(auth.uid(), 'admin')
        OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = r.client_id AND c.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = r.client_id AND tm.user_id = auth.uid())
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.reuniao_client_can_access(_client_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = _client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = _client_id AND tm.user_id = auth.uid())
$$;

-- ============ POLICIES ============
CREATE POLICY "team manage reunioes" ON public.reunioes FOR ALL TO authenticated
  USING (public.reuniao_client_can_access(client_id))
  WITH CHECK (public.reuniao_client_can_access(client_id));

CREATE POLICY "team manage reuniao_sessoes" ON public.reuniao_sessoes FOR ALL TO authenticated
  USING (public.reuniao_user_can_access(reuniao_id))
  WITH CHECK (public.reuniao_user_can_access(reuniao_id));

CREATE POLICY "team manage reuniao_links" ON public.reuniao_links FOR ALL TO authenticated
  USING (public.reuniao_user_can_access(reuniao_id))
  WITH CHECK (public.reuniao_user_can_access(reuniao_id));

CREATE POLICY "team manage reuniao_inscricoes" ON public.reuniao_inscricoes FOR ALL TO authenticated
  USING (public.reuniao_user_can_access(reuniao_id))
  WITH CHECK (public.reuniao_user_can_access(reuniao_id));

-- ============ TRIGGERS updated_at ============
CREATE TRIGGER trg_reunioes_updated BEFORE UPDATE ON public.reunioes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_reuniao_sessoes_updated BEFORE UPDATE ON public.reuniao_sessoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_reuniao_links_updated BEFORE UPDATE ON public.reuniao_links FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_reuniao_inscricoes_updated BEFORE UPDATE ON public.reuniao_inscricoes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RPCs PÚBLICAS (por token) ============
CREATE OR REPLACE FUNCTION public.reuniao_info_token(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link public.reuniao_links;
  v_reuniao public.reunioes;
  v_client_name text;
  v_client_logo text;
  v_sessoes jsonb;
BEGIN
  SELECT * INTO v_link FROM public.reuniao_links WHERE token = _token;
  IF v_link.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'token_invalido'); END IF;
  IF NOT v_link.ativo THEN RETURN jsonb_build_object('ok', false, 'motivo', 'link_desativado'); END IF;

  SELECT * INTO v_reuniao FROM public.reunioes WHERE id = v_link.reuniao_id;
  IF v_reuniao.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'reuniao_inexistente'); END IF;
  IF v_reuniao.status <> 'aberta' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'inscricoes_encerradas'); END IF;

  SELECT c.name, c.logo_url INTO v_client_name, v_client_logo FROM public.clients c WHERE c.id = v_reuniao.client_id;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'ordem', x->>'label'), '[]'::jsonb) INTO v_sessoes
  FROM (
    SELECT jsonb_build_object(
      'id', s.id, 'label', s.label, 'hora_inicio', s.hora_inicio, 'hora_fim', s.hora_fim,
      'vagas', s.vagas, 'ordem', s.ordem,
      'ocupadas', (SELECT count(*) FROM public.reuniao_inscricoes i WHERE i.sessao_id = s.id AND i.status <> 'cancelado')
    ) AS x
    FROM public.reuniao_sessoes s WHERE s.reuniao_id = v_reuniao.id
  ) q;

  RETURN jsonb_build_object(
    'ok', true,
    'reuniao_id', v_reuniao.id,
    'titulo', v_reuniao.titulo,
    'data_reuniao', v_reuniao.data_reuniao,
    'local', v_reuniao.local,
    'observacoes', v_reuniao.observacoes,
    'grupo_label', v_link.label,
    'candidato_nome', v_client_name,
    'candidato_logo', v_client_logo,
    'sessoes', v_sessoes
  );
END;
$$;
REVOKE ALL ON FUNCTION public.reuniao_info_token(text) FROM public;
GRANT EXECUTE ON FUNCTION public.reuniao_info_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.reuniao_inscrever_token(_token text, _nome text, _telefone text, _sessao_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link public.reuniao_links;
  v_reuniao public.reunioes;
  v_sessao public.reuniao_sessoes;
  v_tel text;
  v_ocupadas int;
  v_existing public.reuniao_inscricoes;
  v_pessoa_id uuid;
  v_id uuid;
BEGIN
  SELECT * INTO v_link FROM public.reuniao_links WHERE token = _token AND ativo = true;
  IF v_link.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'token_invalido'); END IF;

  SELECT * INTO v_reuniao FROM public.reunioes WHERE id = v_link.reuniao_id;
  IF v_reuniao.status <> 'aberta' THEN RETURN jsonb_build_object('ok', false, 'motivo', 'inscricoes_encerradas'); END IF;

  SELECT * INTO v_sessao FROM public.reuniao_sessoes WHERE id = _sessao_id AND reuniao_id = v_reuniao.id FOR UPDATE;
  IF v_sessao.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'motivo', 'sessao_invalida'); END IF;

  v_tel := regexp_replace(coalesce(_telefone, ''), '\D', '', 'g');
  IF length(v_tel) < 10 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'telefone_invalido'); END IF;
  IF length(coalesce(trim(_nome), '')) < 3 THEN RETURN jsonb_build_object('ok', false, 'motivo', 'nome_invalido'); END IF;

  SELECT id INTO v_pessoa_id FROM public.eleicao_pessoas
   WHERE client_id = v_reuniao.client_id
     AND regexp_replace(coalesce(telefone, ''), '\D', '', 'g') = v_tel
   LIMIT 1;

  SELECT * INTO v_existing FROM public.reuniao_inscricoes
   WHERE reuniao_id = v_reuniao.id AND telefone = v_tel AND status <> 'cancelado' LIMIT 1;

  SELECT count(*) INTO v_ocupadas FROM public.reuniao_inscricoes
   WHERE sessao_id = v_sessao.id AND status <> 'cancelado'
     AND (v_existing.id IS NULL OR id <> v_existing.id);

  IF v_ocupadas >= v_sessao.vagas THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sessao_lotada');
  END IF;

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.reuniao_inscricoes
       SET sessao_id = v_sessao.id, nome = trim(_nome), link_id = v_link.id,
           eleicao_pessoa_id = coalesce(v_pessoa_id, eleicao_pessoa_id)
     WHERE id = v_existing.id
     RETURNING id INTO v_id;
    RETURN jsonb_build_object('ok', true, 'atualizado', true, 'inscricao_id', v_id, 'sessao_label', v_sessao.label);
  END IF;

  INSERT INTO public.reuniao_inscricoes (reuniao_id, sessao_id, link_id, nome, telefone, eleicao_pessoa_id)
  VALUES (v_reuniao.id, v_sessao.id, v_link.id, trim(_nome), v_tel, v_pessoa_id)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'atualizado', false, 'inscricao_id', v_id, 'sessao_label', v_sessao.label);
END;
$$;
REVOKE ALL ON FUNCTION public.reuniao_inscrever_token(text, text, text, uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.reuniao_inscrever_token(text, text, text, uuid) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.reuniao_minha_inscricao_token(_token text, _telefone text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_link public.reuniao_links;
  v_tel text;
  v_row record;
BEGIN
  SELECT * INTO v_link FROM public.reuniao_links WHERE token = _token;
  IF v_link.id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  v_tel := regexp_replace(coalesce(_telefone, ''), '\D', '', 'g');
  SELECT i.id, i.nome, i.sessao_id, s.label AS sessao_label INTO v_row
    FROM public.reuniao_inscricoes i
    JOIN public.reuniao_sessoes s ON s.id = i.sessao_id
   WHERE i.reuniao_id = v_link.reuniao_id AND i.telefone = v_tel AND i.status <> 'cancelado'
   LIMIT 1;
  IF v_row.id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object('ok', true, 'inscricao_id', v_row.id, 'nome', v_row.nome, 'sessao_id', v_row.sessao_id, 'sessao_label', v_row.sessao_label);
END;
$$;
REVOKE ALL ON FUNCTION public.reuniao_minha_inscricao_token(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.reuniao_minha_inscricao_token(text, text) TO anon, authenticated;

-- ============ CHECK-IN → funil ============
CREATE OR REPLACE FUNCTION public.reuniao_sync_funnel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.presenca = 'presente' AND NEW.eleicao_pessoa_id IS NOT NULL THEN
    UPDATE public.eleicao_pessoas
       SET participou_reuniao = true,
           reuniao_em = coalesce(reuniao_em, coalesce(NEW.checkin_em, now()))
     WHERE id = NEW.eleicao_pessoa_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reuniao_sync_funnel
AFTER INSERT OR UPDATE OF presenca ON public.reuniao_inscricoes
FOR EACH ROW EXECUTE FUNCTION public.reuniao_sync_funnel();