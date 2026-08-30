/**
 * Copy the DuckDB-WASM runtime into public/ so the site serves it itself.
 *
 * The library defaults to fetching these from a CDN at runtime. Self-hosting
 * removes a third-party request from every page that queries data, keeps the
 * site working under a strict content-security policy, and means the demo does
 * not break when someone else's CDN does.
 *
 * Only the exception-handling build is shipped. It is ~36MB uncompressed and
 * about a quarter of that over the wire, and carrying the MVP build as well
 * would double that to serve browsers older than Chrome 95 / Firefox 100 /
 * Safari 15.2. The assets are generated at build time rather than committed,
 * so none of this weight lands in the repository.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const dist = path.dirname(require.resolve("@duckdb/duckdb-wasm/dist/duckdb-browser.mjs"));
const out = path.join(process.cwd(), "public", "duckdb");

const ASSETS = ["duckdb-eh.wasm", "duckdb-browser-eh.worker.js"];

await mkdir(out, { recursive: true });
for (const asset of ASSETS) {
  await copyFile(path.join(dist, asset), path.join(out, asset));
}
console.log(`copied ${ASSETS.length} DuckDB assets -> public/duckdb`);
