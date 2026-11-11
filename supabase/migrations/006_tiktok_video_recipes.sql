begin;

alter table public.recipes drop constraint if exists recipes_instructions_check;
alter table public.recipes add constraint recipes_instructions_check check (
  jsonb_typeof(instructions) = 'array'
  and octet_length(instructions::text) <= 40000
  and (
    jsonb_array_length(instructions) between 1 and 60
    or (
      jsonb_array_length(instructions) = 0
      and source_url ~* '^https://(www[.])?tiktok[.]com/@[^/]+/video/[0-9]+([/?#]|$)'
    )
  )
);

commit;
