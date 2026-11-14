"use client";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Eye,
  EyeOff,
  Heart,
  LogOut,
  Plus,
  Scale,
  Search,
  Settings2,
  Store as StoreIcon,
  Trash2,
  X,
} from "lucide-react";
import { categories, money, priceOf, validOffers } from "../../lib/catalog";
import { api, Empty, errorMessage, StoreLogo } from "../ui";
import { ProductImage } from "../../components/product-image";
import { azDate, azNumber } from "../../components/format";
import { SIGN_IN_PATH, SIGN_UP_PATH } from "../auth-headers";
import { useShop } from "./context";

export const CITIES = [
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
];

export function Stores() {
  const { c } = useShop();
  const [query, setQuery] = useState("");
  const active = c.stores.filter((s) => s.active);
  const connected = active.filter((s) => c.storeStats[s.id]?.count).length;
  const list = active
    .filter((s) =>
      (s.name + " " + s.domain).toLocaleLowerCase("az").includes(query.toLocaleLowerCase("az")),
    )
    .sort(
      (a, b) =>
        (c.storeStats[b.id]?.count || 0) - (c.storeStats[a.id]?.count || 0) ||
        // Plain code-point order: locale collation differs between the server and browsers.
        (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
    );
  return (
    <div className="page-block">
      <header className="page-head">
        <div>
          <h1>Mağazalar</h1>
          <p>
            {azNumber(active.length)} yerli mağaza · {azNumber(connected)} mağazanın qiymətləri
            qoşulub
          </p>
        </div>
        <a className="btn btn-primary" href="/magaza-qeydiyyat">
          Mağazanı əlavə et <Plus size={18} aria-hidden="true" />
        </a>
      </header>
      <label className="field-search">
        <Search size={19} aria-hidden="true" />
        <input
          aria-label="Mağaza axtar"
          placeholder="Mağaza adı və ya domen axtar"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </label>
      <div className="stores">
        {list.map((s) => {
          const count = c.storeStats[s.id]?.count || 0;
          return (
            <a
              key={s.id}
              className={"store" + (count ? "" : " store-off")}
              href={"/magazalar/" + s.id}
            >
              <span className="store-logo">
                <StoreLogo store={s} />
              </span>
              <b>{s.name}</b>
              <small>{s.domain}</small>
              <span className={"flag " + (count ? "flag-best" : "flag-muted")}>
                {count ? azNumber(count) + " məhsul" : "Qiymətlər qoşulmayıb"}
              </span>
            </a>
          );
        })}
      </div>
      {!list.length && (
        <Empty icon={StoreIcon} title="Mağaza tapılmadı" text="Adın yazılışını yoxla." />
      )}
    </div>
  );
}

export function Compare() {
  const { c, comp, compare } = useShop();
  const items = comp.flatMap((id) => c.products.find((p) => p.id === id) || []);
  const keys = [...new Set(items.flatMap((p) => Object.keys(p.specs)))];
  const prices = items.map((p) => priceOf(c, p.id));
  const lowest = Math.min(...prices.filter((v) => v > 0));
  return (
    <div className="page-block">
      <header className="page-head">
        <div>
          <h1>Müqayisə</h1>
          <p>Eyni vaxtda 4 məhsula qədər xüsusiyyət və qiyməti yan-yana gör.</p>
        </div>
        <a className="btn btn-outline" href="/kataloq">
          Məhsul əlavə et <Plus size={17} aria-hidden="true" />
        </a>
      </header>
      {items.length ? (
        <div className="compare">
          <table>
            <thead>
              <tr>
                <td />
                {items.map((p) => (
                  <th key={p.id} scope="col">
                    <button
                      className="compare-remove"
                      onClick={() => compare(p)}
                      aria-label={p.name + " müqayisədən sil"}
                    >
                      <X size={16} />
                    </button>
                    <a href={"/mehsul/" + p.id}>
                      <ProductImage src={p.image} alt="" width={140} height={140} />
                      <b>{p.name}</b>
                    </a>
                    <small>{p.variant}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Ən aşağı qiymət</th>
                {items.map((p, i) => (
                  <td key={p.id} className={prices[i] === lowest ? "compare-best" : ""}>
                    <strong>{prices[i] ? money(prices[i]) : "—"}</strong>
                  </td>
                ))}
              </tr>
              <tr>
                <th scope="row">Stokda olan mağaza</th>
                {items.map((p) => (
                  <td key={p.id}>{validOffers(c, p.id).length}</td>
                ))}
              </tr>
              <tr>
                <th scope="row">Brend</th>
                {items.map((p) => (
                  <td key={p.id} lang="en">
                    {p.brand}
                  </td>
                ))}
              </tr>
              {keys.map((key) => {
                const values = items.map((p) => p.specs[key] || "—");
                return (
                  <tr key={key} className={new Set(values).size > 1 ? "compare-diff" : ""}>
                    <th scope="row">{key}</th>
                    {values.map((v, i) => (
                      <td key={items[i].id}>{v}</td>
                    ))}
                  </tr>
                );
              })}
              <tr>
                <td />
                {items.map((p) => (
                  <td key={p.id}>
                    <a className="btn btn-primary" href={"/mehsul/" + p.id}>
                      Qiymətlərə bax
                    </a>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          icon={Scale}
          title="Müqayisə siyahın boşdur"
          text="Məhsul kartındakı tərəzi düyməsi ilə ilk məhsulu əlavə et."
          action={
            <a className="btn btn-primary" href="/kataloq">
              Məhsullara bax
            </a>
          }
        />
      )}
    </div>
  );
}

export function Alerts() {
  const { c, city, personal, alert, act, refresh, session } = useShop();
  return (
    <div className="page-block">
      <header className="page-head">
        <div>
          <h1>Qiymət bildirişləri</h1>
          <p>Hədəf qiymətinə çatan məhsulları burada gör.</p>
        </div>
      </header>
      {personal.alerts.length ? (
        <div className="alerts">
          {personal.alerts.map((a) => {
            const p = c.products.find((p) => p.id === a.productId);
            if (!p) return null;
            const stocked = validOffers(c, p.id, city).length > 0;
            const current = priceOf(c, p.id);
            const reached = stocked && current <= a.target;
            return (
              <article className={"alert-row" + (reached ? " reached" : "")} key={p.id}>
                <ProductImage src={p.image} alt="" width={72} height={72} />
                <div>
                  <a href={"/mehsul/" + p.id}>{p.name}</a>
                  <p>
                    Hədəf <b>{money(a.target)}</b> · Hazırda <b>{money(current)}</b>
                  </p>
                  <span className={"flag " + (reached ? "flag-best" : "flag-muted")}>
                    {reached ? "Hədəfə çatıb" : stocked ? "Qiymət gözlənilir" : "Stok gözlənilir"}
                  </span>
                </div>
                <button className="btn btn-outline" onClick={() => alert(p)}>
                  Dəyiş
                </button>
                <button
                  className="icon-btn"
                  aria-label="Bildirişi sil"
                  onClick={() =>
                    act(async () => {
                      await api("personal", { kind: "alert", productId: p.id, remove: true });
                      await refresh();
                    }, "Bildiriş silindi.")
                  }
                >
                  <Trash2 size={18} />
                </button>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty
          icon={Bell}
          title="İlk qiymətini izləməyə başla"
          text={
            session.user
              ? "Məhsul səhifəsində istədiyin qiyməti yaz, hədəfə çatanda burada gör."
              : "Bildiriş qurmaq üçün hesabına daxil ol."
          }
          action={
            <a className="btn btn-primary" href={session.user ? "/kataloq" : SIGN_IN_PATH}>
              {session.user ? "Məhsul seç" : "Daxil ol"} <ArrowRight size={18} aria-hidden="true" />
            </a>
          }
        />
      )}
    </div>
  );
}

function Password({ name = "password", autoComplete }: { name?: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="password">
      <input
        name={name}
        type={show ? "text" : "password"}
        required
        minLength={autoComplete === "new-password" ? 8 : 1}
        maxLength={200}
        autoComplete={autoComplete}
      />
      <button
        type="button"
        aria-label={show ? "Şifrəni gizlət" : "Şifrəni göstər"}
        onClick={() => setShow(!show)}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </span>
  );
}

// Only same-site paths, never back into the sign-in pages themselves.
function safeReturn(value: string | null) {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  return [SIGN_IN_PATH, SIGN_UP_PATH].some((p) => value.startsWith(p)) ? "/" : value;
}

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  const { session, path } = useShop();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const back = safeReturn(new URLSearchParams(path.split("?")[1] || "").get("return_to"));
  const query = back === "/" ? "" : "?return_to=" + encodeURIComponent(back);
  useEffect(() => {
    if (session.user) window.location.replace(back);
  }, [session.user, back]);
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      if (mode === "register") {
        if (f.get("password") !== f.get("password2")) throw new Error("Şifrələr eyni deyil.");
        await api("auth/register", {
          name: f.get("name"),
          email: f.get("email"),
          phone: f.get("phone") || undefined,
          city: f.get("city") || undefined,
          password: f.get("password"),
          terms: f.get("terms") === "on",
        });
      } else await api("auth/login", { email: f.get("email"), password: f.get("password") });
      window.location.assign(back);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };
  return (
    <div className="auth">
      <div className="auth-side">
        <h2>{mode === "login" ? "Xoş gəldin." : "Qənaətə buradan başla."}</h2>
        <ul>
          <li>
            <Heart size={18} aria-hidden="true" /> Bəyəndiyin məhsulları saxla
          </li>
          <li>
            <Bell size={18} aria-hidden="true" /> Hədəf qiymət qur, düşəndə gör
          </li>
          <li>
            <Scale size={18} aria-hidden="true" /> Mağazaları yan-yana müqayisə et
          </li>
          <li>
            <StoreIcon size={18} aria-hidden="true" /> Mağazanı əlavə et və müraciətini izlə
          </li>
        </ul>
      </div>
      <form className="form auth-form" onSubmit={submit} noValidate={false}>
        <div className="auth-tabs">
          <a href={SIGN_IN_PATH + query} className={mode === "login" ? "on" : ""}>
            Daxil ol
          </a>
          <a href={SIGN_UP_PATH + query} className={mode === "register" ? "on" : ""}>
            Qeydiyyat
          </a>
        </div>
        <h1>{mode === "login" ? "Hesabına daxil ol" : "Yeni hesab yarat"}</h1>
        {mode === "register" && (
          <label>
            Ad və soyad
            <input name="name" required minLength={2} maxLength={80} autoComplete="name" />
          </label>
        )}
        <label>
          E-poçt
          <input
            name="email"
            type="email"
            required
            maxLength={200}
            autoComplete="email"
            inputMode="email"
          />
        </label>
        {mode === "register" && (
          <div className="form-two">
            <label>
              Mobil nömrə <small>(istəyə bağlı)</small>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+994 50 123 45 67"
                pattern="(\+?994|0)?[ \-]?(10|12|50|51|55|60|70|77|99)[ \-]?\d{3}[ \-]?\d{2}[ \-]?\d{2}"
                title="+994 XX XXX XX XX"
              />
            </label>
            <label>
              Şəhər
              <select name="city" defaultValue="Bakı">
                {CITIES.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
          </div>
        )}
        <label>
          Şifrə
          <Password autoComplete={mode === "login" ? "current-password" : "new-password"} />
          {mode === "register" && <small>Ən azı 8 simvol, hərf və rəqəm.</small>}
        </label>
        {mode === "register" && (
          <>
            <label>
              Şifrəni təkrarla
              <Password name="password2" autoComplete="new-password" />
            </label>
            <label className="toggle">
              <input type="checkbox" name="terms" required />
              <span>
                İstifadə şərtlərini və məlumatlarımın hesab üçün saxlanmasını qəbul edirəm.
              </span>
            </label>
          </>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary btn-lg" disabled={busy}>
          {busy ? "Gözlə…" : mode === "login" ? "Daxil ol" : "Hesab yarat"}
          <ArrowRight size={18} aria-hidden="true" />
        </button>
        <p className="auth-switch">
          {mode === "login" ? "Hesabın yoxdur? " : "Artıq hesabın var? "}
          <a className="link" href={(mode === "login" ? SIGN_UP_PATH : SIGN_IN_PATH) + query}>
            {mode === "login" ? "Qeydiyyatdan keç" : "Daxil ol"}
          </a>
        </p>
      </form>
    </div>
  );
}

type MyApplication = { id: string; company: string; website: string; status: string; date: string };
const statusText: Record<string, string> = {
  pending: "Yoxlanışdadır",
  approved: "Təsdiqlənib",
  rejected: "Rədd edilib",
};

export function Account() {
  const { session, personal, comp } = useShop();
  const [apps, setApps] = useState<MyApplication[]>([]);
  const signedIn = !!session.user;
  useEffect(() => {
    if (!signedIn) return;
    api<{ applications: MyApplication[] }>("applications/mine").then(
      (r) => setApps(r.applications),
      () => {},
    );
  }, [signedIn]);
  if (!session.user)
    return (
      <Empty
        title="Hesabına daxil ol"
        text="Seçilmişlər, bildirişlər və mağaza müraciətin hesabında saxlanılır."
        action={
          <a className="btn btn-primary" href={SIGN_IN_PATH + "?return_to=/hesab"}>
            Daxil ol
          </a>
        }
      />
    );
  const logout = async () => {
    await api("auth/logout", {}).catch(() => {});
    window.location.assign("/");
  };
  return (
    <div className="page-block account">
      <header className="page-head">
        <div className="account-who">
          <span className="avatar" aria-hidden="true">
            {session.user.name.trim().charAt(0).toLocaleUpperCase("az")}
          </span>
          <div>
            <h1>{session.user.name}</h1>
            <p>
              {session.user.email}
              {session.user.phone ? " · " + session.user.phone : ""}
            </p>
          </div>
        </div>
        <button className="btn btn-outline" onClick={logout}>
          <LogOut size={17} aria-hidden="true" /> Çıxış
        </button>
      </header>
      <div className="tiles">
        <a href="/secilmisler">
          <Heart size={24} aria-hidden="true" />
          <b>{personal.favorites.length}</b>
          <span>Seçilmiş məhsul</span>
        </a>
        <a href="/bildirisler">
          <Bell size={24} aria-hidden="true" />
          <b>{personal.alerts.length}</b>
          <span>Qiymət bildirişi</span>
        </a>
        <a href="/muqayise">
          <Scale size={24} aria-hidden="true" />
          <b>{comp.length}</b>
          <span>Müqayisədə</span>
        </a>
        {session.admin && (
          <a href="/admin">
            <Settings2 size={24} aria-hidden="true" />
            <b>Admin</b>
            <span>İdarəetmə paneli</span>
          </a>
        )}
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>Mağaza müraciətlərin</h2>
          <a className="btn btn-outline" href="/magaza-qeydiyyat">
            Mağaza əlavə et <Plus size={16} aria-hidden="true" />
          </a>
        </div>
        {apps.length ? (
          <ul className="apps">
            {apps.map((a) => (
              <li key={a.id}>
                <div>
                  <b>{a.company}</b>
                  <small>
                    {a.website.replace(/^https:\/\//, "")} · {azDate(a.date)}
                  </small>
                </div>
                <span className={"flag " + (a.status === "approved" ? "flag-best" : "flag-muted")}>
                  {statusText[a.status] || a.status}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel-note">Hələ müraciət göndərməmisən.</p>
        )}
      </section>
    </div>
  );
}

const checks = (form: FormData, name: string) => form.getAll(name).map(String);

export function MerchantForm() {
  const { act, session } = useShop();
  const [done, setDone] = useState(false),
    [busy, setBusy] = useState(false),
    [feedType, setFeedType] = useState("sitemap");
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    const ok = await act(() =>
      api("applications", {
        company: f.get("company"),
        legalName: f.get("legalName"),
        legalForm: f.get("legalForm"),
        voen: f.get("voen"),
        contact: f.get("contact"),
        email: f.get("email"),
        phone: f.get("phone"),
        website: f.get("website"),
        categories: checks(f, "categories"),
        cities: checks(f, "cities"),
        delivery: checks(f, "delivery"),
        payment: checks(f, "payment"),
        feedType: f.get("feedType"),
        feedUrl: f.get("feedUrl") || "",
        productCount: f.get("productCount"),
        note: f.get("note") || "",
      }),
    );
    if (ok) setDone(true);
    setBusy(false);
  };
  return (
    <div className="merchant">
      <div className="merchant-pitch">
        <h1>
          Mağazanı <span>alıcının axtardığı yerdə</span> göstər.
        </h1>
        <p>
          Qəpik məhsul satmır: alıcı sənin saytına keçir və alışı orada tamamlayır. Qoşulma
          pulsuzdur.
        </p>
        <ol>
          <li>
            <b>Müraciət göndər</b>
            <span>Şirkət, VÖEN və saytının məlumatlarını yaz.</span>
          </li>
          <li>
            <b>Kataloqu qoşaq</b>
            <span>XML/JSON feed, sayt xəritəsi və ya açıq kataloq ilə.</span>
          </li>
          <li>
            <b>Qiymətlərin görünsün</b>
            <span>Məhsulların eyni modelin digər təklifləri ilə yanaşı çıxır.</span>
          </li>
        </ol>
      </div>
      {done ? (
        <div className="panel">
          <Empty
            icon={CheckCircle2}
            title="Müraciətin qəbul edildi"
            text="Məlumatlar yoxlanılır. Vəziyyəti hesabındakı “Mağaza müraciətlərin” bölməsindən izlə."
            action={
              <a className="btn btn-primary" href="/hesab">
                Hesabıma keç
              </a>
            }
          />
        </div>
      ) : !session.user ? (
        <div className="panel">
          <Empty
            icon={StoreIcon}
            title="Əvvəlcə hesab yarat"
            text="Müraciət hesabına bağlanır ki, vəziyyətini izləyə və sonradan mağazanı idarə edə biləsən."
            action={
              <div className="empty-actions">
                <a className="btn btn-primary" href={SIGN_UP_PATH + "?return_to=/magaza-qeydiyyat"}>
                  Qeydiyyatdan keç
                </a>
                <a className="btn btn-outline" href={SIGN_IN_PATH + "?return_to=/magaza-qeydiyyat"}>
                  Daxil ol
                </a>
              </div>
            }
          />
        </div>
      ) : (
        <form className="form panel merchant-form" onSubmit={submit}>
          <fieldset>
            <legend>1. Şirkət</legend>
            <div className="form-two">
              <label>
                Mağazanın adı
                <input
                  name="company"
                  required
                  minLength={2}
                  maxLength={150}
                  placeholder="Məsələn, Texno Bakı"
                />
              </label>
              <label>
                Hüquqi ad
                <input
                  name="legalName"
                  required
                  minLength={2}
                  maxLength={200}
                  placeholder="“Texno Bakı” MMC"
                />
              </label>
            </div>
            <div className="form-two">
              <label>
                Hüquqi forma
                <select name="legalForm" defaultValue="mmc">
                  <option value="mmc">MMC</option>
                  <option value="fiziki">Fiziki şəxs (fərdi sahibkar)</option>
                  <option value="asc">ASC / QSC</option>
                  <option value="diger">Digər</option>
                </select>
              </label>
              <label>
                VÖEN
                <input
                  name="voen"
                  required
                  inputMode="numeric"
                  pattern="[0-9]{10}"
                  maxLength={10}
                  placeholder="10 rəqəm"
                  title="VÖEN 10 rəqəmdən ibarətdir"
                />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>2. Əlaqə</legend>
            <label>
              Əlaqədar şəxs
              <input
                name="contact"
                required
                minLength={2}
                maxLength={120}
                defaultValue={session.user.name}
              />
            </label>
            <div className="form-two">
              <label>
                E-poçt
                <input name="email" type="email" required defaultValue={session.user.email} />
              </label>
              <label>
                Telefon
                <input
                  name="phone"
                  type="tel"
                  required
                  inputMode="tel"
                  placeholder="+994 50 123 45 67"
                  defaultValue={session.user.phone || ""}
                  pattern="(\+?994|0)?[ \-]?(10|12|50|51|55|60|70|77|99)[ \-]?\d{3}[ \-]?\d{2}[ \-]?\d{2}"
                  title="+994 XX XXX XX XX"
                />
              </label>
            </div>
          </fieldset>
          <fieldset>
            <legend>3. Mağaza və kataloq</legend>
            <label>
              Veb-sayt
              <input
                name="website"
                type="url"
                required
                pattern="https://.*"
                placeholder="https://magazan.az"
              />
            </label>
            <div className="form-group">
              <span>Nə satırsan?</span>
              <div className="pick">
                {categories.map((cat) => (
                  <label key={cat.id}>
                    <input type="checkbox" name="categories" value={cat.id} />
                    <span>{cat.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-two">
              <label>
                Məhsul sayı
                <select name="productCount" defaultValue="100-1000">
                  <option value="0-100">100-dək</option>
                  <option value="100-1000">100 – 1 000</option>
                  <option value="1000-10000">1 000 – 10 000</option>
                  <option value="10000+">10 000-dən çox</option>
                </select>
              </label>
              <label>
                Kataloq mənbəyi
                <select
                  name="feedType"
                  value={feedType}
                  onChange={(e) => setFeedType(e.target.value)}
                >
                  <option value="sitemap">Sayt xəritəsi (sitemap.xml)</option>
                  <option value="xml">XML feed (YML / Google Merchant)</option>
                  <option value="json">JSON feed / API</option>
                  <option value="csv">CSV / Excel faylı</option>
                  <option value="yoxdur">Bilmirəm, kömək lazımdır</option>
                </select>
              </label>
            </div>
            {feedType !== "yoxdur" && (
              <label>
                Feed və ya sitemap linki {feedType === "sitemap" && <small>(istəyə bağlı)</small>}
                <input
                  name="feedUrl"
                  type="url"
                  pattern="https://.*"
                  required={feedType !== "sitemap"}
                  placeholder="https://magazan.az/feed.xml"
                />
              </label>
            )}
          </fieldset>
          <fieldset>
            <legend>4. Çatdırılma və ödəniş</legend>
            <div className="form-group">
              <span>Çatdırılma şəhərləri</span>
              <div className="pick">
                {CITIES.map((v) => (
                  <label key={v}>
                    <input type="checkbox" name="cities" value={v} defaultChecked={v === "Bakı"} />
                    <span>{v}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <span>Çatdırılma üsulu</span>
              <div className="pick">
                {(
                  [
                    ["kuryer", "Kuryer"],
                    ["poct", "Poçt / Azərpoçt"],
                    ["magazadan", "Mağazadan təhvil"],
                    ["pulsuz", "Pulsuz çatdırılma var"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value}>
                    <input type="checkbox" name="delivery" value={value} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="form-group">
              <span>Ödəniş</span>
              <div className="pick">
                {(
                  [
                    ["nagd", "Nağd"],
                    ["kart", "Bank kartı"],
                    ["taksit", "Taksit kartı (Birkart, Tamkart, BolKart)"],
                    ["kredit", "Mağaza krediti"],
                    ["kocurme", "Köçürmə (hüquqi şəxs)"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value}>
                    <input
                      type="checkbox"
                      name="payment"
                      value={value}
                      defaultChecked={value === "nagd"}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <label>
              Əlavə məlumat <small>(istəyə bağlı)</small>
              <textarea
                name="note"
                maxLength={2000}
                placeholder="Filiallar, zəmanət şərtləri, iş saatları…"
              />
            </label>
          </fieldset>
          <label className="toggle">
            <input type="checkbox" required />
            <span>
              Məlumatların doğruluğunu təsdiqləyirəm və yoxlanış üçün saxlanmasına razıyam.
            </span>
          </label>
          <button className="btn btn-primary btn-lg" disabled={busy}>
            {busy ? "Göndərilir…" : "Müraciəti göndər"}
            <ArrowUpRight size={18} aria-hidden="true" />
          </button>
        </form>
      )}
    </div>
  );
}

export function InfoContent({ topic }: { topic: string }) {
  const content: Record<string, ReactNode> = {
    Haqqımızda: (
      <>
        <p>
          Qəpik Azərbaycan mağazalarındakı eyni məhsulun qiymətlərini müqayisə etmək üçün
          hazırlanıb. Qəpik məhsul satmır; alış seçdiyin mağazada tamamlanır.
        </p>
        <p>
          Qiymətlər mağazaların açıq kataloqlarından və rəsmi feed-lərindən toplanır. Mağazanın
          adının göstərilməsi rəsmi tərəfdaşlıq demək deyil.
        </p>
      </>
    ),
    "Nümunə təklif": (
      <p>
        Bu, mağazanın canlı təklifi deyil və alış linki kimi açılmır. Real qiymətlər mənbə linki və
        yoxlanma vaxtı ilə göstərilir.
      </p>
    ),
    "Sıralama qaydası": (
      <>
        <p>
          Təkliflər stokda olan eyni variant üzrə nağd qiymətə görə sıralanır. Şəhər seçimi
          mağazanın göstərdiyi çatdırılma ərazisinə tətbiq edilir.
        </p>
        <p>
          Taksit sıralaması aylıq ödənişə deyil, taksit üzrə tam yekuna əsaslanır. Reklam etiketi
          qiymət sırasını dəyişmir.
        </p>
      </>
    ),
    Məxfilik: (
      <>
        <p>
          Hesabın (ad, e-poçt, istəyə bağlı telefon), seçilmişlərin və qiymət bildirişlərin saytın
          öz bazasında saxlanılır. Şifrən açıq şəkildə saxlanmır.
        </p>
        <p>
          Müqayisə siyahısı və şəhər seçimi bu brauzerdə qalır. Qəpikdə ödəniş kartı məlumatı
          toplanmır. Məhsul şəkilləri mağazaların öz domenindən yüklənə bilər.
        </p>
      </>
    ),
  };
  return <div className="info">{content[topic] || content["Haqqımızda"]}</div>;
}

const guide = [
  [
    "Eyni məhsuldurmu?",
    "Model nömrəsi, yaddaş, rəng və region kodunu müqayisə et. Eyni adın arxasında fərqli variantlar ola bilər.",
  ],
  [
    "Son qiymət nə qədərdir?",
    "Nağd qiymətə çatdırılmanı əlavə et. Kupon və ya xüsusi kart şərti varsa, şərtsiz qiymətlə qarışdırma.",
  ],
  [
    "Aylıq ödəniş, yoxsa yekun?",
    "Aylıq məbləği ay sayına vur və komissiyaları əlavə et. Taksit kartının (Birkart, Tamkart, BolKart) şərti mağazaya görə dəyişir.",
  ],
  [
    "Endirim həqiqidirmi?",
    "Üstündən xətt çəkilmiş qiymətlə kifayətlənmə. Qiymət tarixçəsinə bax; məlumat toplanmayıbsa nəticə çıxarma.",
  ],
  [
    "Zəmanət kimdəndir?",
    "İstehsalçı, distribütor və ya mağaza zəmanətini dəqiqləşdir. Müddəti və servis ünvanını yazılı öyrən.",
  ],
  [
    "Mənbə nə vaxt yoxlanılıb?",
    "Qiymət və stok dəyişir. Son yoxlanma vaxtına bax və ödənişdən əvvəl mağazadakı yekunu təsdiqlə.",
  ],
];
export function Guide() {
  return (
    <div className="page-block">
      <header className="guide-hero">
        <h1>
          Yaxşı alış-veriş <span>yaxşı sualdan başlayır.</span>
        </h1>
        <p>Qiymət etiketindən kənara baxmağın qısa bələdçisi.</p>
      </header>
      <div className="guide">
        {guide.map(([title, text], i) => (
          <article key={title}>
            <span>{String(i + 1).padStart(2, "0")}</span>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </div>
      <div className="merchant-band">
        <div>
          <h2>İndi daha aydın seçim et.</h2>
        </div>
        <a className="btn btn-light" href="/kataloq">
          Məhsulları kəşf et <ArrowUpRight size={18} aria-hidden="true" />
        </a>
      </div>
    </div>
  );
}
