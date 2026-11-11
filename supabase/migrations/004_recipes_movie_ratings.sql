begin;
alter table public.movies add column rating integer check(rating between 1 and 10);
alter table public.movies add column metadata_url text not null default '' check(metadata_url='' or (metadata_url ~ '^https://' and length(metadata_url)<=2048));
grant update(rating,metadata_url) on public.movies to authenticated;
create table public.recipes (
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 160),
 category text not null check(category in ('side','protein','salad','main')),
 image_url text not null check(image_url ~ '^https://' and length(image_url)<=2048),
 source_url text not null default '' check(source_url='' or (source_url ~ '^https://' and length(source_url)<=2048)),
 ingredients jsonb not null check(jsonb_typeof(ingredients)='array' and jsonb_array_length(ingredients) between 1 and 80 and octet_length(ingredients::text)<=30000),
 instructions jsonb not null check(jsonb_typeof(instructions)='array' and jsonb_array_length(instructions) between 1 and 60 and octet_length(instructions::text)<=40000),
 added_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index recipes_couple_category on public.recipes(couple_id,category,created_at);
alter table public.recipes enable row level security;
revoke all on public.recipes from anon,authenticated;
create policy recipes_read on public.recipes for select to authenticated using(couple_id=public.current_couple());
create policy recipes_insert on public.recipes for insert to authenticated with check(couple_id=public.current_couple() and added_by=auth.uid());
create policy recipes_update on public.recipes for update to authenticated using(couple_id=public.current_couple()) with check(couple_id=public.current_couple());
create policy recipes_delete on public.recipes for delete to authenticated using(couple_id=public.current_couple());
grant select,insert,delete on public.recipes to authenticated;
grant update(title,category,image_url,source_url,ingredients,instructions) on public.recipes to authenticated;
create trigger touch_updated before update on public.recipes for each row execute function public.touch_updated_at();
alter table public.activity_events drop constraint activity_events_kind_check;
alter table public.activity_events add constraint activity_events_kind_check check(kind in ('shopping','wishes','movies','events','recipes'));
create trigger shared_activity after insert or update or delete on public.recipes for each row execute function public.log_shared_activity();
alter publication supabase_realtime add table public.recipes;
commit;
