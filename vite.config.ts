import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { exchangeCode } from "./api/_lib/exchange";
import waInbound from "./api/wa/inbound";
import hotelCreateMine from "./api/hotel/create-mine";
import waConnect from "./api/wa/connect";

// In production /api/sso/token is served by the Vercel function in api/sso/.
// `vite dev` does not run those, so mount the same handler on the dev server —
// both sides import api/_lib/exchange.ts, so there is only one implementation.
function ssoDevApi(): Plugin {
  return {
    name: "sso-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/sso/token", async (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.setHeader("Cache-Control", "no-store");

        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: "method_not_allowed" }));
          return;
        }

        try {
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk as Buffer);
          const raw = Buffer.concat(chunks).toString("utf8");
          const body = raw ? JSON.parse(raw) : {};

          const result = await exchangeCode({
            code: body.code ?? "",
            code_verifier: body.code_verifier ?? "",
            origin: req.headers.origin ?? "",
            tenantSlug: body.tenant_slug,
          });

          res.statusCode = result.status;
          res.end(JSON.stringify(result.body));
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "dev_handler_error" }));
        }
      });
    },
  };
}

// The same idea for the WhatsApp inbound webhook. In production api/wa/inbound.ts
// is a Vercel function; `vite dev` does not run it, so mount the very same
// default handler here — a local wa-ventera can then POST inbound messages to
// http://localhost:8080/api/wa/inbound during dev. Node's req/res are adapted to
// the tiny Vercel-style surface the handler expects.
function waDevApi(): Plugin {
  return {
    name: "wa-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/wa/inbound", async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString("utf8");

        const vres = {
          statusCode: 200,
          status(code: number) { this.statusCode = code; res.statusCode = code; return vres; },
          setHeader(name: string, value: string) { res.setHeader(name, value); return vres; },
          json(body: unknown) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(body));
          },
        };

        try {
          await (waInbound as unknown as (q: unknown, s: unknown) => Promise<void>)(
            { method: req.method, headers: req.headers, body: raw },
            vres,
          );
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "dev_handler_error" }));
        }
      });
    },
  };
}

// Self-serve hotel creation. In production api/hotel/create-mine.ts is a Vercel
// function; mount the same handler on the dev server so "Buat Hotel" works in
// local dev too. Same req/res adaptation as waDevApi.
function hotelDevApi(): Plugin {
  return {
    name: "hotel-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/hotel/create-mine", async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString("utf8");

        const vres = {
          statusCode: 200,
          status(code: number) { this.statusCode = code; res.statusCode = code; return vres; },
          setHeader(name: string, value: string) { res.setHeader(name, value); return vres; },
          json(body: unknown) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(body));
          },
        };

        try {
          await (hotelCreateMine as unknown as (q: unknown, s: unknown) => Promise<void>)(
            { method: req.method, headers: req.headers, body: raw },
            vres,
          );
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "dev_handler_error" }));
        }
      });
    },
  };
}

// Self-service WhatsApp linking for a hotel. In production api/wa/connect.ts is a
// Vercel function; mount it here so the WhatsApp settings page works in local dev.
// Handles GET/POST/DELETE and needs the URL query (?tenantId=) parsed through.
// NOTE: the actual QR pairing still needs the wa-ventera gateway env
// (WA_VENTERA_BASE_URL / WA_VENTERA_INT_KEY); without them the handler degrades
// gracefully to { status: "none" } instead of throwing.
function waConnectDevApi(): Plugin {
  return {
    name: "wa-connect-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/wa/connect", async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString("utf8");
        const parsed = new URL(req.url ?? "", "http://localhost");
        const query = Object.fromEntries(parsed.searchParams.entries());

        const vres = {
          statusCode: 200,
          status(code: number) { this.statusCode = code; res.statusCode = code; return vres; },
          setHeader(name: string, value: string) { res.setHeader(name, value); return vres; },
          json(body: unknown) {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(body));
          },
        };

        try {
          await (waConnect as unknown as (q: unknown, s: unknown) => Promise<void>)(
            { method: req.method, headers: req.headers, body: raw, query },
            vres,
          );
        } catch {
          res.statusCode = 500;
          res.end(JSON.stringify({ error: "dev_handler_error" }));
        }
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Prefix "" loads unprefixed vars too (SSO_CLIENT_SECRET), which Vite keeps
  // out of the bundle by design. Real environment wins over .env files.
  const fileEnv = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(fileEnv)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), ssoDevApi(), waDevApi(), hotelDevApi(), waConnectDevApi()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
