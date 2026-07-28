import { useState } from "react";
import { Search, Info, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT, tr } from "@/lib/i18n";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useProfiles, useUpdateUserRole, useSetUserActive } from "@/hooks/useUsers";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import type { Profile, UserRole } from "@/types/database.types";

const roleConfig: Record<UserRole, { label: string; cls: string }> = {
  admin: { label: "Admin", cls: "bg-destructive/10 text-destructive" },
  staff: { label: "Staff", cls: "bg-info/10 text-info" },
  customer: { label: "Customer", cls: "bg-secondary text-secondary-foreground" },
};

const tabs: Array<{ key: "all" | UserRole; label: string }> = [
  { key: "all", label: "All Team" },
  { key: "admin", label: "Admin" },
  { key: "staff", label: "Staff" },
];

/**
 * This page manages the team (admin & staff) only. Guests (`customer`) live in
 * CRM Tamu, and synthetic WhatsApp bot rows — sso_sub `wa-bot:*` or an
 * `@bot.gostay.local` email — are not real users, so both are hidden here.
 */
function isBotProfile(u: Profile): boolean {
  return (u.sso_sub?.startsWith("wa-bot:") ?? false) || u.email.endsWith("@bot.gostay.local");
}

function isTeamMember(u: Profile): boolean {
  return (u.role === "admin" || u.role === "staff") && !isBotProfile(u);
}

function initialsOf(name: string, email: string): string {
  const source = name.trim() || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function formatLastSeen(iso: string | null): string {
  if (!iso) return "Never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;
  if (mins < 43_200) return `${Math.floor(mins / 1440)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function UserManagement() {
  const t = useT();
  const [activeTab, setActiveTab] = useState<"all" | UserRole>("all");
  const [search, setSearch] = useState("");
  const { data: users, isLoading, error } = useProfiles();
  const updateRole = useUpdateUserRole();
  const setActive = useSetUserActive();
  const { user: me, role: myRole } = useAuth();
  const { toast } = useToast();

  // `admin` is Ventera-only (PRD §2). A hotel's staff run User Management for
  // their own team but may never grant admin, nor touch an existing admin row —
  // the database enforces the same via RLS + the profile column guard (027), so
  // this is UX, not the security boundary.
  const isAdmin = myRole === "admin";
  const assignableRoles: UserRole[] = isAdmin ? ["admin", "staff", "customer"] : ["staff", "customer"];
  const canManage = (u: Profile) => u.id !== me?.id && (isAdmin || u.role !== "admin");

  const all = users ?? [];
  const team = all.filter(isTeamMember);
  const filtered = team.filter((u) => {
    if (activeTab !== "all" && u.role !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.full_name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  function changeRole(u: Profile, role: UserRole) {
    if (role === u.role) return;
    updateRole.mutate(
      { id: u.id, role },
      {
        onSuccess: () => toast({ title: `${u.full_name || u.email} is now ${roleConfig[role].label}` }),
        onError: (e) =>
          toast({ title: tr("Could not change role"), description: (e as Error).message, variant: "destructive" }),
      },
    );
  }

  function toggleActive(u: Profile) {
    const label = u.full_name || u.email;
    setActive.mutate(
      { id: u.id, isActive: !u.is_active },
      {
        onSuccess: () => toast({ title: u.is_active ? `${label} deactivated` : `${label} reactivated` }),
        onError: (e) =>
          toast({ title: tr("Could not change status"), description: (e as Error).message, variant: "destructive" }),
      },
    );
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-foreground">{t("User Management")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Kelola tim (admin & staff)")} · {isLoading ? "Loading…" : `${team.length} {t("anggota")}`}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("Tamu ada di CRM Tamu.")}</p>
        </div>

        {/* There is no "invite" here: identities live in Ventera SSO, and this
            app can neither create nor delete one. Saying so beats a button that
            cannot work. */}
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/40 px-3.5 py-3">
          <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground leading-relaxed">
            Users appear here after their first sign-in with Ventera SSO — accounts cannot be created
            from this page. Everyone starts as <span className="font-medium text-foreground">{t("Customer")}</span>;
            grant staff or admin access below. Deactivating someone revokes their access immediately.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3">
            <p className="text-xs text-destructive">Could not load users: {(error as Error).message}</p>
          </div>
        )}

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-3 gap-3 md:gap-4">
          {tabs.map((tab) => {
            const inTab = tab.key === "all" ? team : team.filter((u) => u.role === tab.key);
            return (
              <motion.button
                key={tab.key}
                variants={staggerItem}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveTab(tab.key)}
                className={cn("bg-card rounded-xl border p-3 md:p-4 text-left transition-all hover:shadow-sm", activeTab === tab.key ? "border-primary ring-1 ring-primary/30" : "border-border")}
              >
                <p className="text-xs text-muted-foreground mb-1">{t(tab.label)}</p>
                <p className="text-xl md:text-2xl font-bold text-foreground">{inTab.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{inTab.filter((u) => u.is_active).length} active</p>
              </motion.button>
            );
          })}
        </motion.div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-card border border-border rounded-lg px-3 md:px-4 py-2 md:py-2.5 flex-1 max-w-sm">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search users..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground">
              {team.length === 0 ? "No team members yet." : "No users match this filter."}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden md:block bg-card rounded-xl border border-border overflow-x-auto">
              <table className="w-full min-w-[820px]">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="text-left px-4 py-3 font-medium">{t("User")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("Role")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("Phone")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("Status")}</th>
                    <th className="text-left px-4 py-3 font-medium">{t("Last Login")}</th>
                    <th className="text-right px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <motion.tbody variants={staggerContainer} initial="hidden" animate="show">
                  {filtered.map((u) => {
                    const isMe = u.id === me?.id;
                    return (
                      <motion.tr key={u.id} variants={staggerItem} className={cn("border-b border-border last:border-0 hover:bg-muted/50 transition-colors", !u.is_active && "opacity-60")}>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                              {initialsOf(u.full_name, u.email)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                {u.full_name || "—"}
                                {isMe && <span className="ml-2 text-xs text-muted-foreground font-normal">(you)</span>}
                              </p>
                              <p className="text-xs text-muted-foreground">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {/* Changing your own role could lock the last admin out
                              of this page, so leave that to someone else. Staff
                              also cannot edit an admin (Ventera) row. */}
                          {canManage(u) ? (
                            <select
                              value={u.role}
                              onChange={(e) => changeRole(u, e.target.value as UserRole)}
                              disabled={updateRole.isPending}
                              aria-label={`Role for ${u.full_name || u.email}`}
                              className={cn(
                                "text-xs font-medium px-2.5 py-1 rounded-full border-0 outline-none cursor-pointer disabled:cursor-wait",
                                roleConfig[u.role].cls,
                              )}
                            >
                              {assignableRoles.map((r) => (
                                <option key={r} value={r}>{t(roleConfig[r].label)}</option>
                              ))}
                            </select>
                          ) : (
                            <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", roleConfig[u.role].cls)}>
                              {roleConfig[u.role].label}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{u.phone ?? "—"}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <span className={cn("w-2 h-2 rounded-full", u.is_active ? "bg-success" : "bg-muted-foreground")} />
                            <span className="text-sm text-muted-foreground">{u.is_active ? t("Active") : t("Inactive")}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">{formatLastSeen(u.last_seen_at)}</td>
                        <td className="px-4 py-3 text-right">
                          {canManage(u) && (
                            <button
                              onClick={() => toggleActive(u)}
                              disabled={setActive.isPending}
                              className="text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                            >
                              {u.is_active ? t("Deactivate") : t("Reactivate")}
                            </button>
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </motion.tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className="md:hidden space-y-3">
              {filtered.map((u) => {
                const isMe = u.id === me?.id;
                return (
                  <motion.div key={u.id} variants={staggerItem} className={cn("bg-card rounded-xl border border-border p-4", !u.is_active && "opacity-60")}>
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">
                        {initialsOf(u.full_name, u.email)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          {u.full_name || "—"}
                          {isMe && <span className="ml-1.5 text-xs text-muted-foreground font-normal">(you)</span>}
                        </p>
                        <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                      </div>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full shrink-0", roleConfig[u.role].cls)}>
                        {roleConfig[u.role].label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-3">
                      <span className="flex items-center gap-1">
                        <span className={cn("w-2 h-2 rounded-full", u.is_active ? "bg-success" : "bg-muted-foreground")} />
                        {u.is_active ? t("Active") : t("Inactive")}
                      </span>
                      <span>{formatLastSeen(u.last_seen_at)}</span>
                    </div>
                    {canManage(u) && (
                      <div className="flex items-center gap-2">
                        <select
                          value={u.role}
                          onChange={(e) => changeRole(u, e.target.value as UserRole)}
                          disabled={updateRole.isPending}
                          aria-label={`Role for ${u.full_name || u.email}`}
                          className="flex-1 text-xs bg-muted border border-border rounded-lg px-2 py-2 text-foreground outline-none"
                        >
                          {assignableRoles.map((r) => (
                            <option key={r} value={r}>{t(roleConfig[r].label)}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => toggleActive(u)}
                          disabled={setActive.isPending}
                          className="text-xs font-medium px-3 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          {u.is_active ? t("Deactivate") : t("Reactivate")}
                        </button>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>
          </>
        )}
      </div>
    </PageTransition>
  );
}
