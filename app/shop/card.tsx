"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, CreditCard, Heart, Scale, Truck, Zap } from "lucide-react";
import { bestRecordedOffersFor, money, validOffers, type Product } from "../../lib/catalog";
import { ProductImage } from "../../components/product-image";
import { cheapestCredit, useShop } from "./context";

export function ProductCard({ p, rank }: { p: Product; rank?: number }) {
  const { c, city, comp, favorite, compare, isFavorite } = useShop();
  const available = validOffers(c, p.id, city),
    recorded = bestRecordedOffersFor(c, p.id, city),
    offers = available.length ? available : recorded,
    low = offers[0],
    high = available.length ? Math.max(...available.map((o) => o.price)) : 0,
    save = low && available.length > 1 ? high - low.price : 0,
    // A saving only earns a badge when it is worth acting on.
    worthSaving = save >= 5 && save >= high * 0.02,
    credit = cheapestCredit(available),
    freeDelivery = available.some((o) => o.shippingKnown === true && o.shipping === 0),
    store = low && c.stores.find((s) => s.id === low.storeId),
    fav = isFavorite(p.id),
    href = "/mehsul/" + p.id;
  const state = p.marketplace
    ? "Tap.az elanı"
    : !available.length && offers.length
      ? low?.stockKnown === false
        ? "Stok məlumatı yoxdur"
        : "Stokda yoxdur"
      : "";
  return (
    <article
      className={"card" + (available.length || low?.stockKnown === false ? "" : " card-off")}
    >
      <a className="card-media" href={href} tabIndex={-1} aria-hidden="true">
        <ProductImage src={p.image} alt="" width={220} height={220} loading="lazy" decoding="async" />
      </a>
      <div className="card-flags">
        {rank !== undefined && <span className="flag flag-rank">{rank}</span>}
        {worthSaving && (
          <span className="flag flag-save">
            <Zap size={12} aria-hidden="true" />
            {money(Math.round(save))} fərq
          </span>
        )}
        {state && <span className="flag flag-muted">{state}</span>}
      </div>
      <div className="card-tools">
        <button
          className={fav ? "on" : ""}
          aria-label={p.name + (fav ? " seçilmişlərdən çıxar" : " seçilmişlərə əlavə et")}
          aria-pressed={fav}
          onClick={() => favorite(p)}
        >
          <Heart size={17} />
        </button>
        <button
          className={comp.includes(p.id) ? "on" : ""}
          aria-label={p.name + " müqayisəyə əlavə et"}
          aria-pressed={comp.includes(p.id)}
          onClick={() => compare(p)}
        >
          <Scale size={17} />
        </button>
      </div>
      <div className="card-body">
        <span className="card-brand" lang="en">
          {p.brand}
        </span>
        <a className="card-title" href={href}>
          {p.name}
        </a>
        {(p.variant || p.distinction) && (
          <p className="card-variant">
            {[p.variant, p.distinction].filter(Boolean).join(" · ")}
          </p>
        )}
        <div className="card-price">
          <strong>{low ? money(low.price) : "Qiymət yoxdur"}</strong>
          {low && available.length > 1 && high > low.price && <s>{money(high)}</s>}
          {low && !available.length && <small>son qiymət</small>}
        </div>
        <ul className="card-facts">
          {credit && (
            <li className="fact-credit">
              <CreditCard size={13} aria-hidden="true" />
              {money(credit.monthly)} × {credit.months} ay
            </li>
          )}
          {freeDelivery && (
            <li>
              <Truck size={13} aria-hidden="true" />
              Pulsuz çatdırılma
            </li>
          )}
        </ul>
        <a className="card-cta" href={href} aria-label={p.name + " — mağaza qiymətlərinə bax"}>
          <span>
            {available.length > 1
              ? available.length + " mağazada müqayisə et"
              : available.length === 1
                ? (store?.name || "Mağaza") + " qiymətinə bax"
                : offers.length
                  ? "Son qiymətə bax"
                  : "Məhsula bax"}
          </span>
          <ChevronRight size={15} aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

export function Grid({ products }: { products: Product[] }) {
  return (
    <div className="grid">
      {products.map((p) => (
        <ProductCard key={p.id} p={p} />
      ))}
    </div>
  );
}

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A horizontal shelf with arrow buttons on wide screens and native swiping on touch.
export function Rail({ label, children }: { label: string; children: ReactNode }) {
  const track = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const update = () =>
      setEdge({
        start: el.scrollLeft < 8,
        end: el.scrollLeft + el.clientWidth > el.scrollWidth - 8,
      });
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  const go = (dir: number) =>
    track.current?.scrollBy({
      left: dir * track.current.clientWidth * 0.85,
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  return (
    <div className="rail">
      <div className="rail-track" ref={track}>
        {children}
      </div>
      <button
        className="rail-arrow prev"
        onClick={() => go(-1)}
        disabled={edge.start}
        aria-label={label + " — əvvəlkilər"}
      >
        <ChevronLeft size={20} />
      </button>
      <button
        className="rail-arrow next"
        onClick={() => go(1)}
        disabled={edge.end}
        aria-label={label + " — növbətilər"}
      >
        <ChevronRight size={20} />
      </button>
    </div>
  );
}
