// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { bookingOwnerProfileId } from "./service";

/**
 * Pemeriksaan kepemilikan pesanan.
 *
 * Ini satu-satunya hal yang berdiri antara "tamu membayar pesanannya" dan "siapa
 * pun yang menebak sebuah nomor pesanan menerbitkan invoice atas nama orang
 * lain", jadi ia diuji terpisah dari jalur permintaannya.
 */
describe("bookingOwnerProfileId", () => {
  const OLD = { ...process.env };
  let captured = "";

  beforeEach(() => {
    process.env.VITE_SUPABASE_URL = "https://db.local";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "svc";
    captured = "";
  });
  afterEach(() => {
    process.env = { ...OLD };
    vi.unstubAllGlobals();
  });

  function stub(rows: unknown, ok = true, status = 200) {
    vi.stubGlobal(
      "fetch",
      (async (url: string) => {
        captured = String(url);
        return { ok, status, json: async () => rows } as Response;
      }) as unknown as typeof fetch,
    );
  }

  it("mengembalikan profil pemilik lewat relasi customers", async () => {
    stub([{ customers: { profile_id: "prof-1" } }]);
    await expect(bookingOwnerProfileId("BK-1")).resolves.toBe("prof-1");
    expect(captured).toContain("reference=eq.BK-1");
    expect(captured).toContain("customers(profile_id)");
  });

  it("mengembalikan null untuk pesanan yang tidak ada", async () => {
    stub([]);
    await expect(bookingOwnerProfileId("BK-TIDAK-ADA")).resolves.toBeNull();
  });

  it("mengembalikan null saat pesanan tidak punya profil terkait", async () => {
    // Booking yang dibuat staf untuk tamu walk-in: kontaknya ada, profilnya
    // tidak. Tidak boleh dianggap milik siapa pun.
    stub([{ customers: { profile_id: null } }]);
    await expect(bookingOwnerProfileId("BK-2")).resolves.toBeNull();
  });

  it("melempar saat pembacaan gagal, bukan mengembalikan null", async () => {
    // Kegagalan baca yang dijawab null akan terbaca sebagai "bukan milikmu" —
    // jawaban yang salah, dan menyembunyikan kerusakan di baliknya.
    stub({}, false, 500);
    await expect(bookingOwnerProfileId("BK-3")).rejects.toThrow(/booking_owner_read_failed_500/);
  });

  it("meng-encode nomor pesanan agar tidak bisa menyuntik filter", async () => {
    stub([]);
    await bookingOwnerProfileId("BK-1&select=*");
    expect(captured).toContain("BK-1%26select%3D*");
  });
});
