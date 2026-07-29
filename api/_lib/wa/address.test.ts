// @vitest-environment node
import { describe, it, expect } from "vitest";
import { chooseOutboundTarget, isUsablePhone, isLidJid, phoneToJid } from "./address";

const LID = "181248240648388@lid";       // Ridho, dari produksi
const PN = "6285641504066@s.whatsapp.net";

describe("isLidJid", () => {
  it("mengenali alias privasi WhatsApp", () => {
    expect(isLidJid(LID)).toBe(true);
    expect(isLidJid("181248240648388@LID")).toBe(true);
    expect(isLidJid(PN)).toBe(false);
    expect(isLidJid(null)).toBe(false);
  });
});

describe("isUsablePhone", () => {
  it("menerima nomor telepon biasa", () => {
    expect(isUsablePhone("6285641504066")).toBe(true);
    expect(isUsablePhone("+62 856-4150-4066")).toBe(true);
  });

  it("menolak angka LID yang menyamar sebagai nomor", () => {
    // Inilah yang tersimpan di customers.phone saat WhatsApp menyembunyikan
    // nomornya; membandingkannya dengan LID-nya sendiri satu-satunya cara tahu.
    expect(isUsablePhone("181248240648388", LID)).toBe(false);
  });

  it("menolak yang terlalu pendek atau kosong", () => {
    expect(isUsablePhone("123")).toBe(false);
    expect(isUsablePhone("")).toBe(false);
    expect(isUsablePhone(null)).toBe(false);
  });
});

describe("chooseOutboundTarget", () => {
  it("memakai nomor pendamping dari WhatsApp bila ada", () => {
    expect(chooseOutboundTarget({ phoneJid: LID, replyJid: PN })).toEqual({
      jid: PN, unroutable: false,
    });
  });

  it("memakai alamat aslinya bila memang bukan LID", () => {
    expect(chooseOutboundTarget({ phoneJid: PN })).toEqual({ jid: PN, unroutable: false });
  });

  it("memakai nomor yang diisi hotel di CRM saat WhatsApp hanya memberi LID", () => {
    // Jalan keluar yang membuat percakapan buntu bisa dipulihkan tanpa
    // menunggu WhatsApp membuka nomornya.
    expect(chooseOutboundTarget({ phoneJid: LID, customerPhone: "6285641504066" })).toEqual({
      jid: "6285641504066@s.whatsapp.net", unroutable: false,
    });
  });

  it("menandai TIDAK BISA DIKIRIM saat hanya ada LID", () => {
    // Gateway menjawab 200 lalu membuang pesannya, jadi jawabannya tak bisa
    // dipercaya — penandaan inilah yang membuat kegagalan tetap tercatat.
    expect(chooseOutboundTarget({ phoneJid: LID })).toEqual({ jid: LID, unroutable: true });
  });

  it("tidak tertipu oleh customers.phone yang isinya angka LID", () => {
    // Persis kondisi Ridho di produksi: phone-nya adalah angka LID-nya sendiri.
    expect(chooseOutboundTarget({ phoneJid: LID, customerPhone: "181248240648388" })).toEqual({
      jid: LID, unroutable: true,
    });
  });
});

describe("phoneToJid", () => {
  it("membuang selain angka", () => {
    expect(phoneToJid("+62 856-4150-4066")).toBe("6285641504066@s.whatsapp.net");
  });
});
