// @vitest-environment node
//
// Opt-in LIVE check: drives the real flow engine against the real database.
//
// Every other test here runs on fakes, which proves the logic but not the
// wiring — a flow can be perfect and still answer nothing because the hotel has
// no active pos_products, or because its keywords never made it into the column.
// This closes that gap by reading the actual wa_flows rows and actual menu for
// one hotel and printing the transcript a guest would receive.
//
// SKIPPED unless WA_LIVE_TENANT is set, because it needs credentials and network
// and would otherwise fail every normal `npm test` run:
//
//   WA_LIVE_TENANT=<uuid> npx vitest run api/_lib/wa/flow/live.test.ts
//
// READ-ONLY by construction. The two "start …" actions are stubbed to record
// what they would do rather than parking pending state, so running this against
// production cannot leave a guest mid-conversation with a row nobody will clear.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Load .env at MODULE scope, not in beforeAll.
 *
 * The store reads its credentials lazily, but the imports below can touch env
 * during evaluation, and beforeAll runs after the whole module graph is
 * evaluated — loading there gave a 401 on every call. A module-level side effect
 * is the only point guaranteed to precede both.
 */
(() => {
  const defined = new Set<string>();
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    for (const line of raw.split("\n")) {
      const i = line.indexOf("=");
      if (i < 0 || line.trim().startsWith("#")) continue;
      const k = line.slice(0, i).trim();
      // Overwrite rather than defer: vitest pre-populates some of these from its
      // own .env handling, and a half-loaded set authenticates as nobody.
      process.env[k] = line.slice(i + 1).trim();
      defined.add(k);
    }
  } catch {
    /* .env is optional when the vars are already exported */
  }

  // serviceConfig() prefers SUPABASE_URL over VITE_SUPABASE_URL. A developer
  // machine that has worked on another Ventera project may carry a stray
  // SUPABASE_URL in its USER environment pointing at a DIFFERENT Supabase
  // project — and this repo's .env never sets it, so the stray one wins and
  // every request 401s against a project the key does not belong to. Drop it
  // unless .env genuinely asked for it, so the intended fallback applies.
  if (!defined.has("SUPABASE_URL") && process.env.SUPABASE_URL) {
    console.warn(
      `[live] ignoring inherited SUPABASE_URL=${process.env.SUPABASE_URL} — ` +
        `.env does not define it, and it points somewhere the service key cannot authenticate.`,
    );
    delete process.env.SUPABASE_URL;
  }
})();

import { listActiveFlows } from "./store";
import { pickFlow } from "./select";
import { runFlow, type FlowActions } from "./engine";
import { listRoomTypes } from "../booking";
import { getInhouseStay, listMenuProducts } from "../roomservice";

const TENANT = process.env.WA_LIVE_TENANT ?? "";
const run = TENANT ? describe : describe.skip;

const idr = (n: number) =>
  new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

/**
 * Actions bound to the real database for the read-only ones, and to a recorder
 * for the two that would otherwise take over the conversation and write state.
 */
function liveActions(brand: string, sent: string[]): FlowActions {
  return {
    async startBooking() {
      sent.push("→ [menyerahkan ke percakapan pemesanan: tanggal, tipe kamar, harga, konfirmasi, tautan bayar]");
    },
    async startRoomService() {
      // Read the real menu so the transcript shows what a guest actually sees,
      // but stop short of parking the rs_collecting state.
      const stay = await getInhouseStay(TENANT, process.env.WA_LIVE_CUSTOMER ?? "");
      const menu = await listMenuProducts(TENANT);
      if (!stay) { sent.push("→ [room service menolak: tamu tidak sedang menginap]"); return false; }
      if (menu.length === 0) { sent.push("→ [room service: menu kosong]"); return true; }
      sent.push(
        `*Menu Room Service — ${brand}*\n` +
          menu.slice(0, 5).map((m, i) => `${i + 1}. ${m.name} — ${idr(m.price)}`).join("\n") +
          (menu.length > 5 ? `\n… dan ${menu.length - 5} item lain` : ""),
      );
      return true;
    },
    async checkAvailability() {
      sent.push("→ [cek ketersediaan: jumlah kamar kosong per tipe]");
    },
    async showRoomTypes() {
      const types = await listRoomTypes(TENANT);
      sent.push(
        types.length === 0
          ? "Mohon maaf, saat ini belum ada tipe kamar yang dapat dipesan."
          : `Pilihan kamar & tarif per malam di *${brand}*:\n\n` +
            types.map((t) => `*${t.name}*\n    ${idr(t.base_rate)} / malam`).join("\n\n"),
      );
    },
    async showMenu() {
      const menu = await listMenuProducts(TENANT);
      sent.push(`[menu: ${menu.length} item]`);
    },
    async sendPortalLink() {
      sent.push("Pantau & kelola pesanan Anda di portal tamu: [tautan]");
    },
  };
}

run("LIVE — credentials", () => {
  it("reaches PostgREST with the service-role key", async () => {
    const url = (process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? "").replace(/\/$/, "");
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    console.log(`\n  cwd=${process.cwd()}`);
    console.log(`  SUPABASE_URL=${process.env.SUPABASE_URL === undefined ? "(unset)" : `"${process.env.SUPABASE_URL}"`}`);
    console.log(`  VITE_SUPABASE_URL len=${(process.env.VITE_SUPABASE_URL ?? "").length}`);
    console.log(`  SERVICE_ROLE_KEY len=${key.length}`);
    const res = await fetch(`${url}/rest/v1/wa_flows?select=id&limit=1`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    console.log(`  raw fetch => HTTP ${res.status}`);
    expect(res.status).toBe(200);
  });
});

run("LIVE — flows as they are stored for this hotel", () => {
  it("has active flows, in the order the engine will evaluate them", async () => {
    const flows = await listActiveFlows(TENANT);
    console.log("\n── Alur aktif ──");
    for (const f of flows) {
      console.log(
        `  [${String(f.priority).padStart(3)}] ${f.name}` +
          `  requires=${f.requires}  nodes=${f.definition.nodes.length}` +
          `\n        kata: ${f.triggerKeywords.join(", ")}`,
      );
    }
    expect(flows.length).toBeGreaterThan(0);
  });

  it("routes the same word differently depending on whether the guest is staying", async () => {
    const flows = await listActiveFlows(TENANT);
    const probe = ["halo", "menu", "booking", "mau pesan kamar", "lapar", "saya menunggu konfirmasi"];

    console.log("\n── Routing ──");
    console.log("  pesan                          | belum menginap        | sedang menginap");
    console.log("  " + "-".repeat(78));
    for (const p of probe) {
      const out = pickFlow(flows, p, { isInhouse: false })?.name ?? "(tidak ada — balasan bawaan)";
      const inn = pickFlow(flows, p, { isInhouse: true })?.name ?? "(tidak ada — balasan bawaan)";
      console.log(`  ${p.padEnd(30)} | ${out.padEnd(21)} | ${inn}`);
    }

    // The behaviour this whole change exists for.
    const asProspect = pickFlow(flows, "menu", { isInhouse: false });
    const asGuest = pickFlow(flows, "menu", { isInhouse: true });
    expect(asProspect?.id).not.toBe(asGuest?.id);
    expect(asGuest?.requires).toBe("inhouse");

    // And the guard against Indonesian prefix collisions, on the real keywords.
    expect(pickFlow(flows, "saya menunggu konfirmasi", { isInhouse: true })).toBeNull();
  });
});

run("LIVE — transcripts from real data", () => {
  it("reservation: greets, prices from the real room types, hands over", async () => {
    const flows = await listActiveFlows(TENANT);
    const flow = pickFlow(flows, "mau booking", { isInhouse: false });
    expect(flow, "no flow matched 'mau booking'").toBeTruthy();

    const sent: string[] = [];
    const brand = "Lor Kali";
    const r = await runFlow({
      flow: flow!,
      vars: { hotel_name: brand, guest_name: "Budi" },
      input: "mau booking",
      ctx: { reply: async (t) => { sent.push(t); }, actions: liveActions(brand, sent) },
    });

    console.log(`\n── Transkrip: "mau booking" → ${flow!.name} ──`);
    sent.forEach((s) => console.log("\n" + s));
    console.log(`\n  [status: ${r.status}${r.tookOver ? ", diambil alih" : ""}]`);

    expect(r.status).toBe("done");
    // The prices must come from the database, not from the template.
    expect(sent.join("\n")).toMatch(/\/ malam/);
  });

  it("guest request: an in-house guest reaches the real POS menu", async () => {
    const flows = await listActiveFlows(TENANT);
    const flow = pickFlow(flows, "menu", { isInhouse: true });
    expect(flow?.requires, "'menu' did not reach an in-house flow").toBe("inhouse");

    const sent: string[] = [];
    const brand = "Lor Kali";
    await runFlow({
      flow: flow!,
      vars: { hotel_name: brand, guest_name: "Budi" },
      input: "menu",
      ctx: { reply: async (t) => { sent.push(t); }, actions: liveActions(brand, sent) },
    });

    console.log(`\n── Transkrip: "menu" (tamu menginap) → ${flow!.name} ──`);
    sent.forEach((s) => console.log("\n" + s));

    const menu = await listMenuProducts(TENANT);
    expect(menu.length, "hotel has no active pos_products — the menu flow would answer 'belum tersedia'")
      .toBeGreaterThan(0);
  });

  it("greeting: a prospect asking for 'menu' gets the numbered options", async () => {
    const flows = await listActiveFlows(TENANT);
    const flow = pickFlow(flows, "menu", { isInhouse: false });
    expect(flow, "no flow matched 'menu' for a prospect").toBeTruthy();

    const sent: string[] = [];
    const brand = "Lor Kali";
    const r = await runFlow({
      flow: flow!,
      vars: { hotel_name: brand, guest_name: "" },
      input: "menu",
      ctx: { reply: async (t) => { sent.push(t); }, actions: liveActions(brand, sent) },
    });

    console.log(`\n── Transkrip: "menu" (belum menginap) → ${flow!.name} ──`);
    sent.forEach((s) => console.log("\n" + s));
    console.log(`\n  [status: ${r.status}, menunggu jawaban di node: ${r.nodeId ?? "-"}]`);

    expect(r.status).toBe("waiting");
  });
});
