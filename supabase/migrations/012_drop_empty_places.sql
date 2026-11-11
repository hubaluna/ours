begin;

-- Places was removed from the product. Never discard a saved row silently.
do $$
begin
  if to_regclass('public.places') is null then
    return;
  end if;
  if exists (select 1 from public.places) then
    raise exception 'Cannot drop public.places while it contains saved records';
  end if;
  drop table public.places;
end;
$$;

commit;
