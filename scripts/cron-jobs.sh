#!/usr/bin/env bash
# =============================================================================
# cron-jobs.sh — Ping all REVIO CRM cron endpoints (VPS crontab helper)
#
# Usage:
#   export AUTOMATION_CRON_SECRET='…'
#   export CRM_BASE_URL='https://crm.revio.com.co'
#   bash scripts/cron-jobs.sh
#
# Crontab example (every minute):
#   * * * * * AUTOMATION_CRON_SECRET='…' CRM_BASE_URL='https://crm.revio.com.co' /path/to/wacrm/scripts/cron-jobs.sh >> /var/log/revio-cron.log 2>&1
# =============================================================================
set -euo pipefail

BASE="${CRM_BASE_URL:-https://crm.revio.com.co}"
SECRET="${AUTOMATION_CRON_SECRET:-}"

if [[ -z "$SECRET" ]]; then
  echo "ERROR: AUTOMATION_CRON_SECRET no está definido." >&2
  exit 1
fi

AUTH=(-H "x-cron-secret: ${SECRET}")

endpoints=(
  "/api/automations/cron"
  "/api/flows/cron"
  "/api/appointments/cron"
  "/api/sla/cron"
)

for path in "${endpoints[@]}"; do
  url="${BASE}${path}"
  echo "[$(date -Iseconds)] GET ${url}"
  curl -fsS "${AUTH[@]}" "$url"
  echo
done
