import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Plus, Play, Pause, CheckCircle, Loader2, BarChart2,
  ChevronRight, Users, Send, MessageCircle, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";

interface Campaign {
  id: string;
  name: string;
  status: string;
  filters: Record<string, unknown>;
  daily_limit: number;
  total_leads: number;
  total_generated: number;
  total_sent: number;
  total_replied: number;
  total_converted: number;
  created_at: string;
  started_at?: string;
}

interface Draft {
  id: string;
  lead_id: string;
  message: string;
  approved: boolean;
  sent: boolean;
  outbound_leads?: { business_name: string; city?: string };
}

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  generating: "bg-blue-100 text-blue-700",
  pending_approval: "bg-yellow-100 text-yellow-700",
  sending: "bg-orange-100 text-orange-700",
  paused: "bg-red-100 text-red-600",
  completed: "bg-green-100 text-green-700",
};

function CampaignCard({ campaign, onClick }: { campaign: Campaign; onClick: () => void }) {
  const convRate = campaign.total_sent > 0
    ? Math.round((campaign.total_converted / campaign.total_sent) * 100)
    : 0;

  return (
    <div
      className="bg-card rounded-lg border p-4 cursor-pointer hover:shadow-sm transition-shadow"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold">{campaign.name}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {campaign.started_at
              ? `Dimulai ${new Date(campaign.started_at).toLocaleDateString("id-ID")}`
              : `Dibuat ${new Date(campaign.created_at).toLocaleDateString("id-ID")}`}
          </p>
        </div>
        <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", STATUS_COLORS[campaign.status] ?? "bg-gray-100")}>
          {campaign.status}
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 text-center">
        {[
          { label: "Leads", value: campaign.total_leads, icon: Users },
          { label: "Terkirim", value: campaign.total_sent, icon: Send },
          { label: "Balas", value: campaign.total_replied, icon: MessageCircle },
          { label: "Konversi", value: `${convRate}%`, icon: BarChart2 },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="bg-muted/50 rounded p-2">
            <Icon className="w-3 h-3 mx-auto mb-1 text-muted-foreground" />
            <div className="text-sm font-bold">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div className="flex justify-end mt-3">
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
      </div>
    </div>
  );
}

export default function Campaigns() {
  const { session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterRatingMin, setFilterRatingMin] = useState("4.0");
  const [dailyLimit, setDailyLimit] = useState("100");
  const [creating, setCreating] = useState(false);

  const [activeCampaign, setActiveCampaign] = useState<string | null>(null);
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [sendingBatch, setSendingBatch] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);

  const { data: campaigns = [], isLoading } = useQuery<Campaign[]>({
    queryKey: ["outbound_campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outbound_campaigns")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: drafts = [], refetch: refetchDrafts } = useQuery<Draft[]>({
    queryKey: ["campaign_drafts", activeCampaign],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outbound_message_drafts")
        .select("*, outbound_leads(business_name, city)")
        .eq("campaign_id", activeCampaign!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!activeCampaign,
    staleTime: 5_000,
  });

  const authHeader = () => ({ Authorization: `Bearer ${session?.access_token ?? ""}` });

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const filters: Record<string, unknown> = {};
      if (filterCity) filters.city = filterCity;
      if (filterCategory) filters.category = filterCategory;
      if (filterRatingMin) filters.rating_min = parseFloat(filterRatingMin);

      // Fetch matching leads count
      let query = supabase
        .from("outbound_leads")
        .select("id", { count: "exact" })
        .eq("status", "new");
      if (filters.city) query = query.ilike("city", `%${filters.city}%`);
      if (filters.category) query = query.eq("category", filters.category);
      if (filters.rating_min) query = query.gte("rating", filters.rating_min);

      const { count } = await query;

      const { data, error } = await supabase.from("outbound_campaigns").insert({
        name: newName.trim(),
        filters,
        daily_limit: parseInt(dailyLimit, 10) || 100,
        total_leads: count ?? 0,
        status: "draft",
      }).select().single();

      if (error) throw error;

      toast({ title: "Campaign dibuat", description: `${count ?? 0} leads cocok dengan filter.` });
      setShowCreate(false);
      setNewName(""); setFilterCity(""); setFilterCategory(""); setFilterRatingMin("4.0");
      qc.invalidateQueries({ queryKey: ["outbound_campaigns"] });
      setActiveCampaign(data.id);
    } catch (e) {
      toast({ title: "Gagal", description: (e as Error).message, variant: "destructive" });
    } finally {
      setCreating(false);
    }
  };

  const handleGenerateBatch = async (campaignId: string, filters: Record<string, unknown>) => {
    if (!session) return;
    setGeneratingBatch(true);

    // Fetch matching leads
    let query = supabase.from("outbound_leads").select("id").eq("status", "new");
    if (filters.city) query = query.ilike("city", `%${filters.city}%`);
    if (filters.category) query = query.eq("category", String(filters.category));
    if (filters.rating_min) query = query.gte("rating", Number(filters.rating_min));
    const { data: matchingLeads } = await query.limit(200);

    if (!matchingLeads?.length) {
      toast({ title: "Tidak ada leads baru yang cocok" });
      setGeneratingBatch(false);
      return;
    }

    let generated = 0;
    for (const lead of matchingLeads) {
      const res = await fetch("/api/outbound/wa/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ leadId: lead.id, campaignId }),
      });
      if (res.ok) generated++;
      await new Promise((r) => setTimeout(r, 200)); // brief pause between Claude calls
    }

    await supabase.from("outbound_campaigns").update({
      status: "pending_approval",
      total_generated: generated,
    }).eq("id", campaignId);

    toast({ title: "Generate selesai", description: `${generated} pesan siap di-review.` });
    qc.invalidateQueries({ queryKey: ["outbound_campaigns"] });
    refetchDrafts();
    setGeneratingBatch(false);
  };

  const handleApproveAll = async (campaignId: string) => {
    setApprovingAll(true);
    await supabase.from("outbound_message_drafts")
      .update({ approved: true })
      .eq("campaign_id", campaignId)
      .eq("approved", false);
    await supabase.from("outbound_campaigns").update({ status: "sending" }).eq("id", campaignId);
    toast({ title: "Semua draft disetujui", description: "Klik Kirim Semua untuk dispatch." });
    qc.invalidateQueries({ queryKey: ["outbound_campaigns"] });
    refetchDrafts();
    setApprovingAll(false);
  };

  const handleSendAll = async (campaignId: string) => {
    if (!session) return;
    setSendingBatch(true);
    const pending = drafts.filter((d) => d.approved && !d.sent);
    let sent = 0;
    for (const draft of pending) {
      const res = await fetch("/api/outbound/wa/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ draftId: draft.id }),
      });
      if (res.ok) sent++;
      await new Promise((r) => setTimeout(r, 500)); // 2 sends/sec
    }
    await supabase.from("outbound_campaigns").update({
      status: pending.length === sent ? "completed" : "paused",
      total_sent: sent,
      started_at: new Date().toISOString(),
    }).eq("id", campaignId);
    toast({ title: `${sent} WA terkirim!` });
    qc.invalidateQueries({ queryKey: ["outbound_campaigns"] });
    refetchDrafts();
    setSendingBatch(false);
  };

  const activeCamp = campaigns.find((c) => c.id === activeCampaign);
  const pendingDrafts = drafts.filter((d) => !d.sent);
  const unsent = drafts.filter((d) => !d.sent);
  const approved = unsent.filter((d) => d.approved);
  const needApproval = unsent.filter((d) => !d.approved);

  return (
    <PageTransition>
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Campaign Manager</h1>
            <p className="text-sm text-muted-foreground mt-1">Generate, review, dan kirim WA ke leads secara batch</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => navigate("/admin/leads")}>Leads</Button>
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" /> New Campaign
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Campaign list */}
          <div className="md:col-span-1 space-y-3">
            {isLoading ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin w-5 h-5" /></div>
            ) : campaigns.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Belum ada campaign.</div>
            ) : (
              campaigns.map((c) => (
                <CampaignCard
                  key={c.id}
                  campaign={c}
                  onClick={() => setActiveCampaign(c.id)}
                />
              ))
            )}
          </div>

          {/* Campaign detail */}
          <div className="md:col-span-2">
            {!activeCamp ? (
              <div className="bg-card rounded-lg border p-8 text-center text-muted-foreground text-sm">
                Pilih campaign untuk lihat detail dan preview pesan
              </div>
            ) : (
              <div className="bg-card rounded-lg border p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-lg">{activeCamp.name}</h2>
                  <span className={cn("text-xs px-2 py-0.5 rounded-full", STATUS_COLORS[activeCamp.status] ?? "bg-gray-100")}>
                    {activeCamp.status}
                  </span>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {activeCamp.status === "draft" && (
                    <Button
                      size="sm"
                      onClick={() => handleGenerateBatch(activeCamp.id, activeCamp.filters)}
                      disabled={generatingBatch}
                    >
                      {generatingBatch
                        ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        : <Sparkles className="w-4 h-4 mr-2" />}
                      {generatingBatch ? "Generating..." : `Generate ${activeCamp.total_leads} Pesan`}
                    </Button>
                  )}
                  {needApproval.length > 0 && (
                    <Button size="sm" variant="outline" onClick={() => handleApproveAll(activeCamp.id)} disabled={approvingAll}>
                      {approvingAll ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                      Setujui Semua ({needApproval.length})
                    </Button>
                  )}
                  {approved.length > 0 && (
                    <Button size="sm" onClick={() => handleSendAll(activeCamp.id)} disabled={sendingBatch}>
                      {sendingBatch ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                      {sendingBatch ? "Mengirim..." : `Kirim ${approved.length} WA`}
                    </Button>
                  )}
                </div>

                {/* Draft preview list */}
                {pendingDrafts.length > 0 && (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {pendingDrafts.map((draft) => (
                      <div key={draft.id} className={cn(
                        "rounded-lg border p-3 text-sm space-y-2",
                        draft.approved ? "border-green-200 bg-green-50" : "bg-muted/30",
                      )}>
                        <div className="flex items-center justify-between">
                          <span className="font-medium">
                            {(draft.outbound_leads as { business_name?: string })?.business_name ?? "–"}
                            {(draft.outbound_leads as { city?: string })?.city && (
                              <span className="text-muted-foreground font-normal ml-1 text-xs">
                                — {(draft.outbound_leads as { city?: string }).city}
                              </span>
                            )}
                          </span>
                          {draft.approved
                            ? <span className="text-xs text-green-600 font-medium">Disetujui</span>
                            : <span className="text-xs text-muted-foreground">Menunggu</span>}
                        </div>
                        <p className="text-muted-foreground whitespace-pre-wrap text-xs leading-relaxed">{draft.message}</p>
                      </div>
                    ))}
                  </div>
                )}

                {pendingDrafts.length === 0 && drafts.length > 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">Semua pesan sudah terkirim.</p>
                )}

                {drafts.length === 0 && activeCamp.status === "draft" && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Klik "Generate Pesan" untuk membuat draft WA personal via Claude.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Create Campaign Dialog */}
        <Dialog open={showCreate} onOpenChange={setShowCreate}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Campaign</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Nama Campaign</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="ex: Bali Villa Juli 2026" className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Filter Kota</Label>
                  <Input value={filterCity} onChange={(e) => setFilterCity(e.target.value)} placeholder="Ubud, Bali..." className="mt-1" />
                </div>
                <div>
                  <Label>Kategori</Label>
                  <Input value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} placeholder="villa, hotel..." className="mt-1" />
                </div>
                <div>
                  <Label>Rating Min</Label>
                  <Input value={filterRatingMin} onChange={(e) => setFilterRatingMin(e.target.value)} type="number" step="0.1" min="1" max="5" className="mt-1" />
                </div>
                <div>
                  <Label>Limit Harian</Label>
                  <Input value={dailyLimit} onChange={(e) => setDailyLimit(e.target.value)} type="number" className="mt-1" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreate(false)}>Batal</Button>
              <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
                {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                Buat
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PageTransition>
  );
}
