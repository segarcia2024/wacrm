#!/usr/bin/env bash
# =============================================================================
# deploy.sh — Despliegue de REVIO CRM (WACRM) al VPS de producción
# Sincroniza el código local → reconstruye Docker → reinicia el contenedor :3000
# =============================================================================
set -euo pipefail

# --- Configuración ---
VPS_USER="root"
VPS_HOST="31.97.13.219"
REMOTE_DIR="/root/wacrm"
SERVICE_NAME="revio-crm"

# Raíz del proyecto = directorio donde vive este script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_DIR="${SCRIPT_DIR}"

SSH_TARGET="${VPS_USER}@${VPS_HOST}"

echo "=============================================="
echo "  REVIO CRM — Deploy a producción"
echo "  Destino: ${SSH_TARGET}:${REMOTE_DIR}"
echo "=============================================="
echo ""

# --- 1. Gate de CI local: pruebas antes de tocar el VPS ---
# set -e aborta el script si npm run test falla (exit ≠ 0).
echo "→ [1/4] Ejecutando pruebas locales (npm run test)..."
cd "${LOCAL_DIR}"
if [[ ! -d node_modules ]]; then
  echo "ERROR: No existe node_modules. Ejecuta npm ci / npm install antes del deploy." >&2
  exit 1
fi
npm run test
echo ""
echo "✓ Pruebas OK — se permite continuar con el despliegue."
echo ""

# --- 2. Sincronizar código local → VPS (rsync) ---
echo "→ [2/4] Sincronizando archivos con rsync..."
rsync -avz --delete --delete-excluded \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.next' \
  --exclude '.env' \
  --exclude '.env.local' \
  --exclude '.env*.local' \
  --exclude 'tsconfig.tsbuildinfo' \
  --exclude '.DS_Store' \
  --exclude '*.wip.bak' \
  --exclude '* 2.*' \
  --exclude '* 2' \
  --exclude 'package-lock 2.json' \
  --exclude '.env 2.example' \
  --exclude '.env.local 2.example' \
  "${LOCAL_DIR}/" "${SSH_TARGET}:${REMOTE_DIR}/"

echo ""
echo "✓ Sincronización completada (se preservó .env en el servidor)."
echo ""

# --- 3. Rebuild + reinicio remoto vía SSH ---
echo "→ [3/4] Reconstruyendo imagen y reiniciando contenedor en el VPS..."
ssh "${SSH_TARGET}" bash -s <<REMOTE_SCRIPT
set -euo pipefail
cd "${REMOTE_DIR}"

echo "  · Verificando docker-compose.yml..."
if [[ ! -f docker-compose.yml ]]; then
  echo "ERROR: No se encontró docker-compose.yml en ${REMOTE_DIR}" >&2
  exit 1
fi

echo "  · Construyendo imagen Docker (sin caché)..."
docker compose build --no-cache

echo "  · Reiniciando servicio ${SERVICE_NAME} (puerto 3000)..."
docker compose up -d --force-recreate "${SERVICE_NAME}"

echo "  · Estado del contenedor:"
docker compose ps "${SERVICE_NAME}"
REMOTE_SCRIPT

echo ""
echo "✓ Contenedor reconstruido y reiniciado."
echo ""

# --- 4. Limpieza de imágenes huérfanas ---
echo "→ [4/4] Limpiando imágenes Docker antiguas (prune)..."
ssh "${SSH_TARGET}" "docker image prune -f"

echo ""
echo "=============================================="
echo "  ✓ Deploy finalizado correctamente"
echo "  App: http://${VPS_HOST}:3000"
echo "=============================================="
