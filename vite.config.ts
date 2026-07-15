import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { exchangeCode } from "./api/_lib/exchange";

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
    plugins: [react(), ssoDevApi()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
      dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
    },
  };
});
