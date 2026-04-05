import { useState } from "react";
import { Plus, Search, Filter, MoreHorizontal, Mail, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";

const users = [
  { id: "1", name: "Maria Rodriguez", email: "maria@bookme.id", role: "admin", status: "active", lastLogin: "2026-04-05 09:00", avatar: "MR", phone: "+62 812 0001 0001" },
  { id: "2", name: "James Anderson", email: "james@bookme.id", role: "staff", status: "active", lastLogin: "2026-04-05 08:30", avatar: "JA", phone: "+62 812 0002 0002" },
  { id: "3", name: "Sarah Williams", email: "sarah@bookme.id", role: "staff", status: "active", lastLogin: "2026-04-04 22:00", avatar: "SW", phone: "+62 812 0003 0003" },
  { id: "4", name: "Mike Thompson", email: "mike@bookme.id", role: "staff", status: "inactive", lastLogin: "2026-03-15 14:00", avatar: "MT", phone: "+62 812 0004 0004" },
  { id: "5", name: "David Chen", email: "david@example.com", role: "customer", status: "active", lastLogin: "2026-04-05 07:45", avatar: "DC", phone: "+62 812 3456 7890" },
  { id: "6", name: "Emily Davis", email: "emily@example.com", role: "customer", status: "active", lastLogin: "2026-04-03 16:30", avatar: "ED", phone: "+62 878 9012 3456" },
  { id: "7", name: "Robert Wilson", email: "robert@example.com", role: "customer", status: "active", lastLogin: "2026-04-01 10:00", avatar: "RW", phone: "+62 856 1234 5678" },
  { id: "8", name: "Anna Lee", email: "anna@example.com", role: "customer", status: "active", lastLogin: "2026-03-30 12:00", avatar: "AL", phone: "+62 821 5678 9012" },
];

const roleConfig: Record<string, { label: string; cls: string }> = {
  admin: { label: "Admin", cls: "bg-destructive/10 text-destructive" },
  staff: { label: "Staff", cls: "bg-info/10 text-info" },
  customer: { label: "Customer", cls: "bg-secondary text-secondary-foreground" },
};

const tabs = [
  { key: "all", label: "All Users" },
  { key: "admin", label: "Admin" },
  { key: "staff", label: "Staff" },
  { key: "customer", label: "Customers" },
];

export default function UserManagement() {
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = users.filter((u) => {
    if (activeTab !== "all" && u.role !== activeTab) return false;
    if (search) {
      const q = search.toLowerCase();
      return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">User Management</h1>
            <p className="text-sm text-muted-foreground mt-1">{users.length} total users</p>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <button className="hidden sm:flex items-center gap-2 px-4 py-2.5 rounded-lg border border-border bg-card text-sm font-medium text-foreground hover:bg-muted transition-colors">
              <Mail className="w-4 h-4" /> Invite
            </button>
            <button className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
              <UserPlus className="w-4 h-4" /> <span className="hidden sm:inline">Add Staff</span>
            </button>
          </div>
        </div>

        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          {tabs.map((tab) => {
            const count = tab.key === "all" ? users.length : users.filter((u) => u.role === tab.key).length;
            const active = tab.key === "all" ? users.filter((u) => u.status === "active").length : users.filter((u) => u.role === tab.key && u.status === "active").length;
            return (
              <motion.button
                key={tab.key}
                variants={staggerItem}
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveTab(tab.key)}
                className={cn("bg-card rounded-xl border p-3 md:p-4 text-left transition-all hover:shadow-sm", activeTab === tab.key ? "border-primary ring-1 ring-primary/30" : "border-border")}
              >
                <p className="text-xs text-muted-foreground mb-1">{tab.label}</p>
                <p className="text-xl md:text-2xl font-bold text-foreground">{count}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{active} active</p>
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

        {/* Desktop table */}
        <div className="hidden md:block bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border text-xs text-muted-foreground">
                <th className="text-left px-4 py-3 font-medium">User</th>
                <th className="text-left px-4 py-3 font-medium">Role</th>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-left px-4 py-3 font-medium">Last Login</th>
                <th className="text-left px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <motion.tbody variants={staggerContainer} initial="hidden" animate="show">
              {filtered.map((user) => {
                const rc = roleConfig[user.role];
                return (
                  <motion.tr key={user.id} variants={staggerItem} className="border-b border-border last:border-0 hover:bg-muted/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">{user.avatar}</div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{user.name}</p>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3"><span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", rc.cls)}>{rc.label}</span></td>
                    <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{user.phone}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        <span className={cn("w-2 h-2 rounded-full", user.status === "active" ? "bg-success" : "bg-muted-foreground")} />
                        <span className="text-sm text-muted-foreground capitalize">{user.status}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{user.lastLogin}</td>
                    <td className="px-4 py-3"><button className="text-muted-foreground hover:text-foreground transition-colors"><MoreHorizontal className="w-4 h-4" /></button></td>
                  </motion.tr>
                );
              })}
            </motion.tbody>
          </table>
        </div>

        {/* Mobile cards */}
        <motion.div variants={staggerContainer} initial="hidden" animate="show" className="md:hidden space-y-3">
          {filtered.map((user) => {
            const rc = roleConfig[user.role];
            return (
              <motion.div key={user.id} variants={staggerItem} className="bg-card rounded-xl border border-border p-4">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-xs font-semibold text-primary">{user.avatar}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{user.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                  </div>
                  <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full shrink-0", rc.cls)}>{rc.label}</span>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className={cn("w-2 h-2 rounded-full", user.status === "active" ? "bg-success" : "bg-muted-foreground")} />
                    {user.status}
                  </span>
                  <span>{user.lastLogin}</span>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </PageTransition>
  );
}
