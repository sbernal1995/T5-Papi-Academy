const DEFAULT_TITLE = "Autoarmado T5 Papi Academy";
const DEFAULT_DESCRIPTION = "Equipo 1 vs Equipo 2";
const DEFAULT_APP_BASE_URL = "https://www.t5papiacademy.com";
const DEFAULT_IMAGE_URL = "https://www.t5papiacademy.com/assets/t5-highlights-cover.png";
const DEFAULT_SUPABASE_URL = "https://jqslerzbzxtycwozvtcy.supabase.co";
const DEFAULT_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impxc2xlcnpienh0eWN3b3p2dGN5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA3MzI0ODIsImV4cCI6MjA2NjMwODQ4Mn0.zQr-6hMV4O5lVb6Qw-8FSy-bQS9FdZykxA02J0yfx4M";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const id = sanitizeId(url.pathname.split("/").filter(Boolean)[0] || "");
    const appBaseUrl = withoutTrailingSlash(env.APP_BASE_URL || DEFAULT_APP_BASE_URL);
    const appUrl = id ? `${appBaseUrl}/?share=${encodeURIComponent(id)}` : appBaseUrl;

    if (!id) {
      return htmlResponse(renderPage({
        title: DEFAULT_TITLE,
        description: "Link de armado invalido",
        imageUrl: env.DEFAULT_IMAGE_URL || DEFAULT_IMAGE_URL,
        appUrl,
      }));
    }

    const share = await fetchShare(id, env);
    if (!share) {
      return htmlResponse(renderPage({
        title: "Armado expirado",
        description: "Este autoarmado ya no esta disponible.",
        imageUrl: env.DEFAULT_IMAGE_URL || DEFAULT_IMAGE_URL,
        appUrl,
      }));
    }

    return htmlResponse(renderPage({
      title: share.title || DEFAULT_TITLE,
      description: share.description || DEFAULT_DESCRIPTION,
      imageUrl: share.preview_url || env.DEFAULT_IMAGE_URL || DEFAULT_IMAGE_URL,
      appUrl,
    }));
  },
};

async function fetchShare(id, env) {
  const supabaseUrl = withoutTrailingSlash(env.SUPABASE_URL || DEFAULT_SUPABASE_URL);
  const anonKey = env.SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return null;

  const query = new URLSearchParams({
    id: `eq.${id}`,
    expires_at: `gt.${new Date().toISOString()}`,
    select: "id,title,description,preview_url,expires_at",
  });

  const response = await fetch(`${supabaseUrl}/rest/v1/shared_team_builds?${query}`, {
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${anonKey}`,
      accept: "application/json",
    },
  });

  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

function renderPage({ title, description, imageUrl, appUrl }) {
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeImageUrl = escapeAttribute(imageUrl);
  const safeAppUrl = escapeAttribute(appUrl);

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}">
    <meta property="og:type" content="website">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    ${safeImageUrl ? `<meta property="og:image" content="${safeImageUrl}">` : ""}
    ${safeImageUrl ? `<meta property="og:image:width" content="960">` : ""}
    ${safeImageUrl ? `<meta property="og:image:height" content="540">` : ""}
    <meta property="og:url" content="${safeAppUrl}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${safeTitle}">
    <meta name="twitter:description" content="${safeDescription}">
    ${safeImageUrl ? `<meta name="twitter:image" content="${safeImageUrl}">` : ""}
    <meta http-equiv="refresh" content="0;url=${safeAppUrl}">
    <script>location.replace(${JSON.stringify(appUrl)});</script>
  </head>
  <body>
    <p><a href="${safeAppUrl}">Abrir armado</a></p>
  </body>
</html>`;
}

function htmlResponse(html) {
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=UTF-8",
      "cache-control": "public, max-age=300",
    },
  });
}

function sanitizeId(value) {
  const id = String(value || "").trim();
  return /^[a-z0-9]{8,40}$/i.test(id) ? id : "";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll('"', "&quot;");
}

function withoutTrailingSlash(value) {
  return String(value || "").replace(/\/+$/, "");
}
