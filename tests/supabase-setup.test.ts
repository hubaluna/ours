import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import {
  expectedTables,
  managementClient,
  publicKey,
  projectRefFromUrl,
  setup,
} from "../scripts/supabase-setup.mjs";

const ref = "abcdefghijklmnopqrst";
const token = "private-management-token";
const key = "sb_publishable_abcdefghijklmnopqrstuvwxyz";
const ready = expectedTables.map((name: string) => ({ name, rls: true }));
const jwt = (role: string, project = ref) =>
  `header.${Buffer.from(JSON.stringify({ role, ref: project })).toString("base64url")}.signature`;

function fixture(
  options: {
    existing?: { name: string; rls: boolean }[];
    after?: { name: string; rls: boolean }[];
    failWrite?: boolean;
    privatePhotos?: boolean;
    giftsExcluded?: boolean;
  } = {},
) {
  const requests: {
    url: string;
    body: { query?: string; read_only?: boolean };
  }[] = [];
  let written = false;
  const fetcher = vi.fn(async (url: string, init: RequestInit) => {
    expect(init.redirect).toBe("error");
    expect(init.headers).toMatchObject({ Authorization: `Bearer ${token}` });
    const body = init.body ? JSON.parse(String(init.body)) : {};
    requests.push({ url, body });
    if (url.endsWith("/api-keys?reveal=false"))
      return Response.json([
        { type: "secret", api_key: "sb_secret_DO_NOT_WRITE" },
        { type: "publishable", api_key: key },
      ]);
    if (url.endsWith("/database/query")) {
      if (body.read_only === false) {
        if (options.failWrite)
          return Response.json({ message: token }, { status: 500 });
        written = true;
        return Response.json([]);
      }
      if (body.query.includes("storage.buckets"))
        return Response.json([
          {
            private_photos: options.privatePhotos ?? true,
            gifts_not_published: options.giftsExcluded ?? true,
          },
        ]);
      return Response.json(
        written ? (options.after ?? ready) : (options.existing ?? []),
      );
    }
    return Response.json({ id: ref });
  });
  const write = vi.fn(async () => {});
  const log = vi.fn();
  return {
    requests,
    write,
    log,
    args: {
      token,
      projectRef: ref,
      fetcher,
      write,
      log,
      read: () => readFile("supabase/setup.sql", "utf8"),
    },
  };
}

describe("safe Supabase initial setup", () => {
  it("derives the project from the configured public URL without accepting other destinations", () => {
    expect(projectRefFromUrl(`https://${ref}.supabase.co`)).toBe(ref);
    expect(projectRefFromUrl(`https://${ref}.supabase.co/`)).toBe(ref);
    for (const url of [
      undefined,
      "not a URL",
      `http://${ref}.supabase.co`,
      `https://${ref}.supabase.co.evil.example`,
      `https://secret@${ref}.supabase.co`,
      `https://${ref}.supabase.co:5432`,
      `https://${ref}.supabase.co/rest/v1/`,
      `https://${ref}.supabase.co/?token=secret`,
    ])
      expect(projectRefFromUrl(url)).toBeUndefined();
  });

  it("makes no request when the task has no token or an invalid project target", async () => {
    const f = fixture();
    await expect(setup({ ...f.args, token: "" })).rejects.toThrow(
      "missing in this task",
    );
    await expect(
      setup({ ...f.args, projectRef: "https://other.example" }),
    ).rejects.toThrow("SUPABASE_PROJECT_REF");
    expect(f.requests).toHaveLength(0);
  });

  it("defaults to inspection only, without retrieving keys or writing files", async () => {
    const f = fixture();
    await setup(f.args);
    expect(f.requests).toHaveLength(2);
    expect(f.requests[1].body.read_only).toBe(true);
    expect(f.write).not.toHaveBeenCalled();
  });

  it("refuses fresh installation over existing or incomplete tables", async () => {
    for (const existing of [ready, [{ name: "unrelated", rls: false }]]) {
      const f = fixture({ existing });
      await expect(setup({ ...f.args, apply: true })).rejects.toThrow(
        "non-empty schema",
      );
      expect(f.requests.some((r) => r.body.read_only === false)).toBe(false);
      expect(f.write).not.toHaveBeenCalled();
    }
  });

  it("guards schema creation in one locked transaction and writes only the public key", async () => {
    const f = fixture();
    await setup({ ...f.args, apply: true });
    const writes = f.requests.filter((r) => r.body.read_only === false);
    expect(writes).toHaveLength(1);
    expect(writes[0].body.query).toContain("pg_advisory_xact_lock");
    expect(writes[0].body.query).toContain("raise exception");
    expect(writes[0].body.query).toContain(
      "create table public.gift_reservations",
    );
    expect(f.write).toHaveBeenCalledWith(
      "src/lib/public-config.json",
      JSON.stringify(
        {
          supabaseUrl: `https://${ref}.supabase.co`,
          supabasePublishableKey: key,
        },
        null,
        2,
      ) + "\n",
    );
    expect(JSON.stringify(f.log.mock.calls)).not.toContain(token);
  });

  it("never writes frontend config after a failed or unverified setup", async () => {
    for (const options of [
      { failWrite: true },
      { after: [] },
      { privatePhotos: false },
      { giftsExcluded: false },
    ]) {
      const f = fixture(options);
      await expect(setup({ ...f.args, apply: true })).rejects.toThrow();
      expect(f.write).not.toHaveBeenCalled();
    }
  });

  it("does not echo sensitive API error bodies or follow redirects", async () => {
    const api = managementClient(
      token,
      ref,
      async (_url: string, init: RequestInit) => {
        expect(init.redirect).toBe("error");
        return Response.json({ password: token }, { status: 403 });
      },
    );
    await expect(api()).rejects.toThrow("HTTP 403");
    await expect(api()).rejects.not.toThrow(token);
  });

  it("rejects admin keys, masked public keys and anonymous JWTs from another project", () => {
    expect(publicKey([{ api_key: jwt("anon") }], ref)).toBe(jwt("anon"));
    for (const api_key of [
      jwt("service_role"),
      jwt("anon", "other"),
      "sb_secret_abcdef",
      "sb_publishable_abc****",
    ]) {
      expect(() =>
        publicKey([{ name: "anon", type: "publishable", api_key }], ref),
      ).toThrow("No usable public key");
    }
  });
});
