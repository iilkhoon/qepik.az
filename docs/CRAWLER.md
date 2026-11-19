# Qəpik toplayıcısı (`npm run crawl`)

Bütün qoşulmuş mağazalardan bütün məhsulları oxuyan müstəqil Node proqramı. Saytın öz adapterlərini (`lib/crawl-sources.ts`, `lib/extractor.ts`, `lib/listing-sources.ts`, `lib/html-products.ts`, `lib/technomania.ts`) dəyişmədən işlədir, ona görə nəticə saytın idxal işləri ilə eyni qaydalarla oxunur və eyni məhsul/təklif ID-ləri ilə yazılır.

Saytın daxili planlayıcısı (`lib/scheduler.ts`) hər dəqiqə bir neçə addım idxal edir. Toplayıcı isə bütün kataloqu bir dəfədə, paralel və qaldığı yerdən davam edərək çəkir: ilk doldurma, tam yeniləmə, ixrac və yoxlama üçün.

## İstifadə

```bash
npm run crawl                              # bütün mağazalar; yarımçıq iş qaldığı yerdən davam edir
npm run crawl -- --only baku,techbar       # seçilmiş mağazalar
npm run crawl -- --skip alinino,irshad     # bəzilərini çıxmaq
npm run crawl -- --max-minutes 60          # 60 dəqiqədən sonra saxla və çıx
npm run crawl -- --max-products 20         # hər mağazadan ən çox 20 məhsul səhifəsi (sınaq)
npm run crawl -- --fresh                   # vəziyyəti sıfırla (bloklanmış mənbəni yenidən yoxla)
npm run crawl -- --list                    # hər mağazanın son vəziyyəti
npm run crawl:import                       # nəticəni saytın bazasına yaz (data/qepik.sqlite)
DATABASE_PATH=/var/lib/qepik/qepik.sqlite npm run crawl:import   # serverdə
node scripts/export-seed.mjs               # bazanı seed/catalog.jsonl.gz snapshot-una yaz
```

Ctrl+C vəziyyəti saxlayıb çıxır; növbəti `npm run crawl` həmin yerdən davam edir. Bitmiş mağaza növbəti işdə yenidən oxunur (qiymətlər təzələnir).

Serverdə gecəlik tam yeniləmə üçün (məsələn, `crontab -u qepik -e`):

```text
15 3 * * * cd /opt/qepik && npm run crawl -- --out /var/lib/qepik/crawl --max-minutes 300 --quiet; npm run crawl:did -- --out /var/lib/qepik/crawl; DATABASE_PATH=/var/lib/qepik/qepik.sqlite npm run crawl:import -- --out /var/lib/qepik/crawl
```

`deploy/install.sh` yeniləmədə `/opt/qepik` qovluğunu təmizlədiyi üçün serverdə nəticələri `--out /var/lib/qepik/crawl` ilə verilənlər qovluğunda saxlayın.

## did.az təklifləri (`npm run crawl:did`)

Saytını oxuya bilmədiyimiz (bot yoxlaması) və ya çox yavaş oxuduğumuz (Crawl-delay) mağazaların təklifləri did.az-ın açıq kataloq API-sindən götürülür. did.az robots.txt-i `/api`-yə icazə verir, `llms.txt` və `ai-catalog.json` ilə kataloqu agentlər üçün açıq elan edir. Sorğular bir-bir, 1,5 s fasilə ilə gedir (~110 sorğu, ~3 dəqiqə).

```bash
npm run crawl:did                               # Kontakt, Birmarket, Music Gallery, Smart Electronics, Elit Optimal, Barkod, MyShops, Playroom, İrşad, Smarton, SeeHome
npm run crawl:did -- --stores kontakt,irshad    # seçilmiş mağazalar
npm run crawl:did -- --list                     # did.az-dakı mağazalar və bizdəki vəziyyəti
```

- Hər təklif mağazanın öz məhsul linki, nağd qiyməti, köhnə qiyməti və stoku ilə yazılır. Linki mağaza domenində olmayan, AZN olmayan sətir buraxılır. did.az şəkilləri kopyalanmır.
- 2026-11-19 sınağı: 11 mağazadan 49 578 təklif. Öz oxuduğumuz səhifələrlə ortaq 711 məhsulun qiyməti 100% eynidir.
- `crawl:import` hər mağaza üçün bir mənbə seçir: mağazanın faylı → öz saytının tam oxunuşu → did.az → yarımçıq oxunuş.

## Mağazanın göndərdiyi fayl (`npm run crawl:file`)

Saytı bot yoxlaması ilə qorunan və ya robots.txt-də uzun `Crawl-delay` olan mağaza öz məhsul siyahısını fayl kimi verə bilər. Onların heç bir qaydası dəyişmir.

```bash
npm run crawl:file -- --store kontakt --file kontakt.csv            # fayl
npm run crawl:file -- --store okim --file https://okim.az/feed.xml  # mağazanın verdiyi link
npm run crawl:file -- --store kontakt --file kontakt.csv --dry-run  # yalnız yoxla
npm run crawl:import -- --only kontakt                              # sayta yaz
```

- Formatlar: CSV (Excel-də "CSV UTF-8" kimi saxla; `,` `;` və ya tab), JSON, Google Merchant / Facebook kataloq XML-i, YML (1C/Bitrix). WooCommerce və OpenCart-ın standart məhsul ixracı olduğu kimi oxunur.
- Lazım olan sütunlar: **ad**, **qiymət** (AZN). Tövsiyə olunan: endirimli qiymət, stok (say və ya var/yoxdur), məhsul linki, şəkil linki, kod/SKU, marka, kateqoriya. Sütun adları azərbaycan, ingilis və rus dilində tanınır.
- Endirimli qiymət varsa təklif qiyməti odur. Qiyməti olmayan, AZN olmayan sətir buraxılır. Mağaza domenində olmayan linklər qəbul edilmir.
- Nəticə `data/crawl/files/<mağaza>/`-ya yazılır. Bu qovluq olduqca `crawl:import` həmin mağaza üçün oxunmuş səhifələri yox, faylı işlədir. Fayl tam kataloq sayılır: fayldan çıxmış məhsullar "naməlum stok" olur.
- Fayl yeniləndikcə (gündəlik link olsa cron ilə) əmri təkrarlayın.

## Nəticə faylları (`data/crawl/`, git-ə daxil deyil)

| Fayl | Məzmun |
| --- | --- |
| `<mağaza>/state.json` | növbə, oxunmuş sitemap-lər, məhsul URL-ləri, kursor, statistika, son 200 xəta |
| `<mağaza>/items.jsonl` | oxunan hər məhsul/variant: ad, brend, kateqoriya, SKU, GTIN, qiymət, köhnə qiymət, stok, şəkil, xüsusiyyətlər, link, yoxlanma vaxtı |
| `<mağaza>/catalog.json` | dublikatsız yekun, saytın snapshot formatında (`products`, `offers`) |
| `all-products.jsonl` | bütün mağazaların məhsulları bir faylda |
| `summary.json` | mağaza üzrə vəziyyət, sətir, qiymətli, stokda, xəta sayları |

## Mənbə növləri

- **Açıq kataloq API-si** (WooCommerce Store API): Techbar, Casio, Eurolux, SeeHome, Allstar — hər səhifədə 10–100 məhsul.
- **Rəsmi feed**: Technomania (mağazanın müqayisə üçün verdiyi JSON feed, `lib/technomania.ts`).
- **Kateqoriya səhifəsi**: Baku Electronics (`__NEXT_DATA__`, 18 məhsul/səhifə), İrşad.
- **Sitemap + məhsul səhifəsi** (JSON-LD, meta, mikrodata və ya mağazaya xas oxuyucu): iSpace, Compstore, iComp, Soliton, Bytelecom, Ali & Nino, Xiaomi Aləmi, UltraStore, ERA, Okim, Smeg, Texno Home, Telehome, NANO, Minor, Digital Home, Almalı, Smarton, Music Gallery.
- **Sitemap-siz, kateqoriyadan keçid**: Mobifon, Bestel, World Telecom.

## Qaydalar (dəyişdirilməməlidir)

- Yalnız `docs/local-merchants.json`-dakı mağaza domenlərinə HTTPS; başqa domenə yönləndirmə rədd edilir.
- robots.txt hər origin üçün oxunur; `Disallow` olan ünvan oxunmur, `Crawl-delay` saxlanılır (İrşad, Smarton: 30 s). Hər hosta eyni anda bir sorğu, ən az 1 s fasilə.
- Cloudflare/DDoS-Guard bot yoxlaması və ilk sorğuda 401/403 mənbəni dərhal dayandırır; yoxlamadan yan keçilmir. Hazırda belə olanlar: Smart Electronics, Music Gallery (2026-11-19), Kontakt, Birmarket, Elit Optimal. Bunlar üçün mağazadan rəsmi feed/icazə lazımdır.
- İş zamanı 403 gələndə əvvəlcə son uğurlu səhifə yenidən yoxlanır; o açılırsa, 403 yalnız həmin ünvana aiddir (Okim sitemap-indəki boşluqlu adlar) və ünvan xəta kimi yazılır.
- İş zamanı (mağaza artıq cavab verdikdən sonra) gələn 403/429 sürət limiti sayılır: mənbə 10 dəqiqə gözləyir, öz sorğu tempini iki dəfə azaldır və davam edir (bir işdə ən çox 3 dəfə). Retry-After nəzərə alınır.
- 5xx və şəbəkə xətası artan fasilə ilə 5 dəfəyə qədər təkrarlanır.
- Qiyməti 0 olan, AZN olmayan, adı olmayan səhifə idxal edilmir; üstündən xətt çəkilmiş qiymət heç vaxt təklif qiyməti olmur; naməlum stok “stokda” göstərilmir.
- İdxal (`crawl:import`) admin seçimlərini (`active`, `featured`) saxlayır. Yalnız tam bitmiş və sağlam (oxunanlar xətaların ən azı 9 mislidir) işdən sonra mağazanın yenidən görünməyən təklifləri “naməlum stok” edilir; qiymətlər silinmir.

## Sürət və həcm (2026-11-19 sınağı)

Məhsul səhifəsi mənbələri hostun icazə verdiyi sürətlə (~1 səhifə/s, Crawl-delay olanlarda 30 s) oxunur, mağazalar paralel işləyir. Böyük mənbələr: Ali & Nino ~48 400, iComp ~12 100, Compstore ~8 800, Techbar ~8 200, Baku ~8 000+ məhsul. Ali & Nino tam oxunuşu ~14 saat, İrşad (30 s gecikmə) bir neçə gün çəkir; toplayıcı hər dəfə qaldığı yerdən davam etdiyi üçün `--max-minutes` ilə hissə-hissə işlətmək olar.
