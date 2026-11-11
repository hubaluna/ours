begin;
create function public.valid_menu_ingredients(p_items jsonb) returns boolean language sql immutable set search_path='' as $$
 select jsonb_typeof(p_items)='array' and jsonb_array_length(p_items) between 1 and 80 and octet_length(p_items::text)<=40000 and not exists (
 select 1 from jsonb_array_elements(case when jsonb_typeof(p_items)='array' then p_items else '[]'::jsonb end) i where
 jsonb_typeof(i)<>'object' or jsonb_typeof(i->'name') is distinct from 'string' or length(btrim(i->>'name')) not between 1 and 160 or
 coalesce(i->>'unit','') not in ('г','кг','мл','л','шт.','уп.','зубчик','за смаком','за рецептом') or
 coalesce(i->>'category','') not in ('Овочі та фрукти','М’ясо та риба','Молочні продукти','Бакалія','Напої','Побутові товари','Інше') or
 not case when i->>'unit' in ('за смаком','за рецептом') then i->'quantity' is not distinct from 'null'::jsonb
 when jsonb_typeof(i->'quantity')='number' then (i->>'quantity')::numeric>=0 and (i->>'quantity')::numeric<1000000 else false end
 ) $$;
create table public.recipe_catalog (
 id text primary key, source_id text not null, package text not null,
 title text not null check(length(btrim(title)) between 1 and 160), category text not null check(category in ('side','protein','salad','main')), source_category text not null,
 image_url text not null check(image_url ~ '^https://'), image_type text not null, image_search_url text not null default '',
 base_servings integer not null default 1 check(base_servings=1), total_time_minutes integer not null check(total_time_minutes>0), difficulty text not null,
 ingredients jsonb not null check(public.valid_menu_ingredients(ingredients)), instructions jsonb not null check(jsonb_typeof(instructions)='array'), notes text not null default '',
 recommended_side_ids jsonb not null default '[]'::jsonb, original_data jsonb not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),unique(package,source_id)
);
alter table public.recipe_catalog enable row level security;
revoke all on public.recipe_catalog from anon,authenticated;
grant select on public.recipe_catalog to authenticated;
create policy catalog_read on public.recipe_catalog for select to authenticated using(auth.uid() is not null);
alter table public.recipes add column structured_ingredients jsonb check(structured_ingredients is null or public.valid_menu_ingredients(structured_ingredients));
alter table public.recipes add column base_servings integer not null default 1 check(base_servings between 1 and 12);
alter table public.recipes add column total_time_minutes integer check(total_time_minutes between 1 and 2880);
alter table public.recipes add column difficulty text not null default '';
alter table public.recipes add column notes text not null default '' check(length(notes)<=4000);
grant update(structured_ingredients,base_servings,total_time_minutes,difficulty,notes) on public.recipes to authenticated;
alter table public.couples add column menu_excluded_keys text[] not null default '{}';
alter table public.shopping_items alter column quantity drop not null;
alter table public.shopping_items drop constraint shopping_items_quantity_check;
alter table public.shopping_items drop constraint shopping_items_unit_check;
alter table public.shopping_items add constraint shopping_items_unit_check check(unit in ('шт.','кг','г','л','мл','уп.','зубчик','за смаком','за рецептом'));
alter table public.shopping_items add constraint shopping_items_quantity_check check((quantity is null and unit in ('за смаком','за рецептом')) or (quantity is not null and quantity>0 and quantity<1000000 and unit not in ('за смаком','за рецептом')));
alter table public.shopping_items add column menu_key text;
create unique index shopping_menu_key on public.shopping_items(couple_id,menu_key) where session_id is null and menu_key is not null;
drop policy shopping_insert on public.shopping_items;
create policy shopping_insert on public.shopping_items for insert to authenticated with check(couple_id=public.current_couple() and added_by=auth.uid() and session_id is null and menu_key is null);
create table public.meal_plan_items (
 id uuid primary key default gen_random_uuid(),couple_id uuid not null references public.couples(id) on delete cascade,
 catalog_id text references public.recipe_catalog(id),recipe_id uuid references public.recipes(id) on delete cascade,
 servings integer not null check(servings between 1 and 12),base_servings integer not null check(base_servings between 1 and 12),
 ingredients jsonb not null check(public.valid_menu_ingredients(ingredients)),shopping_completed boolean not null default false,
 added_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),check((catalog_id is null)<>(recipe_id is null))
);
create unique index meal_plan_catalog on public.meal_plan_items(couple_id,catalog_id) where catalog_id is not null;
create unique index meal_plan_custom on public.meal_plan_items(couple_id,recipe_id) where recipe_id is not null;
alter table public.meal_plan_items enable row level security;
revoke all on public.meal_plan_items from anon,authenticated;
grant select on public.meal_plan_items to authenticated;
create policy meal_plan_read on public.meal_plan_items for select to authenticated using(couple_id=public.current_couple());
create trigger touch_updated before update on public.meal_plan_items for each row execute function public.touch_updated_at();
create function public.sync_menu_shopping(p_couple uuid) returns void language plpgsql security definer set search_path='' as $$
 declare desired jsonb;excluded_keys text[];previous_skip text:=coalesce(current_setting('ours.skip_activity',true),'off');previous_sync text:=coalesce(current_setting('ours.sync_menu',true),'off');begin
 select menu_excluded_keys into excluded_keys from public.couples where id=p_couple for update;
 if not found then return;end if;
 perform set_config('ours.skip_activity','on',true);perform set_config('ours.sync_menu','on',true);
 select coalesce(jsonb_agg(to_jsonb(grouped)),'[]'::jsonb) into desired from (
 select md5(regexp_replace(translate(lower(btrim(i.name)),chr(8217)||chr(96),chr(39)||chr(39)),'[[:space:]]+',' ','g')||chr(10)||i.unit) as menu_key,
 min(btrim(i.name)) as name,round(sum(i.quantity*m.servings/m.base_servings),3) as quantity,i.unit,min(i.category) as category
 from public.meal_plan_items m cross join lateral jsonb_to_recordset(m.ingredients) as i(name text,quantity numeric,unit text,category text)
 where m.couple_id=p_couple and not m.shopping_completed and (i.quantity is null or i.quantity>0)
 group by regexp_replace(translate(lower(btrim(i.name)),chr(8217)||chr(96),chr(39)||chr(39)),'[[:space:]]+',' ','g'),i.unit
 ) grouped where not (grouped.menu_key=any(excluded_keys));
 -- Purchased rows stay visible even if the meal is removed; only their link is detached.
 update public.shopping_items set menu_key=null where couple_id=p_couple and session_id is null and menu_key is not null and purchased and not exists(select 1 from jsonb_array_elements(desired) d where d->>'menu_key'=shopping_items.menu_key);
 delete from public.shopping_items where couple_id=p_couple and session_id is null and menu_key is not null and not purchased and not exists(select 1 from jsonb_array_elements(desired) d where d->>'menu_key'=shopping_items.menu_key);
 insert into public.shopping_items(couple_id,added_by,menu_key,name,quantity,unit,category)
 select p_couple,coalesce(auth.uid(),(select created_by from public.couples where id=p_couple)),d.menu_key,d.name,d.quantity,d.unit,d.category
 from jsonb_to_recordset(desired) as d(menu_key text,name text,quantity numeric,unit text,category text)
 on conflict(couple_id,menu_key) where session_id is null and menu_key is not null do update
 set name=excluded.name,quantity=excluded.quantity,unit=excluded.unit,category=excluded.category,
 purchased=shopping_items.purchased and ((shopping_items.quantity is null and excluded.quantity is null) or shopping_items.quantity>=excluded.quantity)
 where row(shopping_items.name,shopping_items.quantity,shopping_items.unit,shopping_items.category) is distinct from row(excluded.name,excluded.quantity,excluded.unit,excluded.category);
 perform set_config('ours.skip_activity',previous_skip,true);perform set_config('ours.sync_menu',previous_sync,true);
 end $$;
create function public.upsert_menu_items(p_items jsonb) returns void language plpgsql security definer set search_path='' as $$
 declare v_couple uuid:=public.current_couple();item jsonb;v_ingredients jsonb;v_base integer;v_servings integer;v_reopen boolean;v_key text;seen text[]:='{}';changed integer:=0;n integer;
 begin
 if v_couple is null then raise exception 'authentication required';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 10 then raise exception 'menu: invalid selection';end if;
 perform 1 from public.couples where id=v_couple for update;
 for item in select value from jsonb_array_elements(p_items) loop
  if (nullif(item->>'catalog_id','') is null)=(nullif(item->>'recipe_id','') is null) or jsonb_typeof(item->'servings')<>'number' then raise exception 'menu: invalid recipe';end if;
  if (item->>'servings')::numeric<>trunc((item->>'servings')::numeric) or (item->>'servings')::numeric not between 1 and 12 then raise exception 'menu: invalid portions';end if;
  v_servings=(item->>'servings')::integer;v_reopen=coalesce((item->>'reopen')::boolean,false);
  v_key=coalesce(item->>'catalog_id',item->>'recipe_id');if v_key=any(seen) then raise exception 'menu: duplicate recipe';end if;seen=array_append(seen,v_key);
  if nullif(item->>'catalog_id','') is not null then
   select ingredients,base_servings into v_ingredients,v_base from public.recipe_catalog where id=item->>'catalog_id';
   if not found then raise exception 'menu: recipe not found';end if;
   insert into public.meal_plan_items(couple_id,catalog_id,servings,base_servings,ingredients,added_by) values(v_couple,item->>'catalog_id',v_servings,v_base,v_ingredients,auth.uid())
   on conflict(couple_id,catalog_id) where catalog_id is not null do update set servings=excluded.servings,base_servings=excluded.base_servings,ingredients=excluded.ingredients,shopping_completed=false
   where row(meal_plan_items.servings,meal_plan_items.base_servings,meal_plan_items.ingredients) is distinct from row(excluded.servings,excluded.base_servings,excluded.ingredients) or (v_reopen and meal_plan_items.shopping_completed);
  else
   select coalesce(structured_ingredients,item->'ingredients'),base_servings into v_ingredients,v_base from public.recipes where id=(item->>'recipe_id')::uuid and couple_id=v_couple;
   if not found or not coalesce(public.valid_menu_ingredients(v_ingredients),false) then raise exception 'menu: invalid private recipe';end if;
   insert into public.meal_plan_items(couple_id,recipe_id,servings,base_servings,ingredients,added_by) values(v_couple,(item->>'recipe_id')::uuid,v_servings,v_base,v_ingredients,auth.uid())
   on conflict(couple_id,recipe_id) where recipe_id is not null do update set servings=excluded.servings,base_servings=excluded.base_servings,ingredients=excluded.ingredients,shopping_completed=false
   where row(meal_plan_items.servings,meal_plan_items.base_servings,meal_plan_items.ingredients) is distinct from row(excluded.servings,excluded.base_servings,excluded.ingredients) or (v_reopen and meal_plan_items.shopping_completed);
  end if;
  get diagnostics n=row_count;changed=changed+n;
 end loop;
 if changed>0 then
 perform public.sync_menu_shopping(v_couple);
 insert into public.activity_events(couple_id,actor_id,kind,action,title) values(v_couple,auth.uid(),'recipes','updated','Меню та продукти оновлено');end if;
 end $$;
create function public.remove_menu_item(p_id uuid) returns void language plpgsql security definer set search_path='' as $$ declare v_couple uuid:=public.current_couple();begin
 if v_couple is null then raise exception 'authentication required';end if;perform 1 from public.couples where id=v_couple for update;
 delete from public.meal_plan_items where id=p_id and couple_id=v_couple;if not found then raise exception 'menu: item not found';end if;
 perform public.sync_menu_shopping(v_couple);insert into public.activity_events(couple_id,actor_id,kind,action,title) values(v_couple,auth.uid(),'recipes','updated','Страву прибрано з меню');end $$;
create function public.restore_menu_products() returns void language plpgsql security definer set search_path='' as $$ declare v_couple uuid:=public.current_couple();begin
 if v_couple is null then raise exception 'authentication required';end if;
 update public.couples set menu_excluded_keys='{}' where id=v_couple;perform public.sync_menu_shopping(v_couple);end $$;
create function public.guard_menu_shopping() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if old.menu_key is null or old.session_id is not null or auth.uid() is null or current_setting('ours.sync_menu',true)='on' then if tg_op='DELETE' then return old;else return new;end if;end if;
 if tg_op='DELETE' then
 update public.couples set menu_excluded_keys=array(select distinct unnest(menu_excluded_keys||array[old.menu_key])) where id=old.couple_id;return old;
 end if;
 if row(new.name,new.quantity,new.unit,new.category) is distinct from row(old.name,old.quantity,old.unit,old.category) then raise exception 'menu: change portions in the menu';end if;return new;end $$;
create trigger guard_menu_shopping before update or delete on public.shopping_items for each row execute function public.guard_menu_shopping();
create function public.refresh_recipe_menu() returns trigger language plpgsql security definer set search_path='' as $$ begin
 if tg_op='UPDATE' and new.structured_ingredients is not null then
 update public.meal_plan_items set ingredients=new.structured_ingredients,base_servings=new.base_servings,shopping_completed=false where recipe_id=new.id and (ingredients is distinct from new.structured_ingredients or base_servings<>new.base_servings);
 end if;
 perform public.sync_menu_shopping(old.couple_id);if tg_op='DELETE' then return old;else return new;end if;end $$;
create trigger refresh_recipe_menu after update or delete on public.recipes for each row execute function public.refresh_recipe_menu();
-- Keep the existing atomic checkout, and mark menu requirements as already bought.
alter function public.finish_shopping() rename to finish_shopping_v1;
revoke all on function public.finish_shopping_v1() from public,anon,authenticated;
create function public.finish_shopping() returns uuid language plpgsql security definer set search_path='' as $$ declare v_id uuid;begin
 v_id=public.finish_shopping_v1();update public.meal_plan_items set shopping_completed=true where couple_id=public.current_couple();return v_id;end $$;
revoke all on function public.valid_menu_ingredients(jsonb),public.sync_menu_shopping(uuid),public.upsert_menu_items(jsonb),public.remove_menu_item(uuid),public.restore_menu_products(),public.guard_menu_shopping(),public.refresh_recipe_menu(),public.finish_shopping() from public,anon;
revoke all on function public.sync_menu_shopping(uuid),public.guard_menu_shopping(),public.refresh_recipe_menu() from authenticated;
grant execute on function public.valid_menu_ingredients(jsonb),public.upsert_menu_items(jsonb),public.remove_menu_item(uuid),public.restore_menu_products(),public.finish_shopping() to authenticated;
alter publication supabase_realtime add table public.meal_plan_items;
commit;
