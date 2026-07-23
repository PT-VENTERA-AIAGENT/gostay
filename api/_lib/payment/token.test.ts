// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { matchGatewayToken, tokenForEnv, safeEqual } from "./token";

describe("matchGatewayToken — accepts prod OR sandbox, reports which", () => {
  const PROD = "prod-token-value-longlonglong";
  const SANDBOX = "sandbox-token-value-longlong";
  beforeEach(() => {
    process.env.INTERNAL_TOKEN_PRODUCTION = PROD;
    process.env.INTERNAL_TOKEN_SANDBOX = SANDBOX;
  });
  afterEach(() => {
    delete process.env.INTERNAL_TOKEN_PRODUCTION;
    delete process.env.INTERNAL_TOKEN_SANDBOX;
  });

  it("identifies the production token", () => {
    expect(matchGatewayToken(PROD)).toBe("production");
  });
  it("identifies the sandbox token", () => {
    expect(matchGatewayToken(SANDBOX)).toBe("sandbox");
  });
  it("rejects an unknown / missing token", () => {
    expect(matchGatewayToken("nope")).toBeNull();
    expect(matchGatewayToken(undefined)).toBeNull();
    expect(matchGatewayToken("")).toBeNull();
  });
  it("fails closed when tokens are unconfigured", () => {
    delete process.env.INTERNAL_TOKEN_PRODUCTION;
    delete process.env.INTERNAL_TOKEN_SANDBOX;
    expect(matchGatewayToken(PROD)).toBeNull();
  });
  it("tokenForEnv returns the matching env token", () => {
    expect(tokenForEnv("production")).toBe(PROD);
    expect(tokenForEnv("sandbox")).toBe(SANDBOX);
  });
});

describe("safeEqual — constant-time, length-safe", () => {
  it("does not throw on unequal lengths (guards timingSafeEqual)", () => {
    expect(() => safeEqual("short", "muchlongervalue")).not.toThrow();
    expect(safeEqual("short", "muchlongervalue")).toBe(false);
  });
  it("denies when expected is missing", () => {
    expect(safeEqual("x", undefined)).toBe(false);
  });
});
