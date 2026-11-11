begin;

alter table public.events
  add column if not exists url text not null default ''
  check (length(url) <= 2048 and (url = '' or url ~* '^https://'));

grant update(url) on public.events to authenticated;

commit;
