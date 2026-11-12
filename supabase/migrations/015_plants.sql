begin;

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

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'plants'
  ) then
    alter publication supabase_realtime add table public.plants;
  end if;
end $$;

commit;
