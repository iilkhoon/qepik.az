#!/usr/bin/env bash
# Refreshes the catalog on the server (run by qepik-crawl.service, nightly and after install):
# did.az offers first (a few minutes), then the stores' own sites for up to CRAWL_MINUTES, writing
# to the database after each step. DATABASE_PATH comes from /etc/qepik.env.
set -uo pipefail
cd "$(dirname "$0")/.."
OUT="${CRAWL_OUT:-/var/lib/qepik/crawl}"
MINUTES="${CRAWL_MINUTES:-300}"
mkdir -p "$OUT"

echo "== did.az təklifləri"
npm run -s crawl:did -- --out "$OUT" || echo "did.az oxunmadı; mağaza saytları ilə davam edilir"
npm run -s crawl:import -- --out "$OUT"

echo "== mağaza saytları (ən çox $MINUTES dəqiqə; yarımçıq qalan növbəti dəfə davam edir)"
npm run -s crawl -- --out "$OUT" --max-minutes "$MINUTES" --quiet || true
npm run -s crawl:import -- --out "$OUT"
