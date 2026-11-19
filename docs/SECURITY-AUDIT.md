# Təhlükəsizlik yoxlaması — 19.11.2026

Əhatə: `claude/dreamy-bell-2exiww` üzərində (Node server + SQLite, e-poçt/şifrə ilə giriş) API, giriş və sessiyalar, admin icazələri, mənbə oxuyucuları (SSRF), XSS, asılılıqlar və `deploy/install.sh` (Caddy, systemd). Yoxlama kod oxunuşu, mövcud test skriptləri və lokal build üzərində canlı HTTP sınaqları ilə aparılıb.

## Düzəldilənlər

| # | Ciddilik | Problem | Düzəliş |
| --- | --- | --- | --- |
| 1 | Kritik | `next@16.3.4`: məlum RCE, SSRF və keş zəhərlənməsi zəiflikləri (GHSA-vcvr-r3jv-pc5j, GHSA-2464-fhr4-w9xw və s.) | `next@16.4.6`, `eslint-config-next@16.4.6` |
| 2 | Yüksək | `zod@3`: böyük kolleksiyalarda yaddaş tükənməsi (GHSA-mrhx-c7xc-m3w5) | `zod@4.6.7`; iki API dəyişikliyi uyğunlaşdırıldı. `npm audit --omit=dev`: 0 zəiflik |
| 3 | Yüksək | Qeydiyyat açıqdır və e-poçt təsdiqlənmir; sahib hələ qeydiyyatdan keçməyibsə, başqası `OWNER_EMAIL` ünvanı ilə qeydiyyatdan keçib admin panelini aktivləşdirə bilərdi | Aktivləşdirmə serverdə saxlanan `OWNER_SETUP_TOKEN` kodunu tələb edir (müqayisə sabit vaxtla). `install.sh` kodu avtomatik yaradır, `/etc/qepik.env`-i `600 root` edir və kodu yalnız quraşdırma sonunda göstərir. Admin səhifəsində kod sahəsi var |
| 4 | Yüksək | Giriş/qeydiyyat limiti IP-ni əvvəlcə `X-Real-IP`, sonra `X-Forwarded-For`-un **birinci** elementindən götürürdü; Caddy bu başlıqları müştəridən ötürdüyü üçün hər sorğuda yeni IP yazıb şifrə təxminini limitsiz etmək olurdu | IP yalnız proksinin əlavə etdiyi **sonuncu** `X-Forwarded-For` elementindən götürülür (`clientIp`, `lib/api/http.ts`); Caddy `X-Real-IP`-ni də özü yazır |
| 5 | Orta | Bir hesaba müxtəlif IP-lərdən şifrə təxmini məhdudlaşmırdı | Hesab üzrə limit: 15 dəqiqədə 10 uğursuz cəhddən sonra 429. Açar hər e-poçt üçün eynidir, hesabın mövcudluğunu açmır |
| 6 | Orta | HTTP təhlükəsizlik başlıqları yox idi | Caddy: HSTS, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `nosniff`, `Referrer-Policy`, `Permissions-Policy`; `Server` başlığı silinir |
| 7 | Orta | systemd xidməti yalnız `NoNewPrivileges` ilə işləyirdi | `ProtectSystem=full`, `ProtectHome`, `PrivateTmp`, `PrivateDevices`, kernel/cgroup qorumaları, `RestrictSUIDSGID`, `RestrictNamespaces`, `UMask=0027` |
| 8 | Aşağı | `install.sh` başqa repo adını (`iilkhoon/serfeli`) klonlayırdı | `iilkhoon/qepik.az` |

Yeni yoxlamalar: `scripts/verify-api-http.mjs` (proksi IP-si, hesab limiti), `scripts/verify-extractors.mjs` (yeni Bytelecom səhifəsi, qiymətsiz səhifənin rədd edilməsi).

## Canlı sınaq (lokal build, `npm start`)

- Adi istifadəçi `/api/v1/admin/*` → 403; kodsuz/yanlış kodla aktivləşdirmə → 403; doğru kodla → 200.
- Başqa `Origin`-dən POST → 403; hesabsız yazma → 401; 600 KB gövdə → 413.
- Köhnə `x-qepik-user-*` başlıqları ilə özünü başqası kimi göstərmək mümkün deyil (sessiya yalnız cookie + baza).
- 12 fərqli `X-Forwarded-For` ilə 12 yanlış şifrə → limit hesab üzrə işləyir.

## Yaxşı vəziyyətdə olanlar

- Şifrələr scrypt (N=16384, duzlu), müqayisə `timingSafeEqual`; mövcud olmayan e-poçt üçün də eyni vaxt (decoy hash).
- Sessiya: 32 bayt təsadüfi token, bazada yalnız SHA-256; `HttpOnly; SameSite=Lax; Secure` (HTTPS-də), 30 gün.
- SQL hər yerdə parametrli (`prepare().bind()`); axtarış sorğusu SQL-ə düşmür.
- JSON-LD `<`, `>`, `&`, U+2028/2029 escape olunur; React 19 `javascript:` linklərini bloklayır; şəkil yalnız `https://` və ya lokal yol.
- Mənbə oxuyucuları (SSRF): yalnız ağ siyahıdakı mağaza domenləri, HTTPS, port/istifadəçi adı yox, hər yönləndirmədə domen yoxlaması, ölçü və vaxt limitləri, XML entity rəddi, robots.txt.
- Xəta cavabları daxili məlumat (SQLite/stack) açmır.

## Qalan risklər və tövsiyələr

- **Hesab bloklama DoS**: hesab limiti istənilən şəxsə sahibin girişini 15 dəqiqəlik bağlamağa imkan verir. Brute-force-a qarşı qəbul edilən kompromisdir; problem olarsa admin üçün ayrıca giriş yolu və ya 2FA əlavə edin.
- **E-poçt təsdiqi yoxdur**: istifadəçilər başqasının e-poçtu ilə qeydiyyatdan keçə bilər (admin üçün #3 ilə bağlanıb). Bildiriş göndərişi qoşulanda təsdiq kodu əlavə edilməlidir.
- **Limitlər yaddaşdadır**: server yenidən başlayanda sıfırlanır. Tək VPS üçün kifayətdir; bir neçə nüsxəyə keçəndə bazaya köçürülməlidir.
- **Server birbaşa açıq olmamalıdır**: `scripts/server.mjs` default `HOST=0.0.0.0`-dır; `install.sh` `127.0.0.1` yazır. Başqa quraşdırmada da tətbiqi yalnız proksinin arxasında saxlayın, əks halda `X-Forwarded-For` saxtalaşdırıla bilər.
- **`curl | bash` budaqdan**: quraşdırma budağın son vəziyyətini işlədir. İstehsal üçün teq/commit üzrə quraşdırma tövsiyə olunur.
- **Tam CSP yoxdur**: framework inline skriptləri səbəbindən yalnız `frame-ancestors`/`object-src`/`base-uri`/`form-action` tətbiq edilib; nonce əsaslı CSP ayrıca iş tələb edir.
- **Ehtiyat nüsxə**: `/var/lib/qepik/qepik.sqlite` üçün gündəlik ehtiyat (məs. `sqlite3 … ".backup"`) qurulmalıdır.
