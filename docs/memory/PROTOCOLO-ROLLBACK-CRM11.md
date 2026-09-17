# Protocolo de Rollback — CRM 1.1

Objetivo: si algo falla tras el deploy de CRM 1.1, volver a la app anterior
sin borrar datos. Las migraciones 052–057 son **aditivas**; el rollback de
app deja el schema inerte.

## Baseline registrado (producción antes de CRM 1.1)

| Campo | Valor |
|-------|--------|
| Fecha | 2026-09-17 |
| Rama | `main` |
| **BASELINE_SHA** | `3e1973f24958d4e386de99054ea251aa50116c80` |
| **BASELINE_TAG** | `pre-crm11-20260917` |
| Commit mensaje | `feat(inventory): catálogo de vehículos, selector en deals y búsqueda` |

Release CRM 1.1:

| Campo | Valor |
|-------|--------|
| **RELEASE_TAG** | `v0.10.0-crm11` |
| Versión npm | `0.10.0` |

## 1. Rollback de código (recomendado)

```bash
cd wacrm

# Opción A — checkout del tag baseline y redeploy
git fetch origin --tags
git checkout pre-crm11-20260917
bash deploy.sh

# Opción B — desde main remoto al SHA baseline
git checkout main
git reset --hard 3e1973f24958d4e386de99054ea251aa50116c80
bash deploy.sh
```

## 2. Desactivar CRM 1.1 sin redeploy (rápido)

En Supabase o Settings → CRM 1.1, poner todos los flags en `false`:

- `crm11_dashboard`, `crm11_inbox_ops`, `crm11_funnel`, `crm11_sla`,
  `crm11_locations`, `crm11_required_fields`

La UI y cron SLA dejan de aplicar lógica nueva; el código antiguo ignora columnas extra.

## 3. Rollback de base de datos (solo emergencia)

**No** eliminar tablas en caliente. Migraciones 052–057 añaden columnas/tablas;
revertir requiere migración de compensación y backup previo.

Checklist:

- [ ] Snapshot Supabase antes del deploy
- [ ] Preferir rollback de app + flags off
- [ ] SLA/cron: quitar `/api/sla/cron` del crontab si se vuelve al baseline

## 4. Verificación post-rollback

```bash
curl -fsS https://crm.revio.com.co/api/health
docker compose -f /root/wacrm/docker-compose.yml ps revio-crm
```
