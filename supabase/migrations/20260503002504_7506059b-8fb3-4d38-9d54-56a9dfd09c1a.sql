-- Pre-req: team_members + team_supporter_assignments (criadas antes pois várias migrations referenciam)
CREATE TABLE public.team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  status TEXT NOT NULL DEFAULT 'active',
  permissions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, client_id)
);
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner manage team_members" ON public.team_members FOR ALL
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = team_members.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Member can view own team_member" ON public.team_members FOR SELECT
  USING (user_id = auth.uid());
CREATE TRIGGER update_team_members_updated_at BEFORE UPDATE ON public.team_members
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.team_supporter_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_member_id UUID NOT NULL REFERENCES public.team_members(id) ON DELETE CASCADE,
  supporter_id UUID NOT NULL REFERENCES public.supporters(id) ON DELETE CASCADE,
  assigned_by UUID,
  assigned_at TIMESTAMPTZ DEFAULT now(),
  notes TEXT,
  UNIQUE(team_member_id, supporter_id)
);
ALTER TABLE public.team_supporter_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner manage assignments" ON public.team_supporter_assignments FOR ALL
  USING (EXISTS (SELECT 1 FROM team_members tm JOIN clients c ON c.id = tm.client_id
    WHERE tm.id = team_supporter_assignments.team_member_id AND c.user_id = auth.uid()));

-- Migration 34: pessoas + enums
CREATE TYPE public.tipo_pessoa AS ENUM ('eleitor','apoiador','lideranca','jornalista','influenciador','voluntario','adversario','cidadao');
CREATE TYPE public.nivel_apoio AS ENUM ('desconhecido','simpatizante','apoiador','militante','opositor');
CREATE TYPE public.origem_contato AS ENUM ('rede_social','formulario','evento','importacao','manual');

CREATE TABLE public.pessoas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome TEXT NOT NULL, email TEXT, telefone TEXT, cidade TEXT, bairro TEXT, endereco TEXT,
  data_nascimento DATE,
  tipo_pessoa public.tipo_pessoa NOT NULL DEFAULT 'cidadao',
  nivel_apoio public.nivel_apoio NOT NULL DEFAULT 'desconhecido',
  origem_contato public.origem_contato NOT NULL DEFAULT 'manual',
  tags TEXT[] DEFAULT '{}',
  notas_internas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.pessoa_social (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id UUID NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  plataforma TEXT NOT NULL CHECK (plataforma IN ('facebook','instagram','twitter','tiktok','youtube')),
  usuario TEXT, url_perfil TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER update_pessoas_updated_at BEFORE UPDATE ON public.pessoas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.pessoas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can select pessoas" ON public.pessoas FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = pessoas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert pessoas" ON public.pessoas FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = pessoas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can update pessoas" ON public.pessoas FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = pessoas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can delete pessoas" ON public.pessoas FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = pessoas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can select pessoas" ON public.pessoas FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = pessoas.client_id AND tm.user_id = auth.uid()));

ALTER TABLE public.pessoa_social ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can select pessoa_social" ON public.pessoa_social FOR SELECT
  USING (EXISTS (SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id WHERE p.id = pessoa_social.pessoa_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can insert pessoa_social" ON public.pessoa_social FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id WHERE p.id = pessoa_social.pessoa_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can update pessoa_social" ON public.pessoa_social FOR UPDATE
  USING (EXISTS (SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id WHERE p.id = pessoa_social.pessoa_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can delete pessoa_social" ON public.pessoa_social FOR DELETE
  USING (EXISTS (SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id WHERE p.id = pessoa_social.pessoa_id AND c.user_id = auth.uid()));
CREATE POLICY "Team members can select pessoa_social" ON public.pessoa_social FOR SELECT
  USING (EXISTS (SELECT 1 FROM pessoas p JOIN team_members tm ON tm.client_id = p.client_id WHERE p.id = pessoa_social.pessoa_id AND tm.user_id = auth.uid()));

-- 35: whatsapp_oficial
ALTER TABLE public.clients ADD COLUMN whatsapp_oficial text DEFAULT NULL;

-- 36-38: public registration policies
CREATE POLICY "Public can insert pessoas via registration form" ON public.pessoas FOR INSERT TO anon, authenticated
  WITH CHECK (origem_contato = 'formulario' AND EXISTS (SELECT 1 FROM clients WHERE clients.id = pessoas.client_id));
CREATE POLICY "Public can read basic client info" ON public.clients FOR SELECT TO anon USING (true);
CREATE POLICY "Public can insert pessoa_social via registration" ON public.pessoa_social FOR INSERT TO anon, authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id WHERE p.id = pessoa_social.pessoa_id));

-- 39-40: register_pessoa_public + supporter_id
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS supporter_id uuid REFERENCES public.supporters(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.register_pessoa_public(
  p_client_id uuid, p_nome text, p_telefone text,
  p_email text DEFAULT NULL, p_cidade text DEFAULT NULL, p_bairro text DEFAULT NULL,
  p_endereco text DEFAULT NULL, p_tipo_pessoa tipo_pessoa DEFAULT 'cidadao',
  p_notas text DEFAULT NULL, p_socials jsonb DEFAULT '[]'::jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pessoa_id uuid; v_supporter_id uuid; v_social jsonb; v_has_socials boolean;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM clients WHERE id = p_client_id) THEN RAISE EXCEPTION 'Client not found'; END IF;
  v_has_socials := (jsonb_array_length(p_socials) > 0);
  IF v_has_socials THEN
    INSERT INTO supporters (client_id, name, classification, first_contact_date, engagement_score)
    VALUES (p_client_id, p_nome, 'neutro', NOW(), 0) RETURNING id INTO v_supporter_id;
    FOR v_social IN SELECT * FROM jsonb_array_elements(p_socials) LOOP
      INSERT INTO supporter_profiles (supporter_id, platform, platform_user_id, platform_username)
      VALUES (v_supporter_id, v_social->>'plataforma', v_social->>'usuario', v_social->>'usuario');
    END LOOP;
  END IF;
  INSERT INTO pessoas (client_id, nome, telefone, email, cidade, bairro, endereco,
    tipo_pessoa, nivel_apoio, origem_contato, notas_internas, supporter_id)
  VALUES (p_client_id, p_nome, p_telefone, p_email, p_cidade, p_bairro, p_endereco,
    p_tipo_pessoa, 'simpatizante', 'formulario', p_notas, v_supporter_id)
  RETURNING id INTO v_pessoa_id;
  FOR v_social IN SELECT * FROM jsonb_array_elements(p_socials) LOOP
    INSERT INTO pessoa_social (pessoa_id, plataforma, usuario, url_perfil)
    VALUES (v_pessoa_id, v_social->>'plataforma', v_social->>'usuario', v_social->>'url_perfil');
  END LOOP;
  RETURN v_pessoa_id;
END; $$;

-- 41: ensure_pessoa_supporter trigger
CREATE OR REPLACE FUNCTION public.ensure_pessoa_supporter()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pessoa RECORD; v_supporter_id uuid;
BEGIN
  SELECT * INTO v_pessoa FROM pessoas WHERE id = NEW.pessoa_id;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF v_pessoa.supporter_id IS NOT NULL THEN
    INSERT INTO supporter_profiles (supporter_id, platform, platform_user_id, platform_username)
    VALUES (v_pessoa.supporter_id, NEW.plataforma, COALESCE(NEW.usuario, ''), NEW.usuario)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;
  INSERT INTO supporters (client_id, name, classification, first_contact_date, engagement_score)
  VALUES (v_pessoa.client_id, v_pessoa.nome, 'neutro', NOW(), 0) RETURNING id INTO v_supporter_id;
  UPDATE pessoas SET supporter_id = v_supporter_id WHERE id = NEW.pessoa_id;
  INSERT INTO supporter_profiles (supporter_id, platform, platform_user_id, platform_username)
  VALUES (v_supporter_id, NEW.plataforma, COALESCE(NEW.usuario, ''), NEW.usuario);
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_ensure_pessoa_supporter AFTER INSERT ON pessoa_social
  FOR EACH ROW EXECUTE FUNCTION ensure_pessoa_supporter();

-- 42: whatsapp_confirmado
ALTER TABLE public.pessoas ADD COLUMN whatsapp_confirmado boolean NOT NULL DEFAULT false;

-- 43: interacoes_pessoa
CREATE TABLE public.interacoes_pessoa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  tipo_interacao text NOT NULL,
  descricao text NOT NULL,
  criado_por uuid NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.interacoes_pessoa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can select interacoes" ON public.interacoes_pessoa FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = interacoes_pessoa.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert interacoes" ON public.interacoes_pessoa FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = interacoes_pessoa.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can delete interacoes" ON public.interacoes_pessoa FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = interacoes_pessoa.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can select interacoes" ON public.interacoes_pessoa FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = interacoes_pessoa.client_id AND tm.user_id = auth.uid()));
CREATE POLICY "Team members can insert interacoes" ON public.interacoes_pessoa FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = interacoes_pessoa.client_id AND tm.user_id = auth.uid()));

-- 44-45: status_lead + classificacao_politica
ALTER TABLE public.pessoas ADD COLUMN status_lead text NOT NULL DEFAULT 'novo';
ALTER TABLE public.pessoas ADD COLUMN classificacao_politica text NOT NULL DEFAULT 'indefinido';

-- 46: timeline_pessoa
CREATE TABLE public.timeline_pessoa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  tipo_evento text NOT NULL, titulo text NOT NULL, descricao text,
  criado_por uuid NOT NULL, criado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.timeline_pessoa ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can select timeline" ON public.timeline_pessoa FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = timeline_pessoa.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert timeline" ON public.timeline_pessoa FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = timeline_pessoa.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can delete timeline" ON public.timeline_pessoa FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = timeline_pessoa.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can select timeline" ON public.timeline_pessoa FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = timeline_pessoa.client_id AND tm.user_id = auth.uid()));
CREATE POLICY "Team members can insert timeline" ON public.timeline_pessoa FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = timeline_pessoa.client_id AND tm.user_id = auth.uid()));
CREATE INDEX idx_timeline_pessoa_pessoa_id ON public.timeline_pessoa(pessoa_id);
CREATE INDEX idx_timeline_pessoa_criado_em ON public.timeline_pessoa(criado_em DESC);

-- 47: tags + pessoas_tags
CREATE TABLE public.tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  nome text NOT NULL, descricao text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id, nome)
);
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can select tags" ON public.tags FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = tags.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert tags" ON public.tags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = tags.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can delete tags" ON public.tags FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = tags.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can select tags" ON public.tags FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = tags.client_id AND tm.user_id = auth.uid()));
CREATE POLICY "Team members can insert tags" ON public.tags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = tags.client_id AND tm.user_id = auth.uid()));

CREATE TABLE public.pessoas_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE(pessoa_id, tag_id)
);
ALTER TABLE public.pessoas_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can select pessoas_tags" ON public.pessoas_tags FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id WHERE p.id = pessoas_tags.pessoa_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can insert pessoas_tags" ON public.pessoas_tags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id WHERE p.id = pessoas_tags.pessoa_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can delete pessoas_tags" ON public.pessoas_tags FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM pessoas p JOIN clients c ON c.id = p.client_id WHERE p.id = pessoas_tags.pessoa_id AND c.user_id = auth.uid()));
CREATE POLICY "Team members can select pessoas_tags" ON public.pessoas_tags FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM pessoas p JOIN team_members tm ON tm.client_id = p.client_id WHERE p.id = pessoas_tags.pessoa_id AND tm.user_id = auth.uid()));
CREATE POLICY "Team members can insert pessoas_tags" ON public.pessoas_tags FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM pessoas p JOIN team_members tm ON tm.client_id = p.client_id WHERE p.id = pessoas_tags.pessoa_id AND tm.user_id = auth.uid()));
CREATE INDEX idx_pessoas_tags_pessoa_id ON public.pessoas_tags(pessoa_id);
CREATE INDEX idx_pessoas_tags_tag_id ON public.pessoas_tags(tag_id);
CREATE INDEX idx_tags_client_id ON public.tags(client_id);

-- 48: campanhas + tarefas
CREATE TABLE public.campanhas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL, descricao TEXT,
  data_inicio DATE NOT NULL DEFAULT CURRENT_DATE, data_fim DATE,
  status TEXT NOT NULL DEFAULT 'planejamento',
  meta_principal TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.campanha_tarefas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id UUID NOT NULL REFERENCES public.campanhas(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL, descricao TEXT,
  responsavel_id UUID REFERENCES public.team_members(id) ON DELETE SET NULL,
  prazo DATE,
  status TEXT NOT NULL DEFAULT 'pendente',
  prioridade TEXT NOT NULL DEFAULT 'media',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.campanhas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campanha_tarefas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can select campanhas" ON public.campanhas FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanhas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert campanhas" ON public.campanhas FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanhas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can update campanhas" ON public.campanhas FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanhas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can delete campanhas" ON public.campanhas FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanhas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can select campanhas" ON public.campanhas FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = campanhas.client_id AND tm.user_id = auth.uid()));

CREATE POLICY "Client owner can select campanha_tarefas" ON public.campanha_tarefas FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert campanha_tarefas" ON public.campanha_tarefas FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can update campanha_tarefas" ON public.campanha_tarefas FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can delete campanha_tarefas" ON public.campanha_tarefas FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can select campanha_tarefas" ON public.campanha_tarefas FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = campanha_tarefas.client_id AND tm.user_id = auth.uid()));

CREATE TRIGGER update_campanhas_updated_at BEFORE UPDATE ON public.campanhas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_campanha_tarefas_updated_at BEFORE UPDATE ON public.campanha_tarefas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 49: campanha_tarefa_items
CREATE TABLE public.campanha_tarefa_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tarefa_id UUID NOT NULL REFERENCES public.campanha_tarefas(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL, concluido BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.campanha_tarefa_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can select tarefa_items" ON public.campanha_tarefa_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefa_items.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert tarefa_items" ON public.campanha_tarefa_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefa_items.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can update tarefa_items" ON public.campanha_tarefa_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefa_items.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can delete tarefa_items" ON public.campanha_tarefa_items FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = campanha_tarefa_items.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can select tarefa_items" ON public.campanha_tarefa_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = campanha_tarefa_items.client_id AND tm.user_id = auth.uid()));

-- 50: alertas
CREATE TABLE public.alertas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL, severidade TEXT NOT NULL DEFAULT 'media',
  titulo TEXT NOT NULL, descricao TEXT, dados JSON,
  lido BOOLEAN NOT NULL DEFAULT false,
  descartado BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_alertas_client_created ON public.alertas (client_id, created_at DESC);
CREATE INDEX idx_alertas_client_lido ON public.alertas (client_id, lido) WHERE descartado = false;
ALTER TABLE public.alertas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can select alertas" ON public.alertas FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = alertas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert alertas" ON public.alertas FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = alertas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can update alertas" ON public.alertas FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = alertas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can delete alertas" ON public.alertas FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = alertas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can select alertas" ON public.alertas FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = alertas.client_id AND tm.user_id = auth.uid()));

-- 52: contratados + missao_dispatches + items
CREATE TABLE public.contratados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  lider_id uuid,
  nome text NOT NULL, telefone text NOT NULL, email text,
  endereco text, cidade text, bairro text, zona_eleitoral text,
  redes_sociais jsonb DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ativo',
  contrato_aceito boolean NOT NULL DEFAULT false,
  contrato_aceito_em timestamptz,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contratado_missao_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  mission_id uuid REFERENCES public.portal_missions(id) ON DELETE SET NULL,
  titulo text NOT NULL, mensagem_template text NOT NULL,
  link_missao text, status text NOT NULL DEFAULT 'pendente',
  total_destinatarios integer NOT NULL DEFAULT 0,
  enviados integer NOT NULL DEFAULT 0,
  falhas integer NOT NULL DEFAULT 0,
  batch_size integer NOT NULL DEFAULT 10,
  delay_min_seconds integer NOT NULL DEFAULT 30,
  delay_max_seconds integer NOT NULL DEFAULT 90,
  batch_pause_seconds integer NOT NULL DEFAULT 300,
  started_at timestamptz, completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contratado_missao_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.contratado_missao_dispatches(id) ON DELETE CASCADE,
  contratado_id uuid NOT NULL REFERENCES public.contratados(id) ON DELETE CASCADE,
  contratado_nome text NOT NULL, telefone text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  enviado_em timestamptz, erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contratados ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratado_missao_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratado_missao_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can select contratados" ON public.contratados FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratados.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert contratados" ON public.contratados FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratados.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can update contratados" ON public.contratados FOR UPDATE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratados.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can delete contratados" ON public.contratados FOR DELETE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratados.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Public can register contratado" ON public.contratados FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratados.client_id));
CREATE POLICY "Team members can select contratados" ON public.contratados FOR SELECT USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = contratados.client_id AND tm.user_id = auth.uid()));

CREATE POLICY "Client owner can select dispatches_c" ON public.contratado_missao_dispatches FOR SELECT USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratado_missao_dispatches.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert dispatches_c" ON public.contratado_missao_dispatches FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratado_missao_dispatches.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can update dispatches_c" ON public.contratado_missao_dispatches FOR UPDATE USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratado_missao_dispatches.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Client owner can select items_c" ON public.contratado_missao_items FOR SELECT USING (EXISTS (SELECT 1 FROM contratado_missao_dispatches d JOIN clients c ON c.id = d.client_id WHERE d.id = contratado_missao_items.dispatch_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can insert items_c" ON public.contratado_missao_items FOR INSERT WITH CHECK (EXISTS (SELECT 1 FROM contratado_missao_dispatches d JOIN clients c ON c.id = d.client_id WHERE d.id = contratado_missao_items.dispatch_id AND c.user_id = auth.uid()));
CREATE POLICY "Client owner can update items_c" ON public.contratado_missao_items FOR UPDATE USING (EXISTS (SELECT 1 FROM contratado_missao_dispatches d JOIN clients c ON c.id = d.client_id WHERE d.id = contratado_missao_items.dispatch_id AND c.user_id = auth.uid()));

-- 53: contratado quota + checkins + indicados
ALTER TABLE contratados ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE contratados ADD COLUMN quota_indicados integer NOT NULL DEFAULT 10;

CREATE TABLE contratado_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contratado_id uuid NOT NULL REFERENCES contratados(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  checkin_date date NOT NULL DEFAULT CURRENT_DATE,
  checkin_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(contratado_id, checkin_date)
);
ALTER TABLE contratado_checkins ENABLE ROW LEVEL SECURITY;

CREATE TABLE contratado_indicados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contratado_id uuid NOT NULL REFERENCES contratados(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  nome text NOT NULL, telefone text NOT NULL, endereco text, cidade text, bairro text,
  status text NOT NULL DEFAULT 'pendente',
  verified_at timestamptz, verified_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE contratado_indicados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Contratado can checkin" ON contratado_checkins FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM contratados WHERE id = contratado_checkins.contratado_id AND user_id = auth.uid()));
CREATE POLICY "Contratado can view own checkins" ON contratado_checkins FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM contratados WHERE id = contratado_checkins.contratado_id AND user_id = auth.uid()));
CREATE POLICY "Client owner can select checkins_co" ON contratado_checkins FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE id = contratado_checkins.client_id AND user_id = auth.uid()));
CREATE POLICY "Team members can select checkins_co" ON contratado_checkins FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = contratado_checkins.client_id AND tm.user_id = auth.uid()));

CREATE POLICY "Contratado can insert indicados" ON contratado_indicados FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM contratados WHERE id = contratado_indicados.contratado_id AND user_id = auth.uid()));
CREATE POLICY "Contratado can view own indicados" ON contratado_indicados FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM contratados WHERE id = contratado_indicados.contratado_id AND user_id = auth.uid()));
CREATE POLICY "Client owner can manage indicados" ON contratado_indicados FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE id = contratado_indicados.client_id AND user_id = auth.uid()));
CREATE POLICY "Team members can select indicados" ON contratado_indicados FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = contratado_indicados.client_id AND tm.user_id = auth.uid()));

-- 54+: contratado extras
CREATE POLICY "Contratado can view own record" ON public.contratados FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Contratado can view portal missions" ON public.portal_missions FOR SELECT
  USING (EXISTS (SELECT 1 FROM contratados WHERE contratados.client_id = portal_missions.client_id AND contratados.user_id = auth.uid()));
CREATE POLICY "Client owner can delete checkins_co" ON public.contratado_checkins FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = contratado_checkins.client_id AND clients.user_id = auth.uid()));

ALTER TABLE public.contratados ADD COLUMN IF NOT EXISTS secao_eleitoral text;

-- contract_templates
CREATE TABLE public.contract_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'liderado',
  titulo text NOT NULL, conteudo text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can manage contract_templates" ON public.contract_templates FOR ALL
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = contract_templates.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can view contract_templates" ON public.contract_templates FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = contract_templates.client_id AND tm.user_id = auth.uid()));

ALTER TABLE public.contratados ADD COLUMN whatsapp_confirmado boolean NOT NULL DEFAULT false;
CREATE POLICY "Contratado can update own whatsapp_confirmado" ON public.contratados FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- is_lider + self FK
ALTER TABLE public.contratados ADD COLUMN IF NOT EXISTS is_lider boolean NOT NULL DEFAULT false;
ALTER TABLE public.contratados ADD CONSTRAINT contratados_lider_id_fkey FOREIGN KEY (lider_id) REFERENCES public.contratados(id) ON DELETE SET NULL;

-- contratado_indicados telemarketing fields
ALTER TABLE public.contratado_indicados
  ADD COLUMN IF NOT EXISTS ligacao_status text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS vota_candidato text,
  ADD COLUMN IF NOT EXISTS candidato_alternativo text,
  ADD COLUMN IF NOT EXISTS operador_nome text,
  ADD COLUMN IF NOT EXISTS ligacao_em timestamptz;

CREATE POLICY "Public can read indicados for telemarketing" ON public.contratado_indicados FOR SELECT TO anon USING (true);
CREATE POLICY "Public can update indicados for telemarketing" ON public.contratado_indicados FOR UPDATE TO anon
  USING (true) WITH CHECK (ligacao_status IS NOT NULL AND operador_nome IS NOT NULL);

-- contratados telemarketing fields
ALTER TABLE public.contratados
  ADD COLUMN IF NOT EXISTS ligacao_status text DEFAULT 'pendente',
  ADD COLUMN IF NOT EXISTS vota_candidato text,
  ADD COLUMN IF NOT EXISTS candidato_alternativo text,
  ADD COLUMN IF NOT EXISTS operador_nome text,
  ADD COLUMN IF NOT EXISTS ligacao_em timestamptz;

CREATE POLICY "Public can read contratados for telemarketing" ON public.contratados FOR SELECT TO anon USING (true);
CREATE POLICY "Public can update contratados for telemarketing" ON public.contratados FOR UPDATE TO anon
  USING (true) WITH CHECK (ligacao_status IS NOT NULL AND operador_nome IS NOT NULL);

-- telemarketing_operadores
CREATE TABLE public.telemarketing_operadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  nome text NOT NULL, senha text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.telemarketing_operadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can manage operadores" ON public.telemarketing_operadores FOR ALL
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = telemarketing_operadores.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can select operadores" ON public.telemarketing_operadores FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = telemarketing_operadores.client_id AND tm.user_id = auth.uid()));
CREATE POLICY "Public can read operadores for login" ON public.telemarketing_operadores FOR SELECT USING (ativo = true);

-- new tipo_pessoa values
ALTER TYPE public.tipo_pessoa ADD VALUE IF NOT EXISTS 'contratado';
ALTER TYPE public.tipo_pessoa ADD VALUE IF NOT EXISTS 'liderado';
ALTER TYPE public.tipo_pessoa ADD VALUE IF NOT EXISTS 'indicado';
ALTER TYPE public.tipo_pessoa ADD VALUE IF NOT EXISTS 'lider';

-- pessoas extras
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS zona_eleitoral text;
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS secao_eleitoral text;
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS vota_candidato text;
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS candidato_alternativo text;
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS contratado_id uuid REFERENCES public.contratados(id);
ALTER TABLE public.pessoas ADD COLUMN IF NOT EXISTS lider_id uuid REFERENCES public.pessoas(id);

-- funcionarios
CREATE TABLE public.funcionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  user_id uuid,
  nome text NOT NULL, telefone text NOT NULL, email text,
  cidade text, bairro text, endereco text,
  redes_sociais jsonb DEFAULT '[]'::jsonb,
  referral_code text NOT NULL DEFAULT upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  referral_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ativo',
  supporter_id uuid REFERENCES public.supporters(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.funcionarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can manage funcionarios" ON public.funcionarios FOR ALL
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = funcionarios.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Funcionario can view own record" ON public.funcionarios FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Funcionario can update own record" ON public.funcionarios FOR UPDATE
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Team members can select funcionarios" ON public.funcionarios FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = funcionarios.client_id AND tm.user_id = auth.uid()));
CREATE POLICY "Public can read funcionarios for registration" ON public.funcionarios FOR SELECT USING (true);

CREATE TABLE public.funcionario_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  checkin_date date NOT NULL DEFAULT CURRENT_DATE,
  checkin_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(funcionario_id, checkin_date)
);
ALTER TABLE public.funcionario_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can select funcionario_checkins" ON public.funcionario_checkins FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = funcionario_checkins.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Funcionario can checkin" ON public.funcionario_checkins FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM funcionarios WHERE funcionarios.id = funcionario_checkins.funcionario_id AND funcionarios.user_id = auth.uid()));
CREATE POLICY "Funcionario can view own checkins" ON public.funcionario_checkins FOR SELECT
  USING (EXISTS (SELECT 1 FROM funcionarios WHERE funcionarios.id = funcionario_checkins.funcionario_id AND funcionarios.user_id = auth.uid()));
CREATE POLICY "Team members can select funcionario_checkins" ON public.funcionario_checkins FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = funcionario_checkins.client_id AND tm.user_id = auth.uid()));

CREATE TABLE public.funcionario_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id),
  pessoa_id uuid REFERENCES public.pessoas(id),
  supporter_account_id uuid REFERENCES public.supporter_accounts(id),
  referred_name text NOT NULL, referred_phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.funcionario_referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can manage funcionario_referrals" ON public.funcionario_referrals FOR ALL
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = funcionario_referrals.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Funcionario can view own referrals" ON public.funcionario_referrals FOR SELECT
  USING (EXISTS (SELECT 1 FROM funcionarios WHERE funcionarios.id = funcionario_referrals.funcionario_id AND funcionarios.user_id = auth.uid()));
CREATE POLICY "Public can insert funcionario_referrals" ON public.funcionario_referrals FOR INSERT WITH CHECK (true);

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'funcionario';

CREATE TRIGGER update_funcionarios_updated_at BEFORE UPDATE ON public.funcionarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- acoes_externas
CREATE TABLE public.acoes_externas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  titulo text NOT NULL, descricao text, local text,
  data_inicio timestamptz NOT NULL, data_fim timestamptz NOT NULL,
  meta_cadastros integer NOT NULL DEFAULT 0,
  tag_nome text NOT NULL,
  status text NOT NULL DEFAULT 'planejada',
  cadastros_coletados integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.acao_externa_funcionarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acao_id uuid NOT NULL REFERENCES public.acoes_externas(id) ON DELETE CASCADE,
  funcionario_id uuid NOT NULL REFERENCES public.funcionarios(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cadastros_coletados integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(acao_id, funcionario_id)
);

ALTER TABLE public.acoes_externas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acao_externa_funcionarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Client owner can manage acoes_externas" ON public.acoes_externas FOR ALL
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = acoes_externas.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can select acoes_externas" ON public.acoes_externas FOR SELECT
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = acoes_externas.client_id AND tm.user_id = auth.uid()));
CREATE POLICY "Funcionario can view assigned acoes" ON public.acoes_externas FOR SELECT
  USING (EXISTS (SELECT 1 FROM acao_externa_funcionarios aef JOIN funcionarios f ON f.id = aef.funcionario_id WHERE aef.acao_id = acoes_externas.id AND f.user_id = auth.uid()));

CREATE POLICY "Client owner can manage acao_externa_funcionarios" ON public.acao_externa_funcionarios FOR ALL
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = acao_externa_funcionarios.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Funcionario can view own assignments" ON public.acao_externa_funcionarios FOR SELECT
  USING (EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = acao_externa_funcionarios.funcionario_id AND f.user_id = auth.uid()));
CREATE POLICY "Funcionario can update own assignment" ON public.acao_externa_funcionarios FOR UPDATE
  USING (EXISTS (SELECT 1 FROM funcionarios f WHERE f.id = acao_externa_funcionarios.funcionario_id AND f.user_id = auth.uid()));

CREATE TRIGGER update_acoes_externas_updated_at BEFORE UPDATE ON public.acoes_externas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- tag_pessoa_acao_externa
CREATE POLICY "Funcionario can read tags" ON public.tags FOR SELECT
  USING (EXISTS (SELECT 1 FROM funcionarios f WHERE f.client_id = tags.client_id AND f.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.tag_pessoa_acao_externa(
  p_client_id uuid, p_pessoa_id uuid, p_tag_nome text, p_tag_descricao text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tag_id uuid;
BEGIN
  SELECT id INTO v_tag_id FROM tags WHERE client_id = p_client_id AND nome = p_tag_nome;
  IF v_tag_id IS NULL THEN
    INSERT INTO tags (client_id, nome, descricao) VALUES (p_client_id, p_tag_nome, p_tag_descricao) RETURNING id INTO v_tag_id;
  END IF;
  INSERT INTO pessoas_tags (pessoa_id, tag_id) VALUES (p_pessoa_id, v_tag_id) ON CONFLICT DO NOTHING;
END; $$;

-- platform_config + whatsapp infra
CREATE TABLE public.platform_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE, value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), updated_by uuid
);
ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Super admin full access" ON public.platform_config FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TABLE public.whatsapp_instances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  instance_name text NOT NULL, instance_token text,
  status text NOT NULL DEFAULT 'disconnected',
  phone_number text, qr_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);
ALTER TABLE public.whatsapp_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can manage own instance" ON public.whatsapp_instances FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_instances.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_instances.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Super admin can manage all instances" ON public.whatsapp_instances FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE TABLE public.whatsapp_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id),
  tipo text NOT NULL DEFAULT 'manual',
  titulo text NOT NULL, mensagem_template text NOT NULL,
  total_destinatarios integer NOT NULL DEFAULT 0,
  enviados integer NOT NULL DEFAULT 0,
  falhas integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  tag_filtro text,
  batch_size integer NOT NULL DEFAULT 10,
  delay_min_seconds integer NOT NULL DEFAULT 5,
  delay_max_seconds integer NOT NULL DEFAULT 15,
  batch_pause_seconds integer NOT NULL DEFAULT 60,
  started_at timestamptz, completed_at timestamptz, error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_dispatches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can manage dispatches" ON public.whatsapp_dispatches FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_dispatches.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_dispatches.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Team members can view dispatches_w" ON public.whatsapp_dispatches FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM team_members tm WHERE tm.client_id = whatsapp_dispatches.client_id AND tm.user_id = auth.uid()));

CREATE TABLE public.whatsapp_dispatch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id uuid NOT NULL REFERENCES public.whatsapp_dispatches(id) ON DELETE CASCADE,
  telefone text NOT NULL, nome text NOT NULL,
  status text NOT NULL DEFAULT 'pendente',
  enviado_em timestamptz, erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_dispatch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can manage dispatch items" ON public.whatsapp_dispatch_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM whatsapp_dispatches d JOIN clients c ON c.id = d.client_id WHERE d.id = whatsapp_dispatch_items.dispatch_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM whatsapp_dispatches d JOIN clients c ON c.id = d.client_id WHERE d.id = whatsapp_dispatch_items.dispatch_id AND c.user_id = auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_dispatches;

-- birthday
CREATE TABLE public.whatsapp_birthday_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  mensagem_template text NOT NULL DEFAULT 'Feliz aniversário, {nome}! 🎂🎉',
  image_url text,
  hora_envio time NOT NULL DEFAULT '08:00:00',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(client_id)
);
ALTER TABLE public.whatsapp_birthday_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can manage birthday config" ON public.whatsapp_birthday_config FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_birthday_config.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_birthday_config.client_id AND clients.user_id = auth.uid()));

CREATE TABLE public.whatsapp_birthday_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  pessoa_id uuid NOT NULL REFERENCES public.pessoas(id) ON DELETE CASCADE,
  pessoa_nome text NOT NULL, telefone text NOT NULL,
  status text NOT NULL DEFAULT 'enviado', erro text,
  enviado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_birthday_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can view birthday log" ON public.whatsapp_birthday_log FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_birthday_log.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Service can insert birthday log" ON public.whatsapp_birthday_log FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = whatsapp_birthday_log.client_id AND clients.user_id = auth.uid()));

INSERT INTO storage.buckets (id, name, public) VALUES ('birthday-images', 'birthday-images', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Client owners can upload birthday images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'birthday-images');
CREATE POLICY "Anyone can view birthday images" ON storage.objects FOR SELECT TO public USING (bucket_id = 'birthday-images');
CREATE POLICY "Client owners can delete birthday images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'birthday-images');