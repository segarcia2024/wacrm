#!/usr/bin/env bash
# =============================================================================
# repair-proxy.sh — Repara 502/504 de nginx → Node en el VPS
#
# 1. Connection: upgrade solo si hay Upgrade (no en cada request HTTP)
# 2. Recarga nginx
# 3. Reinicia el contenedor (sin rebuild) para desatascar Node
#
# Uso (desde wacrm/ en tu Mac; pedirá la contraseña de root):
#   bash scripts/repair-proxy.sh
# =============================================================================
set -euo pipefail

VPS_USER="root"
VPS_HOST="31.97.13.219"
REMOTE_DIR="/root/wacrm"
SSH_TARGET="${VPS_USER}@${VPS_HOST}"

echo "=============================================="
echo "  REVIO CRM — Reparar proxy nginx (502/504)"
echo "  Destino: ${SSH_TARGET}"
echo "=============================================="
echo ""

ssh "${SSH_TARGET}" bash -s <<'REMOTE_SCRIPT'
set -euo pipefail

echo "→ [1/4] Estado actual..."
docker ps -a --filter name=revio-crm --format '  {{.Names}}  {{.Status}}  {{.Ports}}' || true
echo ""

echo "→ [2/4] Mapa WebSocket + Connection condicional..."
cat > /etc/nginx/conf.d/websocket-map.conf <<'EOF'
# Solo enviar Connection: upgrade cuando el cliente pide WebSocket.
# Forzarlo en GET/POST normales deja a Node esperando un handshake
# que nunca llega → nginx 502 / 504.
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
EOF

patched=0
while IFS= read -r -d '' file; do
  if grep -q 'proxy_set_header Connection "upgrade"' "$file" 2>/dev/null; then
    cp -a "$file" "${file}.bak-504-$(date +%Y%m%d%H%M%S)"
    sed -i 's/proxy_set_header Connection "upgrade";/proxy_set_header Connection $connection_upgrade;/' "$file"
    echo "  parcheado: $file"
    patched=$((patched + 1))
  fi
done < <(find /etc/nginx -type f \( -name '*.conf' -o -path '*/sites-available/*' -o -path '*/sites-enabled/*' \) -print0 2>/dev/null)

if [[ "$patched" -eq 0 ]]; then
  echo "  (ningún Connection \"upgrade\" literal — puede estar ya parcheado)"
fi

echo ""
echo "→ [3/4] nginx -t && reload..."
nginx -t
systemctl reload nginx
echo "  nginx recargado."
echo ""

echo "→ [4/4] Reiniciando contenedor revio-crm..."
if [[ -f /root/wacrm/docker-compose.yml ]]; then
  cd /root/wacrm
  docker compose up -d --force-recreate revio-crm
else
  docker restart revio-crm
fi

echo ""
echo "  Esperando health (hasta 20s)..."
ok=0
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS -o /dev/null --max-time 3 http://127.0.0.1:3000/login; then
    ok=1
    break
  fi
  sleep 2
done

echo ""
docker ps --filter name=revio-crm --format '  {{.Names}}  {{.Status}}  {{.Ports}}'
echo ""
if [[ "$ok" -eq 1 ]]; then
  echo "  Node responde en :3000"
else
  echo "  WARN: :3000 aún no responde. Últimos logs:"
  docker logs --tail 40 revio-crm 2>&1 || true
fi

echo ""
echo "  nginx error (últimas 20):"
tail -n 20 /var/log/nginx/error.log 2>/dev/null || true
REMOTE_SCRIPT

echo ""
echo "=============================================="
echo "  ✓ Reparación aplicada"
echo "  Comprueba: https://crm.revio.com.co/inbox"
echo "=============================================="
