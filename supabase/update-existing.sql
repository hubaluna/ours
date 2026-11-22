-- ours. Single-file idempotent upgrade for an existing Supabase database.
-- Safely brings any database (from migration 012+ onward) up to migration 020
-- without touching existing user data. Safe to re-run in Supabase SQL Editor.

begin;

-- ---------------------------------------------------------------------------
-- 013 + 017: Calendar feed tokens & recurring events
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_feed_tokens (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now()
);
alter table public.calendar_feed_tokens enable row level security;
revoke all on public.calendar_feed_tokens from public, anon, authenticated;

alter table public.events
  add column if not exists recurrence text not null default 'none'
  check (recurrence in ('none', 'weekly', 'monthly', 'yearly'));

grant update(recurrence) on public.events to authenticated;

create or replace function public.rotate_calendar_feed_token(p_token text)
returns void language plpgsql security definer set search_path = ''
as $$
declare v_couple uuid := public.current_couple();
begin
  if v_couple is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid calendar feed';
  end if;
  insert into public.calendar_feed_tokens(couple_id, token_hash)
  values(v_couple, sha256(convert_to(p_token, 'UTF8')))
  on conflict(couple_id) do update
    set token_hash = excluded.token_hash, created_at = now();
end $$;

create or replace function public.revoke_calendar_feed_token()
returns void language sql security definer set search_path = ''
as $$ delete from public.calendar_feed_tokens where couple_id = public.current_couple() $$;

drop function if exists public.calendar_feed_events(text);
create function public.calendar_feed_events(p_token text)
returns table (
  id uuid, title text, date date, "time" time, all_day boolean,
  location text, description text, url text, recurrence text, created_at timestamptz
) language sql stable security definer set search_path = ''
as $$
  select e.id, e.title, e.date, e.time, e.all_day, e.location,
         e.description, e.url, e.recurrence, e.created_at
  from public.calendar_feed_tokens f
  join public.events e on e.couple_id = f.couple_id
  where length(p_token) = 43
    and f.token_hash = sha256(convert_to(p_token, 'UTF8'))
  order by e.date, e.time nulls first, e.created_at
$$;

revoke all on function public.rotate_calendar_feed_token(text), public.revoke_calendar_feed_token(), public.calendar_feed_events(text) from public;
revoke all on function public.rotate_calendar_feed_token(text), public.revoke_calendar_feed_token(), public.calendar_feed_events(text) from anon;
grant execute on function public.rotate_calendar_feed_token(text), public.revoke_calendar_feed_token() to authenticated;
grant execute on function public.calendar_feed_events(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 014 + 018: Web Push preferences, subscriptions & smart notifications
-- ---------------------------------------------------------------------------
do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then
  null;
end $$;

create table if not exists public.push_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  shopping boolean not null default true,
  wishes boolean not null default true,
  movies boolean not null default true,
  events boolean not null default true,
  recipes boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
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
create index if not exists push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_preferences enable row level security;
alter table public.push_subscriptions enable row level security;
revoke all on public.push_preferences, public.push_subscriptions from public, anon, authenticated;

drop policy if exists push_preferences_self on public.push_preferences;
create policy push_preferences_self on public.push_preferences
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists push_subscriptions_self on public.push_subscriptions;
create policy push_subscriptions_self on public.push_subscriptions
  for all to authenticated
  using (user_id = auth.uid() and couple_id = public.current_couple())
  with check (user_id = auth.uid() and couple_id = public.current_couple());

grant select, insert, update, delete on public.push_preferences, public.push_subscriptions to authenticated;

drop trigger if exists touch_push_preference on public.push_preferences;
create trigger touch_push_preference before update on public.push_preferences
  for each row execute function public.touch_updated_at();

drop trigger if exists touch_push_subscription on public.push_subscriptions;
create trigger touch_push_subscription before update on public.push_subscriptions
  for each row execute function public.touch_updated_at();

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

drop trigger if exists activity_push on public.activity_events;
create trigger activity_push after insert on public.activity_events
  for each row execute function public.enqueue_activity_push();

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

-- ---------------------------------------------------------------------------
-- 015 + 016: Plants, plant care events, recipe favorites & recipe cooks
-- ---------------------------------------------------------------------------
create table if not exists public.plants (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100),
  species text not null default '' check (length(species) <= 120),
  image_path text check (image_path is null or length(image_path) <= 512),
  watering_interval_days integer not null default 7 check (watering_interval_days between 1 and 120),
  last_watered_at date not null default current_date,
  light text not null default '' check (length(light) <= 100),
  watering_notes text not null default '' check (length(watering_notes) <= 500),
  info_url text not null default '' check (info_url = '' or (info_url ~ '^https://' and length(info_url) <= 2048)),
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (image_path is null or image_path like couple_id::text || '/%')
);
alter table public.plants add column if not exists wet_checked_at date;

create index if not exists plants_couple_due
  on public.plants(couple_id, last_watered_at);

alter table public.plants enable row level security;
revoke all on public.plants from public, anon, authenticated;
grant select, delete on public.plants to authenticated;
grant insert(couple_id, name, species, image_path, watering_interval_days, last_watered_at, light, watering_notes, info_url, added_by)
  on public.plants to authenticated;
grant update(name, species, image_path, watering_interval_days, last_watered_at, light, watering_notes, info_url)
  on public.plants to authenticated;

drop policy if exists plants_read on public.plants;
create policy plants_read on public.plants for select to authenticated
  using (couple_id = public.current_couple());
drop policy if exists plants_insert on public.plants;
create policy plants_insert on public.plants for insert to authenticated
  with check (couple_id = public.current_couple() and added_by = auth.uid());
drop policy if exists plants_update on public.plants;
create policy plants_update on public.plants for update to authenticated
  using (couple_id = public.current_couple())
  with check (couple_id = public.current_couple());
drop policy if exists plants_delete on public.plants;
create policy plants_delete on public.plants for delete to authenticated
  using (couple_id = public.current_couple());

drop trigger if exists plants_touch_updated on public.plants;
create trigger plants_touch_updated before update on public.plants
  for each row execute function public.touch_updated_at();

create table if not exists public.plant_care_events (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('watered', 'wet')),
  occurred_at timestamptz not null default now()
);
create index if not exists plant_care_events_plant_time on public.plant_care_events(plant_id, occurred_at desc);
alter table public.plant_care_events enable row level security;
revoke all on public.plant_care_events from public, anon, authenticated;
grant select on public.plant_care_events to authenticated;
drop policy if exists plant_care_read on public.plant_care_events;
create policy plant_care_read on public.plant_care_events for select to authenticated
  using (couple_id = public.current_couple());

create or replace function public.record_plant_care(p_plant_id uuid, p_action text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_couple uuid := public.current_couple(); v_today date := (now() at time zone 'Europe/Kyiv')::date;
begin
  if v_couple is null or p_action not in ('watered', 'wet') then raise exception 'plant care: invalid request'; end if;
  perform 1 from public.plants where id = p_plant_id and couple_id = v_couple for update;
  if not found then raise exception 'plant care: plant not found'; end if;
  if p_action = 'watered' then
    update public.plants set last_watered_at = v_today, wet_checked_at = null where id = p_plant_id;
  else
    update public.plants set wet_checked_at = v_today where id = p_plant_id;
  end if;
  insert into public.plant_care_events(plant_id, couple_id, actor_id, action)
  values (p_plant_id, v_couple, auth.uid(), p_action);
end $$;
revoke all on function public.record_plant_care(uuid, text) from public, anon;
grant execute on function public.record_plant_care(uuid, text) to authenticated;

create table if not exists public.recipe_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_key text not null check (recipe_key ~ '^(catalog:ours55/[a-zA-Z0-9_-]+|custom:[0-9a-f-]{36})$'),
  primary key (user_id, recipe_key)
);
alter table public.recipe_favorites enable row level security;
revoke all on public.recipe_favorites from public, anon, authenticated;
grant select, insert, delete on public.recipe_favorites to authenticated;
drop policy if exists recipe_favorites_self on public.recipe_favorites;
create policy recipe_favorites_self on public.recipe_favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table if not exists public.recipe_cooks (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  recipe_key text not null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  cooked_at timestamptz not null default now()
);
create index if not exists recipe_cooks_couple_time on public.recipe_cooks(couple_id, cooked_at desc);
alter table public.recipe_cooks enable row level security;
revoke all on public.recipe_cooks from public, anon, authenticated;
grant select on public.recipe_cooks to authenticated;
drop policy if exists recipe_cooks_read on public.recipe_cooks;
create policy recipe_cooks_read on public.recipe_cooks for select to authenticated
  using (couple_id = public.current_couple());

create or replace function public.finish_menu_item(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare v_couple uuid := public.current_couple(); v_key text;
begin
  if v_couple is null then raise exception 'authentication required'; end if;
  perform 1 from public.couples where id = v_couple for update;
  select case when catalog_id is not null then 'catalog:ours55/' || catalog_id
    else 'custom:' || recipe_id::text end into v_key
  from public.meal_plan_items where id = p_id and couple_id = v_couple for update;
  if v_key is null then raise exception 'menu: item not found'; end if;
  insert into public.recipe_cooks(couple_id, recipe_key, actor_id) values (v_couple, v_key, auth.uid());
  delete from public.meal_plan_items where id = p_id and couple_id = v_couple;
  perform public.sync_menu_shopping(v_couple);
  insert into public.activity_events(couple_id, actor_id, kind, action, title)
  values (v_couple, auth.uid(), 'recipes', 'updated', 'Страву приготовано');
end $$;
revoke all on function public.finish_menu_item(uuid) from public, anon;
grant execute on function public.finish_menu_item(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 019: Home pantry ("єВдома") synced with menu shopping generation
-- ---------------------------------------------------------------------------
create table if not exists public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 120),
  normalized_name text not null check (length(btrim(normalized_name)) between 1 and 120),
  quantity text not null default '' check (length(quantity) <= 60),
  is_basic boolean not null default false,
  added_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pantry_items_couple_norm
  on public.pantry_items(couple_id, normalized_name);

create index if not exists pantry_items_couple_idx
  on public.pantry_items(couple_id);

alter table public.pantry_items enable row level security;
revoke all on public.pantry_items from public, anon, authenticated;
grant select, delete on public.pantry_items to authenticated;
grant insert(couple_id, name, normalized_name, quantity, is_basic, added_by)
  on public.pantry_items to authenticated;
grant update(name, normalized_name, quantity, is_basic)
  on public.pantry_items to authenticated;

drop policy if exists pantry_read on public.pantry_items;
create policy pantry_read on public.pantry_items for select to authenticated
  using (couple_id = public.current_couple());

drop policy if exists pantry_insert on public.pantry_items;
create policy pantry_insert on public.pantry_items for insert to authenticated
  with check (couple_id = public.current_couple() and added_by = auth.uid());

drop policy if exists pantry_update on public.pantry_items;
create policy pantry_update on public.pantry_items for update to authenticated
  using (couple_id = public.current_couple())
  with check (couple_id = public.current_couple());

drop policy if exists pantry_delete on public.pantry_items;
create policy pantry_delete on public.pantry_items for delete to authenticated
  using (couple_id = public.current_couple());

drop trigger if exists pantry_touch_updated on public.pantry_items;
create trigger pantry_touch_updated before update on public.pantry_items
  for each row execute function public.touch_updated_at();

create or replace function public.normalize_pantry_name(p_name text)
returns text
language sql immutable
set search_path = ''
as $$
  with cleaned as (
    select regexp_replace(
      translate(lower(btrim(coalesce(p_name, ''))), chr(8217)||chr(96), chr(39)||chr(39)),
      '[.,;:!?()[\]{}]+', ' ', 'g'
    ) as value
  ), compact as (
    select regexp_replace(value, '[[:space:]]+', ' ', 'g') as value
    from cleaned
  )
  select btrim(regexp_replace(
    value,
    '^(?:[0-9]+(?:[.,][0-9]+)?(?:/[0-9]+)?|[¼½¾])\s+(?:(?:ст|ч)\s*л|(?:столов(?:а|ої|і)?|чайна)\s+ложк(?:а|и|у|ою)?|tbsp|tsp|tablespoons?|teaspoons?|кг|гр?\.?|г|мл|л|шт\.?|штук|уп\.?|зубчик(?:и|а|ів)?)\s+',
    '', 'i'
  ))
  from compact;
$$;

create or replace function public.is_in_couple_pantry(p_couple uuid, p_name text)
returns boolean
language sql stable
set search_path = ''
as $$
  select
    public.is_pantry_staple(p_name)
    or exists (
      select 1
      from public.pantry_items p
      where p.couple_id = p_couple
        and (
          p.normalized_name = public.normalize_pantry_name(p_name)
          or public.normalize_pantry_name(p_name) like p.normalized_name || ' %'
          or p.normalized_name like public.normalize_pantry_name(p_name) || ' %'
        )
    );
$$;

create or replace function public.sync_menu_shopping(p_couple uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  desired jsonb;
  excluded_keys text[];
  previous_skip text := coalesce(current_setting('ours.skip_activity', true), 'off');
  previous_sync text := coalesce(current_setting('ours.sync_menu', true), 'off');
begin
  select menu_excluded_keys into excluded_keys
  from public.couples where id = p_couple for update;
  if not found then return; end if;
  perform set_config('ours.skip_activity', 'on', true);
  perform set_config('ours.sync_menu', 'on', true);

  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb) into desired
  from (
    select
      md5(regexp_replace(translate(lower(btrim(i.name)), chr(8217)||chr(96), chr(39)||chr(39)), '[[:space:]]+', ' ', 'g') || chr(10) || i.unit) as menu_key,
      min(btrim(i.name)) as name,
      round(sum(i.quantity * m.servings / m.base_servings), 3) as quantity,
      i.unit,
      min(i.category) as category
    from public.meal_plan_items m
    cross join lateral jsonb_to_recordset(m.ingredients) as i(name text, quantity numeric, unit text, category text)
    where m.couple_id = p_couple
      and not m.shopping_completed
      and (i.quantity is null or i.quantity > 0)
    group by regexp_replace(translate(lower(btrim(i.name)), chr(8217)||chr(96), chr(39)||chr(39)), '[[:space:]]+', ' ', 'g'), i.unit
  ) grouped
  where not public.is_in_couple_pantry(p_couple, grouped.name)
    and not (grouped.menu_key = any(excluded_keys));

  update public.shopping_items
  set menu_key = null
  where couple_id = p_couple and session_id is null and menu_key is not null and purchased
    and not exists (select 1 from jsonb_array_elements(desired) d where d->>'menu_key' = shopping_items.menu_key);
  delete from public.shopping_items
  where couple_id = p_couple and session_id is null and menu_key is not null and not purchased
    and not exists (select 1 from jsonb_array_elements(desired) d where d->>'menu_key' = shopping_items.menu_key);
  insert into public.shopping_items(couple_id, added_by, menu_key, name, quantity, unit, category)
  select p_couple, coalesce(auth.uid(), (select created_by from public.couples where id = p_couple)), d.menu_key, d.name, d.quantity, d.unit, d.category
  from jsonb_to_recordset(desired) as d(menu_key text, name text, quantity numeric, unit text, category text)
  on conflict(couple_id, menu_key) where session_id is null and menu_key is not null do update
    set name = excluded.name, quantity = excluded.quantity, unit = excluded.unit, category = excluded.category,
        purchased = shopping_items.purchased and ((shopping_items.quantity is null and excluded.quantity is null) or shopping_items.quantity >= excluded.quantity)
    where row(shopping_items.name, shopping_items.quantity, shopping_items.unit, shopping_items.category)
      is distinct from row(excluded.name, excluded.quantity, excluded.unit, excluded.category);
  perform set_config('ours.skip_activity', previous_skip, true);
  perform set_config('ours.sync_menu', previous_sync, true);
end
$$;

create or replace function public.add_shopping_batch(p_items jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_couple uuid := public.current_couple();
  n integer;
  previous_skip text := coalesce(current_setting('ours.skip_activity', true), 'off');
begin
  if v_couple is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 80 then
    raise exception 'invalid ingredients';
  end if;
  perform set_config('ours.skip_activity', 'on', true);
  insert into public.shopping_items(couple_id, added_by, name, quantity, unit, category, price)
  select v_couple, auth.uid(), x.name, x.quantity, x.unit, x.category, x.price
  from jsonb_to_recordset(p_items) as x(name text, quantity numeric, unit text, category text, price numeric)
  where not public.is_in_couple_pantry(v_couple, x.name);
  get diagnostics n = row_count;
  perform set_config('ours.skip_activity', previous_skip, true);
  if n > 0 then
    insert into public.activity_events(couple_id, actor_id, kind, action, title)
    values(v_couple, auth.uid(), 'shopping', 'added', 'Продукти з рецепта · ' || n::text);
  end if;
  return n;
end
$$;

create or replace function public.refresh_pantry_menu_shopping()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  perform public.sync_menu_shopping(coalesce(new.couple_id, old.couple_id));
  if tg_op = 'DELETE' then return old; else return new; end if;
end
$$;
revoke all on function public.refresh_pantry_menu_shopping() from public, anon, authenticated;

drop trigger if exists pantry_sync_menu on public.pantry_items;
create trigger pantry_sync_menu
  after insert or update or delete on public.pantry_items
  for each row execute function public.refresh_pantry_menu_shopping();

-- ---------------------------------------------------------------------------
-- 020: Budget module (Apple Pay ingest, categories, merchant rules, privacy)
-- ---------------------------------------------------------------------------
create table if not exists public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  name text not null check (length(btrim(name)) between 1 and 50),
  emoji text not null default '📦' check (length(btrim(emoji)) between 1 and 16),
  sort_order integer not null default 100,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists budget_categories_unique_name
  on public.budget_categories(couple_id, kind, lower(btrim(name)));
create index if not exists budget_categories_couple
  on public.budget_categories(couple_id, kind, sort_order);

create table if not exists public.budget_transactions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('expense', 'income')),
  amount numeric(12,2) not null check (amount > 0 and amount < 100000000),
  merchant text not null default '' check (length(merchant) <= 160),
  note text not null default '' check (length(note) <= 500),
  category_key text check (category_key is null or length(btrim(category_key)) between 1 and 64),
  status text not null default 'confirmed' check (status in ('confirmed', 'needs_review')),
  source text not null default 'manual' check (source in ('manual', 'apple_pay')),
  is_private boolean not null default false,
  card_label text not null default '' check (length(card_label) <= 60),
  occurred_on date not null default ((now() at time zone 'Europe/Kyiv')::date),
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status = 'needs_review' or category_key is not null)
);
create index if not exists budget_transactions_couple_date
  on public.budget_transactions(couple_id, occurred_on desc, occurred_at desc);
create index if not exists budget_transactions_needs_review
  on public.budget_transactions(couple_id, status, created_at desc)
  where status = 'needs_review';

create table if not exists public.budget_merchant_rules (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  merchant_pattern text not null check (length(btrim(merchant_pattern)) between 1 and 120),
  normalized_pattern text generated always as (lower(btrim(merchant_pattern))) stored,
  category_key text not null check (length(btrim(category_key)) between 1 and 64),
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(couple_id, normalized_pattern)
);
create index if not exists budget_merchant_rules_couple
  on public.budget_merchant_rules(couple_id);

create table if not exists public.budget_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  share_income_with_partner boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists budget_settings_couple
  on public.budget_settings(couple_id);

create table if not exists public.budget_ingest_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  token_hash bytea not null unique,
  token_hint text not null default '' check (length(token_hint) <= 8),
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists budget_ingest_tokens_couple
  on public.budget_ingest_tokens(couple_id);

alter table public.push_preferences
  add column if not exists budget boolean not null default true;

do $$
declare t text;
begin
  foreach t in array array['budget_categories', 'budget_transactions', 'budget_merchant_rules', 'budget_settings']
  loop
    execute format('drop trigger if exists touch_updated on public.%I', t);
    execute format('create trigger touch_updated before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array['budget_categories', 'budget_transactions', 'budget_merchant_rules', 'budget_settings', 'budget_ingest_tokens']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

drop policy if exists budget_categories_read on public.budget_categories;
create policy budget_categories_read on public.budget_categories
  for select to authenticated using (couple_id = public.current_couple());
drop policy if exists budget_categories_insert on public.budget_categories;
create policy budget_categories_insert on public.budget_categories
  for insert to authenticated
  with check (couple_id = public.current_couple() and (created_by is null or created_by = auth.uid()));
drop policy if exists budget_categories_update on public.budget_categories;
create policy budget_categories_update on public.budget_categories
  for update to authenticated
  using (couple_id = public.current_couple())
  with check (couple_id = public.current_couple());
drop policy if exists budget_categories_delete on public.budget_categories;
create policy budget_categories_delete on public.budget_categories
  for delete to authenticated using (couple_id = public.current_couple());

drop policy if exists budget_transactions_read on public.budget_transactions;
create policy budget_transactions_read on public.budget_transactions
  for select to authenticated
  using (couple_id = public.current_couple() and (user_id = auth.uid() or not is_private));
drop policy if exists budget_transactions_insert on public.budget_transactions;
create policy budget_transactions_insert on public.budget_transactions
  for insert to authenticated
  with check (couple_id = public.current_couple() and user_id = auth.uid());
drop policy if exists budget_transactions_update on public.budget_transactions;
create policy budget_transactions_update on public.budget_transactions
  for update to authenticated
  using (couple_id = public.current_couple() and (user_id = auth.uid() or not is_private))
  with check (couple_id = public.current_couple() and (not is_private or user_id = auth.uid()));
drop policy if exists budget_transactions_delete on public.budget_transactions;
create policy budget_transactions_delete on public.budget_transactions
  for delete to authenticated
  using (couple_id = public.current_couple() and (user_id = auth.uid() or not is_private));

drop policy if exists budget_merchant_rules_read on public.budget_merchant_rules;
create policy budget_merchant_rules_read on public.budget_merchant_rules
  for select to authenticated using (couple_id = public.current_couple());
drop policy if exists budget_merchant_rules_insert on public.budget_merchant_rules;
create policy budget_merchant_rules_insert on public.budget_merchant_rules
  for insert to authenticated
  with check (couple_id = public.current_couple() and (created_by is null or created_by = auth.uid()));
drop policy if exists budget_merchant_rules_update on public.budget_merchant_rules;
create policy budget_merchant_rules_update on public.budget_merchant_rules
  for update to authenticated
  using (couple_id = public.current_couple())
  with check (couple_id = public.current_couple());
drop policy if exists budget_merchant_rules_delete on public.budget_merchant_rules;
create policy budget_merchant_rules_delete on public.budget_merchant_rules
  for delete to authenticated using (couple_id = public.current_couple());

drop policy if exists budget_settings_read on public.budget_settings;
create policy budget_settings_read on public.budget_settings
  for select to authenticated using (couple_id = public.current_couple());
drop policy if exists budget_settings_insert on public.budget_settings;
create policy budget_settings_insert on public.budget_settings
  for insert to authenticated
  with check (user_id = auth.uid() and couple_id = public.current_couple());
drop policy if exists budget_settings_update on public.budget_settings;
create policy budget_settings_update on public.budget_settings
  for update to authenticated
  using (user_id = auth.uid() and couple_id = public.current_couple())
  with check (user_id = auth.uid() and couple_id = public.current_couple());

grant select, insert, delete on public.budget_categories, public.budget_transactions, public.budget_merchant_rules to authenticated;
grant update(name, emoji, sort_order) on public.budget_categories to authenticated;
grant update(kind, amount, merchant, note, category_key, status, is_private, occurred_on, occurred_at) on public.budget_transactions to authenticated;
grant update(merchant_pattern, category_key, kind) on public.budget_merchant_rules to authenticated;
grant select, insert, update on public.budget_settings to authenticated;

create or replace function public.rotate_budget_ingest_token(p_token text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_couple uuid := public.current_couple();
begin
  if auth.uid() is null or v_couple is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid budget ingest token';
  end if;
  insert into public.budget_ingest_tokens(user_id, couple_id, token_hash, token_hint)
  values (auth.uid(), v_couple, sha256(convert_to(p_token, 'UTF8')), right(p_token, 4))
  on conflict (user_id) do update
    set couple_id = excluded.couple_id,
        token_hash = excluded.token_hash,
        token_hint = excluded.token_hint,
        created_at = now();
end $$;

create or replace function public.revoke_budget_ingest_token()
returns void language sql security definer set search_path = '' as $$
  delete from public.budget_ingest_tokens where user_id = auth.uid();
$$;

create or replace function public.budget_ingest_token_status()
returns table(has_token boolean, token_hint text, last_used_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select true as has_token, t.token_hint, t.last_used_at, t.created_at
  from public.budget_ingest_tokens t
  where t.user_id = auth.uid() and t.couple_id = public.current_couple()
  limit 1;
$$;

create or replace function public.resolve_budget_ingest_token(p_token text)
returns table(user_id uuid, couple_id uuid)
language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_couple uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then return; end if;
  select t.user_id, t.couple_id into v_user, v_couple
  from public.budget_ingest_tokens t
  where t.token_hash = sha256(convert_to(p_token, 'UTF8'))
  limit 1;
  if v_user is null then return; end if;
  update public.budget_ingest_tokens set last_used_at = now()
  where public.budget_ingest_tokens.user_id = v_user;
  user_id := v_user; couple_id := v_couple;
  return next;
end $$;

create or replace function public.categorize_budget_transaction(
  p_tx_id uuid,
  p_category_key text,
  p_save_rule boolean default true,
  p_rule_pattern text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_couple uuid := public.current_couple();
  v_tx public.budget_transactions;
  v_pattern text;
begin
  if v_couple is null or p_category_key is null or length(btrim(p_category_key)) = 0 then
    raise exception 'invalid category';
  end if;
  select * into v_tx from public.budget_transactions
  where id = p_tx_id and couple_id = v_couple and (user_id = auth.uid() or not is_private)
  for update;
  if not found then raise exception 'transaction not found'; end if;

  update public.budget_transactions
  set category_key = btrim(p_category_key), status = 'confirmed'
  where id = p_tx_id;

  v_pattern := nullif(btrim(coalesce(p_rule_pattern, v_tx.merchant)), '');
  if p_save_rule and v_pattern is not null then
    insert into public.budget_merchant_rules(couple_id, merchant_pattern, category_key, kind, created_by)
    values (v_couple, left(v_pattern, 120), btrim(p_category_key), v_tx.kind, auth.uid())
    on conflict (couple_id, normalized_pattern) do update
      set category_key = excluded.category_key,
          kind = excluded.kind,
          merchant_pattern = excluded.merchant_pattern;

    update public.budget_transactions
    set category_key = btrim(p_category_key), status = 'confirmed'
    where couple_id = v_couple
      and id <> p_tx_id
      and status = 'needs_review'
      and kind = v_tx.kind
      and (user_id = auth.uid() or not is_private)
      and lower(btrim(merchant)) = lower(btrim(v_tx.merchant));
  end if;
end $$;

create or replace function public.set_budget_income_sharing(p_share boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare v_couple uuid := public.current_couple();
begin
  if auth.uid() is null or v_couple is null then raise exception 'authentication required'; end if;
  insert into public.budget_settings(user_id, couple_id, share_income_with_partner)
  values (auth.uid(), v_couple, p_share)
  on conflict (user_id) do update
    set couple_id = excluded.couple_id,
        share_income_with_partner = excluded.share_income_with_partner;

  update public.budget_transactions
  set is_private = not p_share
  where couple_id = v_couple and user_id = auth.uid();
end $$;

create or replace function public.delete_budget_category(p_category_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_couple uuid := public.current_couple();
  v_kind text;
  v_fallback text;
  v_key text := 'custom:' || p_category_id::text;
begin
  if v_couple is null then raise exception 'authentication required'; end if;
  select kind into v_kind from public.budget_categories
  where id = p_category_id and couple_id = v_couple for update;
  if v_kind is null then return; end if;

  v_fallback := case when v_kind = 'income' then 'other_income' else 'other_expense' end;
  update public.budget_transactions set category_key = v_fallback
  where couple_id = v_couple and category_key = v_key;
  update public.budget_merchant_rules set category_key = v_fallback
  where couple_id = v_couple and category_key = v_key;
  delete from public.budget_categories where id = p_category_id and couple_id = v_couple;
end $$;

revoke all on function
  public.rotate_budget_ingest_token(text),
  public.revoke_budget_ingest_token(),
  public.budget_ingest_token_status(),
  public.resolve_budget_ingest_token(text),
  public.categorize_budget_transaction(uuid, text, boolean, text),
  public.set_budget_income_sharing(boolean),
  public.delete_budget_category(uuid)
from public, anon;

grant execute on function
  public.rotate_budget_ingest_token(text),
  public.revoke_budget_ingest_token(),
  public.budget_ingest_token_status(),
  public.categorize_budget_transaction(uuid, text, boolean, text),
  public.set_budget_income_sharing(boolean),
  public.delete_budget_category(uuid)
to authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.resolve_budget_ingest_token(text) to service_role';
  end if;
end $$;

create or replace function public.enqueue_budget_review_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare endpoint text; hook_secret text;
begin
  if new.source <> 'apple_pay' or new.status <> 'needs_review' then return new; end if;
  select decrypted_secret into endpoint from vault.decrypted_secrets where name = 'ours_push_function_url';
  select decrypted_secret into hook_secret from vault.decrypted_secrets where name = 'ours_push_hook_secret';
  if endpoint is null or hook_secret is null then return new; end if;
  perform net.http_post(
    url := endpoint,
    headers := jsonb_build_object('content-type', 'application/json', 'x-ours-push-secret', hook_secret),
    body := jsonb_build_object('mode', 'budget_review', 'transaction_id', new.id),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  return new;
end $$;

revoke all on function public.enqueue_budget_review_push() from public, anon, authenticated;
drop trigger if exists budget_review_push on public.budget_transactions;
create trigger budget_review_push
  after insert on public.budget_transactions
  for each row execute function public.enqueue_budget_review_push();

-- ---------------------------------------------------------------------------
-- 021: Wish fulfillment, partner activity (plants/budget), recurring payments
-- ---------------------------------------------------------------------------
alter table public.wishes
  add column if not exists fulfilled boolean not null default false;
grant update(fulfilled) on public.wishes to authenticated;

do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.activity_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table public.activity_events drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.activity_events
  add constraint activity_events_kind_check
  check (kind in ('shopping', 'wishes', 'movies', 'events', 'recipes', 'plants', 'budget'));

create or replace function public.log_shared_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_kind text;
  v_action text;
  v_title text;
begin
  if auth.uid() is null or current_setting('ours.skip_activity', true) = 'on' then
    return null;
  end if;
  if tg_op = 'UPDATE' and tg_table_name = 'shopping_items' then
    if new.session_id is distinct from old.session_id or new.session_id is not null then
      return null;
    end if;
  end if;
  if tg_op = 'DELETE' then
    r = to_jsonb(old);
  else
    r = to_jsonb(new);
  end if;
  if tg_table_name = 'budget_transactions' and coalesce((r->>'is_private')::boolean, false) then
    return null;
  end if;
  if tg_table_name = 'wishes' and coalesce((r->>'is_private')::boolean, false) then
    return null;
  end if;
  v_kind = case tg_table_name
    when 'shopping_items' then 'shopping'
    when 'budget_transactions' then 'budget'
    else tg_table_name
  end;
  v_action = case tg_op
    when 'INSERT' then 'added'
    when 'DELETE' then 'deleted'
    else 'updated'
  end;
  if tg_op = 'UPDATE' and tg_table_name = 'shopping_items' and coalesce((r->>'purchased')::boolean, false) then
    v_action = 'purchased';
  end if;
  if tg_table_name = 'budget_transactions' then
    v_title = coalesce(nullif(btrim(r->>'merchant'), ''), 'Операція') || ' · ' || coalesce(r->>'amount', '') || ' ₴';
  else
    v_title = coalesce(nullif(btrim(r->>'name'), ''), nullif(btrim(r->>'title'), ''), 'Оновлення');
  end if;
  insert into public.activity_events(couple_id, actor_id, kind, action, entity_id, title)
  values ((r->>'couple_id')::uuid, auth.uid(), v_kind, v_action, (r->>'id')::uuid, left(v_title, 160));
  return null;
end $$;

revoke all on function public.log_shared_activity() from public, anon, authenticated;

drop trigger if exists shared_activity on public.plants;
create trigger shared_activity
  after insert or update or delete on public.plants
  for each row execute function public.log_shared_activity();

drop trigger if exists shared_activity on public.budget_transactions;
create trigger shared_activity
  after insert or update or delete on public.budget_transactions
  for each row execute function public.log_shared_activity();

create table if not exists public.budget_recurring_payments (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 120),
  kind text not null default 'expense' check (kind in ('expense', 'income')),
  amount numeric(12,2) not null check (amount > 0 and amount < 100000000),
  category_key text not null check (length(btrim(category_key)) between 1 and 64),
  day_of_month integer not null check (day_of_month between 1 and 31),
  active boolean not null default true,
  last_confirmed_month text check (last_confirmed_month is null or last_confirmed_month ~ '^\d{4}-\d{2}$'),
  last_skipped_month text check (last_skipped_month is null or last_skipped_month ~ '^\d{4}-\d{2}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists budget_recurring_couple
  on public.budget_recurring_payments(couple_id, day_of_month);

drop trigger if exists touch_updated on public.budget_recurring_payments;
create trigger touch_updated
  before update on public.budget_recurring_payments
  for each row execute function public.touch_updated_at();

alter table public.budget_recurring_payments enable row level security;
revoke all on public.budget_recurring_payments from public, anon, authenticated;

drop policy if exists budget_recurring_read on public.budget_recurring_payments;
create policy budget_recurring_read on public.budget_recurring_payments
  for select to authenticated using (couple_id = public.current_couple());

drop policy if exists budget_recurring_insert on public.budget_recurring_payments;
create policy budget_recurring_insert on public.budget_recurring_payments
  for insert to authenticated
  with check (couple_id = public.current_couple() and user_id = auth.uid());

drop policy if exists budget_recurring_update on public.budget_recurring_payments;
create policy budget_recurring_update on public.budget_recurring_payments
  for update to authenticated
  using (couple_id = public.current_couple())
  with check (couple_id = public.current_couple());

drop policy if exists budget_recurring_delete on public.budget_recurring_payments;
create policy budget_recurring_delete on public.budget_recurring_payments
  for delete to authenticated using (couple_id = public.current_couple());

grant select, insert, delete on public.budget_recurring_payments to authenticated;
grant update(title, kind, amount, category_key, day_of_month, active, last_confirmed_month, last_skipped_month)
  on public.budget_recurring_payments to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime publication (idempotent)
-- ---------------------------------------------------------------------------
do $$
declare tbl text;
begin
  foreach tbl in array array['plants', 'plant_care_events', 'recipe_cooks', 'recipe_favorites', 'pantry_items', 'budget_categories', 'budget_transactions', 'budget_merchant_rules', 'budget_settings', 'budget_recurring_payments']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 022: Web Push reliability fixes
-- ---------------------------------------------------------------------------
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
      check (kind in ('shopping', 'wishes', 'movies', 'events', 'recipes', 'plants', 'budget'));
  end if;
end $$;

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

commit;
