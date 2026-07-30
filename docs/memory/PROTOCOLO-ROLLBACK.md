# Protocolo de Rollback — Accesibilidad Conversaciones

Objetivo: si algo se rompe, volver al estado anterior a la feature sin improvisar.

## Baseline registrado

| Campo | Valor |
|-------|--------|
| Fecha | 2026-07-30 |
| Rama | `main` |
| **BASELINE_SHA** | `0ecdda038dd1f572e13729ec278786a5c52e2037` |
| **BASELINE_TAG** | `pre-accesibilidad-conversaciones-20260730` |
| Commit mensaje | `feat(mvp): disable public landing and route root to CRM login` |

Memoria de producto: [ACCESIBILIDAD-CONVERSACIONES.md](./ACCESIBILIDAD-CONVERSACIONES.md)

> Nota: al momento del tag puede haber WIP local sin commitear (oauth, round-robin, docs, etc.). El tag apunta al **último commit**, no al working tree. Ese WIP no forma parte del baseline de esta feature.

## 0. Checkpoint (ya ejecutado / repetir si se vuelve a partir)

```bash
cd wacrm
git status
git rev-parse HEAD

# Tag inmutable (si aún no existe)
git tag -a pre-accesibilidad-conversaciones-20260730 \
  -m "Baseline antes de Fase 1 negocios-inbox"

# Branch de trabajo (no codear la feature directo en main)
git checkout -b feature/inbox-crear-negocio
```

Push opcional del tag:

```bash
git push origin refs/tags/pre-accesibilidad-conversaciones-20260730
```

## 1. Niveles de rollback

### Nivel A — Solo código (sin migración nueva) ← Fase 1 esperada

Si Fase 1 no toca DB:

```bash
# Opción A1: volver al tag (CUIDADO: --hard borra cambios no commiteados)
git checkout main
git reset --hard pre-accesibilidad-conversaciones-20260730

# Opción A2: revertir commits de la feature (más seguro si ya se compartió)
git revert --no-edit <sha1> <sha2> ...

# Opción A3: redeploy de la imagen/commit del tag baseline (Docker/Nginx)
# Usar SHA 0ecdda038dd1f572e13729ec278786a5c52e2037
```

### Nivel B — Con migración nueva (Fase 3 citas, o si Fase 1 añadió columnas)

Supabase no “deshace” migraciones aplicadas en remoto automáticamente.

Protocolo:

1. **NO** borrar a mano tablas en producción sin backup
2. Crear migración de compensación `0XX_rollback_...sql` que:
   - quite columnas/tablas nuevas SOLO si no hay datos críticos, O
   - deje la tabla pero desactive la feature en código (feature flag / UI off)
3. Preferir **rollback de app** (código al tag) + dejar schema aditivo inerte
4. Si hay que restaurar DB: snapshot/backup de Supabase previo al deploy

Checklist pre-migración:

- [ ] Backup / punto de restauración Supabase documentado
- [ ] Migración solo aditiva cuando sea posible (`ADD COLUMN` / `CREATE TABLE`)
- [ ] Código feature-flaggeable o removable sin depender del schema

### Nivel C — Datos corruptos (deals mal creados)

```sql
-- Ejemplo diagnóstico (NO ejecutar a ciegas en prod)
SELECT id, title, contact_id, conversation_id, created_at
FROM deals
WHERE created_at >= '<timestamp_deploy>'
ORDER BY created_at DESC;
```

Borrado solo con confirmación del owner y filtro por `account_id`.

## 2. Verificación post-rollback

- [ ] Login OK
- [ ] Inbox carga conversaciones
- [ ] Enviar mensaje WhatsApp de prueba (sandbox)
- [ ] Pipeline: ver deals, drag stage, crear deal clásico
- [ ] Sidebar: notas siguen funcionando
- [ ] Jest suite verde (`npm test` / script del repo)
- [ ] Sin errores RLS en logs Supabase

## 3. Reglas de seguridad git

- NUNCA `push --force` a `main`/`master` sin pedido explícito del owner
- Preferir `git revert` si el commit ya está en remoto compartido
- `reset --hard` solo en branch local o con confirmación + tag previo
- No usar `--no-verify` en commits de fix/rollback
- No mezclar rollback de esta feature con otros WIP (usar stash/branches)

## 4. Plan por fase

| Fase | Riesgo DB | Rollback preferido |
|------|-----------|--------------------|
| 1 Negocios inbox | Bajo (sin migración ideal) | Tag + revert/reset código |
| 2 Ficha/tags | Bajo | Tag + revert código |
| 3 Citas | Alto (tabla + jobs WhatsApp) | Tag código + migración compensación / feature off |

### Notas Fase 3 (migración 043)

Si hay que desactivar citas sin borrar datos:

1. Rollback de código al tag / branch previa (quitar `/agenda`, UI sidebar, cron)
2. Dejar tabla `appointments` inerte (aditiva) O crear `044_rollback_appointments.sql` solo con acuerdo explícito
3. Cron: dejar de llamar `GET /api/appointments/cron`

## 5. Comandos rápidos de emergencia

```bash
# Ver el tag
git show pre-accesibilidad-conversaciones-20260730 --no-patch

# Diff desde baseline hasta HEAD
git diff pre-accesibilidad-conversaciones-20260730...HEAD

# Volver working tree al baseline (local, destructivo)
git switch --detach pre-accesibilidad-conversaciones-20260730
# o en main:
# git reset --hard pre-accesibilidad-conversaciones-20260730
```

## 6. Contacto de decisión

Si hay duda entre reset vs revert: **revert** en ramas ya pusheadas; **reset --hard al tag** solo en local o con acuerdo explícito.
