# Protocolo de Rollback — Inbox Mobile Responsive

Objetivo: si algo se rompe al tocar viewport/shell/composer del Inbox móvil, volver al estado anterior sin improvisar y **sin mezclar** con el rollback de Accesibilidad Conversaciones.

## Baseline registrado

| Campo | Valor |
|-------|--------|
| Fecha | 2026-07-30 |
| Rama | `main` |
| **BASELINE_SHA** | `23155b3d0be33121626f50f3909f67158f630cc2` |
| **BASELINE_TAG** | `pre-inbox-mobile-responsive-20260730` |
| Commit mensaje | `fix(tests): use vitest imports for appointment and vehicle-title suites` |

Memoria de producto: [INBOX-MOBILE-RESPONSIVE.md](./INBOX-MOBILE-RESPONSIVE.md)

Track hermano (no confundir): [PROTOCOLO-ROLLBACK.md](./PROTOCOLO-ROLLBACK.md) — Accesibilidad Conversaciones  
Tag hermano: `pre-accesibilidad-conversaciones-20260730` @ `0ecdda038dd1f572e13729ec278786a5c52e2037`

> Nota: al momento del tag puede haber WIP local sin commitear. El tag apunta al **último commit**, no al working tree.

## 0. Checkpoint (ejecutado en Fase 0 / repetir si se vuelve a partir)

```bash
cd wacrm
git status
git rev-parse HEAD

# Tag inmutable (si aún no existe)
git tag -a pre-inbox-mobile-responsive-20260730 \
  -m "Baseline antes de Inbox mobile responsive (Fase 1 viewport)"

# Branch de trabajo (no codear la feature directo en main)
git checkout -b feature/inbox-mobile-responsive
```

Push opcional del tag:

```bash
git push origin refs/tags/pre-inbox-mobile-responsive-20260730
```

## 1. Niveles de rollback

### Nivel A — Solo código (Fases 1–5 esperadas) ← default

Estas fases son layout/CSS/shell/composer. **Sin migración DB**.

```bash
# Opción A1: volver al tag (CUIDADO: --hard borra cambios no commiteados)
git checkout main
git reset --hard pre-inbox-mobile-responsive-20260730

# Opción A2: revertir commits de la feature (más seguro si ya se compartió)
git revert --no-edit <sha1> <sha2> ...

# Opción A3: redeploy de la imagen/commit del tag baseline
# Usar SHA 23155b3d0be33121626f50f3909f67158f630cc2
```

### Nivel B — Con migración (no previsto)

Si alguien añade schema en este track (no debería):

1. **NO** borrar tablas en producción sin backup
2. Preferir rollback de app al tag + schema aditivo inerte
3. Migración de compensación solo con acuerdo explícito
4. Si el schema es de citas/deals → usar [PROTOCOLO-ROLLBACK.md](./PROTOCOLO-ROLLBACK.md) (Accesibilidad), no este

### Nivel C — Regresión funcional inbox (sin “corrupción” de datos)

Síntomas típicos tras un mal cambio de layout:

- Lista y thread visibles a la vez en móvil (o ninguno)
- “No messages yet” tras deep-link / re-click
- Overflow horizontal tapa sidebar desktop
- Composer cortado / teclado tapa input

Acción: rollback Nivel A + re-verificar checklist §2.  
No hace falta SQL salvo que también se hubiera tocado Accesibilidad en el mismo PR (evitar mezclar).

## 2. Verificación post-rollback

- [ ] Login OK
- [ ] Inbox carga conversaciones
- [ ] Mobile: stack lista ↔ chat (back in-app)
- [ ] Deep-link `/inbox?c=<id>` OK (mensajes no se wipean)
- [ ] Enviar mensaje WhatsApp de prueba (sandbox)
- [ ] Desktop `lg+`: lista + thread + contact sidebar
- [ ] Negocios / ficha / citas / notas (desktop Accesibilidad) OK
- [ ] Pipeline intacto
- [ ] Suite de tests verde
- [ ] Sin errores RLS nuevos en logs Supabase

## 3. Reglas de seguridad git

- NUNCA `push --force` a `main`/`master` sin pedido explícito del owner
- Preferir `git revert` si el commit ya está en remoto compartido
- `reset --hard` solo en branch local o con confirmación + tag previo
- No usar `--no-verify` en commits de fix/rollback
- No mezclar rollback de **este** track con WIP de oauth/round-robin/Accesibilidad (stash o branches)
- No usar el tag `pre-accesibilidad-conversaciones-*` para rollback de responsive (pierde Accesibilidad ya mergeada en tip)

## 4. Plan por fase

| Fase | Riesgo DB | Rollback preferido | Notas |
|------|-----------|--------------------|-------|
| 0 Contrato | Nulo | N/A | Solo docs + tag |
| 1 Viewport (`dvh`, main overflow) | Nulo | Tag + revert código | **Implementada** — shell + inbox + composer safe-area |
| 2 Ocultar Header en chat mobile | Nulo | Tag + revert | **Implementada** — `use-inbox-chrome` + Header `hidden lg:block` |
| 3 Composer mobile-first | Nulo | Tag + revert | **Implementada** — menú `+` `<sm`, Enter solo pointer fine |
| 4 Sheet CRM | Nulo* | Tag + revert | **Implementada** — Sheet + `ContactSidebar variant="sheet"` |
| 5 Pulido (slide/history) | Nulo | Tag + revert | **Implementada** — slide + push/Back sync + menú ⋯ |

## 5. Comandos rápidos de emergencia

```bash
# Ver el tag
git show pre-inbox-mobile-responsive-20260730 --no-patch

# Diff desde baseline hasta HEAD
git diff pre-inbox-mobile-responsive-20260730...HEAD

# Volver working tree al baseline (local, destructivo)
git switch --detach pre-inbox-mobile-responsive-20260730
# o en main:
# git reset --hard pre-inbox-mobile-responsive-20260730
```

## 6. Contacto de decisión

Si hay duda entre reset vs revert: **revert** en ramas ya pusheadas; **reset --hard al tag** solo en local o con acuerdo explícito.

Si la regresión es de deals/ficha/citas y no de layout mobile: usar el protocolo de Accesibilidad, no este.
