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
 create publication supabase_realtime;`);
    const sql = guardedSetupSQL(readFileSync("supabase/setup.sql", "utf8"));
    await db.exec(sql);
    const tables = await db.query(
      "select tablename from pg_tables where schemaname='public'",
    );
    expect(tables.rows).toHaveLength(15);
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
    ).toHaveLength(15);
  } finally {
    await db.close();
  }
});
