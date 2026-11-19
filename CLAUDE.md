# Qəpik — layihə bələdçisi

Azərbaycan mağazalarının qiymətlərini müqayisə edən sayt (qepik.az). Cavabları Azərbaycan dilində ver.

## Quruluş

- React 19 + Vinext (Vite), Node server `scripts/server.mjs`, baza SQLite (`node:sqlite`, `lib/db.ts`, cədvəl `records(id, kind, payload, updated_at)`).
- İş budağı: `claude/charming-allen-upp6xv` (bütün son iş buradadır; `main` köhnədir).
- Sayt daxilində planlayıcı: `lib/scheduler.ts` (hər dəqiqə kiçik idxal addımları), idxal işləri `lib/crawl-jobs.ts`.
- Mənbə adapterləri: `lib/crawl-sources.ts`, `lib/extractor.ts` (robots.txt, Crawl-delay, host başına 1 sorğu), `lib/listing-sources.ts`, `lib/html-products.ts`, `lib/technomania.ts`, `lib/woocommerce.ts`.
- Eyni məhsulların birləşdirilməsi: `lib/product-matching.ts` (`productAliases`).
- Səhifəyə gedən kataloq dilimi: `lib/catalog-query.ts` (`catalogSlice`).

## Toplayıcı (`scripts/crawler/`, ətraflı `docs/CRAWLER.md`)

- `npm run crawl` — mağaza saytlarını paralel oxuyur, qaldığı yerdən davam edir (`data/crawl/<mağaza>/`).
- `npm run crawl:api` — tərəfdaş kataloq API-si (ünvan yalnız serverdə `/etc/qepik.env` → `PARTNER_API_URL`; repo-da, sənədlərdə və saytda mənbənin adı yazılmamalıdır — təkliflər yalnız mağazanın öz adı və linki ilə görünür).
- `npm run crawl:file -- --store <id> --file <csv|xml|json|link>` — mağazanın göndərdiyi ixrac faylı.
- `npm run crawl:import` — nəticəni bazaya yazır; hər mağaza üçün bir mənbə: fayl → saytın tam oxunuşu → API → yarımçıq oxunuş.
- Lokal mühitdə: `DATABASE_PATH=... npm run crawl:import`.

Qaydalar: yalnız `docs/local-merchants.json` / `lib/merchants.ts` domenləri; robots.txt və Crawl-delay saxlanılır; Cloudflare/bot yoxlamasından yan keçilmir (mağaza Cloudflare-də `QepikBot` + server IP üçün Skip qaydası əlavə etməlidir); naməlum stok "stokda" göstərilmir; üstündən xətt çəkilmiş qiymət təklif qiyməti olmur.

## Server (Contabo VPS, Ubuntu)

- Kod: `/opt/qepik` (yalnız quraşdırma üçün, `install.sh` hər dəfə `reset --hard` + `clean` edir — orada redaktə etmə).
- İnkişaf nüsxəsi: `/root/qepik.az` (tam git tarixçəsi) — dəyişiklikləri burada et, commit et.
- Baza: `/var/lib/qepik/qepik.sqlite`; toplayıcı nəticələri: `/var/lib/qepik/crawl`; ayarlar: `/etc/qepik.env` (600 root; `OWNER_SETUP_TOKEN`, `PARTNER_API_URL`).
- Xidmətlər: `qepik` (sayt, 127.0.0.1:3000), `caddy` (HTTPS), `qepik-crawl.service` + `qepik-crawl.timer` (hər gecə 03:15, `deploy/refresh-catalog.sh`).
- Lokal nüsxədən quraşdırma (GitHub-a push etmədən, yalnız commit olunmuş vəziyyət gedir):
  `cd /root/qepik.az && REPO=/root/qepik.az BRANCH=$(git branch --show-current) bash deploy/install.sh`
- GitHub-dan quraşdırma:
  `curl -fsSL https://raw.githubusercontent.com/iilkhoon/qepik.az/claude/charming-allen-upp6xv/deploy/install.sh | bash`
- Loglar: `journalctl -u qepik -f`, `journalctl -u qepik-crawl -f`. Əl ilə yeniləmə: `systemctl start qepik-crawl`.
- Bazaya toxunmazdan əvvəl ehtiyat: `sqlite3 /var/lib/qepik/qepik.sqlite ".backup /root/qepik-backup-$(date +%F-%H%M).sqlite"`.

## Açıq məsələlər (2026-11-19)

1. **Serverdə yüksək CPU**: `qepik` xidməti başlayandan sonra ~100% CPU və 1,6 GB yaddaş; install skriptinin 90 s sağlamlıq yoxlaması cavab almadı (xidmət işləyir). Köhnə versiya da 4 gündə 2 gün 18 saat CPU işlədib. Lokal 82 min məhsullu bazada problem yoxdur → səbəb serverdəki bazanın məzmunu ola bilər (çox `history`, `tap.az` qeydləri, `crawlJob`, `productAliases` ölçüsü). Əvvəl yalnız oxuyaraq ölç: `select kind,count(*),sum(length(payload)) from records group by kind`. Bazadan heç nə silmə.
2. Bot qorumalı mağazalar (Kontakt, Birmarket, Music Gallery, Smart Electronics, Elit Optimal): hazırda API ilə gəlir; mağaza Cloudflare qaydası əlavə edəndə öz oxuyucuları yazılmalıdır (Kontakt — Magento, `mgstore` oxuyucusuna bənzər).
3. API-dən gələn məhsulların şəkli yoxdur (`/favicon.svg`).
4. `verify-live-catalog` Technomania feed xəbərdarlıqlarına görə düşür (köhnə problem).
5. Kateqoriya qaydaları (`categoryOf`, `lib/crawl-jobs.ts`) zəifdir: monitor, printer, iMac və oyuncaqlar "aksesuar"a düşür.

## Yoxlamalar

`npx tsc --noEmit -p .`, `npx eslint lib app scripts/crawler`, `npx prettier --check .`, `node scripts/verify-extractors.mjs`, `node scripts/verify-api-http.mjs`, `node scripts/verify-crawl-rules.mjs`, `npm run build`. TS fayllarını Node ilə işlətmək: `node --no-warnings --import ./scripts/crawler/register.mjs <fayl>`.

## Git

Commit mesajları ingiliscə, qısa başlıq + izah. `main`-ə və başqa budaqlara icazəsiz push etmə. `/etc/qepik.env`, baza və `data/` git-ə düşməməlidir.
