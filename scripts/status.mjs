// Prints what the database holds and how each store import is doing: `node scripts/status.mjs`.
import { DatabaseSync } from "node:sqlite";
const db = new DatabaseSync(process.env.DATABASE_PATH || "data/qepik.sqlite", { readOnly: true });
const counts = db.prepare("SELECT kind, count(*) n FROM records GROUP BY kind").all();
console.log(counts.map((r) => `${r.kind}: ${r.n}`).join(" · "));
const stores = db
  .prepare(
    "SELECT json_extract(payload,'$.storeId') s, count(*) n, sum(json_extract(payload,'$.stock')) stock FROM records WHERE kind='offer' GROUP BY s ORDER BY n DESC",
  )
  .all();
console.log("\nTəkliflər mağaza üzrə:");
for (const r of stores) console.log(`  ${String(r.s).padEnd(18)} ${String(r.n).padStart(6)}  stokda ${r.stock}`);
console.log("\nİdxal işləri:");
const jobs = db.prepare("SELECT payload FROM records WHERE kind='crawlJob' ORDER BY updated_at DESC").all();
for (const r of jobs) {
  const j = JSON.parse(r.payload);
  console.log(
    `  ${j.sourceId.padEnd(18)} ${j.status.padEnd(11)} tapıldı ${String(j.discovered).padStart(6)} idxal ${String(j.imported).padStart(6)} xəta ${String(j.failed).padStart(5)} ötürüldü ${String(j.skipped).padStart(5)} ${(j.lastError || "").slice(0, 80)}`,
  );
}
