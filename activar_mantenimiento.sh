#!/usr/bin/env bash
# =============================================================================
# activar_mantenimiento.sh — Activa la página de mantenimiento en el VPS
#
# 1. Copia mantenimiento.html → /var/www/html/
# 2. Inserta (idempotente) la lógica 503 en /etc/nginx/sites-available/revio
# 3. Valida la config y hace reload de Nginx
#
# Apagar después (sin tocar Nginx de nuevo):
#   ssh root@31.97.13.219 \
#     'mv /var/www/html/mantenimiento.html /var/www/html/mantenimiento.html.off'
#
# Encender de nuevo:
#   ssh root@31.97.13.219 \
#     'mv /var/www/html/mantenimiento.html.off /var/www/html/mantenimiento.html'
# =============================================================================
set -euo pipefail

VPS_USER="root"
VPS_HOST="31.97.13.219"
SSH_TARGET="${VPS_USER}@${VPS_HOST}"

NGINX_SITE="/etc/nginx/sites-available/revio"
REMOTE_HTML_DIR="/var/www/html"
REMOTE_HTML_PATH="${REMOTE_HTML_DIR}/mantenimiento.html"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_HTML="${SCRIPT_DIR}/mantenimiento.html"

echo "=============================================="
echo "  REVIO CRM — Activar modo mantenimiento"
echo "  Destino: ${SSH_TARGET}"
echo "=============================================="
echo ""

if [[ ! -f "${LOCAL_HTML}" ]]; then
  echo "ERROR: No se encontró ${LOCAL_HTML}" >&2
  exit 1
fi

echo "→ Subiendo HTML, parcheando Nginx y recargando (una sesión SSH)..."
echo "  (te pedirá la contraseña de root una vez)"
echo ""

B64_HTML="$(base64 < "${LOCAL_HTML}" | tr -d '\n')"

ssh "${SSH_TARGET}" \
  "NGINX_SITE=$(printf '%q' "${NGINX_SITE}")" \
  "REMOTE_HTML_DIR=$(printf '%q' "${REMOTE_HTML_DIR}")" \
  "REMOTE_HTML_PATH=$(printf '%q' "${REMOTE_HTML_PATH}")" \
  "B64_HTML=$(printf '%q' "${B64_HTML}")" \
  bash -s <<'REMOTE_SCRIPT'
set -euo pipefail

echo "→ [1/3] Escribiendo ${REMOTE_HTML_PATH}..."
mkdir -p "${REMOTE_HTML_DIR}"
printf '%s' "${B64_HTML}" | base64 -d > "${REMOTE_HTML_PATH}"
chmod 644 "${REMOTE_HTML_PATH}"
echo "✓ Archivo publicado."
echo ""

# Resolver ruta real del sitio (symlink sites-enabled → sites-available, etc.)
resolve_site() {
  local candidate
  for candidate in \
    "${NGINX_SITE}" \
    "/etc/nginx/sites-enabled/revio" \
    "/etc/nginx/sites-available/default" \
    "/etc/nginx/conf.d/revio.conf"
  do
    if [[ -f "${candidate}" ]]; then
      # Seguir symlink si aplica
      if command -v readlink >/dev/null 2>&1; then
        readlink -f "${candidate}" 2>/dev/null || echo "${candidate}"
      else
        echo "${candidate}"
      fi
      return 0
    fi
  done
  return 1
}

SITE_PATH="$(resolve_site || true)"
if [[ -z "${SITE_PATH}" ]]; then
  echo "ERROR: No se encontró un sitio Nginx (probado: ${NGINX_SITE} y alternativas)." >&2
  echo "Archivos en sites-available / sites-enabled:" >&2
  ls -la /etc/nginx/sites-available/ /etc/nginx/sites-enabled/ 2>&1 || true
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "ERROR: python3 es necesario en el VPS para editar el sitio Nginx." >&2
  exit 1
fi

echo "→ [2/3] Actualizando sitio Nginx: ${SITE_PATH}..."
BACKUP="${SITE_PATH}.bak.$(date +%Y%m%d%H%M%S)"
cp -a "${SITE_PATH}" "${BACKUP}"
echo "  · Backup: ${BACKUP}"

python3 - "${SITE_PATH}" <<'PY'
import pathlib
import re
import sys

site = pathlib.Path(sys.argv[1])
raw = site.read_text()
# Normalizar CRLF / posibles rarezas de paneles
text = raw.replace("\r\n", "\n").replace("\r", "\n")

marker_begin = "# >>> REVIO_MAINTENANCE_BEGIN"
marker_end = "# <<< REVIO_MAINTENANCE_END"

snippet = f"""
    {marker_begin}
    # Modo mantenimiento: activo solo si existe el HTML estático.
    # Apagar: renombrar /var/www/html/mantenimiento.html → *.off
    # (Nginx re-evalúa -f en cada request). Encender: restaurar el nombre.
    error_page 503 /mantenimiento.html;

    location = /mantenimiento.html {{
        root /var/www/html;
        add_header Retry-After 3600 always;
        add_header Cache-Control "no-store" always;
    }}

    set $revio_maintenance 0;
    if (-f /var/www/html/mantenimiento.html) {{
        set $revio_maintenance 1;
    }}
    # Excluir: página 503 interna, ACME (TLS) y webhook WhatsApp (Meta)
    if ($uri ~* "^/(mantenimiento\\.html|\\.well-known/acme-challenge/|api/whatsapp/webhook)") {{
        set $revio_maintenance 0;
    }}
    if ($revio_maintenance = 1) {{
        return 503;
    }}
    {marker_end}
"""

# Idempotente: quitar bloque previo
pattern = re.compile(
    re.escape(marker_begin) + r".*?" + re.escape(marker_end) + r"\n?",
    re.DOTALL,
)
text = pattern.sub("", text)


def find_server_blocks(src: str):
    """Devuelve lista de (start_brace_index, end_brace_index, block_text)."""
    blocks = []
    for m in re.finditer(r"\bserver\s*\{", src):
        start = m.end() - 1  # posición del '{'
        depth = 0
        i = start
        while i < len(src):
            ch = src[i]
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    blocks.append((start, i, src[start : i + 1]))
                    break
            i += 1
    return blocks


def insert_after_server_open(src: str, brace_index: int, payload: str) -> str:
    """Inserta payload justo después de la línea del '{' de apertura del server."""
    # Avanzar hasta fin de línea del '{'
    nl = src.find("\n", brace_index)
    if nl == -1:
        insert_at = brace_index + 1
    else:
        insert_at = nl + 1
    return src[:insert_at] + payload + "\n" + src[insert_at:]


insert_reason = None
new_text = None

# 1) Preferir listen ...443... (ssl o no)
listen_443 = list(
    re.finditer(r"^\s*listen\s+[^;\n]*443[^;\n]*;", text, re.MULTILINE | re.IGNORECASE)
)
if listen_443:
    chosen = next((m for m in listen_443 if re.search(r"\bssl\b", m.group(0), re.I)), listen_443[0])
    insert_at = chosen.end()
    # Si no hay newline justo después, forzar una
    suffix = "" if (insert_at < len(text) and text[insert_at] == "\n") else "\n"
    new_text = text[:insert_at] + suffix + snippet + "\n" + text[insert_at:]
    insert_reason = f"tras '{chosen.group(0).strip()}'"

# 2) Server con ssl_certificate
if new_text is None:
    for brace_i, _end, block in find_server_blocks(text):
        if re.search(r"\bssl_certificate\b", block):
            new_text = insert_after_server_open(text, brace_i, snippet)
            insert_reason = "al inicio del server block con ssl_certificate"
            break

# 3) Server que hace proxy al contenedor :3000 (caso típico REVIO / Cloudflare→80)
if new_text is None:
    for brace_i, _end, block in find_server_blocks(text):
        if re.search(r"proxy_pass\s+https?://[^;]*:3000", block, re.I):
            new_text = insert_after_server_open(text, brace_i, snippet)
            insert_reason = "al inicio del server block con proxy_pass :3000"
            break

# 4) Primer server block con proxy_pass cualquiera
if new_text is None:
    for brace_i, _end, block in find_server_blocks(text):
        if re.search(r"\bproxy_pass\b", block):
            new_text = insert_after_server_open(text, brace_i, snippet)
            insert_reason = "al inicio del primer server block con proxy_pass"
            break

# 5) Primer server block del archivo
if new_text is None:
    blocks = find_server_blocks(text)
    if blocks:
        brace_i = blocks[0][0]
        new_text = insert_after_server_open(text, brace_i, snippet)
        insert_reason = "al inicio del primer server block"

if new_text is None:
    print("ERROR: No se pudo localizar un bloque server en el sitio Nginx.", file=sys.stderr)
    print("--- Diagnóstico (listen / server_name / proxy_pass / ssl_) ---", file=sys.stderr)
    for i, line in enumerate(text.splitlines(), 1):
        if re.search(r"listen|server_name|proxy_pass|ssl_|server\s*\{", line, re.I):
            print(f"{i}: {line}", file=sys.stderr)
    print("--- Primeras 60 líneas del archivo ---", file=sys.stderr)
    for i, line in enumerate(text.splitlines()[:60], 1):
        print(f"{i}: {line}", file=sys.stderr)
    sys.exit(1)

site.write_text(new_text)
print(f"  · Bloque de mantenimiento insertado ({insert_reason})")
PY

echo ""
echo "→ [3/3] Validando y recargando Nginx..."
nginx -t
systemctl reload nginx
echo "✓ Nginx recargado. Modo mantenimiento ACTIVO mientras exista:"
echo "  ${REMOTE_HTML_PATH}"
REMOTE_SCRIPT

echo ""
echo "=============================================="
echo "  Listo. El tráfico público verá 503 + la página."
echo ""
echo "  Apagar mantenimiento (sin editar Nginx):"
echo "    ssh ${SSH_TARGET} 'mv ${REMOTE_HTML_PATH} ${REMOTE_HTML_PATH}.off'"
echo ""
echo "  Volver a encenderlo:"
echo "    ssh ${SSH_TARGET} 'mv ${REMOTE_HTML_PATH}.off ${REMOTE_HTML_PATH}'"
echo "=============================================="
