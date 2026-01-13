export interface Env {
  // D1等を後で追加する場合に備えて予約（現時点では必須ではない）
  // DB?: D1Database;
}

const MAX_TOTAL_BYTES = 1_000_000; // 1MB hard cap (server)
const JSON_CT = "application/json; charset=utf-8";

// =========================
// CORS (Fail-Closed)
// =========================
// Production Console
const ALLOWED_ORIGIN_EXACT = new Set<string>([
  "https://ajson-mini-console.pages.dev",
]);

// Preview deployments: https://<hash>.ajson-mini-console.pages.dev
const ALLOWED_ORIGIN_HOST_SUFFIX = ".ajson-mini-console.pages.dev";

function isAllowedOrigin(origin: string): boolean {
  try {
    if (ALLOWED_ORIGIN_EXACT.has(origin)) return true;
    const u = new URL(origin);
    return u.hostname.endsWith(ALLOWED_ORIGIN_HOST_SUFFIX);
  } catch {
    return false;
  }
}

function buildCorsHeaders(origin: string): Headers {
  const h = new Headers();
  h.set("Access-Control-Allow-Origin", origin);
  h.set("Vary", "Origin");
  h.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  h.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-Id");
  h.set("Access-Control-Max-Age", "86400");
  return h;
}

/**
 * Originが無い：直叩き/ブラウザ遷移/curl等 → CORS不要なので通す
 * Originがある：ブラウザのcross-origin fetch → 許可Originのみ通す（Fail-Closed）
 */
function applyCors(req: Request, res: Response): Response {
  const origin = req.headers.get("Origin");
  if (!origin) return res;

  if (!isAllowedOrigin(origin)) {
    // Fail-Closed（許可しないOriginは明示拒否）
    return new Response(JSON.stringify({ ok: false, error: "CORS_BLOCKED", origin }, null, 2), {
      status: 403,
      headers: { "content-type": JSON_CT },
    });
  }

  const out = new Response(res.body, res);
  const cors = buildCorsHeaders(origin);
  cors.forEach((v, k) => out.headers.set(k, v));
  return out;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": JSON_CT },
  });
}

function text(body: string, status = 200): Response {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, "");
}

function isLikelyDataUrl(v: string): boolean {
  return v.startsWith("data:") && v.includes(";base64,");
}

function estimateDataUrlBytes(dataUrl: string): number {
  // data:<mime>;base64,XXXX
  const idx = dataUrl.indexOf(";base64,");
  if (idx === -1) return 0;
  const b64 = dataUrl.slice(idx + ";base64,".length);
  // base64 -> bytes approximation: len * 3/4 - padding
  const padding = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

type Attachment = {
  name: string;
  type: string;
  size: number; // client-declared bytes
  data_url: string; // Data URL
};

type CommandPayload = {
  prompt?: string;
  attachments?: Attachment[];
};

async function readJson(req: Request): Promise<unknown> {
  const ct = req.headers.get("content-type") || "";
  if (!ct.toLowerCase().includes("application/json")) {
    throw new Error("content-type must be application/json");
  }
  return await req.json();
}

function badRequest(msg: string) {
  return json({ ok: false, error: msg }, 400);
}

function payloadTooLarge(msg: string) {
  return json({ ok: false, error: msg }, 413);
}

// ok() は spread を使うので object に限定（Fail-Closedで型も明確化）
function ok(data: Record<string, unknown>) {
  return json({ ok: true, ...data }, 200);
}

export default {
  async fetch(req: Request, _env: Env, ctx: ExecutionContext): Promise<Response> {
    // --------
    // Preflight (OPTIONS)
    // --------
    if (req.method.toUpperCase() === "OPTIONS") {
      const origin = req.headers.get("Origin") || "";
      if (!origin || !isAllowedOrigin(origin)) {
        // Fail-Closed
        return new Response("CORS blocked", { status: 403 });
      }
      return new Response(null, { status: 204, headers: buildCorsHeaders(origin) });
    }

    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method.toUpperCase();

    let res: Response;

    // Health contract (Day 0)
    if (method === "GET" && path === "/healthz") {
      res = text("ok", 200);
      return applyCors(req, res);
    }

    if (method === "GET" && path === "/api/status") {
      res = ok({
        service: "ajson-mini-jarvis",
        status: "ok",
        time: new Date().toISOString(),
      });
      return applyCors(req, res);
    }

    // Attachment-enabled command endpoint
    if (path === "/api/command") {
      if (method !== "POST") {
        res = badRequest("POST only");
        return applyCors(req, res);
      }

      let body: CommandPayload;
      try {
        body = (await readJson(req)) as CommandPayload;
      } catch (e) {
        res = badRequest(`invalid json: ${String(e)}`);
        return applyCors(req, res);
      }

      const prompt = (body.prompt ?? "").toString();
      const attachments = Array.isArray(body.attachments) ? body.attachments : [];

      // Validate attachments
      let totalBytes = 0;
      const normalized: Array<{
        name: string;
        type: string;
        size: number;
        estimated_bytes: number;
      }> = [];

      for (const a of attachments) {
        if (!a || typeof a !== "object") {
          res = badRequest("attachments must be objects");
          return applyCors(req, res);
        }

        const name = (a.name ?? "").toString();
        const type = (a.type ?? "application/octet-stream").toString();
        const size = Number((a as any).size ?? 0);
        const dataUrl = (a as any).data_url;

        if (!name) {
          res = badRequest("attachment.name is required");
          return applyCors(req, res);
        }
        if (!Number.isFinite(size) || size < 0) {
          res = badRequest(`attachment.size invalid: ${name}`);
          return applyCors(req, res);
        }
        if (typeof dataUrl !== "string" || !isLikelyDataUrl(dataUrl)) {
          res = badRequest(`attachment.data_url must be data:*;base64,: ${name}`);
          return applyCors(req, res);
        }

        // Server-side cap: use declared size + estimated from base64 for defense-in-depth
        const est = estimateDataUrlBytes(dataUrl);
        totalBytes += Math.max(size, est);

        normalized.push({ name, type, size, estimated_bytes: est });

        if (totalBytes > MAX_TOTAL_BYTES) {
          res = payloadTooLarge(`attachments total exceeds 1MB (server cap). current=${totalBytes} bytes`);
          return applyCors(req, res);
        }
      }

      // Non-blocking log (do not store raw base64 in logs)
      ctx.waitUntil(
        (async () => {
          console.log("[command] prompt_len=", prompt.length, "attachments=", normalized);
        })()
      );

      // Day 0 behavior: acknowledge receipt + return summary
      res = ok({
        received: {
          prompt_len: prompt.length,
          attachments_count: normalized.length,
          attachments: normalized,
          total_bytes_estimate: totalBytes,
        },
        next: {
          note: "Day 0: attachments are acknowledged and logged. D1 persistence can be added later if required.",
        },
      });
      return applyCors(req, res);
    }

    res = json({ ok: false, error: "not found", path }, 404);
    return applyCors(req, res);
  },
};
