// Writes the crawler's results (data/crawl/<store>/items.jsonl) into the site's database:
//   npm run crawl:import                    # every crawled store
//   npm run crawl:import -- --only baku     # one store
//   DATABASE_PATH=/var/lib/qepik/qepik.sqlite npm run crawl:import
// Products/offers are upserted with the ids a crawl job would use; admin choices (active,
// featured) are kept. A price point is added to the history once a day per in-stock offer. After a
// complete crawl, the store's offers that were not seen again are shown as unknown stock (never
// deleted, never shown as in stock). Accounts and other records are not touched.
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { recordsForRow } from "./records.mjs";

const { crawlSources } = await import("../../lib/crawl-sources.ts");
const { values: args } = parseArgs({
  options: {
    only: { type: "string" },
    out: { type: "string", default: "data/crawl" },
    "dry-run": { type: "boolean", default: false },
  },
});
const OUT = path.resolve(args.out);
const dbFile = process.env.DATABASE_PATH || path.join("data", "qepik.sqlite");
const only = args.only ? new Set(args.only.split(",")) : null;
// Catalogs a store sent as a file (npm run crawl:file, <out>/files/<store>/) replace the crawled
// pages of that store.
const fileStores = fs.existsSync(path.join(OUT, "files"))
  ? fs
      .readdirSync(path.join(OUT, "files"))
      .filter((id) => fs.existsSync(path.join(OUT, "files", id, "items.jsonl")))
  : [];
const sources = [
  ...crawlSources,
  ...(crawlSources.some((s) => s.id === "technomania")
    ? []
    : [{ id: "technomania", name: "Technomania", listing: true }]),
]
  .filter((s) => !fileStores.includes(s.id))
  .map((s) => ({ ...s, dir: path.join(OUT, s.id) }))
  .concat(
    fileStores.map((id) => {
      const dir = path.join(OUT, "files", id);
      const st = JSON.parse(fs.readFileSync(path.join(dir, "state.json"), "utf8"));
      return { id, name: st.storeName || id, dir };
    }),
  )
  .filter((s) => (!only || only.has(s.id)) && fs.existsSync(path.join(s.dir, "items.jsonl")));
if (!sources.length) {
  console.log("İdxal ediləcək nəticə yoxdur. Əvvəlcə `npm run crawl` işlədin.");
  process.exit(0);
}

fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true });
const db = new DatabaseSync(dbFile);
db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=10000;");
db.exec(
  "CREATE TABLE IF NOT EXISTS records (id text PRIMARY KEY NOT NULL, kind text NOT NULL, payload text NOT NULL, updated_at integer NOT NULL); CREATE INDEX IF NOT EXISTS records_kind_updated ON records (kind, updated_at);",
);
const getPayload = db.prepare("SELECT payload FROM records WHERE id=?");
const upsert = db.prepare(
  "INSERT INTO records(id,kind,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
);
const put = (kind, value) =>
  upsert.run(kind + ":" + value.id, kind, JSON.stringify(value), Date.now());

let grandProducts = 0,
  grandOffers = 0;
for (const source of sources) {
  const state = JSON.parse(fs.readFileSync(path.join(source.dir, "state.json"), "utf8"));
  const rows = new Map();
  for (const line of fs.readFileSync(path.join(source.dir, "items.jsonl"), "utf8").split("\n"))
    if (line)
      try {
        const r = JSON.parse(line);
        rows.set(r.key, r);
      } catch {}
  const records = [];
  for (const row of rows.values()) records.push(await recordsForRow(row, source));
  let products = 0,
    offers = 0,
    history = 0,
    expired = 0;
  if (!args["dry-run"]) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const seenOffers = [];
      for (const { product, offer } of records) {
        const previous = getPayload.get("product:" + product.id);
        const old = previous ? JSON.parse(previous.payload) : undefined;
        put("product", {
          ...product,
          active: old?.active ?? true,
          featured: old?.featured ?? false,
        });
        products++;
        if (!offer) continue;
        put("offer", offer);
        seenOffers.push(offer.id);
        offers++;
        if (offer.stock && offer.stockKnown) {
          const day = offer.checkedAt.slice(0, 10);
          put("history", {
            id: "crawl-" + day + "-" + offer.id,
            productId: offer.productId,
            price: offer.price,
            date: offer.checkedAt,
            demo: false,
          });
          history++;
        }
      }
      // Same rule as a finished crawl job: only a run that read most of what it found may mark the
      // rest as unknown stock.
      const healthy =
        state.status === "complete" &&
        state.stats.rows * 10 >= state.stats.rows + state.stats.failed;
      if (healthy && seenOffers.length) {
        const r = db
          .prepare(
            "UPDATE records SET payload=json_set(payload,'$.stock',json('false'),'$.stockKnown',json('false')),updated_at=? WHERE kind='offer' AND json_extract(payload,'$.storeId')=? AND coalesce(json_extract(payload,'$.demo'),0)=0 AND json_extract(payload,'$.id') NOT IN (SELECT value FROM json_each(?)) AND (coalesce(json_extract(payload,'$.stock'),0)=1 OR coalesce(json_extract(payload,'$.stockKnown'),1)=1)",
          )
          .run(Date.now(), source.id, JSON.stringify(seenOffers));
        expired = Number(r.changes);
      }
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  } else {
    products = records.length;
    offers = records.filter((r) => r.offer).length;
  }
  grandProducts += products;
  grandOffers += offers;
  console.log(
    `${source.id.padEnd(17)} ${state.status.padEnd(11)} məhsul ${String(products).padStart(6)}  təklif ${String(offers).padStart(6)}  tarixçə ${String(history).padStart(6)}  naməlum stoka keçdi ${expired}`,
  );
}
console.log(
  `\nCəmi ${grandProducts} məhsul, ${grandOffers} təklif → ${dbFile}${args["dry-run"] ? " (sınaq, yazılmadı)" : ""}`,
);
console.log(
  "Sayt kataloqu ən gec 60 saniyəyə yenilənir. Paylanan snapshot üçün: node scripts/export-seed.mjs",
);
