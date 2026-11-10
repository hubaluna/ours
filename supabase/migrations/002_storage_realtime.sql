begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('photos','photos',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp'];
-- Layout: <couple UUID>/<uploader UUID>/<random UUID>.webp
create policy photos_read on storage.objects for select to authenticated using(bucket_id='photos' and (storage.foldername(name))[1]=public.current_couple()::text);
create policy photos_insert on storage.objects for insert to authenticated with check(bucket_id='photos' and (storage.foldername(name))[1]=public.current_couple()::text and (storage.foldername(name))[2]=auth.uid()::text);
create policy photos_delete on storage.objects for delete to authenticated using(bucket_id='photos' and (storage.foldername(name))[1]=public.current_couple()::text and (storage.foldername(name))[2]=auth.uid()::text);
-- No UPDATE: uploads use random paths and upsert:false.
do $$ declare t text;begin foreach t in array array['profiles','couple_members','shopping_items','shopping_sessions','shopping_product_history','wishes','events'] loop
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t);end if;
end loop;end $$;
-- DELETE events do not support RLS row filtering in Realtime. Never publish
-- gift_reservations at all: even a deletion must not signal a gift to its owner.
do $$ begin
 if exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gift_reservations') then
   alter publication supabase_realtime drop table public.gift_reservations;
 end if;
end $$;
commit;
