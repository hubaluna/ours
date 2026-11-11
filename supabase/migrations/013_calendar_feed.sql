begin;

create table public.calendar_feed_tokens (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  token_hash bytea not null unique,
  created_at timestamptz not null default now()
);
alter table public.calendar_feed_tokens enable row level security;
revoke all on public.calendar_feed_tokens from public, anon, authenticated;

create function public.rotate_calendar_feed_token(p_token text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_couple uuid := public.current_couple();
begin
  if v_couple is null or p_token !~ '^[A-Za-z0-9_-]{43}$' then
    raise exception 'invalid calendar feed';
  end if;
  insert into public.calendar_feed_tokens(couple_id, token_hash)
  values(v_couple, sha256(convert_to(p_token, 'UTF8')))
  on conflict(couple_id) do update
    set token_hash=excluded.token_hash, created_at=now();
end $$;

create function public.revoke_calendar_feed_token()
returns void language sql security definer set search_path=''
as $$ delete from public.calendar_feed_tokens where couple_id=public.current_couple() $$;

create function public.calendar_feed_events(p_token text)
returns table (
  id uuid, title text, date date, "time" time, all_day boolean,
  location text, description text, url text, created_at timestamptz
) language sql stable security definer set search_path=''
as $$
  select e.id, e.title, e.date, e.time, e.all_day, e.location,
         e.description, e.url, e.created_at
  from public.calendar_feed_tokens f
  join public.events e on e.couple_id=f.couple_id
  where length(p_token) = 43
    and f.token_hash=sha256(convert_to(p_token, 'UTF8'))
  order by e.date, e.time nulls first, e.created_at
$$;

revoke all on function public.rotate_calendar_feed_token(text), public.revoke_calendar_feed_token(), public.calendar_feed_events(text) from public;
revoke all on function public.rotate_calendar_feed_token(text), public.revoke_calendar_feed_token(), public.calendar_feed_events(text) from anon;
grant execute on function public.rotate_calendar_feed_token(text), public.revoke_calendar_feed_token() to authenticated;
grant execute on function public.calendar_feed_events(text) to anon, authenticated;

commit;
