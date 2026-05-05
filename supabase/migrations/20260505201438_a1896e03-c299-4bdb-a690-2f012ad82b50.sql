
CREATE TABLE IF NOT EXISTS public.legacy_password_recovery_allowlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source text,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_legacy_recovery_email_lower
  ON public.legacy_password_recovery_allowlist (lower(email));

CREATE INDEX IF NOT EXISTS idx_legacy_recovery_user_id
  ON public.legacy_password_recovery_allowlist (user_id);

ALTER TABLE public.legacy_password_recovery_allowlist ENABLE ROW LEVEL SECURITY;

-- Sem políticas: apenas service role acessa.

-- Popula com todos os usuários atualmente em auth.users
INSERT INTO public.legacy_password_recovery_allowlist (email, user_id, source)
SELECT lower(u.email), u.id, 'initial_backfill'
FROM auth.users u
WHERE u.email IS NOT NULL
ON CONFLICT (lower(email)) DO NOTHING;
