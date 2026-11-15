#!/usr/bin/env bash
# Qəpik: one-command install on a fresh Ubuntu/Debian server (run as root).
#
#   curl -fsSL https://raw.githubusercontent.com/iilkhoon/serfeli/claude/dreamy-bell-2exiww/deploy/install.sh | bash
#
# Optional settings, put before `bash`:  DOMAIN=qepik.az OWNER_EMAIL=you@example.com
# What it does: removes an old Qəpik install and anything holding ports 80/443 (nginx, apache,
# pm2), installs Node 22 + Caddy, builds the site into /opt/qepik, keeps the database in
# /var/lib/qepik, runs it as the `qepik` systemd service and serves https://DOMAIN.
# Running it again is safe: it updates the code and keeps the database.
set -euo pipefail

DOMAIN="${DOMAIN:-qepik.az}"
OWNER_EMAIL="${OWNER_EMAIL:-}"
REPO="${REPO:-https://github.com/iilkhoon/serfeli.git}"
BRANCH="${BRANCH:-claude/dreamy-bell-2exiww}"
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
  git -C "$APP" fetch --depth 1 origin "$BRANCH"
  git -C "$APP" reset --hard FETCH_HEAD
  git -C "$APP" clean -fdx -e node_modules
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
# İlk qeydiyyatdan keçən bu e-poçt admin olur.
OWNER_EMAIL=$OWNER_EMAIL
EOF
elif [ -n "$OWNER_EMAIL" ]; then
  sed -i "s|^OWNER_EMAIL=.*|OWNER_EMAIL=$OWNER_EMAIL|" "$ENV"
fi
chmod 640 "$ENV"

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
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN, www.$DOMAIN {
	encode zstd gzip
	reverse_proxy 127.0.0.1:$PORT
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

for _ in $(seq 1 90); do
  if curl -fsS "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1; then break; fi
  sleep 1
done
if curl -fsS "http://127.0.0.1:$PORT/api/v1/health" >/dev/null 2>&1; then
  say "Hazırdır: https://$DOMAIN  (DNS A qeydi bu serverin IP-sinə yönəlməlidir)"
  echo "Loglar:     journalctl -u qepik -f"
  echo "Vəziyyət:   cd $APP && sudo -u qepik DATABASE_PATH=$DATA/qepik.sqlite node scripts/status.mjs"
  echo "Yeniləmək:  bu əmri yenidən işlədin."
else
  echo "Sayt cavab vermir. Loga baxın: journalctl -u qepik -n 100"
  exit 1
fi
