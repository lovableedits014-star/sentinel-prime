
CREATE TABLE public.blocked_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL,
  platform TEXT NOT NULL,
  platform_user_id TEXT NOT NULL,
  author_name TEXT,
  avatar_url TEXT,
  reason TEXT,
  blocked_by UUID,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (client_id, platform, platform_user_id)
);

CREATE INDEX idx_blocked_users_client ON public.blocked_users(client_id, blocked_at DESC);

ALTER TABLE public.blocked_users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Team can view blocked users"
ON public.blocked_users FOR SELECT
USING (public.user_has_client_access(client_id, auth.uid()));

CREATE POLICY "Team can insert blocked users"
ON public.blocked_users FOR INSERT
WITH CHECK (public.user_has_client_access(client_id, auth.uid()));

CREATE POLICY "Team can delete blocked users"
ON public.blocked_users FOR DELETE
USING (public.user_has_client_access(client_id, auth.uid()));
