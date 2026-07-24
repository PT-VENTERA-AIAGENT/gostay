import { describe, expect, it } from "vitest";
import { signupContextFor } from "./sso";

describe("signupContextFor", () => {
  it("treats the main application login as owner onboarding", () => {
    expect(signupContextFor("/")).toBe("owner");
    expect(signupContextFor("/create-hotel")).toBe("owner");
    expect(signupContextFor("/dashboard")).toBe("owner");
  });

  it("keeps hotel portal deep links in guest mode", () => {
    expect(signupContextFor("/portal")).toBe("guest");
    expect(signupContextFor("/portal/book/review")).toBe("guest");
    expect(signupContextFor("/portal/profile")).toBe("guest");
  });
});
