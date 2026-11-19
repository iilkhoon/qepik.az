// Qəpik toplayıcısı: bütün konfiqurasiya edilmiş mağazalardan (lib/crawl-sources.ts) bütün məhsulları
// oxuyur və data/crawl/ altında saxlayır. Worker-dəki adapterlərin eynisini işlədir (lib/*.ts):
// robots.txt, Crawl-delay, domen sərhədi, yönləndirmə yoxlaması, ölçü limiti və bot yoxlamasında dayanma.
//
//   npm run crawl                       # bütün mağazalar, qaldığı yerdən davam edir
//   npm run crawl -- --only techbar,baku
//   npm run crawl -- --fresh            # vəziyyəti sıfırlayıb yenidən başla
//   npm run crawl -- --max-products 50  # hər mağazadan ən çox 50 məhsul səhifəsi (sınaq üçün)
//   npm run crawl -- --list             # mənbələri və son vəziyyəti göstər
//
// Çıxış (hər mağaza üçün data/crawl/<id>/):
//   state.json      növbə, görülən sitemap-lər, məhsul URL-ləri, kursor, statistika (davam üçün)
//   items.jsonl     oxunan hər məhsul/variant sətri (davam edəndə üstünə yazılır)
//   catalog.json    dublikatsız yekun: { storeId, checkedAt, products, offers } (saytın snapshot formatı)
// Ümumi: data/crawl/all-products.jsonl, data/crawl/summary.json, docs/crawl-coverage.json
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";
import { recordsForRow } from "./records.mjs";

const {
  crawlSources: siteSources,
  sourceUrlAllowed: siteUrlAllowed,
  isProductCandidate,
  parseSitemap,
  categoryPagesFromSitemap,
  discoverCategoryLinks,
} = await import("../../lib/crawl-sources.ts");
const { merchantPage, readMerchantSitemap, scanProduct, SourceAccessError, RobotsDisallowedError } =
  await import("../../lib/extractor.ts");
const { extractListing, listingCategories } = await import("../../lib/listing-sources.ts");
const { fetchTechnomania } = await import("../../lib/technomania.ts");

// The site reads Technomania's official feed outside the crawl jobs (lib/feed-sync.ts); the
// crawler reads it as one more listing source so the export has every store.
const crawlSources = [
  ...siteSources,
  ...(siteSources.some((s) => s.id === "technomania")
    ? []
    : [
        {
          id: "technomania",
          name: "Technomania",
          root: "https://technomania.az/api/catalog/feed?format=json",
          refreshHours: 1,
          listing: true,
          listingJson: true,
          listingStart: "https://technomania.az/api/catalog/feed?format=json",
          // Official feed the store provides for price comparison; read like lib/feed-sync.ts.
          officialFeed: true,
        },
      ]),
];
function sourceUrlAllowed(sourceId, raw) {
  if (siteSources.some((s) => s.id === sourceId)) return siteUrlAllowed(sourceId, raw);
  const source = crawlSources.find((s) => s.id === sourceId);
  try {
    const u = new URL(raw);
    return (
      !!source &&
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      u.hostname.replace(/^www\./, "") === new URL(source.root).hostname.replace(/^www\./, "")
    );
  } catch {
    return false;
  }
}

const { values: args } = parseArgs({
  options: {
    only: { type: "string" },
    skip: { type: "string" },
    fresh: { type: "boolean", default: false },
    "max-products": { type: "string" },
    "max-minutes": { type: "string" },
    concurrency: { type: "string", default: "40" },
    out: { type: "string", default: "data/crawl" },
    list: { type: "boolean", default: false },
    quiet: { type: "boolean", default: false },
  },
});
const OUT = path.resolve(args.out);
const maxProducts = args["max-products"] ? Number(args["max-products"]) : Infinity;
const deadline = args["max-minutes"] ? Date.now() + Number(args["max-minutes"]) * 60000 : Infinity;
const only = args.only ? new Set(args.only.split(",").map((s) => s.trim())) : null;
const skip = new Set((args.skip || "").split(",").filter(Boolean));
for (const id of [...(only || []), ...skip])
  if (!crawlSources.some((s) => s.id === id)) throw new Error("Naməlum mənbə: " + id);

const MAX_SITEMAPS = 2000;
const MAX_LISTING_PAGES = 20000;
const MAX_PRODUCT_URLS = 200000;
const MAX_RETRIES = 5;
const COOLDOWN_MS = 10 * 60000;
const COOLDOWNS = 3;
const BLOCK_RETRY_MS = 6 * 3600000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Long waits end early on Ctrl+C so the state is saved promptly.
async function nap(ms) {
  for (const end = Date.now() + ms; Date.now() < end && !stopping; )
    await sleep(Math.min(1000, end - Date.now()));
}
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 16);
let stopping = false;

function writeAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, file);
}
function log(id, ...msg) {
  if (!args.quiet) console.log(new Date().toISOString().slice(11, 19), id.padEnd(16), ...msg);
}
function freshState(source) {
  return {
    version: 1,
    sourceId: source.id,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: "discovering",
    // queue items: { url, kind: "sitemap" | "listing" | "category", advertised? }
    queue: [initialQueueItem(source)],
    seen: [],
    productUrls: [],
    cursor: 0,
    stats: {
      sitemaps: 0,
      listingPages: 0,
      categoryPages: 0,
      productPages: 0,
      rows: 0,
      failed: 0,
      skippedRobots: 0,
    },
    errors: [],
  };
}
function initialQueueItem(source) {
  if (source.listing && source.listingStart) return { url: source.listingStart, kind: "listing" };
  if (source.listingStart) return { url: source.listingStart, kind: "category" };
  return { url: source.root, kind: "sitemap", advertised: false };
}
function remember(state, url, message) {
  state.errors.push({ at: new Date().toISOString(), url, message: String(message).slice(0, 300) });
  if (state.errors.length > 200) state.errors.splice(0, state.errors.length - 200);
}

// One scanned product (lib/extractor ScannedProduct) → flat row.
function rowFromScan(source, item, pageUrl) {
  const url = item.url || pageUrl;
  return {
    store: source.id,
    storeName: source.name,
    key: hash(url + "|" + (item.variantId || item.variant || "")),
    url,
    name: String(item.name || "").trim(),
    brand: item.brand || "",
    category: item.category || "",
    sku: item.sku || "",
    gtin: item.gtin || "",
    variant: item.variant || "",
    variantId: item.variantId || "",
    familyId: item.familyId || "",
    price: item.price,
    oldPrice: item.oldPrice ?? null,
    currency: item.currency || "AZN",
    stock: !!item.stock,
    stockKnown: !!item.stockKnown,
    image: item.image || "",
    specs: item.specs || {},
    description: (item.description || "").slice(0, 1500),
    checkedAt: item.checkedAt || new Date().toISOString(),
  };
}
// Normalized { products, offers } (WooCommerce Store API, Technomania feed) → flat rows.
function rowsFromRecords(source, records) {
  const products = new Map(records.products.map((p) => [p.id, p]));
  const withOffer = new Set();
  const rows = [];
  for (const o of records.offers) {
    const p = products.get(o.productId);
    if (!p) continue;
    withOffer.add(p.id);
    rows.push({
      store: source.id,
      storeName: source.name,
      key: hash(o.id),
      url: o.url,
      name: p.name,
      brand: p.brand || "",
      category: p.category || "",
      sku: o.sourceSku || "",
      gtin: "",
      variant: p.variant || "",
      variantId: o.feedVariantIndex != null ? String(o.feedVariantIndex) : "",
      familyId: p.familyId || "",
      price: o.price,
      oldPrice: null,
      currency: "AZN",
      stock: !!o.stock,
      stockKnown: o.stockKnown !== false,
      image: p.image || "",
      specs: p.specs || {},
      description: "",
      installments: o.installmentOptions || undefined,
      checkedAt: o.checkedAt,
      record: { productId: p.id, offerId: o.id },
    });
  }
  // Products without a published price (Allstar) are kept, flagged price: null.
  for (const p of records.products)
    if (!withOffer.has(p.id))
      rows.push({
        store: source.id,
        storeName: source.name,
        key: hash(p.id),
        url: p.sourceUrl || "",
        name: p.name,
        brand: p.brand || "",
        category: p.category || "",
        sku: "",
        gtin: "",
        variant: p.variant || "",
        variantId: "",
        familyId: p.familyId || "",
        price: null,
        oldPrice: null,
        currency: "AZN",
        stock: false,
        stockKnown: false,
        image: p.image || "",
        specs: p.specs || {},
        description: "",
        checkedAt: new Date().toISOString(),
        record: { productId: p.id },
      });
  return rows;
}
function validRow(r) {
  if (!r.name) return "Ad boşdur";
  if (r.url && !sourceUrlAllowed(r.store, r.url)) return "Mənbə domeni uyğun deyil";
  if (r.price !== null && !(Number.isFinite(r.price) && r.price > 0 && r.price < 10000000))
    return "Qiymət düzgün deyil";
  if (r.currency !== "AZN") return "Valyuta AZN deyil";
  return "";
}

class SourceCrawler {
  constructor(source) {
    this.source = source;
    this.dir = path.join(OUT, source.id);
    this.stateFile = path.join(this.dir, "state.json");
    this.itemsFile = path.join(this.dir, "items.jsonl");
    this.productsThisRun = 0;
    this.okThisRun = 0;
    this.cooldowns = 0;
    this.extraDelayMs = 0;
    this.dirty = 0;
  }
  load() {
    let state = null;
    if (!args.fresh)
      try {
        state = JSON.parse(fs.readFileSync(this.stateFile, "utf8"));
      } catch {}
    // A finished run is started again: the crawler always refreshes prices.
    if (!state || state.version !== 1 || state.status === "complete") {
      state = freshState(this.source);
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(this.itemsFile, "");
    }
    this.state = state;
    this.seen = new Set(state.seen);
    this.queued = new Set(state.queue.map((q) => q.url));
    this.known = new Set(state.productUrls);
  }
  // Every 20 steps or 30 s, whichever comes first (slow Crawl-delay sources too).
  save(force = false) {
    if (!force && ++this.dirty < 20 && Date.now() - (this.savedAt || 0) < 30000) return;
    this.dirty = 0;
    this.savedAt = Date.now();
    this.state.seen = [...this.seen];
    writeAtomic(this.stateFile, JSON.stringify(this.state));
  }
  emit(rows) {
    const good = [];
    for (const r of rows) {
      const problem = validRow(r);
      if (problem) {
        this.state.stats.failed++;
        remember(this.state, r.url, problem);
      } else good.push(r);
    }
    if (good.length)
      fs.appendFileSync(this.itemsFile, good.map((r) => JSON.stringify(r)).join("\n") + "\n");
    this.state.stats.rows += good.length;
  }
  enqueue(item) {
    if (this.seen.has(item.url) || this.queued.has(item.url)) return;
    if (!sourceUrlAllowed(this.source.id, item.url)) return;
    this.queued.add(item.url);
    this.state.queue.push(item);
  }
  addProductUrls(urls) {
    for (const u of urls) {
      if (this.known.has(u) || this.known.size >= MAX_PRODUCT_URLS) continue;
      this.known.add(u);
      this.state.productUrls.push(u);
    }
  }
  // Retries network errors and 5xx with backoff; 401/403/429-without-wait and bot challenges stop
  // the source (never bypassed).
  // A 403/429 after the store has already answered this run is read as "too fast": the source
  // pauses (COOLDOWN_MS), halves its own request rate and tries again, at most COOLDOWNS times per
  // run. A 403/401 on the first request and every bot challenge stop the source at once; access
  // checks are never bypassed.
  async withRetry(url, fn) {
    for (let attempt = 0; ; attempt++) {
      try {
        const value = await fn();
        this.okThisRun++;
        if (this.extraDelayMs) await sleep(this.extraDelayMs);
        return value;
      } catch (e) {
        const access = e instanceof SourceAccessError ? e : null;
        const refused = access && [401, 403, 429].includes(access.status) && !access.challenge;
        if (
          refused &&
          access.status !== 401 &&
          this.okThisRun > 0 &&
          this.cooldowns < COOLDOWNS &&
          access.retryAfterMs <= COOLDOWN_MS &&
          !stopping
        ) {
          this.cooldowns++;
          this.extraDelayMs = Math.max(2000, this.extraDelayMs * 2);
          const wait = Math.max(COOLDOWN_MS, access.retryAfterMs);
          log(
            this.source.id,
            `HTTP ${access.status} — ${Math.round(wait / 60000)} dəq gözləyir, sonra hər sorğu arasında +${this.extraDelayMs / 1000} s`,
          );
          await nap(wait);
          if (stopping) throw e;
          continue;
        }
        if (access?.challenge || refused) throw Object.assign(e, { fatal: true });
        const transient =
          (access && access.status >= 500) ||
          ["AbortError", "TimeoutError", "TypeError"].includes(e?.name);
        if (!transient || attempt >= MAX_RETRIES - 1) throw e;
        await sleep(Math.max(access?.retryAfterMs || 0, Math.min(60000, 2000 * 2 ** attempt)));
      }
    }
  }
  async discoverStep(item) {
    const s = this.source;
    if (item.kind === "listing") {
      if (++this.state.stats.listingPages > MAX_LISTING_PAGES)
        throw new Error("Siyahı səhifəsi limiti");
      const listing = s.officialFeed
        ? {
            items: [],
            pages: [],
            records: await this.withRetry(item.url, () => fetchTechnomania()),
          }
        : extractListing(
            s.id,
            await this.withRetry(item.url, () =>
              merchantPage(item.url, { fragment: s.listingFragment, json: s.listingJson }),
            ),
            item.url,
          );
      const rows = [
        ...listing.items.map((x) => rowFromScan(s, x, item.url)),
        ...(listing.records ? rowsFromRecords(s, listing.records) : []),
      ];
      this.emit(rows);
      for (const url of listing.pages) this.enqueue({ url, kind: "listing" });
      return rows.length + " sətir, növbədə " + this.state.queue.length;
    }
    if (item.kind === "category") {
      if (++this.state.stats.categoryPages > MAX_LISTING_PAGES)
        throw new Error("Kateqoriya səhifəsi limiti");
      const html = await this.withRetry(item.url, () => merchantPage(item.url));
      const links = discoverCategoryLinks(s.id, item.url, html);
      this.addProductUrls(links.products);
      for (const url of links.pages) this.enqueue({ url, kind: "category" });
      return links.products.length + " məhsul linki, cəmi " + this.known.size;
    }
    if (++this.state.stats.sitemaps > MAX_SITEMAPS) throw new Error("Sitemap limiti");
    const xml = await this.withRetry(item.url, () =>
      readMerchantSitemap(item.url, { advertised: item.advertised }),
    );
    const parsed = parseSitemap(xml);
    const locs = [...new Set(parsed.locs.filter((u) => sourceUrlAllowed(s.id, u)))];
    if (parsed.index) {
      for (const url of locs) this.enqueue({ url, kind: "sitemap", advertised: true });
      return "indeks: " + locs.length + " sitemap";
    }
    if (s.listing) {
      const cats = listingCategories(s.id, locs);
      for (const url of cats) this.enqueue({ url, kind: "listing" });
      return cats.length + " kateqoriya";
    }
    const products = locs.filter((u) => isProductCandidate(s.id, u));
    this.addProductUrls(products);
    for (const url of categoryPagesFromSitemap(s.id, locs)) this.enqueue({ url, kind: "category" });
    return products.length + " məhsul linki, cəmi " + this.known.size;
  }
  async importStep(url) {
    this.state.stats.productPages++;
    const parsed = await this.withRetry(url, () => scanProduct(url, { variants: true }));
    const variants = parsed.variants?.length ? parsed.variants : [parsed];
    this.emit(variants.map((v) => rowFromScan(this.source, { ...v, url: v.url || url }, url)));
  }
  async run() {
    this.load();
    const st = this.state;
    const id = this.source.id;
    // A blocked source is tried again from where it stopped once the block is BLOCK_RETRY_MS old.
    if (st.status === "blocked") {
      const age = Date.now() - Date.parse(st.blockedAt || st.startedAt);
      if (age < BLOCK_RETRY_MS) {
        log(
          id,
          `bloklanıb (${st.blockedReason}); ${Math.ceil((BLOCK_RETRY_MS - age) / 3600000)} saat sonra yenidən yoxlanacaq (və ya --fresh)`,
        );
        await this.buildCatalog();
        return this.summary();
      }
      st.status = st.phaseBeforeBlock || "discovering";
      delete st.blockedReason;
    }
    log(
      id,
      st.status === "discovering" && !st.stats.sitemaps && !st.stats.listingPages
        ? "başlayır"
        : "davam edir",
      "(" + st.status + ")",
    );
    try {
      while (st.status === "discovering" && st.queue.length && !stopping && Date.now() < deadline) {
        const item = st.queue[0];
        try {
          const note = await this.discoverStep(item);
          log(id, item.kind, item.url, "→", note);
        } catch (e) {
          if (stopping) break;
          if (e.fatal) throw e;
          st.stats.failed++;
          if (e instanceof RobotsDisallowedError) st.stats.skippedRobots++;
          remember(st, item.url, e.message);
          log(id, "xəta", item.url, e.message);
        }
        st.queue.shift();
        this.queued.delete(item.url);
        if (item.kind !== "listing") this.seen.add(item.url);
        this.save();
      }
      if (st.status === "discovering" && !st.queue.length) {
        st.status = "importing";
        log(id, "kəşf bitdi:", this.known.size, "məhsul səhifəsi oxunacaq");
        this.save(true);
      }
      while (
        st.status === "importing" &&
        st.cursor < st.productUrls.length &&
        !stopping &&
        Date.now() < deadline &&
        this.productsThisRun < maxProducts
      ) {
        const url = st.productUrls[st.cursor];
        this.productsThisRun++;
        try {
          await this.importStep(url);
        } catch (e) {
          if (stopping) break;
          if (e.fatal) throw e;
          st.stats.failed++;
          if (e instanceof RobotsDisallowedError) st.stats.skippedRobots++;
          remember(st, url, e.message);
        }
        st.cursor++;
        if (st.cursor % 50 === 0)
          log(
            id,
            "məhsul",
            st.cursor + "/" + st.productUrls.length,
            "sətir:",
            st.stats.rows,
            "xəta:",
            st.stats.failed,
          );
        this.save();
      }
      if (st.status === "importing" && st.cursor >= st.productUrls.length) {
        st.status = "complete";
        st.finishedAt = new Date().toISOString();
      }
    } catch (e) {
      st.phaseBeforeBlock = st.status;
      st.status = "blocked";
      st.blockedReason = e.message;
      st.blockedAt = new Date().toISOString();
      remember(st, st.queue[0]?.url || st.productUrls[st.cursor] || this.source.root, e.message);
      log(id, "BLOKLANDI:", e.message);
    }
    this.save(true);
    await this.buildCatalog();
    log(id, "vəziyyət:", st.status, "sətir:", st.stats.rows, "xəta:", st.stats.failed);
    return this.summary();
  }
  // items.jsonl → deduplicated rows and the site's snapshot format (lib/store-catalogs/*.json),
  // with the record ids the site's own crawl jobs use (scripts/crawler/records.mjs).
  async buildCatalog() {
    const rows = new Map();
    if (fs.existsSync(this.itemsFile))
      for (const line of fs.readFileSync(this.itemsFile, "utf8").split("\n")) {
        if (!line) continue;
        try {
          const r = JSON.parse(line);
          rows.set(r.key, r);
        } catch {}
      }
    this.rows = [...rows.values()];
    const products = [],
      offers = [];
    for (const r of this.rows) {
      const { product, offer } = await recordsForRow(r, this.source);
      products.push(product);
      if (offer) offers.push(offer);
    }
    writeAtomic(
      path.join(this.dir, "catalog.json"),
      JSON.stringify({
        storeId: this.source.id,
        checkedAt: new Date().toISOString(),
        status: this.state.status,
        products,
        offers,
      }),
    );
  }
  summary() {
    const st = this.state;
    const rows = this.rows || [];
    return {
      id: this.source.id,
      name: this.source.name,
      status: st.status,
      blockedReason: st.blockedReason || null,
      startedAt: st.startedAt,
      finishedAt: st.finishedAt,
      productUrls: st.productUrls.length,
      productPagesRead: st.cursor,
      rows: rows.length,
      priced: rows.filter((r) => r.price !== null).length,
      inStock: rows.filter((r) => r.stock).length,
      stockUnknown: rows.filter((r) => !r.stockKnown).length,
      failed: st.stats.failed,
      skippedRobots: st.stats.skippedRobots,
      sitemaps: st.stats.sitemaps,
      listingPages: st.stats.listingPages,
      categoryPages: st.stats.categoryPages,
      lastErrors: st.errors.slice(-5),
    };
  }
}

const selected = crawlSources.filter((s) => (!only || only.has(s.id)) && !skip.has(s.id));

if (args.list) {
  for (const s of crawlSources) {
    let st = null;
    try {
      st = JSON.parse(fs.readFileSync(path.join(OUT, s.id, "state.json"), "utf8"));
    } catch {}
    console.log(
      s.id.padEnd(16),
      (st?.status || "-").padEnd(12),
      st
        ? `sətir ${st.stats.rows}, məhsul ${st.cursor}/${st.productUrls.length}, xəta ${st.stats.failed}`
        : "",
    );
  }
  process.exit(0);
}

for (const sig of ["SIGINT", "SIGTERM"])
  process.on(sig, () => {
    if (stopping) process.exit(130);
    stopping = true;
    console.log(
      "\nDayandırılır: cari sorğular bitəndə vəziyyət saxlanacaq (yenidən Ctrl+C — dərhal çıxış).",
    );
  });

// Every source shares lib/extractor's per-host queue (1 s minimum, robots Crawl-delay), so sources
// on different hosts run in parallel and each host still sees one request at a time.
const results = [];
const pending = [...selected];
const workers = Array.from(
  { length: Math.max(1, Math.min(Number(args.concurrency) || 40, pending.length)) },
  async () => {
    while (pending.length && !stopping) {
      const source = pending.shift();
      try {
        results.push(await new SourceCrawler(source).run());
      } catch (e) {
        log(source.id, "gözlənilməz xəta:", e.stack || e.message);
        results.push({
          id: source.id,
          name: source.name,
          status: "error",
          blockedReason: e.message,
        });
      }
    }
  },
);
await Promise.all(workers);

// Merge every store's final rows (also stores not crawled in this run) into one file.
const merged = fs.createWriteStream(path.join(OUT, "all-products.jsonl"));
let total = 0;
for (const s of crawlSources) {
  const file = path.join(OUT, s.id, "catalog.json");
  if (!fs.existsSync(file)) continue;
  const c = JSON.parse(fs.readFileSync(file, "utf8"));
  const offers = new Map(c.offers.map((o) => [o.productId, o]));
  for (const p of c.products) {
    const o = offers.get(p.id);
    merged.write(
      JSON.stringify({
        store: s.id,
        name: p.name,
        brand: p.brand,
        category: p.category,
        variant: p.variant,
        price: o?.price ?? null,
        stock: o?.stock ?? false,
        stockKnown: o?.stockKnown ?? false,
        url: o?.url || p.sourceUrl,
        image: p.image,
        sku: o?.sourceSku || "",
        checkedAt: o?.checkedAt || c.checkedAt,
      }) + "\n",
    );
    total++;
  }
}
await new Promise((r) => merged.end(r));

const previous = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(OUT, "summary.json"), "utf8")).sources || [];
  } catch {
    return [];
  }
})();
const bySource = new Map(previous.map((x) => [x.id, x]));
for (const r of results) bySource.set(r.id, r);
const summary = {
  generatedAt: new Date().toISOString(),
  totalRows: total,
  sources: crawlSources.map((s) => bySource.get(s.id)).filter(Boolean),
};
writeAtomic(path.join(OUT, "summary.json"), JSON.stringify(summary, null, 2));
console.log("\nMağaza            vəziyyət     sətir   qiymətli  stokda  xəta");
for (const r of summary.sources)
  console.log(
    r.id.padEnd(17),
    String(r.status).padEnd(12),
    String(r.rows ?? "").padStart(6),
    String(r.priced ?? "").padStart(9),
    String(r.inStock ?? "").padStart(7),
    String(r.failed ?? "").padStart(5),
    r.blockedReason ? " — " + r.blockedReason : "",
  );
console.log(
  "\nCəmi " + total + " məhsul/variant →",
  path.relative(process.cwd(), path.join(OUT, "all-products.jsonl")),
);
process.exit(stopping ? 130 : 0);
