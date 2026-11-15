# Qəpik — Azərbaycan qiymət müqayisəsi

Azərbaycan mağazalarının qiymətlərini bir yerdə göstərən sayt. React 19 + Vinext (Vite), Node serveri və bir SQLite faylı. Xarici xidmət, Cloudflare və ya ayrıca baza serveri tələb olunmur.

## Tək əmrlə serverə quraşdırmaq (Ubuntu/Debian)

Serverdə root kimi:

```bash
curl -fsSL https://raw.githubusercontent.com/iilkhoon/serfeli/claude/dreamy-bell-2exiww/deploy/install.sh | OWNER_EMAIL=sen@example.com bash
```

Skript köhnə quraşdırmanı və 80/443 portunu tutan xidmətləri (nginx, apache, pm2) dayandırır, Node 22 və Caddy qurur, saytı `/opt/qepik`-də build edir, bazanı `/var/lib/qepik`-də saxlayır və `https://qepik.az`-ı avtomatik sertifikatla açır. Yeniləmək üçün eyni əmri təkrar işlədin. Ətraflı: `docs/HANDOFF.md`.

## Serverdə əl ilə işə salmaq

Node 22.13 və ya daha yeni versiya lazımdır.

```bash
npm ci
npm run build
OWNER_EMAIL=sen@example.com PORT=3000 npm start
```

- Baza `data/qepik.sqlite` faylıdır (yolu `DATABASE_PATH` ilə dəyişmək olar). İlk işə düşəndə cədvəllər yaranır və layihədəki ilkin kataloq bazaya yazılır.
- `npm start` saytla birlikdə planlayıcını da işə salır: mağaza idxalları hər dəqiqə irəliləyir, Technomania rəsmi feed-i saatda bir oxunur. İdxalı söndürmək üçün `CRAWL=off`.
- `OWNER_EMAIL`: admin panelini (`/admin`) yalnız bu e-poçtla qeydiyyatdan keçən hesab aktivləşdirə bilər. Təyin edilməyibsə admin heç kimə açılmır.
- Sayt HTTPS arxasında (nginx/Caddy) işləməlidir; proksi `X-Forwarded-Proto` və `X-Real-IP` başlıqlarını ötürməlidir ki, sessiya kukisi `Secure` olsun və sorğu limiti müştəri üzrə işləsin.
- Vəziyyətə baxmaq: `node scripts/status.mjs` (bazadakı qeydlər və hər mağaza idxalının gedişi).
- `seed/catalog.jsonl.gz`: toplanmış məhsul, təklif və qiymət tarixçəsinin snapshot-u. Yeni server onu ilk işə düşəndə bir dəfə yükləyir, sonra idxal işləri məlumatı özü yeniləyir. Yenidən yazmaq üçün: `node scripts/export-seed.mjs`.
- Ehtiyat nüsxə: `data/` qovluğunu kopyalamaq kifayətdir.

Lokal iş üçün: `npm run dev` (port 5173), `npm run typecheck`, `npm run lint`.

## Hesablar

Qeydiyyat (`/qeydiyyat`), giriş (`/giris`) və hesab səhifəsi (`/hesab`) saytın özündədir. Şifrələr scrypt ilə heşlənir; brauzerdə yalnız təsadüfi sessiya nişanı (HttpOnly kuki), bazada isə onun SHA-256 heşi saxlanır. Telefon nömrələri +994 formatına gətirilir. Seçilmişlər, qiymət bildirişləri, rəylər və mağaza müraciətləri hesaba bağlıdır.

Mağaza müraciəti (`/magaza-qeydiyyat`): şirkət adı, hüquqi ad və forma, VÖEN, əlaqə, sayt, kateqoriyalar, məhsul sayı, kataloq mənbəyi (sitemap, XML/JSON feed, CSV), çatdırılma şəhərləri və üsulu, ödəniş növləri. Müraciətin vəziyyəti hesab səhifəsində görünür, admin paneldə təsdiqlənir.

## Məlumatın toplanması

- `lib/crawl-sources.ts`: mağaza mənbələri (sitemap, kateqoriya səhifələri, WooCommerce Store API).
- `lib/crawl-jobs.ts`: bazada saxlanan, qaldığı yerdən davam edən idxal işləri. Hər mağaza öz gecikməsi ilə, mağazalar bir-birindən asılı olmadan paralel oxunur; 429 gözlədilir, 403 və bot yoxlaması işi dayandırır.
- `lib/extractor.ts`, `lib/html-products.ts`, `lib/irshad.ts`, `lib/listing-sources.ts`: məhsul səhifəsi və siyahı oxuyucuları. `robots.txt` qaydalarına əməl olunur; CAPTCHA və bot qoruması keçilmir.
- `lib/feed-sync.ts`: Technomania rəsmi JSON feed-i.
- `lib/product-matching.ts`: eyni modelin müxtəlif mağazalardakı təkliflərinin birləşdirilməsi.

Bot qoruması olan mağazalar (hazırda kontakt.az, mgstore.az, smartelectronics.az) avtomatik oxunmur; onlar üçün rəsmi feed və ya mağaza müraciəti lazımdır.

## Mənbə quruluşu

- `app/(shop)`, `app/shop/*`, `app/v2.css`: alıcı interfeysi (V2). `shell.tsx` başlıq, naviqasiya və marşrutlar; `home.tsx`, `listing.tsx`, `product.tsx`, `pages.tsx` səhifələr; `card.tsx` məhsul kartı.
- `app/(panel)/admin`, `app/admin*.tsx`, `app/*-panel.tsx`: admin paneli. Öz stil faylları ilə ayrıca marşrutdur.
- `app/api/v1/[...path]/route.ts`: API (kataloq, axtarış təklifləri, hesab, şəxsi siyahılar, admin).
- `lib/db.ts`: SQLite bağlantısı və sxem. `lib/accounts.ts`: hesablar və sessiyalar. `lib/scheduler.ts`: planlayıcı.
- `lib/catalog-query.ts`: serverdə süzmə, sıralama, oxşar məhsullar, qiyməti düşənlər.
- `lib/seo.ts`, `lib/seo-sitemap.ts`: metadata, JSON-LD, sitemap, robots.
- `scripts/verify-*.mjs`: oxuyucu, idxal, uyğunlaşdırma və SEO yoxlamaları.

## Silinə bilən köhnə fayllar

Cloudflare/D1 dövründən qalan `worker/`, `db/`, `drizzle/`, `drizzle.config.ts`, `cloudflare-env.d.ts`, `next.config.ts`, `scripts/migrate-local.mjs`, `scripts/seed-local.mjs`, `scripts/local-env.mjs`, `scripts/tool-environment.mjs`, `scripts/run-framework.mjs`, `scripts/vite/` artıq istifadə olunmur və build-ə daxil deyil.
