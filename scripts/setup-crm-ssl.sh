#!/usr/bin/env bash
# =============================================================================
# setup-crm-ssl.sh — Nginx reverse proxy + Let's Encrypt for crm.revio.com.co
# Run on the VPS as root:  bash scripts/setup-crm-ssl.sh
# =============================================================================
set -euo pipefail

DOMAIN="crm.revio.com.co"
UPSTREAM="127.0.0.1:3000"
SITE_AVAIL="/etc/nginx/sites-available/${DOMAIN}"
SITE_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
EMAIL="${CERTBOT_EMAIL:-admin@revio.com.co}"

echo "=============================================="
echo "  SSL setup: ${DOMAIN} → ${UPSTREAM}"
echo "=============================================="

if [[ "$(id -u)" -ne 0 ]]; then
  echo "ERROR: ejecuta como root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx

# Ensure Docker app is listening on 3000
if ! curl -fsS -o /dev/null --max-time 5 "http://${UPSTREAM}/"; then
  echo "WARN: ${UPSTREAM} no responde aún. Continúo (el contenedor debe estar up)." >&2
  docker ps --filter name=revio-crm --format '{{.Names}} {{.Status}} {{.Ports}}' || true
fi

cat > /etc/nginx/conf.d/websocket-map.conf <<'MAP'
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
MAP

cat > "${SITE_AVAIL}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://${UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 5s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        proxy_buffering off;
    }
}
EOF

ln -sfn "${SITE_AVAIL}" "${SITE_ENABLED}"
# Remove default site if it steals the request
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo ""
echo "→ Solicitando certificado Let's Encrypt para ${DOMAIN}..."
certbot --nginx -d "${DOMAIN}" \
  --non-interactive \
  --agree-tos \
  --email "${EMAIL}" \
  --redirect \
  --keep-until-expiring

echo ""
echo "→ Verificación HTTPS:"
curl -sI --max-time 15 "https://${DOMAIN}/" | head -20 || true

echo ""
echo "=============================================="
echo "  ✓ Listo: https://${DOMAIN}"
echo "=============================================="
