// @vitest-environment node
import { describe, it, expect } from "vitest";
import { mapXenditStatus, envForMode, modeForEnv } from "./xendit";
import { externalIdFor, referenceFromExternalId } from "./handlers";

describe("mapXenditStatus", () => {
  it("treats PAID and SETTLED as paid", () => {
    expect(mapXenditStatus("PAID")).toBe("paid");
    expect(mapXenditStatus("SETTLED")).toBe("paid");
    expect(mapXenditStatus("paid")).toBe("paid");
  });
  it("treats EXPIRED as expired, everything else as pending", () => {
    expect(mapXenditStatus("EXPIRED")).toBe("expired");
    expect(mapXenditStatus("PENDING")).toBe("pending");
    expect(mapXenditStatus(undefined)).toBe("pending");
  });
});

describe("mode ⇄ environment mapping", () => {
  it("live ⇄ production, test ⇄ sandbox", () => {
    expect(envForMode("live")).toBe("production");
    expect(envForMode("test")).toBe("sandbox");
    expect(modeForEnv("production")).toBe("live");
    expect(modeForEnv("sandbox")).toBe("test");
  });
});

describe("external_id ⇄ booking reference", () => {
  it("prefixes with GOSTAY-", () => {
    expect(externalIdFor("BK-20260418-AB3D")).toBe("GOSTAY-BK-20260418-AB3D");
  });
  it("strips the prefix", () => {
    expect(referenceFromExternalId("GOSTAY-BK-20260418-AB3D")).toBe("BK-20260418-AB3D");
  });
  it("strips a retry suffix too (-R1, -R2, …)", () => {
    expect(referenceFromExternalId("GOSTAY-BK-20260418-AB3D-R2")).toBe("BK-20260418-AB3D");
  });
  it("round-trips", () => {
    const ref = "BK-20260101-XYZ9";
    expect(referenceFromExternalId(externalIdFor(ref))).toBe(ref);
  });
});
