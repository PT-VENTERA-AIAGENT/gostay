import { build } from "esbuild";
import { mkdirSync, writeFileSync } from "fs";
import { pathToFileURL } from "url";
import path from "path";

// Produces the fixture the proof spec renders. We can't name-import the real
// fee.ts straight into a Playwright module because api/ is a CommonJS package,
// so esbuild transpiles+bundles it to a clean .mjs first, then we run the ACTUAL
// production feeSplit over a realistic money lifecycle and freeze the numbers to
// JSON. The spec asserts the page shows exactly these — no reimplementation.
export default async function globalSetup() {
  const root = process.cwd();
  const fixDir = path.join(root, "e2e", "__fixtures__");
  mkdirSync(fixDir, { recursive: true });

  const bundled = path.join(fixDir, "fee.mjs");
  await build({
    entryPoints: [path.join(root, "api", "_lib", "payment", "fee.ts")],
    outfile: bundled,
    format: "esm",
    bundle: true,
    platform: "node",
    logLevel: "silent",
  });

  const { feeSplit } = await import(pathToFileURL(bundled).href);

  // Two settled payments (7% default) + one withdrawal request.
  const p1 = feeSplit(1_000_000);
  const p2 = feeSplit(500_000);
  const payoutRequest = 400_000;

  const lifetimeGross = p1.gross + p2.gross;
  const lifetimeFee = p1.fee + p2.fee;
  const lifetimeNet = p1.net + p2.net;

  const fixture = {
    feeBps: p1.feeBps,
    feePct: p1.feeBps / 100,
    rows: [
      { ref: "GOSTAY-BK-1001", ...p1 },
      { ref: "GOSTAY-BK-1002", ...p2 },
    ],
    lifetimeGross,
    lifetimeFee,
    lifetimeNet,
    payoutRequest,
    availableAfter: lifetimeNet - payoutRequest,
  };

  writeFileSync(path.join(fixDir, "saldo.json"), JSON.stringify(fixture, null, 2));
}
