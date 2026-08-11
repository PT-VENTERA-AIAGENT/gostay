// Aturan pemilihan hotel di portal, dipisahkan dari React supaya bisa diuji
// tanpa merender apa pun.
//
// Yang dijaga di sini adalah bug produksi 30 Jul 2026: seorang tamu membuka
// tautan Lor Kali, berhasil login, dan disuguhi Kopi Rintik — hotel tempat ia
// pertama kali muncul. `profiles.tenant_id` hanya bisa menyimpan SATU hotel,
// sementara seorang tamu bisa menjadi tamu di beberapa hotel sekaligus.
import { describe, it, expect } from "vitest";
import { pickTenant, isWrongHotel, slugHintFor, type TenantChoice } from "./useTenant";

const lorKali: TenantChoice = { id: "t-lor", slug: "lor-kali", name: "Lor Kali" };
const kopiRintik: TenantChoice = { id: "t-kopi", slug: "gostay", name: "Kopi Rintik" };
const puncak: TenantChoice = { id: "t-puncak", slug: "hotel-puncak-bebas", name: "Hotel Puncak Bebas" };

describe("pickTenant", () => {
  it("follows the hotel whose link the guest arrived on", () => {
    // Inti bugnya: tanpa aturan ini, tamu melihat hotel pertamanya.
    const picked = pickTenant([kopiRintik, puncak, lorKali], "lor-kali", "t-kopi");
    expect(picked).toBe(lorKali);
  });

  it("falls back to the profile's own hotel when the link names none", () => {
    const picked = pickTenant([kopiRintik, lorKali], null, "t-kopi");
    expect(picked).toBe(kopiRintik);
  });

  it("takes the only row for staff, who read exactly one hotel", () => {
    expect(pickTenant([kopiRintik], null, undefined)).toBe(kopiRintik);
  });

  it("returns null when nothing is readable, rather than inventing a hotel", () => {
    expect(pickTenant([], "lor-kali", "t-kopi")).toBeNull();
  });

  it("fails closed for an unknown slug instead of showing the first hotel", () => {
    const picked = pickTenant([kopiRintik], "hotel-yang-tidak-ada", "t-kopi");
    expect(picked).toBeNull();
  });
});

describe("slugHintFor", () => {
  // Bug produksi 31 Jul 2026: admin Lor Kali login di laptop lain dan disuguhi
  // dashboard berkop Kopi Rintik. Browser segar tak punya localStorage, jadi
  // slug jatuh ke VITE_TENANT_SLUG build produksi ("gostay" = Kopi Rintik) —
  // dan sejak 045 admin yang pernah jadi tamu di sana BISA membaca barisnya,
  // sehingga pickTenant memilihnya mengalahkan hotel si admin sendiri.
  it("kills the browser-supplied slug for admin and staff", () => {
    expect(slugHintFor("admin", "gostay")).toBeNull();
    expect(slugHintFor("staff", "gostay")).toBeNull();
  });

  it("keeps the slug for guests, whose visits it exists to serve", () => {
    expect(slugHintFor("customer", "lor-kali")).toBe("lor-kali");
  });

  it("keeps the slug for anonymous visitors, who have no role yet", () => {
    expect(slugHintFor(null, "lor-kali")).toBe("lor-kali");
  });

  it("with the hint dead, an admin lands on their own hotel", () => {
    // Rangkaian penuh gejalanya: baris Kopi Rintik terbaca (045), slug build
    // menunjuk ke sana, tapi admin Lor Kali tetap membuka Lor Kali.
    const slug = slugHintFor("admin", "gostay");
    const picked = pickTenant([kopiRintik, lorKali], slug, "t-lor");
    expect(picked).toBe(lorKali);
  });
});

describe("isWrongHotel", () => {
  it("is true when the link asked for a hotel we did not open", () => {
    expect(isWrongHotel("lor-kali", kopiRintik)).toBe(true);
  });

  it("is false when the link got what it asked for", () => {
    expect(isWrongHotel("lor-kali", lorKali)).toBe(false);
  });

  it("is false when the visit named no hotel at all", () => {
    // Staf membuka dashboard tanpa ?hotel= — tidak ada yang salah di situ.
    expect(isWrongHotel(null, kopiRintik)).toBe(false);
  });

  it("says nothing while the hotel is still loading", () => {
    expect(isWrongHotel("lor-kali", null)).toBe(false);
  });
});
