// Writes the catalog rows of the local database to seed/catalog.jsonl.gz: `node scripts/export-seed.mjs`.
// Accounts, sessions, favourites, applications and job state are never exported.
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const db = new DatabaseSync(process.env.DATABASE_PATH || "data/qepik.sqlite", { readOnly: true });
const rows = db
  .prepare(
    "SELECT id, kind, payload, updated_at AS at FROM records WHERE kind IN ('product','offer','history','feed') ORDER BY kind, id",
  )
  .all();
mkdirSync("seed", { recursive: true });
const body = rows.map((r) => JSON.stringify(r)).join("\n");
writeFileSync("seed/catalog.jsonl.gz", gzipSync(body, { level: 9 }));
console.log(`${rows.length} qeyd yazıldı: seed/catalog.jsonl.gz`);
