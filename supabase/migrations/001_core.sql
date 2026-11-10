-- ours. Core schema. Run once in Supabase SQL editor, then 002_storage_realtime.sql.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 60),
 avatar_path text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.couples (id uuid primary key default gen_random_uuid(), created_by uuid not null references auth.users(id), created_at timestamptz not null default now());
create table public.couple_members (
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id) on delete cascade,
 user_id uuid not null unique references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), unique(couple_id,user_id)
);
create index couple_members_couple on public.couple_members(couple_id);
create table public.couple_invites (
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id) on delete cascade,
 created_by uuid not null references public.profiles(id), token_hash bytea not null unique,
 expires_at timestamptz not null default now()+interval '48 hours', used_at timestamptz, created_at timestamptz not null default now()
);
create index couple_invites_couple on public.couple_invites(couple_id);
create table public.shopping_sessions (id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id) on delete cascade, created_at timestamptz not null default now(), unique(id,couple_id));
create index shopping_sessions_couple on public.shopping_sessions(couple_id,created_at desc);
create table public.shopping_items (
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id) on delete cascade,
 name text not null check(length(btrim(name)) between 1 and 160), quantity numeric not null default 1 check(quantity>0 and quantity<1000000), unit text not null default 'шт.' check(unit in ('шт.','кг','г','л','мл','уп.')),
 category text not null default 'Інше' check(category in ('Овочі та фрукти','М’ясо та риба','Молочні продукти','Бакалія','Напої','Побутові товари','Інше')),
 price numeric check(price>=0 and price<100000000), added_by uuid not null references public.profiles(id), purchased boolean not null default false,
 session_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), foreign key(session_id,couple_id) references public.shopping_sessions(id,couple_id)
);
create index shopping_items_active on public.shopping_items(couple_id,purchased,created_at) where session_id is null;
create index shopping_items_session on public.shopping_items(session_id);
create table public.shopping_product_history (
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id) on delete cascade,
 name text not null, name_key text generated always as (lower(btrim(name))) stored,
 category text not null, unit text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(couple_id,name_key)
);
create table public.wishes (
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id) on delete cascade, owner_id uuid not null references public.profiles(id),
 name text not null check(length(btrim(name)) between 1 and 160), price numeric check(price>=0 and price<100000000), url text not null default '' check(url='' or (url ~ '^https?://' and length(url)<=2048)),
 priority text not null default 'Просто хочу' check(priority in ('Просто хочу','Дуже хочу','Мрія')), note text not null default '' check(length(note)<=2000), image_path text,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index wishes_couple_owner on public.wishes(couple_id,owner_id,created_at desc);
-- Reservation fields NEVER live on wishes. No trigger updates wishes on reservation changes.
create table public.gift_reservations (
 id uuid primary key default gen_random_uuid(), wish_id uuid not null unique references public.wishes(id) on delete cascade,
 reserved_by uuid not null references public.profiles(id), status text not null default 'planned' check(status in ('planned','purchased')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index gift_reservations_author on public.gift_reservations(reserved_by);
create table public.events (
 id uuid primary key default gen_random_uuid(), couple_id uuid not null references public.couples(id) on delete cascade,
 title text not null check(length(btrim(title)) between 1 and 160), date date not null, time time, all_day boolean not null default false,
 location text not null default '' check(length(location)<=300), description text not null default '' check(length(description)<=2000),
 category text not null default 'Інше' check(category in ('Побачення','Поїздка','Побут','Свято','Інше')), created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check(not all_day or time is null)
);
create index events_couple_date on public.events(couple_id,date);
-- Fixed search_path and qualified objects prevent search path injection.
create function public.current_couple() returns uuid language sql stable security definer set search_path='' as $$ select couple_id from public.couple_members where user_id=auth.uid() $$;
create function public.same_couple(p_user uuid) returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.couple_members where user_id=p_user and couple_id=public.current_couple()) $$;
create function public.touch_updated_at() returns trigger language plpgsql set search_path='' as $$ begin new.updated_at=now();return new;end $$;
do $$ declare t text;begin foreach t in array array['profiles','shopping_items','shopping_product_history','wishes','gift_reservations','events'] loop execute format('create trigger touch_updated before update on public.%I for each row execute function public.touch_updated_at()',t);end loop;end $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,name) values(new.id,left(coalesce(nullif(btrim(new.raw_user_meta_data->>'name'),''),'Мій профіль'),60));return new;end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
-- Also support accounts that existed before the migration.
insert into public.profiles(id,name) select id,left(coalesce(nullif(btrim(raw_user_meta_data->>'name'),''),'Мій профіль'),60) from auth.users on conflict(id) do nothing;
create function public.limit_members() returns trigger language plpgsql security definer set search_path='' as $$ begin perform 1 from public.couples where id=new.couple_id for update; if (select count(*) from public.couple_members where couple_id=new.couple_id)>=2 then raise exception 'invite: space is full';end if;return new;end $$;
create trigger limit_couple_size before insert on public.couple_members for each row execute function public.limit_members();
create function public.create_couple() returns uuid language plpgsql security definer set search_path='' as $$ declare v_id uuid;begin
 if auth.uid() is null then raise exception 'authentication required';end if;
 -- Profile lock serializes two concurrent create/join requests by the same user.
 perform 1 from public.profiles where id=auth.uid() for update;
 if exists(select 1 from public.couple_members where user_id=auth.uid()) then raise exception 'already a member';end if;
 insert into public.couples(created_by) values(auth.uid()) returning id into v_id;
 insert into public.couple_members(couple_id,user_id) values(v_id,auth.uid());return v_id;end $$;
create function public.create_invite() returns text language plpgsql security definer set search_path='' as $$ declare v_couple uuid:=public.current_couple();v_token text;begin
 if v_couple is null then raise exception 'authentication required';end if;
 perform 1 from public.couples where id=v_couple for update;
 if (select count(*) from public.couple_members where couple_id=v_couple)<>1 then raise exception 'invite: space is full';end if;
 update public.couple_invites set expires_at=now() where couple_id=v_couple and used_at is null;
 v_token:=replace(gen_random_uuid()::text,'-','')||replace(gen_random_uuid()::text,'-','');
 insert into public.couple_invites(couple_id,created_by,token_hash) values(v_couple,auth.uid(),sha256(convert_to(v_token,'UTF8')));return v_token;end $$;
create function public.join_couple(p_token text) returns uuid language plpgsql security definer set search_path='' as $$ declare v_invite public.couple_invites;v_couple uuid;begin
 if auth.uid() is null then raise exception 'authentication required';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 if exists(select 1 from public.couple_members where user_id=auth.uid()) then raise exception 'already a member';end if;
 if p_token is null or length(p_token)<>64 then raise exception 'invite invalid';end if;
 select couple_id into v_couple from public.couple_invites where token_hash=sha256(convert_to(p_token,'UTF8'));
 if v_couple is null then raise exception 'invite invalid';end if;
 perform 1 from public.couples where id=v_couple for update;
 select * into v_invite from public.couple_invites where token_hash=sha256(convert_to(p_token,'UTF8')) for update;
 if v_invite.used_at is not null or v_invite.expires_at<=now() or v_invite.created_by=auth.uid() or (select count(*) from public.couple_members where couple_id=v_couple)>=2 then raise exception 'invite invalid or expired';end if;
 insert into public.couple_members(couple_id,user_id) values(v_couple,auth.uid());update public.couple_invites set used_at=now() where id=v_invite.id;return v_couple;end $$;
-- All browser shopping mutations take the space lock BEFORE row locks.
-- This prevents a new, unpurchased item from slipping into a finishing session.
create function public.lock_shopping_space() returns trigger language plpgsql security definer set search_path='' as $$ declare v_couple uuid:=public.current_couple();begin
 if v_couple is not null then perform 1 from public.couples where id=v_couple for update;end if;return null;end $$;
create trigger serialize_shopping before insert or update or delete on public.shopping_items for each statement execute function public.lock_shopping_space();
create function public.finish_shopping() returns uuid language plpgsql security definer set search_path='' as $$ declare v_couple uuid:=public.current_couple();v_id uuid;begin
 if v_couple is null then raise exception 'authentication required';end if;
 perform 1 from public.couples where id=v_couple for update;
 perform 1 from public.shopping_items where couple_id=v_couple and session_id is null for update;
 if not exists(select 1 from public.shopping_items where couple_id=v_couple and session_id is null) then raise exception 'empty list';end if;
 if exists(select 1 from public.shopping_items where couple_id=v_couple and session_id is null and not purchased) then raise exception 'unfinished shopping';end if;
 insert into public.shopping_sessions(couple_id) values(v_couple) returning id into v_id;
 insert into public.shopping_product_history(couple_id,name,category,unit) select distinct on(lower(btrim(name))) v_couple,name,category,unit from public.shopping_items where couple_id=v_couple and session_id is null order by lower(btrim(name)),updated_at desc on conflict(couple_id,name_key) do update set category=excluded.category,unit=excluded.unit,updated_at=now();
 update public.shopping_items set session_id=v_id where couple_id=v_couple and session_id is null;return v_id;end $$;
create function public.repeat_shopping(p_session uuid) returns void language plpgsql security definer set search_path='' as $$ declare v_couple uuid:=public.current_couple();begin
 if v_couple is null or not exists(select 1 from public.shopping_sessions where id=p_session and couple_id=v_couple) then raise exception 'access denied';end if;
 insert into public.shopping_items(couple_id,name,quantity,unit,category,price,added_by) select v_couple,name,quantity,unit,category,price,auth.uid() from public.shopping_items where session_id=p_session and couple_id=v_couple;end $$;
-- RLS is enabled on EVERY application table, including those mutated only via RPC.
do $$ declare t text;begin foreach t in array array['profiles','couples','couple_members','couple_invites','shopping_sessions','shopping_items','shopping_product_history','wishes','gift_reservations','events'] loop execute format('alter table public.%I enable row level security',t);execute format('revoke all on public.%I from anon,authenticated',t);end loop;end $$;
create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or public.same_couple(id));
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid() and (avatar_path is null or avatar_path like public.current_couple()::text||'/'||auth.uid()::text||'/%'));
create policy couples_read on public.couples for select to authenticated using(id=public.current_couple());
create policy members_read on public.couple_members for select to authenticated using(couple_id=public.current_couple());
create policy invites_read on public.couple_invites for select to authenticated using(created_by=auth.uid() and couple_id=public.current_couple());
create policy sessions_read on public.shopping_sessions for select to authenticated using(couple_id=public.current_couple());
create policy history_read on public.shopping_product_history for select to authenticated using(couple_id=public.current_couple());
create policy shopping_read on public.shopping_items for select to authenticated using(couple_id=public.current_couple());
create policy shopping_insert on public.shopping_items for insert to authenticated with check(couple_id=public.current_couple() and added_by=auth.uid() and session_id is null);
create policy shopping_update on public.shopping_items for update to authenticated using(couple_id=public.current_couple() and session_id is null) with check(couple_id=public.current_couple() and session_id is null);
create policy shopping_delete on public.shopping_items for delete to authenticated using(couple_id=public.current_couple() and session_id is null);
create policy wishes_read on public.wishes for select to authenticated using(couple_id=public.current_couple());
create policy wishes_insert on public.wishes for insert to authenticated with check(couple_id=public.current_couple() and owner_id=auth.uid() and (image_path is null or image_path like couple_id::text||'/'||auth.uid()::text||'/%'));
create policy wishes_update on public.wishes for update to authenticated using(couple_id=public.current_couple() and owner_id=auth.uid()) with check(couple_id=public.current_couple() and owner_id=auth.uid() and (image_path is null or image_path like couple_id::text||'/'||auth.uid()::text||'/%'));
create policy wishes_delete on public.wishes for delete to authenticated using(couple_id=public.current_couple() and owner_id=auth.uid());
-- Neither couple membership alone nor ownership of the wish grants access to a reservation.
create policy reservation_read on public.gift_reservations for select to authenticated using(reserved_by=auth.uid() and exists(select 1 from public.wishes w where w.id=wish_id and w.couple_id=public.current_couple() and w.owner_id<>auth.uid()));
create policy reservation_insert on public.gift_reservations for insert to authenticated with check(reserved_by=auth.uid() and exists(select 1 from public.wishes w where w.id=wish_id and w.couple_id=public.current_couple() and w.owner_id<>auth.uid()));
create policy reservation_update on public.gift_reservations for update to authenticated using(reserved_by=auth.uid()) with check(reserved_by=auth.uid() and exists(select 1 from public.wishes w where w.id=wish_id and w.couple_id=public.current_couple() and w.owner_id<>auth.uid()));
create policy reservation_delete on public.gift_reservations for delete to authenticated using(reserved_by=auth.uid());
create policy events_read on public.events for select to authenticated using(couple_id=public.current_couple());
create policy events_insert on public.events for insert to authenticated with check(couple_id=public.current_couple() and created_by=auth.uid());
create policy events_update on public.events for update to authenticated using(couple_id=public.current_couple()) with check(couple_id=public.current_couple());
create policy events_delete on public.events for delete to authenticated using(couple_id=public.current_couple());
grant select on public.profiles,public.couples,public.couple_members,public.couple_invites,public.shopping_sessions,public.shopping_items,public.shopping_product_history,public.wishes,public.gift_reservations,public.events to authenticated;
grant insert,delete on public.shopping_items,public.wishes,public.gift_reservations,public.events to authenticated;
grant update(name,avatar_path) on public.profiles to authenticated;
grant update(name,quantity,unit,category,price,purchased) on public.shopping_items to authenticated;
grant update(name,price,url,priority,note,image_path) on public.wishes to authenticated;
grant update(status) on public.gift_reservations to authenticated;
grant update(title,date,time,all_day,location,description,category) on public.events to authenticated;
-- Functions are executable by PUBLIC unless explicitly revoked.
revoke all on function public.current_couple(),public.same_couple(uuid),public.create_couple(),public.create_invite(),public.join_couple(text),public.finish_shopping(),public.repeat_shopping(uuid),public.handle_new_user(),public.limit_members(),public.touch_updated_at(),public.lock_shopping_space() from public,anon;
grant execute on function public.current_couple(),public.same_couple(uuid),public.create_couple(),public.create_invite(),public.join_couple(text),public.finish_shopping(),public.repeat_shopping(uuid) to authenticated;
commit;
