import { describe, expect, it } from "vitest";
import { roleHome } from "./AuthContext";

describe("roleHome", () => {
  it("routes hotel staff to the dashboard", () => {
    expect(roleHome("staff", "tenant-1")).toBe("/dashboard");
    expect(roleHome("admin", "tenant-1")).toBe("/dashboard");
  });

  it("routes a prospective owner to hotel creation", () => {
    expect(roleHome("customer", null)).toBe("/create-hotel");
  });

  it("keeps a tenant-bound customer in the guest portal", () => {
    expect(roleHome("customer", "tenant-1")).toBe("/portal");
  });
});
