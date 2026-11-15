"use client";
import { useEffect, useState } from "react";
import { ArrowRight, ArrowUpRight, ChevronRight, Search, TrendingDown } from "lucide-react";
import {
  bestRecordedOffersFor,
  categories,
  money,
  validOffers,
  type Product,
  shownVariant,
} from "../../lib/catalog";
import { rankProductsByStoreCount } from "../../lib/catalog-query";
import { CategoryIcon, StoreLogo } from "../ui";
import { azNumber } from "../../components/format";
import { ProductImage } from "../../components/product-image";
import { ProductCard, Rail } from "./card";
import { useShop } from "./context";

const popular = [
  "iPhone 17",
  "Samsung Galaxy",
  "AirPods",
  "PlayStation 5",
  "Robot tozsoran",
  "Smart TV",
];
const faq = [
  [
    "Qəpik məhsul satır?",
    "Xeyr. Qəpik mağazaların qiymətlərini bir yerdə göstərir. Alış seçdiyin mağazanın öz saytında tamamlanır.",
  ],
  [
    "Qiymətlər nə vaxt yenilənir?",
    "Mənbələr mütəmadi yoxlanır və hər təklifdə son yoxlanma vaxtı göstərilir. Qiyməti və stoku alışdan əvvəl mağazada təsdiqlə.",
  ],
  [
    "Ən ucuz qiymət həmişə ən sərfəlidir?",
    "Çatdırılma, taksit yekunu, zəmanət və variantı da yoxla. Məhsul səhifəsində bunlar hər mağaza üçün yanaşı göstərilir.",
  ],
  [
    "Mağazamı necə əlavə edim?",
    "“Mağazanı əlavə et” səhifəsindən müraciət göndər. Rəsmi məhsul feed-i olan mağazalar daha tez qoşulur.",
  ],
];
const STAGE_INTERVAL = 5500;
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Hero: one real product at a time with its store prices as bars, the cheapest one marked.
function PriceStage({ items }: { items: Product[] }) {
  const { c, city } = useShop();
  const [front, setFront] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (items.length < 2 || paused || reducedMotion()) return;
    const t = window.setInterval(() => {
      if (!document.hidden) setFront((i) => (i + 1) % items.length);
    }, STAGE_INTERVAL);
    return () => window.clearInterval(t);
  }, [items.length, paused]);
  // The list can shrink when the catalog refreshes; never point past its end.
  const p = items[front % items.length];
  const offers = validOffers(c, p.id, city);
  const shown = offers.slice(0, 4);
  const high = Math.max(...offers.map((o) => o.price));
  const low = offers[0]?.price ?? 0;
  return (
    <div
      className="stage"
      // Only a mouse resting on the card holds it; a tap on a phone must not stop the rotation.
      onPointerEnter={(e) => e.pointerType === "mouse" && setPaused(true)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="stage-card" key={p.id}>
        <a className="stage-product" href={"/mehsul/" + p.id}>
          <span className="stage-photo">
            <ProductImage src={p.image} alt="" width={150} height={150} decoding="async" />
          </span>
          <span className="stage-name">
            <small>Canlı müqayisə</small>
            <b>{p.name}</b>
            {shownVariant(p) && <span>{shownVariant(p)}</span>}
          </span>
        </a>
        <ol className="stage-rows" aria-label={p.name + " — mağaza qiymətləri"}>
          {shown.map((o, r) => {
            const store = c.stores.find((s) => s.id === o.storeId);
            return (
              <li key={o.id} className={r === 0 ? "is-low" : ""} style={{ "--r": r } as never}>
                <span className="stage-store">
                  {store ? store.name : o.storeId}
                  {r === 0 && <em>Ən ucuz</em>}
                </span>
                <span className="stage-bar" aria-hidden="true">
                  <i style={{ width: (high ? (o.price / high) * 100 : 100) + "%" }} />
                </span>
                <span className="stage-price">{money(o.price)}</span>
              </li>
            );
          })}
        </ol>
        <div className="stage-foot">
          <span>
            <b>{money(Math.round(high - low))}</b> fərq · {offers.length} mağaza
          </span>
          <a className="btn btn-sun" href={"/mehsul/" + p.id}>
            Qiymətlərə bax <ArrowRight size={16} aria-hidden="true" />
          </a>
        </div>
      </div>
      {items.length > 1 && (
        <div className="stage-dots">
          {items.map((item, i) => (
            <button
              key={item.id}
              aria-label={item.name + " qiymətlərini göstər"}
              aria-pressed={i === front}
              onClick={() => setFront(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Home() {
  const { c, city } = useShop();
  const availableCategories = categories.filter((cat) => (c.categoryStats[cat.id]?.count || 0) > 0);
  const inStock = c.products.filter((p) => p.active && validOffers(c, p.id, city).length > 0);
  const stocked = rankProductsByStoreCount(c, inStock, city);
  // While stock is still being confirmed, show products that have a recorded price.
  const ranked =
    stocked.length >= 12
      ? stocked
      : [
          ...stocked,
          ...c.products.filter(
            (p) => p.active && !inStock.includes(p) && bestRecordedOffersFor(c, p.id, city).length,
          ),
        ];
  // Same item, different shops: the widest relative price gap first.
  const gapOf = new Map<string, number>();
  for (const p of ranked) {
    const prices = validOffers(c, p.id, city).map((o) => o.price);
    const high = Math.max(...prices),
      low = Math.min(...prices);
    gapOf.set(p.id, prices.length > 1 && high > 0 ? (high - low) / high : 0);
  }
  const top = ranked.slice(0, 12);
  const topIds = new Set(top.map((p) => p.id));
  const gaps = ranked
    .filter((p) => (gapOf.get(p.id) || 0) >= 0.03 && !topIds.has(p.id))
    .sort((a, b) => gapOf.get(b.id)! - gapOf.get(a.id)!)
    .slice(0, 6);
  const stageItems = ranked
    .filter((p) => validOffers(c, p.id, city).length >= 2 && (gapOf.get(p.id) || 0) >= 0.03)
    .slice(0, 4);
  const byId = new Map(c.products.map((p) => [p.id, p]));
  const drops = (c.drops || []).flatMap((id) => byId.get(id) || []);
  const shelves = availableCategories
    .map((cat) => ({ cat, items: ranked.filter((p) => p.category === cat.id).slice(0, 6) }))
    .filter((s) => s.items.length >= 4);
  const [shelf, setShelf] = useState(shelves[0]?.cat.id || "");
  const openShelf = shelves.find((s) => s.cat.id === shelf) || shelves[0];
  const stores = c.stores
    .filter(
      (s) =>
        s.active &&
        c.storeStats[s.id]?.real &&
        (c.storeStats[s.id]?.count || 0) > 0 &&
        !s.id.startsWith("tap-"),
    )
    .sort((a, b) => (c.storeStats[b.id]?.count || 0) - (c.storeStats[a.id]?.count || 0));
  return (
    <div className="home">
      <section
        className={"hero" + (stageItems.length || ranked.length >= 4 ? "" : " hero-solo")}
        aria-labelledby="home-title"
      >
        <div className="hero-copy">
          <span className="hero-pill">
            <i aria-hidden="true" />
            {azNumber(stores.length)} mağaza · {azNumber(c.totals?.products || 0)} məhsul
          </span>
          <h1 id="home-title">
            Eyni məhsul, <span>ən ucuz qiymət.</span>
          </h1>
          <p>
            Mağazaların qiymətini, çatdırılmasını və taksitini yan-yana gör, ən sərfəlisinə bir
            kliklə keç.
          </p>
          <form
            action="/axtaris"
            method="get"
            className="hero-search"
            role="search"
            aria-label="Ana səhifə axtarışı"
          >
            <Search size={20} aria-hidden="true" />
            <input
              name="q"
              required
              placeholder="Nə axtarırsan? Məsələn, iPhone 17"
              aria-label="Məhsul, model və ya brend axtar"
            />
            <button type="submit">Axtar</button>
          </form>
          <div className="hero-popular">
            <span>Çox axtarılır:</span>
            {popular.map((q) => (
              <a href={"/axtaris?q=" + encodeURIComponent(q)} key={q}>
                {q}
              </a>
            ))}
          </div>
        </div>
        {stageItems.length > 0 ? (
          <PriceStage items={stageItems} />
        ) : (
          ranked.length >= 4 && (
            <div className="hero-tiles">
              {ranked.slice(0, 4).map((p) => {
                const offer = bestRecordedOffersFor(c, p.id, city)[0];
                return (
                  <a key={p.id} href={"/mehsul/" + p.id}>
                    <span>
                      <ProductImage
                        src={p.image}
                        alt=""
                        width={120}
                        height={120}
                        decoding="async"
                      />
                    </span>
                    <b>{p.name}</b>
                    {offer && <strong>{money(offer.price)}</strong>}
                  </a>
                );
              })}
            </div>
          )
        )}
      </section>

      {availableCategories.length > 0 && (
        <section className="section" aria-labelledby="home-categories">
          <div className="section-head">
            <h2 id="home-categories">Kateqoriyalar</h2>
            <a href="/kataloq">
              Bütün məhsullar <ArrowRight size={15} />
            </a>
          </div>
          <div className="cats">
            {availableCategories.map((cat) => (
              <a key={cat.id} href={"/kateqoriya/" + cat.id}>
                <span className="cats-icon">
                  <CategoryIcon name={cat.icon} size={24} strokeWidth={1.75} />
                </span>
                <b>{cat.name}</b>
                <small>{azNumber(c.categoryStats[cat.id].count)} məhsul</small>
              </a>
            ))}
          </div>
        </section>
      )}

      {top.length > 0 && (
        <section className="section" aria-labelledby="home-popular">
          <div className="section-head">
            <h2 id="home-popular">Ən çox müqayisə edilənlər</h2>
            <a href="/kataloq">
              Hamısı <ArrowRight size={15} />
            </a>
          </div>
          <Rail label="Ən çox müqayisə edilənlər">
            {top.map((p, i) => (
              <ProductCard key={p.id} p={p} rank={i + 1} />
            ))}
          </Rail>
        </section>
      )}

      {drops.length > 0 && (
        <section className="section section-drops" aria-labelledby="home-drops">
          <div className="section-head">
            <h2 id="home-drops">
              <TrendingDown size={24} aria-hidden="true" /> Qiyməti düşənlər
            </h2>
            <a href="/endirimler">
              Hamısı <ArrowRight size={15} />
            </a>
          </div>
          <Rail label="Qiyməti düşənlər">
            {drops.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </Rail>
        </section>
      )}

      {gaps.length > 0 && (
        <section className="section" aria-labelledby="home-gaps">
          <div className="section-head">
            <h2 id="home-gaps">Mağazalar arasında ən böyük fərq</h2>
            <a href="/kataloq?sort=saving">
              Hamısı <ArrowRight size={15} />
            </a>
          </div>
          <div className="gaps">
            {gaps.map((p) => {
              const offers = validOffers(c, p.id, city);
              const low = offers[0],
                high = Math.max(...offers.map((o) => o.price));
              const store = c.stores.find((s) => s.id === low.storeId);
              return (
                <a className="gap" key={p.id} href={"/mehsul/" + p.id}>
                  <span className="gap-photo">
                    <ProductImage src={p.image} alt="" width={96} height={96} loading="lazy" />
                  </span>
                  <span className="gap-body">
                    <b>{p.name}</b>
                    <span className="gap-prices">
                      <strong>{money(low.price)}</strong>
                      <s>{money(high)}</s>
                    </span>
                    <small>
                      {store?.name} · {offers.length} mağaza
                    </small>
                  </span>
                  <span className="gap-save">
                    <small>qənaət</small>
                    {money(Math.round(high - low.price))}
                  </span>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {openShelf && (
        <section className="section" aria-labelledby="home-shelves">
          <div className="section-head">
            <h2 id="home-shelves">Kateqoriya üzrə seçilənlər</h2>
            <a href={"/kateqoriya/" + openShelf.cat.id}>
              {openShelf.cat.name} <ArrowRight size={15} />
            </a>
          </div>
          <div className="chips" role="tablist" aria-label="Kateqoriya seç">
            {shelves.map((s) => (
              <button
                key={s.cat.id}
                role="tab"
                aria-selected={s.cat.id === openShelf.cat.id}
                className={s.cat.id === openShelf.cat.id ? "on" : ""}
                onClick={() => setShelf(s.cat.id)}
              >
                <CategoryIcon name={s.cat.icon} size={16} />
                {s.cat.name}
              </button>
            ))}
          </div>
          <div className="grid grid-6" key={openShelf.cat.id}>
            {openShelf.items.map((p) => (
              <ProductCard key={p.id} p={p} />
            ))}
          </div>
        </section>
      )}

      {stores.length > 0 && (
        <section className="section" aria-labelledby="home-stores">
          <div className="section-head">
            <h2 id="home-stores">Qiymətlər bu mağazalardan gəlir</h2>
            <a href="/magazalar">
              Bütün mağazalar <ArrowRight size={15} />
            </a>
          </div>
          <div className="marquee">
            <div className="marquee-track">
              {[0, 1].map((copy) =>
                stores.slice(0, 16).map((s) => (
                  <a
                    href={"/magazalar/" + s.id}
                    key={copy + s.id}
                    aria-hidden={copy === 1}
                    tabIndex={copy === 1 ? -1 : undefined}
                  >
                    <StoreLogo store={s} />
                    <small>{azNumber(c.storeStats[s.id]?.count || 0)} məhsul</small>
                  </a>
                )),
              )}
            </div>
          </div>
        </section>
      )}

      <section className="section merchant-band">
        <div>
          <h2>Mağazan var? Qiymətlərini burada göstər.</h2>
          <p>
            Məhsul feed-ini və ya sayt xəritəni ver, məhsulların alıcının axtardığı anda qarşısına
            çıxsın. Qoşulma pulsuzdur.
          </p>
        </div>
        <a className="btn btn-light" href="/magaza-qeydiyyat">
          Mağazanı əlavə et <ArrowUpRight size={17} aria-hidden="true" />
        </a>
      </section>

      <section className="section faq" aria-labelledby="home-faq">
        <div className="faq-intro">
          <h2 id="home-faq">Tez-tez verilən suallar</h2>
          <p>Qəpik necə işləyir, qiymətlər haradan gəlir və mağazanı necə əlavə edə bilərsən.</p>
          <a href="/rehber">
            Alış-veriş bələdçisi <ChevronRight size={15} />
          </a>
        </div>
        <div className="faq-items">
          {faq.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
