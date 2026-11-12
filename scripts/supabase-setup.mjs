import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

const root = new URL("../", import.meta.url);
export const expectedTables = [
  "recipe_catalog",
  "meal_plan_items",
  "recipes",
  "profiles",
  "couples",
  "couple_members",
  "couple_invites",
  "shopping_sessions",
  "shopping_items",
  "shopping_product_history",
  "wishes",
  "gift_reservations",
  "events",
  "movies",
  "activity_events",
  "activity_reads",
  "link_import_limits",
  "plants",
  "plant_care_events",
  "recipe_favorites",
  "recipe_cooks",
];
const schemaQuery = `select c.relname as name, c.relrowsecurity as rls
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relkind in ('r','p','v','m','f')`;

export function projectRefFromUrl(url) {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      !parsed.port &&
      !parsed.search &&
      !parsed.hash &&
      parsed.pathname === "/"
    )
      return /^([a-z]{20})\.supabase\.co$/.exec(parsed.hostname)?.[1];
  } catch {
    // Never echo a malformed URL: it might contain credentials.
  }
  return undefined;
}

export function publicKey(keys, projectRef) {
  if (!Array.isArray(keys)) throw new Error("Unexpected API key response.");
  for (const key of keys) {
    if (
      key.type === "publishable" &&
      /^sb_publishable_[\w-]{20,}$/.test(key.api_key ?? "")
    )
      return key.api_key;
  }
  for (const key of keys) {
    try {
      // Check the role inside the JWT, never trust a key's display name.
      const payload = JSON.parse(
        Buffer.from(key.api_key.split(".")[1], "base64url").toString(),
      );
      if (
        payload.role === "anon" &&
        payload.ref === projectRef &&
        key.api_key.split(".").length === 3
      )
        return key.api_key;
    } catch {
      /* Skip masked, secret and malformed keys. */
    }
  }
  throw new Error(
    "No usable public key. Supply VITE_SUPABASE_PUBLISHABLE_KEY or enable API Keys Read; never use service_role.",
  );
}

export function managementClient(token, projectRef, fetcher = fetch) {
  if (!token?.trim())
    throw new Error(
      "SUPABASE_ACCESS_TOKEN is missing in this task. Attach the published ours environment; do not paste the token in chat.",
    );
  if (!/^[a-z]{20}$/.test(projectRef ?? ""))
    throw new Error(
      "Set SUPABASE_PROJECT_REF to the 20-letter project ref from its Supabase URL. This value is public.",
    );
  return async (path = "", body) => {
    // The target is fixed. Reject redirects so a PAT cannot follow one to another host.
    let response;
    try {
      response = await fetcher(
        `https://api.supabase.com/v1/projects/${projectRef}${path}`,
        {
          method: body ? "POST" : "GET",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(60_000),
        },
      );
    } catch {
      throw new Error(
        "Supabase connection failed or timed out. Check the environment network policy; a write may have completed. Inspect before retrying.",
      );
    }
    if (!response.ok) {
      // Error bodies can contain SQL, configuration, or credentials. Never log them.
      const hint =
        response.status === 401
          ? "Check token expiry."
          : response.status === 403
            ? "Check project scope and the permission for this endpoint."
            : response.status === 429
              ? "Rate limited; retry later."
              : "Inspect the project in Supabase Dashboard.";
      throw new Error(
        `Supabase HTTP ${response.status} at ${path || "/project"}: ${hint}`,
      );
    }
    try {
      return await response.json();
    } catch {
      throw new Error(
        "Unexpected Supabase response. Inspect the project before retrying a write.",
      );
    }
  };
}

export function validateSchema(rows) {
  if (!Array.isArray(rows))
    throw new Error("Unexpected database inspection response.");
  return expectedTables.every((name) =>
    rows.some((row) => row.name === name && row.rls === true),
  );
}

export function guardedSetupSQL(sql) {
  const body = sql.replace(/^begin;\s*$/gm, "").replace(/^commit;\s*$/gm, "");
  return `begin;
select pg_advisory_xact_lock(hashtextextended('ours-initial-setup',0));
do $$ begin if exists (${schemaQuery}) then
 raise exception 'Initial ours setup requires an empty public schema'; end if; end $$;
${body}
commit;`;
}

export async function setup({
  token,
  projectRef,
  apply = false,
  suppliedKey,
  fetcher = fetch,
  read = (path) => readFile(new URL(path, root), "utf8"),
  write = (path, value) => writeFile(new URL(path, root), value),
  log = console.log,
}) {
  const api = managementClient(token, projectRef, fetcher);
  await api(); // Project-specific lookup avoids account-wide project-list permission.
  log("Project access confirmed.");
  let tables = await api("/database/query", {
    query: schemaQuery,
    read_only: true,
  });
  if (!Array.isArray(tables))
    throw new Error("Unexpected database inspection response.");
  log(
    `Schema: ${tables.length === 0 ? "empty" : validateSchema(tables) ? "ours tables present with RLS" : "existing or incomplete; review required"}.`,
  );
  if (!apply) {
    log("Inspection only. No schema, Auth, files, or user data changed.");
    return;
  }
  if (tables.length)
    throw new Error(
      "Refusing initial setup on a non-empty schema. Review migrations and finish Auth/Edge setup separately; existing data was not changed.",
    );
  // Fetch/validate the public key before performing any database write.
  const key = publicKey(
    suppliedKey
      ? [
          { type: "publishable", api_key: suppliedKey },
          { api_key: suppliedKey },
        ]
      : await api("/api-keys?reveal=false"),
    projectRef,
  );
  // Repeat the empty-schema guard under a transaction lock to protect concurrent setup.
  await api("/database/query", {
    query: guardedSetupSQL(await read("supabase/setup.sql")),
    read_only: false,
  });
  tables = await api("/database/query", {
    query: schemaQuery,
    read_only: true,
  });
  if (!validateSchema(tables))
    throw new Error(
      "Schema verification failed; public config was not written.",
    );
  const security = await api("/database/query", {
    read_only: true,
    query: `select
 exists(select 1 from storage.buckets where id='photos' and public=false) as private_photos,
 not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='gift_reservations') as gifts_not_published`,
  });
  if (
    security?.[0]?.private_photos !== true ||
    security?.[0]?.gifts_not_published !== true
  )
    throw new Error(
      "Storage/Realtime verification failed; public config was not written.",
    );
  await write(
    "src/lib/public-config.json",
    JSON.stringify(
      {
        supabaseUrl: `https://${projectRef}.supabase.co`,
        supabasePublishableKey: key,
      },
      null,
      2,
    ) + "\n",
  );
  log(
    "Schema, RLS flags, private photos bucket and gift publication exclusion checked. Only public client config written.",
  );
  log(
    "Still required: Auth URL/email settings and link-preview deployment (docs/START-HERE.md, docs/LINK-IMPORT.md), then build/deploy and real two-account checks.",
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const { values } = parseArgs({
      options: {
        apply: { type: "boolean", default: false },
        "project-ref": { type: "string" },
      },
    });
    await setup({
      token: process.env.SUPABASE_ACCESS_TOKEN,
      projectRef:
        values["project-ref"] ||
        process.env.SUPABASE_PROJECT_REF ||
        projectRefFromUrl(process.env.VITE_SUPABASE_URL),
      suppliedKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      apply: values.apply,
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
