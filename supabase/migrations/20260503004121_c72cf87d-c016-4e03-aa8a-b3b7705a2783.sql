-- 114: ensure_pessoa_from_supporter endurecido
CREATE OR REPLACE FUNCTION public.ensure_pessoa_from_supporter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE extracted_phone text; v_phone text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.pessoas WHERE supporter_id = NEW.id) THEN RETURN NEW; END IF;
  extracted_phone := NULLIF(regexp_replace(COALESCE(substring(NEW.notes from 'Tel: ([^|]+)'), ''), '\s+$', ''), '');
  v_phone := COALESCE(NULLIF(NEW.telefone, ''), extracted_phone);
  IF v_phone IS NULL OR length(public.only_digits(v_phone)) < 10 THEN RETURN NEW; END IF;
  INSERT INTO public.pessoas (client_id, nome, telefone, tipo_pessoa, nivel_apoio, origem_contato, supporter_id, notas_internas)
  VALUES (NEW.client_id, NEW.name, v_phone, 'apoiador'::public.tipo_pessoa, 'apoiador'::public.nivel_apoio,
    'formulario'::public.origem_contato, NEW.id, NEW.notes);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'ensure_pessoa_from_supporter: %', SQLERRM;
  RETURN NEW;
END; $$;

-- 115: narrativa
CREATE TABLE public.narrativa_perfil_candidato (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome_candidato TEXT, cargo_pretendido TEXT, partido TEXT,
  bandeiras JSONB NOT NULL DEFAULT '[]'::jsonb,
  tom_voz TEXT DEFAULT 'popular',
  estilo_discurso TEXT, publico_alvo TEXT, proposta_central TEXT, observacoes TEXT,
  ref_uf text, ref_municipio text, ref_cargo text, ref_nome text,
  ref_partido text, ref_ano integer, ref_lado text,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);
ALTER TABLE public.narrativa_perfil_candidato ENABLE ROW LEVEL SECURITY;
CREATE POLICY "narrativa_perfil_all" ON public.narrativa_perfil_candidato FOR ALL TO authenticated
  USING (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = narrativa_perfil_candidato.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = narrativa_perfil_candidato.client_id AND tm.user_id = auth.uid()))
  WITH CHECK (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = narrativa_perfil_candidato.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = narrativa_perfil_candidato.client_id AND tm.user_id = auth.uid()));
CREATE TRIGGER trg_narrativa_perfil_updated BEFORE UPDATE ON public.narrativa_perfil_candidato
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.narrativa_dossies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  uf TEXT NOT NULL, municipio TEXT NOT NULL, ibge_code TEXT,
  dados_brutos JSONB NOT NULL DEFAULT '{}'::jsonb,
  analise JSONB NOT NULL DEFAULT '{}'::jsonb,
  conteudos JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pendente',
  erro_msg TEXT,
  collected_at TIMESTAMPTZ, analyzed_at TIMESTAMPTZ, generated_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_narrativa_dossies_client ON public.narrativa_dossies(client_id);
CREATE INDEX idx_narrativa_dossies_municipio ON public.narrativa_dossies(client_id, uf, municipio);
ALTER TABLE public.narrativa_dossies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "narrativa_dossies_all" ON public.narrativa_dossies FOR ALL TO authenticated
  USING (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = narrativa_dossies.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = narrativa_dossies.client_id AND tm.user_id = auth.uid()))
  WITH CHECK (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = narrativa_dossies.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = narrativa_dossies.client_id AND tm.user_id = auth.uid()));
CREATE TRIGGER trg_narrativa_dossies_updated BEFORE UPDATE ON public.narrativa_dossies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.narrativa_visitas_realizadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  dossie_id UUID REFERENCES public.narrativa_dossies(id) ON DELETE SET NULL,
  uf TEXT NOT NULL, municipio TEXT NOT NULL,
  data_visita DATE NOT NULL DEFAULT CURRENT_DATE,
  temas_abordados JSONB NOT NULL DEFAULT '[]'::jsonb,
  bairros_visitados JSONB NOT NULL DEFAULT '[]'::jsonb,
  observacoes TEXT, resultado_percebido TEXT, created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_narrativa_visitas_client ON public.narrativa_visitas_realizadas(client_id, data_visita DESC);
ALTER TABLE public.narrativa_visitas_realizadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "narrativa_visitas_all" ON public.narrativa_visitas_realizadas FOR ALL TO authenticated
  USING (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = narrativa_visitas_realizadas.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = narrativa_visitas_realizadas.client_id AND tm.user_id = auth.uid()))
  WITH CHECK (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = narrativa_visitas_realizadas.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = narrativa_visitas_realizadas.client_id AND tm.user_id = auth.uid()));
CREATE TRIGGER trg_narrativa_visitas_updated BEFORE UPDATE ON public.narrativa_visitas_realizadas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 116-117: keepalive whatsapp (skip cron, just function)
INSERT INTO public.platform_config (key, value)
VALUES ('whatsapp_keepalive_token', gen_random_uuid()::text)
ON CONFLICT (key) DO NOTHING;

-- 118: last_disconnected_at + trigger
ALTER TABLE public.whatsapp_instances ADD COLUMN IF NOT EXISTS last_disconnected_at timestamptz;

CREATE OR REPLACE FUNCTION public.track_whatsapp_disconnect()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (OLD.status = 'connected' AND NEW.status <> 'connected') THEN
    NEW.last_disconnected_at := now();
  END IF;
  IF (OLD.status <> 'connected' AND NEW.status <> 'connected'
      AND NEW.last_disconnected_at IS NULL) THEN
    NEW.last_disconnected_at := COALESCE(OLD.last_disconnected_at, now());
  END IF;
  IF (NEW.status = 'connected') THEN NEW.last_disconnected_at := NULL; END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_track_whatsapp_disconnect BEFORE UPDATE OF status ON public.whatsapp_instances
FOR EACH ROW EXECUTE FUNCTION public.track_whatsapp_disconnect();

-- 119: preflight columns + log_whatsapp_send v2
ALTER TABLE public.whatsapp_instance_send_log
  ADD COLUMN IF NOT EXISTS preflight_status text,
  ADD COLUMN IF NOT EXISTS preflight_reconnected boolean NOT NULL DEFAULT false;

DROP FUNCTION IF EXISTS public.log_whatsapp_send(uuid, uuid, uuid, boolean, text);
CREATE OR REPLACE FUNCTION public.log_whatsapp_send(
  p_instance_id uuid, p_client_id uuid, p_dispatch_id uuid,
  p_success boolean, p_error_message text DEFAULT NULL,
  p_preflight_status text DEFAULT NULL, p_preflight_reconnected boolean DEFAULT false)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO whatsapp_instance_send_log (instance_id, client_id, dispatch_id, success, error_message,
    preflight_status, preflight_reconnected)
  VALUES (p_instance_id, p_client_id, p_dispatch_id, p_success, p_error_message,
    p_preflight_status, COALESCE(p_preflight_reconnected, false));
  UPDATE whatsapp_instances
  SET total_sent = total_sent + CASE WHEN p_success THEN 1 ELSE 0 END,
    total_failed = total_failed + CASE WHEN p_success THEN 0 ELSE 1 END,
    consecutive_failures = CASE WHEN p_success THEN 0 ELSE consecutive_failures + 1 END,
    messages_sent_today = CASE WHEN messages_sent_today_date = CURRENT_DATE
      THEN messages_sent_today + CASE WHEN p_success THEN 1 ELSE 0 END
      ELSE CASE WHEN p_success THEN 1 ELSE 0 END END,
    messages_sent_today_date = CURRENT_DATE,
    last_send_at = now(), updated_at = now()
  WHERE id = p_instance_id;
END; $$;

-- 120-121: whatsapp_send_retry_queue + resume function
CREATE TABLE public.whatsapp_send_retry_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  telefone TEXT NOT NULL, nome TEXT,
  mensagem TEXT NOT NULL,
  origem TEXT NOT NULL DEFAULT 'automatico',
  origem_ref UUID,
  status TEXT NOT NULL DEFAULT 'pendente',
  attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 8,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error TEXT, last_attempt_at TIMESTAMPTZ, enviado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_wa_retry_queue_pending ON public.whatsapp_send_retry_queue (status, next_attempt_at) WHERE status = 'pendente';
CREATE INDEX idx_wa_retry_queue_client ON public.whatsapp_send_retry_queue (client_id, status);
CREATE TRIGGER trg_wa_retry_queue_updated_at BEFORE UPDATE ON public.whatsapp_send_retry_queue
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.whatsapp_send_retry_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "owner_view_retry_queue" ON public.whatsapp_send_retry_queue FOR SELECT
  USING (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = whatsapp_send_retry_queue.client_id AND c.user_id = auth.uid()));
CREATE POLICY "owner_manage_retry_queue" ON public.whatsapp_send_retry_queue FOR ALL
  USING (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = whatsapp_send_retry_queue.client_id AND c.user_id = auth.uid()))
  WITH CHECK (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM clients c WHERE c.id = whatsapp_send_retry_queue.client_id AND c.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.enqueue_whatsapp_retry(
  p_client_id UUID, p_telefone TEXT, p_mensagem TEXT,
  p_nome TEXT DEFAULT NULL, p_origem TEXT DEFAULT 'automatico', p_origem_ref UUID DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.whatsapp_send_retry_queue (client_id, telefone, nome, mensagem, origem, origem_ref)
  VALUES (p_client_id, public.only_digits(p_telefone), p_nome, p_mensagem, p_origem, p_origem_ref)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

-- 123: whatsapp-media bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('whatsapp-media', 'whatsapp-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;
CREATE POLICY "whatsapp-media public read" ON storage.objects FOR SELECT USING (bucket_id = 'whatsapp-media');
CREATE POLICY "whatsapp-media service write" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'whatsapp-media');

-- 124: tse-imports bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('tse-imports', 'tse-imports', false) ON CONFLICT (id) DO NOTHING;
CREATE POLICY "Super-admin lê tse-imports" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tse-imports' AND (auth.jwt() ->> 'email') = 'lovableedits014@gmail.com');
CREATE POLICY "Super-admin envia tse-imports" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tse-imports' AND (auth.jwt() ->> 'email') = 'lovableedits014@gmail.com');
CREATE POLICY "Super-admin atualiza tse-imports" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tse-imports' AND (auth.jwt() ->> 'email') = 'lovableedits014@gmail.com');
CREATE POLICY "Super-admin remove tse-imports" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tse-imports' AND (auth.jwt() ->> 'email') = 'lovableedits014@gmail.com');

-- 126: midia tables
CREATE TABLE public.midia_portais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL, url text NOT NULL UNIQUE,
  camada text NOT NULL DEFAULT 'estadual',
  uf text, municipio text,
  ativo boolean NOT NULL DEFAULT true,
  ordem integer NOT NULL DEFAULT 0,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.midia_portais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "midia_portais_select_authenticated" ON public.midia_portais FOR SELECT TO authenticated USING (true);
CREATE POLICY "midia_portais_admin_all" ON public.midia_portais FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TABLE public.midia_alvos_monitoramento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  termo text NOT NULL,
  tipo text NOT NULL DEFAULT 'candidato',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, termo)
);
CREATE INDEX idx_midia_alvos_client ON public.midia_alvos_monitoramento(client_id, ativo);
ALTER TABLE public.midia_alvos_monitoramento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "midia_alvos_all" ON public.midia_alvos_monitoramento FOR ALL TO authenticated
  USING (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = midia_alvos_monitoramento.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = midia_alvos_monitoramento.client_id AND tm.user_id = auth.uid()))
  WITH CHECK (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = midia_alvos_monitoramento.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = midia_alvos_monitoramento.client_id AND tm.user_id = auth.uid()));

CREATE TABLE public.midia_noticias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  portal_id uuid REFERENCES public.midia_portais(id) ON DELETE SET NULL,
  portal_nome text, url text NOT NULL,
  titulo text NOT NULL, resumo text, conteudo_md text,
  data_publicacao timestamptz, data_coleta timestamptz NOT NULL DEFAULT now(),
  sentimento text, sentimento_score numeric, relevancia_politica integer,
  alvos_mencionados text[] DEFAULT '{}', tags_assunto text[] DEFAULT '{}',
  resumo_ia text, alerta_critico boolean NOT NULL DEFAULT false,
  raw_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, url)
);
CREATE INDEX idx_midia_noticias_client_data ON public.midia_noticias(client_id, data_publicacao DESC);
CREATE INDEX idx_midia_noticias_client_alerta ON public.midia_noticias(client_id, alerta_critico) WHERE alerta_critico = true;
CREATE INDEX idx_midia_noticias_alvos ON public.midia_noticias USING GIN (alvos_mencionados);
ALTER TABLE public.midia_noticias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "midia_noticias_all" ON public.midia_noticias FOR ALL TO authenticated
  USING (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = midia_noticias.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = midia_noticias.client_id AND tm.user_id = auth.uid()))
  WITH CHECK (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = midia_noticias.client_id AND c.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = midia_noticias.client_id AND tm.user_id = auth.uid()));

CREATE TABLE public.midia_coleta_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  portais_processados integer DEFAULT 0,
  noticias_novas integer DEFAULT 0,
  noticias_analisadas integer DEFAULT 0,
  creditos_firecrawl integer DEFAULT 0,
  erros jsonb,
  status text NOT NULL DEFAULT 'rodando'
);
CREATE INDEX idx_midia_log_client ON public.midia_coleta_log(client_id, iniciado_em DESC);
ALTER TABLE public.midia_coleta_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "midia_log_all" ON public.midia_coleta_log FOR ALL TO authenticated
  USING (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = midia_coleta_log.client_id AND c.user_id = auth.uid()))
  WITH CHECK (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = midia_coleta_log.client_id AND c.user_id = auth.uid()));

CREATE TRIGGER trg_midia_portais_updated_at BEFORE UPDATE ON public.midia_portais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.midia_portais (nome, url, camada, uf, ordem, observacoes) VALUES
  ('G1 Política', 'https://g1.globo.com/politica/', 'nacional', NULL, 1, 'Pauta nacional'),
  ('Correio do Estado', 'https://correiodoestado.com.br/politica', 'estadual', 'MS', 2, 'Tradicional MS'),
  ('Midiamax', 'https://www.midiamax.com.br/politica', 'estadual', 'MS', 3, 'Digital MS'),
  ('Campo Grande News', 'https://www.campograndenews.com.br/politica', 'municipal', 'MS', 4, 'Campo Grande'),
  ('TopMídiaNews', 'https://www.topmidianews.com.br/politica', 'bastidor', 'MS', 5, 'Bastidor MS')
ON CONFLICT (url) DO NOTHING;

-- 127: parlamentar tables
CREATE TYPE public.nivel_parlamentar AS ENUM ('federal_deputado', 'federal_senador', 'estadual_deputado', 'municipal_vereador');

CREATE TABLE public.adversarios_politicos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, nome_parlamentar TEXT,
  nivel public.nivel_parlamentar NOT NULL,
  partido TEXT, uf TEXT, municipio TEXT, cargo TEXT,
  id_camara_federal INTEGER, id_senado_federal INTEGER,
  id_assembleia_estadual TEXT, url_camara_municipal TEXT,
  legislatura_atual INTEGER, foto_url TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true, observacoes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_adversarios_client ON public.adversarios_politicos(client_id);

CREATE TABLE public.parlamentar_presenca (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adversario_id UUID NOT NULL REFERENCES public.adversarios_politicos(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  data_sessao DATE NOT NULL, tipo_sessao TEXT,
  presente BOOLEAN NOT NULL,
  justificada BOOLEAN NOT NULL DEFAULT false,
  motivo_ausencia TEXT,
  legislatura INTEGER, id_externo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_presenca_adv_data ON public.parlamentar_presenca(adversario_id, data_sessao DESC);
CREATE UNIQUE INDEX idx_presenca_dedup ON public.parlamentar_presenca(adversario_id, id_externo) WHERE id_externo IS NOT NULL;

CREATE TABLE public.parlamentar_votacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adversario_id UUID NOT NULL REFERENCES public.adversarios_politicos(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  data_votacao TIMESTAMPTZ NOT NULL,
  proposicao_codigo TEXT, proposicao_ementa TEXT, tema TEXT,
  voto TEXT NOT NULL, resultado_geral TEXT,
  id_externo TEXT, url_detalhes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_votacoes_adv_data ON public.parlamentar_votacoes(adversario_id, data_votacao DESC);
CREATE INDEX idx_votacoes_tema ON public.parlamentar_votacoes(client_id, tema);
CREATE UNIQUE INDEX idx_votacoes_dedup ON public.parlamentar_votacoes(adversario_id, id_externo) WHERE id_externo IS NOT NULL;

CREATE TABLE public.parlamentar_proposicoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adversario_id UUID NOT NULL REFERENCES public.adversarios_politicos(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, numero TEXT, ano INTEGER,
  ementa TEXT, situacao TEXT,
  data_apresentacao DATE, tema TEXT,
  url_detalhes TEXT, id_externo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_proposicoes_adv ON public.parlamentar_proposicoes(adversario_id, data_apresentacao DESC);
CREATE UNIQUE INDEX idx_proposicoes_dedup ON public.parlamentar_proposicoes(adversario_id, id_externo) WHERE id_externo IS NOT NULL;

CREATE TABLE public.parlamentar_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  adversario_id UUID REFERENCES public.adversarios_politicos(id) ON DELETE CASCADE,
  fonte TEXT NOT NULL, tipo_dado TEXT NOT NULL, status TEXT NOT NULL,
  registros_inseridos INTEGER DEFAULT 0, registros_atualizados INTEGER DEFAULT 0,
  erro_mensagem TEXT, duracao_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sync_log_client ON public.parlamentar_sync_log(client_id, created_at DESC);

CREATE TABLE public.municipios_indicadores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo_ibge INTEGER NOT NULL UNIQUE,
  nome TEXT NOT NULL, uf TEXT NOT NULL,
  populacao INTEGER, populacao_ano INTEGER,
  pib_per_capita NUMERIC, pib_total NUMERIC, pib_ano INTEGER,
  idh NUMERIC, idh_ano INTEGER,
  renda_media NUMERIC, mortalidade_infantil NUMERIC,
  cobertura_sus_pct NUMERIC, leitos_sus_total INTEGER, datasus_ano INTEGER,
  ideb_anos_iniciais NUMERIC, ideb_anos_finais NUMERIC, ideb_ensino_medio NUMERIC, ideb_ano INTEGER,
  num_escolas INTEGER,
  indicadores JSONB DEFAULT '{}'::jsonb,
  ultima_atualizacao TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_municipios_uf ON public.municipios_indicadores(uf);
CREATE INDEX idx_municipios_nome ON public.municipios_indicadores(nome);
CREATE INDEX idx_municipios_indicadores_jsonb ON public.municipios_indicadores USING GIN(indicadores);

CREATE TABLE public.municipios_sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fonte TEXT NOT NULL,
  municipios_processados INTEGER DEFAULT 0,
  status TEXT NOT NULL, erro_mensagem TEXT, duracao_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_adversarios_updated_at BEFORE UPDATE ON public.adversarios_politicos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.adversarios_politicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parlamentar_presenca ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parlamentar_votacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parlamentar_proposicoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.parlamentar_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipios_indicadores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.municipios_sync_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adv_owner_all" ON public.adversarios_politicos FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = adversarios_politicos.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = adversarios_politicos.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "pres_owner_all" ON public.parlamentar_presenca FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = parlamentar_presenca.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = parlamentar_presenca.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "vot_owner_all" ON public.parlamentar_votacoes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = parlamentar_votacoes.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = parlamentar_votacoes.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "prop_owner_all" ON public.parlamentar_proposicoes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = parlamentar_proposicoes.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = parlamentar_proposicoes.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "synclog_owner_all" ON public.parlamentar_sync_log FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = parlamentar_sync_log.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = parlamentar_sync_log.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "municipios_select_auth" ON public.municipios_indicadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "municipios_sync_select_auth" ON public.municipios_sync_log FOR SELECT TO authenticated USING (true);

-- 129: municipios ranking functions
CREATE OR REPLACE FUNCTION public.municipios_ranking_uf(p_uf text)
RETURNS TABLE (codigo_ibge integer, nome text, indicador_id text, indicador_label text,
  area text, unidade text, ano integer, fonte text, valor numeric, higher_is_worse boolean,
  media_uf numeric, mediana_uf numeric, min_uf numeric, max_uf numeric,
  posicao integer, total_uf integer, percentil numeric, delta_vs_media numeric, delta_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH expandido AS (
    SELECT m.codigo_ibge, m.nome, m.uf, kv.key AS indicador_id,
      (kv.value->>'label')::text AS indicador_label,
      (kv.value->>'area')::text AS area,
      (kv.value->>'unidade')::text AS unidade,
      NULLIF(kv.value->>'ano','')::int AS ano,
      (kv.value->>'fonte')::text AS fonte,
      NULLIF(kv.value->>'valor','')::numeric AS valor,
      COALESCE((kv.value->>'higher_is_worse')::boolean, false) AS higher_is_worse,
      COALESCE((kv.value->>'outdated')::boolean, false) AS outdated
    FROM public.municipios_indicadores m
    CROSS JOIN LATERAL jsonb_each(COALESCE(m.indicadores, '{}'::jsonb)) AS kv
    WHERE m.uf = upper(p_uf)
      AND COALESCE((kv.value->>'outdated')::boolean, false) = false
      AND NULLIF(kv.value->>'valor','') IS NOT NULL
  ), estat AS (
    SELECT indicador_id, AVG(valor)::numeric AS media_uf,
      percentile_cont(0.5) WITHIN GROUP (ORDER BY valor)::numeric AS mediana_uf,
      MIN(valor)::numeric AS min_uf, MAX(valor)::numeric AS max_uf,
      COUNT(*)::int AS total_uf
    FROM expandido GROUP BY indicador_id
  ), ranqueado AS (
    SELECT e.*, st.media_uf, st.mediana_uf, st.min_uf, st.max_uf, st.total_uf,
      RANK() OVER (PARTITION BY e.indicador_id ORDER BY e.valor DESC)::int AS posicao
    FROM expandido e JOIN estat st USING (indicador_id)
  )
  SELECT r.codigo_ibge, r.nome, r.indicador_id, r.indicador_label, r.area, r.unidade,
    r.ano, r.fonte, r.valor, r.higher_is_worse,
    ROUND(r.media_uf, 4), ROUND(r.mediana_uf, 4), r.min_uf, r.max_uf, r.posicao, r.total_uf,
    ROUND( (1.0 - (r.posicao::numeric - 1) / NULLIF(r.total_uf - 1, 0)) * 100, 1),
    ROUND(r.valor - r.media_uf, 4),
    ROUND( ((r.valor - r.media_uf) / NULLIF(r.media_uf, 0)) * 100, 2)
  FROM ranqueado r;
$$;
GRANT EXECUTE ON FUNCTION public.municipios_ranking_uf(text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public.municipio_ranking(p_codigo_ibge integer)
RETURNS TABLE (indicador_id text, indicador_label text, area text, unidade text, ano integer,
  fonte text, valor numeric, higher_is_worse boolean, media_uf numeric, min_uf numeric,
  max_uf numeric, posicao integer, total_uf integer, percentil numeric, delta_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT indicador_id, indicador_label, area, unidade, ano, fonte, valor, higher_is_worse,
    media_uf, min_uf, max_uf, posicao, total_uf, percentil, delta_pct
  FROM public.municipios_ranking_uf(
    (SELECT uf FROM public.municipios_indicadores WHERE codigo_ibge = p_codigo_ibge LIMIT 1))
  WHERE codigo_ibge = p_codigo_ibge;
$$;
GRANT EXECUTE ON FUNCTION public.municipio_ranking(integer) TO authenticated, anon;

-- 130-131: pick_healthy_whatsapp_instance updated
CREATE OR REPLACE FUNCTION public.pick_healthy_whatsapp_instance(p_client_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_chosen_id UUID;
BEGIN
  WITH candidates AS (
    SELECT i.id,
      LEAST(1.0, EXTRACT(EPOCH FROM (now() - COALESCE(i.last_send_at, now() - INTERVAL '1 day'))) / 60.0) AS rest_score,
      COALESCE((SELECT CASE WHEN COUNT(*) = 0 THEN 1.0
        ELSE SUM(CASE WHEN success THEN 1.0 ELSE 0.0 END) / COUNT(*)::numeric END
        FROM whatsapp_instance_send_log l WHERE l.instance_id = i.id AND l.sent_at >= now() - INTERVAL '24 hours'), 1.0) AS success_rate
    FROM whatsapp_instances i
    WHERE i.client_id = p_client_id AND i.is_active = true AND i.status = 'connected'
      AND i.connected_since IS NOT NULL
      AND i.last_health_check_at IS NOT NULL
      AND i.last_health_check_at >= now() - INTERVAL '10 minutes'
      AND i.bridge_url IS NOT NULL AND i.bridge_api_key IS NOT NULL
      AND COALESCE(i.consecutive_failures, 0) < 3
  )
  SELECT id INTO v_chosen_id FROM candidates ORDER BY (rest_score * 0.7 + success_rate * 0.3) DESC, random() LIMIT 1;
  RETURN v_chosen_id;
END; $$;

-- 132: quick_contacts
CREATE TABLE public.quick_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  label TEXT NOT NULL, phone TEXT NOT NULL,
  context_message TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_quick_contacts_client ON public.quick_contacts(client_id, display_order);
ALTER TABLE public.quick_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "quick_contacts_select" ON public.quick_contacts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = quick_contacts.client_id AND (c.user_id = auth.uid() OR public.is_super_admin()))
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = quick_contacts.client_id AND tm.user_id = auth.uid()));
CREATE POLICY "quick_contacts_insert" ON public.quick_contacts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = quick_contacts.client_id AND (c.user_id = auth.uid() OR public.is_super_admin()))
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = quick_contacts.client_id AND tm.user_id = auth.uid()));
CREATE POLICY "quick_contacts_update" ON public.quick_contacts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = quick_contacts.client_id AND (c.user_id = auth.uid() OR public.is_super_admin()))
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = quick_contacts.client_id AND tm.user_id = auth.uid()));
CREATE POLICY "quick_contacts_delete" ON public.quick_contacts FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = quick_contacts.client_id AND (c.user_id = auth.uid() OR public.is_super_admin()))
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = quick_contacts.client_id AND tm.user_id = auth.uid()));
CREATE TRIGGER update_quick_contacts_updated_at BEFORE UPDATE ON public.quick_contacts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 133: social_militants + sentiment_corrections + comments cols + recompute trigger
CREATE TABLE public.social_militants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  platform_user_id TEXT NOT NULL,
  author_name TEXT, avatar_url TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_comments INTEGER NOT NULL DEFAULT 0,
  total_positive INTEGER NOT NULL DEFAULT 0,
  total_negative INTEGER NOT NULL DEFAULT 0,
  total_neutral INTEGER NOT NULL DEFAULT 0,
  total_30d_positive INTEGER NOT NULL DEFAULT 0,
  total_30d_negative INTEGER NOT NULL DEFAULT 0,
  current_badge TEXT, promoted_to_supporter_id UUID, notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, platform, platform_user_id)
);
CREATE INDEX idx_social_militants_client_platform ON public.social_militants (client_id, platform);
CREATE INDEX idx_social_militants_badge ON public.social_militants (client_id, platform, current_badge);
ALTER TABLE public.social_militants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owners view militants" ON public.social_militants FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR client_id IN (SELECT client_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE POLICY "Client owners update militants" ON public.social_militants FOR UPDATE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR client_id IN (SELECT client_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE POLICY "Client owners insert militants" ON public.social_militants FOR INSERT
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR client_id IN (SELECT client_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE POLICY "Client owners delete militants" ON public.social_militants FOR DELETE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR client_id IN (SELECT client_id FROM public.team_members WHERE user_id = auth.uid()));

CREATE TABLE public.sentiment_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  comment_id TEXT, comment_text TEXT NOT NULL,
  ai_predicted TEXT, human_corrected TEXT NOT NULL,
  corrected_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sentiment_corrections_client_recent ON public.sentiment_corrections (client_id, created_at DESC);
ALTER TABLE public.sentiment_corrections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owners view corrections" ON public.sentiment_corrections FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR client_id IN (SELECT client_id FROM public.team_members WHERE user_id = auth.uid()));
CREATE POLICY "Client owners insert corrections" ON public.sentiment_corrections FOR INSERT
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid())
    OR client_id IN (SELECT client_id FROM public.team_members WHERE user_id = auth.uid()));

ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS sentiment_source TEXT NOT NULL DEFAULT 'ai' CHECK (sentiment_source IN ('ai','human')),
  ADD COLUMN IF NOT EXISTS sentiment_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX idx_comments_needs_review ON public.comments (client_id, needs_review) WHERE needs_review = true;

CREATE OR REPLACE FUNCTION public.compute_militant_badge(
  p_total_pos INTEGER, p_total_neg INTEGER, p_total_comments INTEGER,
  p_30d_pos INTEGER, p_30d_neg INTEGER,
  p_first_seen TIMESTAMPTZ, p_last_seen TIMESTAMPTZ)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  IF p_total_neg >= 10 THEN RETURN 'hater'; END IF;
  IF p_30d_neg >= 3 THEN RETURN 'critico'; END IF;
  IF p_total_comments >= 3 AND p_last_seen < (now() - INTERVAL '60 days') THEN RETURN 'sumido'; END IF;
  IF p_total_pos >= 15 AND p_total_neg = 0 THEN RETURN 'elite'; END IF;
  IF p_30d_pos >= 5 THEN RETURN 'defensor'; END IF;
  IF p_total_comments >= 10 THEN RETURN 'engajado'; END IF;
  IF p_first_seen >= (now() - INTERVAL '7 days') THEN RETURN 'novo'; END IF;
  RETURN 'observador';
END; $$;

CREATE OR REPLACE FUNCTION public.recompute_militant(
  p_client_id UUID, p_platform TEXT, p_platform_user_id TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_total_pos INTEGER := 0; v_total_neg INTEGER := 0; v_total_neu INTEGER := 0;
  v_total_all INTEGER := 0; v_30d_pos INTEGER := 0; v_30d_neg INTEGER := 0;
  v_first TIMESTAMPTZ; v_last TIMESTAMPTZ; v_name TEXT; v_avatar TEXT; v_badge TEXT;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE sentiment::text = 'positive'),
    COUNT(*) FILTER (WHERE sentiment::text = 'negative'),
    COUNT(*) FILTER (WHERE sentiment::text = 'neutral'),
    COUNT(*),
    COUNT(*) FILTER (WHERE sentiment::text = 'positive' AND COALESCE(comment_created_time, created_at) >= (now() - INTERVAL '30 days')),
    COUNT(*) FILTER (WHERE sentiment::text = 'negative' AND COALESCE(comment_created_time, created_at) >= (now() - INTERVAL '30 days')),
    MIN(COALESCE(comment_created_time, created_at)),
    MAX(COALESCE(comment_created_time, created_at)),
    (array_agg(author_name ORDER BY created_at DESC) FILTER (WHERE author_name IS NOT NULL))[1],
    (array_agg(author_profile_picture ORDER BY created_at DESC) FILTER (WHERE author_profile_picture IS NOT NULL))[1]
  INTO v_total_pos, v_total_neg, v_total_neu, v_total_all, v_30d_pos, v_30d_neg, v_first, v_last, v_name, v_avatar
  FROM public.comments
  WHERE client_id = p_client_id AND platform = p_platform AND platform_user_id = p_platform_user_id
    AND is_page_owner = false AND text <> '__post_stub__';
  IF v_total_all = 0 THEN RETURN; END IF;
  v_badge := public.compute_militant_badge(v_total_pos, v_total_neg, v_total_all, v_30d_pos, v_30d_neg, v_first, v_last);
  INSERT INTO public.social_militants (client_id, platform, platform_user_id, author_name, avatar_url,
    first_seen_at, last_seen_at, total_comments, total_positive, total_negative, total_neutral,
    total_30d_positive, total_30d_negative, current_badge, updated_at)
  VALUES (p_client_id, p_platform, p_platform_user_id, v_name, v_avatar,
    v_first, v_last, v_total_all, v_total_pos, v_total_neg, v_total_neu,
    v_30d_pos, v_30d_neg, v_badge, now())
  ON CONFLICT (client_id, platform, platform_user_id) DO UPDATE SET
    author_name = COALESCE(EXCLUDED.author_name, social_militants.author_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, social_militants.avatar_url),
    first_seen_at = LEAST(social_militants.first_seen_at, EXCLUDED.first_seen_at),
    last_seen_at = GREATEST(social_militants.last_seen_at, EXCLUDED.last_seen_at),
    total_comments = EXCLUDED.total_comments,
    total_positive = EXCLUDED.total_positive,
    total_negative = EXCLUDED.total_negative,
    total_neutral = EXCLUDED.total_neutral,
    total_30d_positive = EXCLUDED.total_30d_positive,
    total_30d_negative = EXCLUDED.total_30d_negative,
    current_badge = EXCLUDED.current_badge,
    updated_at = now();
END; $$;

CREATE OR REPLACE FUNCTION public.trg_militant_on_comment_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_page_owner = true THEN RETURN NEW; END IF;
  IF NEW.platform_user_id IS NULL OR NEW.platform_user_id = '' THEN RETURN NEW; END IF;
  IF NEW.text = '__post_stub__' THEN RETURN NEW; END IF;
  IF NEW.platform NOT IN ('facebook','instagram') THEN RETURN NEW; END IF;
  PERFORM public.recompute_militant(NEW.client_id, NEW.platform, NEW.platform_user_id);
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_militant_upsert_on_comment AFTER INSERT ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_militant_on_comment_insert();

CREATE OR REPLACE FUNCTION public.trg_militant_on_sentiment_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_page_owner = true THEN RETURN NEW; END IF;
  IF NEW.platform_user_id IS NULL OR NEW.platform_user_id = '' THEN RETURN NEW; END IF;
  IF NEW.platform NOT IN ('facebook','instagram') THEN RETURN NEW; END IF;
  IF OLD.sentiment IS DISTINCT FROM NEW.sentiment THEN
    PERFORM public.recompute_militant(NEW.client_id, NEW.platform, NEW.platform_user_id);
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_militant_recompute_on_sentiment AFTER UPDATE OF sentiment ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_militant_on_sentiment_change();

CREATE OR REPLACE FUNCTION public.trg_protect_and_log_sentiment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.sentiment_source = 'human' AND NEW.sentiment_source = 'ai'
     AND NEW.sentiment IS DISTINCT FROM OLD.sentiment THEN
    NEW.sentiment := OLD.sentiment;
    NEW.sentiment_source := 'human';
    NEW.sentiment_confidence := OLD.sentiment_confidence;
    NEW.needs_review := false;
  END IF;
  IF NEW.sentiment_source = 'human' AND NEW.sentiment IS DISTINCT FROM OLD.sentiment
     AND NEW.text IS NOT NULL AND NEW.text <> '__post_stub__' THEN
    NEW.needs_review := false;
    INSERT INTO public.sentiment_corrections (client_id, comment_id, comment_text, ai_predicted, human_corrected, corrected_by)
    VALUES (NEW.client_id, NEW.comment_id, NEW.text, OLD.sentiment::text, NEW.sentiment::text, auth.uid());
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER trg_protect_human_sentiment BEFORE UPDATE OF sentiment, sentiment_source ON public.comments
  FOR EACH ROW EXECUTE FUNCTION public.trg_protect_and_log_sentiment();

CREATE TRIGGER trg_social_militants_updated_at BEFORE UPDATE ON public.social_militants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();