import { defineConfig, loadEnv, type Plugin } from "vite";
import fs from "node:fs";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { exchangeCode } from "./api/_lib/exchange";
import waInbound from "./api/wa/inbound";
import hotelCreateMine from "./api/hotel/create-mine";
import waConnect from "./api/wa/connect";
import paymentAction from "./api/payment/[action]";

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
            signupContext: body.signup_context === "guest" ? "guest" : "owner",
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


// Pembayaran. Di produksi api/payment/[action].ts adalah fungsi Vercel; `vite
// dev` tidak menyajikan folder api/ sama sekali, jadi tombol "Bayar sekarang" di
// portal menjawab 404 di localhost — terbaca sebagai fitur rusak padahal hanya
// tidak ada yang melayaninya.
//
// Bedanya dengan plugin lain di berkas ini: rutenya dinamis (`[action]`), jadi
// segmen terakhir path dibaca di sini dan dioper sebagai `query.action` —
// persis yang dilakukan Vercel di produksi.
function paymentDevApi(): Plugin {
  return {
    name: "payment-dev-api",
    configureServer(server) {
      server.middlewares.use("/api/payment", async (req, res) => {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        const raw = Buffer.concat(chunks).toString("utf8");
        // req.url di dalam middleware sudah relatif terhadap mount-nya:
        // "/checkout" untuk /api/payment/checkout.
        const action = (req.url ?? "").split("?")[0].replace(/^\//, "");

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
          await (paymentAction as unknown as (q: unknown, s: unknown) => Promise<void>)(
            { method: req.method, headers: req.headers, body: raw, query: { action } },
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
  // out of the bundle by design.
  //
  // Berkas .env repo ini MENANG atas variabel lingkungan mesin — kebalikan dari
  // perilaku sebelumnya, dan itu disengaja.
  //
  // Nama seperti `SUPABASE_URL` dipakai banyak proyek. Sebuah variabel pengguna
  // Windows bernama itu, milik proyek LAIN, membuat seluruh API dev di sini
  // memanggil database yang salah dengan kunci GoStay — 401 di setiap rute, dan
  // tak satu pun pesan menyebut database mana yang dituju. Berjam-jam bisa
  // hilang mengejar "service role tidak valid" padahal kuncinya benar dan
  // alamatnya yang keliru.
  //
  // Kuncinya dihapus dari process.env DULU, karena `loadEnv` sendiri
  // mendahulukan lingkungan: membiarkannya berarti nilai mesin dibaca kembali
  // dan menimpa berkas ini lagi.
  //
  // Yang TIDAK ada di berkas tetap diambil dari lingkungan, jadi
  // `FOO=bar npm run dev` untuk variabel sekali pakai tetap bekerja.
  const envFiles = [".env", ".env.local", `.env.${mode}`, `.env.${mode}.local`];
  const fileKeys = new Set<string>();
  for (const name of envFiles) {
    const full = path.resolve(process.cwd(), name);
    if (!fs.existsSync(full)) continue;
    for (const line of fs.readFileSync(full, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
      if (m) fileKeys.add(m[1]);
    }
  }
  const shadowed = new Map<string, string>();
  for (const key of fileKeys) {
    if (process.env[key] !== undefined) shadowed.set(key, process.env[key] as string);
    delete process.env[key];
  }

  const fileEnv = loadEnv(mode, process.cwd(), "");
  for (const [key, value] of Object.entries(fileEnv)) {
    const was = shadowed.get(key);
    if (was !== undefined && was !== value) {
      // Dikatakan terang-terangan sekali: pembajakan senyap itu yang mahal.
      console.warn(`[env] ${key} dari lingkungan mesin diabaikan; memakai nilai .env repo ini.`);
    }
    process.env[key] = value;
  }
  // Yang sempat dihapus tapi tidak ada di berkas dikembalikan apa adanya.
  for (const [key, value] of shadowed) {
    if (process.env[key] === undefined) process.env[key] = value;
  }

  return {
    server: {
      host: "::",
      port: 8080,
      // Fail instead of drifting to 8081. redirect_uri is built from
      // window.location.origin (src/lib/sso.ts), and Ventera only accepts the
      // exact URIs registered for the `gostay` client — which are on 8080. So a
      // silent port fallback turns every login into `invalid_redirect_uri`, with
      // nothing in this project to point at. Better to refuse to start and say
      // the port is taken.
      strictPort: true,
      hmr: {
        overlay: false,
      },
    },
    plugins: [react(), ssoDevApi(), waDevApi(), hotelDevApi(), waConnectDevApi(), paymentDevApi()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
