-- Guest reservations for publicly shared wishlists
-- Allows anonymous guests to coordinate gift bookings without requiring an account or entering names.
-- Intrigue is maintained because the wishlist owner never sees these records in their private views.

create table if not exists public.guest_wish_reservations (
  wish_id text primary key,
  guest_token text not null,
  created_at timestamptz not null default now()
);

alter table public.guest_wish_reservations enable row level security;

drop policy if exists "guest_reservations_select" on public.guest_wish_reservations;
create policy "guest_reservations_select" on public.guest_wish_reservations
  for select to anon, authenticated
  using (true);

drop policy if exists "guest_reservations_insert" on public.guest_wish_reservations;
create policy "guest_reservations_insert" on public.guest_wish_reservations
  for insert to anon, authenticated
  with check (true);

drop policy if exists "guest_reservations_delete" on public.guest_wish_reservations;
create policy "guest_reservations_delete" on public.guest_wish_reservations
  for delete to anon, authenticated
  using (true);

grant select, insert, delete on public.guest_wish_reservations to anon, authenticated;

-- Public short wishlists storage (allows clean short URLs like /?w=xyz)
create table if not exists public.guest_shared_wishlists (
  id text primary key,
  title text not null,
  occasion text,
  items jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.guest_shared_wishlists enable row level security;

drop policy if exists "guest_shared_wishlists_select" on public.guest_shared_wishlists;
create policy "guest_shared_wishlists_select" on public.guest_shared_wishlists
  for select to anon, authenticated
  using (true);

drop policy if exists "guest_shared_wishlists_insert" on public.guest_shared_wishlists;
create policy "guest_shared_wishlists_insert" on public.guest_shared_wishlists
  for insert to anon, authenticated
  with check (true);

grant select, insert on public.guest_shared_wishlists to anon, authenticated;
