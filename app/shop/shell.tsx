"use client";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Heart,
  House,
  Info,
  LayoutGrid,
  MapPin,
  Scale,
  Search,
  Store as StoreIcon,
  TrendingDown,
  UserRound,
  X,
} from "lucide-react";
import { canonicalProductId, categories, money, priceOf, type Product } from "../../lib/catalog";
import {
  DEFAULT_CITY,
  PAGE_SIZE,
  type CatalogSlice,
  type Suggestion,
} from "../../lib/catalog-query";
import { api, CategoryIcon, Empty, errorMessage, Modal } from "../ui";
import type { Act, Personal, Session } from "../types";
import { ProductImage } from "../../components/product-image";
import { azNumber } from "../../components/format";
import { SIGN_IN_PATH } from "../auth-headers";
import { emptyFilters, ShopContext, type Filters, type ModalState, type Shop } from "./context";
import Home from "./home";
import Listing from "./listing";
import ProductDetail from "./product";
import SamplePage from "./sample";
import { isSamplePage } from "../../lib/samples";
import {
  Account,
  Alerts,
  AuthPage,
  CITIES,
  Compare,
  Guide,
  InfoContent,
  MerchantForm,
  Stores,
} from "./pages";

const LISTING_PAGES = ["kataloq", "kateqoriya", "axtaris", "endirimler", "secilmisler"];
const SORTS = ["popular", "low", "high", "saving", "name"];

function SearchBox({ city, initial }: { city: string; initial: string }) {
  const [query, setQuery] = useState(initial);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLFormElement>(null);
  useEffect(() => {
    const text = query.trim();
    if (text.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api<{ items: Suggestion[] }>(
        "suggest?q=" + encodeURIComponent(text) + "&city=" + encodeURIComponent(city),
      ).then(
        (r) => {
          if (cancelled) return;
          setItems(r.items);
          setActive(-1);
        },
        () => {},
      );
    }, 160);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, city]);
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const shown = open && query.trim().length >= 2 ? items : [];
  const go = (to: string) => window.location.assign(to);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (active >= 0 && shown[active]) return go("/mehsul/" + shown[active].id);
    if (query.trim()) go("/axtaris?q=" + encodeURIComponent(query.trim()));
  };
  return (
    <form
      className="search"
      action="/axtaris"
      method="get"
      role="search"
      ref={box}
      onSubmit={submit}
    >
      <Search size={20} aria-hidden="true" />
      <input
        name="q"
        value={query}
        autoComplete="off"
        enterKeyHint="search"
        placeholder="Məhsul, model və ya brend axtar"
        aria-label="Məhsul axtar"
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls="search-suggestions"
        aria-autocomplete="list"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
          if (!shown.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((active + 1) % shown.length);
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((active - 1 + shown.length) % shown.length);
          }
        }}
      />
      {query && (
        <button
          type="button"
          className="search-clear"
          aria-label="Axtarışı təmizlə"
          onClick={() => {
            setQuery("");
            setItems([]);
          }}
        >
          <X size={16} />
        </button>
      )}
      <button type="submit" className="search-go">
        Axtar
      </button>
      {shown.length > 0 && (
        <ul className="suggest" id="search-suggestions" role="listbox">
          {shown.map((s, i) => (
            <li key={s.id} role="option" aria-selected={i === active}>
              <a href={"/mehsul/" + s.id} className={i === active ? "on" : ""}>
                <ProductImage src={s.image} alt="" width={44} height={44} loading="lazy" />
                <span>
                  <b>{s.name}</b>
                  <small>{s.stores > 0 ? s.stores + " mağazada" : "Stokda yoxdur"}</small>
                </span>
                {s.price > 0 && <strong>{money(s.price)}</strong>}
              </a>
            </li>
          ))}
          <li role="option" aria-selected={false}>
            <a className="suggest-all" href={"/axtaris?q=" + encodeURIComponent(query.trim())}>
              “{query.trim()}” üzrə bütün nəticələr <ChevronRight size={15} />
            </a>
          </li>
        </ul>
      )}
    </form>
  );
}

export default function ShopShell({
  initialPath = "/",
  initialCatalog,
}: {
  initialPath?: string;
  initialCatalog: CatalogSlice;
}) {
  const [c, setC] = useState<CatalogSlice>(initialCatalog),
    [version, setVersion] = useState(0),
    [error, setError] = useState(""),
    [path, setPath] = useState(initialPath),
    [city, setCity] = useState(DEFAULT_CITY),
    [session, setSession] = useState<Session>({ user: null, admin: false, needsSetup: false }),
    [personal, setPersonal] = useState<Personal>({ favorites: [], alerts: [] }),
    [compIds, setComp] = useState<string[]>([]),
    [toast, setToast] = useState(""),
    [modal, setModal] = useState<ModalState>(null),
    [busy, setBusy] = useState(false),
    [menu, setMenu] = useState(false),
    [pageOffset, setPageOffset] = useState(initialCatalog.pageOffset || 0);
  const initialParams = new URLSearchParams(initialPath.split("?")[1] || "");
  const [filter, updateFilter] = useState<Filters>({
    ...emptyFilters,
    sort: SORTS.includes(initialParams.get("sort") || "") ? initialParams.get("sort")! : "popular",
  });
  const setFilter = (next: Filters) => {
    setPageOffset(0);
    updateFilter(next);
    // A new filter starts from the first page, so drop a stale ?page=N from the address bar.
    const url = new URL(window.location.href);
    if (url.searchParams.has("page")) {
      url.searchParams.delete("page");
      window.history.replaceState(null, "", url.pathname + url.search);
    }
  };
  const aliases = c.productAliases;
  const comp = useMemo(
    () => [...new Set(compIds.map((id) => canonicalProductId({ productAliases: aliases }, id)))],
    [compIds, aliases],
  );
  const nav = (to: string) => window.location.assign(to);
  const loadAccount = async () => {
    try {
      const [s, p] = await Promise.all([api<Session>("session"), api<Personal>("personal")]);
      setSession(s);
      setPersonal(p);
      setError("");
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  // Also re-requests the visible catalog slice, e.g. after the viewer changed their data.
  const refresh = async () => {
    setVersion((v) => v + 1);
    await loadAccount();
  };
  useEffect(() => {
    const pop = () => setPath(location.pathname + location.search);
    window.addEventListener("popstate", pop);
    // localStorage only exists after hydration; reading it here keeps the server and first client
    // render identical.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      setComp(JSON.parse(localStorage.getItem("qepik-compare") || "[]"));
      setCity(localStorage.getItem("qepik-city") || DEFAULT_CITY);
    } catch {}
    /* eslint-enable react-hooks/set-state-in-effect */
    loadAccount();
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!menu) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const key = (e: KeyboardEvent) => e.key === "Escape" && setMenu(false);
    document.addEventListener("keydown", key);
    return () => {
      document.body.style.overflow = old;
      document.removeEventListener("keydown", key);
    };
  }, [menu]);
  const act: Act = async (fn, msg) => {
    setBusy(true);
    try {
      await fn();
      if (msg) setToast(msg);
      return true;
    } catch (e) {
      setToast(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const needUser = () => {
    if (session.user) return true;
    window.location.assign(SIGN_IN_PATH + "?return_to=" + encodeURIComponent(path));
    return false;
  };
  const isFavorite = (id: string) => personal.favorites.some((f) => f.productId === id);
  const favorite = (p: Product) => {
    if (!needUser()) return;
    const remove = isFavorite(p.id);
    act(
      async () => {
        await api("personal", { kind: "favorite", productId: p.id, remove });
        await refresh();
      },
      remove ? "Seçilmişlərdən çıxarıldı." : "Seçilmişlərə əlavə edildi.",
    );
  };
  const compare = (p: Product) => {
    const next = comp.includes(p.id)
      ? comp.filter((id) => id !== p.id)
      : comp.length < 4
        ? [...comp, p.id]
        : comp;
    if (next === comp) return setToast("Eyni vaxtda ən çox 4 məhsul müqayisə edilir.");
    setComp(next);
    localStorage.setItem("qepik-compare", JSON.stringify(next));
  };
  const alert = (p: Product) => {
    if (needUser()) setModal({ type: "alert", p });
  };
  const parts = path.split("?")[0].split("/").filter(Boolean),
    page = parts[0] || "home",
    selected = c.products.find((p) => p.id === parts[1]);
  const searchTerm = new URLSearchParams(path.split("?")[1] || "").get("q") || "";
  const category = page === "kateqoriya" ? parts[1] : "";
  const isListing = LISTING_PAGES.includes(page);
  const storeId = page === "magazalar" ? parts[1] || "" : "";
  // Filtering and sorting run on the server; this only says which slice the page needs.
  const sliceQuery = useMemo(() => {
    const q = new URLSearchParams({
      path,
      city,
      limit: String(PAGE_SIZE),
      offset: String(pageOffset),
    });
    if (filter.brand) q.set("brand", filter.brand);
    if (filter.store) q.set("store", filter.store);
    if (filter.min) q.set("min", filter.min);
    if (filter.max) q.set("max", filter.max);
    if (filter.sort !== "popular") q.set("sort", filter.sort);
    if (filter.real) q.set("real", "1");
    if (filter.stock) q.set("stock", "1");
    const ids = new Set([...comp, ...personal.alerts.map((a) => a.productId)]);
    if (ids.size) q.set("ids", [...ids].join(","));
    if (page === "secilmisler")
      q.set("favorites", personal.favorites.map((f) => f.productId).join(","));
    return q.toString();
  }, [path, city, pageOffset, filter, comp, personal, page]);
  // The server already rendered the first slice; fetch only once something differs from it.
  const firstQuery = useRef(sliceQuery);
  const [loadedQuery, setLoadedQuery] = useState(sliceQuery);
  useEffect(() => {
    if (version === 0 && sliceQuery === firstQuery.current) return;
    let cancelled = false;
    // Debounced so typing a price range does not send a request per keystroke.
    const timer = setTimeout(() => {
      api<CatalogSlice>("catalog?" + sliceQuery).then(
        (next) => {
          if (cancelled) return;
          firstQuery.current = "";
          setLoadedQuery(sliceQuery);
          setC(next);
          setError("");
        },
        (e) => !cancelled && setError(errorMessage(e)),
      );
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [sliceQuery, version]);
  const products = useMemo(() => {
    const byId = new Map(c.products.map((p) => [p.id, p]));
    return c.matched.flatMap((id) => byId.get(id) || []);
  }, [c]);
  const listingTop = useRef<HTMLDivElement>(null);
  const loading = sliceQuery !== loadedQuery && !error;
  const pageHref = (n: number) => {
    const [base, qs = ""] = path.split("?");
    const q = new URLSearchParams(qs);
    if (n > 1) q.set("page", String(n));
    else q.delete("page");
    return base + (q.size ? "?" + q.toString() : "");
  };
  const goToPage = (offset: number) => {
    const next = Math.max(0, offset);
    setPageOffset(next);
    window.history.replaceState(null, "", pageHref(Math.floor(next / PAGE_SIZE) + 1));
    listingTop.current?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  };
  const currentStore = storeId ? c.stores.find((s) => s.id === storeId) : undefined;
  const title = storeId
    ? currentStore?.name || "Mağaza"
    : page === "endirimler"
      ? "Qiyməti düşənlər"
      : page === "secilmisler"
        ? "Seçilmişlər"
        : page === "axtaris"
          ? `“${searchTerm}” üçün nəticələr`
          : category
            ? categories.find((v) => v.id === category)?.name || "Kateqoriya"
            : "Bütün məhsullar";
  const shop: Shop = {
    c,
    city,
    path,
    session,
    personal,
    comp,
    busy,
    act,
    refresh,
    nav,
    needUser,
    favorite,
    compare,
    alert,
    setToast,
    openModal: setModal,
    isFavorite,
  };
  const availableCategories = categories.filter((cat) => (c.categoryStats[cat.id]?.count || 0) > 0);
  const accountHref = session.user ? "/hesab" : SIGN_IN_PATH;
  const current = (name: string) => (page === name ? "page" : undefined);
  const known = [
    "home",
    ...LISTING_PAGES,
    "magazalar",
    "mehsul",
    "muqayise",
    "bildirisler",
    "magaza-qeydiyyat",
    "rehber",
    "giris",
    "qeydiyyat",
    "hesab",
  ];
  return (
    <ShopContext.Provider value={shop}>
      <a className="skip-link" href="#main-content">
        Əsas məzmuna keç
      </a>
      <div className="topbar">
        <div className="wrap">
          <span>{c.settings.announcement}</span>
          <nav aria-label="Köməkçi keçidlər">
            <a href="/rehber">Alış-veriş bələdçisi</a>
            <a href="/magaza-qeydiyyat">Mağazanı əlavə et</a>
            <button onClick={() => setModal({ type: "city" })}>
              <MapPin size={13} aria-hidden="true" />
              {city}
              <ChevronDown size={12} aria-hidden="true" />
            </button>
          </nav>
        </div>
      </div>
      <header className="header">
        <div className="wrap header-row">
          <a className="logo" aria-label="Qəpik ana səhifə" href="/">
            <img src="/favicon.svg?v=4" alt="" width={38} height={38} />
            <span className="logo-word">qəpik</span>
          </a>
          <button
            className="header-cats"
            onClick={() => setMenu(true)}
            aria-expanded={menu}
            aria-controls="category-menu"
          >
            <LayoutGrid size={18} aria-hidden="true" /> Kateqoriyalar
          </button>
          <SearchBox key={searchTerm} city={city} initial={searchTerm} />
          <button
            className="header-city"
            onClick={() => setModal({ type: "city" })}
            aria-label={"Şəhər: " + city}
          >
            <MapPin size={18} aria-hidden="true" />
            {city}
          </button>
          <nav className="header-actions" aria-label="Hesab keçidləri">
            <a href="/muqayise" aria-label="Müqayisə" aria-current={current("muqayise")}>
              <Scale size={21} />
              {comp.length > 0 && <b>{comp.length}</b>}
              <small>Müqayisə</small>
            </a>
            <a href="/secilmisler" aria-label="Seçilmişlər" aria-current={current("secilmisler")}>
              <Heart size={21} />
              {personal.favorites.length > 0 && <b>{personal.favorites.length}</b>}
              <small>Seçilmişlər</small>
            </a>
            <a href="/bildirisler" aria-label="Bildirişlər" aria-current={current("bildirisler")}>
              <Bell size={21} />
              {personal.alerts.length > 0 && <b>{personal.alerts.length}</b>}
              <small>Bildirişlər</small>
            </a>
            <a href={accountHref} className="header-account" aria-current={current("hesab")}>
              <UserRound size={21} />
              <small>{session.user ? session.user.name.split(" ")[0] : "Daxil ol"}</small>
            </a>
          </nav>
        </div>
        <nav className="wrap quicknav" aria-label="Sürətli keçidlər">
          <a href="/endirimler" className="quicknav-hot" aria-current={current("endirimler")}>
            <TrendingDown size={16} aria-hidden="true" /> Qiyməti düşənlər
          </a>
          {availableCategories.slice(0, 9).map((cat) => (
            <a
              key={cat.id}
              href={"/kateqoriya/" + cat.id}
              aria-current={category === cat.id ? "page" : undefined}
            >
              {cat.name}
            </a>
          ))}
          <a href="/magazalar" aria-current={page === "magazalar" && !storeId ? "page" : undefined}>
            Mağazalar
          </a>
        </nav>
      </header>
      {menu && (
        <div
          className="drawer"
          id="category-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Kateqoriyalar"
        >
          <div className="scrim" onClick={() => setMenu(false)} />
          <div className="drawer-panel">
            <div className="drawer-head">
              <h2>Kateqoriyalar</h2>
              <button
                className="icon-btn"
                aria-label="Bağla"
                onClick={() => setMenu(false)}
                autoFocus
              >
                <X size={20} />
              </button>
            </div>
            <div className="drawer-list">
              <a href="/endirimler" className="drawer-hot">
                <span>
                  <TrendingDown size={22} />
                </span>
                <b>Qiyməti düşənlər</b>
                <ChevronRight size={16} />
              </a>
              {availableCategories.map((cat) => (
                <a key={cat.id} href={"/kateqoriya/" + cat.id}>
                  <span>
                    <CategoryIcon name={cat.icon} size={22} />
                  </span>
                  <b>{cat.name}</b>
                  <small>{azNumber(c.categoryStats[cat.id].count)}</small>
                  <ChevronRight size={16} />
                </a>
              ))}
              <a href="/magazalar">
                <span>
                  <StoreIcon size={22} />
                </span>
                <b>Mağazalar</b>
                <ChevronRight size={16} />
              </a>
            </div>
          </div>
        </div>
      )}
      {c.dataStatus && c.dataStatus.state !== "ready" && (
        <div
          className="wrap notice"
          role={c.dataStatus.state === "unavailable" ? "alert" : "status"}
        >
          <Info size={18} aria-hidden="true" />
          <span>{c.dataStatus.message || "Kataloq hazırlanır."}</span>
          {c.dataStatus.state === "unavailable" && (
            <button className="btn btn-outline" onClick={refresh}>
              Yenidən yoxla
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="wrap notice notice-error" role="alert">
          <Info size={18} aria-hidden="true" />
          <span>Məlumat yüklənmədi: {error}</span>
          <button className="btn btn-outline" onClick={refresh}>
            Yenidən yoxla
          </button>
        </div>
      )}
      <main className="wrap main" id="main-content" tabIndex={-1}>
        {page === "home" && <Home />}
        {(isListing || storeId) && (
          <Listing
            page={page}
            title={title}
            products={products}
            filter={filter}
            setFilter={setFilter}
            loading={loading}
            goToPage={goToPage}
            pageHref={pageHref}
            top={listingTop}
            storeId={storeId}
            searchTerm={searchTerm}
            category={category}
          />
        )}
        {page === "mehsul" &&
          (selected?.active ? (
            <ProductDetail key={selected.id} p={selected} />
          ) : (
            <Empty
              title="Məhsul tapılmadı"
              text="Bu məhsul kataloqda mövcud deyil."
              action={
                <a className="btn btn-primary" href="/kataloq">
                  Kataloqa qayıt
                </a>
              }
            />
          ))}
        {page === "magazalar" && !storeId && <Stores />}
        {page === "muqayise" && <Compare />}
        {page === "bildirisler" && <Alerts />}
        {page === "magaza-qeydiyyat" && <MerchantForm />}
        {page === "rehber" && <Guide />}
        {page === "giris" && <AuthPage mode="login" />}
        {page === "qeydiyyat" && <AuthPage mode="register" />}
        {page === "hesab" && <Account />}
        {isSamplePage(page) && <SamplePage key={page} slug={page} />}
        {!known.includes(page) && !isSamplePage(page) && (
          <Empty
            title="Səhifə tapılmadı"
            text="Axtardığın səhifə mövcud deyil."
            action={
              <a className="btn btn-primary" href="/">
                Ana səhifə
              </a>
            }
          />
        )}
      </main>
      <footer className="footer">
        <div className="wrap footer-main">
          <div className="footer-brand">
            <a className="logo" href="/">
              <img src="/favicon.svg?v=4" alt="" width={36} height={36} />
              <span className="logo-word">qəpik</span>
            </a>
            <p>{c.settings.headline} Azərbaycan mağazalarının qiymətləri bir yerdə.</p>
            <small>
              {azNumber(c.totals?.products || 0)} məhsul · {azNumber(c.totals?.stores || 0)} mağaza
            </small>
          </div>
          <div>
            <h3>Kəşf et</h3>
            <a href="/kataloq">Bütün məhsullar</a>
            <a href="/endirimler">Qiyməti düşənlər</a>
            <a href="/magazalar">Mağazalar</a>
            <a href="/muqayise">Müqayisə</a>
          </div>
          <div>
            <h3>Kateqoriyalar</h3>
            {availableCategories.slice(0, 5).map((cat) => (
              <a key={cat.id} href={"/kateqoriya/" + cat.id}>
                {cat.name}
              </a>
            ))}
          </div>
          <div>
            <h3>Qəpik</h3>
            <button onClick={() => setModal({ type: "info", topic: "Haqqımızda" })}>
              Necə işləyir?
            </button>
            <a href="/rehber">Alış-veriş bələdçisi</a>
            <button onClick={() => setModal({ type: "info", topic: "Sıralama qaydası" })}>
              Sıralama qaydası
            </button>
            <button onClick={() => setModal({ type: "info", topic: "Məxfilik" })}>Məxfilik</button>
          </div>
          <div>
            <h3>Mağazalar üçün</h3>
            <a href="/magaza-qeydiyyat">Mağazanı əlavə et</a>
            <a href={accountHref}>{session.user ? "Hesabım" : "Daxil ol"}</a>
            {session.admin && <a href="/admin">İdarəetmə paneli</a>}
          </div>
        </div>
        <div className="wrap footer-bottom">
          <span>© 2026 Qəpik · Novo Media tərəfindən hazırlanıb</span>
          <span>Qəpik məhsul satmır. Alış seçilən mağazada tamamlanır.</span>
        </div>
      </footer>
      {comp.length > 0 && page !== "muqayise" && (
        <div className="tray">
          <Scale size={17} aria-hidden="true" />
          <span>{comp.length} məhsul</span>
          <a className="btn btn-sun" href="/muqayise">
            Müqayisə et
          </a>
          <button
            className="icon-btn"
            aria-label="Müqayisəni təmizlə"
            onClick={() => {
              setComp([]);
              localStorage.removeItem("qepik-compare");
            }}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <nav
        className={"tabbar" + (page === "mehsul" || isSamplePage(page) ? " tabbar-hidden" : "")}
        aria-label="Əsas bölmələr"
      >
        <a href="/" aria-current={current("home")}>
          <House size={22} />
          Ana səhifə
        </a>
        <button
          onClick={() => setMenu(true)}
          aria-current={
            isListing && page !== "secilmisler" && page !== "endirimler" ? "page" : undefined
          }
        >
          <LayoutGrid size={22} />
          Kateqoriya
        </button>
        <a href="/endirimler" aria-current={current("endirimler")}>
          <TrendingDown size={22} />
          Endirimlər
        </a>
        <a href="/secilmisler" aria-current={current("secilmisler")}>
          <Heart size={22} />
          Seçilmiş
        </a>
        <a
          href={accountHref}
          aria-current={page === "hesab" || page === "giris" ? "page" : undefined}
        >
          <UserRound size={22} />
          {session.user ? "Hesab" : "Daxil ol"}
        </a>
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Info size={18} aria-hidden="true" />
          <span>{toast}</span>
          <button className="icon-btn" aria-label="Bağla" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          title={
            modal.type === "alert"
              ? "Hədəf qiymətini seç"
              : modal.type === "city"
                ? "Çatdırılma şəhərin"
                : modal.topic
          }
          onClose={() => setModal(null)}
        >
          {modal.type === "city" && (
            <div className="city-list">
              {CITIES.map((v) => (
                <button
                  key={v}
                  className={city === v ? "on" : ""}
                  onClick={() => {
                    setPageOffset(0);
                    setCity(v);
                    localStorage.setItem("qepik-city", v);
                    setModal(null);
                  }}
                >
                  <MapPin size={18} aria-hidden="true" />
                  {v}
                  {city === v && <Check size={18} aria-hidden="true" />}
                </button>
              ))}
              <p>Yalnız həmin şəhərə çatdırılma göstərən mağazaların təklifləri sayılır.</p>
            </div>
          )}
          {modal.type === "alert" && (
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                const target = Number(new FormData(e.currentTarget).get("target"));
                if (
                  await act(async () => {
                    await api("personal", { kind: "alert", productId: modal.p.id, target });
                    await refresh();
                  }, "Qiymət bildirişi saxlanıldı.")
                )
                  setModal(null);
              }}
            >
              <div className="alert-product">
                <ProductImage src={modal.p.image} alt="" width={64} height={64} />
                <div>
                  <b>{modal.p.name}</b>
                  <span>Hazırda {money(priceOf(c, modal.p.id))}</span>
                </div>
              </div>
              <label>
                Hədəf qiymətin, ₼
                <input
                  name="target"
                  type="number"
                  min="0.01"
                  step="0.01"
                  inputMode="decimal"
                  required
                  defaultValue={
                    personal.alerts.find((a) => a.productId === modal.p.id)?.target ||
                    Math.round(priceOf(c, modal.p.id) * 0.9)
                  }
                />
              </label>
              <small>Qiymət hədəfə çatanda “Bildirişlər” bölməsində görünəcək.</small>
              <button className="btn btn-primary btn-lg" disabled={busy}>
                <Bell size={17} aria-hidden="true" />
                {busy ? "Saxlanılır…" : "Bildirişi saxla"}
              </button>
            </form>
          )}
          {modal.type === "info" && <InfoContent topic={modal.topic} />}
        </Modal>
      )}
    </ShopContext.Provider>
  );
}
