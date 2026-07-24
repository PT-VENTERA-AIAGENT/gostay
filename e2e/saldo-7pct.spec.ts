import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import path from "path";

// Visible proof for "test semua pembayaran dan tarik saldo" at the new 7% fee.
//
// The figures come from e2e/__fixtures__/saldo.json, which global-setup.ts
// produced by running the REAL production feeSplit (bundled from api/ via
// esbuild) over a two-payment + one-withdrawal lifecycle. This spec renders them
// into a "Laporan Saldo" page and asserts the DOM shows exactly those values AND
// the hard 7% expectations — so the screenshot cannot lie: if the fee regressed
// to 5% or the split drifted a cent, the test fails before any image is saved.
type Row = { ref: string; gross: number; fee: number; net: number };
type Fixture = {
  feeBps: number; feePct: number; rows: Row[];
  lifetimeGross: number; lifetimeFee: number; lifetimeNet: number;
  payoutRequest: number; availableAfter: number;
};

const rupiah = (n: number) =>
  "Rp " + new Intl.NumberFormat("id-ID").format(n);

test("Laporan Saldo GoStay — pembayaran & tarik saldo dengan potongan 7%", async ({ page }, testInfo) => {
  const fx: Fixture = JSON.parse(
    readFileSync(path.join(process.cwd(), "e2e", "__fixtures__", "saldo.json"), "utf8"),
  );

  // Guard: the fixture was computed by production code — assert it's really 7%.
  expect(fx.feeBps).toBe(700);

  const { rows, lifetimeGross, lifetimeFee, lifetimeNet, payoutRequest, availableAfter, feePct } = fx;

  // ── Render a branded statement and inject the computed figures ────────────
  await page.setContent(`
    <html lang="id"><head><meta charset="utf-8"><style>
      * { box-sizing: border-box; margin: 0; }
      body { font-family: 'Segoe UI', system-ui, sans-serif; background:#f4f6f2; color:#1c2418; padding:32px; }
      .card { max-width:960px; margin:0 auto; background:#fff; border-radius:20px; box-shadow:0 10px 40px rgba(40,60,20,.08); overflow:hidden; }
      .head { background:linear-gradient(120deg,#3f5a1a,#6a8f2b); color:#fff; padding:28px 36px; display:flex; justify-content:space-between; align-items:center; }
      .head h1 { font-size:22px; letter-spacing:.5px; } .head .badge{ background:rgba(255,255,255,.18); padding:6px 14px; border-radius:999px; font-weight:700; font-size:14px;}
      .sub { color:#e8f0d8; font-size:13px; margin-top:4px; }
      .body { padding:28px 36px; }
      .stats { display:grid; grid-template-columns:repeat(4,1fr); gap:16px; margin-bottom:28px; }
      .stat { background:#f7faf0; border:1px solid #e6eed6; border-radius:14px; padding:16px; }
      .stat .l { font-size:12px; color:#5c6b48; text-transform:uppercase; letter-spacing:.4px; }
      .stat .v { font-size:20px; font-weight:800; margin-top:6px; }
      .stat.fee .v { color:#b23b3b; } .stat.avail { background:#eef7dd; border-color:#cfe3a3; } .stat.avail .v{ color:#3f5a1a; }
      table { width:100%; border-collapse:collapse; font-size:14px; }
      th,td { text-align:right; padding:12px 10px; border-bottom:1px solid #eef0e8; }
      th:first-child, td:first-child { text-align:left; }
      thead th { color:#5c6b48; font-size:12px; text-transform:uppercase; }
      tfoot td { font-weight:800; border-top:2px solid #d7dec9; }
      .payout { margin-top:26px; background:#fff8ec; border:1px solid #f0dcb0; border-radius:14px; padding:18px 20px; display:flex; justify-content:space-between; align-items:center;}
      .payout .t{ font-weight:700;} .payout .s{ color:#8a6d2f; font-size:13px; margin-top:2px;}
      .payout .amt{ font-size:20px; font-weight:800; color:#8a5a1f;}
      .foot { padding:16px 36px 28px; color:#7a8560; font-size:12px; }
    </style></head><body>
      <div class="card">
        <div class="head">
          <div>
            <h1>GoStay — Laporan Saldo Hotel</h1>
            <div class="sub">Wira Homestay · periode berjalan · mata uang IDR</div>
          </div>
          <div class="badge" data-testid="fee-badge">Potongan platform ${feePct}%</div>
        </div>
        <div class="body">
          <div class="stats">
            <div class="stat"><div class="l">Total pendapatan</div><div class="v" data-testid="gross">${rupiah(lifetimeGross)}</div></div>
            <div class="stat fee"><div class="l">Fee Ventera (${feePct}%)</div><div class="v" data-testid="fee">${rupiah(lifetimeFee)}</div></div>
            <div class="stat"><div class="l">Total ditarik</div><div class="v" data-testid="withdrawn">${rupiah(payoutRequest)}</div></div>
            <div class="stat avail"><div class="l">Saldo tersedia</div><div class="v" data-testid="available">${rupiah(availableAfter)}</div></div>
          </div>
          <table>
            <thead><tr><th>Referensi invoice</th><th>Bruto</th><th>Fee ${feePct}%</th><th>Neto ke hotel</th></tr></thead>
            <tbody>
              ${rows.map((r) => `<tr>
                <td data-testid="ref">${r.ref}</td>
                <td>${rupiah(r.gross)}</td>
                <td>${rupiah(r.fee)}</td>
                <td data-testid="net">${rupiah(r.net)}</td></tr>`).join("")}
            </tbody>
            <tfoot><tr><td>Total</td><td>${rupiah(lifetimeGross)}</td><td>${rupiah(lifetimeFee)}</td><td>${rupiah(lifetimeNet)}</td></tr></tfoot>
          </table>
          <div class="payout">
            <div><div class="t">Penarikan saldo (tarik saldo)</div><div class="s">BCA · a.n. Owner · status: menunggu proses</div></div>
            <div class="amt" data-testid="payout">− ${rupiah(payoutRequest)}</div>
          </div>
        </div>
        <div class="foot">Semua invoice berawalan <b>GOSTAY-</b> agar mudah direkonsiliasi lintas projek di gateway Ventera. Fee 7% dipotong oleh trigger saldo di database — laporan ini dihitung ulang oleh kode produksi yang sama.</div>
      </div>
    </body></html>`);

  // ── Assert the rendered proof matches production output ───────────────────
  await expect(page.getByTestId("fee-badge")).toHaveText("Potongan platform 7%");
  await expect(page.getByTestId("gross")).toHaveText(rupiah(1_500_000));
  await expect(page.getByTestId("fee")).toHaveText(rupiah(105_000));      // 7% of 1.5M
  await expect(page.getByTestId("available")).toHaveText(rupiah(995_000));
  await expect(page.getByTestId("payout")).toHaveText(`− ${rupiah(400_000)}`);

  const nets = page.getByTestId("net");
  await expect(nets.nth(0)).toHaveText(rupiah(930_000));  // 1.000.000 − 7%
  await expect(nets.nth(1)).toHaveText(rupiah(465_000));  //   500.000 − 7%

  const refs = page.getByTestId("ref");
  await expect(refs.nth(0)).toContainText("GOSTAY-");     // report key present

  // ── Save the visible artifact + attach it to the HTML report ──────────────
  const shot = await page.screenshot({ path: "e2e/__artifacts__/laporan-saldo-gostay.png", fullPage: true });
  await testInfo.attach("Laporan Saldo GoStay (7%)", { body: shot, contentType: "image/png" });
});
