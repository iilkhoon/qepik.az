import {
  listCrawlJobs,
  startCrawlJob,
  tickCrawlJob,
  controlCrawlJob,
} from "../../../../lib/crawl-jobs";
import sitemapCoverage from "../../../../docs/sitemap-source-coverage.json";
import { catalogSlice, parseCatalogQuery, suggest } from "../../../../lib/catalog-query";
import { invalidatePublicCatalog, publicCatalog } from "../../../../lib/public-data";
import { fetchTechnomania } from "../../../../lib/technomania";
import { syncTechnomaniaFeed } from "../../../../lib/feed-sync";
import { materializeCatalog } from "../../../../lib/catalog-storage";
import {
  applyProductMatches,
  mergeDuplicateProducts,
  prepareProductMatch,
  productMatchCandidates,
  type ProductMatch,
} from "../../../../lib/product-matching";
import { withProductMatchLock, MatchConflictError } from "../../../../lib/match-store";
import { canonicalProductId } from "../../../../lib/catalog";
import { getUser, type User } from "../../../auth";
import {
  SESSION_COOKIE,
  checkCredentials,
  createAccount,
  endSession,
  normalizePhone,
  sessionCookie,
  startSession,
} from "../../../../lib/accounts";
import { ensureScheduler } from "../../../../lib/scheduler";
import { cookies } from "next/headers";
import { scanProduct, safeMerchantUrl } from "../../../../lib/extractor";
import {
  ApiError,
  MAX_BODY,
  bareHost,
  crossSite,
  errorResponse,
  rateLimited,
  readJson,
} from "../../../../lib/api/http";
import { id, offer, saveRequest } from "../../../../lib/api/schemas";
import {
  audit,
  catalog,
  db,
  historyPoint,
  list,
  ownerId,
  runBatched,
  statement,
} from "../../../../lib/api/records";
import { z } from "zod";
export const dynamic = "force-dynamic";

const json = (v: unknown, status = 200) =>
  Response.json(v, {
    status,
    headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
  });

const clientKey = (req: Request, user: User | null) =>
  user?.userId ||
  req.headers.get("x-real-ip") ||
  req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
  "anonymous";
const tooMany = () =>
  Response.json(
    { error: "Çox sayda sorğu. Bir az sonra yenidən cəhd edin." },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": "60" } },
  );

// Registration is open to everyone, so the owner slot can only be claimed by the account whose
// e-mail is set in OWNER_EMAIL on the server.
function mayClaimOwner(user: User) {
  const allowed = process.env.OWNER_EMAIL?.trim().toLowerCase();
  return !!allowed && user.email.trim().toLowerCase() === allowed;
}

async function bootstrap(user: User) {
  // An existing owner can never be replaced here.
  if (!(await ownerId()) && !mayClaimOwner(user))
    return json({ error: "Bu hesab platforma sahibi kimi təyin edilə bilməz." }, 403);
  await db()
    .prepare(
      "INSERT OR IGNORE INTO records (id,kind,payload,updated_at) VALUES ('system:owner','system',?,?)",
    )
    .bind(JSON.stringify({ userId: user.userId }), Date.now())
    .run();
  if ((await ownerId()) !== user.userId)
    return json({ error: "Admin yalnız platforma sahibidir." }, 403);
  const seed = await db().prepare("SELECT id FROM records WHERE id='system:seed'").first();
  if (!seed) {
    let progress = await materializeCatalog(db());
    while (!progress.complete) progress = await materializeCatalog(db());
    await statement("system", { id: "seed" }).run();
  }
  return json({ ok: true });
}

async function personalGet(user: User | null) {
  if (!user) return json({ favorites: [], alerts: [] });
  const r = await db()
    .prepare("SELECT kind,payload FROM personal WHERE user_id=? ORDER BY updated_at DESC")
    .bind(user.userId)
    .all<{ kind: string; payload: string }>();
  const aliases = (await publicCatalog()).productAliases || {};
  const unique = (kind: string) => {
    const found = new Map();
    for (const row of r.results.filter((v) => v.kind === kind)) {
      const value = JSON.parse(row.payload);
      const productId = canonicalProductId({ productAliases: aliases }, value.productId);
      if (!found.has(productId)) found.set(productId, { ...value, productId });
    }
    return [...found.values()];
  };
  return json({ favorites: unique("favorite"), alerts: unique("alert") });
}

async function personalPost(req: Request, user: User) {
  const b = z
    .object({
      kind: z.enum(["favorite", "alert"]),
      productId: id,
      target: z.number().positive().max(10000000).optional(),
      remove: z.boolean().optional(),
    })
    .parse(await readJson(req));
  const c = await publicCatalog();
  b.productId = canonicalProductId(c, b.productId);
  if (!b.remove && !c.products.some((p) => p.id === b.productId && p.active))
    return json({ error: "Məhsul tapılmadı." }, 404);
  const key = `${user.userId}:${b.kind}:${b.productId}`;
  if (b.remove) {
    const ids = [
      b.productId,
      ...Object.keys(c.productAliases || {}).filter(
        (alias) => c.productAliases![alias] === b.productId,
      ),
    ];
    await runBatched(
      ids.map((pid) =>
        db()
          .prepare("DELETE FROM personal WHERE id=? AND user_id=?")
          .bind(`${user.userId}:${b.kind}:${pid}`, user.userId),
      ),
    );
    return json({ ok: true });
  }
  if (b.kind === "alert" && !b.target) return json({ error: "Hədəf qiyməti daxil edin." }, 400);
  await db()
    .prepare(
      "INSERT INTO personal (id,user_id,kind,payload,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at",
    )
    .bind(
      key,
      user.userId,
      b.kind,
      JSON.stringify({ productId: b.productId, target: b.target, date: new Date().toISOString() }),
      Date.now(),
    )
    .run();
  return json({ ok: true });
}

async function reviewPost(req: Request, user: User) {
  const b = z
    .object({
      productId: id,
      rating: z.number().int().min(1).max(5),
      text: z.string().min(10).max(2000),
    })
    .parse(await readJson(req));
  const c = await catalog();
  if (!c.products.some((p) => p.id === b.productId))
    return json({ error: "Məhsul tapılmadı." }, 404);
  await statement("review", {
    ...b,
    id: crypto.randomUUID(),
    name: user.displayName,
    userId: user.userId,
    status: "pending",
    date: new Date().toISOString(),
  }).run();
  return json({ ok: true });
}

const AZ_CITIES = [
  "Bakı",
  "Sumqayıt",
  "Gəncə",
  "Mingəçevir",
  "Şəki",
  "Lənkəran",
  "Naxçıvan",
  "Şirvan",
  "Quba",
  "Xaçmaz",
] as const;
const phone = z
  .string()
  .max(30)
  .transform((v, ctx) => {
    const normalized = normalizePhone(v);
    if (!normalized) {
      ctx.addIssue({ code: "custom", message: "Nömrə +994 XX XXX XX XX formatında olmalıdır" });
      return z.NEVER;
    }
    return normalized;
  });

async function applicationPost(req: Request, user: User) {
  const b = z
    .object({
      company: z.string().trim().min(2).max(150),
      legalName: z.string().trim().min(2).max(200),
      legalForm: z.enum(["mmc", "fiziki", "asc", "diger"]),
      voen: z.string().regex(/^\d{10}$/, "VÖEN 10 rəqəm olmalıdır"),
      contact: z.string().trim().min(2).max(120),
      email: z.string().email().max(200),
      phone,
      website: z
        .string()
        .url()
        .max(300)
        .refine((v) => v.startsWith("https://"), "Sayt https:// ilə başlamalıdır"),
      categories: z.array(id).min(1).max(17),
      cities: z.array(z.enum(AZ_CITIES)).min(1).max(AZ_CITIES.length),
      delivery: z.array(z.enum(["kuryer", "poct", "magazadan", "pulsuz"])).max(4),
      payment: z
        .array(z.enum(["nagd", "kart", "taksit", "kredit", "kocurme"]))
        .min(1)
        .max(5),
      feedType: z.enum(["xml", "json", "csv", "sitemap", "yoxdur"]),
      feedUrl: z
        .string()
        .max(500)
        .refine((v) => !v || /^https:\/\/[^\s]+$/.test(v), "Feed linki https:// ilə başlamalıdır"),
      productCount: z.enum(["0-100", "100-1000", "1000-10000", "10000+"]),
      note: z.string().max(2000),
    })
    .parse(await readJson(req));
  if (b.feedType !== "yoxdur" && b.feedType !== "sitemap" && !b.feedUrl)
    throw new ApiError(400, "Seçdiyin feed növü üçün feed linkini yaz.");
  await statement("application", {
    ...b,
    id: crypto.randomUUID(),
    userId: user.userId,
    status: "pending",
    date: new Date().toISOString(),
  }).run();
  return json({ ok: true });
}

async function applicationsMine(user: User) {
  const rows = await db()
    .prepare(
      "SELECT payload FROM records WHERE kind='application' AND json_extract(payload,'$.userId')=? ORDER BY updated_at DESC LIMIT 20",
    )
    .bind(user.userId)
    .all<{ payload: string }>();
  return json({
    applications: rows.results.map((r) => {
      const a = JSON.parse(r.payload);
      return {
        id: a.id,
        company: a.company,
        website: a.website,
        status: a.status,
        date: a.date,
      };
    }),
  });
}

const secure = (req: Request) =>
  new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
const withSession = (req: Request, token: string | null, body: unknown) =>
  Response.json(body, {
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Set-Cookie": sessionCookie(token, secure(req)),
    },
  });
const password = z
  .string()
  .min(8, "Şifrə ən azı 8 simvol olmalıdır")
  .max(200)
  .refine((v) => /\p{L}/u.test(v) && /\d/.test(v), "Şifrədə hərf və rəqəm olmalıdır");

async function registerPost(req: Request) {
  const b = z
    .object({
      name: z.string().trim().min(2, "Adını yaz").max(80),
      email: z.string().email("E-poçt düzgün deyil").max(200),
      phone: phone.optional().or(z.literal("").transform(() => undefined)),
      city: z.enum(AZ_CITIES).optional(),
      password,
      terms: z.literal(true, { errorMap: () => ({ message: "Şərtləri qəbul et" }) }),
    })
    .parse(await readJson(req));
  const account = await createAccount(b);
  if (!account) throw new ApiError(409, "Bu e-poçtla hesab artıq var. Daxil ol.");
  return withSession(req, await startSession(account.id), { ok: true });
}

async function loginPost(req: Request) {
  const b = z
    .object({ email: z.string().email().max(200), password: z.string().min(1).max(200) })
    .parse(await readJson(req));
  const account = await checkCredentials(b.email, b.password);
  if (!account) throw new ApiError(401, "E-poçt və ya şifrə yanlışdır.");
  return withSession(req, await startSession(account.id), { ok: true });
}

async function logoutPost(req: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (token) await endSession(token);
  return withSession(req, null, { ok: true });
}

async function clickPost(req: Request) {
  const b = z.object({ offerId: id }).parse(await readJson(req));
  const c = await publicCatalog();
  const o = c.offers.find((o) => o.id === b.offerId);
  if (!o) return json({ error: "Təklif tapılmadı." }, 404);
  if (o.demo) return json({ error: "Nümunə təklifdən alış edilmir." }, 400);
  try {
    safeMerchantUrl(o.url);
  } catch {
    throw new ApiError(400, "Mağaza linki etibarlı deyil.");
  }
  await statement("click", {
    id: crypto.randomUUID(),
    offerId: o.id,
    storeId: o.storeId,
    date: new Date().toISOString(),
  }).run();
  return json({ url: o.url });
}

async function adminData() {
  const kinds = [
    "product",
    "store",
    "offer",
    "history",
    "review",
    "application",
    "audit",
    "click",
    "feed",
  ];
  const all = await Promise.all(kinds.map((k) => list(k)));
  const c = await catalog();
  return json({
    ...Object.fromEntries(kinds.map((k, i) => [k, all[i]])),
    product: c.products,
    offer: c.offers,
    store: c.stores,
    sourceCoverage: c.sourceCoverage,
    sitemapCoverage,
  });
}

async function feedSync(user: User) {
  const result = await syncTechnomaniaFeed();
  await audit(
    user.userId,
    `Technomania rəsmi feed yeniləndi: ${result.sourceCount} məhsul / ${result.variantCount} variant`,
  );
  return json({ ok: true, ...result });
}

async function checkOffer(v: z.infer<typeof offer>, messages: { missing: string; domain: string }) {
  const c = await catalog();
  const s = c.stores.find((s) => s.id === v.storeId);
  if (!s || !c.products.some((p) => p.id === v.productId))
    throw new ApiError(400, messages.missing);
  // Store domains may be saved with "www." (e.g. www.barkodelectronics.az).
  if (bareHost(safeMerchantUrl(v.url).hostname) !== bareHost(s.domain))
    throw new ApiError(400, messages.domain);
  if (v.months > 0 && v.installmentTotal < v.price)
    throw new ApiError(400, "Taksit yekunu nağd qiymətdən az ola bilməz.");
  v.checkedAt = new Date().toISOString();
}

async function adminSave(req: Request, user: User) {
  const b = saveRequest.parse(await readJson(req));
  if (b.kind === "offer")
    await checkOffer(b.value, {
      missing: "Məhsul və mağaza mövcud olmalıdır.",
      domain: "Təklifin linki seçilmiş mağazaya aid deyil.",
    });
  await statement(b.kind, b.value).run();
  if (b.kind === "offer" && !b.value.demo)
    await historyPoint(
      b.value.productId,
      b.value.price + b.value.shipping,
      b.value.checkedAt,
    ).run();
  await audit(user.userId, `${b.kind}: ${b.value.id} yadda saxlanıldı`);
  return json({ ok: true });
}

async function adminImport(req: Request, user: User) {
  const b = z.object({ offers: z.array(offer).min(1).max(100) }).parse(await readJson(req));
  for (const v of b.offers)
    await checkOffer(v, {
      missing: `Naməlum məhsul və ya mağaza: ${v.id}`,
      domain: `Mağaza domeni uyğun deyil: ${v.id}`,
    });
  await runBatched(
    b.offers.flatMap((v) => [
      statement("offer", v),
      ...(!v.demo ? [historyPoint(v.productId, v.price + v.shipping, v.checkedAt)] : []),
    ]),
  );
  await audit(user.userId, `${b.offers.length} təklif idxal edildi`);
  return json({ ok: true, count: b.offers.length });
}

async function adminModerate(req: Request, user: User) {
  const b = z
    .object({
      kind: z.enum(["review", "application"]),
      id: z.string().max(100),
      status: z.enum(["approved", "rejected"]),
    })
    .parse(await readJson(req));
  const r = await db()
    .prepare("SELECT payload FROM records WHERE id=? AND kind=?")
    .bind(`${b.kind}:${b.id}`, b.kind)
    .first<{ payload: string }>();
  if (!r) return json({ error: "Qeyd tapılmadı." }, 404);
  await statement(b.kind, { ...JSON.parse(r.payload), status: b.status }).run();
  await audit(user.userId, `${b.kind}: ${b.status}`);
  return json({ ok: true });
}

async function adminDelete(req: Request, user: User) {
  const b = z
    .object({ kind: z.enum(["product", "store", "offer"]), id })
    .parse(await readJson(req));
  if (/^(wc-|tap-|soliton-)/.test(b.id))
    throw new ApiError(
      409,
      "Bu qeyd mənbə kataloqundan gəlir. Məhsulu redaktə edərək deaktiv edin və ya mağazanı deaktiv edin.",
    );
  if (b.kind !== "offer") {
    const c = await catalog();
    if (c.offers.some((o) => (b.kind === "product" ? o.productId === b.id : o.storeId === b.id)))
      throw new ApiError(409, "Əvvəlcə bu qeydə bağlı təklifləri silin və ya qeydi deaktiv edin.");
  }
  await db()
    .prepare("DELETE FROM records WHERE id=? AND kind=?")
    .bind(`${b.kind}:${b.id}`, b.kind)
    .run();
  await audit(user.userId, `${b.kind}: ${b.id} silindi`);
  return json({ ok: true });
}

async function matchesGet(req: Request) {
  const query = new URL(req.url).searchParams;
  const c = await catalog(),
    matches = await list<ProductMatch>("productMatch");
  // Pairs the public catalog already folds automatically need no review.
  const folded = mergeDuplicateProducts(applyProductMatches(c, matches), matches);
  const candidates = productMatchCandidates(
    c,
    matches,
    (query.get("q") || "").slice(0, 100),
  ).filter(
    (pair) =>
      canonicalProductId(folded, pair.source.id) !== canonicalProductId(folded, pair.target.id),
  );
  const requested = Number(query.get("offset"));
  const offset = Math.min(
    Number.isFinite(requested) ? Math.max(0, Math.floor(requested / 24) * 24) : 0,
    Math.max(0, Math.ceil(candidates.length / 24) - 1) * 24,
  );
  const aliases = applyProductMatches(c, matches).productAliases || {};
  return json({
    candidates: candidates.slice(offset, offset + 24),
    total: candidates.length,
    offset,
    approved: matches
      .filter((m) => m.active)
      .map((m) => ({
        id: m.id,
        sourceId: m.sourceId,
        targetId: m.targetId,
        sourceName: c.products.find((p) => p.id === m.sourceId)?.name || m.sourceId,
        targetName: c.products.find((p) => p.id === m.targetId)?.name || m.targetId,
        approvedAt: m.approvedAt,
        valid: aliases[m.sourceId] === m.targetId,
      })),
    stores: c.stores.map((s) => ({ id: s.id, name: s.name })),
    offers: [
      ...new Map(
        candidates
          .slice(offset, offset + 24)
          .flatMap((pair) =>
            c.offers.filter(
              (o) => !o.demo && [pair.source.id, pair.target.id].includes(o.productId),
            ),
          )
          .map((o) => [o.id, o]),
      ).values(),
    ],
  });
}
async function matchesPost(req: Request, user: User) {
  const b = z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("approve"),
        sourceId: id,
        targetId: id,
        sourceSignature: z.string().max(20000),
        targetSignature: z.string().max(20000),
        confirmed: z.literal(true),
      }),
      z.object({ action: z.literal("revoke"), id }),
    ])
    .parse(await readJson(req));
  try {
    return await withProductMatchLock(db(), async (save) => {
      const matches = await list<ProductMatch>("productMatch");
      if (b.action === "revoke") {
        const existing = matches.find((m) => m.id === b.id);
        if (!existing) return json({ error: "Uyğunlaşdırma tapılmadı." }, 404);
        if (existing.active)
          await save([
            { kind: "productMatch", id: existing.id, value: { ...existing, active: false } },
            {
              kind: "audit",
              id: crypto.randomUUID(),
              value: {
                userId: user.userId,
                action: "Məhsul uyğunlaşdırması geri alındı: " + b.id,
                date: new Date().toISOString(),
              },
            },
          ]);
        return json({ ok: true });
      }
      const raw = await catalog();
      const match = prepareProductMatch(raw, b.sourceId, b.targetId, matches);
      if (
        match.sourceSignature !== b.sourceSignature ||
        match.targetSignature !== b.targetSignature
      )
        return json({ error: "Məhsul məlumatı dəyişib. Siyahını yeniləyib yenidən yoxla." }, 409);
      await save([
        { kind: "productMatch", id: match.id, value: match },
        {
          kind: "audit",
          id: crypto.randomUUID(),
          value: {
            userId: user.userId,
            action: `Məhsullar uyğunlaşdırıldı: ${b.sourceId} → ${b.targetId}`,
            date: match.approvedAt,
          },
        },
      ]);
      return json({ ok: true });
    });
  } catch (error) {
    if (error instanceof MatchConflictError) return json({ error: error.message }, 409);
    throw error;
  }
}

async function admin(req: Request, path: string, user: User) {
  const route = `${req.method} ${path}`;
  switch (route) {
    case "POST admin/catalog/materialize":
      return json(await materializeCatalog(db()));
    case "GET admin/matches":
      return matchesGet(req);
    case "POST admin/matches":
      return matchesPost(req, user);
    case "GET admin/jobs":
      return json(await listCrawlJobs(db()));
    case "POST admin/jobs/start": {
      const b = z.object({ sourceId: z.string().max(50) }).parse(await readJson(req));
      const job = await startCrawlJob(db(), b.sourceId);
      await audit(user.userId, "Mənbə idxalı hazırlandı: " + b.sourceId);
      return json(job);
    }
    case "POST admin/jobs/tick":
      return json(await tickCrawlJob(db(), z.object({ id }).parse(await readJson(req)).id));
    case "POST admin/jobs/control": {
      const b = z
        .object({ id, action: z.enum(["pause", "resume", "cancel"]) })
        .parse(await readJson(req));
      return json(await controlCrawlJob(db(), b.id, b.action));
    }
    case "GET admin/catalog":
      return json(await catalog());
    case "GET admin/data":
      return adminData();
    case "POST admin/feed-preview":
      return json(await fetchTechnomania());
    case "POST admin/feed-sync":
      return feedSync(user);
    case "POST admin/scan":
      return json(
        await scanProduct(z.object({ url: z.string().url() }).parse(await readJson(req)).url),
      );
    case "POST admin/save":
      return adminSave(req, user);
    case "POST admin/import":
      return adminImport(req, user);
    case "POST admin/moderate":
      return adminModerate(req, user);
    case "POST admin/delete":
      return adminDelete(req, user);
  }
  return json({ error: "Əməliyyat tapılmadı." }, 404);
}

async function route(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname.replace("/api/v1/", "");
  const method = req.method;
  const user = await getUser();
  if (method !== "GET") {
    if (crossSite(req, url)) return json({ error: "Sorğunun mənbəyi uyğun deyil." }, 403);
    if (Number(req.headers.get("content-length") || 0) > MAX_BODY)
      return json({ error: "Məlumat 500 KB limitini keçir." }, 413);
    if (path === "click" && method === "POST") {
      if (rateLimited("click:" + clientKey(req, user), 60)) return tooMany();
      return clickPost(req);
    }
    if (path.startsWith("auth/") && method === "POST") {
      const key = path + ":" + clientKey(req, null);
      if (path === "auth/logout") return logoutPost(req);
      if (rateLimited(key, 10, 600000)) return tooMany();
      if (path === "auth/register") return registerPost(req);
      if (path === "auth/login") return loginPost(req);
    }
    if (!user) return json({ error: "Bu əməliyyat üçün hesabınıza daxil olun." }, 401);
    // Public writes (favourites, reviews, applications); admin work is owner-only and unlimited.
    if (!path.startsWith("admin/")) {
      const strict = path === "reviews" || path === "applications";
      if (rateLimited(path + ":" + user.userId, strict ? 5 : 60, strict ? 600000 : 60000))
        return tooMany();
    }
  }
  if (path === "catalog" && method === "GET")
    return json(catalogSlice(await publicCatalog(), parseCatalogQuery(url.searchParams)));
  if (path === "suggest" && method === "GET")
    return json({
      items: suggest(
        await publicCatalog(),
        url.searchParams.get("q") || "",
        url.searchParams.get("city") || undefined,
      ),
    });
  if (path === "session" && method === "GET") {
    const owner = await ownerId();
    return json({
      user: user
        ? { id: user.userId, name: user.displayName, email: user.email, phone: user.phone || "" }
        : null,
      admin: !!user && owner === user.userId,
      needsSetup: !owner && !!user && mayClaimOwner(user),
    });
  }
  if (path === "personal" && method === "GET") return personalGet(user);
  if (path === "health" && method === "GET") return json({ ok: true });
  if (path === "applications/mine" && method === "GET")
    return user ? applicationsMine(user) : json({ applications: [] });
  if (method === "POST" && user) {
    if (path === "bootstrap") return bootstrap(user);
    if (path === "personal") return personalPost(req, user);
    if (path === "reviews") return reviewPost(req, user);
    if (path === "applications") return applicationPost(req, user);
  }
  if (!path.startsWith("admin/")) return json({ error: "Ünvan tapılmadı." }, 404);
  if (!user) return json({ error: "Bu əməliyyat üçün hesabınıza daxil olun." }, 401);
  if ((await ownerId()) !== user.userId) return json({ error: "Admin icazəsi tələb olunur." }, 403);
  return admin(req, path, user);
}

async function handle(req: Request) {
  const admin = new URL(req.url).pathname.startsWith("/api/v1/admin/");
  try {
    // Awaited here so rejections from every delegated handler reach the catch below.
    ensureScheduler();
    const res = await route(req);
    // Only catalog writes change what shoppers see; favourites, clicks and sign-ins do not.
    if (req.method !== "GET" && res.ok && (admin || req.url.endsWith("/bootstrap")))
      invalidatePublicCatalog();
    return res;
  } catch (e) {
    console.error("API:", e instanceof Error ? e.name + ": " + e.message : String(e));
    const { status, error } = errorResponse(e, admin);
    return json({ error }, status);
  }
}
export const GET = handle;
export const POST = handle;
