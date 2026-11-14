"use client";
import { useEffect, useState, type RefObject } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  SlidersHorizontal,
  Store as StoreIcon,
  X,
} from "lucide-react";
import { categories, type Product } from "../../lib/catalog";
import { PAGE_SIZE } from "../../lib/catalog-query";
import { CategoryIcon, Empty, StoreLogo } from "../ui";
import { azNumber } from "../../components/format";
import { Grid } from "./card";
import { emptyFilters, useShop, type Filters } from "./context";

const sorts = [
  ["popular", "Populyar"],
  ["low", "Ən ucuz"],
  ["high", "Ən baha"],
  ["saving", "Ən böyük fərq"],
  ["name", "A–Z"],
] as const;

export default function Listing({
  page,
  title,
  products,
  filter,
  setFilter,
  loading,
  goToPage,
  pageHref,
  top,
  storeId,
  searchTerm,
  category,
}: {
  page: string;
  title: string;
  products: Product[];
  filter: Filters;
  setFilter: (next: Filters) => void;
  loading: boolean;
  goToPage: (offset: number) => void;
  pageHref: (n: number) => string;
  top: RefObject<HTMLDivElement | null>;
  storeId: string;
  searchTerm: string;
  category: string;
}) {
  const { c, city } = useShop();
  const [sheet, setSheet] = useState(false);
  const [brandQuery, setBrandQuery] = useState("");
  useEffect(() => {
    if (!sheet) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = old;
    };
  }, [sheet]);
  const store = storeId ? c.stores.find((s) => s.id === storeId) : undefined;
  const activeCount =
    Number(!!filter.brand) +
    Number(!!filter.store) +
    Number(!!(filter.min || filter.max)) +
    Number(filter.real) +
    Number(filter.stock);
  const nothingToFilter = !loading && !activeCount && c.matchedTotal === 0;
  const totalPages = Math.max(1, Math.ceil(c.matchedTotal / PAGE_SIZE));
  const currentPage = Math.floor(c.pageOffset / PAGE_SIZE) + 1;
  const reset = () => setFilter({ ...emptyFilters, sort: filter.sort });
  const brands = c.brands.filter((b) =>
    b.toLocaleLowerCase("az").includes(brandQuery.toLocaleLowerCase("az")),
  );
  const storeName = (id: string) => c.stores.find((s) => s.id === id)?.name || id;
  const pageLink = (n: number, label: string, text: React.ReactNode, cls = "") =>
    n < 1 || n > totalPages || n === currentPage || loading ? (
      <span
        key={label}
        className={"page " + cls + (n === currentPage ? " on" : " off")}
        aria-label={label}
      >
        {text}
      </span>
    ) : (
      <a
        key={label}
        className={"page " + cls}
        href={pageHref(n)}
        aria-label={label}
        rel={n === currentPage - 1 ? "prev" : n === currentPage + 1 ? "next" : undefined}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          goToPage((n - 1) * PAGE_SIZE);
        }}
      >
        {text}
      </a>
    );
  // 1 … 4 5 [6] 7 8 … 40
  const pages = [
    ...new Set([
      1,
      currentPage - 2,
      currentPage - 1,
      currentPage,
      currentPage + 1,
      currentPage + 2,
      totalPages,
    ]),
  ]
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);
  const filters = (
    <>
      {page !== "kateqoriya" && page !== "magazalar" && (
        <div className="filter-group">
          <h3>Kateqoriya</h3>
          <div className="filter-links">
            {categories
              .filter((cat) => c.categoryStats[cat.id]?.count)
              .slice(0, 10)
              .map((cat) => (
                <a key={cat.id} href={"/kateqoriya/" + cat.id}>
                  <CategoryIcon name={cat.icon} size={16} />
                  {cat.name}
                  <small>{azNumber(c.categoryStats[cat.id].count)}</small>
                </a>
              ))}
          </div>
        </div>
      )}
      <div className="filter-group">
        <h3>Qiymət, ₼</h3>
        <div className="filter-price">
          <input
            type="number"
            min="0"
            inputMode="numeric"
            aria-label="Minimum qiymət"
            placeholder="Min"
            value={filter.min}
            onChange={(e) => setFilter({ ...filter, min: e.target.value })}
          />
          <span>—</span>
          <input
            type="number"
            min="0"
            inputMode="numeric"
            aria-label="Maksimum qiymət"
            placeholder="Maks"
            value={filter.max}
            onChange={(e) => setFilter({ ...filter, max: e.target.value })}
          />
        </div>
        <div className="filter-quick">
          {(
            [
              ["", "200", "200 ₼-dək"],
              ["200", "500", "200–500"],
              ["500", "1000", "500–1 000"],
              ["1000", "2500", "1 000–2 500"],
              ["2500", "", "2 500+"],
            ] as const
          ).map(([min, max, label]) => (
            <button
              key={label}
              className={filter.min === min && filter.max === max ? "on" : ""}
              onClick={() =>
                setFilter(
                  filter.min === min && filter.max === max
                    ? { ...filter, min: "", max: "" }
                    : { ...filter, min, max },
                )
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="filter-group">
        <label className="toggle">
          <input
            type="checkbox"
            checked={filter.stock}
            onChange={(e) => setFilter({ ...filter, stock: e.target.checked })}
          />
          Yalnız stokda olanlar
        </label>
      </div>
      {c.brands.length > 0 && (
        <div className="filter-group">
          <h3>Brend</h3>
          {c.brands.length > 8 && (
            <input
              className="filter-search"
              placeholder="Brend axtar"
              aria-label="Brend axtar"
              value={brandQuery}
              onChange={(e) => setBrandQuery(e.target.value)}
            />
          )}
          <div className="filter-options">
            {brands.slice(0, 60).map((b) => (
              <label key={b} className="toggle">
                <input
                  type="radio"
                  name="brand"
                  checked={filter.brand === b}
                  onClick={() => filter.brand === b && setFilter({ ...filter, brand: "" })}
                  onChange={() => setFilter({ ...filter, brand: b })}
                />
                <span lang="en">{b}</span>
              </label>
            ))}
          </div>
        </div>
      )}
      {!storeId && (
        <div className="filter-group">
          <h3>Mağaza</h3>
          <div className="filter-options">
            {c.stores
              .filter((s) => s.active && c.storeStats[s.id]?.count)
              .sort((a, b) => c.storeStats[b.id].count - c.storeStats[a.id].count)
              .slice(0, 40)
              .map((s) => (
                <label key={s.id} className="toggle">
                  <input
                    type="radio"
                    name="store"
                    checked={filter.store === s.id}
                    onClick={() => filter.store === s.id && setFilter({ ...filter, store: "" })}
                    onChange={() => setFilter({ ...filter, store: s.id })}
                  />
                  {s.name}
                </label>
              ))}
          </div>
        </div>
      )}
    </>
  );
  return (
    <div className="listing">
      <nav className="crumbs" aria-label="Səhifə yolu">
        <a href="/">Ana səhifə</a>
        <ChevronRight size={13} aria-hidden="true" />
        {storeId && (
          <>
            <a href="/magazalar">Mağazalar</a>
            <ChevronRight size={13} aria-hidden="true" />
          </>
        )}
        <span aria-current="page">{title}</span>
      </nav>
      <header className="listing-head" ref={top}>
        {store && (
          <span className="listing-logo">
            <StoreLogo store={store} />
          </span>
        )}
        <div>
          <h1>{title}</h1>
          <p>
            {azNumber(c.matchedTotal)} məhsul · {city}
            {store?.domain && (
              <>
                {" · "}
                <a
                  className="link"
                  href={"https://" + store.domain}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {store.domain} <ArrowUpRight size={13} aria-hidden="true" />
                </a>
              </>
            )}
          </p>
        </div>
      </header>
      {category && (
        <div className="chips chips-scroll">
          {categories
            .filter((cat) => c.categoryStats[cat.id]?.count)
            .map((cat) => (
              <a
                key={cat.id}
                href={"/kateqoriya/" + cat.id}
                className={cat.id === category ? "on" : ""}
              >
                <CategoryIcon name={cat.icon} size={16} />
                {cat.name}
              </a>
            ))}
        </div>
      )}
      <div className={"listing-layout" + (nothingToFilter ? " listing-solo" : "")}>
        {!nothingToFilter && (
          <aside className={"filters" + (sheet ? " filters-open" : "")} aria-label="Filtrlər">
            <div className="filters-head">
              <h2>Filtrlər</h2>
              {activeCount > 0 && (
                <button className="link" onClick={reset}>
                  Sıfırla
                </button>
              )}
              <button
                className="filters-close"
                aria-label="Filtrləri bağla"
                onClick={() => setSheet(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="filters-body">{filters}</div>
            <div className="filters-foot">
              <button className="btn btn-primary" onClick={() => setSheet(false)}>
                {azNumber(c.matchedTotal)} məhsulu göstər
              </button>
            </div>
          </aside>
        )}
        {sheet && <div className="scrim" onClick={() => setSheet(false)} />}
        <div className="results" aria-busy={loading}>
          {!nothingToFilter && (
            <div className="toolbar">
              <button className="btn btn-outline toolbar-filter" onClick={() => setSheet(true)}>
                <SlidersHorizontal size={17} aria-hidden="true" />
                Filtrlər
                {activeCount > 0 && <b>{activeCount}</b>}
              </button>
              {page !== "endirimler" && (
                <>
                  <div className="sort-tabs" role="group" aria-label="Sıralama">
                    {sorts.map(([value, label]) => (
                      <button
                        key={value}
                        className={filter.sort === value ? "on" : ""}
                        aria-pressed={filter.sort === value}
                        onClick={() => setFilter({ ...filter, sort: value })}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <select
                    className="sort-select"
                    aria-label="Sıralama"
                    value={filter.sort}
                    onChange={(e) => setFilter({ ...filter, sort: e.target.value })}
                  >
                    {sorts.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </>
              )}
              <span className="toolbar-count" role="status" aria-live="polite">
                {loading
                  ? "Yüklənir…"
                  : products.length
                    ? `${azNumber(c.pageOffset + 1)}–${azNumber(c.pageOffset + products.length)} / ${azNumber(c.matchedTotal)}`
                    : ""}
              </span>
            </div>
          )}
          {activeCount > 0 && (
            <div className="applied">
              {filter.brand && (
                <button onClick={() => setFilter({ ...filter, brand: "" })}>
                  {filter.brand} <X size={13} />
                </button>
              )}
              {filter.store && (
                <button onClick={() => setFilter({ ...filter, store: "" })}>
                  {storeName(filter.store)} <X size={13} />
                </button>
              )}
              {(filter.min || filter.max) && (
                <button onClick={() => setFilter({ ...filter, min: "", max: "" })}>
                  {filter.min || "0"}–{filter.max || "∞"} ₼ <X size={13} />
                </button>
              )}
              {filter.stock && (
                <button onClick={() => setFilter({ ...filter, stock: false })}>
                  Stokda <X size={13} />
                </button>
              )}
              <button className="applied-reset" onClick={reset}>
                Hamısını sil
              </button>
            </div>
          )}
          {products.length ? (
            <>
              <div className={loading ? "is-loading" : ""}>
                <Grid products={products} />
              </div>
              {totalPages > 1 && (
                <nav className="pagination" aria-label="Məhsul səhifələri">
                  {pageLink(
                    currentPage - 1,
                    "Əvvəlki səhifə",
                    <ChevronLeft size={18} />,
                    "page-step",
                  )}
                  {pages.flatMap((n, i) => [
                    i > 0 && n - pages[i - 1] > 1 ? (
                      <span key={"gap" + n} className="page off" aria-hidden="true">
                        …
                      </span>
                    ) : null,
                    pageLink(n, n + ". səhifə", n),
                  ])}
                  {pageLink(
                    currentPage + 1,
                    "Növbəti səhifə",
                    <>
                      Növbəti <ArrowRight size={16} />
                    </>,
                    "page-step page-next",
                  )}
                </nav>
              )}
            </>
          ) : storeId && !c.storeStats[storeId]?.count ? (
            <Empty
              icon={StoreIcon}
              title="Bu mağazanın qiymətləri hələ qoşulmayıb"
              text="Mağaza açıq kataloq və ya məhsul feed-i təqdim etdikdə məhsullar burada görünəcək."
              action={
                <a className="btn btn-primary" href="/magazalar">
                  Qoşulmuş mağazalara bax
                </a>
              }
            />
          ) : loading ? (
            <div className="grid" aria-hidden="true">
              {Array.from({ length: 8 }, (_, i) => (
                <div className="card skeleton" key={i} />
              ))}
            </div>
          ) : activeCount ? (
            <Empty
              icon={SlidersHorizontal}
              title="Bu filtrlərə uyğun məhsul yoxdur"
              text="Qiymət aralığını genişləndir, brend və ya mağaza seçimini sıfırla."
              action={
                <button className="btn btn-primary" onClick={reset}>
                  Filtrləri sıfırla
                </button>
              }
            />
          ) : (
            <Empty
              icon={Search}
              title={
                page === "secilmisler"
                  ? "Seçilmişlərin boşdur"
                  : searchTerm
                    ? `“${searchTerm}” üzrə məhsul tapılmadı`
                    : "Uyğun məhsul tapılmadı"
              }
              text={
                page === "secilmisler"
                  ? "Məhsul kartındakı ürək düyməsi ilə bəyəndiyini saxla."
                  : "Yazılışı yoxla, daha qısa söz və ya yalnız model adını yaz. Məsələn: “iPhone 16”."
              }
              action={
                <a className="btn btn-primary" href="/kataloq">
                  Bütün məhsullara bax
                </a>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
