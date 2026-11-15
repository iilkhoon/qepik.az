# Qəpik — handoff for the next session

Branch: `claude/dreamy-bell-2exiww` (not merged to `main`). Server: Ubuntu, domain `qepik.az`.

## Install or update the server

On the server, as root:

```bash
curl -fsSL https://raw.githubusercontent.com/iilkhoon/serfeli/claude/dreamy-bell-2exiww/deploy/install.sh | OWNER_EMAIL=admin@example.com bash
```

`deploy/install.sh` stops nginx/apache/pm2 and any old Qəpik service, installs Node 22 and Caddy,
clones the branch to `/opt/qepik`, builds it, keeps the SQLite database in `/var/lib/qepik`, runs
the `qepik` systemd service on 127.0.0.1:3000 and serves `https://qepik.az` through Caddy (automatic
certificates). Re-running it updates the code and keeps the data. Settings live in `/etc/qepik.env`.

- Logs: `journalctl -u qepik -f`
- Catalogue status: `cd /opt/qepik && sudo -u qepik DATABASE_PATH=/var/lib/qepik/qepik.sqlite node scripts/status.mjs`
- Admin: register at `/qeydiyyat` with the `OWNER_EMAIL` address, then open `/admin`.
- DNS: `qepik.az` and `www.qepik.az` A records must point at the server before HTTPS works.

## What the app is

- Vinext (Next.js App Router on Vite) + React 19, run by `npm start` (`scripts/server.mjs`).
- Database: Node's built-in `node:sqlite` (`lib/db.ts`); no Cloudflare/D1.
- Accounts: `lib/accounts.ts` (scrypt, HttpOnly session cookie).
- In-process scheduler `lib/scheduler.ts`: loads `seed/catalog.jsonl.gz` once, syncs the Technomania
  feed hourly, and runs store crawls (`lib/crawl-jobs.ts`, `lib/crawl-sources.ts`). `CRAWL=off`
  disables crawling.
- Storefront: `app/(shop)` + `app/shop/*` + `app/v2.css` (fonts Geologica + Onest, self-hosted).
  Admin: `app/(panel)/admin`.
- Demonstration product pages for filming (`app/shop/sample.tsx`, list in `lib/samples.ts`):
  `/testmehsul` (Apple iPhone Duo), `/testsoyuducu`, `/testkombi`, `/testpaltaryuyan`,
  `/testqabyuyan`. Real products and photos (`public/testmehsul/`), invented stores with their own
  logos, prices and reviews. Noindex, blocked in robots.txt, links never leave the page.

## Known gaps

- kontakt.az, mgstore.az, smartelectronics.az use bot protection; not crawled.
- bytelecom, technolife: no usable sitemap; barkod sitemap uses `/products?...` (not added yet).
- Birmarket/Umico not connected.
- Old Cloudflare files still in the repo (listed in README) and can be deleted.
- `scripts/verify-api.mjs`, `verify-live*.mjs`, `verify-matching-api.mjs`, `verify-crawl-jobs.mjs`,
  `verify-store-catalogs.mjs`, `verify-polite-http.mjs` expect the old dev server and need updating.
