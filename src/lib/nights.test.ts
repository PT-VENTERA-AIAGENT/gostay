import { describe, it, expect } from "vitest";
import { nightsLabel } from "./nights";
import { ID } from "./translations";

/** The real Indonesian lookup, so the test fails if a key goes missing. */
const id = (s: string) => ID[s] ?? s;
/** English is the identity fallback the app uses when no translation applies. */
const en = (s: string) => s;

describe("nightsLabel", () => {
  it("says 'malam' in Indonesian, whatever the count", () => {
    // Indonesian has no plural form. The bug this replaces put an English "s"
    // on it, or the English word entirely, inside an Indonesian console.
    expect(nightsLabel(1, id)).toBe("1 malam");
    expect(nightsLabel(3, id)).toBe("3 malam");
  });

  it("gets the English plural right", () => {
    // The reported bug read "1 nights".
    expect(nightsLabel(1, en)).toBe("1 night");
    expect(nightsLabel(2, en)).toBe("2 nights");
    expect(nightsLabel(0, en)).toBe("0 nights");
  });

  it("has both keys in the Indonesian dictionary", () => {
    // Guards the failure mode where only the plural was translated, so the
    // singular fell through to English and produced "1 night" in an Indonesian
    // sentence.
    expect(ID["night"]).toBe("malam");
    expect(ID["nights"]).toBe("malam");
  });
});
