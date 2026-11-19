// Crawler rows → the site's product/offer records, with the same ids and rules as a crawl job in
// lib/crawl-jobs.ts (productStatements), so a crawler import updates the records the site already
// has instead of creating duplicates.
const { categoryOf, identity } = await import("../../lib/crawl-jobs.ts");
const { knownSourceProduct } = await import("../../lib/store-snapshots.ts");
const { brandFromName } = await import("../../lib/listing-sources.ts");

const httpsImage = (raw, base) => {
  if (!raw) return "";
  try {
    const u = new URL(raw, base);
    return u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
};

// row: one line of data/crawl/<store>/items.jsonl. source: { id, name, listing }.
export async function recordsForRow(row, source) {
  // Already-normalized catalog rows (WooCommerce Store API, Technomania feed) keep their ids.
  if (row.record?.productId) {
    const product = {
      id: row.record.productId,
      name: row.name.slice(0, 180),
      brand: String(row.brand || brandFromName(row.name) || "Digər").slice(0, 80),
      category: row.category || categoryOf(row.name),
      variant: row.variant || "Mənbədəki model",
      image: httpsImage(row.image, row.url) || "/favicon.svg",
      specs: row.specs || {},
      description: row.description || source.name + " açıq kataloqundan alınıb.",
      active: true,
      featured: false,
      sourceStoreId: source.id,
      sourceUrl: row.url,
      ...(row.familyId ? { familyId: row.familyId } : {}),
    };
    const offer =
      row.price === null || !row.record.offerId
        ? null
        : {
            id: row.record.offerId,
            productId: product.id,
            storeId: source.id,
            price: row.price,
            shipping: 0,
            shippingKnown: false,
            months: 0,
            installmentTotal: 0,
            stock: row.stock,
            stockKnown: row.stockKnown,
            warranty: "Mağazada dəqiqləşdirin",
            url: row.url,
            demo: false,
            checkedAt: row.checkedAt,
            cities: ["Bakı"],
            sponsored: false,
            sourceSku: row.sku || "",
            sourceName: row.name,
            ...(row.installments ? { installmentOptions: row.installments } : {}),
          };
    return { product, offer };
  }
  const known = knownSourceProduct(source.id, row.url);
  const pid =
    known?.product?.id ||
    (await identity(source.id, row.url + (row.variantId ? "#variant-" + row.variantId : "")));
  const ownBrand =
    row.brand && row.brand.toLowerCase() !== source.name.toLowerCase() ? row.brand : "";
  const product = {
    id: pid,
    name: row.name.slice(0, 180),
    brand: String(ownBrand || known?.product?.brand || brandFromName(row.name) || "Digər").slice(
      0,
      80,
    ),
    category:
      known?.product?.category ||
      (!/^[a-z]+$/.test(row.category || "")
        ? categoryOf(row.name + " " + (row.category || ""))
        : row.category) ||
      categoryOf(row.name),
    variant: known?.product?.variant || row.variant || "Mənbədəki model",
    image: httpsImage(row.image, row.url) || known?.product?.image || "/favicon.svg",
    specs: {
      ...known?.product?.specs,
      ...row.specs,
      "Mənbə SKU": row.sku || known?.offer.sourceSku || "",
      ...(row.gtin ? { GTIN: row.gtin } : {}),
    },
    description: row.description || source.name + " məhsul səhifəsindən yoxlanmış məlumat.",
    active: true,
    featured: false,
    sourceStoreId: source.id,
    sourceUrl: row.url,
    ...(row.familyId ? { familyId: row.familyId } : {}),
  };
  const offer = {
    id: known?.offer.id || pid + "-offer",
    productId: pid,
    storeId: source.id,
    price: row.price,
    shipping: 0,
    shippingKnown: false,
    months: 0,
    installmentTotal: 0,
    stock: row.stock,
    stockKnown: row.stockKnown,
    warranty: "Mağazada dəqiqləşdirin",
    url: row.url,
    demo: false,
    checkedAt: row.checkedAt,
    cities: ["Bakı"],
    sponsored: false,
    sourceSku: row.sku || known?.offer.sourceSku || "",
    sourceName: row.name,
  };
  return { product, offer };
}
