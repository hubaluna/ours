-- Home pantry ("єВдома"): couple-scoped home inventory synced with menu shopping generation.
begin;

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

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pantry_items'
  ) then
    alter publication supabase_realtime add table public.pantry_items;
  end if;
end $$;

commit;
