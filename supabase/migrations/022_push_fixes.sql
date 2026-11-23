-- 022: Web Push reliability fixes — allow plants/budget in pending_push_digest
-- and add service_role-only push_dispatch_service_config() for authenticated self-test push.
begin;

-- 1. Widen pending_push_digest.kind to match activity_events (adds plants & budget)
do $$
declare
  c record;
begin
  if to_regclass('public.pending_push_digest') is not null then
    for c in
      select conname
      from pg_constraint
      where conrelid = 'public.pending_push_digest'::regclass
        and contype = 'c'
        and pg_get_constraintdef(oid) ilike '%kind%'
    loop
      execute format('alter table public.pending_push_digest drop constraint %I', c.conname);
    end loop;

    alter table public.pending_push_digest
      add constraint pending_push_digest_kind_check
      check (kind in ('shopping', 'calendar', 'events', 'wishes', 'movies', 'recipes', 'plants', 'budget'));
  end if;
end $$;

-- 2. Service-role-only VAPID config lookup for authenticated self-test push requests
create or replace function public.push_dispatch_service_config()
returns table(vapid_private_jwk text, vapid_public_key text, vapid_subject text, app_url text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'ours_vapid_private_jwk'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'ours_vapid_public_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'ours_vapid_subject'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'ours_public_app_url');
end;
$$;

revoke all on function public.push_dispatch_service_config() from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.push_dispatch_service_config() to service_role;
  end if;
end $$;

-- 3. Ensure authenticated can update wishes.fulfilled
grant update(fulfilled) on public.wishes to authenticated;

commit;
