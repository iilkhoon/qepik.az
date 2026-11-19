// Store offers published by did.az (Azerbaijani price comparison) for stores whose own sites cannot
// be read here: bot protection (Kontakt, Birmarket, Music Gallery, Smart Electronics, Elit Optimal)
// or a long robots.txt Crawl-delay (İrşad, Smarton).
//   npm run crawl:did                          # default stores (see pick())
//   npm run crawl:did -- --stores kontakt,irshad
//   npm run crawl:did -- --list                # did.az stores and what we have for them
// did.az robots.txt allows /api; its llms.txt / ai-catalog.json describe the public catalogue for
// agents. Requests go one at a time with a pause (--delay-ms). Each offer keeps the merchant's own
// product link; did.az images are not copied. Results go to <out>/did/<store>/ and are used by
// crawl:import when the store has no file and no complete crawl of its own.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";

const { seedStores } = await import("../../lib/catalog.ts");
const { crawlSources } = await import("../../lib/crawl-sources.ts");

const { values: args } = parseArgs({
  options: {
    stores: { type: "string" },
    out: { type: "string", default: "data/crawl" },
    "delay-ms": { type: "string", default: "1500" },
    list: { type: "boolean", default: false },
  },
});
const OUT = path.resolve(args.out);
const DELAY = Math.max(1000, Number(args["delay-ms"]) || 1500);
const PAGE = 500;
const MAX_OFFERS = 60000;
const API = "https://did.az/api/";
const UA = "QepikBot/1.0 (+https://qepik.az)";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let lastRequest = 0;
async function api(pathAndQuery) {
  for (let attempt = 0; ; attempt++) {
    const wait = lastRequest + DELAY - Date.now();
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    let r;
    try {
      r = await fetch(API + pathAndQuery, {
        headers: { "User-Agent": UA, Accept: "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(60000),
      });
    } catch (e) {
      if (attempt >= 4) throw e;
      await sleep(5000 * 2 ** attempt);
      continue;
    }
    if (r.ok) return r.json();
    // Too fast or a temporary error: wait and try again; any other answer stops the run.
    if ((r.status === 429 || r.status >= 500) && attempt < 4) {
      const retry = Number(r.headers.get("retry-after")) * 1000;
      await sleep(Math.max(retry || 0, 30000 * 2 ** attempt));
      continue;
    }
    throw new Error(`did.az HTTP ${r.status} (${pathAndQuery})`);
  }
}

const bareDomain = (d) => d.toLowerCase().replace(/^www\./, "");
const storeByDomain = new Map(seedStores.map((s) => [bareDomain(s.domain), s]));
const crawled = new Set(crawlSources.map((s) => s.id));
const crawlStatus = (id) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT, id, "state.json"), "utf8")).status;
  } catch {
    return "";
  }
};

const didStores = await api("stores");
const ours = didStores
  .map((d) => ({ ...d, store: storeByDomain.get(bareDomain(d.domain)) }))
  .filter((d) => d.store && d.domain !== "tap.az");

if (args.list) {
  for (const d of didStores.filter((x) => x.domain !== "tap.az"))
    console.log(
      String(d.product_count).padStart(6),
      d.domain.padEnd(24),
      storeByDomain.get(bareDomain(d.domain))?.id || "— Qəpik-də mağaza yoxdur",
      storeByDomain.has(bareDomain(d.domain))
        ? crawled.has(storeByDomain.get(bareDomain(d.domain)).id)
          ? "(toplayıcı: " + (crawlStatus(storeByDomain.get(bareDomain(d.domain)).id) || "-") + ")"
          : "(toplayıcı mənbəyi yoxdur)"
        : "",
    );
  process.exit(0);
}

// Default: stores the crawler cannot read itself (no source, bot protection) or reads too slowly
// (robots.txt Crawl-delay ≥ 10 s). Stores the crawler finishes are read from their own sites.
const DEFAULT = new Set([
  "kontakt",
  "birmarket",
  "mgstore",
  "smartelectronics",
  "elitoptimal",
  "barkod",
  "myshops",
  "playroom",
  "irshad",
  "smarton",
  "seehome",
  "okim",
]);
const wanted = args.stores ? new Set(args.stores.split(",")) : DEFAULT;
const picked = ours.filter((d) => wanted.has(d.store.id));
for (const id of wanted)
  if (!picked.some((d) => d.store.id === id))
    console.log(`${id}: did.az-da bu mağaza yoxdur, buraxıldı.`);

// did.az product types → Qəpik categories (lib/catalog.ts). Unknown types fall back to the name
// rules of the crawl jobs (records.mjs → categoryOf).
function categoryOf(parent = "", sub = "") {
  const s = (sub || "").toLocaleLowerCase("az");
  const p = (parent || "").toLocaleLowerCase("az");
  if (/smartfon/.test(s)) return "telefon";
  if (/planşet|elektron kitab/.test(s)) return "planset";
  if (/noutbuk/.test(s)) return "noutbuk";
  if (/saat/.test(s)) return "saat";
  if (/qulaqlıq|dinamik|soundbar|musiqi/.test(s)) return "audio";
  if (/televizor|proyektor|tv aksesuar/.test(s)) return "tv";
  if (/kamera|dron|fotoaparat/.test(s)) return "foto";
  if (/avtomaqnitola|avto/.test(s)) return "avto";
  if (/^gaming/.test(p)) return "oyun";
  if (/gözəllik/.test(p)) return "gozellik";
  if (/məişət/.test(p)) return "ev";
  if (/kompüter|mobil/.test(p)) return "aksesuar";
  return "";
}
const onDomain = (url, store) => {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && bareDomain(u.hostname) === bareDomain(store.domain);
  } catch {
    return false;
  }
};
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 24);

const summary = [];
for (const d of picked) {
  const store = d.store;
  const startedAt = new Date().toISOString();
  const rows = new Map();
  let skipped = 0,
    complete = false,
    error = "";
  try {
    for (let offset = 0; offset < MAX_OFFERS; offset += PAGE) {
      const page = await api(
        `products?domain=${encodeURIComponent(d.domain)}&limit=${PAGE}&offset=${offset}`,
      );
      if (!Array.isArray(page)) throw new Error("did.az cavabı siyahı deyil");
      for (const r of page) {
        const price = Number(r.price);
        if (
          !r.name ||
          bareDomain(r.domain || "") !== bareDomain(d.domain) ||
          !onDomain(r.url, store) ||
          (r.currency && r.currency !== "AZN") ||
          !(price > 0 && price < 10000000)
        ) {
          skipped++;
          continue;
        }
        const old = Number(r.old_price);
        rows.set(r.url, {
          store: store.id,
          storeName: store.name,
          key: hash(r.url),
          url: r.url,
          name: String(r.name).trim().slice(0, 300),
          brand: String(r.brand || "").slice(0, 80),
          category: categoryOf(r.parent_category, r.sub_category),
          sku: String(r.mpn || ""),
          gtin: "",
          variant: [r.storage_capacity, r.color_en].filter(Boolean).join(" · "),
          variantId: "",
          familyId: "",
          price: Math.round(price * 100) / 100,
          oldPrice: old > price ? Math.round(old * 100) / 100 : null,
          currency: "AZN",
          stock: r.in_stock === true,
          stockKnown: typeof r.in_stock === "boolean",
          image: "",
          specs: {
            ...(r.ram ? { RAM: String(r.ram) } : {}),
            ...(r.processor ? { Prosessor: String(r.processor) } : {}),
            ...(r.screen_size ? { Ekran: String(r.screen_size) } : {}),
            "Qiymət mənbəyi": "did.az",
          },
          description: "",
          checkedAt: new Date().toISOString(),
        });
      }
      process.stdout.write(`\r${store.id}: ${rows.size} təklif`);
      if (page.length < PAGE) {
        complete = true;
        break;
      }
    }
  } catch (e) {
    error = e.message;
  }
  process.stdout.write("\n");
  const dir = path.join(OUT, "did", store.id);
  fs.mkdirSync(dir, { recursive: true });
  const list = [...rows.values()];
  fs.writeFileSync(
    path.join(dir, "items.jsonl"),
    list.map((r) => JSON.stringify(r)).join("\n") + (list.length ? "\n" : ""),
  );
  const state = {
    version: 1,
    sourceId: store.id,
    storeName: store.name,
    origin: "did.az",
    startedAt,
    finishedAt: new Date().toISOString(),
    // Only a run that reached the end of the store's list may mark missing offers as unknown stock.
    status: complete ? "complete" : "partial",
    error,
    stats: { rows: list.length, failed: skipped },
  };
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(state));
  summary.push({ id: store.id, didCount: d.product_count, ...state.stats, status: state.status });
  console.log(
    `${store.id.padEnd(17)} ${state.status.padEnd(8)} ${list.length} təklif, ${list.filter((r) => r.stock).length} stokda` +
      (skipped ? `, ${skipped} buraxıldı` : "") +
      (error ? ` — ${error}` : ""),
  );
}
fs.writeFileSync(path.join(OUT, "did", "summary.json"), JSON.stringify(summary, null, 2));
console.log("\nSayta yazmaq üçün: npm run crawl:import");
