# Memoria: Accesibilidad Conversaciones (Ficha / Negocios / Citas)

Fecha de baseline: 2026-07-30  
Repo: `wacrm`  
Rama al baseline: `main`  
**BASELINE_SHA:** `0ecdda038dd1f572e13729ec278786a5c52e2037`  
**BASELINE_TAG:** `pre-accesibilidad-conversaciones-20260730`

Ver también: [PROTOCOLO-ROLLBACK.md](./PROTOCOLO-ROLLBACK.md)

## Objetivo de producto

Hacer operable desde Conversaciones, sin salir a Pipeline:

1. Crear/gestionar negocios (1 carro = 1 negocio)
2. Editar ficha + etiquetas (fase 2)
3. Agendar citas + agenda semanal + recordatorio WhatsApp 24h (fase 3)

## Spec cerrada con el usuario

### Fase 1 — Negocios desde Conversaciones (PRIORIDAD)

- UI: botón **+** en sección Negocios del panel derecho (`contact-sidebar`)
- Formulario campos sueltos: **marca, modelo, año, precio** (+ notas opcionales)
- Título auto: `MARCA MODELO – AÑO` (ej. `RENAULT R 9 BRIO – 1995`)
- Al crear: usuario elige **pipeline + etapa**
- Múltiples negocios abiertos por contacto (OK)
- Desde panel: poder **cambiar etapa**
- Debe aparecer en Pipeline sin salir del chat
- Reusar patrón de `deal-form.tsx`: insert Supabase con `user_id`, `account_id`, `status: "open"`, `parseDealValue`, `DEFAULT_CURRENCY`
- Decisión técnica: setear `conversation_id` al crear desde inbox (columna ya existe; hoy no se usa en UI)

### Fase 2 — Ficha + etiquetas

- Inline edit **SOLO**: nombre, email, empresa
- Agregar/quitar etiquetas
- Teléfono **NO** editable (clave WhatsApp / `phone_normalized`)

### Fase 3 — Citas

- Tipos: ver en sala, prueba de manejo, llamada, entrega, otra
- Campos: fecha/hora, duración, lugar, agente, negocio opcional, recordatorio
- Vistas: panel Conversaciones + Agenda global semanal (calendario) con filtro agente
- Cita puede existir **sin** negocio
- Recordatorio WhatsApp **24h antes** → cliente **Y** agente
- Reagendar/cancelar/actualizar desde Conversaciones
- Requiere migración nueva (tabla appointments) — **NO existe hoy**
- Siguiente número de migración libre post-042: **043+**

## Baseline del sistema (NO romper)

### Contact sidebar hoy

Archivo: `src/components/inbox/contact-sidebar.tsx`

- Lee deals, notes, tags
- Solo WRITE: `contact_notes`
- NO crea deals, NO edita contact, NO gestiona tags

### Creación de deals hoy

- UI: `src/components/pipelines/deal-form.tsx` (+ board/page)
- Automations: `src/lib/automations/engine.ts` step `create_deal`
- Sin API REST de deals
- Payload create: `title`, `value`, `currency`, `contact_id`, `pipeline_id`, `stage_id`, `assigned_to`, `notes`, `expected_close_date`, `user_id`, `account_id`, `status=open`
- NO escribe `conversation_id` hoy

### Schema relevante

- `contacts`: name, phone, email, company, account_id, phone_normalized
- `deals`: account_id, pipeline_id, stage_id, contact_id (nullable SET NULL), conversation_id (nullable, poco usado), title, value, currency=COP, status
- RLS deals: member select; agent+ write
- Pipelines/stages: stages modify = admin+

### i18n Inbox.sidebar (en + es-CO)

Keys existentes: `contactInfo`, `tags`, `notes`, `deals`, `noTags`, `noDeals`, `addNotePlaceholder`  

Nuevas keys deben ir a ambos idiomas (+ script `build-es-co` si aplica).

### Tests a no romper

- `src/lib/currency.test.ts`
- `src/lib/automations/validate.test.ts`
- `src/lib/auth/roles.test.ts`
- `src/lib/inbox/conversations.test.ts`
- `src/lib/contacts/dedupe.test.ts`

## Reglas anti-rotura

1. No cambiar RLS ni schema de deals en Fase 1 salvo necesidad real
2. No editar teléfono del contacto en Fase 2
3. No inventar API de deals si el patrón cliente Supabase funciona
4. Reusar `parseDealValue` / COP enteros
5. Gate permisos = mismo que pipeline (agent+ / send-messages)
6. No mezclar Fase 3 (citas) en el mismo PR que Fase 1
7. Migraciones solo forward; rollback de schema vía protocolo (ver ROLLBACK.md)
8. Antes de implementar: tag git de seguridad ya creado (ver ROLLBACK.md)

## Flujo ideal usuario

Chat → crear negocio (carro) → agenda cita (fase 3) → ajustar ficha/etiquetas (fase 2)

## Archivos tocados previstos (Fase 1)

- `src/components/inbox/contact-sidebar.tsx` (principal)
- Posible extracción/reuso de form deal o mini-form carro
- `messages/en.json`, `messages/es-CO.json`
- Tests nuevos preferibles para armado de título / insert payload
- Opcional: tipar/usar `conversation_id` en `Deal`

## Estado implementación Fase 1

- Branch: `feature/inbox-crear-negocio`
- Status: implementado (UI + helper + i18n + tests unitarios de título)
- Archivos:
  - `src/lib/deals/vehicle-title.ts` (+ `.test.ts`)
  - `src/components/inbox/inbox-deal-form.tsx`
  - `src/components/inbox/contact-sidebar.tsx` (+ crear / cambiar etapa)
  - `src/app/(dashboard)/inbox/page.tsx` (pasa `conversationId`)
  - `messages/en.json`, `messages/es-CO.json`, `scripts/build-es-co.mjs`

## Estado implementación Fase 2

- Status: implementado
- Inline edit: nombre, email, empresa (clic → editar → Enter/blur guarda; Esc cancela)
- Teléfono: solo lectura + copiar
- Etiquetas: + para picker, X para quitar
- Sync a lista/header vía `onContactUpdated` en inbox page
- Permisos: `send-messages` (agent+)

## Estado implementación Fase 3

- Status: implementado
- Migración: `043_appointments.sql` (aplicada en Supabase remoto)
- UI Conversaciones: sección Citas + formulario create/edit/cancel
- Agenda global: `/agenda` vista semanal + filtro agente
- Recordatorios: cron `GET /api/appointments/cron` con `x-cron-secret` = `AUTOMATION_CRON_SECRET`
  - Cliente: WhatsApp texto vía conversación
  - Agente: notificación in-app (`appointment_reminder`) — profiles no tienen teléfono WhatsApp
- Helpers/tests: `src/lib/appointments/helpers.ts`

## Fuera de alcance Fase 1

- Edición de ficha
- Tags editables
- Calendario / appointments
- Inventario de vehículos como entidad separada (por ahora título texto)
