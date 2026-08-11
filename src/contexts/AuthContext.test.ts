import { describe, expect, it } from "vitest";
import { postLoginDestination, roleHome } from "./AuthContext";

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

describe("postLoginDestination", () => {
  it("does not return hotel members to the public portal after SSO", () => {
    expect(postLoginDestination("admin", "tenant-1", "/portal")).toBe("/dashboard");
    expect(postLoginDestination("staff", "tenant-1", "/portal/profile")).toBe("/dashboard");
  });

  it("preserves a guest portal return and non-portal staff deep links", () => {
    expect(postLoginDestination("customer", "tenant-1", "/portal/profile")).toBe("/portal/profile");
    expect(postLoginDestination("admin", "tenant-1", "/settings")).toBe("/settings");
  });
});
