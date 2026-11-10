import { readFileSync, existsSync, readdirSync } from "node:fs";
import assert from "node:assert/strict";
const base = process.argv[2] || "/";
const html = readFileSync("dist/index.html", "utf8");
const manifest = JSON.parse(readFileSync("dist/manifest.webmanifest", "utf8"));
assert.equal(manifest.start_url, base);
assert.equal(manifest.scope, base);
for (const { src } of manifest.icons)
  assert.ok(existsSync(`dist/${src}`), `missing ${src}`);
for (const match of html.matchAll(/(?:src|href)="(\/[^"#]+)"/g))
  assert.ok(match[1].startsWith(base), `wrong base: ${match[1]}`);
assert.ok(html.includes(`${base}apple-touch-icon.png`));
const js = readdirSync("dist/assets")
  .filter((x) => x.endsWith(".js"))
  .map((x) => readFileSync(`dist/assets/${x}`, "utf8"))
  .join("\n");
assert.ok(js.includes(`${base}sw.js`), "wrong service worker path");
const worker = readFileSync("dist/sw.js", "utf8");
assert.ok(!worker.includes("supabase.co"), "private API must not be cached");
assert.ok(worker.includes("precacheAndRoute"));
console.log(
  `PASS: base ${base}, manifest, icons, assets, service worker; no Supabase API caching`,
);
