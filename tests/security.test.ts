import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  catalogRows,
  catalogImportSQL,
} from "../scripts/import-recipe-catalog.mjs";
import { isPantryStaple } from "../supabase/functions/_shared/grocery-category";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
let db: PGlite,
  couple: string,
  token: string,
  wish: string,
  session: string,
  privateWish: string,
  publicWish: string;
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
    `create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth,public to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;create schema realtime;create table realtime.sent_events(payload jsonb,event text,topic text,is_private boolean);grant select on realtime.sent_events to authenticated;create table realtime.messages(topic text,payload jsonb);create function realtime.topic() returns text language sql stable as $$ select current_setting('realtime.topic',true) $$;create function realtime.send(jsonb,text,text,boolean) returns uuid language plpgsql as $$ begin insert into realtime.sent_events values($1,$2,$3,$4);return gen_random_uuid();end $$;`,
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
  await db.exec(
    readFileSync("supabase/migrations/003_compact_movies_activity.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/004_recipes_movie_ratings.sql", "utf8"),
  );
  await db.exec(
    readFileSync(
      "supabase/migrations/005_recipe_catalog_shared_menu.sql",
      "utf8",
    ),
  );
  await db.exec(
    readFileSync("supabase/migrations/006_tiktok_video_recipes.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/007_private_wishes.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/008_grocery_categories.sql", "utf8"),
  );
  await db.exec(
    readFileSync("supabase/migrations/009_places_wish_size.sql", "utf8"),
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
    ).toBeFalsy();
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
  it("hides private wishes, their image paths and history from the partner", async () => {
    await asUser(a);
    publicWish = String(
      (
        await rows(
          `insert into public.wishes(couple_id,owner_id,name,priority) values('${couple}','${a}','Публічна книжка','Дуже хочу') returning id`,
        )
      )[0].id,
    );
    const publicActivity = await rows(
      `select id,title from public.activity_events where kind='wishes' and entity_id='${publicWish}'`,
    );
    expect(publicActivity).toEqual([{ id: expect.any(String), title: "Публічна книжка" }]);
    await asUser(b);
    await rows(
      `insert into public.gift_reservations(wish_id,reserved_by) values('${publicWish}','${b}')`,
    );
    expect(
      await rows(
        `select name from public.wishes where id='${publicWish}'`,
      ),
    ).toEqual([{ name: "Публічна книжка" }]);

    await asUser(a);
    await rows(
      `update public.wishes set is_private=true where id='${publicWish}'`,
    );
    await db.exec("reset role");
    expect(
      await rows(
        `select id from public.gift_reservations where wish_id='${publicWish}'`,
      ),
    ).toHaveLength(0);
    await asUser(a);
    expect(
      await rows(
        `select title,entity_id,action from public.activity_events where id='${publicActivity[0].id}'`,
      ),
    ).toEqual([
      { title: "Побажання оновлено", entity_id: null, action: "updated" },
    ]);
    const imagePath = `${couple}/${a}/private-wish-photo.webp`;
    privateWish = String(
      (
        await rows(
          `insert into public.wishes(couple_id,owner_id,name,image_path,is_private) values('${couple}','${a}','Приватний подарунок','${imagePath}',true) returning id`,
        )
      )[0].id,
    );
    await rows(
      `insert into storage.objects(bucket_id,name) values('photos','${imagePath}')`,
    );
    expect(
      await rows(
        `select name from public.wishes where id='${privateWish}' and is_private`,
      ),
    ).toEqual([{ name: "Приватний подарунок" }]);
    expect(
      await rows(
        `select title from public.activity_events where kind='wishes' and entity_id='${privateWish}'`,
      ),
    ).toHaveLength(0);
    await asUser(b);
    expect(
      await rows(
        `select id from public.wishes where id in ('${publicWish}','${privateWish}')`,
      ),
    ).toHaveLength(0);
    expect(
      await rows(
        `select id from public.activity_events where kind='wishes' and entity_id='${publicWish}'`,
      ),
    ).toHaveLength(0);
    expect(
      await rows(
        `select title from public.activity_events where kind='wishes' and title='Публічна книжка'`,
      ),
    ).toHaveLength(0);
    expect(
      await rows(
        `select name from storage.objects where name='${imagePath}'`,
      ),
    ).toHaveLength(0);
    expect(
      await rows(
        `select id from public.gift_reservations where wish_id='${publicWish}'`,
      ),
    ).toHaveLength(0);
    await expect(
      rows(
        `insert into public.gift_reservations(wish_id,reserved_by) values('${publicWish}','${b}') returning id`,
      ),
    ).rejects.toThrow(/row-level security/);
    await expect(
      rows(`delete from public.wishes where id='${publicWish}'`),
    ).rejects.toThrow(/permission denied/);

    await asUser(a);
    await rows(
      `update public.wishes set name='Ще більш приватний сюрприз' where id='${privateWish}'`,
    );
    await rows(`select public.delete_wish('${privateWish}')`);
    await db.exec("reset role");
    expect(
      await rows(
        `select id from public.activity_events where kind='wishes' and entity_id='${privateWish}'`,
      ),
    ).toHaveLength(0);
    expect(
      await rows(
        `select name,url,note,image_path,is_private,is_deleted from public.wishes where id='${privateWish}'`,
      ),
    ).toEqual([
      {
        name: "Видалене побажання",
        url: "",
        note: "",
        image_path: null,
        is_private: true,
        is_deleted: true,
      },
    ]);
    await asUser(a);
    const reattached = String(
      (
        await rows(
          `insert into public.wishes(couple_id,owner_id,name,image_path) values('${couple}','${a}','Спільне фото','${imagePath}') returning id`,
        )
      )[0].id,
    );
    await asUser(b);
    expect(
      await rows(`select name from storage.objects where name='${imagePath}'`),
    ).toHaveLength(1);
    await asUser(a);
    await rows(`select public.delete_wish('${reattached}')`);
    await rows(`delete from storage.objects where name='${imagePath}'`);
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
  it("shares saved places only inside the couple", async () => {
    await asUser(a);
    const place = String(
      (
        await rows(
          `insert into public.places(couple_id,title,type,address,url,planned_date,description,created_by) values('${couple}','Музей науки','Музей','Київ','https://example.org','2026-12-10','Квитки онлайн','${a}') returning id`,
        )
      )[0].id,
    );
    await asUser(b);
    const shared = await rows(
      `select title,type,planned_date from public.places where id='${place}'`,
    );
    expect(shared).toHaveLength(1);
    expect(shared[0]).toMatchObject({ title: "Музей науки", type: "Музей" });
    expect(new Date(String(shared[0].planned_date)).toISOString().slice(0, 10)).toBe(
      "2026-12-10",
    );
    await asUser(c);
    expect(await rows(`select id from public.places where id='${place}'`)).toHaveLength(0);
    await expect(
      rows(
        `insert into public.places(couple_id,title,type,created_by) values('${couple}','Чужий парк','Парк','${c}')`,
      ),
    ).rejects.toThrow(/row-level security/);
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
  it("shares movies and activity within the couple, with receipts private to each user", async () => {
    await asUser(b);
    const movie = String(
      (
        await rows(
          `insert into public.movies(couple_id,title,year,genres,added_by) values('${couple}','Наш фільм',2024,'Драма','${b}') returning id`,
        )
      )[0].id,
    );
    await asUser(a);
    expect(
      (await rows(`select title from public.movies where id='${movie}'`))[0]
        .title,
    ).toBe("Наш фільм");
    const updates = await rows<{ id: string }>(
      `select id from public.activity_events where entity_id='${movie}' and actor_id='${b}'`,
    );
    expect(updates).toHaveLength(1);
    await rows(
      `select public.mark_activity_read(array['${updates[0].id}']::uuid[])`,
    );
    expect(await rows("select * from public.activity_reads")).toHaveLength(1);
    await rows(
      `select public.mark_activity_read(array['${updates[0].id}']::uuid[])`,
    );
    expect(await rows("select * from public.activity_reads")).toHaveLength(1);
    await rows(`update public.movies set status='watched' where id='${movie}'`);
    await asUser(b);
    expect(await rows("select * from public.activity_reads")).toHaveLength(0);
    expect(
      (await rows(`select status from public.movies where id='${movie}'`))[0]
        .status,
    ).toBe("watched");
    await asUser(c);
    expect(
      await rows(`select * from public.movies where id='${movie}'`),
    ).toHaveLength(0);
    expect(
      await rows(
        `select * from public.activity_events where entity_id='${movie}'`,
      ),
    ).toHaveLength(0);
  });
  it("does not leak gift reservations into the activity feed", async () => {
    await asUser(b);
    const before = await rows("select id from public.activity_events");
    await rows(
      `update public.gift_reservations set status='planned' where wish_id='${wish}'`,
    );
    expect(await rows("select id from public.activity_events")).toHaveLength(
      before.length,
    );
    await expect(
      rows(
        `insert into public.activity_events(couple_id,actor_id,kind,action,title) values('${couple}','${b}','wishes','added','Fake')`,
      ),
    ).rejects.toThrow(/permission denied/);
  });
  it("adds recipe ingredients atomically and emits one shared update", async () => {
    await asUser(a);
    const before = (await rows("select id from public.shopping_items")).length;
    const items = JSON.stringify([
      {
        name: "Рис",
        quantity: 200,
        unit: "г",
        category: "Крупи, макарони та бакалія",
        price: null,
      },
      { name: "Вода", quantity: 1, unit: "л", category: "Напої", price: null },
      { name: "Болгарський перець", quantity: 1, unit: "шт.", category: "Овочі та фрукти", price: null },
    ]);
    expect(
      (
        await rows(
          `select public.add_shopping_batch('${items}'::jsonb) as count`,
        )
      )[0].count,
    ).toBe(2);
    expect(await rows("select id from public.shopping_items")).toHaveLength(
      before + 2,
    );
    expect(
      await rows(
        "select id from public.activity_events where title='Продукти з рецепта · 2'",
      ),
    ).toHaveLength(1);
    expect(
      await rows("select id from public.shopping_items where name='Вода'"),
    ).toHaveLength(0);
    const invalid = JSON.stringify([
      { name: "Good", quantity: 1, unit: "шт.", category: "Інше", price: null },
      { name: "Bad", quantity: 0, unit: "шт.", category: "Інше", price: null },
    ]);
    await expect(
      rows(`select public.add_shopping_batch('${invalid}'::jsonb)`),
    ).rejects.toThrow();
    expect(await rows("select id from public.shopping_items")).toHaveLength(
      before + 2,
    );
  });
  it("limits link requests per authenticated member without table access", async () => {
    await asUser(a);
    for (let i = 0; i < 8; i++)
      expect(
        (await rows("select public.consume_link_import() as allowed"))[0]
          .allowed,
      ).toBe(true);
    expect(
      (await rows("select public.consume_link_import() as allowed"))[0].allowed,
    ).toBe(false);
    await expect(
      rows("select * from public.link_import_limits"),
    ).rejects.toThrow(/permission denied/);
  });
  it("shares complete recipes only inside the space and validates movie ratings", async () => {
    await asUser(a);
    const recipe = String(
      (
        await rows(
          `insert into public.recipes(couple_id,title,category,image_url,ingredients,instructions,added_by) values('${couple}','Рис','main','https://example.com/rice.jpg','["200 г рису"]','["Зварити рис."]','${a}') returning id`,
        )
      )[0].id,
    );
    await asUser(b);
    expect(
      await rows(`select id from public.recipes where id='${recipe}'`),
    ).toHaveLength(1);
    await rows(
      `update public.recipes set title='Наш рис' where id='${recipe}'`,
    );
    await rows(`update public.movies set rating=8,status='watched'`);
    await expect(rows(`update public.movies set rating=11`)).rejects.toThrow();
    await asUser(c);
    expect(
      await rows(`select id from public.recipes where id='${recipe}'`),
    ).toHaveLength(0);
    await expect(
      rows(
        `insert into public.recipes(couple_id,title,category,image_url,ingredients,instructions,added_by) values('${couple}','Чуже','main','https://example.com/rice.jpg','["Рис"]','["Зварити"]','${c}')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("allows empty written steps only for a valid TikTok recipe video URL", async () => {
    await asUser(a);
    const id = String(
      (
        await rows(
          `insert into public.recipes(couple_id,title,category,image_url,source_url,ingredients,instructions,added_by) values('${couple}','Млинці з відео','main','https://example.com/pancakes.jpg','https://www.tiktok.com/@cook/video/123456789','["3 ст. л. цукру"]','[]','${a}') returning id`,
        )
      )[0].id,
    );
    await expect(
      rows(
        `insert into public.recipes(couple_id,title,category,image_url,source_url,ingredients,instructions,added_by) values('${couple}','Без джерела','main','https://example.com/pancakes.jpg','','["200 г борошна"]','[]','${a}')`,
      ),
    ).rejects.toThrow(/recipes_instructions_check/);
    await expect(
      rows(
        `insert into public.recipes(couple_id,title,category,image_url,source_url,ingredients,instructions,added_by) values('${couple}','Не відео','main','https://example.com/pancakes.jpg','https://www.tiktok.com/@cook/','["200 г борошна"]','[]','${a}')`,
      ),
    ).rejects.toThrow(/recipes_instructions_check/);
    await asUser(b);
    expect(
      await rows(`select id from public.recipes where id='${id}'`),
    ).toHaveLength(1);
    await rows(`delete from public.recipes where id='${id}'`);
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

describe("Shared recipe catalog, menu and atomic shopping", () => {
  const archive = JSON.parse(
    readFileSync("src/data/ours-recipes.json", "utf8"),
  );
  const sql = catalogImportSQL(catalogRows(archive));
  const menu = (items: object[]) =>
    rows(
      `select public.upsert_menu_items('${JSON.stringify(items).replace(/'/g, "''")}'::jsonb)`,
    );
  const generated = () =>
    rows<{
      name: string;
      quantity: number | null;
      unit: string;
      purchased: boolean;
    }>(
      "select name,quantity,unit,purchased from public.shopping_items where session_id is null and menu_key is not null order by name,unit",
    );
  it("imports 55 records idempotently, preserving all original fields", async () => {
    await db.exec("reset role");
    await db.exec(sql);
    const before = await rows(
      "select id,original_data,updated_at from public.recipe_catalog order by id",
    );
    expect(before).toHaveLength(55);
    await db.exec(sql);
    expect(
      await rows(
        "select id,original_data,updated_at from public.recipe_catalog order by id",
      ),
    ).toEqual(before);
    await asUser(a);
    expect(await rows("select id from public.recipe_catalog")).toHaveLength(55);
    await expect(rows("delete from public.recipe_catalog")).rejects.toThrow(
      /permission denied/,
    );
  });
  it("uses the same Ukrainian grocery categories and excludes only pantry pepper", async () => {
    expect(
      await rows(
        `select public.normalize_grocery_category('Молочні продукти') as legacy, public.valid_grocery_category('Солодощі') as sweets, public.valid_grocery_category('Молочні продукти') as old_allowed, public.is_pantry_staple('Перцю чорного') as pepper, public.is_pantry_staple('Олія, для смаження') as oil, public.is_pantry_staple('Воду') as water, public.is_pantry_staple('Меду') as honey, public.is_pantry_staple('Болгарський перець') as bell_pepper, public.is_pantry_staple('Масло вершкове') as butter`,
      ),
    ).toEqual([
      {
        legacy: "Молочне",
        sweets: true,
        old_allowed: false,
        pepper: true,
        oil: true,
        water: true,
        honey: true,
        bell_pepper: false,
        butter: false,
      },
    ]);
  });
  it("adds only a salad, shares it with the partner and respects portions without duplicate menu or shopping rows", async () => {
    await asUser(a);
    await menu([{ catalog_id: "ours55/green_salad", servings: 2 }]);
    const before = await generated();
    expect(before.length).toBeGreaterThan(2);
    const cucumber = archive.recipes
      .find((r: { id: string }) => r.id === "green_salad")
      .ingredients.find((i: { name: string }) => i.name.includes("Огір"));
    expect(Number(before.find((i) => i.name === cucumber.name)?.quantity)).toBe(
      cucumber.quantity * 2,
    );
    await menu([{ catalog_id: "ours55/green_salad", servings: 2 }]);
    expect(await generated()).toEqual(before);
    expect(await rows("select id from public.meal_plan_items")).toHaveLength(1);
    await asUser(b);
    expect(
      (await rows("select servings from public.meal_plan_items"))[0].servings,
    ).toBe(2);
    await menu([{ catalog_id: "ours55/green_salad", servings: 3 }]);
    expect(
      Number(
        (await generated()).find((i) => i.name === cucumber.name)?.quantity,
      ),
    ).toBe(cucumber.quantity * 3);
  });
  it("atomically adds a protein and side, merges common products, and rolls back an invalid pair", async () => {
    await asUser(a);
    await menu([
      { catalog_id: "ours55/pan_chicken_fillet", servings: 2 },
      { catalog_id: "ours55/rice", servings: 2 },
    ]);
    expect(await rows("select id from public.meal_plan_items")).toHaveLength(3);
    const plans = await rows<{
      ingredients: { name: string; quantity: number | null; unit: string }[];
      servings: number;
      base_servings: number;
    }>("select ingredients,servings,base_servings from public.meal_plan_items");
    const expected = new Map<string, number | null>();
    for (const plan of plans)
      for (const i of plan.ingredients) {
        if (i.quantity === 0 || isPantryStaple(i.name)) continue;
        const key = i.name.toLowerCase() + "|" + i.unit;
        expected.set(
          key,
          i.quantity === null
            ? null
            : (expected.get(key) ?? 0) +
                (i.quantity * plan.servings) / plan.base_servings,
        );
      }
    const actual = await generated();
    expect(actual).toHaveLength(expected.size);
    actual.forEach((i) =>
      expect(i.quantity === null ? null : Number(i.quantity)).toBe(
        expected.get(i.name.toLowerCase() + "|" + i.unit),
      ),
    );
    await expect(
      menu([
        { catalog_id: "ours55/bulgur", servings: 2 },
        { catalog_id: "ours55/nonexistent", servings: 2 },
      ]),
    ).rejects.toThrow(/not found/);
    expect(await rows("select id from public.meal_plan_items")).toHaveLength(3);
    expect(await generated()).toEqual(actual);
    for (const servings of [0, 13, 1.5])
      await expect(
        menu([{ catalog_id: "ours55/rice", servings }]),
      ).rejects.toThrow();
  });
  it("excludes pantry staples from recipe shopping but keeps manual products", async () => {
    const before = (
      await rows("select id from public.shopping_items where menu_key is null")
    ).length;
    await rows(
      `insert into public.shopping_items(couple_id,added_by,name,quantity,unit,category) values('${couple}','${a}','Сіль',1,'шт.','Крупи, макарони та бакалія')`,
    );
    await rows(
      "delete from public.shopping_items where menu_key is not null and name='Сіль'",
    );
    expect((await generated()).some((i) => i.name === "Сіль")).toBe(false);
    await menu([{ catalog_id: "ours55/rice", servings: 3 }]);
    expect((await generated()).some((i) => i.name === "Сіль")).toBe(false);
    await rows("select public.restore_menu_products()");
    expect((await generated()).some((i) => i.name === "Сіль")).toBe(false);
    expect(
      await rows("select id from public.shopping_items where menu_key is null and name='Сіль'"),
    ).toHaveLength(1);
    expect(
      await rows("select id from public.shopping_items where menu_key is null"),
    ).toHaveLength(before + 1);
    await expect(
      rows(
        "update public.shopping_items set quantity=1 where menu_key is not null and quantity is not null",
      ),
    ).rejects.toThrow(/portions/);
    await expect(
      rows(
        `insert into public.shopping_items(couple_id,name,added_by,menu_key) values('${couple}','Forged','${a}','fake')`,
      ),
    ).rejects.toThrow(/row-level security/);
  });
  it("rejects access from another couple and direct mutation of menu rows", async () => {
    await asUser(c);
    expect(await rows("select id from public.meal_plan_items")).toHaveLength(0);
    await expect(
      rows(
        `insert into public.meal_plan_items(couple_id,catalog_id,servings,base_servings,ingredients,added_by) values('${couple}','ours55/rice',1,1,'[]','${c}')`,
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      rows(`select public.sync_menu_shopping('${couple}')`),
    ).rejects.toThrow(/permission denied/);
    await asUser(a);
    const privateId = String(
      (await rows("select id from public.recipes limit 1"))[0].id,
    );
    await asUser(c);
    await expect(
      menu([
        {
          recipe_id: privateId,
          servings: 1,
          ingredients: [
            { name: "Рис", quantity: 1, unit: "г", category: "Крупи, макарони та бакалія" },
          ],
        },
      ]),
    ).rejects.toThrow(/private recipe/);
  });
  it("updates private recipe quantities and cleans up its menu without damaging manual purchases", async () => {
    await asUser(a);
    const privateId = String(
      (await rows("select id from public.recipes limit 1"))[0].id,
    );
    await menu([
      {
        recipe_id: privateId,
        servings: 3,
        ingredients: [
          {
            name: "Унікальний рис",
            quantity: 100,
            unit: "г",
            category: "Крупи, макарони та бакалія",
          },
        ],
      },
    ]);
    expect(
      Number(
        (await generated()).find((i) => i.name === "Унікальний рис")?.quantity,
      ),
    ).toBe(300);
    await rows(
      `update public.recipes set base_servings=2,structured_ingredients='[{"name":"Унікальний рис","quantity":200,"unit":"г","category":"Крупи, макарони та бакалія"}]' where id='${privateId}'`,
    );
    expect(
      Number(
        (await generated()).find((i) => i.name === "Унікальний рис")?.quantity,
      ),
    ).toBe(300);
    await rows(`delete from public.recipes where id='${privateId}'`);
    expect((await generated()).some((i) => i.name === "Унікальний рис")).toBe(
      false,
    );
    expect(
      await rows(
        `select id from public.meal_plan_items where recipe_id='${privateId}'`,
      ),
    ).toHaveLength(0);
  });
  it("archives bought menu products once, then reopens explicitly without multiplying requirements", async () => {
    await asUser(a);
    await rows(
      "update public.shopping_items set purchased=true where session_id is null",
    );
    await rows("select public.finish_shopping()");
    expect(await generated()).toHaveLength(0);
    expect(
      (
        await rows(
          "select bool_and(shopping_completed) as done from public.meal_plan_items",
        )
      )[0].done,
    ).toBe(true);
    await menu([{ catalog_id: "ours55/rice", servings: 3 }]);
    expect(await generated()).toHaveLength(0);
    await menu([{ catalog_id: "ours55/rice", servings: 3, reopen: true }]);
    expect((await generated()).length).toBeGreaterThan(0);
    const before = await generated();
    await menu([{ catalog_id: "ours55/rice", servings: 3 }]);
    expect(await generated()).toEqual(before);
    await db.exec("reset role;set role anon");
    await expect(rows("select public.upsert_menu_items('[]')")).rejects.toThrow(
      /permission denied/,
    );
  });
});
