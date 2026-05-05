alter table public.supporter_accounts
  add column if not exists legacy_password_recovery_allowed boolean not null default false;

update public.supporter_accounts
set legacy_password_recovery_allowed = true
where legacy_password_recovery_allowed = false;

create index if not exists idx_supporter_accounts_legacy_password_recovery
  on public.supporter_accounts (client_id, lower(email))
  where legacy_password_recovery_allowed = true;