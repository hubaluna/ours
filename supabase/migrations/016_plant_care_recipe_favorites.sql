begin;

alter table public.plants add column if not exists wet_checked_at date;

create table public.plant_care_events (
  id uuid primary key default gen_random_uuid(),
  plant_id uuid not null references public.plants(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('watered', 'wet')),
  occurred_at timestamptz not null default now()
);
create index plant_care_events_plant_time on public.plant_care_events(plant_id, occurred_at desc);
alter table public.plant_care_events enable row level security;
revoke all on public.plant_care_events from public, anon, authenticated;
grant select on public.plant_care_events to authenticated;
create policy plant_care_read on public.plant_care_events for select to authenticated
  using (couple_id = public.current_couple());

create function public.record_plant_care(p_plant_id uuid, p_action text)
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

create table public.recipe_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  recipe_key text not null check (recipe_key ~ '^(catalog:ours55/[a-zA-Z0-9_-]+|custom:[0-9a-f-]{36})$'),
  primary key (user_id, recipe_key)
);
alter table public.recipe_favorites enable row level security;
revoke all on public.recipe_favorites from public, anon, authenticated;
grant select, insert, delete on public.recipe_favorites to authenticated;
create policy recipe_favorites_self on public.recipe_favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.recipe_cooks (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  recipe_key text not null,
  actor_id uuid not null references auth.users(id) on delete cascade,
  cooked_at timestamptz not null default now()
);
create index recipe_cooks_couple_time on public.recipe_cooks(couple_id, cooked_at desc);
alter table public.recipe_cooks enable row level security;
revoke all on public.recipe_cooks from public, anon, authenticated;
grant select on public.recipe_cooks to authenticated;
create policy recipe_cooks_read on public.recipe_cooks for select to authenticated
  using (couple_id = public.current_couple());

create function public.finish_menu_item(p_id uuid)
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

alter publication supabase_realtime add table public.plant_care_events;
alter publication supabase_realtime add table public.recipe_cooks;
alter publication supabase_realtime add table public.recipe_favorites;
commit;
