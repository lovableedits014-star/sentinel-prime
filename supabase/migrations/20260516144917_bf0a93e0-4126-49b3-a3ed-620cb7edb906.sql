SELECT cron.schedule(
  'llm-alert-detection',
  '*/5 * * * *',
  $$SELECT public.detect_llm_alerts();$$
);