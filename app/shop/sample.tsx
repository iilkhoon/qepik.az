"use client";
// /testmehsul, /testsoyuducu, …: fixed demonstration products for screenshots and filming. The
// products and photos are real; every store name, price and review is invented, no link leaves
// the page and nothing is written to the database.
import { useMemo, useState } from "react";
import type { Offer, Point, Product, Review, Store } from "../../lib/catalog";
import ProductDetail from "./product";
import { ShopContext, useShop } from "./context";

type Sample = {
  product: Omit<Product, "active" | "featured">;
  // Lowest price; the other stores sit above it by these steps.
  price: number;
  steps: number[];
  // Days on sale and how far above today's price it started.
  days: number;
  launch: number;
  reviews: [string, number, string][];
};

export const SAMPLES: Record<string, Sample> = {
  testmehsul: {
    product: {
      id: "testmehsul-iphone-duo",
      name: "Apple iPhone Duo 256 GB",
      brand: "Apple",
      category: "telefon",
      variant: "256 GB · Star White",
      image: "/testmehsul/iphone-duo.jpg",
      description:
        "Apple-ın ilk qatlanan iPhone-u: açıq halda 7,6″, qapalı halda 5,4″ ekran, A20 Pro çipi və 5-ci dərəcəli titan korpus.",
      specs: {
        "Daxili ekran": "7,6″ Super Retina XDR",
        "Xarici ekran": "5,4″ Super Retina XDR",
        Prosessor: "A20 Pro",
        Yaddaş: "256 GB",
        Kamera: "48 MP Fusion + 48 MP Ultra Wide",
        Korpus: "Grade 5 titan",
        Dizayn: "Kitab tipli qatlanan",
        Rənglər: "Star White, Night Sky",
      },
    },
    price: 4349,
    steps: [0, 40, 50, 80, 110, 150, 200],
    days: 24,
    launch: 340,
    reviews: [
      [
        "Aysel M.",
        5,
        "Açanda planşet olur, bağlayanda cibə girir. Ən ucuz mağazanı burada tapdım.",
      ],
      ["Rauf Q.", 4, "Ekran əla, qatlanma yeri demək olar görünmür. Qutuda adapter yoxdur."],
      ["Nigar H.", 5, "Taksitlə götürdüm, mağazalar arasında fərq 200 ₼ idi."],
    ],
  },
  testsoyuducu: {
    product: {
      id: "testsoyuducu-haier",
      name: "Soyuducu Haier CEF534CSRG",
      brand: "Haier",
      category: "ev",
      variant: "Gümüşü · alt dondurucu",
      image: "/testmehsul/soyuducu.jpg",
      description:
        "İki kameralı, dondurucusu aşağıda yerləşən soyuducu; qapıda elektron idarəetmə paneli.",
      specs: {
        Tip: "İki kameralı, alt dondurucu",
        Quraşdırma: "Sərbəst dayanan",
        İdarəetmə: "Elektron panel (qapıda)",
        Rəng: "Gümüşü",
        Brend: "Haier",
        Model: "CEF534CSRG",
      },
    },
    price: 1899,
    steps: [0, 30, 45, 70, 99, 120, 160],
    days: 120,
    launch: 260,
    reviews: [
      ["Elvin S.", 5, "Səssiz işləyir, içi geniş. Çatdırılma pulsuz oldu."],
      ["Leyla R.", 4, "Dizaynı gözəldir, qapının yönünü dəyişmək üçün usta çağırdım."],
    ],
  },
  testkombi: {
    product: {
      id: "testkombi-midea",
      name: "Kombi Midea L1PB24-C28WM-KIT Wi-Fi",
      brand: "Midea",
      category: "ev",
      variant: "24 kVt · Wi-Fi",
      image: "/testmehsul/kombi.jpg",
      description:
        "Divar tipli 24 kVt kombi; telefondan Wi-Fi ilə idarə olunur, quraşdırma dəsti ilə.",
      specs: {
        Güc: "24 kVt",
        Tip: "Divar kombisi",
        İdarəetmə: "Wi-Fi, mobil tətbiq",
        Dəst: "KIT (quraşdırma dəsti)",
        Brend: "Midea",
      },
    },
    price: 849,
    steps: [0, 20, 35, 49, 60, 79, 110],
    days: 90,
    launch: 120,
    reviews: [
      ["Tural Ə.", 5, "Qışdan əvvəl aldım, telefondan yandırmaq çox rahatdır."],
      ["Səbinə K.", 4, "Yaxşı isidir, quraşdırma üçün ayrıca ödədim."],
    ],
  },
  testpaltaryuyan: {
    product: {
      id: "testpaltaryuyan-samsung",
      name: "Paltaryuyan Samsung WW80A6S28AN/LP",
      brand: "Samsung",
      category: "ev",
      variant: "8 kq · Qrafit",
      image: "/testmehsul/paltaryuyan.jpg",
      description:
        "Ön yükləməli, 8 kq tutumlu paltaryuyan maşın; rəqəmsal displey və döndərmə düyməsi.",
      specs: {
        Tutum: "8 kq",
        Yükləmə: "Ön yükləmə",
        Quraşdırma: "Sərbəst dayanan",
        İdarəetmə: "Displey və döndərmə düyməsi",
        Rəng: "Qrafit",
        Brend: "Samsung",
      },
    },
    price: 1149,
    steps: [0, 25, 40, 59, 80, 99, 130],
    days: 120,
    launch: 180,
    reviews: [
      ["Kamran H.", 5, "Səssizdir, sıxma zamanı titrəmir. Ən ucuz qiymət 1 149 ₼ idi."],
      ["Günay M.", 5, "Proqramları çoxdur, uşaq paltarları üçün əladır."],
      ["Orxan B.", 4, "Yaxşıdır, amma qapı bir az ağır açılır."],
    ],
  },
  testqabyuyan: {
    product: {
      id: "testqabyuyan-bosch",
      name: "Qabyuyan Bosch SMS46NI01B",
      brand: "Bosch",
      category: "ev",
      variant: "60 sm · Paslanmaz polad",
      image: "/testmehsul/qabyuyan.jpg",
      description: "60 sm enində, sərbəst dayanan qabyuyan maşın; Bosch Serie 4 seriyası.",
      specs: {
        En: "60 sm",
        Quraşdırma: "Sərbəst dayanan",
        Seriya: "Serie 4",
        Rəng: "Paslanmaz polad",
        Brend: "Bosch",
      },
    },
    price: 1399,
    steps: [0, 30, 50, 69, 90, 119, 150],
    days: 120,
    launch: 210,
    reviews: [
      ["Fidan A.", 5, "Qabları tam quru çıxarır, su sərfi azdır."],
      ["Ramil N.", 4, "Yaxşı yuyur, proqram bir az uzun çəkir."],
    ],
  },
};

// [id, name, logo, colour, shipping, warranty, stock, interest-free months]
const STORES: [string, string, string, string, number, string, boolean, number][] = [
  ["nm-ulduz", "Ulduz Mobile", "ulduz", "#ff6a00", 0, "1 il rəsmi", true, 12],
  ["nm-xezer", "Xəzər Texno", "xezer", "#0a6cff", 0, "1 il", true, 18],
  ["nm-gunes", "Günəş Store", "gunes", "#1d0a22", 5, "1 il rəsmi", true, 6],
  ["nm-bulud", "Bulud Elektronika", "bulud", "#14a06a", 0, "2 il", true, 12],
  ["nm-simsim", "SimSim Shop", "simsim", "#7b3fe4", 4, "1 il", true, 0],
  ["nm-gence", "Gəncə Smart", "gence", "#132a4f", 6, "6 ay", true, 24],
  ["nm-mega", "Mega Bazar", "mega", "#00a3b4", 0, "1 il", false, 12],
];

function sampleCatalog(sample: Sample, now: number) {
  const pid = sample.product.id;
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60000).toISOString();
  const stores: Store[] = STORES.map(([id, name, logo, color]) => ({
    id,
    name,
    domain: "numune.az",
    color,
    logo: "/testmehsul/logos/" + logo + ".svg",
    active: true,
    description: "Nümunə mağaza",
  }));
  const offers: Offer[] = STORES.map(([id, , , , shipping, warranty, stock, months], i) => {
    const price = sample.price + sample.steps[i];
    // Interest-free up to `months`, a small mark-up beyond it, nothing when the store has none.
    const installmentOptions = months
      ? [3, 6, 12, 18, 24].map((m) => {
          const total = Math.round(price * (m <= months ? 1 : 1 + (m - months) * 0.006));
          return { months: m, total, monthly: Math.round((total / m) * 100) / 100 };
        })
      : [];
    return {
      id: "offer-" + pid + "-" + id,
      productId: pid,
      storeId: id,
      price,
      shipping,
      shippingKnown: true,
      stock,
      stockKnown: true,
      months,
      installmentTotal: installmentOptions.find((o) => o.months === months)?.total || 0,
      installmentOptions,
      warranty,
      url: "#teklifler",
      demo: false,
      checkedAt: iso(6 + i * 7),
      cities: ["Bakı", "Sumqayıt", "Gəncə"],
      sponsored: false,
    };
  });
  // Launch price, then a gentle fall with one short promotion.
  const history: Point[] = [];
  const step = Math.max(2, Math.round(sample.days / 14));
  for (let d = sample.days; d >= 0; d -= step) {
    const fall = Math.round((sample.launch * d) / sample.days);
    const wave = Math.round(Math.sin(d / 3) * sample.price * 0.006);
    const promo = d === step * 4 ? Math.round(sample.launch * 0.4) : 0;
    history.push({
      id: "h-" + pid + "-" + d,
      productId: pid,
      price: d === 0 ? sample.price : sample.price + fall + wave - promo,
      date: new Date(now - d * 86400000).toISOString().slice(0, 10),
      demo: false,
    });
  }
  const reviews: Review[] = sample.reviews.map(([name, rating, text], i) => ({
    id: "r-" + pid + "-" + i,
    productId: pid,
    name,
    rating,
    text,
    status: "approved",
    date: iso(60 * 24 * (3 + i * 5)),
  }));
  return { stores, offers, history, reviews };
}

export default function SamplePage({ slug }: { slug: string }) {
  const shop = useShop();
  const sample = SAMPLES[slug];
  const product: Product = { ...sample.product, active: true, featured: true };
  // Rounded to the hour so the server and the browser render the same dates.
  const [now] = useState(() => Math.floor(Date.now() / 3600000) * 3600000);
  const value = useMemo(() => {
    const data = sampleCatalog(sample, now);
    const note = () => shop.setToast("Bu nümunə səhifədir.");
    const others = shop.c.products.filter((p) => p.id !== product.id);
    return {
      ...shop,
      c: {
        ...shop.c,
        products: [product, ...others],
        stores: [...data.stores, ...shop.c.stores],
        offers: [...data.offers, ...shop.c.offers],
        history: [...data.history, ...shop.c.history],
        reviews: data.reviews,
        similar: [
          ...others.filter((p) => p.category === product.category).map((p) => p.id),
          ...(shop.c.drops || []),
        ]
          .filter((id, i, all) => all.indexOf(id) === i)
          .slice(0, 10),
      },
      favorite: note,
      alert: note,
      compare: note,
      personal: { ...shop.personal, alerts: [] },
    };
    // `product` is rebuilt from `sample` each render; `sample` is the stable input.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shop, now, sample]);
  return (
    <ShopContext.Provider value={value}>
      <p className="sample-note" role="note">
        Nümunə səhifə — mağaza adları və qiymətlər şərtidir.
      </p>
      <ProductDetail p={product} sample />
    </ShopContext.Provider>
  );
}
