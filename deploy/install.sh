#!/usr/bin/env bash
# Qəpik: one-command install on a fresh Ubuntu/Debian server (run as root).
#
#   curl -fsSL https://raw.githubusercontent.com/iilkhoon/qepik.az/<budaq>/deploy/install.sh | bash
#
# Optional settings, put before `bash`:  DOMAIN=qepik.az OWNER_EMAIL=you@example.com
# PARTNER_API_URL=https://… (partner catalogue API; stored in /etc/qepik.env)
# What it does: removes an old Qəpik install and anything holding ports 80/443 (nginx, apache,
# pm2), installs Node 22 + Caddy, builds the site into /opt/qepik, keeps the database in
# /var/lib/qepik, runs it as the `qepik` systemd service and serves https://DOMAIN. The catalog
# is refreshed nightly by qepik-crawl.timer (deploy/refresh-catalog.sh) and once right after install.
# Running it again is safe: it updates the code and keeps the database.
set -euo pipefail

DOMAIN="${DOMAIN:-qepik.az}"
OWNER_EMAIL="${OWNER_EMAIL:-}"
PARTNER_API_URL="${PARTNER_API_URL:-}"
REPO="${REPO:-https://github.com/iilkhoon/qepik.az.git}"
BRANCH="${BRANCH:-claude/charming-allen-upp6xv}"
APP=/opt/qepik
DATA=/var/lib/qepik
PORT=3000

say() { printf '\n\033[1;35m==> %s\033[0m\n' "$*"; }
[ "$(id -u)" = 0 ] || { echo "root kimi işlədin: sudo bash install.sh"; exit 1; }
export DEBIAN_FRONTEND=noninteractive

say "Köhnə quraşdırma və 80/443 portunu tutan xidmətlər dayandırılır"
systemctl stop qepik 2>/dev/null || true
for svc in nginx apache2 httpd lighttpd; do
  if systemctl list-unit-files "$svc.service" >/dev/null 2>&1; then
    systemctl disable --now "$svc" 2>/dev/null || true
  fi
done
if command -v pm2 >/dev/null 2>&1; then pm2 kill || true; fi
if command -v docker >/dev/null 2>&1; then
  # Containers publishing 80/443 would block HTTPS.
  for id in $(docker ps -q --filter publish=80 --filter publish=443 2>/dev/null); do docker rm -f "$id" || true; done
fi

say "Sistem paketləri"
apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https build-essential

if ! command -v node >/dev/null 2>&1 || ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  say "Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

if ! command -v caddy >/dev/null 2>&1; then
  say "Caddy (avtomatik HTTPS)"
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# The build needs about 1.5 GB of memory; small servers get swap.
if [ "$(free -m | awk '/Mem:/{print $2}')" -lt 2500 ] && ! swapon --show | grep -q .; then
  say "Swap faylı (2 GB)"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

id qepik >/dev/null 2>&1 || useradd --system --home "$DATA" --shell /usr/sbin/nologin qepik
mkdir -p "$DATA"

say "Kod yüklənir ($BRANCH)"
if [ -d "$APP/.git" ]; then
  # The checkout belongs to the qepik user; let root's git work in it.
  G=(git -c safe.directory="$APP" -C "$APP")
  # An older install may still point at the repository's previous name.
  "${G[@]}" remote set-url origin "$REPO"
  "${G[@]}" fetch --depth 1 origin "$BRANCH"
  "${G[@]}" reset --hard FETCH_HEAD
  "${G[@]}" clean -fdx -e node_modules
else
  rm -rf "$APP"
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP"
fi
chown -R qepik:qepik "$APP" "$DATA"

say "Asılılıqlar və build (bir neçə dəqiqə çəkir)"
sudo -u qepik -H bash -c "cd '$APP' && npm ci --no-audit --no-fund && npm run build"

ENV=/etc/qepik.env
if [ ! -f "$ENV" ]; then
  cat > "$ENV" <<EOF
PORT=$PORT
HOST=127.0.0.1
DATABASE_PATH=$DATA/qepik.sqlite
SITE_URL=https://$DOMAIN
# Bu e-poçtla qeydiyyatdan keçən hesab admin panelini aktivləşdirə bilər (kodla).
OWNER_EMAIL=$OWNER_EMAIL
EOF
elif [ -n "$OWNER_EMAIL" ]; then
  sed -i "s|^OWNER_EMAIL=.*|OWNER_EMAIL=$OWNER_EMAIL|" "$ENV"
fi
# E-poçt təsdiqlənmir: başqası sahibin e-poçtu ilə qeydiyyatdan keçsə belə, admin aktivləşdirməsi
# yalnız bu serverdə saxlanan kodla mümkündür.
if ! grep -q '^OWNER_SETUP_TOKEN=.' "$ENV"; then
  sed -i '/^OWNER_SETUP_TOKEN=/d' "$ENV"
  echo "OWNER_SETUP_TOKEN=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')" >> "$ENV"
fi
# Partner catalogue API: given once on the command line, kept only in the env file.
if [ -n "$PARTNER_API_URL" ]; then
  sed -i '/^PARTNER_API_URL=/d' "$ENV"
  echo "PARTNER_API_URL=$PARTNER_API_URL" >> "$ENV"
fi
chown root:root "$ENV"
chmod 600 "$ENV"

cat > /etc/systemd/system/qepik.service <<EOF
[Unit]
Description=Qəpik qiymət müqayisəsi
After=network-online.target
Wants=network-online.target

[Service]
User=qepik
WorkingDirectory=$APP
EnvironmentFile=$ENV
ExecStart=/usr/bin/node scripts/server.mjs
Restart=always
RestartSec=3
# Sandboxing: the service writes only to its checkout and the database directory.
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=full
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictNamespaces=true
LockPersonality=true
UMask=0027

[Install]
WantedBy=multi-user.target
EOF

# Catalog refresh: partner API offers + the stores' own sites, nightly at 03:15 and after each install.
cat > /etc/systemd/system/qepik-crawl.service <<EOF
[Unit]
Description=Qəpik kataloq yeniləməsi
After=network-online.target qepik.service
Wants=network-online.target

[Service]
Type=oneshot
User=qepik
WorkingDirectory=$APP
EnvironmentFile=$ENV
Environment=CRAWL_OUT=$DATA/crawl
ExecStart=/bin/bash $APP/deploy/refresh-catalog.sh
TimeoutStartSec=7h
Nice=10
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=full
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
RestrictNamespaces=true
LockPersonality=true
UMask=0027
EOF
cat > /etc/systemd/system/qepik-crawl.timer <<EOF
[Unit]
Description=Qəpik kataloq yeniləməsi (gecəlik)

[Timer]
OnCalendar=*-*-* 03:15
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN, www.$DOMAIN {
	encode zstd gzip
	header {
		Strict-Transport-Security "max-age=31536000; includeSubDomains"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=()"
		Content-Security-Policy "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'"
		-Server
		-X-Powered-By
	}
	# The app reads the client address from the last X-Forwarded-For entry, which Caddy appends;
	# a client-sent X-Real-IP is replaced so it cannot be used to dodge rate limits either.
	reverse_proxy 127.0.0.1:$PORT {
		header_up X-Real-IP {remote_host}
	}
}
EOF

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q active; then
  ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp
fi

say "Xidmətlər başladılır"
systemctl daemon-reload
systemctl enable --now qepik
systemctl restart qepik
systemctl enable caddy
systemctl restart caddy
systemctl enable --now qepik-crawl.timer

for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
if curl -fsS "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1; then
  say "Hazırdır: https://$DOMAIN  (DNS A qeydi bu serverin IP-sinə yönəlməlidir)"
  echo "Admin aktivləşdirmə kodu (yalnız sizdə qalsın): $(sed -n 's/^OWNER_SETUP_TOKEN=//p' "$ENV")"
  # First catalog refresh now, in the background (API in a few minutes, store sites for hours).
  systemctl start --no-block qepik-crawl.service
  echo "Kataloq yeniləməsi başladı (API ~5 dəq, mağaza saytları bir neçə saat): journalctl -u qepik-crawl -f"
  echo "Loglar:     journalctl -u qepik -f"
  echo "Vəziyyət:   cd $APP && sudo -u qepik DATABASE_PATH=$DATA/qepik.sqlite node scripts/status.mjs"
  echo "Yeniləmək:  bu əmri yenidən işlədin."
else
  echo "Sayt cavab vermir. Son loglar:"
  systemctl status qepik --no-pager -l | head -20 || true
  journalctl -u qepik -n 60 --no-pager || true
  exit 1
fi
