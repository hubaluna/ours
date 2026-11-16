begin;

alter table public.events
  add column if not exists recurrence text not null default 'none'
  check (recurrence in ('none', 'weekly', 'monthly', 'yearly'));

grant update(recurrence) on public.events to authenticated;

drop function if exists public.calendar_feed_events(text);

create function public.calendar_feed_events(p_token text)
returns table (
  id uuid, title text, date date, "time" time, all_day boolean,
  location text, description text, url text, recurrence text, created_at timestamptz
) language sql stable security definer set search_path=''
as $$
  select e.id, e.title, e.date, e.time, e.all_day, e.location,
         e.description, e.url, e.recurrence, e.created_at
  from public.calendar_feed_tokens f
  join public.events e on e.couple_id=f.couple_id
  where length(p_token) = 43
    and f.token_hash=sha256(convert_to(p_token, 'UTF8'))
  order by e.date, e.time nulls first, e.created_at
$$;

revoke all on function public.calendar_feed_events(text) from public;
grant execute on function public.calendar_feed_events(text) to anon, authenticated;

commit;
