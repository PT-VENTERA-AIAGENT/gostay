import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { EN } from "./translations";

export type Lang = "id" | "en";

interface LangContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate an Indonesian source string; unknown keys fall back to the input. */
  t: (s: string) => string;
}

const LangContext = createContext<LangContextValue | undefined>(undefined);
const STORAGE_KEY = "gostay_lang";

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return saved === "en" ? "en" : "id";
  });

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // ignore storage failures (private mode); the choice just won't persist.
    }
  }, []);

  const t = useCallback((s: string) => (lang === "en" ? EN[s] ?? s : s), [lang]);

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
