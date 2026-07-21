import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { EN, ID } from "./translations";

export type Lang = "id" | "en";

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate an Indonesian source string; unknown keys fall back to the input. */
  t: (s: string) => string;
}

const LangContext = createContext<LangContextValue | undefined>(undefined);
const STORAGE_KEY = "gostay_lang";

// Module-level mirror of the active language so non-hook formatters (compact
// currency in charts/stat cards) can read it. Kept in sync by setLang; the
// components that call these already subscribe via useT and re-render on change.
let _lang: Lang =
  typeof localStorage !== "undefined" && localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "id";

/** "Rp 4.6jt" in Indonesian, "Rp 4.6M" in English — abbreviations follow lang. */
export function compactIDR(n: number): string {
  const en = _lang === "en";
  if (n >= 1_000_000_000) return `Rp ${(n / 1_000_000_000).toFixed(1)}${en ? "B" : "M"}`;
  if (n >= 1_000_000) return `Rp ${(n / 1_000_000).toFixed(1)}${en ? "M" : "jt"}`;
  if (n >= 1_000) return `Rp ${(n / 1_000).toFixed(0)}${en ? "K" : "rb"}`;
  return `Rp ${Math.round(n)}`;
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return saved === "en" ? "en" : "id";
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    _lang = l;
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore storage failures (private mode); the choice just won't persist.
    }
  }, []);

  // Two source languages coexist: the portal is written in Indonesian (EN maps
  // it to English), the staff pages in English (ID maps them to Indonesian). A
  // string only lives in one map, so the other direction falls through to the
  // original — correct in both cases.
  const t = useCallback((s: string) => (lang === "en" ? EN[s] ?? s : ID[s] ?? s), [lang]);

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) throw new Error("useLang must be used within LanguageProvider");
  return ctx;
}

/** Convenience: just the translate function. */
export function useT() {
  return useLang().t;
}
