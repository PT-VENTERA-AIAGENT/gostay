import { useState } from "react";
import { Plus, Loader2, ConciergeBell } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import PageTransition, { staggerContainer, staggerItem } from "@/components/shared/PageTransition";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import {
  listRequests,
  createRequest,
  updateRequestStatus,
  resolveRoomIdByNumber,
  type GuestRequest,
  type GuestRequestStatus,
  type GuestRequestPriority,
} from "@/services/guestRequestService";

const statusConfig: Record<GuestRequestStatus, { label: string; cls: string }> = {
  open: { label: "Terbuka", cls: "bg-warning/10 text-warning" },
  in_progress: { label: "Diproses", cls: "bg-info/10 text-info" },
  done: { label: "Selesai", cls: "bg-success/10 text-success" },
  cancelled: { label: "Dibatalkan", cls: "bg-secondary text-secondary-foreground" },
};

const priorityConfig: Record<GuestRequestPriority, { label: string; cls: string }> = {
  high: { label: "Tinggi", cls: "bg-destructive/10 text-destructive" },
  normal: { label: "Normal", cls: "bg-secondary text-secondary-foreground" },
  low: { label: "Rendah", cls: "bg-muted text-muted-foreground" },
};

const statusFilters: Array<{ key: "all" | GuestRequestStatus; label: string }> = [
  { key: "all", label: "Semua" },
  { key: "open", label: "Terbuka" },
  { key: "in_progress", label: "Diproses" },
  { key: "done", label: "Selesai" },
];

function formatTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Baru saja";
  if (mins < 60) return `${mins} menit lalu`;
  if (mins < 1440) return `${Math.floor(mins / 60)} jam lalu`;
  if (mins < 43_200) return `${Math.floor(mins / 1440)} hari lalu`;
  return new Date(iso).toLocaleDateString("id-ID");
}

const guestRequestKeys = {
  all: ["guest-requests"] as const,
  list: (status?: string) => ["guest-requests", "list", status ?? "all"] as const,
};

export default function GuestRequests() {
  const [activeStatus, setActiveStatus] = useState<"all" | GuestRequestStatus>("all");
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<GuestRequestPriority>("normal");
  const [roomNumber, setRoomNumber] = useState("");

  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: requests = [], isLoading, error } = useQuery({
    queryKey: guestRequestKeys.list(activeStatus === "all" ? undefined : activeStatus),
    queryFn: () =>
      listRequests(activeStatus === "all" ? {} : { status: activeStatus }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const room_id = roomNumber.trim()
        ? await resolveRoomIdByNumber(roomNumber)
        : null;
      return createRequest({
        title: title.trim(),
        description: description.trim() || null,
        priority,
        room_id,
        created_by: user?.id ?? "",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: guestRequestKeys.all });
      toast({ title: "Permintaan tamu dibuat" });
      setTitle("");
      setDescription("");
      setPriority("normal");
      setRoomNumber("");
      setShowForm(false);
    },
    onError: (e) =>
      toast({
        title: "Gagal membuat permintaan",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: GuestRequestStatus }) =>
      updateRequestStatus(id, status),
    onSuccess: (_data, { status }) => {
      qc.invalidateQueries({ queryKey: guestRequestKeys.all });
      toast({ title: `Status diubah ke ${statusConfig[status].label}` });
    },
    onError: (e) =>
      toast({
        title: "Gagal mengubah status",
        description: (e as Error).message,
        variant: "destructive",
      }),
  });

  function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast({ title: "Judul wajib diisi", variant: "destructive" });
      return;
    }
    createMutation.mutate();
  }

  // Next actions offered inline per status. "done" and "cancelled" are terminal.
  function nextActions(req: GuestRequest): Array<{ label: string; status: GuestRequestStatus }> {
    switch (req.status) {
      case "open":
        return [
          { label: "Proses", status: "in_progress" },
          { label: "Batalkan", status: "cancelled" },
        ];
      case "in_progress":
        return [
          { label: "Selesai", status: "done" },
          { label: "Batalkan", status: "cancelled" },
        ];
      default:
        return [];
    }
  }

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground flex items-center gap-2">
              <ConciergeBell className="w-6 h-6 text-primary" /> Permintaan Tamu
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {isLoading ? "Memuat…" : `${requests.length} permintaan`}
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2 self-start"
          >
            <Plus className="w-4 h-4" /> Permintaan Baru
          </button>
        </div>

        {showForm && (
          <motion.form
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={submitForm}
            className="bg-card rounded-xl border border-border p-4 md:p-5 space-y-4"
          >
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Judul</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Contoh: Minta handuk tambahan"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Deskripsi</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Detail permintaan…"
                className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Prioritas</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as GuestRequestPriority)}
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="low">Rendah</option>
                  <option value="normal">Normal</option>
                  <option value="high">Tinggi</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  No. Kamar <span className="font-normal">(opsional)</span>
                </label>
                <input
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="Contoh: 101"
                  className="w-full bg-muted border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 justify-end">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-sm font-medium px-4 py-2 rounded-lg border border-border text-muted-foreground hover:text-foreground transition-colors"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 flex items-center gap-2"
              >
                {createMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Simpan
              </button>
            </div>
          </motion.form>
        )}

        <div className="flex items-center gap-1 border-b border-border overflow-x-auto">
          {statusFilters.map((f) => (
            <button
              key={f.key}
              onClick={() => setActiveStatus(f.key)}
              className={cn(
                "px-3 md:px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px whitespace-nowrap",
                activeStatus === f.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3">
            <p className="text-xs text-destructive">
              Gagal memuat permintaan: {(error as Error).message}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-sm text-muted-foreground">Belum ada permintaan.</p>
          </div>
        ) : (
          <motion.div
            variants={staggerContainer}
            initial="hidden"
            animate="show"
            className="space-y-3"
          >
            {requests.map((req) => (
              <motion.div
                key={req.id}
                variants={staggerItem}
                className="bg-card rounded-xl border border-border p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-foreground">{req.title}</p>
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          priorityConfig[req.priority].cls
                        )}
                      >
                        {priorityConfig[req.priority].label}
                      </span>
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          statusConfig[req.status].cls
                        )}
                      >
                        {statusConfig[req.status].label}
                      </span>
                    </div>
                    {(req.customers?.full_name || req.rooms?.number) && (
                      <p className="text-xs font-medium text-foreground mt-1">
                        {req.customers?.full_name ?? "Tamu"}
                        {req.rooms?.number ? ` · Kamar ${req.rooms.number}` : ""}
                      </p>
                    )}
                    {req.description && (
                      <p className="text-sm text-muted-foreground mt-1.5">{req.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatTime(req.created_at)}
                    </p>
                  </div>
                </div>
                {nextActions(req).length > 0 && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                    {nextActions(req).map((action) => (
                      <button
                        key={action.status}
                        onClick={() =>
                          statusMutation.mutate({ id: req.id, status: action.status })
                        }
                        disabled={statusMutation.isPending}
                        className={cn(
                          "text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50",
                          action.status === "cancelled"
                            ? "border-border text-muted-foreground hover:text-foreground"
                            : "border-primary/40 text-primary hover:bg-primary/10"
                        )}
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>
    </PageTransition>
  );
}
