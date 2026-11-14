// Keeps catalog seeding and store imports moving inside the server process: one pass a minute,
// never two at once. Started on the first request (and by scripts/server.mjs right after boot).
import { db } from "./db";
import { tickDueCrawlJobs } from "./crawl-jobs";
import { materializeCatalog } from "./catalog-storage";
import { invalidatePublicCatalog } from "./public-data";
import { syncTechnomaniaFeed } from "./feed-sync";

const state = globalThis as {
  __qepikScheduler?: { running: boolean; timer: NodeJS.Timeout; feedAt: number };
};

async function pass() {
  const s = state.__qepikScheduler;
  if (!s || s.running) return;
  s.running = true;
  try {
    let status = await materializeCatalog(db());
    const seeding = !status.complete;
    while (!status.complete) status = await materializeCatalog(db());
    if (seeding) invalidatePublicCatalog();
    if (process.env.CRAWL !== "off") {
      if (Date.now() - s.feedAt >= 3600000) {
        s.feedAt = Date.now();
        await syncTechnomaniaFeed().then(
          () => invalidatePublicCatalog(),
          (e) => console.error("Technomania feed:", e instanceof Error ? e.message : e),
        );
      }
      const result = await tickDueCrawlJobs(db(), 50000);
      if (result.ticks) invalidatePublicCatalog();
      if (result.errors) console.error("İdxal: iş xətaları", result);
    }
  } catch (e) {
    console.error("Planlayıcı xətası:", e instanceof Error ? e.message : e);
  } finally {
    s.running = false;
  }
}

export function ensureScheduler() {
  if (state.__qepikScheduler) return;
  const timer = setInterval(pass, 60000);
  timer.unref();
  state.__qepikScheduler = { running: false, timer, feedAt: 0 };
  void pass();
}
