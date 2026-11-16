-- Smart notifications: batch shopping additions, skip shopping check-offs,
-- quiet hours before 11:00 Kyiv time, and optional daily 11:00 reminder flush.
begin;

create table if not exists public.pending_push_digest (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('shopping', 'wishes', 'movies', 'events', 'recipes')),
  title text not null,
  activity_id uuid not null references public.activity_events(id) on delete cascade,
  created_at timestamptz not null default now()
);
create index if not exists pending_push_digest_couple on public.pending_push_digest(couple_id, created_at);

create table if not exists public.daily_reminder_log (
  user_id uuid not null references public.profiles(id) on delete cascade,
  sent_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, sent_date)
);

alter table public.pending_push_digest enable row level security;
alter table public.daily_reminder_log enable row level security;
revoke all on public.pending_push_digest, public.daily_reminder_log from public, anon, authenticated;

create or replace function public.enqueue_activity_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  endpoint text;
  hook_secret text;
begin
  if new.kind = 'shopping' and new.action <> 'added' then
    return new;
  end if;
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

create or replace function public.flush_smart_notifications()
returns void language plpgsql security definer set search_path = '' as $$
declare
  endpoint text;
  hook_secret text;
begin
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'ours_push_function_url';
  select decrypted_secret into hook_secret
    from vault.decrypted_secrets where name = 'ours_push_hook_secret';
  if endpoint is null or hook_secret is null then return; end if;
  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object('content-type', 'application/json', 'x-ours-push-secret', hook_secret),
    body := jsonb_build_object('mode', 'flush'),
    timeout_milliseconds := 10000
  );
end;
$$;
revoke all on function public.flush_smart_notifications() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule('ours-smart-notifications')
      where exists (select 1 from cron.job where jobname = 'ours-smart-notifications');
    perform cron.schedule(
      'ours-smart-notifications',
      '*/5 * * * *',
      'select public.flush_smart_notifications();'
    );
  end if;
exception when others then
  null;
end
$$;

commit;
