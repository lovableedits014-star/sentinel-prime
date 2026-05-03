-- Migration 26
CREATE OR REPLACE FUNCTION public.calculate_engagement_score(p_supporter_id uuid, p_days integer DEFAULT 30)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_client_id UUID; v_score INTEGER := 0;
  v_like_points INTEGER := 1; v_comment_points INTEGER := 3;
  v_share_points INTEGER := 5; v_reaction_points INTEGER := 1;
BEGIN
  SELECT client_id INTO v_client_id FROM supporters WHERE id = p_supporter_id;
  IF v_client_id IS NULL THEN RETURN 0; END IF;
  SELECT COALESCE(like_points,1), COALESCE(comment_points,3),
         COALESCE(share_points,5), COALESCE(reaction_points,1)
    INTO v_like_points, v_comment_points, v_share_points, v_reaction_points
    FROM engagement_config WHERE client_id = v_client_id LIMIT 1;
  SELECT COALESCE(SUM(CASE action_type
    WHEN 'like' THEN v_like_points WHEN 'comment' THEN v_comment_points
    WHEN 'share' THEN v_share_points WHEN 'reaction' THEN v_reaction_points
    ELSE 0 END), 0) INTO v_score
    FROM engagement_actions WHERE supporter_id = p_supporter_id
    AND action_date >= NOW() - (p_days || ' days')::INTERVAL;
  UPDATE supporters SET engagement_score = v_score, updated_at = NOW() WHERE id = p_supporter_id;
  RETURN v_score;
END; $$;

-- Migration 27: trigger handle_new_client_engagement_config
CREATE OR REPLACE FUNCTION public.handle_new_client_engagement_config()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.engagement_config (client_id, like_points, comment_points, share_points, reaction_points, inactivity_days)
  VALUES (NEW.id, 1, 3, 5, 1, 7) ON CONFLICT (client_id) DO NOTHING;
  RETURN NEW;
END; $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_client_engagement_config() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_client_created_engagement_config AFTER INSERT ON public.clients
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_client_engagement_config();

-- Migration 28: auto_create_engagement_action + backfill
CREATE OR REPLACE FUNCTION public.auto_create_engagement_action()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_supporter_id UUID; v_existing_action_id UUID;
BEGIN
  IF NEW.is_page_owner = true THEN RETURN NEW; END IF;
  IF NEW.platform_user_id IS NULL OR NEW.platform_user_id = '' THEN RETURN NEW; END IF;
  IF NEW.text = '__post_stub__' THEN RETURN NEW; END IF;

  SELECT id INTO v_existing_action_id FROM engagement_actions
   WHERE comment_id = NEW.comment_id AND client_id = NEW.client_id LIMIT 1;

  IF v_existing_action_id IS NOT NULL THEN
    UPDATE engagement_actions
      SET supporter_id = (SELECT sp.supporter_id FROM supporter_profiles sp
        WHERE sp.platform = NEW.platform AND sp.platform_user_id = NEW.platform_user_id LIMIT 1)
      WHERE id = v_existing_action_id AND supporter_id IS NULL;
    RETURN NEW;
  END IF;

  SELECT sp.supporter_id INTO v_supporter_id FROM supporter_profiles sp
    WHERE sp.platform = NEW.platform AND sp.platform_user_id = NEW.platform_user_id LIMIT 1;

  IF v_supporter_id IS NULL AND NEW.author_name IS NOT NULL THEN
    SELECT sp.supporter_id INTO v_supporter_id FROM supporter_profiles sp
      WHERE sp.platform = NEW.platform
        AND LOWER(TRIM(BOTH '@' FROM COALESCE(sp.platform_username, ''))) = LOWER(TRIM(BOTH '@' FROM NEW.platform_user_id))
      LIMIT 1;
  END IF;

  INSERT INTO engagement_actions (client_id, supporter_id, platform, platform_user_id, platform_username,
    action_type, comment_id, post_id, action_date)
  VALUES (NEW.client_id, v_supporter_id, COALESCE(NEW.platform, 'facebook'),
    NEW.platform_user_id, NEW.author_name, 'comment', NEW.comment_id, NEW.post_id,
    COALESCE(NEW.comment_created_time, NEW.created_at, NOW()))
  ON CONFLICT DO NOTHING;

  IF v_supporter_id IS NOT NULL THEN PERFORM calculate_engagement_score(v_supporter_id); END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trigger_auto_engagement_action ON public.comments;
CREATE TRIGGER trigger_auto_engagement_action
AFTER INSERT OR UPDATE OF platform_user_id, is_page_owner ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.auto_create_engagement_action();

-- Migration 29: push_dispatch_jobs
CREATE TABLE public.push_dispatch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  title TEXT, message TEXT, url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed','partial')),
  total_subscribers INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  expired_removed INTEGER DEFAULT 0,
  error_message TEXT,
  elapsed_seconds INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ
);

CREATE INDEX idx_push_dispatch_jobs_client ON public.push_dispatch_jobs(client_id, created_at DESC);
CREATE INDEX idx_push_dispatch_jobs_status ON public.push_dispatch_jobs(status) WHERE status IN ('pending','processing');

ALTER TABLE public.push_dispatch_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own dispatch jobs" ON public.push_dispatch_jobs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = push_dispatch_jobs.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can insert own dispatch jobs" ON public.push_dispatch_jobs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = push_dispatch_jobs.client_id AND clients.user_id = auth.uid()));

ALTER PUBLICATION supabase_realtime ADD TABLE public.push_dispatch_jobs;

-- Migration 30: policy update push_dispatch_jobs
CREATE POLICY "Users can update own dispatch jobs" ON public.push_dispatch_jobs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = push_dispatch_jobs.client_id AND clients.user_id = auth.uid()));

-- Migration 31: ied_scores
CREATE TABLE public.ied_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  sentiment_score INTEGER NOT NULL DEFAULT 0,
  growth_score INTEGER NOT NULL DEFAULT 0,
  engagement_score INTEGER NOT NULL DEFAULT 0,
  checkin_score INTEGER NOT NULL DEFAULT 0,
  week_start DATE NOT NULL,
  details JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT ied_scores_client_week_unique UNIQUE (client_id, week_start)
);

ALTER TABLE public.ied_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own IED scores" ON public.ied_scores FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = ied_scores.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can insert their own IED scores" ON public.ied_scores FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = ied_scores.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can update their own IED scores" ON public.ied_scores FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = ied_scores.client_id AND clients.user_id = auth.uid()));

CREATE INDEX idx_ied_scores_client_week ON public.ied_scores (client_id, week_start DESC);

-- Migration 32: referrals + territorial
CREATE TABLE public.referral_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_account_id UUID NOT NULL REFERENCES public.supporter_accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code)
);

CREATE INDEX idx_referral_codes_code ON public.referral_codes(code);
CREATE INDEX idx_referral_codes_client ON public.referral_codes(client_id);

CREATE TABLE public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  referrer_account_id UUID NOT NULL REFERENCES public.supporter_accounts(id) ON DELETE CASCADE,
  referred_account_id UUID NOT NULL REFERENCES public.supporter_accounts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_referrals_referrer ON public.referrals(referrer_account_id);
CREATE INDEX idx_referrals_client ON public.referrals(client_id);

ALTER TABLE public.supporter_accounts ADD COLUMN referred_by UUID REFERENCES public.supporter_accounts(id);
ALTER TABLE public.supporters ADD COLUMN referral_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.supporter_accounts ADD COLUMN city TEXT;
ALTER TABLE public.supporter_accounts ADD COLUMN neighborhood TEXT;
ALTER TABLE public.supporter_accounts ADD COLUMN state TEXT;

CREATE TABLE public.territorial_zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  zone_name TEXT NOT NULL,
  zone_type TEXT NOT NULL DEFAULT 'bairro',
  supporter_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_territorial_zones_client ON public.territorial_zones(client_id);

ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can view referral codes" ON public.referral_codes FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = referral_codes.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Supporter can view own referral code" ON public.referral_codes FOR SELECT
  USING (EXISTS (SELECT 1 FROM supporter_accounts WHERE supporter_accounts.id = referral_codes.supporter_account_id AND supporter_accounts.user_id = auth.uid()));
CREATE POLICY "Supporter can insert own referral code" ON public.referral_codes FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM supporter_accounts WHERE supporter_accounts.id = referral_codes.supporter_account_id AND supporter_accounts.user_id = auth.uid()));
CREATE POLICY "Anyone can read referral codes for validation" ON public.referral_codes FOR SELECT USING (true);

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can view referrals" ON public.referrals FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = referrals.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Supporter can view own referrals" ON public.referrals FOR SELECT
  USING (EXISTS (SELECT 1 FROM supporter_accounts WHERE supporter_accounts.id = referrals.referrer_account_id AND supporter_accounts.user_id = auth.uid()));
CREATE POLICY "Supporter can insert referrals" ON public.referrals FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM supporter_accounts WHERE supporter_accounts.id = referrals.referrer_account_id AND supporter_accounts.user_id = auth.uid()));

ALTER TABLE public.territorial_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Client owner can manage territorial zones" ON public.territorial_zones FOR ALL
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = territorial_zones.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Client owner can insert territorial zones" ON public.territorial_zones FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = territorial_zones.client_id AND clients.user_id = auth.uid()));

-- Migration 33: auto_mark_parent_responded
CREATE OR REPLACE FUNCTION public.auto_mark_parent_responded()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_page_owner = true AND NEW.parent_comment_id IS NOT NULL THEN
    UPDATE comments SET status = 'responded',
      responded_at = COALESCE(responded_at, NEW.comment_created_time, NOW()),
      updated_at = NOW()
    WHERE comment_id = NEW.parent_comment_id
      AND client_id = NEW.client_id AND status = 'pending';
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER trg_auto_mark_parent_responded AFTER INSERT ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.auto_mark_parent_responded();