// A store's own product export → the crawler's result format, ready for `npm run crawl:import`:
//   npm run crawl:file -- --store kontakt --file kontakt.csv
//   npm run crawl:file -- --store okim --file https://okim.az/feed.xml
// For stores that send their catalog instead of being read page by page (bot protection, slow
// Crawl-delay). Accepted: CSV (comma, semicolon or tab; Excel "Save as CSV UTF-8"), JSON (array or
// { products: [...] }), Google Merchant / Facebook RSS XML (<item> with g:*), and YML (<offer>).
// Column names are matched in Azerbaijani, English and Russian (see FIELDS).
// The result is written to <out>/files/<store>/; while it exists, crawl:import uses it for that
// store instead of the crawled pages.
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parseArgs } from "node:util";

const { seedStores } = await import("../../lib/catalog.ts");
const { parsePrice } = await import("../../lib/price.ts");

const { values: args } = parseArgs({
  options: {
    store: { type: "string" },
    file: { type: "string" },
    out: { type: "string", default: "data/crawl" },
    "dry-run": { type: "boolean", default: false },
  },
});
const store = seedStores.find((s) => s.id === args.store);
if (!store || !args.file) {
  console.error(
    "İstifadə: npm run crawl:file -- --store <mağaza> --file <fayl və ya https:// link>\nMağazalar: " +
      seedStores.map((s) => s.id).join(", "),
  );
  process.exit(1);
}

// Header aliases, compared after lowercasing and removing spaces, "_", "-", "?" and ":".
const FIELDS = {
  name: [
    "name",
    "title",
    "productname",
    "ad",
    "adı",
    "məhsul",
    "mehsul",
    "məhsuladı",
    "название",
    "наименование",
    "товар",
    "gtitle",
  ],
  price: ["price", "qiymət", "qiymet", "satışqiyməti", "цена", "gprice"],
  salePrice: [
    "saleprice",
    "endirimliqiymət",
    "endirimliqiymet",
    "discountprice",
    "specialprice",
    "special",
    "акционнаяцена",
    "ценасоскидкой",
    "gsaleprice",
  ],
  regularPrice: [
    "regularprice",
    "oldprice",
    "köhnəqiymət",
    "kohneqiymet",
    "compareatprice",
    "старцена",
    "стараяцена",
    "oldprice",
  ],
  url: ["url", "link", "producturl", "keçid", "kecid", "ссылка", "glink"],
  image: [
    "image",
    "images",
    "imagelink",
    "imageurl",
    "picture",
    "şəkil",
    "sekil",
    "картинка",
    "изображение",
    "фото",
    "gimagelink",
  ],
  sku: ["sku", "kod", "artikul", "mpn", "model", "артикул", "код", "gmpn", "productcode"],
  id: ["id", "productid", "gid"],
  gtin: ["gtin", "ean", "barcode", "barkod", "штрихкод", "ggtin"],
  brand: ["brand", "marka", "brend", "vendor", "manufacturer", "бренд", "производитель", "gbrand"],
  category: [
    "category",
    "categories",
    "kateqoriya",
    "producttype",
    "категория",
    "gproducttype",
    "googleproductcategory",
  ],
  stock: [
    "stock",
    "instock",
    "stok",
    "stock status",
    "stockstatus",
    "availability",
    "available",
    "quantity",
    "qty",
    "miqdar",
    "наличие",
    "количество",
    "остаток",
    "gavailability",
  ],
  description: ["description", "təsvir", "tesvir", "описание", "gdescription"],
};
const norm = (h) => h.toLowerCase().replace(/[\s_\-?:]/g, "");
const aliasOf = new Map();
for (const [field, names] of Object.entries(FIELDS))
  for (const n of names) if (!aliasOf.has(norm(n))) aliasOf.set(norm(n), field);

async function readInput(src) {
  if (/^https:\/\//.test(src)) {
    const r = await fetch(src, { headers: { "User-Agent": "QepikBot/1.0" } });
    if (!r.ok) throw new Error(`Fayl linki açılmadı: HTTP ${r.status}`);
    return r.text();
  }
  return fs.readFileSync(src, "utf8");
}

function parseCsv(text) {
  const firstLine = text.slice(0, text.indexOf("\n") >>> 0);
  const sep = [";", "\t", ","].sort(
    (a, b) => firstLine.split(b).length - firstLine.split(a).length,
  )[0];
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) endCell();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endCell();
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  const [header, ...body] = rows;
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const decode = (s) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
function parseXml(text) {
  if (/<!ENTITY/i.test(text)) throw new Error("XML-də ENTITY qəbul edilmir.");
  const blocks = [...text.matchAll(/<(item|entry|offer)\b([^>]*)>([\s\S]*?)<\/\1>/g)];
  return blocks.map(([, tag, attrs, body]) => {
    const o = {};
    for (const [, k, v] of body.matchAll(/<([\w:]+)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/g)) {
      const key = k.replace(/^g:/, "g");
      if (!(key in o)) o[key] = decode(v);
    }
    // YML: <offer id=".." available="true">, <oldprice>, <vendor>, <categoryId>.
    if (tag === "offer") {
      const avail = /available="(true|false)"/.exec(attrs);
      if (avail && !("available" in o)) o.available = avail[1];
      const id = /\bid="([^"]+)"/.exec(attrs);
      if (id && !("id" in o)) o.id = id[1];
    }
    return o;
  });
}

function parseJson(text) {
  const data = JSON.parse(text);
  const list = Array.isArray(data) ? data : data.products || data.items || data.data || [];
  if (!Array.isArray(list)) throw new Error("JSON-da məhsul siyahısı tapılmadı.");
  return list;
}

function fieldsOf(raw) {
  const f = {};
  for (const [k, v] of Object.entries(raw)) {
    const field = aliasOf.get(norm(k));
    if (!field || f[field] !== undefined || v === null || v === "") continue;
    f[field] = typeof v === "object" ? (Array.isArray(v) ? v[0] : (v.url ?? v.name ?? "")) : v;
  }
  return f;
}
const money = (v) => {
  if (v === undefined || v === "") return NaN;
  return parsePrice(typeof v === "number" ? v : String(v).replace(/\s*(AZN|₼)\s*$/i, ""));
};
function stockOf(v) {
  if (v === undefined || v === "") return { stock: false, stockKnown: false };
  if (typeof v === "boolean") return { stock: v, stockKnown: true };
  const s = String(v).trim().toLowerCase();
  if (/^-?\d+([.,]\d+)?$/.test(s))
    return { stock: Number(s.replace(",", ".")) > 0, stockKnown: true };
  if (
    /^(1|true|yes|bəli|beli|var|instock|in stock|in_stock|stokda|mövcuddur|movcuddur|есть|в наличии|да)$/.test(
      s,
    )
  )
    return { stock: true, stockKnown: true };
  if (
    /^(0|false|no|xeyr|yoxdur|outofstock|out of stock|out_of_stock|bitib|нет|нет в наличии)$/.test(
      s,
    )
  )
    return { stock: false, stockKnown: true };
  return { stock: false, stockKnown: false };
}
const onStore = (raw) => {
  if (!raw.trim()) return "";
  try {
    const u = new URL(raw, "https://" + store.domain);
    const host = u.hostname.replace(/^www\./, "");
    return u.protocol === "https:" && host === store.domain.replace(/^www\./, "") ? u.href : "";
  } catch {
    return "";
  }
};
const hash = (s) => createHash("sha256").update(s).digest("hex").slice(0, 24);

const text = (await readInput(args.file)).replace(/^\uFEFF/, "");
const head = text.trimStart().slice(0, 1);
const kind = head === "<" ? "xml" : head === "[" || head === "{" ? "json" : "csv";
const raws = kind === "xml" ? parseXml(text) : kind === "json" ? parseJson(text) : parseCsv(text);
if (!raws.length) throw new Error("Faylda məhsul tapılmadı.");

const checkedAt = new Date().toISOString();
const rows = [];
const problems = new Map();
const problem = (why) => problems.set(why, (problems.get(why) || 0) + 1);
for (const raw of raws) {
  const f = fieldsOf(raw);
  const name = String(f.name || "").trim();
  if (!name) {
    problem("adı yoxdur");
    continue;
  }
  const sale = money(f.salePrice);
  const regular = money(f.regularPrice);
  const listed = money(f.price);
  // Sale price wins; the higher crossed-out price is only ever the old price.
  const price = [sale, listed, regular].find((n) => Number.isFinite(n) && n > 0);
  if (!price || price >= 10000000) {
    problem("qiyməti yoxdur və ya AZN deyil");
    continue;
  }
  const old = [regular, listed].find((n) => Number.isFinite(n) && n > price) ?? null;
  const sku = String(f.sku || f.id || "").trim();
  const url =
    onStore(String(f.url || "")) ||
    // No product link in the export: the store page plus the code keeps every row distinct.
    `https://${store.domain}/#qepik-${encodeURIComponent(sku || hash(name))}`;
  const image = String(f.image || "")
    .split(/[,|]\s*(?=https?:)/)[0]
    .trim();
  rows.push({
    store: store.id,
    storeName: store.name,
    key: hash(url + "|" + sku),
    url,
    name: name.slice(0, 300),
    brand: String(f.brand || "").slice(0, 80),
    category: String(f.category || "")
      .split(/\s*[>|]\s*/)
      .pop()
      .slice(0, 120),
    sku: sku.slice(0, 120),
    gtin: String(f.gtin || "").slice(0, 32),
    variant: "",
    variantId: "",
    familyId: "",
    price: Math.round(price * 100) / 100,
    oldPrice: old && Math.round(old * 100) / 100,
    currency: "AZN",
    ...stockOf(f.stock),
    image: /^https:\/\//.test(image) ? image : "",
    specs: {},
    description: String(f.description || "").slice(0, 1500),
    checkedAt,
  });
}

const unique = [...new Map(rows.map((r) => [r.key, r])).values()];
console.log(
  `${store.name}: ${raws.length} sətir (${kind.toUpperCase()}) → ${unique.length} məhsul, ` +
    `${unique.filter((r) => r.stock).length} stokda, ${unique.filter((r) => !r.url.includes("#qepik-")).length} linkli`,
);
for (const [why, n] of problems) console.log(`  buraxıldı (${why}): ${n}`);
if (raws.length && !unique.length) {
  console.log(
    "  Tanınan sütun tapılmadı. Faylın başlıqları: " + Object.keys(raws[0]).slice(0, 20).join(", "),
  );
  process.exit(1);
}
if (args["dry-run"]) process.exit(0);

const dir = path.join(path.resolve(args.out), "files", store.id);
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(
  path.join(dir, "items.jsonl"),
  unique.map((r) => JSON.stringify(r)).join("\n") + "\n",
);
fs.writeFileSync(
  path.join(dir, "state.json"),
  JSON.stringify({
    version: 1,
    sourceId: store.id,
    storeName: store.name,
    origin: "file",
    file: /^https:/.test(args.file) ? args.file : path.basename(args.file),
    startedAt: checkedAt,
    finishedAt: checkedAt,
    // A whole export is a complete reading: crawl:import may mark products missing from it as
    // unknown stock.
    status: "complete",
    stats: { rows: unique.length, failed: raws.length - rows.length },
  }),
);
console.log(`→ ${dir}\nSayta yazmaq üçün: npm run crawl:import -- --only ${store.id}`);
