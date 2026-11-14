// Technomania publishes an official JSON product feed; this writes one reading of it to the
// database. Used by the admin panel button and by the hourly scheduler pass.
import { fetchTechnomania } from "./technomania";
import { catalog, historyPoint, runBatched, statement } from "./api/records";
import type { Statement } from "./db";

export async function syncTechnomaniaFeed() {
  const feed = await fetchTechnomania();
  const c = await catalog();
  const currentIds = new Set(c.products.map((p) => p.id));
  const knownIds = new Set(feed.offers.map((o) => o.id));
  const commands: Statement[] = [];
  for (const p of feed.products) {
    if (p.id === "iphone16-black" && currentIds.has(p.id)) {
      const old = c.products.find((x) => x.id === p.id)!;
      commands.push(statement("product", { ...old, familyId: p.familyId }));
      continue;
    }
    commands.push(statement("product", p));
  }
  for (const o of feed.offers) commands.push(statement("offer", o));
  for (const old of c.offers.filter(
    (o) => o.storeId === "technomania" && o.id.startsWith("tm-offer-") && !knownIds.has(o.id),
  ))
    commands.push(statement("offer", { ...old, stock: false, checkedAt: feed.checkedAt }));
  // One history point per product whose lowest in-stock price differs from the last recorded one.
  const lastPrice = new Map<string, number>();
  for (const h of [...c.history].sort((a, b) => a.date.localeCompare(b.date)))
    lastPrice.set(h.productId, h.price);
  for (const pid of new Set(feed.offers.filter((o) => o.stock).map((o) => o.productId))) {
    const candidates = [
      ...feed.offers,
      ...c.offers.filter((o) => o.storeId !== "technomania"),
    ].filter((o) => o.productId === pid && o.stock && !o.demo);
    if (!candidates.length) continue;
    const low = Math.min(...candidates.map((o) => o.price + o.shipping));
    if (lastPrice.get(pid) !== low) commands.push(historyPoint(pid, low, feed.checkedAt));
  }
  commands.push(
    statement("feed", {
      id: "technomania",
      source: feed.source,
      checkedAt: feed.checkedAt,
      sourceCount: feed.sourceCount,
      variantCount: feed.variantCount,
      inStock: feed.inStock,
      warnings: feed.warnings,
    }),
  );
  await runBatched(commands, 45);
  return {
    sourceCount: feed.sourceCount,
    variantCount: feed.variantCount,
    inStock: feed.inStock,
    warnings: feed.warnings,
    checkedAt: feed.checkedAt,
  };
}
