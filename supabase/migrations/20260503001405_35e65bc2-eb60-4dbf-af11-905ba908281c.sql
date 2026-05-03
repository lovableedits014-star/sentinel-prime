-- Migration 16
ALTER TABLE public.comments ADD COLUMN is_hidden boolean NOT NULL DEFAULT false;

-- Migration 17: message_dispatches + dispatch_items
CREATE TABLE public.message_dispatches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL,
  post_permalink_url TEXT,
  post_platform TEXT NOT NULL DEFAULT 'facebook',
  message_template TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','cancelled','error')),
  total_recipients INTEGER NOT NULL DEFAULT 0,
  sent_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  batch_size INTEGER NOT NULL DEFAULT 20,
  batch_delay_seconds INTEGER NOT NULL DEFAULT 180,
  message_delay_min_seconds INTEGER NOT NULL DEFAULT 15,
  message_delay_max_seconds INTEGER NOT NULL DEFAULT 45,
  started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ, cancelled_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.dispatch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatch_id UUID NOT NULL REFERENCES public.message_dispatches(id) ON DELETE CASCADE,
  supporter_id UUID NOT NULL REFERENCES public.supporters(id) ON DELETE CASCADE,
  supporter_name TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','skipped','cancelled')),
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.message_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dispatch_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own dispatches" ON public.message_dispatches FOR SELECT
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = message_dispatches.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can insert their own dispatches" ON public.message_dispatches FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM clients WHERE clients.id = message_dispatches.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Users can update their own dispatches" ON public.message_dispatches FOR UPDATE
  USING (EXISTS (SELECT 1 FROM clients WHERE clients.id = message_dispatches.client_id AND clients.user_id = auth.uid()));

CREATE POLICY "Users can view their own dispatch items" ON public.dispatch_items FOR SELECT
  USING (EXISTS (SELECT 1 FROM message_dispatches md JOIN clients c ON c.id = md.client_id
                 WHERE md.id = dispatch_items.dispatch_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can insert their own dispatch items" ON public.dispatch_items FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM message_dispatches md JOIN clients c ON c.id = md.client_id
                      WHERE md.id = dispatch_items.dispatch_id AND c.user_id = auth.uid()));
CREATE POLICY "Users can update their own dispatch items" ON public.dispatch_items FOR UPDATE
  USING (EXISTS (SELECT 1 FROM message_dispatches md JOIN clients c ON c.id = md.client_id
                 WHERE md.id = dispatch_items.dispatch_id AND c.user_id = auth.uid()));

CREATE INDEX idx_dispatch_items_dispatch_id ON public.dispatch_items(dispatch_id);
CREATE INDEX idx_dispatch_items_status ON public.dispatch_items(status);
CREATE INDEX idx_message_dispatches_client_id ON public.message_dispatches(client_id);
CREATE INDEX idx_message_dispatches_status ON public.message_dispatches(status);

CREATE TRIGGER update_message_dispatches_updated_at BEFORE UPDATE ON public.message_dispatches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Migration 18: recurring_notification_tokens
CREATE TABLE public.recurring_notification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  supporter_id UUID NOT NULL REFERENCES public.supporters(id) ON DELETE CASCADE,
  platform_user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  token_status TEXT NOT NULL DEFAULT 'active',
  frequency TEXT NOT NULL DEFAULT 'daily',
  expires_at TIMESTAMPTZ,
  opted_in_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(client_id, supporter_id, platform_user_id)
);

ALTER TABLE public.recurring_notification_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tokens for their clients" ON public.recurring_notification_tokens FOR SELECT
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));
CREATE POLICY "Users can insert tokens for their clients" ON public.recurring_notification_tokens FOR INSERT
  WITH CHECK (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));
CREATE POLICY "Users can update tokens for their clients" ON public.recurring_notification_tokens FOR UPDATE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));
CREATE POLICY "Users can delete tokens for their clients" ON public.recurring_notification_tokens FOR DELETE
  USING (client_id IN (SELECT id FROM public.clients WHERE user_id = auth.uid()));

CREATE INDEX idx_recurring_tokens_supporter ON public.recurring_notification_tokens(supporter_id, token_status);
CREATE INDEX idx_recurring_tokens_client ON public.recurring_notification_tokens(client_id, token_status);

-- Migration 19: skipped (drop policy that wasn't created above)

-- Migration 20: supporter_accounts + supporter_checkins
CREATE TABLE public.supporter_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  supporter_id uuid REFERENCES public.supporters(id) ON DELETE SET NULL,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text NOT NULL,
  facebook_username text,
  instagram_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, client_id)
);

ALTER TABLE public.supporter_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supporter can view own account" ON public.supporter_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Supporter can update own account" ON public.supporter_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Supporter can insert own account" ON public.supporter_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Client owner can view supporter accounts" ON public.supporter_accounts FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = supporter_accounts.client_id AND clients.user_id = auth.uid()));

CREATE TABLE public.supporter_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_account_id uuid NOT NULL REFERENCES public.supporter_accounts(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  checkin_date date NOT NULL DEFAULT CURRENT_DATE,
  checkin_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(supporter_account_id, checkin_date)
);

ALTER TABLE public.supporter_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supporter can insert own checkin" ON public.supporter_checkins FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.supporter_accounts WHERE supporter_accounts.id = supporter_checkins.supporter_account_id AND supporter_accounts.user_id = auth.uid()));
CREATE POLICY "Supporter can view own checkins" ON public.supporter_checkins FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.supporter_accounts WHERE supporter_accounts.id = supporter_checkins.supporter_account_id AND supporter_accounts.user_id = auth.uid()));
CREATE POLICY "Client owner can view checkins" ON public.supporter_checkins FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = supporter_checkins.client_id AND clients.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.update_supporter_accounts_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_supporter_accounts_updated_at BEFORE UPDATE ON public.supporter_accounts
  FOR EACH ROW EXECUTE FUNCTION public.update_supporter_accounts_updated_at();

-- Migration 21: portal_missions
CREATE TABLE public.portal_missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('facebook','instagram')),
  post_url TEXT NOT NULL,
  title TEXT, description TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fk_portal_missions_client FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE
);

ALTER TABLE public.portal_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their portal missions" ON public.portal_missions FOR ALL
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = portal_missions.client_id AND clients.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = portal_missions.client_id AND clients.user_id = auth.uid()));
CREATE POLICY "Authenticated users can view portal missions" ON public.portal_missions FOR SELECT
  USING (is_active = true AND auth.uid() IS NOT NULL);

CREATE OR REPLACE FUNCTION public.update_portal_missions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trigger_portal_missions_updated_at BEFORE UPDATE ON public.portal_missions
  FOR EACH ROW EXECUTE FUNCTION public.update_portal_missions_updated_at();

CREATE INDEX idx_portal_missions_client_active ON public.portal_missions(client_id, is_active, display_order);

-- Migration 22: push_subscriptions
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  supporter_account_id UUID NOT NULL REFERENCES public.supporter_accounts(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(endpoint)
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Supporter can insert own push subscription" ON public.push_subscriptions FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.supporter_accounts WHERE supporter_accounts.id = push_subscriptions.supporter_account_id AND supporter_accounts.user_id = auth.uid()));
CREATE POLICY "Supporter can update own push subscription" ON public.push_subscriptions FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.supporter_accounts WHERE supporter_accounts.id = push_subscriptions.supporter_account_id AND supporter_accounts.user_id = auth.uid()));
CREATE POLICY "Supporter can delete own push subscription" ON public.push_subscriptions FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.supporter_accounts WHERE supporter_accounts.id = push_subscriptions.supporter_account_id AND supporter_accounts.user_id = auth.uid()));
CREATE POLICY "Supporter can view own push subscription" ON public.push_subscriptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.supporter_accounts WHERE supporter_accounts.id = push_subscriptions.supporter_account_id AND supporter_accounts.user_id = auth.uid()));
CREATE POLICY "Client owner can view push subscriptions" ON public.push_subscriptions FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.clients WHERE clients.id = push_subscriptions.client_id AND clients.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.update_push_subscriptions_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_push_subscriptions_updated_at BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_push_subscriptions_updated_at();

-- Migration 23: realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.supporters;
ALTER PUBLICATION supabase_realtime ADD TABLE public.supporter_profiles;

-- Migration 24+25: invite_tokens + storage bucket + super_admin = lovableedits014@gmail.com
CREATE TABLE public.invite_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  created_by UUID NOT NULL,
  used_by UUID NULL,
  used_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days',
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.invite_tokens ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email = 'lovableedits014@gmail.com')
$$;

REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated;

CREATE POLICY "Super admin can view invites" ON public.invite_tokens FOR SELECT USING (public.is_super_admin());
CREATE POLICY "Super admin can create invites" ON public.invite_tokens FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY "Super admin can delete invites" ON public.invite_tokens FOR DELETE USING (public.is_super_admin());
CREATE POLICY "Authenticated can mark invite as used" ON public.invite_tokens FOR UPDATE
  USING (used_by IS NULL AND expires_at > now()) WITH CHECK (auth.uid() = used_by);

INSERT INTO storage.buckets (id, name, public) VALUES ('client-logos', 'client-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Client can upload own logo" ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'client-logos' AND auth.uid() IS NOT NULL AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Client can update own logo" ON storage.objects FOR UPDATE
  USING (bucket_id = 'client-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Client can delete own logo" ON storage.objects FOR DELETE
  USING (bucket_id = 'client-logos' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "Anyone can view client logos" ON storage.objects FOR SELECT USING (bucket_id = 'client-logos');