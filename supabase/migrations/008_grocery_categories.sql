begin;

-- Keep every persisted grocery/category payload on the same small Ukrainian
-- taxonomy. Translate legacy names before tightening the checks.
create or replace function public.normalize_grocery_category(p_category text)
returns text
language sql immutable
set search_path = ''
as $$
  select case p_category
    when 'М’ясо та риба' then 'М’ясо, риба та яйця'
    when 'Молочні продукти' then 'Молочне'
    when 'Бакалія' then 'Крупи, макарони та бакалія'
    when 'Побутові товари' then 'Побутове й гігієна'
    when 'Овочі та фрукти' then 'Овочі та фрукти'
    when 'М’ясо, риба та яйця' then 'М’ясо, риба та яйця'
    when 'Молочне' then 'Молочне'
    when 'Хліб і випічка' then 'Хліб і випічка'
    when 'Крупи, макарони та бакалія' then 'Крупи, макарони та бакалія'
    when 'Консервація й соуси' then 'Консервація й соуси'
    when 'Заморожене' then 'Заморожене'
    when 'Солодощі' then 'Солодощі'
    when 'Снеки' then 'Снеки'
    when 'Напої' then 'Напої'
    when 'Побутове й гігієна' then 'Побутове й гігієна'
    else 'Інше'
  end
$$;

create or replace function public.valid_grocery_category(p_category text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_category = any(array[
    'Овочі та фрукти', 'М’ясо, риба та яйця', 'Молочне',
    'Хліб і випічка', 'Крупи, макарони та бакалія',
    'Консервація й соуси', 'Заморожене', 'Солодощі', 'Снеки',
    'Напої', 'Побутове й гігієна', 'Інше'
  ]::text[])
$$;

create or replace function public.normalize_grocery_ingredients(p_items jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select coalesce(jsonb_agg(
    jsonb_set(i.value, '{category}', to_jsonb(public.normalize_grocery_category(i.value->>'category')), true)
    order by i.ordinality
  ), '[]'::jsonb)
  from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end)
    with ordinality as i(value, ordinality)
$$;

alter table public.shopping_items drop constraint if exists shopping_items_category_check;
update public.shopping_items
set category = public.normalize_grocery_category(category)
where not public.valid_grocery_category(category);
alter table public.shopping_items add constraint shopping_items_category_check
  check (public.valid_grocery_category(category));

update public.shopping_product_history
set category = public.normalize_grocery_category(category)
where not public.valid_grocery_category(category);
alter table public.shopping_product_history drop constraint if exists shopping_product_history_category_check;
alter table public.shopping_product_history add constraint shopping_product_history_category_check
  check (public.valid_grocery_category(category));

create or replace function public.valid_menu_ingredients(p_items jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(p_items) = 'array'
    and jsonb_array_length(p_items) between 1 and 80
    and octet_length(p_items::text) <= 40000
    and not exists (
      select 1
      from jsonb_array_elements(case when jsonb_typeof(p_items) = 'array' then p_items else '[]'::jsonb end) i
      where jsonb_typeof(i) <> 'object'
        or jsonb_typeof(i->'name') is distinct from 'string'
        or length(btrim(i->>'name')) not between 1 and 160
        or coalesce(i->>'unit','') not in ('г','кг','мл','л','шт.','уп.','зубчик','за смаком','за рецептом')
        or not public.valid_grocery_category(i->>'category')
        or not case
          when i->>'unit' in ('за смаком','за рецептом') then i->'quantity' is not distinct from 'null'::jsonb
          when jsonb_typeof(i->'quantity') = 'number' then (i->>'quantity')::numeric >= 0 and (i->>'quantity')::numeric < 1000000
          else false
        end
    )
$$;

update public.recipes
set structured_ingredients = public.normalize_grocery_ingredients(structured_ingredients)
where structured_ingredients is not null;
update public.recipe_catalog
set ingredients = public.normalize_grocery_ingredients(ingredients);
update public.meal_plan_items
set ingredients = public.normalize_grocery_ingredients(ingredients);

create or replace function public.is_pantry_staple(p_name text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select
    regexp_replace(lower(btrim(coalesce(p_name, ''))), '[[:punct:][:space:]]+', ' ', 'g')
      ~* '^(сіль|солі|salt|цукор|цукру|sugar|мед|меду|honey|оцет|оцту|vinegar|вода|води|воду|water|олія|олії|олію|оливкова олія|оливкової олії|соняшникова олія|соняшникової олії|olive oil|sunflower oil)( [[:alnum:]].*)?$'
    or regexp_replace(lower(btrim(coalesce(p_name, ''))), '[[:punct:][:space:]]+', ' ', 'g')
      ~* '^(перець|перцю)( (чорний|чорного|мелений|меленого|горошком|black pepper|pepper)( [[:alnum:]].*)?)?$'
$$;

create or replace function public.sync_menu_shopping(p_couple uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  desired jsonb;
  excluded_keys text[];
  previous_skip text := coalesce(current_setting('ours.skip_activity', true), 'off');
  previous_sync text := coalesce(current_setting('ours.sync_menu', true), 'off');
begin
  select menu_excluded_keys into excluded_keys
  from public.couples where id = p_couple for update;
  if not found then return; end if;
  perform set_config('ours.skip_activity', 'on', true);
  perform set_config('ours.sync_menu', 'on', true);

  select coalesce(jsonb_agg(to_jsonb(grouped)), '[]'::jsonb) into desired
  from (
    select
      md5(regexp_replace(translate(lower(btrim(i.name)), chr(8217)||chr(96), chr(39)||chr(39)), '[[:space:]]+', ' ', 'g') || chr(10) || i.unit) as menu_key,
      min(btrim(i.name)) as name,
      round(sum(i.quantity * m.servings / m.base_servings), 3) as quantity,
      i.unit,
      min(i.category) as category
    from public.meal_plan_items m
    cross join lateral jsonb_to_recordset(m.ingredients) as i(name text, quantity numeric, unit text, category text)
    where m.couple_id = p_couple
      and not m.shopping_completed
      and (i.quantity is null or i.quantity > 0)
    group by regexp_replace(translate(lower(btrim(i.name)), chr(8217)||chr(96), chr(39)||chr(39)), '[[:space:]]+', ' ', 'g'), i.unit
  ) grouped
  where not public.is_pantry_staple(grouped.name)
    and not (grouped.menu_key = any(excluded_keys));

  update public.shopping_items
  set menu_key = null
  where couple_id = p_couple and session_id is null and menu_key is not null and purchased
    and not exists (select 1 from jsonb_array_elements(desired) d where d->>'menu_key' = shopping_items.menu_key);
  delete from public.shopping_items
  where couple_id = p_couple and session_id is null and menu_key is not null and not purchased
    and not exists (select 1 from jsonb_array_elements(desired) d where d->>'menu_key' = shopping_items.menu_key);
  insert into public.shopping_items(couple_id, added_by, menu_key, name, quantity, unit, category)
  select p_couple, coalesce(auth.uid(), (select created_by from public.couples where id = p_couple)), d.menu_key, d.name, d.quantity, d.unit, d.category
  from jsonb_to_recordset(desired) as d(menu_key text, name text, quantity numeric, unit text, category text)
  on conflict(couple_id, menu_key) where session_id is null and menu_key is not null do update
    set name = excluded.name, quantity = excluded.quantity, unit = excluded.unit, category = excluded.category,
        purchased = shopping_items.purchased and ((shopping_items.quantity is null and excluded.quantity is null) or shopping_items.quantity >= excluded.quantity)
    where row(shopping_items.name, shopping_items.quantity, shopping_items.unit, shopping_items.category)
      is distinct from row(excluded.name, excluded.quantity, excluded.unit, excluded.category);
  perform set_config('ours.skip_activity', previous_skip, true);
  perform set_config('ours.sync_menu', previous_sync, true);
end
$$;

create or replace function public.add_shopping_batch(p_items jsonb)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_couple uuid := public.current_couple();
  n integer;
  previous_skip text := coalesce(current_setting('ours.skip_activity', true), 'off');
begin
  if v_couple is null then raise exception 'authentication required'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) not between 1 and 80 then
    raise exception 'invalid ingredients';
  end if;
  perform set_config('ours.skip_activity', 'on', true);
  insert into public.shopping_items(couple_id, added_by, name, quantity, unit, category, price)
  select v_couple, auth.uid(), x.name, x.quantity, x.unit, x.category, x.price
  from jsonb_to_recordset(p_items) as x(name text, quantity numeric, unit text, category text, price numeric)
  where not public.is_pantry_staple(x.name);
  get diagnostics n = row_count;
  perform set_config('ours.skip_activity', previous_skip, true);
  if n > 0 then
    insert into public.activity_events(couple_id, actor_id, kind, action, title)
    values(v_couple, auth.uid(), 'shopping', 'added', 'Продукти з рецепта · ' || n::text);
  end if;
  return n;
end
$$;

-- Remove newly excluded pantry staples from existing generated menu rows;
-- manual and purchased shopping rows are preserved by the sync routine.
do $$
declare
  r record;
begin
  for r in select id from public.couples loop
    perform public.sync_menu_shopping(r.id);
  end loop;
end
$$;

commit;
