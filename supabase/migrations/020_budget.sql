-- Budget module: shared expenses, private-by-default incomes, custom categories,
-- merchant rules, and per-user Apple Pay Shortcut ingest tokens.
begin;

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

-- Add budget push toggle if push_preferences already exists.
do $$
begin
  if to_regclass('public.push_preferences') is not null then
    alter table public.push_preferences
      add column if not exists budget boolean not null default true;
  end if;
end $$;

-- Touch triggers
do $$
declare t text;
begin
  foreach t in array array['budget_categories', 'budget_transactions', 'budget_merchant_rules', 'budget_settings']
  loop
    execute format('drop trigger if exists touch_updated on public.%I', t);
    execute format('create trigger touch_updated before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

-- RLS
do $$
declare t text;
begin
  foreach t in array array['budget_categories', 'budget_transactions', 'budget_merchant_rules', 'budget_settings', 'budget_ingest_tokens']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
  end loop;
end $$;

-- Categories policies
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

-- Transactions policies (private rows visible & editable ONLY by owner)
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

-- Merchant rules policies
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

-- Budget settings policies (couple can see partner sharing status; user edits own row)
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

-- RPCs
create or replace function public.rotate_budget_ingest_token(p_token text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_couple uuid := public.current_couple();
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
returns void
language sql security definer set search_path = ''
as $$
  delete from public.budget_ingest_tokens where user_id = auth.uid();
$$;

create or replace function public.budget_ingest_token_status()
returns table(has_token boolean, token_hint text, last_used_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select
    true as has_token,
    t.token_hint,
    t.last_used_at,
    t.created_at
  from public.budget_ingest_tokens t
  where t.user_id = auth.uid()
    and t.couple_id = public.current_couple()
  limit 1;
$$;

create or replace function public.resolve_budget_ingest_token(p_token text)
returns table(user_id uuid, couple_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_couple uuid;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    return;
  end if;
  select t.user_id, t.couple_id
    into v_user, v_couple
  from public.budget_ingest_tokens t
  where t.token_hash = sha256(convert_to(p_token, 'UTF8'))
  limit 1;
  if v_user is null then
    return;
  end if;
  update public.budget_ingest_tokens
    set last_used_at = now()
  where public.budget_ingest_tokens.user_id = v_user;
  user_id := v_user;
  couple_id := v_couple;
  return next;
end $$;

create or replace function public.categorize_budget_transaction(
  p_tx_id uuid,
  p_category_key text,
  p_save_rule boolean default true,
  p_rule_pattern text default null
)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_couple uuid := public.current_couple();
  v_tx public.budget_transactions;
  v_pattern text;
begin
  if v_couple is null or p_category_key is null or length(btrim(p_category_key)) = 0 then
    raise exception 'invalid category';
  end if;
  select * into v_tx
  from public.budget_transactions
  where id = p_tx_id
    and couple_id = v_couple
    and (user_id = auth.uid() or not is_private)
  for update;
  if not found then
    raise exception 'transaction not found';
  end if;

  update public.budget_transactions
  set category_key = btrim(p_category_key),
      status = 'confirmed'
  where id = p_tx_id;

  v_pattern := nullif(btrim(coalesce(p_rule_pattern, v_tx.merchant)), '');
  if p_save_rule and v_pattern is not null then
    insert into public.budget_merchant_rules(couple_id, merchant_pattern, category_key, kind, created_by)
    values (v_couple, left(v_pattern, 120), btrim(p_category_key), v_tx.kind, auth.uid())
    on conflict (couple_id, normalized_pattern) do update
      set category_key = excluded.category_key,
          kind = excluded.kind,
          merchant_pattern = excluded.merchant_pattern;

    -- Also resolve other pending Apple Pay transactions from the same merchant.
    update public.budget_transactions
    set category_key = btrim(p_category_key),
        status = 'confirmed'
    where couple_id = v_couple
      and id <> p_tx_id
      and status = 'needs_review'
      and kind = v_tx.kind
      and (user_id = auth.uid() or not is_private)
      and lower(btrim(merchant)) = lower(btrim(v_tx.merchant));
  end if;
end $$;

create or replace function public.set_budget_income_sharing(p_share boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_couple uuid := public.current_couple();
begin
  if auth.uid() is null or v_couple is null then
    raise exception 'authentication required';
  end if;
  insert into public.budget_settings(user_id, couple_id, share_income_with_partner)
  values (auth.uid(), v_couple, p_share)
  on conflict (user_id) do update
    set couple_id = excluded.couple_id,
        share_income_with_partner = excluded.share_income_with_partner;

  update public.budget_transactions
  set is_private = not p_share
  where couple_id = v_couple
    and user_id = auth.uid()
    and kind = 'income';
end $$;

create or replace function public.delete_budget_category(p_category_id uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_couple uuid := public.current_couple();
  v_kind text;
  v_fallback text;
  v_key text := 'custom:' || p_category_id::text;
begin
  if v_couple is null then raise exception 'authentication required'; end if;
  select kind into v_kind
  from public.budget_categories
  where id = p_category_id and couple_id = v_couple
  for update;
  if v_kind is null then return; end if;

  v_fallback := case when v_kind = 'income' then 'other_income' else 'other_expense' end;

  update public.budget_transactions
  set category_key = v_fallback
  where couple_id = v_couple and category_key = v_key;

  update public.budget_merchant_rules
  set category_key = v_fallback
  where couple_id = v_couple and category_key = v_key;

  delete from public.budget_categories
  where id = p_category_id and couple_id = v_couple;
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

-- Web Push notification trigger when Apple Pay payment needs category review
create or replace function public.enqueue_budget_review_push()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  endpoint text;
  hook_secret text;
begin
  if new.source <> 'apple_pay' or new.status <> 'needs_review' then
    return new;
  end if;
  select decrypted_secret into endpoint
    from vault.decrypted_secrets where name = 'ours_push_function_url';
  select decrypted_secret into hook_secret
    from vault.decrypted_secrets where name = 'ours_push_hook_secret';
  if endpoint is null or hook_secret is null then
    return new;
  end if;
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

-- Realtime publication (idempotent)
do $$
declare tbl text;
begin
  foreach tbl in array array['budget_categories', 'budget_transactions', 'budget_merchant_rules', 'budget_settings']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
end $$;

commit;
