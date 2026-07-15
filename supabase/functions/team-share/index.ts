import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const APP_BASE_URL = withoutTrailingSlash(Deno.env.get("APP_BASE_URL") ?? "https://www.t5papiacademy.com");
const SHARE_BASE_URL = withoutTrailingSlash(Deno.env.get("SHARE_BASE_URL") ?? APP_BASE_URL);
const PREVIEW_BUCKET = Deno.env.get("PREVIEW_BUCKET") ?? "shared-team-previews";
const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get("ALLOWED_ORIGINS") ?? APP_BASE_URL);

const MAX_IMAGE_BYTES = 2_500_000;
const DEFAULT_TTL_DAYS = 7;
const MAX_TTL_DAYS = 30;

type JsonRecord = Record<string, unknown>;

interface CreateShareRequest {
  payload?: JsonRecord;
  previewImageBase64?: string;
  ttlDays?: number;
  title?: string;
  description?: string;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin") ?? "";
  const headers = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: "Supabase env vars are not configured" }, 500, headers);
    }

    if (origin && !isAllowedOrigin(origin)) {
      return json({ error: "Origin not allowed" }, 403, headers);
    }

    if (req.method === "POST") {
      return await createShare(req, headers);
    }

    if (req.method === "GET") {
      return await getShare(req, headers);
    }

    return json({ error: "Method not allowed" }, 405, headers);
  } catch (error) {
    console.error("[team-share]", error);
    return json({ error: "Unexpected error" }, 500, headers);
  }
});

async function createShare(req: Request, headers: HeadersInit) {
  const user = await getUser(req);
  if (!user) {
    return json({ error: "Authentication required" }, 401, headers);
  }

  const body = await readJson<CreateShareRequest>(req).catch(() => null);
  if (!body) {
    return json({ error: "Invalid JSON body" }, 400, headers);
  }

  if (!body.payload || typeof body.payload !== "object" || Array.isArray(body.payload)) {
    return json({ error: "payload must be an object" }, 400, headers);
  }

  if (!body.previewImageBase64) {
    return json({ error: "previewImageBase64 is required" }, 400, headers);
  }

  let image: ReturnType<typeof decodeImageDataUrl> | null = null;
  try {
    image = decodeImageDataUrl(body.previewImageBase64);
  } catch {
    image = null;
  }

  if (!image) {
    return json({ error: "previewImageBase64 must be a png, jpg, or webp data URL" }, 400, headers);
  }

  if (image.bytes.byteLength > MAX_IMAGE_BYTES) {
    return json({ error: "Preview image is too large" }, 413, headers);
  }

  const id = crypto.randomUUID().replaceAll("-", "").slice(0, 16);
  const previewPath = `${id}.${image.extension}`;
  const ttlDays = clampInteger(body.ttlDays ?? DEFAULT_TTL_DAYS, 1, MAX_TTL_DAYS);
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000).toISOString();
  const admin = getAdminClient();

  const { error: uploadError } = await admin.storage
    .from(PREVIEW_BUCKET)
    .upload(previewPath, image.bytes, {
      contentType: image.contentType,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("[team-share] storage upload error", uploadError);
    return json({ error: "Could not upload preview image" }, 500, headers);
  }

  const { data: publicUrlData } = admin.storage
    .from(PREVIEW_BUCKET)
    .getPublicUrl(previewPath);

  const previewUrl = publicUrlData.publicUrl;
  const title = cleanText(body.title, "Autoarmado T5 Papi Academy", 100);
  const description = cleanText(body.description, "Equipo 1 vs Equipo 2", 180);

  const { error: insertError } = await admin.from("shared_team_builds").insert({
    id,
    payload: body.payload,
    preview_path: previewPath,
    preview_url: previewUrl,
    title,
    description,
    created_by: user.id,
    expires_at: expiresAt,
  });

  if (insertError) {
    await admin.storage.from(PREVIEW_BUCKET).remove([previewPath]);
    console.error("[team-share] insert error", insertError);
    return json({ error: "Could not save shared build" }, 500, headers);
  }

  return json({
    id,
    shareUrl: `${SHARE_BASE_URL}/${id}`,
    appUrl: `${APP_BASE_URL}/?share=${encodeURIComponent(id)}`,
    previewUrl,
    expiresAt,
  }, 201, headers);
}

async function getShare(req: Request, headers: HeadersInit) {
  const id = extractShareId(req);
  if (!id) {
    return json({ error: "Missing share id" }, 400, headers);
  }

  const admin = getAdminClient();
  const { data, error } = await admin
    .from("shared_team_builds")
    .select("id,payload,preview_url,title,description,expires_at,created_at")
    .eq("id", id)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) {
    console.error("[team-share] read error", error);
    return json({ error: "Could not read shared build" }, 500, headers);
  }

  if (!data) {
    return json({ error: "Shared build not found or expired" }, 404, headers);
  }

  return json({ share: data }, 200, headers);
}

async function getUser(req: Request) {
  const authorization = req.headers.get("authorization") ?? "";
  if (!authorization) return null;

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
    global: { headers: { authorization } },
  });

  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

function getAdminClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
}

async function readJson<T>(req: Request): Promise<T> {
  try {
    return await req.json();
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function decodeImageDataUrl(value: string) {
  const match = String(value).match(/^data:image\/(png|jpe?g|webp);base64,([a-z0-9+/=\s]+)$/i);
  if (!match) {
    throw new Error("previewImageBase64 must be a png, jpg, or webp data URL");
  }

  const kind = match[1].toLowerCase();
  const base64 = match[2].replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  const extension = kind === "jpeg" || kind === "jpg" ? "jpg" : kind;
  const contentType = extension === "jpg" ? "image/jpeg" : `image/${extension}`;
  return { bytes, extension, contentType };
}

function extractShareId(req: Request) {
  const url = new URL(req.url);
  const fromQuery = url.searchParams.get("id");
  if (fromQuery) return sanitizeId(fromQuery);

  const parts = url.pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  return last === "team-share" ? "" : sanitizeId(last);
}

function sanitizeId(value: string) {
  const id = String(value || "").trim();
  return /^[a-z0-9]{8,40}$/i.test(id) ? id : "";
}

function cleanText(value: unknown, fallback: string, maxLength: number) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return (text || fallback).slice(0, maxLength);
}

function clampInteger(value: number, min: number, max: number) {
  const number = Math.trunc(Number(value));
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function json(body: JsonRecord, status: number, headers: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...headers,
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function parseAllowedOrigins(value: string) {
  return value
    .split(",")
    .map((origin) => withoutTrailingSlash(origin.trim()))
    .filter(Boolean);
}

function isAllowedOrigin(origin: string) {
  return ALLOWED_ORIGINS.includes("*") || ALLOWED_ORIGINS.includes(withoutTrailingSlash(origin));
}

function corsHeaders(origin: string): HeadersInit {
  const allowOrigin = origin && isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0] || "*";
  return {
    "access-control-allow-origin": allowOrigin,
    "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "vary": "Origin",
  };
}

function withoutTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}
