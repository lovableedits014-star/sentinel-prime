
-- 1. Novas colunas em portal_missions
ALTER TABLE public.portal_missions
  ADD COLUMN IF NOT EXISTS tracking_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS link_facebook text,
  ADD COLUMN IF NOT EXISTS link_instagram text,
  ADD COLUMN IF NOT EXISTS link_avulso text,
  ADD COLUMN IF NOT EXISTS instructions text;

-- 2. Enum de eventos
DO $$ BEGIN
  CREATE TYPE public.mission_event_type AS ENUM (
    'open', 'click_facebook', 'click_instagram', 'click_avulso', 'declared_done'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. mission_distributions
CREATE TABLE IF NOT EXISTS public.mission_distributions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES public.portal_missions(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  group_jid text,
  group_name_snapshot text,
  dispatch_id uuid,
  short_code text NOT NULL UNIQUE,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mission_distributions_mission ON public.mission_distributions(mission_id);
CREATE INDEX IF NOT EXISTS idx_mission_distributions_group ON public.mission_distributions(mission_id, group_jid);
CREATE INDEX IF NOT EXISTS idx_mission_distributions_client ON public.mission_distributions(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.mission_distributions TO authenticated;
GRANT ALL ON public.mission_distributions TO service_role;
ALTER TABLE public.mission_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mdist_client_all" ON public.mission_distributions
  FOR ALL TO authenticated
  USING (public.user_can_access_client(client_id))
  WITH CHECK (public.user_can_access_client(client_id));

-- 4. mission_participants
CREATE TABLE IF NOT EXISTS public.mission_participants (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL,
  phone_e164 text NOT NULL,
  nome text NOT NULL,
  pessoa_id uuid,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (client_id, phone_e164)
);
CREATE INDEX IF NOT EXISTS idx_mission_participants_client ON public.mission_participants(client_id);

GRANT SELECT ON public.mission_participants TO authenticated;
GRANT ALL ON public.mission_participants TO service_role;
ALTER TABLE public.mission_participants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mpart_client_select" ON public.mission_participants
  FOR SELECT TO authenticated
  USING (public.user_can_access_client(client_id));

-- 5. mission_visitor_tokens
CREATE TABLE IF NOT EXISTS public.mission_visitor_tokens (
  token text PRIMARY KEY,
  participant_id uuid NOT NULL REFERENCES public.mission_participants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  user_agent text,
  device_hint text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_mvt_participant ON public.mission_visitor_tokens(participant_id);

GRANT ALL ON public.mission_visitor_tokens TO service_role;
ALTER TABLE public.mission_visitor_tokens ENABLE ROW LEVEL SECURITY;
-- sem policies para authenticated: só service_role acessa

-- 6. mission_events
CREATE TABLE IF NOT EXISTS public.mission_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mission_id uuid NOT NULL REFERENCES public.portal_missions(id) ON DELETE CASCADE,
  distribution_id uuid REFERENCES public.mission_distributions(id) ON DELETE SET NULL,
  participant_id uuid REFERENCES public.mission_participants(id) ON DELETE SET NULL,
  client_id uuid NOT NULL,
  event_type public.mission_event_type NOT NULL,
  ip_hash text,
  user_agent text,
  device_category text,
  is_bot boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_mevents_mission_type ON public.mission_events(mission_id, event_type);
CREATE INDEX IF NOT EXISTS idx_mevents_participant ON public.mission_events(participant_id, created_at);
CREATE INDEX IF NOT EXISTS idx_mevents_client ON public.mission_events(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mevents_distribution ON public.mission_events(distribution_id);

GRANT SELECT ON public.mission_events TO authenticated;
GRANT ALL ON public.mission_events TO service_role;
ALTER TABLE public.mission_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mevents_client_select" ON public.mission_events
  FOR SELECT TO authenticated
  USING (public.user_can_access_client(client_id));

-- 7. Trigger updated_at
CREATE TRIGGER trg_mission_distributions_updated
  BEFORE UPDATE ON public.mission_distributions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_mission_participants_updated
  BEFORE UPDATE ON public.mission_participants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Função geradora de short_code (10 chars base32-ish, sem ambíguos)
CREATE OR REPLACE FUNCTION public.mission_generate_short_code()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  i int;
BEGIN
  LOOP
    code := '';
    FOR i IN 1..10 LOOP
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.mission_distributions WHERE short_code = code);
  END LOOP;
  RETURN code;
END $$;
