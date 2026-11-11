begin;

-- A wish is shared by default. Private rows are visible only to their owner.
alter table public.wishes
  add column if not exists is_private boolean not null default false,
  add column if not exists is_deleted boolean not null default false;
create index if not exists wishes_private_owner
  on public.wishes(couple_id, owner_id, created_at desc)
  where is_private;

-- Keep private image paths private even after a wish is deleted or its image
-- is replaced. Removing the Storage object cascades and removes its marker.
create table if not exists public.private_wish_images (
  object_id uuid primary key references storage.objects(id) on delete cascade,
  couple_id uuid not null references public.couples(id) on delete cascade,
  owner_id uuid not null,
  created_at timestamptz not null default now()
);
alter table public.private_wish_images enable row level security;
revoke all on public.private_wish_images from public, anon, authenticated;

create or replace function public.mark_private_wish_image(
  p_path text,
  p_couple uuid,
  p_owner uuid
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_object uuid;
begin
  if p_path is null or p_path = '' then return; end if;
  select o.id into v_object
  from storage.objects o
  where o.bucket_id = 'photos'
    and o.name = p_path
    and (storage.foldername(o.name))[1] = p_couple::text
    and (storage.foldername(o.name))[2] = p_owner::text
  limit 1;
  if v_object is not null then
    insert into public.private_wish_images(object_id, couple_id, owner_id)
    values (v_object, p_couple, p_owner)
    on conflict (object_id) do nothing;
  end if;
end
$$;

create or replace function public.track_private_wish_image()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_private then
      perform public.mark_private_wish_image(new.image_path, new.couple_id, new.owner_id);
    else
      perform public.unmark_private_wish_image(new.image_path, new.owner_id, new.id);
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if new.is_private then
      perform public.mark_private_wish_image(new.image_path, new.couple_id, new.owner_id);
    else
      if old.is_private then
        perform public.unmark_private_wish_image(old.image_path, old.owner_id, old.id);
      end if;
      perform public.unmark_private_wish_image(new.image_path, new.owner_id, new.id);
    end if;
    return new;
  end if;
  -- Keep the marker after a private wish is deleted; its orphaned image is
  -- private until the corresponding Storage object is explicitly removed.
  return old;
end
$$;
revoke all on function public.mark_private_wish_image(text, uuid, uuid) from public, anon, authenticated;

create or replace function public.unmark_private_wish_image(
  p_path text,
  p_owner uuid,
  p_wish uuid
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_path is null or p_path = '' then return; end if;
  delete from public.private_wish_images p
  using storage.objects o
  where p.object_id = o.id
    and o.bucket_id = 'photos'
    and o.name = p_path
    and p.owner_id = p_owner
    and not exists (
      select 1 from public.wishes w
      where w.id <> p_wish
        and w.is_private
        and w.owner_id = p_owner
        and w.image_path = p_path
    );
  return;
end
$$;
revoke all on function public.unmark_private_wish_image(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.track_private_wish_image() from public, anon, authenticated;
drop trigger if exists wishes_track_private_image on public.wishes;
create trigger wishes_track_private_image
  after insert or update or delete on public.wishes
  for each row execute function public.track_private_wish_image();

-- Storage uploads may finish after the wish form is saved. Mark a later
-- upload too, so the private image never becomes readable in that interval.
create or replace function public.track_private_wish_storage_object()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_couple uuid;
  v_owner uuid;
begin
  if new.bucket_id <> 'photos' then return new; end if;
  begin
    v_couple := ((storage.foldername(new.name))[1])::uuid;
    v_owner := ((storage.foldername(new.name))[2])::uuid;
  exception when others then
    return new;
  end;
  if exists (
    select 1 from public.wishes w
    where w.is_private and w.couple_id = v_couple and w.owner_id = v_owner
      and w.image_path = new.name
  ) then
    perform public.mark_private_wish_image(new.name, v_couple, v_owner);
  end if;
  return new;
end
$$;
revoke all on function public.track_private_wish_storage_object() from public, anon, authenticated;
drop trigger if exists storage_track_private_wish_image on storage.objects;
create trigger storage_track_private_wish_image
  after insert on storage.objects
  for each row execute function public.track_private_wish_storage_object();

drop policy if exists wishes_read on public.wishes;
create policy wishes_read on public.wishes
  for select to authenticated
  using (
    couple_id = public.current_couple()
    and not is_deleted
    and (not is_private or owner_id = auth.uid())
  );

-- A private-wish image path must not be readable by the other member of the
-- couple, even through a direct query to storage.objects.
create or replace function public.is_private_wish_image(p_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.private_wish_images p
    join storage.objects o on o.id = p.object_id
    where o.bucket_id = 'photos'
      and o.name = p_path
      and p.owner_id <> auth.uid()
  )
$$;
revoke all on function public.is_private_wish_image(text) from public, anon;
grant execute on function public.is_private_wish_image(text) to authenticated;

drop policy if exists photos_read on storage.objects;
create policy photos_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = public.current_couple()::text
    and not public.is_private_wish_image(name)
  );

-- Reservation rows must not expose or modify a gift against a private wish.
drop policy if exists reservation_read on public.gift_reservations;
create policy reservation_read on public.gift_reservations
  for select to authenticated
  using (
    reserved_by = auth.uid()
    and exists (
      select 1 from public.wishes w
      where w.id = wish_id
        and w.couple_id = public.current_couple()
        and w.owner_id <> auth.uid()
        and not w.is_private
    )
  );

drop policy if exists reservation_insert on public.gift_reservations;
create policy reservation_insert on public.gift_reservations
  for insert to authenticated
  with check (
    reserved_by = auth.uid()
    and exists (
      select 1 from public.wishes w
      where w.id = wish_id
        and w.couple_id = public.current_couple()
        and w.owner_id <> auth.uid()
        and not w.is_private
    )
  );

drop policy if exists reservation_update on public.gift_reservations;
create policy reservation_update on public.gift_reservations
  for update to authenticated
  using (
    reserved_by = auth.uid()
    and exists (
      select 1 from public.wishes w
      where w.id = wish_id
        and w.couple_id = public.current_couple()
        and w.owner_id <> auth.uid()
        and not w.is_private
    )
  )
  with check (
    reserved_by = auth.uid()
    and exists (
      select 1 from public.wishes w
      where w.id = wish_id
        and w.couple_id = public.current_couple()
        and w.owner_id <> auth.uid()
        and not w.is_private
    )
  );

drop policy if exists reservation_delete on public.gift_reservations;
create policy reservation_delete on public.gift_reservations
  for delete to authenticated
  using (
    reserved_by = auth.uid()
    and exists (
      select 1 from public.wishes w
      where w.id = wish_id
        and w.couple_id = public.current_couple()
        and w.owner_id <> auth.uid()
        and not w.is_private
    )
  );

grant update(is_private) on public.wishes to authenticated;

-- Do not publish wish DELETE rows: Realtime sends DELETE payloads without
-- row-level filtering. The owner-only RPC below tombstones and scrubs content.
create or replace function public.delete_wish(p_wish_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_couple uuid := public.current_couple();
begin
  update public.wishes
  set is_private = true,
      is_deleted = true,
      name = 'Видалене побажання',
      price = null,
      url = '',
      note = '',
      image_path = null
  where id = p_wish_id
    and couple_id = v_couple
    and owner_id = auth.uid()
    and not is_deleted;
  if not found then raise exception 'wish_not_found'; end if;
  delete from public.gift_reservations where wish_id = p_wish_id;
end
$$;
revoke all on function public.delete_wish(uuid) from public, anon;
grant execute on function public.delete_wish(uuid) to authenticated;
revoke delete on public.wishes from authenticated;

-- Hidden wishes never create shared activity entries. A public-to-private
-- change may announce removal of the formerly visible wish, but subsequent
-- edits or deletion of the private row stay silent.
create or replace function public.log_shared_activity()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  r jsonb;
  v_kind text;
  v_action text;
  v_visible boolean := true;
begin
  if auth.uid() is null or current_setting('ours.skip_activity', true) = 'on' then
    return null;
  end if;

  if tg_table_name = 'wishes' then
    if tg_op = 'INSERT' then
      v_visible := not new.is_private;
    elsif tg_op = 'DELETE' then
      v_visible := not old.is_private;
    else
      v_visible := not new.is_private or not old.is_private;
      if not old.is_private and new.is_private then
        delete from public.gift_reservations where wish_id = old.id;
        -- activity_events is published without row-level filtering. Replace
        -- the old identity with a generic row instead of emitting a DELETE
        -- payload that still contains the former title and wish UUID.
        update public.activity_events
        set title = 'Побажання оновлено', entity_id = null, action = 'updated'
        where couple_id = old.couple_id
          and kind = 'wishes'
          and entity_id = old.id;
        return null;
      end if;
    end if;
    if not v_visible then return null; end if;
  end if;

  if tg_op = 'UPDATE' and tg_table_name = 'shopping_items' then
    if new.session_id is distinct from old.session_id or new.session_id is not null then
      return null;
    end if;
  end if;

  if tg_op = 'DELETE' then r := to_jsonb(old); else r := to_jsonb(new); end if;
  v_kind := case tg_table_name when 'shopping_items' then 'shopping' else tg_table_name end;
  v_action := case tg_op when 'INSERT' then 'added' when 'DELETE' then 'deleted' else 'updated' end;
  if tg_op = 'UPDATE' and tg_table_name = 'shopping_items' and (r->>'purchased')::boolean then
    v_action := 'purchased';
  end if;
  insert into public.activity_events(couple_id, actor_id, kind, action, entity_id, title)
  values (
    (r->>'couple_id')::uuid,
    auth.uid(),
    v_kind,
    v_action,
    (r->>'id')::uuid,
    left(coalesce(r->>'name', r->>'title', 'Оновлення'), 160)
  );
  return null;
end
$$;

commit;
