# Memoria: Inbox Mobile Responsive (estilo WhatsApp)

Fecha de baseline: 2026-07-30  
Repo: `wacrm`  
Rama al baseline: `main`  
**BASELINE_SHA:** `23155b3d0be33121626f50f3909f67158f630cc2`  
**BASELINE_TAG:** `pre-inbox-mobile-responsive-20260730`

Ver también:

- [PROTOCOLO-ROLLBACK-INBOX-MOBILE.md](./PROTOCOLO-ROLLBACK-INBOX-MOBILE.md)
- [ACCESIBILIDAD-CONVERSACIONES.md](./ACCESIBILIDAD-CONVERSACIONES.md) — CRM lateral (negocios/ficha/citas); **desktop hoy**
- [PROTOCOLO-ROLLBACK.md](./PROTOCOLO-ROLLBACK.md) — rollback de Accesibilidad Conversaciones (track separado)

## Objetivo de producto

Que el Inbox en móvil se sienta como una app de chat (WhatsApp): lista → hilo a pantalla útil, composer siempre alcanzable, sin scroll/altura rotos — **sin reescribir** realtime, deep-link ni el panel desktop.

## Fase 0 — Contrato congelado (ESTADO: ejecutada)

Esta fase **no cambia UI ni código de producto**. Solo:

1. Baseline git (tag + branch de trabajo)
2. Documentar arquitectura actual y load-bearing invariants
3. Checklist de no-regresión por fases posteriores
4. Separar este track del de Accesibilidad Conversaciones

### Checkpoint ejecutado

| Campo | Valor |
|-------|--------|
| Tag | `pre-inbox-mobile-responsive-20260730` |
| SHA | `23155b3d0be33121626f50f3909f67158f630cc2` |
| Branch de trabajo | `feature/inbox-mobile-responsive` |
| Commit mensaje del tip | `fix(tests): use vitest imports for appointment and vehicle-title suites` |

> Nota: al momento del tag puede haber WIP local sin commitear (oauth, round-robin, docs, etc.). El tag apunta al **último commit**, no al working tree. Ese WIP no forma parte del baseline de esta feature.

## Baseline del sistema (NO romper)

### Arquitectura actual

Un **solo layout adaptativo** (no hay árbol mobile separado). Breakpoint decisivo: Tailwind `lg` (1024px).

```
DashboardShell (h-screen)
├── Sidebar          → drawer <lg; estático lg+
├── Header h-14      → hamburger + título (siempre visible hoy)
└── main (p-4 / sm:p-6, overflow-y-auto)
    └── InboxPage  h-[calc(100vh-3.5rem)]  (-m-4 / sm:-m-6)
        ├── [banner WhatsApp desconectado]
        └── flex row overflow-hidden
            ├── ConversationList   <lg: fullscreen si NO hay conv
            ├── MessageThread      <lg: fullscreen si HAY conv + back
            └── ContactSidebar     solo lg+ (hidden lg:block)
```

Stack mobile: un panel a la vez vía `hidden` / `flex` / `lg:flex` + `hasActiveConv`.  
Comentarios en código hablan de “slides”; en realidad es show/hide instantáneo.

### Archivos load-bearing

| Archivo | Rol | Contrato |
|---------|-----|----------|
| `src/app/(dashboard)/inbox/page.tsx` | Orquestador; stack mobile; realtime; deep-link `?c=` | No mover handlers realtime “de paso” |
| `src/app/(dashboard)/dashboard-shell.tsx` | `h-screen`, sidebar drawer, main padding | Altura inbox acoplada a header `h-14` |
| `src/components/layout/header.tsx` | Header fijo `h-14` | Doble chrome con thread header en móvil |
| `src/components/inbox/conversation-list.tsx` | Lista; `w-full` / `lg:w-80`; ScrollArea `min-h-0` | #229 |
| `src/components/inbox/message-thread.tsx` | Thread + back `lg:hidden` + composer | `min-w-0` #257 |
| `src/components/inbox/message-composer.tsx` | Envío; Enter-to-send; fila de iconos densa | Desktop + mobile mismo componente |
| `src/components/inbox/contact-sidebar.tsx` | Ficha/tags/deals/citas/notas | **Solo desktop** (`hidden lg:block`) |
| `src/hooks/use-realtime.ts` | Canal inbox | No acoplar a clases CSS |
| `src/lib/inbox/conversations.ts` (+ `.test.ts`) | Normalize/select | Suite a no romper |

### Invariants (NO tocar a la ligera)

1. **Stack mobile** — `hasActiveConv` + clases `hidden` / `flex` / `lg:flex` en wrappers de lista y thread. Mal cambio = lista y chat a la vez o ninguno.
2. **`min-w-0` / `min-h-0`** — load-bearing para overflow (#165, #229, #257). No quitar al “limpiar clases”.
3. **Deep-link `?c=`** — `router.replace` (no `push` hoy); refs `autoSelectedForDeepLinkRef` / anti-wipe de `setMessages([])` cuando `conversationId` no cambia (#105/#106).
4. **Select / close** — `handleSelectConversation` early-return si misma conv; `handleCloseConversation` limpia estado + `replace("/inbox")`.
5. **Realtime + resyncToken** — vive en `inbox/page.tsx`; refactors de layout no deben mover esa lógica sin tests.
6. **Contact sidebar desktop** — Accesibilidad Conversaciones (Fases 1–3) depende de este panel. No “arreglar mobile” forzando el sidebar fijo en `<lg`. Sheet/drawer = Fase 4 de *este* track, reutilizando el mismo componente.
7. **Sin migración DB** en Fases 1–3 de responsive (solo layout/CSS/shell). Cualquier schema → protocolo Accesibilidad / migraciones aparte.

### Problemas conocidos al baseline (motivación)

| Problema | Detalle |
|----------|---------|
| `100vh` / `h-screen` | Chrome del browser móvil cambia viewport; no hay `dvh`/`svh` en inbox |
| Doble header | Header app + header thread |
| Teclado virtual | Sin `visualViewport`; composer puede quedar tapado |
| Safe areas | Sin `env(safe-area-inset-*)` |
| Composer denso | Muchos iconos en fila; hint `pl-[5.5rem]` asume desktop |
| CRM lateral | Inaccesible en móvil (choca con Accesibilidad Conversaciones en phone) |
| Historial browser | `replace` → atrás del SO no hace lista←chat |
| Banner WA | Resta altura sin recalcular el `calc(100vh-3.5rem)` |

### Patrón WhatsApp — estado al baseline

| Patrón | Estado |
|--------|--------|
| Stack lista → chat | Sí (`<lg`) |
| Fullscreen sin chrome CRM | No |
| Back a lista | Sí (in-app) |
| Composer abajo | Sí (flex; no fixed) |
| Deep-link hilo | Sí `?c=` |
| Long-press acciones | Sí |
| `dvh` + teclado + safe-area | No |
| Sheet CRM móvil | No |
| Slide animation | No |

## Plan por fases (post Fase 0)

| Fase | Qué | Riesgo | DB |
|------|-----|--------|-----|
| **0** | Contrato + tag + branch | Nulo | No |
| **1** | Viewport: `dvh`, `flex-1 min-h-0`, main overflow inbox, safe-area | Bajo | No |
| **2** | Ocultar Header app (y chrome) al abrir chat en `<lg` | Medio (acopla shell↔inbox) | No |
| **3** | Composer mobile-first (menú `+`, Enter-to-send) | Medio (mismo componente desktop) | No |
| **4** | Sheet/Drawer reutilizando `ContactSidebar` | Medio-alto (UI densa + Accesibilidad) | No* |
| **5** | Pulido: slide, history `push` cuidadoso, menú `⋯` header | Bajo-medio | No |

\*Fase 4 no debería requerir migración; reusa UI de Accesibilidad. Si alguna vez tocara schema, usar el protocolo de Accesibilidad.

### Fuera de alcance (hasta acuerdo explícito)

- App PWA / Capacitor / layout mobile paralelo
- Ruta nueva `/inbox/[id]` como primer paso
- Reescribir realtime o mover estado fuera de `page.tsx` “de paso”
- Forzar `contact-sidebar` como panel permanente en móvil
- Mezclar PRs con nuevas features de Accesibilidad Conversaciones

## Reglas anti-rotura

1. Un PR / fase; no mezclar Fase 1 viewport con Fase 4 Sheet CRM
2. Desktop `lg+` debe quedar visual y funcionalmente igual tras cada fase (salvo bugs colaterales documentados)
3. No quitar `min-w-0` / `min-h-0` / guards de deep-link
4. No cambiar `router.replace` → `push` hasta Fase 5 con checklist anti-wipe
5. i18n: nuevas keys en `en` + `es-CO` (+ `build-es-co` si aplica)
6. Antes de implementar Fase 1+: tag de seguridad ya creado (este doc)
7. Rollback: ver [PROTOCOLO-ROLLBACK-INBOX-MOBILE.md](./PROTOCOLO-ROLLBACK-INBOX-MOBILE.md)
8. Track Accesibilidad es **independiente**; no hacer `reset --hard` de un track para arreglar el otro si ambos tienen commits en la misma branch

## Relación con Accesibilidad Conversaciones

- Accesibilidad Fases 1–3 **ya implementadas** en tip cercano al baseline (`8c25b73` y siguientes).
- Su UI CRM vive en `contact-sidebar` (**desktop only**).
- Este track **no deshace** deals/ficha/citas.
- Fase 4 mobile (Sheet) es el puente para operar esa misma UI en phone; hasta entonces, accesibilidad CRM en móvil sigue siendo gap conocido.

## Tests / checklist a no romper

### Automatizados

- `src/lib/inbox/conversations.test.ts`
- Suites Accesibilidad ya verdes: vehicle-title, appointments helpers, currency, roles, etc.
- No hay E2E de layout mobile al baseline — la verificación es **manual** (abajo).

### Manual por fase (mínimo)

- [ ] Login OK
- [ ] Inbox: lista carga conversaciones
- [ ] Mobile `<lg`: tap conv → solo thread; back → solo lista
- [ ] Deep-link `/inbox?c=<id>` abre el hilo sin “No messages yet” fantasma
- [ ] Enviar mensaje WhatsApp de prueba (sandbox)
- [ ] Desktop `lg+`: lista + thread (+ sidebar si abierto) lado a lado
- [ ] Toggle panel contacto desktop (#258) sigue OK
- [ ] Sidebar notas / negocios / ficha / citas (desktop) intactos
- [ ] Jest/Vitest suite verde
- [ ] Sin errores RLS nuevos en logs Supabase

### Extra post Fase 1–2 (mobile)

- [ ] Composer visible con barra URL iOS/Android
- [ ] Composer usable con teclado abierto
- [ ] Safe area / home indicator no tapa Send
- [ ] Banner “WhatsApp no conectado” no rompe altura del stack

## Estado implementación

| Fase | Status |
|------|--------|
| 0 Contrato / baseline | **Ejecutada** (docs + tag + branch) |
| 1 Viewport / altura | **Ejecutada** (ver abajo) |
| 2 Chrome fullscreen chat | **Ejecutada** (ver abajo) |
| 3 Composer mobile-first | **Ejecutada** (ver abajo) |
| 4 Sheet CRM | **Ejecutada** (ver abajo) |
| 5 Pulido | **Ejecutada** (ver abajo) |

## Estado implementación Fase 1

- Branch: `feature/inbox-mobile-responsive`
- Status: implementado (viewport / altura / safe-area; sin tocar stack ni realtime)
- Cambios:
  - `src/app/layout.tsx` — `viewportFit: "cover"` para `env(safe-area-inset-*)`
  - `src/app/(dashboard)/dashboard-shell.tsx` — `h-dvh`; en `/inbox` main `overflow-hidden p-0` + flex column `min-h-0`; resto de rutas igual (padding + scroll)
  - `src/app/(dashboard)/inbox/page.tsx` — quita `h-[calc(100vh-3.5rem)]` y `-m-*`; usa `h-full min-h-0 flex-1`; wrappers con `min-h-0`
  - `src/components/inbox/message-composer.tsx` — `shrink-0` + padding bottom con safe-area
  - `src/components/inbox/conversation-list.tsx` — `min-h-0` + safe-area bottom en mobile (`lg:pb-0`)
- Invariants intactos: `hasActiveConv` toggle, deep-link `replace`, `min-w-0`, contact-sidebar `hidden lg:block`, realtime
- Manual QA pendiente (device real / DevTools device mode): checklist § Extra post Fase 1–2

## Estado implementación Fase 2

- Branch: `feature/inbox-mobile-responsive`
- Status: implementado (chrome immersive; sin tocar stack toggle, deep-link ni realtime)
- Cambios:
  - `src/hooks/use-inbox-chrome.tsx` — contexto `mobileChatOpen` / `setMobileChatOpen`
  - `src/app/(dashboard)/dashboard-shell.tsx` — `InboxChromeProvider`; oculta Header con `hidden lg:block` si `mobileChatOpen`; cierra drawer al abrir chat
  - `src/app/(dashboard)/inbox/page.tsx` — sync `hasActiveConv` → chrome; cleanup `false` al unmount
  - `src/components/inbox/message-thread.tsx` — safe-area top en header del thread (`max-lg`)
  - `src/components/layout/header.tsx` — safe-area top cuando el Header sí se muestra (lista móvil)
- Desktop `lg+`: Header siempre visible (wrapper `lg:block`)
- Invariants intactos: `hasActiveConv` panes, `replace` deep-link, contact-sidebar desktop-only

## Estado implementación Fase 3

- Branch: `feature/inbox-mobile-responsive`
- Status: implementado (composer mobile-first; mismo componente, sin fork)
- Cambios en `src/components/inbox/message-composer.tsx`:
  - `<sm`: un solo menú `+` (media, interactivo, quick replies, plantilla, IA)
  - `sm+`: fila de iconos histórica (clip / + / plantilla / IA)
  - Textarea `min-w-0` + padding más compacto en mobile
  - Hint `draftHint` + `pl-[5.5rem]` solo `sm+`
  - Enter-to-send solo con `(pointer: fine)`; en touch Enter = newline
  - `enterKeyHint="enter"` para teclados soft
- Sin cambios i18n (reusa keys existentes)
- Desktop / trackpad: Enter sigue enviando; Shift+Enter newline

## Estado implementación Fase 4

- Branch: `feature/inbox-mobile-responsive`
- Status: implementado (Sheet CRM; reusa `ContactSidebar`, sin duplicar forms)
- Cambios:
  - `contact-sidebar.tsx` — prop `variant: "panel" | "sheet"`
  - `message-thread.tsx` — botón Info (`lg:hidden`) + Sheet con `ContactSidebar variant="sheet"`; cierra al cambiar conv
  - `inbox/page.tsx` — pasa `onContactUpdated` al thread
  - i18n `Inbox.messageThread.contactDetails` / `contactDetailsAria` (en + es-CO)
- Desktop rail + toggle #258 intactos
- Accesibilidad (ficha/negocios/citas/notas) operable desde móvil vía Sheet

## Estado implementación Fase 5

- Branch: `feature/inbox-mobile-responsive`
- Status: implementado (slide + history + menú ⋯)
- Cambios:
  - `inbox/page.tsx` — slide `translate-x` lista↔thread en `<lg` (ambos montados); `push` al abrir desde lista, `replace` al cambiar hilo; sync browser Back (`prevDeepLinkRef` string→null cierra sin wipe race); in-app back sigue con `replace("/inbox")`
  - `message-thread.tsx` — menú `⋯` móvil (status / assign / refresh); controles inline solo `lg+`
  - i18n `moreActions` / `moreActionsAria` (en + es-CO)
- Anti-wipe: `autoSelectedForDeepLinkRef` antes del push; efecto Back solo en transición id→null; skip primer run
- Desktop `lg+`: sin slide, header con status/assign/refresh como antes
