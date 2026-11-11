begin;

alter table public.wishes
  add column if not exists size text not null default '' check (length(size) <= 120);
grant update(size) on public.wishes to authenticated;

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  title text not null check (length(btrim(title)) between 1 and 160),
  type text not null check (type in ('Кінотеатр','Театр','Музей','Виставка','Парк','Зоопарк','Інше')),
  address text not null default '' check (length(address) <= 300),
  url text not null default '' check (url = '' or (url ~ '^https://' and length(url) <= 2048)),
  planned_date date,
  description text not null default '' check (length(description) <= 2000),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists places_couple_date on public.places(couple_id, planned_date, created_at desc);
alter table public.places enable row level security;
revoke all on public.places from anon, authenticated;
grant select, insert, update, delete on public.places to authenticated;
drop policy if exists places_read on public.places;
create policy places_read on public.places
  for select to authenticated using (couple_id = public.current_couple());
drop policy if exists places_insert on public.places;
create policy places_insert on public.places
  for insert to authenticated with check (couple_id = public.current_couple() and created_by = auth.uid());
drop policy if exists places_update on public.places;
create policy places_update on public.places
  for update to authenticated using (couple_id = public.current_couple())
  with check (couple_id = public.current_couple());
drop policy if exists places_delete on public.places;
create policy places_delete on public.places
  for delete to authenticated using (couple_id = public.current_couple());
drop trigger if exists touch_updated on public.places;
create trigger touch_updated before update on public.places
  for each row execute function public.touch_updated_at();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'places'
  ) then
    alter publication supabase_realtime add table public.places;
  end if;
end
$$;

commit;
