"use client";
import { useState, type CSSProperties, type MouseEvent } from "react";
import {
  ArrowUpRight,
  Bell,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  CreditCard,
  Heart,
  HelpCircle,
  Scale,
  Send,
  Share2,
  ShieldCheck,
  Star,
  Store as StoreIcon,
  TrendingDown,
  TrendingUp,
  Truck,
  XCircle,
} from "lucide-react";
import {
  bestRecordedOffersFor,
  categories,
  money,
  validOffers,
  type Offer,
  type Product,
  shownVariant,
} from "../../lib/catalog";
import { api, Empty, errorMessage, StoreLogo } from "../ui";
import { ProductImage } from "../../components/product-image";
import { azDate, azDateTime } from "../../components/format";
import { ProductCard, Rail } from "./card";
import { agoText, cheapestCredit, useShop } from "./context";

const inStock = (o: Offer) => o.stock && o.stockKnown !== false;

function PriceChart({ points }: { points: { id: string; price: number; date: string }[] }) {
  const min = Math.min(...points.map((h) => h.price)),
    max = Math.max(...points.map((h) => h.price));
  const x = (i: number) => 40 + (i / Math.max(points.length - 1, 1)) * 740;
  const y = (price: number) => 150 - ((price - min) / Math.max(max - min, 1)) * 110;
  const line = points.map((h, i) => `${x(i)},${y(h.price)}`).join(" ");
  return (
    <svg viewBox="0 0 800 200" className="chart" role="img" aria-label="Qiymət tarixçəsi qrafiki">
      <defs>
        <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--nar)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--nar)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M40 40H780 M40 95H780 M40 150H780" className="chart-grid" />
      <polygon points={`40,170 ${line} 780,170`} fill="url(#chart-fill)" />
      <polyline points={line} fill="none" className="chart-line" />
      {points.map((h, i) => (
        <circle key={h.id} cx={x(i)} cy={y(h.price)} r="4.5" className="chart-dot">
          <title>{`${azDate(h.date)}: ${money(h.price)}`}</title>
        </circle>
      ))}
      <text x="40" y="30" className="chart-label">
        {money(max)}
      </text>
      {max > min && (
        <text x="40" y="166" className="chart-label">
          {money(min)}
        </text>
      )}
      <text x="40" y="192" className="chart-label">
        {azDate(points[0].date)}
      </text>
      <text x="780" y="192" className="chart-label" textAnchor="end">
        {azDate(points[points.length - 1].date)}
      </text>
    </svg>
  );
}

export default function ProductDetail({ p, sample = false }: { p: Product; sample?: boolean }) {
  const {
    c,
    city,
    comp,
    alert,
    favorite,
    compare,
    nav,
    setToast,
    needUser,
    openModal,
    isFavorite,
    personal,
  } = useShop();
  const [sort, setSort] = useState("price"),
    [period, setPeriod] = useState(90),
    [free, setFree] = useState(false),
    [stockOnly, setStockOnly] = useState(false),
    [term, setTerm] = useState(12),
    [showAll, setShowAll] = useState(false),
    [sending, setSending] = useState(false),
    [rating, setRating] = useState(5),
    [now] = useState(() => Date.now());
  const recorded = bestRecordedOffersFor(c, p.id, city);
  const available = validOffers(c, p.id, city);
  const best = available[0];
  const shown = best || recorded[0];
  const bestStore = shown && c.stores.find((s) => s.id === shown.storeId);
  const high = available.length ? Math.max(...available.map((o) => o.price)) : 0;
  const save = best && available.length > 1 ? high - best.price : 0;
  const credit = cheapestCredit(available);
  const termTotal = (o: Offer) =>
    o.installmentOptions?.find((x) => x.months === term)?.total ||
    (o.months === term ? o.installmentTotal : 0) ||
    Infinity;
  let offers = [...recorded];
  if (stockOnly) offers = offers.filter(inStock);
  if (free) offers = offers.filter((o) => o.shipping === 0 && o.shippingKnown === true);
  offers.sort(
    (a, b) =>
      Number(inStock(b)) - Number(inStock(a)) ||
      (sort === "installment" ? termTotal(a) - termTotal(b) : a.price - b.price),
  );
  const visible = showAll ? offers : offers.slice(0, 6);
  const allHistory = c.history
    .filter((h) => h.productId === p.id && !h.demo)
    .sort((a, b) => a.date.localeCompare(b.date));
  const last = allHistory.length ? Date.parse(allHistory[allHistory.length - 1].date) : 0;
  const history = allHistory.filter((h) => Date.parse(h.date) >= last - period * 86400000);
  const hMin = history.length ? Math.min(...history.map((h) => h.price)) : 0,
    hMax = history.length ? Math.max(...history.map((h) => h.price)) : 0;
  // Compared with the previous different recorded price.
  const previous = [...allHistory].reverse().find((h) => shown && h.price !== shown.price);
  const trend = shown && previous ? shown.price - previous.price : 0;
  const reviews = c.reviews.filter((r) => r.productId === p.id);
  const average = reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : 0;
  const category = categories.find((x) => x.id === p.category);
  const variants = p.familyId
    ? c.products.filter((o) => o.active && o.familyId === p.familyId)
    : [];
  const byId = new Map(c.products.map((x) => [x.id, x]));
  const similar = (c.similar || []).flatMap((id) => byId.get(id) || []);
  const specs = Object.entries(p.specs);
  const fav = isFavorite(p.id);
  const watching = personal.alerts.find((a) => a.productId === p.id);
  const go = (e: MouseEvent, o: Offer) => {
    if (sample) {
      e.preventDefault();
      setToast(
        "Bu nümunə səhifədir: " +
          (c.stores.find((s) => s.id === o.storeId)?.name || "mağaza") +
          " saytı açılmır.",
      );
      return;
    }
    if (o.demo) {
      e.preventDefault();
      openModal({ type: "info", topic: "Nümunə təklif" });
      return;
    }
    void api("click", { offerId: o.id }).catch(() => {});
  };
  const share = async () => {
    const data = { title: p.name, url: location.href };
    try {
      if (navigator.share) await navigator.share(data);
      else {
        await navigator.clipboard.writeText(location.href);
        setToast("Link kopyalandı.");
      }
    } catch {}
  };
  return (
    <div className="pd">
      <nav className="crumbs" aria-label="Səhifə yolu">
        <a href="/">Ana səhifə</a>
        <ChevronRight size={13} aria-hidden="true" />
        <a href={"/kateqoriya/" + p.category}>{category?.name}</a>
        <ChevronRight size={13} aria-hidden="true" />
        <span aria-current="page">{p.name}</span>
      </nav>

      <div className="pd-top">
        <div className="pd-gallery">
          <ProductImage src={p.image} alt={p.name} width={520} height={520} fetchPriority="high" />
          <div className="pd-gallery-tools">
            <button
              className={fav ? "on" : ""}
              aria-pressed={fav}
              aria-label="Seçilmişlərə əlavə et"
              onClick={() => favorite(p)}
            >
              <Heart size={19} />
            </button>
            <button
              className={comp.includes(p.id) ? "on" : ""}
              aria-pressed={comp.includes(p.id)}
              aria-label="Müqayisəyə əlavə et"
              onClick={() => compare(p)}
            >
              <Scale size={19} />
            </button>
            <button aria-label="Paylaş" onClick={share}>
              <Share2 size={19} />
            </button>
          </div>
          {save >= 5 && (
            <span className="flag flag-save pd-flag">
              <TrendingDown size={13} aria-hidden="true" />
              Mağazalar arasında {money(Math.round(save))} fərq
            </span>
          )}
        </div>

        <div className="pd-info">
          <a className="pd-brand" href={"/axtaris?q=" + encodeURIComponent(p.brand)} lang="en">
            {p.brand}
          </a>
          <h1>{p.name}</h1>
          {shownVariant(p) && <p className="pd-variant">{shownVariant(p)}</p>}
          <div className="pd-meta">
            {reviews.length > 0 && (
              <a href="#reyler">
                <Star size={15} fill="currentColor" aria-hidden="true" />
                {average.toFixed(1).replace(".", ",")} · {reviews.length} rəy
              </a>
            )}
            <span>
              <StoreIcon size={15} aria-hidden="true" />
              {available.length} mağazada stokda
            </span>
            {shown && agoText(shown.checkedAt, now) && (
              // Server and browser clocks can sit either side of a minute boundary.
              <span suppressHydrationWarning>
                <Clock size={15} aria-hidden="true" />
                {agoText(shown.checkedAt, now)} yoxlanıb
              </span>
            )}
          </div>
          {variants.length > 1 && (
            <div className="pd-variants">
              <span>Variant</span>
              <div>
                {variants.slice(0, 14).map((v) => (
                  <a
                    key={v.id}
                    href={"/mehsul/" + v.id}
                    className={v.id === p.id ? "on" : ""}
                    aria-current={v.id === p.id ? "true" : undefined}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      nav("/mehsul/" + v.id);
                    }}
                  >
                    {v.variant || v.name}
                  </a>
                ))}
              </div>
            </div>
          )}
          {specs.length > 0 && (
            <ul className="pd-keyspecs">
              {specs.slice(0, 6).map(([k, v]) => (
                <li key={k}>
                  <span>{k}</span>
                  <b>{v}</b>
                </li>
              ))}
            </ul>
          )}
          {specs.length > 6 && (
            <a className="link" href="#xususiyyetler">
              Bütün xüsusiyyətlər <ChevronRight size={14} />
            </a>
          )}
          {recorded.length > 1 && (
            // Wide screens: a quick look at the store prices, so the column is not left empty.
            <a className="pd-glance" href="#teklifler">
              <span className="pd-glance-head">
                <b>Mağaza qiymətləri</b>
                <small>
                  {money(recorded[0].price)} – {money(Math.max(...recorded.map((o) => o.price)))}
                </small>
              </span>
              <ol>
                {recorded.slice(0, 4).map((o, i) => {
                  const s = c.stores.find((x) => x.id === o.storeId)!;
                  const top = Math.max(...recorded.map((x) => x.price));
                  const low = recorded[0].price;
                  return (
                    <li key={o.id} style={{ "--i": i } as CSSProperties}>
                      <StoreLogo store={s} />
                      <i aria-hidden="true">
                        <em
                          style={{
                            width:
                              (top > low ? 35 + ((o.price - low) / (top - low)) * 65 : 100) + "%",
                          }}
                        />
                      </i>
                      <strong className={i === 0 ? "is-low" : ""}>{money(o.price)}</strong>
                    </li>
                  );
                })}
              </ol>
              <span className="pd-glance-more">
                Bütün {recorded.length} təklifə bax <ChevronRight size={14} aria-hidden="true" />
              </span>
            </a>
          )}
        </div>

        <aside className={"buybox" + (best ? "" : " buybox-off")} aria-label="Ən yaxşı təklif">
          <span className="buybox-label">
            {!shown
              ? "Qiymət mağazada dəqiqləşdirilir"
              : shown.stockKnown === false
                ? "Mənbədəki qiymət · stoku mağazada yoxla"
                : !shown.stock
                  ? "Son bildirilən qiymət · stokda yoxdur"
                  : available.length > 1
                    ? "Ən ucuz qiymət"
                    : "Qiymət"}
          </span>
          <div className="buybox-price">
            <strong>{shown ? money(shown.price) : "—"}</strong>
            {save > 0 && <s>{money(high)}</s>}
          </div>
          {trend !== 0 && previous && (
            <p className={"buybox-trend " + (trend < 0 ? "down" : "up")}>
              {trend < 0 ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
              {azDate(previous.date)} qeydindən {money(Math.abs(trend))}{" "}
              {trend < 0 ? "ucuz" : "baha"}
            </p>
          )}
          {bestStore && shown && (
            <div className="buybox-store">
              <StoreLogo store={bestStore} />
              <ul>
                <li>
                  <Truck size={14} aria-hidden="true" />
                  {shown.shippingKnown === false
                    ? "Çatdırılmanı mağazada dəqiqləşdir"
                    : shown.shipping
                      ? "Çatdırılma " + money(shown.shipping)
                      : "Pulsuz çatdırılma"}
                </li>
                {credit && (
                  <li>
                    <CreditCard size={14} aria-hidden="true" />
                    Taksitlə {money(credit.monthly)} × {credit.months} ay
                  </li>
                )}
                {shown.warranty && (
                  <li>
                    <ShieldCheck size={14} aria-hidden="true" />
                    Zəmanət: {shown.warranty}
                  </li>
                )}
              </ul>
            </div>
          )}
          {shown ? (
            <a
              className="btn btn-primary btn-lg"
              href={shown.demo ? undefined : shown.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => go(e, shown)}
            >
              {bestStore?.name || "Mağaza"} saytına keç{" "}
              <ArrowUpRight size={18} aria-hidden="true" />
            </a>
          ) : (
            p.sourceUrl && (
              <a
                className="btn btn-primary btn-lg"
                href={p.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Məhsula mağazada bax <ArrowUpRight size={18} aria-hidden="true" />
              </a>
            )
          )}
          <button className={"btn btn-ghost" + (watching ? " on" : "")} onClick={() => alert(p)}>
            <Bell size={17} aria-hidden="true" />
            {watching ? "Hədəf: " + money(watching.target) : "Qiymət düşəndə xəbər ver"}
          </button>
          {recorded.length > 1 && (
            <a className="buybox-more" href="#teklifler">
              {recorded.length} mağazanın qiymətinə bax <ChevronRight size={14} />
            </a>
          )}
          <p className="buybox-note">
            Qəpik satıcı deyil. Alış mağazanın öz saytında tamamlanır; qiyməti və stoku orada
            təsdiqlə.
          </p>
        </aside>
      </div>

      <nav className="pd-nav" aria-label="Məhsul bölmələri">
        <a href="#teklifler">
          Təkliflər <span>{recorded.length}</span>
        </a>
        <a href="#tarixce">Qiymət tarixçəsi</a>
        {specs.length > 0 && <a href="#xususiyyetler">Xüsusiyyətlər</a>}
        <a href="#reyler">
          Rəylər <span>{reviews.length}</span>
        </a>
      </nav>

      <section className="panel" id="teklifler" aria-labelledby="offers-title">
        <div className="panel-head">
          <h2 id="offers-title">Mağaza təklifləri</h2>
          <div className="offer-filters">
            <label className="toggle">
              <input
                type="checkbox"
                checked={stockOnly}
                onChange={(e) => setStockOnly(e.target.checked)}
              />
              Yalnız stokda
            </label>
            <label className="toggle">
              <input type="checkbox" checked={free} onChange={(e) => setFree(e.target.checked)} />
              Pulsuz çatdırılma
            </label>
            <select
              aria-label="Taksit müddəti"
              value={term}
              onChange={(e) => setTerm(Number(e.target.value))}
            >
              {[3, 6, 12, 18, 24].map((m) => (
                <option key={m} value={m}>
                  {m} ay taksit
                </option>
              ))}
            </select>
            <select
              aria-label="Təklifləri sırala"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
            >
              <option value="price">Nağd qiymətə görə</option>
              <option value="installment">Taksit yekununa görə</option>
            </select>
          </div>
        </div>
        {offers.length ? (
          <ol className="offers">
            {visible.map((o, i) => {
              // Recorded offers only keep stores that are known and active.
              const s = c.stores.find((s) => s.id === o.storeId)!;
              const finance = o.installmentOptions?.find((x) => x.months === term);
              const months = finance?.months || (o.months === term ? o.months : 0);
              const total = finance?.total || (months ? o.installmentTotal : 0);
              const isBest = o.id === best?.id;
              const stale = now - Date.parse(o.checkedAt) > 86400000;
              return (
                <li
                  key={o.id}
                  className={
                    "offer" + (isBest ? " offer-best" : "") + (inStock(o) ? "" : " offer-off")
                  }
                >
                  <span className="offer-rank" aria-hidden="true">
                    {i + 1}
                  </span>
                  <div className="offer-store">
                    <StoreLogo store={s} />
                    {isBest && (
                      <span className="flag flag-best">
                        <Check size={12} aria-hidden="true" />
                        Ən ucuz
                      </span>
                    )}
                    {o.sponsored && <span className="flag flag-muted">Reklam</span>}
                  </div>
                  <ul className="offer-terms">
                    <li className={o.stockKnown === false ? "warn" : o.stock ? "ok" : "bad"}>
                      {o.stockKnown === false ? (
                        <HelpCircle size={14} aria-hidden="true" />
                      ) : o.stock ? (
                        <CheckCircle2 size={14} aria-hidden="true" />
                      ) : (
                        <XCircle size={14} aria-hidden="true" />
                      )}
                      {o.stockKnown === false
                        ? "Stoku mağazada yoxla"
                        : o.stock
                          ? "Stokda var"
                          : "Stokda yoxdur"}
                    </li>
                    <li>
                      <Truck size={14} aria-hidden="true" />
                      {o.shippingKnown === false
                        ? "Çatdırılma dəqiqləşdirilməlidir"
                        : o.shipping
                          ? "Çatdırılma " + money(o.shipping)
                          : "Pulsuz çatdırılma"}
                    </li>
                    {o.warranty && (
                      <li>
                        <ShieldCheck size={14} aria-hidden="true" />
                        {o.warranty}
                      </li>
                    )}
                    <li className={stale ? "warn" : ""}>
                      <Clock size={14} aria-hidden="true" />
                      <time dateTime={o.checkedAt}>{azDateTime(o.checkedAt)}</time>
                    </li>
                  </ul>
                  <div className="offer-credit">
                    {months > 0 ? (
                      <>
                        <b>
                          {money(finance?.monthly || total / months)} <small>× {months} ay</small>
                        </b>
                        <span>Yekun {money(total)}</span>
                      </>
                    ) : (
                      <span>{term} aylıq taksit göstərilməyib</span>
                    )}
                  </div>
                  <div className="offer-price">
                    <strong>{money(o.price)}</strong>
                    {o.shippingKnown !== false && o.shipping > 0 && (
                      <span>çatdırılma ilə {money(o.price + o.shipping)}</span>
                    )}
                    {best && !isBest && inStock(o) && o.price > best.price && (
                      <span>+{money(o.price - best.price)}</span>
                    )}
                  </div>
                  <a
                    className={"btn " + (isBest ? "btn-primary" : "btn-outline")}
                    href={o.demo ? undefined : o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => go(e, o)}
                  >
                    Mağazaya keç <ArrowUpRight size={16} aria-hidden="true" />
                  </a>
                </li>
              );
            })}
          </ol>
        ) : (
          <Empty
            icon={StoreIcon}
            title="Uyğun təklif yoxdur"
            text="Şəhəri və ya təklif filtrlərini dəyiş."
          />
        )}
        {offers.length > 6 && (
          <button className="btn btn-ghost panel-more" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Daha az göstər" : `Qalan ${offers.length - 6} təklifi göstər`}
          </button>
        )}
        <p className="panel-note">
          Sıra nağd qiymətə görədir; reklam etiketi sıranı dəyişmir. Taksit və zəmanət şərtlərini
          mağazada təsdiqlə.
        </p>
      </section>

      <div className="pd-cols">
        <section className="panel" id="tarixce" aria-labelledby="history-title">
          <div className="panel-head">
            <h2 id="history-title">Qiymət tarixçəsi</h2>
            <div className="segmented">
              {[30, 90, 365].map((d) => (
                <button
                  key={d}
                  className={period === d ? "on" : ""}
                  aria-pressed={period === d}
                  onClick={() => setPeriod(d)}
                >
                  {d === 365 ? "1 il" : d + " gün"}
                </button>
              ))}
            </div>
          </div>
          {history.length ? (
            <>
              <div className="stats">
                <div>
                  <span>Ən aşağı</span>
                  <b className="ok">{money(hMin)}</b>
                </div>
                <div>
                  <span>Ən yüksək</span>
                  <b>{money(hMax)}</b>
                </div>
                <div>
                  <span>Orta</span>
                  <b>{money(history.reduce((s, h) => s + h.price, 0) / history.length)}</b>
                </div>
              </div>
              {history.length < 2 ? (
                <p className="panel-note">
                  Bu dövr üçün hələlik bir qiymət qeydi var ({azDate(history[0].date)}). Qrafik
                  ikinci qeyddən sonra görünəcək.
                </p>
              ) : (
                <PriceChart points={history} />
              )}
            </>
          ) : (
            <Empty
              title="Tarixçə hələ toplanmayıb"
              text="Qiymətlər yoxlandıqca qeydlər burada görünəcək."
            />
          )}
          <button className="btn btn-outline" onClick={() => alert(p)}>
            <Bell size={16} aria-hidden="true" /> Hədəf qiymət qur
          </button>
        </section>

        {specs.length > 0 && (
          <section className="panel" id="xususiyyetler" aria-labelledby="specs-title">
            <div className="panel-head">
              <h2 id="specs-title">Xüsusiyyətlər</h2>
            </div>
            {p.description && <p className="pd-description">{p.description}</p>}
            <dl className="specs">
              {specs.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>

      <section className="panel" id="reyler" aria-labelledby="reviews-title">
        <div className="panel-head">
          <h2 id="reviews-title">İstifadəçi rəyləri</h2>
          {reviews.length > 0 && (
            <span className="rating">
              <Star size={18} fill="currentColor" aria-hidden="true" />
              {average.toFixed(1).replace(".", ",")} / 5
            </span>
          )}
        </div>
        <div className="reviews">
          <div>
            {reviews.map((r) => (
              <article className="review" key={r.id}>
                <header>
                  <b>{r.name}</b>
                  <span className="stars" aria-label={r.rating + " ulduz"}>
                    {"★".repeat(r.rating)}
                    <i>{"★".repeat(5 - r.rating)}</i>
                  </span>
                  <time dateTime={r.date}>{azDate(r.date)}</time>
                </header>
                <p>{r.text}</p>
              </article>
            ))}
            {!reviews.length && (
              <p className="panel-note">Hələ rəy yoxdur. İlk təcrübəni sən paylaş.</p>
            )}
          </div>
          <form
            className="form review-form"
            onSubmit={async (e) => {
              e.preventDefault();
              if (sample) return setToast("Nümunə səhifədə rəy göndərilmir.");
              if (!needUser()) return;
              const form = e.currentTarget;
              setSending(true);
              try {
                await api("reviews", {
                  productId: p.id,
                  rating,
                  text: String(new FormData(form).get("text")),
                });
                setToast("Rəyin yoxlanışa göndərildi.");
                form.reset();
              } catch (error) {
                setToast(errorMessage(error));
              }
              setSending(false);
            }}
          >
            <b>Rəy yaz</b>
            <div className="star-input" role="radiogroup" aria-label="Qiymətləndirmə">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  type="button"
                  key={n}
                  role="radio"
                  aria-checked={rating === n}
                  aria-label={n + " ulduz"}
                  className={n <= rating ? "on" : ""}
                  onClick={() => setRating(n)}
                >
                  <Star size={24} fill="currentColor" />
                </button>
              ))}
            </div>
            <textarea
              name="text"
              minLength={10}
              maxLength={2000}
              required
              aria-label="Təcrübən"
              placeholder="Məhsul haqqında təcrübəni paylaş…"
            />
            <button className="btn btn-primary" disabled={sending}>
              Rəyi göndər <Send size={16} aria-hidden="true" />
            </button>
            <small>Rəylər yoxlanıldıqdan sonra yayımlanır.</small>
          </form>
        </div>
      </section>

      {similar.length > 0 && (
        <section className="section" aria-labelledby="similar-title">
          <div className="section-head">
            <h2 id="similar-title">Oxşar məhsullar</h2>
            <a href={"/kateqoriya/" + p.category}>
              {category?.name} <ChevronRight size={15} />
            </a>
          </div>
          <Rail label="Oxşar məhsullar">
            {similar.map((x) => (
              <ProductCard key={x.id} p={x} />
            ))}
          </Rail>
        </section>
      )}

      {shown && (
        <div className="buybar">
          <div>
            <small>
              {bestStore?.name}
              {available.length > 1 ? " · ən ucuz" : ""}
            </small>
            <strong>{money(shown.price)}</strong>
          </div>
          <a
            className="btn btn-primary"
            href={shown.demo ? undefined : shown.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => go(e, shown)}
          >
            Mağazaya keç <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </div>
      )}
    </div>
  );
}
