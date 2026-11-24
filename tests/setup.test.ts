import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { guardedSetupSQL } from "../scripts/supabase-setup.mjs";
it("applies the one-query mobile setup atomically to a fresh project", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
 create schema realtime;create table realtime.messages(topic text,payload jsonb);create table realtime.sent_events(payload jsonb,event text,topic text,is_private boolean);create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;create function realtime.send(jsonb,text,text,boolean) returns uuid language plpgsql as $$ begin insert into realtime.sent_events values($1,$2,$3,$4);return gen_random_uuid();end $$;
 create publication supabase_realtime;`);
    const sql = guardedSetupSQL(readFileSync("supabase/setup.sql", "utf8"));
    await db.exec(sql);
    const tables = await db.query(
      "select tablename from pg_tables where schemaname='public'",
    );
    expect(tables.rows).toHaveLength(31);
    expect(tables.rows.map((row) => row.tablename)).toContain("plants");
    expect(tables.rows.map((row) => row.tablename)).toContain("pantry_items");
    expect(tables.rows.map((row) => row.tablename)).toContain("budget_transactions");
    expect(tables.rows.map((row) => row.tablename)).toContain("budget_recurring_payments");
    expect(tables.rows.map((row) => row.tablename)).toContain("guest_wish_reservations");
    expect(tables.rows.map((row) => row.tablename)).toContain("guest_shared_wishlists");
    const bucket = await db.query<{ public: boolean }>(
      "select public from storage.buckets where id='photos'",
    );
    expect(bucket.rows[0].public).toBe(false);
    const security = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
    );
    expect(security.rows.every((r) => r.relrowsecurity)).toBe(true);
    // A second initial setup must fail before touching the existing tables.
    await expect(db.exec(sql)).rejects.toThrow(
      "requires an empty public schema",
    );
    await db.exec("rollback;");
    expect(
      (
        await db.query(
          "select tablename from pg_tables where schemaname='public'",
        )
      ).rows,
    ).toHaveLength(31);
  } finally {
    await db.close();
  }
});

it("upgrades an existing 012 database cleanly and idempotently with update-existing.sql", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;create schema auth;create schema extensions;create schema vault;create table vault.decrypted_secrets(name text,decrypted_secret text);
 create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
 alter table storage.objects enable row level security;
 create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
 create schema realtime;create table realtime.messages(topic text,payload jsonb);create table realtime.sent_events(payload jsonb,event text,topic text,is_private boolean);create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;create function realtime.send(jsonb,text,text,boolean) returns uuid language plpgsql as $$ begin insert into realtime.sent_events values($1,$2,$3,$4);return gen_random_uuid();end $$;
 create publication supabase_realtime;`);
    for (const file of [
      "001_core.sql",
      "002_storage_realtime.sql",
      "003_compact_movies_activity.sql",
      "004_recipes_movie_ratings.sql",
      "005_recipe_catalog_shared_menu.sql",
      "006_tiktok_video_recipes.sql",
      "007_private_wishes.sql",
      "008_grocery_categories.sql",
      "009_places_wish_size.sql",
      "010_pantry_amount_prefix.sql",
      "011_event_links.sql",
      "012_drop_empty_places.sql",
    ]) {
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    }
    const upgradeSql = readFileSync("supabase/update-existing.sql", "utf8");
    await db.exec(upgradeSql);
    await db.exec(upgradeSql);
    const tables = await db.query<{ tablename: string }>(
      "select tablename from pg_tables where schemaname='public'",
    );
    const names = tables.rows.map((row) => row.tablename);
    expect(names).toContain("pantry_items");
    expect(names).toContain("plants");
    expect(names).toContain("pending_push_digest");
    expect(names).toContain("calendar_feed_tokens");
    expect(names).toContain("budget_transactions");
    expect(names).toContain("budget_merchant_rules");
    expect(names).toContain("budget_recurring_payments");
    expect(names).toContain("guest_wish_reservations");
    expect(names).toContain("guest_shared_wishlists");
    const security = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r'",
    );
    expect(security.rows.every((r) => r.relrowsecurity)).toBe(true);
  } finally {
    await db.close();
  }
});
