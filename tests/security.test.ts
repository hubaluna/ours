import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
let db: PGlite, couple: string, token: string, wish: string, session: string;
const a = "00000000-0000-4000-8000-000000000001",
  b = "00000000-0000-4000-8000-000000000002",
  c = "00000000-0000-4000-8000-000000000003",
  d = "00000000-0000-4000-8000-000000000004";
async function asUser(id: string) {
  await db.exec(
    `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false)`,
  );
}
async function rows<T = Record<string, unknown>>(sql: string) {
  return (await db.query<T>(sql)).rows;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
  );
  await db.exec(readFileSync("supabase/migrations/001_core.sql", "utf8"));
  await db.exec(
    `insert into auth.users(id,raw_user_meta_data) values('${a}','{"name":"Анна"}'),('${b}','{"name":"Марк"}'),('${c}','{"name":"Третій"}'),('${d}','{"name":"Інша пара"}')`,
  );
  await db.exec(`create schema storage;
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
  grant usage on schema storage to authenticated;grant select,insert,delete on storage.objects to authenticated;
  create publication supabase_realtime;`);
  await db.exec(
    readFileSync("supabase/migrations/002_storage_realtime.sql", "utf8"),
  );
  await asUser(a);
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe("Real PostgreSQL RLS and RPC, under authenticated roles", () => {
  it("creates a private space and one-time invitation", async () => {
    couple = String((await rows("select public.create_couple() as id"))[0].id);
    token = String(
      (await rows("select public.create_invite() as token"))[0].token,
    );
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect((await rows("select * from public.profiles")).length).toBe(1);
  });
  it("lets a second independent account join", async () => {
    await asUser(b);
    expect(
      String((await rows(`select public.join_couple('${token}') as id`))[0].id),
    ).toBe(couple);
    expect((await rows("select * from public.couple_members")).length).toBe(2);
    expect((await rows("select * from public.profiles")).length).toBe(2);
  });
  it("rejects a third person and token reuse", async () => {
    await asUser(c);
    await expect(rows(`select public.join_couple('${token}')`)).rejects.toThrow(
      /invite/,
    );
    expect(await rows("select * from public.couple_members")).toHaveLength(0);
    expect(await rows("select * from public.couple_invites")).toHaveLength(0);
  });
  it("rejects direct membership forgery", async () => {
    await expect(
      rows(
        `insert into public.couple_members(couple_id,user_id) values('${couple}','${c}')`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("adds an item and shares it with the partner", async () => {
    await asUser(a);
    await rows(
      `insert into public.shopping_items(couple_id,name,quantity,unit,added_by) values('${couple}','Молоко',1,'л','${a}')`,
    );
    await asUser(b);
    expect((await rows("select * from public.shopping_items"))[0].name).toBe(
      "Молоко",
    );
  });
  it("marks purchased and restores the active item", async () => {
    await rows("update public.shopping_items set purchased=true");
    expect(
      (await rows("select purchased from public.shopping_items"))[0].purchased,
    ).toBe(true);
    await rows("update public.shopping_items set purchased=false");
    expect(
      (await rows("select purchased from public.shopping_items"))[0].purchased,
    ).toBe(false);
  });
  it("prevents archiving unfinished lists, archives atomically and repeats", async () => {
    await expect(rows("select public.finish_shopping()")).rejects.toThrow(
      /unfinished/,
    );
    await rows("update public.shopping_items set purchased=true");
    session = String(
      (await rows("select public.finish_shopping() as id"))[0].id,
    );
    expect(
      (await rows("select * from public.shopping_product_history")).length,
    ).toBe(1);
    await rows(`select public.repeat_shopping('${session}')`);
    expect(
      (
        await rows(
          "select * from public.shopping_items where session_id is null",
        )
      ).length,
    ).toBe(1);
  });
  it("adds a wish owned by the author", async () => {
    await asUser(a);
    wish = String(
      (
        await rows(
          `insert into public.wishes(couple_id,owner_id,name,priority) values('${couple}','${a}','Навушники','Мрія') returning id`,
        )
      )[0].id,
    );
    await expect(
      rows(
        `insert into public.gift_reservations(wish_id,reserved_by) values('${wish}','${a}')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("allows only the partner to reserve and change gift status", async () => {
    await asUser(b);
    await rows(
      `insert into public.gift_reservations(wish_id,reserved_by) values('${wish}','${b}')`,
    );
    await rows(
      `update public.gift_reservations set status='purchased' where wish_id='${wish}'`,
    );
    expect(
      (await rows("select * from public.gift_reservations"))[0].status,
    ).toBe("purchased");
    await expect(
      rows(`update public.gift_reservations set reserved_by='${a}'`),
    ).rejects.toThrow(/permission denied/);
  });
  it("hides reservations from the recipient even with a direct query", async () => {
    await asUser(a);
    expect(
      await rows(
        `select * from public.gift_reservations where wish_id='${wish}'`,
      ),
    ).toHaveLength(0);
    expect(
      await rows(
        `update public.gift_reservations set status='planned' returning *`,
      ),
    ).toHaveLength(0);
    const wishRow = (
      await rows(`select * from public.wishes where id='${wish}'`)
    )[0];
    expect(Object.keys(wishRow).some((k) => /reserv|gift|status/.test(k))).toBe(
      false,
    );
  });
  it("prevents partner from editing someone else’s wish or profile", async () => {
    await asUser(b);
    expect(
      await rows(
        `update public.wishes set name='Змінено' where id='${wish}' returning *`,
      ),
    ).toHaveLength(0);
    expect(
      await rows(
        `update public.profiles set name='Змінено' where id='${a}' returning *`,
      ),
    ).toHaveLength(0);
  });
  it("adds shared events and lets the partner edit them", async () => {
    await asUser(a);
    await rows(
      `insert into public.events(couple_id,title,date,time,created_by) values('${couple}','Вечір кіно','2026-11-10','19:00','${a}')`,
    );
    await asUser(b);
    await rows("update public.events set title='Кіно і попкорн'");
    expect((await rows("select * from public.events"))[0].title).toBe(
      "Кіно і попкорн",
    );
  });
  it("blocks reads, inserts and exports from a different space", async () => {
    await asUser(c);
    for (const table of [
      "shopping_items",
      "wishes",
      "events",
      "gift_reservations",
      "shopping_sessions",
    ])
      expect(await rows(`select * from public.${table}`)).toHaveLength(0);
    await expect(
      rows(
        `insert into public.shopping_items(couple_id,name,added_by) values('${couple}','Чуже','${c}')`,
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      rows(`select public.repeat_shopping('${session}')`),
    ).rejects.toThrow(/access denied/);
    await expect(
      rows(
        `insert into public.gift_reservations(wish_id,reserved_by) values('${wish}','${c}')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("rejects expired and replaced invitations", async () => {
    await asUser(c);
    await rows("select public.create_couple()");
    const old = String(
      (await rows("select public.create_invite() as token"))[0].token,
    );
    const valid = String(
      (await rows("select public.create_invite() as token"))[0].token,
    );
    await asUser(d);
    await expect(rows(`select public.join_couple('${old}')`)).rejects.toThrow(
      /invite/,
    );
    await db.exec(
      `reset role;update public.couple_invites set expires_at=now()-interval '1 hour' where token_hash=sha256(convert_to('${valid}','UTF8'));`,
    );
    await asUser(d);
    await expect(rows(`select public.join_couple('${valid}')`)).rejects.toThrow(
      /invite/,
    );
  });
  it("keeps photos private and limits uploads to the uploader's folder", async () => {
    await asUser(a);
    await rows(
      `insert into storage.objects(bucket_id,name) values('photos','${couple}/${a}/photo.webp')`,
    );
    await expect(
      rows(
        `insert into storage.objects(bucket_id,name) values('photos','${couple}/${b}/forged.webp')`,
      ),
    ).rejects.toThrow(/row-level security/);
    await asUser(b);
    expect(await rows("select * from storage.objects")).toHaveLength(1);
    expect(await rows("delete from storage.objects returning *")).toHaveLength(
      0,
    );
    await asUser(c);
    expect(await rows("select * from storage.objects")).toHaveLength(0);
    await expect(
      rows(
        `insert into storage.objects(bucket_id,name) values('photos','${couple}/${c}/photo.webp')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("never publishes secret reservation events to Realtime", async () => {
    const tables = await rows<{ tablename: string }>(
      "select tablename from pg_publication_tables where pubname='supabase_realtime'",
    );
    expect(tables.some((t) => t.tablename === "gift_reservations")).toBe(false);
    expect(tables.some((t) => t.tablename === "shopping_items")).toBe(true);
  });
  it("denies anonymous RPC and table access", async () => {
    await db.exec("reset role;set role anon;");
    await expect(rows("select public.create_couple()")).rejects.toThrow(
      /permission denied/,
    );
    await expect(rows("select * from public.wishes")).rejects.toThrow(
      /permission denied/,
    );
  });
});
