// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createServer, type Server } from "node:http";
import { AddressInfo } from "node:net";
import { resolveOrProvisionGuest, WaRateLimitError, phoneDigits, callablePhone, usableName, isProvisionablePhone } from "./guest";
import { profileIdFor } from "../identity";

const PHONE_JID = "628123456789@s.whatsapp.net";
const DIGITS = "628123456789";
const TENANT = "11111111-1111-4111-8111-111111111111";
const SSO_SUB = "ventera|wa-628123456789";

/** One mock standing in for both Supabase PostgREST and the Ventera provision endpoint. */
interface MockState {
  // wa_guest_identities the GET should return (the resolve short-circuit).
  identityRows: Array<{ id: string; sso_sub: string | null; profile_id: string | null; customer_id: string | null }>;
  // profiles / customers the respective GETs return (empty = "not provisioned yet").
  profileRows: Array<{ id: string; role: string; is_active: boolean; tenant_id?: string }>;
  customerRows: Array<{ id: string }>;

  // Recorded writes / calls.
  venteraCalls: Array<{ auth: string | undefined; body: Record<string, unknown> }>;
  rpcCalls: Array<Record<string, unknown>>;
  profileInserts: Array<Record<string, unknown>>;
  customerInserts: Array<Record<string, unknown>>;
  /** PATCH ke customers — di sini pemulihan nomor terlihat. */
  customerPatches: Array<Record<string, unknown>>;
  identityInserts: Array<Record<string, unknown>>;
  identityPatches: Array<Record<string, unknown>>;

  // Tunables per test.
  rateAllowed: boolean;
  venteraStatus: number;
  venteraSub: string | undefined;
}

let server: Server;
let state: MockState;

function readBody(req: import("node:http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => resolve(raw));
  });
}

beforeAll(async () => {
  server = createServer(async (req, res) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const body = await readBody(req);
    const json = (status: number, payload: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };

    // ── Ventera provision ──
    if (url.pathname === "/api/admin/users/provision") {
      state.venteraCalls.push({
        auth: req.headers.authorization,
        body: JSON.parse(body || "{}"),
      });
      if (state.venteraStatus !== 200) {
        json(state.venteraStatus, { error: "provision_failed" });
        return;
      }
      json(200, { ok: true, sub: state.venteraSub, created: true });
      return;
    }

    // ── rate-limit RPC ──
    if (url.pathname === "/rest/v1/rpc/check_wa_rate_limit") {
      state.rpcCalls.push(JSON.parse(body || "{}"));
      json(200, state.rateAllowed);
      return;
    }

    // ── wa_guest_identities ──
    if (url.pathname === "/rest/v1/wa_guest_identities") {
      if (req.method === "GET") return json(200, state.identityRows);
      if (req.method === "POST") {
        state.identityInserts.push(JSON.parse(body));
        return json(201, []);
      }
      if (req.method === "PATCH") {
        state.identityPatches.push(JSON.parse(body));
        return json(200, []);
      }
    }

    // ── profiles ──
    if (url.pathname === "/rest/v1/profiles") {
      if (req.method === "GET") {
        // Hormati filter tenant_id kalau ada. Mock yang mengabaikannya
        // menyembunyikan justru bug ini: sebuah profil dengan tenant LAIN akan
        // tampak "ada" untuk kueri yang disaring per-tenant, padahal PostgREST
        // tidak akan mengembalikannya.
        const want = (url.searchParams.get("tenant_id") ?? "").replace(/^eq\./, "");
        const rows = want
          ? state.profileRows.filter((r) => r.tenant_id === want)
          : state.profileRows;
        return json(200, rows);
      }
      if (req.method === "POST") {
        const row = JSON.parse(body);
        state.profileInserts.push(row);
        return json(201, [{ role: "customer", is_active: true, ...row }]);
      }
      if (req.method === "PATCH") return json(200, state.profileRows);
    }

    // ── customers ──
    if (url.pathname === "/rest/v1/customers") {
      if (req.method === "GET") return json(200, state.customerRows);
      if (req.method === "POST") {
        const row = JSON.parse(body);
        state.customerInserts.push(row);
        return json(201, [{ id: "cust-new-1", ...row }]);
      }
      if (req.method === "PATCH") {
        state.customerPatches.push(JSON.parse(body));
        return json(200, []);
      }
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${port}`;

  process.env.SUPABASE_URL = base;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
  process.env.SSO_VENTERA_PROVISION_URL = base;
  process.env.PROVISION_API_KEY = "provision-key-abc";
  delete process.env.SSO_UUID_NAMESPACE;
  delete process.env.TENANT_SLUG;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

beforeEach(() => {
  state = {
    identityRows: [],
    profileRows: [],
    customerRows: [],
    venteraCalls: [],
    rpcCalls: [],
    profileInserts: [],
    customerInserts: [],
    customerPatches: [],
    identityInserts: [],
    identityPatches: [],
    rateAllowed: true,
    venteraStatus: 200,
    venteraSub: SSO_SUB,
  };
});

describe("phoneDigits", () => {
  it("strips the WhatsApp suffix and non-digits", () => {
    expect(phoneDigits("628123456789@s.whatsapp.net")).toBe("628123456789");
    expect(phoneDigits("+62 812-3456:1@s.whatsapp.net")).toBe("6281234561");
  });
});

describe("resolveOrProvisionGuest", () => {
  it("(a) returns the stored ids for a known number without calling Ventera", async () => {
    state.identityRows = [{ id: "idn-1", sso_sub: SSO_SUB, profile_id: "prof-1", customer_id: "cust-1" }];
    state.profileRows = [{ id: "prof-1", role: "customer", is_active: true }];
    state.customerRows = [{ id: "cust-1" }];

    const out = await resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi");

    expect(out).toEqual({ profileId: "prof-1", customerId: "cust-1", ssoSub: SSO_SUB });
    // Short-circuit: no provisioning side effects at all.
    expect(state.venteraCalls).toHaveLength(0);
    expect(state.rpcCalls).toHaveLength(0);
    expect(state.profileInserts).toHaveLength(0);
    expect(state.customerInserts).toHaveLength(0);
    expect(state.identityInserts).toHaveLength(0);
  });

  it("repairs an orphan identity without creating a duplicate SSO account", async () => {
    state.identityRows = [{ id: "idn-orphan", sso_sub: SSO_SUB, profile_id: "prof-missing", customer_id: "cust-missing" }];

    const out = await resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi");

    expect(out.ssoSub).toBe(SSO_SUB);
    expect(state.venteraCalls).toHaveLength(0);
    expect(state.profileInserts).toHaveLength(1);
    expect(state.customerInserts).toHaveLength(1);
    expect(state.identityPatches[0]).toMatchObject({
      sso_sub: SSO_SUB,
      profile_id: profileIdFor(SSO_SUB),
      customer_id: "cust-new-1",
    });
  });

  it("(b) provisions a new guest: Ventera + profile + customer + identity", async () => {
    const out = await resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi Santoso");

    // Ventera called once, authenticated, with the bare digits.
    expect(state.venteraCalls).toHaveLength(1);
    expect(state.venteraCalls[0].auth).toBe("Bearer provision-key-abc");
    expect(state.venteraCalls[0].body).toMatchObject({ phone: DIGITS, displayName: "Budi Santoso" });
    // Realm DISEBUT, dan harus realm yang client OIDC GoStay diizinkan pakai.
    // Dibiarkan default (ventera-shop), akun tamu terbentuk di realm yang tak
    // pernah bisa dipakai login — form OTP menjawab "nomor tidak terdaftar".
    expect(state.venteraCalls[0].body.realm).toBe("ventera-shop");

    // profileId derives from the SSO sub, same as the web flow.
    const expectedProfileId = profileIdFor(SSO_SUB);
    expect(out.profileId).toBe(expectedProfileId);
    expect(out.ssoSub).toBe(SSO_SUB);
    expect(out.customerId).toBe("cust-new-1");

    // profiles row: service-role, tenant explicit, no role sent (DB decides).
    expect(state.profileInserts).toHaveLength(1);
    expect(state.profileInserts[0]).toMatchObject({
      id: expectedProfileId,
      sso_sub: SSO_SUB,
      tenant_id: TENANT,
      full_name: "Budi Santoso",
    });
    expect(state.profileInserts[0]).not.toHaveProperty("role");

    // customers row: profile_id chains it to the person; tenant explicit.
    expect(state.customerInserts).toHaveLength(1);
    expect(state.customerInserts[0]).toMatchObject({
      profile_id: expectedProfileId,
      tenant_id: TENANT,
      full_name: "Budi Santoso",
      phone: DIGITS,
    });

    // identity row written back with all three ids for next time.
    expect(state.identityInserts).toHaveLength(1);
    expect(state.identityInserts[0]).toMatchObject({
      tenant_id: TENANT,
      phone_jid: PHONE_JID,
      sso_sub: SSO_SUB,
      profile_id: expectedProfileId,
      customer_id: "cust-new-1",
    });
  });

  it("(b') falls back to the number as the name when no pushName is given", async () => {
    await resolveOrProvisionGuest(PHONE_JID, TENANT);
    expect(state.venteraCalls[0].body).not.toHaveProperty("displayName");
    expect(state.profileInserts[0]).toMatchObject({ full_name: DIGITS });
  });

  it("(c) throws WaRateLimitError and provisions nothing when the limiter denies", async () => {
    state.rateAllowed = false;

    await expect(resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi")).rejects.toBeInstanceOf(WaRateLimitError);

    expect(state.venteraCalls).toHaveLength(0);
    expect(state.profileInserts).toHaveLength(0);
    expect(state.customerInserts).toHaveLength(0);
    expect(state.identityInserts).toHaveLength(0);
  });

  it("(d) falls back to a local identity when Ventera fails", async () => {
    state.venteraStatus = 500;

    const out = await resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi");

    // Ventera was attempted; a local WA-scoped identity was used instead, and the
    // guest is still fully provisioned (profile + customer + identity).
    expect(state.venteraCalls).toHaveLength(1);
    expect(out.ssoSub).toBe(`wa:${PHONE_JID}`);
    expect(out.profileId).toBe(profileIdFor(`wa:${PHONE_JID}`));
    expect(state.profileInserts).toHaveLength(1);
    expect(state.customerInserts).toHaveLength(1);
    expect(state.identityInserts).toHaveLength(1);
  });

  it("(d') falls back to local when Ventera returns 200 but no sub", async () => {
    state.venteraSub = undefined;

    const out = await resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi");
    expect(out.ssoSub).toBe(`wa:${PHONE_JID}`);
    expect(state.profileInserts).toHaveLength(1);
  });

  it("patches a half-provisioned identity row instead of inserting a duplicate", async () => {
    // Identity exists but was never completed (no profile_id/customer_id).
    state.identityRows = [{ id: "idn-9", sso_sub: null, profile_id: null, customer_id: null }];

    await resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi");

    expect(state.identityInserts).toHaveLength(0);
    expect(state.identityPatches).toHaveLength(1);
    expect(state.identityPatches[0]).toMatchObject({
      sso_sub: SSO_SUB,
      profile_id: profileIdFor(SSO_SUB),
      customer_id: "cust-new-1",
    });
  });
});

describe("callablePhone — a number staff can actually dial", () => {
  it("uses the alternate for a LID chat", () => {
    // A LID is a privacy alias. Storing its digits gave CRM a 15-digit string
    // that reaches nobody, which is what staff hit when they tried to call back.
    expect(callablePhone("181248240648388@lid", "628123456789@s.whatsapp.net")).toBe("628123456789");
  });

  it("returns null for a LID with no alternate, rather than its digits", () => {
    expect(callablePhone("181248240648388@lid")).toBeNull();
    expect(callablePhone("181248240648388@lid", "")).toBeNull();
  });

  it("uses the chat's own number when it is already a real one", () => {
    expect(callablePhone("628123456789@s.whatsapp.net")).toBe("628123456789");
    // An alternate is irrelevant when the chat is not LID-addressed.
    expect(callablePhone("628123456789@s.whatsapp.net", "628999@s.whatsapp.net")).toBe("628123456789");
  });

  it("rejects anything too short to be a phone number", () => {
    expect(callablePhone("123@s.whatsapp.net")).toBeNull();
    expect(callablePhone("@s.whatsapp.net")).toBeNull();
  });
});

describe("usableName — a name worth showing staff", () => {
  it("keeps a real pushName", () => {
    expect(usableName("Ridho")).toBe("Ridho");
    expect(usableName("  Juan P  ")).toBe("Juan P");
    expect(usableName("Budi 2")).toBe("Budi 2");
  });

  it("rejects WhatsApp's placeholder, which reached CRM as a guest's name", () => {
    expect(usableName("~")).toBeNull();
    expect(usableName("...")).toBeNull();
    expect(usableName("   ")).toBeNull();
    expect(usableName(undefined)).toBeNull();
  });

  it("keeps a name that merely contains punctuation", () => {
    expect(usableName("~Rifqi")).toBe("~Rifqi");
  });
});

describe("isProvisionablePhone — hanya nomor sungguhan yang layak dikirim ke SSO", () => {
  it("menolak angka LID, yang terlihat seperti nomor tapi bukan", () => {
    // 15 digit, jadi panjang saja tidak bisa membedakannya.
    expect(isProvisionablePhone("181248240648388", "181248240648388@lid")).toBe(false);
  });

  it("menerima nomor pendamping yang WhatsApp kirim untuk tamu LID", () => {
    expect(isProvisionablePhone("6285187586500", "181248240648388@lid")).toBe(true);
  });

  it("menerima nomor biasa dari chat non-LID", () => {
    expect(isProvisionablePhone("628123456789", "628123456789@s.whatsapp.net")).toBe(true);
  });

  it("menolak yang terlalu pendek atau terlalu panjang untuk sebuah nomor", () => {
    expect(isProvisionablePhone("6281", "6281@s.whatsapp.net")).toBe(false);
    expect(isProvisionablePhone("6281234567890123456", "x@s.whatsapp.net")).toBe(false);
  });
});

describe("tamu LID — akun SSO yang membuatnya bisa login", () => {
  const LID_JID = "181248240648388@lid";
  const COMPANION = "6285187586500@s.whatsapp.net";

  it("memakai NOMOR ASLI tamu, bukan angka LID, saat membuat akun SSO", async () => {
    // Inti bug yang membuat SEMUA tamu LID tak bisa login: angka LID dikirim ke
    // Ventera, Ventera menolaknya, dan setiap tamu jatuh ke sso_sub lokal.
    await resolveOrProvisionGuest(LID_JID, TENANT, "Sellora", COMPANION);

    expect(state.venteraCalls).toHaveLength(1);
    expect(state.venteraCalls[0].body).toMatchObject({ phone: "6285187586500" });
  });

  it("tidak memanggil SSO sama sekali untuk LID tanpa nomor pendamping", async () => {
    // Tak ada nomor untuk didaftarkan; memanggil SSO dengan angka LID hanya
    // menghasilkan penolakan. Percakapannya tetap harus jalan.
    const out = await resolveOrProvisionGuest(LID_JID, TENANT, "Sellora");

    expect(state.venteraCalls).toHaveLength(0);
    expect(out.ssoSub).toBe(`wa:${LID_JID}`);
    expect(out.profileId).toBe(profileIdFor(`wa:${LID_JID}`));
  });
});

describe("tamu yang pernah menghubungi hotel LAIN", () => {
  // Satu nomor = satu profil di semua hotel, tapi `profiles.tenant_id` hanya
  // menyimpan SATU nilai: hotel tempat ia pertama kali muncul. Dulu pemeriksaan
  // referensi menyaring profil dengan tenant yang sedang melayani, sehingga tamu
  // seperti ini SELALU dinyatakan "belum lengkap": jalur cepat tak pernah
  // diambil, dan pemulihan nomor yang hanya hidup di jalur itu tak pernah jalan.
  const LID_JID = "181248240648388@lid";
  const COMPANION = "6285187586500@s.whatsapp.net";
  const HOTEL_LAIN = "22222222-2222-4222-8222-222222222222";

  beforeEach(() => {
    state.identityRows = [
      { id: "idn-1", sso_sub: `wa:${LID_JID}`, profile_id: "prof-1", customer_id: "cust-1" },
    ];
    // Profilnya milik hotel LAIN; kontaknya milik hotel yang sedang melayani.
    state.profileRows = [{ id: "prof-1", role: "customer", is_active: true, tenant_id: HOTEL_LAIN }];
    state.customerRows = [{ id: "cust-1" }];
  });

  it("takes the short-circuit instead of re-provisioning on every message", async () => {
    const out = await resolveOrProvisionGuest(LID_JID, TENANT, "Sellora", COMPANION);

    expect(out.customerId).toBe("cust-1");
    expect(out.profileId).toBe("prof-1");
    expect(state.venteraCalls).toHaveLength(0);
    expect(state.profileInserts).toHaveLength(0);
    expect(state.customerInserts).toHaveLength(0);
  });

  it("repairs the contact number, which the tenant filter used to prevent", async () => {
    // Inti keluhan produksi: customers.phone tercatat sebagai angka LID, dan
    // tetap begitu berhari-hari meski setiap pesan membawa nomor aslinya.
    await resolveOrProvisionGuest(LID_JID, TENANT, "Sellora", COMPANION);

    expect(state.customerPatches.some((p) => p.phone === "6285187586500")).toBe(true);
  });

  it("still re-provisions when the CONTACT genuinely belongs to another hotel", async () => {
    // Kontak memang per-hotel: kalau baris kontaknya tidak ada di hotel ini,
    // tamu ini belum punya kontak di sini dan harus dibuatkan.
    state.customerRows = [];

    await resolveOrProvisionGuest(LID_JID, TENANT, "Sellora", COMPANION);

    expect(state.customerInserts).toHaveLength(1);
  });
});

describe("realm akun tamu", () => {
  it("bisa diarahkan lewat env bila pendaftaran client berubah", async () => {
    const prev = process.env.SSO_GUEST_REALM;
    process.env.SSO_GUEST_REALM = "ventera-public";
    try {
      await resolveOrProvisionGuest(PHONE_JID, TENANT, "Budi");
      expect(state.venteraCalls[0].body.realm).toBe("ventera-public");
    } finally {
      if (prev === undefined) delete process.env.SSO_GUEST_REALM;
      else process.env.SSO_GUEST_REALM = prev;
    }
  });
});
