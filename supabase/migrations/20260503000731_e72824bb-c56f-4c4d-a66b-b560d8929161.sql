-- Migration 6: contexto do post em comments
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS post_message TEXT,
  ADD COLUMN IF NOT EXISTS post_permalink_url TEXT,
  ADD COLUMN IF NOT EXISTS post_full_picture TEXT,
  ADD COLUMN IF NOT EXISTS post_media_type TEXT,
  ADD COLUMN IF NOT EXISTS comment_created_time TIMESTAMPTZ;

-- Migration 7: supporters + supporter_profiles
CREATE TYPE public.supporter_classification AS ENUM ('apoiador_ativo','apoiador_passivo','neutro','critico');

CREATE TABLE public.supporters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  classification supporter_classification DEFAULT 'neutro',
  notes TEXT,
  first_contact_date TIMESTAMPTZ DEFAULT now(),
  last_interaction_date TIMESTAMPTZ DEFAULT now(),
  engagement_score INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.supporter_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_id UUID NOT NULL REFERENCES public.supporters(id) ON DELETE CASCADE,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  platform_user_id TEXT NOT NULL,
  platform_username TEXT,
  profile_picture_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(supporter_id, platform, platform_user_id)
);

CREATE INDEX idx_supporter_profiles_platform_user ON public.supporter_profiles(platform, platform_user_id);
CREATE INDEX idx_supporters_client ON public.supporters(client_id);
CREATE INDEX idx_supporters_classification ON public.supporters(client_id, classification);

ALTER TABLE public.supporters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supporter_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own supporters" ON public.supporters FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = supporters.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can insert their own supporters" ON public.supporters FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = supporters.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can update their own supporters" ON public.supporters FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = supporters.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can delete their own supporters" ON public.supporters FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = supporters.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Users can view their own supporter profiles" ON public.supporter_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM supporters JOIN clients ON clients.id = supporters.client_id WHERE supporters.id = supporter_profiles.supporter_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can insert their own supporter profiles" ON public.supporter_profiles FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM supporters JOIN clients ON clients.id = supporters.client_id WHERE supporters.id = supporter_profiles.supporter_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can update their own supporter profiles" ON public.supporter_profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM supporters JOIN clients ON clients.id = supporters.client_id WHERE supporters.id = supporter_profiles.supporter_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can delete their own supporter profiles" ON public.supporter_profiles FOR DELETE
  USING (EXISTS (SELECT 1 FROM supporters JOIN clients ON clients.id = supporters.client_id WHERE supporters.id = supporter_profiles.supporter_id AND clients.user_id = auth.uid()));

CREATE TRIGGER update_supporters_updated_at BEFORE UPDATE ON public.supporters
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migration 8: engagement_actions + engagement_config + função
CREATE TABLE public.engagement_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  supporter_id UUID REFERENCES public.supporters(id) ON DELETE SET NULL,
  platform TEXT NOT NULL DEFAULT 'facebook',
  action_type TEXT NOT NULL CHECK (action_type IN ('like','comment','share','reaction')),
  post_id TEXT,
  comment_id TEXT,
  reaction_type TEXT,
  action_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  platform_user_id TEXT,
  platform_username TEXT
);

CREATE INDEX idx_engagement_client_id ON public.engagement_actions(client_id);
CREATE INDEX idx_engagement_supporter_id ON public.engagement_actions(supporter_id);
CREATE INDEX idx_engagement_action_date ON public.engagement_actions(action_date);
CREATE INDEX idx_engagement_platform_user ON public.engagement_actions(platform_user_id);

ALTER TABLE public.engagement_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own engagement actions" ON public.engagement_actions FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = engagement_actions.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can insert their own engagement actions" ON public.engagement_actions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = engagement_actions.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can update their own engagement actions" ON public.engagement_actions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = engagement_actions.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can delete their own engagement actions" ON public.engagement_actions FOR DELETE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = engagement_actions.client_id AND clients.user_id = auth.uid()));

CREATE TABLE public.engagement_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL UNIQUE REFERENCES public.clients(id) ON DELETE CASCADE,
  like_points INTEGER NOT NULL DEFAULT 1,
  comment_points INTEGER NOT NULL DEFAULT 3,
  share_points INTEGER NOT NULL DEFAULT 5,
  reaction_points INTEGER NOT NULL DEFAULT 1,
  inactivity_days INTEGER NOT NULL DEFAULT 7,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.engagement_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own engagement config" ON public.engagement_config FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = engagement_config.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can insert their own engagement config" ON public.engagement_config FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = engagement_config.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can update their own engagement config" ON public.engagement_config FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = engagement_config.client_id AND clients.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.calculate_engagement_score(p_supporter_id UUID, p_days INTEGER DEFAULT 30)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client_id UUID; v_score INTEGER := 0; v_config RECORD;
BEGIN
  SELECT client_id INTO v_client_id FROM supporters WHERE id = p_supporter_id;
  IF v_client_id IS NULL THEN RETURN 0; END IF;
  SELECT COALESCE(like_points,1) AS like_points, COALESCE(comment_points,3) AS comment_points,
         COALESCE(share_points,5) AS share_points, COALESCE(reaction_points,1) AS reaction_points
    INTO v_config FROM engagement_config WHERE client_id = v_client_id;
  IF v_config IS NULL THEN v_config := ROW(1,3,5,1); END IF;
  SELECT COALESCE(SUM(CASE action_type
    WHEN 'like' THEN v_config.like_points
    WHEN 'comment' THEN v_config.comment_points
    WHEN 'share' THEN v_config.share_points
    WHEN 'reaction' THEN v_config.reaction_points
    ELSE 0 END),0) INTO v_score
    FROM engagement_actions WHERE supporter_id = p_supporter_id
    AND action_date >= NOW() - (p_days || ' days')::INTERVAL;
  UPDATE supporters SET engagement_score = v_score, updated_at = NOW() WHERE id = p_supporter_id;
  RETURN v_score;
END; $$;

REVOKE EXECUTE ON FUNCTION public.calculate_engagement_score(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.calculate_engagement_score(UUID, INTEGER) TO authenticated;

CREATE TRIGGER update_engagement_config_updated_at BEFORE UPDATE ON public.engagement_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migration 9: índice + comentários em integrations
CREATE INDEX IF NOT EXISTS idx_integrations_client_id ON public.integrations(client_id);
COMMENT ON COLUMN public.integrations.llm_provider IS 'The LLM provider selected by the client: groq, openai, anthropic, gemini, mistral, cohere';
COMMENT ON COLUMN public.integrations.llm_model IS 'The specific model identifier for the selected provider';
COMMENT ON COLUMN public.integrations.llm_api_key IS 'Encrypted API key for the selected LLM provider';

-- Migration 10: social_profiles + colunas/constraints em comments
CREATE TABLE IF NOT EXISTS public.social_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT social_profiles_platform_check CHECK (platform IN ('facebook','instagram')),
  CONSTRAINT social_profiles_unique UNIQUE (client_id, platform, platform_user_id)
);

ALTER TABLE public.social_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own social profiles" ON public.social_profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = social_profiles.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can insert their own social profiles" ON public.social_profiles FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = social_profiles.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can update their own social profiles" ON public.social_profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = social_profiles.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can delete their own social profiles" ON public.social_profiles FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = social_profiles.client_id AND clients.user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_social_profiles_lookup ON public.social_profiles (client_id, platform, platform_user_id);

ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS social_profile_id UUID;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS platform_user_id TEXT;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS author_unavailable BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.comments ADD COLUMN IF NOT EXISTS author_unavailable_reason TEXT;

ALTER TABLE public.comments
  ADD CONSTRAINT comments_social_profile_id_fkey FOREIGN KEY (social_profile_id)
  REFERENCES public.social_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_comments_social_profile ON public.comments (social_profile_id);
CREATE INDEX IF NOT EXISTS idx_comments_client_post ON public.comments (client_id, post_id);

ALTER TABLE public.comments ADD CONSTRAINT comments_unique_platform_comment UNIQUE (client_id, platform, comment_id);
ALTER TABLE public.comments ADD CONSTRAINT comments_platform_not_null CHECK (platform IS NOT NULL) NOT VALID;
ALTER TABLE public.comments ADD CONSTRAINT comments_identity_min
  CHECK (author_unavailable OR (platform_user_id IS NOT NULL AND social_profile_id IS NOT NULL)) NOT VALID;