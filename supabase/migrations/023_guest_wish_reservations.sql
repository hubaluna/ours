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
