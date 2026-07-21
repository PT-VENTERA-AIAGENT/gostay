import { useLang, type Lang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const OPTIONS: { value: Lang; label: string }[] = [
  { value: "id", label: "ID" },
  { value: "en", label: "EN" },
];

/** Compact ID/EN switch. Sits next to the theme toggle in both shells. */
export default function LanguageToggle() {
  const { lang, setLang } = useLang();
  return (
    <div className="inline-flex items-center rounded-full border border-border bg-card p-0.5" role="group" aria-label="Bahasa / Language">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          onClick={() => setLang(o.value)}
          aria-pressed={lang === o.value}
          className={cn(
            "px-2.5 py-1 text-xs font-semibold rounded-full transition-colors",
            lang === o.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
