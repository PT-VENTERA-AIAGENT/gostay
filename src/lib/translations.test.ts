// @vitest-environment node
// Reads its own source file and shells out to git, so it needs node rather than
// the jsdom default this directory otherwise runs under.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { EN, ID } from "./translations";

// Guards for the two ways translation breaks without anything throwing.
//
// A string with no entry in either map falls through to its source text: the
// call runs, nothing errors, the screen just stays in the wrong language. A
// duplicate key is worse — legal JavaScript, last one wins, and the entry you
// wrote is silently discarded. Neither is visible to tsc or to a render test,
// so each needs its own assertion.
//
// This is the second half of the i18n net. GlobalSearch.test.tsx and
// i18nSmoke.test.tsx prove t() is bound and does not throw; these prove it
// actually translates.

const SRC = readFileSync(new URL("./translations.ts", import.meta.url), "utf8");

/** Every tracked source file except the translation machinery and tests. */
function trackedFiles(): string[] {
  return execSync('git ls-files "src/*.ts" "src/*.tsx" "src/**/*.ts" "src/**/*.tsx"', {
    encoding: "utf8",
    cwd: process.cwd(),
  })
    .trim()
    .split("\n")
    .filter((f) => !/translations\.ts|i18n\.tsx|\.test\./.test(f));
}

/** Keys in source order, so duplicates survive — the object literal loses them. */
function sourceKeys(name: string): string[] {
  const start = SRC.indexOf(`export const ${name}`);
  const body = SRC.slice(start, SRC.indexOf("\n};", start));
  return [...body.matchAll(/^\s*"((?:[^"\\]|\\.)*)":/gm)].map((m) => m[1]);
}

describe("translation maps", () => {
  for (const name of ["EN", "ID"] as const) {
    it(`${name} has no duplicate keys`, () => {
      const keys = sourceKeys(name);
      const seen = new Set<string>();
      const dupes = keys.filter((k) => (seen.has(k) ? true : (seen.add(k), false)));
      expect(dupes).toEqual([]);
    });
  }

  it("maps are non-trivial, so a truncated file cannot pass the checks below", () => {
    expect(Object.keys(EN).length).toBeGreaterThan(300);
    expect(Object.keys(ID).length).toBeGreaterThan(200);
  });
});

describe("wrapped strings are safe to wrap", () => {
  it("no t() argument contains an HTML entity", () => {
    // JSX decodes entities in literal text but not in a string a function
    // returns, so `>Analytics &amp; Reports<` renders an ampersand while
    // `{t("Analytics &amp; Reports")}` renders the five characters "&amp;".
    // Wrapping text is what introduces this, so the check lives with the sweep.
    const files = trackedFiles();
    const bad: string[] = [];
    for (const file of files) {
      const code = readFileSync(file, "utf8");
      for (const m of code.matchAll(/(?:^|[^A-Za-z0-9_$.])(?:t|tr)\("([^"]*&[a-zA-Z]+;[^"]*)"\)/g)) {
        bad.push(`${file}: ${m[1]}`);
      }
    }
    expect(bad).toEqual([]);
  });
});

describe("translation coverage", () => {
  it("every string passed to t() or tr() exists in a map", () => {
    // Two source languages coexist: the portal is authored in Indonesian and
    // mapped to English, the staff pages the other way. A string lives in one
    // map only, so presence in either is correct — absence from both is the bug.
    const files = trackedFiles();

    const missing: Array<{ text: string; file: string }> = [];
    for (const file of files) {
      const code = readFileSync(file, "utf8");
      for (const m of code.matchAll(/(?:^|[^A-Za-z0-9_$.])(?:t|tr)\("((?:[^"\\]|\\.)*)"\)/g)) {
        const text = m[1];
        if (EN[text] === undefined && ID[text] === undefined) missing.push({ text, file });
      }
    }

    expect(missing).toEqual([]);
  });
});
