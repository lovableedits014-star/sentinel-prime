CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.resume_stuck_whatsapp_dispatches()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  r record;
  fn_url text := 'https://xvlvlhwlatclucjzwhld.supabase.co/functions/v1/send-whatsapp-dispatch';
  service_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  IF service_key IS NULL OR service_key = '' THEN
    RAISE NOTICE 'service_role_key não configurado em app.settings; retomada de disparos abortada';
    RETURN;
  END IF;

  FOR r IN
    SELECT d.id
    FROM public.whatsapp_dispatches d
    WHERE d.status IN ('pausado_timeout', 'enviando')
      AND COALESCE(d.resume_count, 0) < 250
      AND (
        (d.status = 'pausado_timeout' AND COALESCE(d.paused_until, now()) <= now())
        OR (d.status = 'enviando' AND d.updated_at < now() - interval '90 seconds')
      )
      AND EXISTS (
        SELECT 1
        FROM public.whatsapp_dispatch_items i
        WHERE i.dispatch_id = d.id
          AND i.status = 'pendente'
      )
    ORDER BY d.updated_at ASC
    LIMIT 10
  LOOP
    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key,
        'apikey', service_key
      ),
      body := jsonb_build_object('resume_dispatch_id', r.id)
    );
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.resume_stuck_whatsapp_dispatches() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_stuck_whatsapp_dispatches() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'resume-stuck-whatsapp-dispatches') THEN
    PERFORM cron.unschedule('resume-stuck-whatsapp-dispatches');
  END IF;
END;
$$;

SELECT cron.schedule(
  'resume-stuck-whatsapp-dispatches',
  '* * * * *',
  $$ SELECT public.resume_stuck_whatsapp_dispatches(); $$
);