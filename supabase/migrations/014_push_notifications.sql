-- Background Web Push for opted-in users. Secrets and the endpoint URL live in Supabase Vault.
begin;

create extension if not exists pg_net with schema extensions;

create table public.push_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  shopping boolean not null default true,
  wishes boolean not null default true,
  movies boolean not null default true,
  events boolean not null default true,
  recipes boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  endpoint text not null check (endpoint ~ '^https://[^ ]{1,2048}$'),
  p256dh text not null check (length(p256dh) between 80 and 100),
  auth_secret text not null check (length(auth_secret) between 20 and 40),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, endpoint)
);
create index push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.push_preferences, public.push_subscriptions from anon, authenticated;

create policy push_preferences_self on public.push_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_self on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid() and couple_id = public.current_couple())
  with check (user_id = auth.uid() and couple_id = public.current_couple());

grant select, insert, update, delete on public.push_preferences, public.push_subscriptions to authenticated;
create trigger touch_push_preference before update on public.push_preferences
  for each row execute function public.touch_updated_at();
create trigger touch_push_subscription before update on public.push_subscriptions
  for each row execute function public.touch_updated_at();

create or replace function public.enqueue_activity_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  endpoint text;
  hook_secret text;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'ours_push_function_url';
  select decrypted_secret into hook_secret
    from vault.decrypted_secrets where name = 'ours_push_hook_secret';
  if endpoint is null or hook_secret is null then return new; end if;
  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object('content-type', 'application/json', 'x-ours-push-secret', hook_secret),
    body := jsonb_build_object('activity_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke all on function public.enqueue_activity_push() from public, anon, authenticated;
create trigger activity_push after insert on public.activity_events
  for each row execute function public.enqueue_activity_push();

create or replace function public.push_dispatch_config(p_hook_secret text)
returns table(vapid_private_jwk text, vapid_public_key text, vapid_subject text, app_url text)
language sql security definer set search_path = '' as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'ours_vapid_private_jwk'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'ours_vapid_public_key'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'ours_vapid_subject'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'ours_public_app_url')
  where p_hook_secret = (select decrypted_secret from vault.decrypted_secrets where name = 'ours_push_hook_secret')
    and p_hook_secret is not null
$$;
revoke all on function public.push_dispatch_config(text) from public, anon, authenticated;
grant execute on function public.push_dispatch_config(text) to service_role;

commit;
