param(
  [string]$ProjectRef = "jqslerzbzxtycwozvtcy",
  [string]$AppBaseUrl = "https://www.t5papiacademy.com",
  [string]$ShareBaseUrl = "https://share.t5papiacademy.com",
  [string]$PreviewBucket = "shared-team-previews"
)

$ErrorActionPreference = "Stop"

function Require-Env($Name) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw "Falta la variable de entorno $Name"
  }
  return $value
}

function Use-Bundled-Node-If-Needed {
  $bundledNodeDir = Join-Path $env:USERPROFILE ".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin"
  if (Test-Path (Join-Path $bundledNodeDir "node.exe")) {
    $env:PATH = "$bundledNodeDir;$env:PATH"
  }

  $major = (& node -p "process.versions.node.split('.')[0]") -as [int]
  if ($major -lt 22) {
    throw "Wrangler requiere Node 22 o superior. Version actual: $(node --version)"
  }
}

$supabaseAccessToken = Require-Env "SUPABASE_ACCESS_TOKEN"
$serviceRoleKey = Require-Env "SUPABASE_SERVICE_ROLE_KEY"
$dbPassword = Require-Env "SUPABASE_DB_PASSWORD"
$cloudflareToken = Require-Env "CLOUDFLARE_API_TOKEN"

$env:SUPABASE_ACCESS_TOKEN = $supabaseAccessToken
$env:CLOUDFLARE_API_TOKEN = $cloudflareToken

Use-Bundled-Node-If-Needed

Write-Host "Linkeando Supabase..."
npx supabase link --project-ref $ProjectRef --password $dbPassword

Write-Host "Aplicando migraciones..."
npx supabase db push --linked --password $dbPassword

Write-Host "Configurando secretos de Edge Functions..."
npx supabase secrets set `
  "SUPABASE_SERVICE_ROLE_KEY=$serviceRoleKey" `
  "APP_BASE_URL=$AppBaseUrl" `
  "SHARE_BASE_URL=$ShareBaseUrl" `
  "PREVIEW_BUCKET=$PreviewBucket" `
  "ALLOWED_ORIGINS=$AppBaseUrl,https://t5papiacademy.com" `
  --project-ref $ProjectRef

Write-Host "Desplegando Edge Function team-share..."
npx supabase functions deploy team-share --project-ref $ProjectRef --use-api

Write-Host "Desplegando Cloudflare Worker..."
Push-Location "workers\team-share-preview"
try {
  npx wrangler deploy
} finally {
  Pop-Location
}

Write-Host "Deploy completo."
