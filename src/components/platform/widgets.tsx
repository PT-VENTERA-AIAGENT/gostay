// Building blocks shared across the Ventera platform (super-admin) console.
//
// The console is a separate world from a hotel's own dashboard (see 035 +
// PlatformLayout): cross-hotel, operator-only. These widgets give every console
// page one consistent shape — page header, clickable KPI card, a thin table
// shell, mode/status badges, empty state — instead of each page hand-rolling its
// own markup. They follow GoStay's design tokens (bg-card / border-border /
// text-muted-foreground), not hardcoded colours, so they track the app theme.

import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/** Title + optional description and right-aligned action (search, button). */
export function PageHeader({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border bg-card px-4 py-4 md:px-6 md:py-5">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-lg md:text-xl font-bold tracking-tight text-foreground">
          {icon && <span className="text-primary">{icon}</span>}
          {title}
        </h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** A KPI tile. Becomes a link (with a hover arrow) when `to` is given. */
export function StatCard({
  label,
  value,
  sub,
  to,
  icon,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  to?: string;
  icon?: React.ReactNode;
}) {
  const inner = (
    <div className="flex h-full flex-col gap-1 rounded-xl border border-border bg-card p-4 transition-colors group hover:border-primary/40">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        {to ? (
          <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
        ) : (
          icon && <span className="opacity-70">{icon}</span>
        )}
      </div>
      <span className="text-2xl font-bold tabular-nums text-foreground">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  );
  return to ? <Link to={to} className="block h-full">{inner}</Link> : inner;
}

/** Payment mode of a hotel: Off / Test / Live — the single control's three states. */
export function ModeBadge({ mode, active }: { mode: "live" | "test"; active: boolean }) {
  if (!active) {
    return <Badge variant="outline" className="text-muted-foreground">Off</Badge>;
  }
  return mode === "live" ? (
    <Badge className="bg-success text-success-foreground hover:bg-success/90">Live</Badge>
  ) : (
    <Badge variant="secondary">Test</Badge>
  );
}

// Booking / request / payment statuses → a badge tone. Unknown values fall back
// to a neutral outline rather than throwing.
const STATUS_TONE: Record<string, string> = {
  confirmed: "bg-primary/15 text-primary",
  checked_in: "bg-success/15 text-success",
  paid: "bg-success/15 text-success",
  completed: "bg-success/15 text-success",
  resolved: "bg-success/15 text-success",
  checked_out: "bg-muted text-muted-foreground",
  pending: "bg-warning/15 text-warning",
  partial: "bg-warning/15 text-warning",
  in_progress: "bg-warning/15 text-warning",
  open: "bg-warning/15 text-warning",
  cancelled: "bg-destructive/15 text-destructive",
  no_show: "bg-destructive/15 text-destructive",
  refunded: "bg-destructive/15 text-destructive",
  failed: "bg-destructive/15 text-destructive",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        STATUS_TONE[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {status.replace(/_/g, " ")}
    </span>
  );
}

/** A bordered, horizontally-scrollable table shell. */
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "whitespace-nowrap border-b border-border bg-muted/40 px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return (
    <td className={cn("whitespace-nowrap border-b border-border/60 px-4 py-2.5 text-foreground", className)}>
      {children}
    </td>
  );
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex items-center justify-center rounded-xl border border-dashed border-border bg-card px-6 py-16 text-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

/** A small labelled search input for list-page headers. */
export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 w-full sm:w-64">
      <svg className="w-4 h-4 text-muted-foreground shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
      </svg>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full"
      />
    </div>
  );
}

/** Standard IDR formatting used across the console. */
export function formatIDR(n: number): string {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}
