# Links compartibles del autoarmado

Esta configuracion usa:

- Supabase Database para guardar el armado.
- Supabase Storage para guardar la imagen de preview.
- Supabase Edge Function para crear y leer shares.
- Cloudflare Worker para devolver HTML con Open Graph.

El frontend ya tiene:

- Boton `Compartir link` en el modal de autoarmado.
- Generacion de PNG desde la cancha actual.
- Lectura automatica de `?share=ID` para abrir un armado compartido.

## 1. Bucket

Crear un bucket publico en Supabase Storage:

```text
shared-team-previews
```

Ya esta creado si seguiste el flujo de setup.

## 2. Tabla

Ejecutar esta migracion en Supabase SQL Editor o con Supabase CLI:

```text
supabase/migrations/20260714000000_shared_team_builds.sql
```

La tabla permite lectura publica solo cuando `expires_at > now()`.

## 3. Edge Function

Deploy completo desde PowerShell:

```powershell
$env:SUPABASE_ACCESS_TOKEN="..."
$env:SUPABASE_SERVICE_ROLE_KEY="..."
$env:SUPABASE_DB_PASSWORD="..."
$env:CLOUDFLARE_API_TOKEN="..."
.\scripts\deploy-sharing.ps1
```

Esas variables salen de:

- `SUPABASE_ACCESS_TOKEN`: Supabase Account > Access Tokens.
- `SUPABASE_SERVICE_ROLE_KEY`: Supabase Project Settings > API.
- `SUPABASE_DB_PASSWORD`: password de la base Postgres del proyecto.
- `CLOUDFLARE_API_TOKEN`: token con permisos para Workers y el dominio.

Comandos manuales equivalentes:

Configurar secretos:

```bash
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=TU_SERVICE_ROLE_KEY
supabase secrets set APP_BASE_URL=https://www.t5papiacademy.com
supabase secrets set SHARE_BASE_URL=https://share.t5papiacademy.com
supabase secrets set PREVIEW_BUCKET=shared-team-previews
supabase secrets set ALLOWED_ORIGINS=https://www.t5papiacademy.com
```

Desplegar:

```bash
npm run deploy:supabase:functions
```

La funcion `POST /functions/v1/team-share` requiere una sesion de Supabase en el header `Authorization`.

Body esperado:

```json
{
  "payload": {
    "equipo1": [],
    "equipo2": [],
    "config": {}
  },
  "previewImageBase64": "data:image/png;base64,...",
  "ttlDays": 7,
  "title": "Autoarmado T5 Papi Academy",
  "description": "Equipo 1 vs Equipo 2"
}
```

Respuesta:

```json
{
  "id": "abc123",
  "shareUrl": "https://share.t5papiacademy.com/abc123",
  "appUrl": "https://www.t5papiacademy.com/?share=abc123",
  "previewUrl": "https://jqslerzbzxtycwozvtcy.supabase.co/storage/v1/object/public/shared-team-previews/abc123.png",
  "expiresAt": "2026-07-21T00:00:00.000Z"
}
```

## 4. Cloudflare Worker

Crear un Worker con el codigo:

```text
workers/team-share-preview/worker.js
```

El archivo de deploy esta en:

```text
workers/team-share-preview/wrangler.toml
```

Variables del Worker:

```text
SUPABASE_URL=https://jqslerzbzxtycwozvtcy.supabase.co
SUPABASE_ANON_KEY=TU_ANON_KEY
APP_BASE_URL=https://www.t5papiacademy.com
DEFAULT_IMAGE_URL=https://www.t5papiacademy.com/assets/t5-highlights-cover.png
```

Asociar el Worker al dominio:

```text
share.t5papiacademy.com
```

Deploy:

```bash
npm run deploy:worker
```

El Worker devuelve HTML con `og:image` y redirige a:

```text
https://www.t5papiacademy.com/?share=ID
```

## 5. Cleanup

La expiracion logica ya esta en `expires_at`. Para borrar archivos reales del bucket, falta agregar un cleanup programado que elimine:

- filas vencidas en `shared_team_builds`
- imagenes `preview_path` correspondientes en `shared-team-previews`
