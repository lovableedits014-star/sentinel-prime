create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

create or replace function public.ic_trigger_monthly_drift()
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  c record;
  fn_url text := 'https://xvlvlhwlatclucjzwhld.supabase.co/functions/v1/ic-detect-drift';
  service_key text := current_setting('app.settings.service_role_key', true);
begin
  if service_key is null or service_key = '' then
    raise notice 'service_role_key não configurado em app.settings; cron drift abortado';
    return;
  end if;

  for c in select id from public.clients loop
    perform net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_key
      ),
      body := jsonb_build_object('clientId', c.id, 'replace', true)
    );
  end loop;
end;
$$;

revoke all on function public.ic_trigger_monthly_drift() from public, anon, authenticated;

select cron.schedule(
  'ic-monthly-drift-detection',
  '0 3 1 * *',
  $$ select public.ic_trigger_monthly_drift(); $$
);