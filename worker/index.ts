/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { BUILD_VERSION } from "../lib/build-version";

interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  DOCUMENTS?: R2Bucket;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    const response = await handler.fetch(request, env, ctx);
    const secured = new Response(response.body, response);
    secured.headers.set("x-nextjob-build", BUILD_VERSION);
    // Personalized HTML and navigation responses must come from the current
    // deployment. Fingerprinted static assets retain their normal cache policy.
    const contentType = secured.headers.get("content-type") ?? "";
    if (contentType.includes("text/html") || contentType.includes("text/x-component")) secured.headers.set("cache-control", "private, no-store");
    secured.headers.set("x-content-type-options", "nosniff");
    if (!secured.headers.has("referrer-policy")) secured.headers.set("referrer-policy", "strict-origin-when-cross-origin");
    secured.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
    secured.headers.set("cross-origin-opener-policy", "same-origin");
    // A route may declare a tighter policy of its own (the inline PDF preview allows same-origin framing only).
    if (!secured.headers.has("content-security-policy")) secured.headers.set("content-security-policy", "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' data:; frame-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    if (url.protocol === "https:") secured.headers.set("strict-transport-security", "max-age=31536000; includeSubDomains");
    return secured;
  },
};

export default worker;
