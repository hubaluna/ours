-- Existing projects: apply this migration once, after 001 and 002.
begin;
alter table public.wishes add column image_url text not null default '' check(image_url='' or (image_url ~ '^https://' and length(image_url)<=2048));
create table public.movies(
 id uuid primary key default gen_random_uuid(),couple_id uuid not null references public.couples(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 160),url text not null default '' check(url='' or (url ~ '^https://' and length(url)<=2048)),
 poster_url text not null default '' check(poster_url='' or (poster_url ~ '^https://' and length(poster_url)<=2048)),
 year integer check(year between 1888 and 2200),genres text not null default '' check(length(genres)<=300),description text not null default '' check(length(description)<=2000),
 status text not null default 'planned' check(status in ('planned','watched')),added_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index movies_couple_status on public.movies(couple_id,status,created_at desc);
create trigger touch_updated before update on public.movies for each row execute function public.touch_updated_at();
create table public.activity_events(
 id uuid primary key default gen_random_uuid(),couple_id uuid not null references public.couples(id) on delete cascade,actor_id uuid not null references public.profiles(id),
 kind text not null check(kind in ('shopping','wishes','movies','events')),action text not null check(action in ('added','updated','deleted','purchased')),entity_id uuid,
 title text not null check(length(title)<=160),created_at timestamptz not null default now()
);
create index activity_couple_time on public.activity_events(couple_id,created_at desc);
create table public.activity_reads(
 id uuid primary key default gen_random_uuid(),activity_id uuid not null references public.activity_events(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,
 created_at timestamptz not null default now(),unique(user_id,activity_id)
);
create index activity_reads_user on public.activity_reads(user_id);
create table public.link_import_limits(user_id uuid primary key references public.profiles(id) on delete cascade,window_started timestamptz not null default now(),requests integer not null default 1 check(requests between 1 and 9),created_at timestamptz not null default now());
do $$ declare t text;begin foreach t in array array['movies','activity_events','activity_reads','link_import_limits'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);end loop;end $$;
create policy movies_read on public.movies for select to authenticated using(couple_id=public.current_couple());
create policy movies_insert on public.movies for insert to authenticated with check(couple_id=public.current_couple() and added_by=auth.uid());
create policy movies_update on public.movies for update to authenticated using(couple_id=public.current_couple()) with check(couple_id=public.current_couple());
create policy movies_delete on public.movies for delete to authenticated using(couple_id=public.current_couple());
create policy activity_read on public.activity_events for select to authenticated using(couple_id=public.current_couple());
create policy receipts_read on public.activity_reads for select to authenticated using(user_id=auth.uid() and exists(select 1 from public.activity_events a where a.id=activity_id and a.couple_id=public.current_couple()));
grant select,insert,delete on public.movies to authenticated;
grant update(title,url,poster_url,year,genres,description,status) on public.movies to authenticated;
grant update(image_url) on public.wishes to authenticated;
grant select on public.activity_events,public.activity_reads to authenticated;
create function public.log_shared_activity() returns trigger language plpgsql security definer set search_path='' as $$ declare r jsonb;v_kind text;v_action text;begin
 if auth.uid() is null or current_setting('ours.skip_activity',true)='on' then return null;end if;
 if tg_op='UPDATE' and tg_table_name='shopping_items' then if new.session_id is distinct from old.session_id or new.session_id is not null then return null;end if;end if;
 if tg_op='DELETE' then r=to_jsonb(old);else r=to_jsonb(new);end if;
 v_kind=case tg_table_name when 'shopping_items' then 'shopping' else tg_table_name end;
 v_action=case tg_op when 'INSERT' then 'added' when 'DELETE' then 'deleted' else 'updated' end;
 if tg_op='UPDATE' and tg_table_name='shopping_items' and (r->>'purchased')::boolean then v_action='purchased';end if;
 insert into public.activity_events(couple_id,actor_id,kind,action,entity_id,title) values((r->>'couple_id')::uuid,auth.uid(),v_kind,v_action,(r->>'id')::uuid,left(coalesce(r->>'name',r->>'title','Оновлення'),160));return null;
end $$;
do $$ declare t text;begin foreach t in array array['shopping_items','wishes','movies','events'] loop execute format('create trigger shared_activity after insert or update or delete on public.%I for each row execute function public.log_shared_activity()',t);end loop;end $$;
-- No activity trigger or publication for gift_reservations.
create function public.mark_activity_read(p_ids uuid[]) returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or public.current_couple() is null then raise exception 'authentication required';end if;
 if coalesce(array_length(p_ids,1),0)>1000 then raise exception 'too many updates';end if;
 insert into public.activity_reads(activity_id,user_id) select id,auth.uid() from public.activity_events where id=any(p_ids) and couple_id=public.current_couple() and actor_id<>auth.uid() on conflict(user_id,activity_id) do nothing;
end $$;
create function public.add_shopping_batch(p_items jsonb) returns integer language plpgsql security definer set search_path='' as $$ declare v_couple uuid:=public.current_couple();n integer;begin
 if v_couple is null then raise exception 'authentication required';end if;
 if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 80 then raise exception 'invalid ingredients';end if;
 perform set_config('ours.skip_activity','on',true);
 insert into public.shopping_items(couple_id,added_by,name,quantity,unit,category,price)
 select v_couple,auth.uid(),x.name,x.quantity,x.unit,x.category,x.price from jsonb_to_recordset(p_items) as x(name text,quantity numeric,unit text,category text,price numeric);
 get diagnostics n=row_count;
 perform set_config('ours.skip_activity','off',true);
 insert into public.activity_events(couple_id,actor_id,kind,action,title) values(v_couple,auth.uid(),'shopping','added','Продукти з рецепта · '||n::text);return n;
end $$;
create function public.consume_link_import() returns boolean language plpgsql security definer set search_path='' as $$ declare n integer;begin
 if auth.uid() is null or public.current_couple() is null then return false;end if;
 insert into public.link_import_limits(user_id) values(auth.uid()) on conflict(user_id) do update set window_started=case when public.link_import_limits.window_started<now()-interval '1 minute' then now() else public.link_import_limits.window_started end,requests=case when public.link_import_limits.window_started<now()-interval '1 minute' then 1 else least(public.link_import_limits.requests+1,9) end returning requests into n;return n<=8;
end $$;
revoke all on function public.log_shared_activity(),public.mark_activity_read(uuid[]),public.add_shopping_batch(jsonb),public.consume_link_import() from public,anon;
grant execute on function public.mark_activity_read(uuid[]),public.add_shopping_batch(jsonb),public.consume_link_import() to authenticated;
do $$ declare t text;begin foreach t in array array['movies','activity_events','activity_reads'] loop if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;end loop;end $$;
commit;
