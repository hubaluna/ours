-- 021: Audit improvements — wish fulfillment, partner activity feed (plants + non-private budget),
-- and recurring budget payments.
begin;

-- 1. Wishes: fulfilled status (marked by owner without deleting to trash)
alter table public.wishes
  add column if not exists fulfilled boolean not null default false;
grant update(fulfilled) on public.wishes to authenticated;

-- 2. Partner activity feed: allow 'plants' and 'budget' kinds and attach triggers
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

  -- Never leak private budget transactions (e.g. private income) or private wishes
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

-- 3. Budget recurring payments
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

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'budget_recurring_payments'
  ) then
    alter publication supabase_realtime add table public.budget_recurring_payments;
  end if;
end $$;

alter table public.budget_recurring_payments replica identity full;

commit;
