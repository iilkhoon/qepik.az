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
15 3 * * * cd /opt/qepik && npm run crawl -- --out /var/lib/qepik/crawl --max-minutes 300 --quiet && DATABASE_PATH=/var/lib/qepik/qepik.sqlite npm run crawl:import -- --out /var/lib/qepik/crawl
```

`deploy/install.sh` yeniləmədə `/opt/qepik` qovluğunu təmizlədiyi üçün serverdə nəticələri `--out /var/lib/qepik/crawl` ilə verilənlər qovluğunda saxlayın.

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
- İş zamanı (mağaza artıq cavab verdikdən sonra) gələn 403/429 sürət limiti sayılır: mənbə 10 dəqiqə gözləyir, öz sorğu tempini iki dəfə azaldır və davam edir (bir işdə ən çox 3 dəfə). Retry-After nəzərə alınır.
- 5xx və şəbəkə xətası artan fasilə ilə 5 dəfəyə qədər təkrarlanır.
- Qiyməti 0 olan, AZN olmayan, adı olmayan səhifə idxal edilmir; üstündən xətt çəkilmiş qiymət heç vaxt təklif qiyməti olmur; naməlum stok “stokda” göstərilmir.
- İdxal (`crawl:import`) admin seçimlərini (`active`, `featured`) saxlayır. Yalnız tam bitmiş və sağlam (oxunanlar xətaların ən azı 9 mislidir) işdən sonra mağazanın yenidən görünməyən təklifləri “naməlum stok” edilir; qiymətlər silinmir.

## Sürət və həcm (2026-11-19 sınağı)

Məhsul səhifəsi mənbələri hostun icazə verdiyi sürətlə (~1 səhifə/s, Crawl-delay olanlarda 30 s) oxunur, mağazalar paralel işləyir. Böyük mənbələr: Ali & Nino ~48 400, iComp ~12 100, Compstore ~8 800, Techbar ~8 200, Baku ~8 000+ məhsul. Ali & Nino tam oxunuşu ~14 saat, İrşad (30 s gecikmə) bir neçə gün çəkir; toplayıcı hər dəfə qaldığı yerdən davam etdiyi üçün `--max-minutes` ilə hissə-hissə işlətmək olar.
