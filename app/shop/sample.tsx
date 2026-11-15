"use client";
// /testmehsul: a fixed demonstration product for screenshots and filming. Every store name below
// is invented, no link leaves the page and nothing is written to the database.
import { useMemo, useState } from "react";
import type { Offer, Point, Product, Review, Store } from "../../lib/catalog";
import ProductDetail from "./product";
import { ShopContext, useShop } from "./context";

export const SAMPLE_ID = "testmehsul-iphone-duo";

const product: Product = {
  id: SAMPLE_ID,
  name: "iPhone Duo 256 GB",
  brand: "Apple",
  category: "telefon",
  variant: "256 GB · Titan Qızılı",
  image: "/testmehsul/iphone-duo.svg",
  description:
    "Nümunə məhsul: iki kameralı, 6,3 düymlük ekranlı smartfon. Bu səhifə Qəpik-in məhsul görünüşünü nümayiş etdirmək üçündür; qiymətlər və mağazalar şərtidir.",
  specs: {
    Ekran: "6,3″ OLED, 120 Hz",
    Prosessor: "A19 Bionic",
    Yaddaş: "256 GB",
    "Operativ yaddaş": "8 GB",
    Kamera: "48 MP + 12 MP (Duo)",
    "Ön kamera": "12 MP",
    Batareya: "4 100 mAh, 30 Vt sürətli şarj",
    SIM: "Nano-SIM + eSIM",
    Rəng: "Titan Qızılı",
  },
  active: true,
  featured: true,
};

// [id, name, colour, price, shipping, warranty, stock, instalment months]
const sellers: [string, string, string, number, number, string, boolean, number][] = [
  ["nm-ulduz", "Ulduz Mobile", "#ff6a00", 2649, 0, "1 il rəsmi", true, 12],
  ["nm-xezer", "Xəzər Texno", "#0a7cff", 2689, 0, "1 il", true, 18],
  ["nm-nar", "NarTel Store", "#d81b54", 2699, 5, "1 il rəsmi", true, 6],
  ["nm-bulud", "Bulud Elektronika", "#1aa36f", 2729, 0, "2 il", true, 12],
  ["nm-simsim", "SimSim Shop", "#7b3fe4", 2749, 4, "1 il", true, 0],
  ["nm-gence", "Gəncə Smart", "#e0a100", 2779, 6, "6 ay", true, 24],
  ["nm-mega", "MegaMarket AZ", "#00a3b4", 2819, 0, "1 il", false, 12],
];

function sampleCatalog(now: number) {
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString();
  const stores: Store[] = sellers.map(([id, name, color]) => ({
    id,
    name,
    domain: "numune.az",
    color,
    active: true,
    description: "Nümunə mağaza",
  }));
  const offers: Offer[] = sellers.map(([id, , , price, shipping, warranty, stock, months], i) => {
    // Interest-free up to `months`, a small mark-up beyond it, nothing when the store has none.
    const installmentOptions = months
      ? [3, 6, 12, 18, 24].map((m) => {
          const total = Math.round(price * (m <= months ? 1 : 1 + (m - months) * 0.006));
          return { months: m, total, monthly: Math.round((total / m) * 100) / 100 };
        })
      : [];
    const main = installmentOptions.find((o) => o.months === months);
    return {
      id: "offer-" + id,
      productId: SAMPLE_ID,
      storeId: id,
      price,
      shipping,
      shippingKnown: true,
      stock,
      stockKnown: true,
      months,
      installmentTotal: main?.total || 0,
      installmentOptions,
      warranty,
      url: "#teklifler",
      demo: false,
      checkedAt: iso(6 + i * 7),
      cities: ["Bakı", "Sumqayıt", "Gəncə"],
      sponsored: false,
    };
  });
  // 120 days of a slowly falling price with a few promotions.
  const history: Point[] = [];
  for (let d = 120; d >= 0; d -= 4) {
    const wave = Math.round(Math.sin(d / 9) * 45);
    const price = 2649 + Math.round(d * 2.4) + wave + (d === 52 || d === 24 ? -110 : 0);
    history.push({
      id: "h-" + d,
      productId: SAMPLE_ID,
      price: d === 0 ? 2649 : price,
      date: new Date(now - d * 86400000).toISOString().slice(0, 10),
      demo: false,
    });
  }
  const reviews: Review[] = [
    [
      "Aysel M.",
      5,
      "Kamera çox yaxşıdır, batareya bir gün rahat gedir. Qəpik-də ən ucuz yeri tapdım.",
    ],
    ["Rauf Q.", 4, "Ekran parlaqdır, amma şarj adapteri qutuda yoxdur."],
    ["Nigar H.", 5, "Taksitlə götürdüm, mağazalar arasında fərq 170 ₼ idi."],
  ].map(([name, rating, text], i) => ({
    id: "r-" + i,
    productId: SAMPLE_ID,
    name: String(name),
    rating: Number(rating),
    text: String(text),
    status: "approved" as const,
    date: iso(60 * 24 * (3 + i * 5)),
  }));
  return { stores, offers, history, reviews };
}

export default function SamplePage() {
  const shop = useShop();
  // Rounded to the hour so the server and the browser render the same dates.
  const [now] = useState(() => Math.floor(Date.now() / 3600000) * 3600000);
  const value = useMemo(() => {
    const sample = sampleCatalog(now);
    const note = () => shop.setToast("Bu nümunə səhifədir.");
    return {
      ...shop,
      c: {
        ...shop.c,
        products: [product, ...shop.c.products.filter((p) => p.id !== SAMPLE_ID)],
        stores: [...sample.stores, ...shop.c.stores],
        offers: [...sample.offers, ...shop.c.offers],
        history: [...sample.history, ...shop.c.history],
        reviews: sample.reviews,
        similar: [
          ...(shop.c.drops || []),
          ...shop.c.products.filter((p) => p.category === "telefon").map((p) => p.id),
        ]
          .filter((id, i, all) => id !== SAMPLE_ID && all.indexOf(id) === i)
          .slice(0, 10),
      },
      favorite: note,
      alert: note,
      compare: note,
      personal: { ...shop.personal, alerts: [] },
    };
  }, [shop, now]);
  return (
    <ShopContext.Provider value={value}>
      <p className="sample-note" role="note">
        Nümunə səhifə — mağaza adları və qiymətlər şərtidir.
      </p>
      <ProductDetail p={product} sample />
    </ShopContext.Provider>
  );
}
