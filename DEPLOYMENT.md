# Despliegue en producción — REVIO CRM

Guía para operadores que despliegan el CRM en un **VPS propio** con **Docker**. Supabase (Postgres + Auth) se ejecuta en la nube; esta guía cubre únicamente la aplicación Next.js.

---

## 1. Requerimientos de infraestructura

### Servidor VPS (mínimo recomendado)

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| CPU | 2 vCPU | 4 vCPU |
| RAM | 2 GB | 4 GB |
| Disco | 20 GB SSD | 40 GB SSD |
| SO | Ubuntu 22.04+ / Debian 12+ | Ubuntu 24.04 LTS |
| Red | IP pública, puertos 80/443 | + dominio con DNS A/AAAA |

### Software en el VPS

- **Docker** 24+ y **Docker Compose** v2 (`docker compose`)
- **Git** (para clonar el repositorio)
- **Reverse proxy** con TLS (Nginx, Caddy o Traefik) apuntando al contenedor en `:3000`
- Cuenta **Supabase** con migraciones `001`–`040` aplicadas
- App **Meta for Developers** con webhook HTTPS hacia `https://<dominio>/api/whatsapp/webhook`
- Cuenta **Wompi** (producción) con llaves `pub_prod_…` e integridad de producción

### Servicios externos (no van en Docker)

| Servicio | Rol |
|----------|-----|
| Supabase | Postgres, Auth, Storage, Realtime |
| Meta Cloud API | WhatsApp Business |
| Wompi | Pagos COP (Web Checkout) |
| Cron externo (opcional) | `GET /api/automations/cron` y `/api/flows/cron` con `AUTOMATION_CRON_SECRET` |

---

## 2. Preparar el build standalone

Next.js debe generar salida **standalone** para imágenes Docker optimizadas.

### 2.1 Salida standalone

El proyecto ya incluye `output: "standalone"` en `next.config.ts`. No requiere cambios adicionales antes del build Docker.

### 2.2 Aplicar migraciones Supabase

Desde la raíz del proyecto (`wacrm/`):

```bash
# Con Supabase CLI vinculado al proyecto remoto
supabase db push

# O ejecutar manualmente cada archivo en supabase/migrations/ en orden numérico
```

Verifique que existan las tablas `accounts`, `transactions`, etc.

---

## 3. Construir la imagen Docker

### 3.1 Archivos incluidos en el repositorio

| Archivo | Propósito |
|---------|-----------|
| `Dockerfile` | Build multi-stage → `node server.js` (standalone) |
| `docker-compose.yml` | Servicio `revio-crm` en puerto 3000 |
| `.dockerignore` | Excluye `node_modules`, `.next`, secretos locales |

### 3.2 Build de la imagen

```bash
cd wacrm

# Copiar plantilla de variables y completar valores reales
cp .env.example .env
# Editar .env con sus secretos (nunca commitear .env)

# Construir imagen (usa args del docker-compose)
docker compose build --no-cache

# Alternativa directa con docker build
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co" \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJ…" \
  --build-arg NEXT_PUBLIC_SITE_URL="https://crm.su-dominio.com" \
  --build-arg NEXT_PUBLIC_WOMPI_ENV="production" \
  --build-arg NEXT_PUBLIC_WOMPI_PUBLIC_KEY="pub_prod_…" \
  -t revio-crm:latest .
```

El comando interno ejecutado es **`npm run build`** → `next build`, que con `output: 'standalone'` genera `.next/standalone/server.js`.

---

## 4. Comandos Docker Compose (producción)

```bash
cd wacrm

# Levantar en segundo plano
docker compose up -d

# Ver logs
docker compose logs -f revio-crm

# Reiniciar tras cambio de .env
docker compose up -d --force-recreate

# Detener (contenedor sigue existiendo)
docker compose stop

# Detener y eliminar contenedor + red (no borra la imagen)
docker compose down

# Detener, eliminar contenedor e imagen local
docker compose down --rmi local
```

### Post-despliegue

1. Configure el proxy inverso con TLS hacia `127.0.0.1:3000`.
2. En Meta for Developers, URL del webhook: `https://<dominio>/api/whatsapp/webhook`.
3. Verifique `GET` de verificación Meta (token en Settings → WhatsApp).
4. En Wompi producción, confirme llaves y dominio permitido del widget.
5. (Opcional) Cron cada minuto:
   ```bash
   curl -fsS -H "Authorization: Bearer $AUTOMATION_CRON_SECRET" \
     https://<dominio>/api/automations/cron
   curl -fsS -H "Authorization: Bearer $AUTOMATION_CRON_SECRET" \
     https://<dominio>/api/flows/cron
   ```

---

## 5. Variables de entorno (aplicación principal)

Copie `.env.example` → `.env` en el servidor. **Nunca** suba secretos a Git.

### 5.1 Obligatorias

| Variable | Expuesta al cliente | Descripción |
|----------|---------------------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Sí | URL del proyecto Supabase (`https://xxx.supabase.co`). Usada por cliente SSR y middleware. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Sí | Clave anónima Supabase. Respeta RLS; segura en el browser. |
| `SUPABASE_SERVICE_ROLE_KEY` | **No** | Clave service-role. Bypass RLS. Solo servidor: webhook WhatsApp, motores, API keys. **Secreto crítico.** |
| `ENCRYPTION_KEY` | **No** | 64 caracteres hex (32 bytes). AES-256-GCM para tokens WhatsApp, secretos de webhooks e IA. Rotar invalida tokens previos. |
| `META_APP_SECRET` | **No** | App Secret de Meta. Verifica `X-Hub-Signature-256` en cada POST del webhook WhatsApp. |

### 5.2 Recomendadas (producción)

| Variable | Expuesta al cliente | Descripción |
|----------|---------------------|-------------|
| `NEXT_PUBLIC_SITE_URL` | Sí | URL canónica pública (`https://crm.ejemplo.com`, sin `/` final). Sitemap, OG, enlaces de invitación cuando no hay request HTTP. |
| `NEXT_PUBLIC_APP_LOCALE` | Sí | Locale BCP-47 (`es-CO` para Colombia). Default interno: `en`. |
| `WOMPI_ENV` | No | Ambiente Wompi server-side: `sandbox` \| `production`. Default: `production` si `NODE_ENV=production`. |
| `NEXT_PUBLIC_WOMPI_ENV` | Sí | Ambiente Wompi en el browser (debe coincidir con las llaves). |
| `NEXT_PUBLIC_WOMPI_PUBLIC_KEY` | Sí | Llave pública Wompi (`pub_test_…` o `pub_prod_…`). Widget Web Checkout. |
| `WOMPI_INTEGRITY_SECRET` | **No** | Secreto de integridad Wompi. Firma SHA-256 del checkout server-side. |

### 5.3 Runtime Docker / Node

| Variable | Expuesta al cliente | Descripción |
|----------|---------------------|-------------|
| `NODE_ENV` | No | Debe ser `production` en el contenedor. |
| `PORT` | No | Puerto HTTP interno del servidor Next standalone. Default `3000`. |
| `HOSTNAME` | No | Bind address. Use `0.0.0.0` en Docker para aceptar tráfico del proxy. |

### 5.4 Opcionales — funcionalidades específicas

| Variable | Expuesta al cliente | Descripción |
|----------|---------------------|-------------|
| `ALLOWED_INVITE_HOSTS` | No | Lista CSV de hostnames permitidos en URLs de invitación (defensa extra si no usa `NEXT_PUBLIC_SITE_URL`). |
| `AUTOMATION_CRON_SECRET` | **No** | Bearer secret para `GET /api/automations/cron` y `/api/flows/cron`. Requerido si usa pasos Wait en automatizaciones o flows programados. |
| `META_APP_ID` | No | App ID de Meta. Requerido para plantillas con encabezado IMAGE (Resumable Upload). |
| `WHATSAPP_TEMPLATES_DRY_RUN` | No | `true`/`1`: omite Meta al enviar plantillas (solo dev/CI). **No usar en producción.** |
| `AI_REQUEST_TIMEOUT_MS` | No | Timeout por llamada a OpenAI/Anthropic. Default `30000`. |
| `AI_CONTEXT_MESSAGE_LIMIT` | No | Mensajes de contexto enviados al modelo. Default `20`. |

### 5.5 Servidor MCP (despliegue separado)

El paquete en `mcp-server/` es opcional. Variables en `mcp-server/.env`:

| Variable | Descripción |
|----------|-------------|
| `WACRM_BASE_URL` | URL base del CRM desplegado |
| `WACRM_API_KEY` | API key creada en Settings → API keys |
| `WACRM_ENABLE_WRITES` | `true` para herramientas de escritura |
| `WACRM_ENABLE_BROADCASTS` | `true` para envíos masivos vía MCP |

---

## 6. Checklist de producción

- [ ] Migraciones Supabase 001–040 aplicadas
- [ ] `output: 'standalone'` en `next.config.ts` (ya configurado)
- [ ] `.env` completo con variables obligatorias + Wompi producción
- [ ] `docker compose build` exitoso
- [ ] `docker compose up -d` + healthcheck OK
- [ ] TLS terminado en proxy (HTTPS obligatorio para Meta)
- [ ] Webhook Meta verificado
- [ ] Prueba de checkout Wompi sandbox → producción
- [ ] Cron de automatizaciones configurado (si aplica)
- [ ] Backups Supabase activos

---

## 7. Alternativas de despliegue

Este repositorio también se despliega en **Hostinger Managed Node.js** sin Docker (ver [README.md](./README.md)). Docker + VPS ofrece control total del runtime y es la vía documentada aquí para operadores que autogestionan infraestructura.

---

## 8. Solución de problemas

| Síntoma | Causa probable |
|---------|----------------|
| Build falla en CI/Docker | Faltan `NEXT_PUBLIC_*` o placeholders `ENCRYPTION_KEY` / `META_APP_SECRET` en build |
| Webhook Meta 401 | `META_APP_SECRET` incorrecto o body alterado por proxy |
| Widget Wompi error de firma | `WOMPI_INTEGRITY_SECRET` no coincide con el monto/referencia del backend |
| Sesiones que expiran tras idle | Proxy que elimina cookies; revisar middleware y `Set-Cookie` |
| Checkout 503 | Llaves Wompi mal emparejadas (`pub_test_` vs `test_integrity_`) |

Ver también [ARCHITECTURE.md](./ARCHITECTURE.md) para flujos WhatsApp y pagos.
