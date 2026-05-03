-- 134: content_dna + content_ideas + content_radar_snapshots
CREATE TABLE public.content_dna (
  client_id UUID PRIMARY KEY REFERENCES public.clients(id) ON DELETE CASCADE,
  tom TEXT, vocabulario TEXT[],
  estruturas JSONB DEFAULT '{}'::jsonb,
  emojis_assinatura TEXT[],
  tamanho_ideal JSONB DEFAULT '{}'::jsonb,
  horarios_pico JSONB DEFAULT '{}'::jsonb,
  sample_size INT DEFAULT 0,
  auto_apply BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.content_dna ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_dna client members select" ON public.content_dna FOR SELECT
  USING (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = content_dna.client_id AND tm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = content_dna.client_id AND c.user_id = auth.uid()));
CREATE POLICY "content_dna client members write" ON public.content_dna FOR ALL
  USING (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = content_dna.client_id AND tm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = content_dna.client_id AND c.user_id = auth.uid()))
  WITH CHECK (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = content_dna.client_id AND tm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = content_dna.client_id AND c.user_id = auth.uid()));
CREATE TRIGGER trg_content_dna_updated_at BEFORE UPDATE ON public.content_dna
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.content_ideas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL, descricao TEXT,
  tema TEXT, tipo TEXT, origem TEXT,
  score INT NOT NULL DEFAULT 50,
  status TEXT NOT NULL DEFAULT 'pendente',
  source_refs JSONB DEFAULT '{}'::jsonb,
  generated_text JSONB, projection JSONB,
  user_feedback TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_content_ideas_client_status ON public.content_ideas(client_id, status, created_at DESC);
ALTER TABLE public.content_ideas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_ideas_all" ON public.content_ideas FOR ALL
  USING (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = content_ideas.client_id AND tm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = content_ideas.client_id AND c.user_id = auth.uid()))
  WITH CHECK (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = content_ideas.client_id AND tm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = content_ideas.client_id AND c.user_id = auth.uid()));
CREATE TRIGGER trg_content_ideas_updated_at BEFORE UPDATE ON public.content_ideas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.content_radar_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  hot_topics JSONB DEFAULT '[]'::jsonb,
  open_questions JSONB DEFAULT '[]'::jsonb,
  hostile_narratives JSONB DEFAULT '[]'::jsonb,
  mobilizing_pautas JSONB DEFAULT '[]'::jsonb,
  crisis_alerts jsonb DEFAULT '[]'::jsonb,
  defender_pulse jsonb DEFAULT '[]'::jsonb,
  calendar_hooks jsonb DEFAULT '[]'::jsonb,
  base_signals jsonb DEFAULT '[]'::jsonb,
  meta jsonb DEFAULT '{}'::jsonb,
  total_signals integer DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, snapshot_date)
);
CREATE INDEX idx_content_radar_client_date ON public.content_radar_snapshots(client_id, snapshot_date DESC);
ALTER TABLE public.content_radar_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "content_radar_all" ON public.content_radar_snapshots FOR ALL
  USING (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = content_radar_snapshots.client_id AND tm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = content_radar_snapshots.client_id AND c.user_id = auth.uid()))
  WITH CHECK (public.is_super_admin()
    OR EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = content_radar_snapshots.client_id AND tm.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.clients c WHERE c.id = content_radar_snapshots.client_id AND c.user_id = auth.uid()));

-- 137: ic_transcriptions
CREATE TABLE public.ic_transcriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  user_id UUID,
  filename TEXT NOT NULL,
  duration_sec NUMERIC, language TEXT, model TEXT,
  full_text TEXT,
  segments JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ic_transcriptions_client ON public.ic_transcriptions(client_id, created_at DESC);
ALTER TABLE public.ic_transcriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ic_transcriptions_owner_all" ON public.ic_transcriptions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = ic_transcriptions.client_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients c WHERE c.id = ic_transcriptions.client_id AND c.user_id = auth.uid()));
CREATE POLICY "ic_transcriptions_team_all" ON public.ic_transcriptions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = ic_transcriptions.client_id AND tm.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = ic_transcriptions.client_id AND tm.user_id = auth.uid()));
CREATE TRIGGER trg_ic_transcriptions_updated BEFORE UPDATE ON public.ic_transcriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 138: candidate_knowledge + disparo_sugestoes
CREATE TABLE public.candidate_knowledge (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('transcription','post','comment','manual')),
  source_id text, source_url text, source_date timestamptz,
  tipo text NOT NULL CHECK (tipo IN ('promessa','proposta','bandeira','bairro','pessoa','adversario','historia','bordao','numero','evento','dado','outro')),
  tema text, texto text NOT NULL, contexto text,
  entidades jsonb DEFAULT '{}'::jsonb,
  confidence numeric DEFAULT 0.7,
  aprovado boolean NOT NULL DEFAULT true,
  extraction_run_id UUID, provider TEXT, model TEXT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ck_client ON public.candidate_knowledge(client_id);
CREATE INDEX idx_ck_tipo ON public.candidate_knowledge(client_id, tipo);
CREATE INDEX idx_ck_tema ON public.candidate_knowledge(client_id, tema);
CREATE INDEX idx_ck_source ON public.candidate_knowledge(source_type, source_id);
CREATE INDEX idx_ck_entidades ON public.candidate_knowledge USING gin(entidades);
CREATE INDEX idx_ck_extraction_run ON public.candidate_knowledge(client_id, extraction_run_id);
CREATE UNIQUE INDEX uq_ck_dedup ON public.candidate_knowledge(client_id, source_type, COALESCE(source_id,''), tipo, lower(texto));
ALTER TABLE public.candidate_knowledge ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ck_view" ON public.candidate_knowledge FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "ck_manage" ON public.candidate_knowledge FOR ALL
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) OR public.is_super_admin())
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "ck_team_view" ON public.candidate_knowledge FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = candidate_knowledge.client_id
    AND tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE TRIGGER trg_ck_updated_at BEFORE UPDATE ON public.candidate_knowledge
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.disparo_sugestoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('territorial','pessoal','tematico','ativacao','aniversario_visita')),
  titulo text NOT NULL,
  bairro text, cidade text, tema text,
  pessoa_alvo_nome text,
  mensagem_sugerida text NOT NULL,
  total_estimado integer DEFAULT 0,
  destinatarios_filtro jsonb DEFAULT '{}'::jsonb,
  fonte_knowledge_id uuid REFERENCES public.candidate_knowledge(id) ON DELETE SET NULL,
  fonte_url text,
  score integer DEFAULT 50,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovado','descartado','enviado','expirado')),
  whatsapp_dispatch_id uuid,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_ds_client_status ON public.disparo_sugestoes(client_id, status);
CREATE INDEX idx_ds_score ON public.disparo_sugestoes(client_id, score DESC);
ALTER TABLE public.disparo_sugestoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ds_view" ON public.disparo_sugestoes FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "ds_manage" ON public.disparo_sugestoes FOR ALL
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) OR public.is_super_admin())
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) OR public.is_super_admin());
CREATE TRIGGER trg_ds_updated_at BEFORE UPDATE ON public.disparo_sugestoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.count_pessoas_by_bairro(p_client_id uuid, p_bairro text, p_only_whatsapp boolean DEFAULT true)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COUNT(*)::int FROM public.pessoas p
  WHERE p.client_id = p_client_id
    AND p.telefone IS NOT NULL
    AND length(public.only_digits(p.telefone)) >= 10
    AND (NOT p_only_whatsapp OR p.whatsapp_confirmado = true)
    AND (lower(public.unaccent(COALESCE(p.bairro,''))) = lower(public.unaccent(p_bairro))
      OR lower(public.unaccent(COALESCE(p.bairro,''))) ILIKE '%' || lower(public.unaccent(p_bairro)) || '%');
$$;

-- 139: materias_geradas + coringa
CREATE TABLE public.materias_geradas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  user_id UUID,
  tipo TEXT NOT NULL DEFAULT 'press_release',
  titulo TEXT NOT NULL, subtitulo TEXT, corpo TEXT NOT NULL,
  tom TEXT, tema TEXT,
  fontes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'rascunho',
  prompt_input TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  transcription_id uuid REFERENCES public.ic_transcriptions(id) ON DELETE SET NULL,
  versao INTEGER NOT NULL DEFAULT 1,
  provider TEXT, model TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_materias_geradas_client ON public.materias_geradas(client_id, created_at DESC);
CREATE INDEX idx_materias_geradas_transcription ON public.materias_geradas(transcription_id);
ALTER TABLE public.materias_geradas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their client materias" ON public.materias_geradas FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) OR is_super_admin());
CREATE POLICY "Users can manage their client materias" ON public.materias_geradas FOR ALL
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) OR is_super_admin())
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) OR is_super_admin());
CREATE POLICY "Team members materias" ON public.materias_geradas FOR ALL
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = materias_geradas.client_id AND tm.user_id = auth.uid() AND tm.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = materias_geradas.client_id AND tm.user_id = auth.uid() AND tm.status = 'active'));
CREATE TRIGGER update_materias_geradas_updated_at BEFORE UPDATE ON public.materias_geradas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.coringa_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  user_id UUID NOT NULL,
  titulo TEXT,
  contexto JSONB NOT NULL DEFAULT '{}'::jsonb,
  ultima_mensagem_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coringa_conversations_user ON public.coringa_conversations(client_id, user_id, updated_at DESC);
ALTER TABLE public.coringa_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User views own coringa conversations" ON public.coringa_conversations FOR SELECT
  USING (auth.uid() = user_id OR is_super_admin());
CREATE POLICY "User creates own coringa conversations" ON public.coringa_conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "User updates own coringa conversations" ON public.coringa_conversations FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "User deletes own coringa conversations" ON public.coringa_conversations FOR DELETE
  USING (auth.uid() = user_id);
CREATE TRIGGER update_coringa_conversations_updated_at BEFORE UPDATE ON public.coringa_conversations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.coringa_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.coringa_conversations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT,
  tool_calls JSONB,
  tool_call_id TEXT, tool_name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_coringa_messages_conv ON public.coringa_messages(conversation_id, created_at);
ALTER TABLE public.coringa_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "User views messages of own conversations" ON public.coringa_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.coringa_conversations c WHERE c.id = conversation_id AND (c.user_id = auth.uid() OR is_super_admin())));
CREATE POLICY "User inserts messages in own conversations" ON public.coringa_messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.coringa_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid()));
CREATE POLICY "Service role manages messages" ON public.coringa_messages FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- 142: materias_versions
CREATE TABLE public.materias_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  materia_id UUID NOT NULL REFERENCES public.materias_geradas(id) ON DELETE CASCADE,
  client_id UUID NOT NULL,
  versao INTEGER NOT NULL,
  provider TEXT, model TEXT,
  titulo TEXT NOT NULL, subtitulo TEXT, corpo TEXT NOT NULL,
  fontes JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_input TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_materias_versions_materia ON public.materias_versions(materia_id, versao DESC);
CREATE INDEX idx_materias_versions_client ON public.materias_versions(client_id, created_at DESC);
ALTER TABLE public.materias_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view their client materia versions" ON public.materias_versions FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "Users manage their client materia versions" ON public.materias_versions FOR ALL
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) OR public.is_super_admin())
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()) OR public.is_super_admin());
CREATE POLICY "Team members materia versions" ON public.materias_versions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = materias_versions.client_id AND tm.user_id = auth.uid() AND tm.status = 'active'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.team_members tm WHERE tm.client_id = materias_versions.client_id AND tm.user_id = auth.uid() AND tm.status = 'active'));