begin;

-- Normalize source-style quantities before comparing the ingredient name.
-- Keep this conservative: amounts of meat and produce remain shop items.
create or replace function public.is_pantry_staple(p_name text)
returns boolean
language sql immutable
set search_path = ''
as $$
  with cleaned as (
    select regexp_replace(
      lower(btrim(coalesce(p_name, ''))),
      '[.,;:!?(){}]+', ' ', 'g'
    ) as value
  ), compact as (
    select regexp_replace(value, '[[:space:]]+', ' ', 'g') as value
    from cleaned
  ), unquantified as (
    select btrim(regexp_replace(
      value,
      '^(?:[0-9]+(?:[.,][0-9]+)?(?:/[0-9]+)?|[¼½¾])\s+(?:(?:ст|ч)\s*л|(?:столов(?:а|ої|і)?|чайна)\s+ложк(?:а|и|у|ою)?|tbsp|tsp|tablespoons?|teaspoons?|кг|гр?\.?|г|мл|л|шт\.?|штук|зубчик)\s+',
      '', 'i'
    )) as value
    from compact
  ), normalized as (
    select regexp_replace(value, '[[:punct:][:space:]]+', ' ', 'g') as value
    from unquantified
  )
  select
    value ~* '^(сіль|солі|salt|цукор|цукру|sugar|мед|меду|honey|оцет|оцту|vinegar|вода|води|воду|water|олія|олії|олію|оливкова олія|оливкової олії|соняшникова олія|соняшникової олії|olive oil|sunflower oil)( [[:alnum:]].*)?$'
    or value ~* '^(перець|перцю)( (чорний|чорного|мелений|меленого|горошком|black pepper|pepper)( [[:alnum:]].*)?)?$'
  from normalized;
$$;

commit;
