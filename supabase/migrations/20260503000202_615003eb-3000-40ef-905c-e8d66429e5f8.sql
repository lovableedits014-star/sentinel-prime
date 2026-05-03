-- ============================================================================
-- MIGRATION 1/156 — Sentinelle: Fundação (perfis, papéis, clientes, comentários)
-- Origem: 20251023010354_37570ec3-b14a-46c2-96cf-1d2dfe230d8d.sql
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums (tipos pré-definidos)
CREATE TYPE public.app_role AS ENUM ('admin', 'client');
CREATE TYPE public.sentiment_type AS ENUM ('positive', 'neutral', 'negative');
CREATE TYPE public.comment_status AS ENUM ('pending', 'responded', 'ignored');
CREATE TYPE public.llm_provider AS ENUM ('groq', 'openai', 'anthropic', 'gemini', 'mistral', 'cohere');

-- Tabela: profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Tabela: user_roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Função has_role (segurança definer pra evitar recursão em RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Admins can view all roles" ON public.user_roles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can view their own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Tabela: clients
CREATE TABLE public.clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  cargo TEXT,
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own clients" ON public.clients FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own clients" ON public.clients FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own clients" ON public.clients FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all clients" ON public.clients FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Tabela: integrations
CREATE TABLE public.integrations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  meta_access_token TEXT,
  meta_page_id TEXT,
  meta_instagram_id TEXT,
  meta_webhook_url TEXT,
  llm_provider llm_provider,
  llm_api_key TEXT,
  llm_model TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(client_id)
);
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own integrations" ON public.integrations FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = integrations.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can manage their own integrations" ON public.integrations FOR ALL
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = integrations.client_id AND clients.user_id = auth.uid()));

-- Tabela: comments
CREATE TABLE public.comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  comment_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  text TEXT NOT NULL,
  author_name TEXT,
  author_id TEXT,
  sentiment sentiment_type,
  status comment_status DEFAULT 'pending',
  ai_response TEXT,
  final_response TEXT,
  responded_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(comment_id, client_id)
);
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own comments" ON public.comments FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = comments.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can manage their own comments" ON public.comments FOR ALL
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = comments.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Admins can view all comments" ON public.comments FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Tabela: reactions
CREATE TABLE public.reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id UUID REFERENCES public.clients(id) ON DELETE CASCADE NOT NULL,
  post_id TEXT NOT NULL,
  reaction_type TEXT NOT NULL,
  user_name TEXT,
  user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own reactions" ON public.reactions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = reactions.client_id AND clients.user_id = auth.uid()));

-- Função: cria profile + role automaticamente quando alguém se cadastra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'client');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Função: atualiza updated_at automaticamente
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE PLPGSQL AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_clients_updated_at BEFORE UPDATE ON public.clients FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON public.integrations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();