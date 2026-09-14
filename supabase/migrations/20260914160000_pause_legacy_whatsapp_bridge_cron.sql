-- A bridge propria foi descontinuada. Mantemos funcoes, filas e historico para
-- auditoria e para facilitar a futura migracao para a Evolution API, mas
-- pausamos os watchdogs que acordavam continuamente sem uma bridge funcional.
-- Usar active=false (em vez de apagar o job) torna a mudanca reversivel.
DO $block$
DECLARE
  target_job record;
BEGIN
  FOR target_job IN
    SELECT jobid
    FROM cron.job
    WHERE active
      AND (
        jobname IN (
          'resume-stuck-whatsapp-dispatches',
          'watchdog-resume-stuck-dispatches',
          'watchdog_resume_stuck_dispatches',
          'whatsapp-keepalive-every-5-minutes'
        )
        OR command ILIKE '%resume_stuck_whatsapp_dispatches%'
        OR command ILIKE '%watchdog_resume_stuck_dispatches%'
      )
  LOOP
    PERFORM cron.alter_job(target_job.jobid, active := false);
  END LOOP;
END;
$block$;

COMMENT ON FUNCTION public.resume_stuck_whatsapp_dispatches() IS
  'Bridge legada desativada em 2026-09-14. Funcao preservada para auditoria/migracao; cron pausado em cron.job.';
