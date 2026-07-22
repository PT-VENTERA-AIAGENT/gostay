import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, Star, MapPin, Phone, Globe, MessageCircle,
  Loader2, Send, RefreshCw, ExternalLink, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageTransition from "@/components/shared/PageTransition";
import { cn } from "@/lib/utils";

interface Lead {
  id: string;
  business_name: string;
  city?: string;
  province?: string;
  category?: string;
  rating?: number;
  review_count?: number;
  phone_wa?: string;
  status: string;
  last_contacted_at?: string;
  booking_price_min?: number;
  booking_price_max?: number;
  estimated_rooms?: number;
  notes?: string;
  gmaps_url?: string;
}

interface Draft {
  id: string;
  message: string;
  approved: boolean;
  sent: boolean;
  created_at: string;
}

interface Conversation {
  id: string;
  direction: "inbound" | "outbound";
  message: string;
  action_taken?: string;
  sent_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  new: "Baru", contacted: "Dihubungi", replied: "Membalas",
  qualified: "Qualified", demo_booked: "Demo", trial: "Trial",
  paying: "Paying", not_interested: "Tidak Minat", unresponsive: "Tidak Respon",
};

export default function LeadDetail() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [sending, setSending] = useState<string | null>(null);

  const { data: lead, isLoading: leadLoading } = useQuery<Lead>({
    queryKey: ["lead", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outbound_leads")
        .select("*")
        .eq("id", id!)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  const { data: drafts = [] } = useQuery<Draft[]>({
    queryKey: ["lead_drafts", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outbound_message_drafts")
        .select("*")
        .eq("lead_id", id!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
  });

  const { data: conversations = [] } = useQuery<Conversation[]>({
    queryKey: ["lead_conversations", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outbound_wa_conversations")
        .select("*")
        .eq("lead_id", id!)
        .order("sent_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!id,
    refetchInterval: 10_000,
  });

  const authHeader = () => ({ Authorization: `Bearer ${session?.access_token ?? ""}` });

  const handleGenerate = async () => {
    if (!id || !session) return;
    setGenerating(true);
    try {
      const res = await fetch("/api/outbound/wa/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ leadId: id }),
      });
      const result = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (res.ok && result.ok) {
        toast({ title: "Pesan dibuat", description: "Tunggu preview di bawah, lalu approve untuk kirim." });
        qc.invalidateQueries({ queryKey: ["lead_drafts", id] });
      } else {
        toast({ title: "Gagal generate", description: result.error, variant: "destructive" });
      }
    } finally {
      setGenerating(false);
    }
  };

  const handleApprove = async (draftId: string) => {
    await supabase.from("outbound_message_drafts").update({ approved: true }).eq("id", draftId);
    qc.invalidateQueries({ queryKey: ["lead_drafts", id] });
    toast({ title: "Draft disetujui", description: "Klik Kirim untuk mengirim ke WA." });
  };

  const handleSend = async (draftId: string) => {
    if (!session) return;
    setSending(draftId);
    try {
      const res = await fetch("/api/outbound/wa/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ draftId }),
      });
      const result = await res.json() as { ok?: boolean; error?: string };
      if (res.ok && result.ok) {
        toast({ title: "WA terkirim!" });
        qc.invalidateQueries({ queryKey: ["lead_drafts", id] });
        qc.invalidateQueries({ queryKey: ["lead_conversations", id] });
        qc.invalidateQueries({ queryKey: ["lead", id] });
      } else {
        toast({ title: "Gagal kirim", description: result.error, variant: "destructive" });
      }
    } finally {
      setSending(null);
    }
  };

  if (leadLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!lead) return <div className="p-6 text-muted-foreground">Lead tidak ditemukan.</div>;

  const pendingDraft = drafts.find((d) => !d.sent);

  return (
    <PageTransition>
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/leads")}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-bold">{lead.business_name}</h1>
            <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
              {lead.city && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.city}</span>}
              {lead.category && <span className="capitalize">{lead.category}</span>}
            </div>
          </div>
          <Badge variant="outline">{STATUS_LABELS[lead.status] ?? lead.status}</Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-card rounded-lg border p-4 space-y-3 text-sm">
            <div className="font-medium text-muted-foreground uppercase text-xs tracking-wide">Info Properti</div>
            {lead.phone_wa && (
              <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-green-600" />{lead.phone_wa}</div>
            )}
            {lead.rating != null && (
              <div className="flex items-center gap-1"><Star className="w-4 h-4 text-yellow-500" />{lead.rating} ({lead.review_count ?? 0} ulasan)</div>
            )}
            {lead.booking_price_min && (
              <div className="text-muted-foreground">
                Harga kamar: Rp {lead.booking_price_min.toLocaleString("id")}
                {lead.booking_price_max ? ` – ${lead.booking_price_max.toLocaleString("id")}` : ""}
              </div>
            )}
            {lead.estimated_rooms && (
              <div className="text-muted-foreground">{lead.estimated_rooms} kamar</div>
            )}
            {lead.gmaps_url && (
              <a href={lead.gmaps_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-blue-600 hover:underline">
                <Globe className="w-3 h-3" />Google Maps <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="bg-card rounded-lg border p-4 space-y-3">
            <div className="font-medium text-muted-foreground uppercase text-xs tracking-wide">Generate & Kirim WA</div>
            {!pendingDraft ? (
              <Button size="sm" onClick={handleGenerate} disabled={generating}>
                {generating
                  ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  : <Sparkles className="w-4 h-4 mr-2" />}
                {generating ? "Generating..." : "Generate Pesan (Claude)"}
              </Button>
            ) : (
              <div className="space-y-3">
                <div className="bg-muted rounded p-3 text-sm whitespace-pre-wrap">{pendingDraft.message}</div>
                <div className="flex gap-2">
                  {!pendingDraft.approved ? (
                    <Button size="sm" variant="outline" onClick={() => handleApprove(pendingDraft.id)}>
                      Setujui
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => handleSend(pendingDraft.id)} disabled={sending === pendingDraft.id}>
                      {sending === pendingDraft.id
                        ? <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        : <Send className="w-4 h-4 mr-2" />}
                      Kirim via WA
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={handleGenerate} disabled={generating}>
                    <RefreshCw className="w-3 h-3 mr-1" /> Ulang
                  </Button>
                </div>
                {pendingDraft.approved && !pendingDraft.sent && (
                  <p className="text-xs text-muted-foreground">Draft sudah disetujui — klik Kirim untuk dispatch ke WA.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Conversation timeline */}
        <div className="bg-card rounded-lg border p-4 space-y-4">
          <div className="flex items-center gap-2 font-medium text-sm">
            <MessageCircle className="w-4 h-4" />
            Riwayat Percakapan WA
          </div>
          {conversations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Belum ada percakapan.</p>
          ) : (
            <div className="space-y-3">
              {conversations.map((c) => (
                <div
                  key={c.id}
                  className={cn(
                    "flex",
                    c.direction === "outbound" ? "justify-end" : "justify-start",
                  )}
                >
                  <div
                    className={cn(
                      "max-w-sm rounded-lg px-3 py-2 text-sm",
                      c.direction === "outbound"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{c.message}</p>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className={cn(
                        "text-xs",
                        c.direction === "outbound" ? "text-primary-foreground/70" : "text-muted-foreground",
                      )}>
                        {new Date(c.sent_at).toLocaleString("id-ID", {
                          day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                        })}
                      </p>
                      {c.action_taken && c.action_taken !== "initial_contact" && (
                        <span className={cn(
                          "text-xs px-1.5 py-0.5 rounded",
                          c.direction === "outbound" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-background text-muted-foreground",
                        )}>
                          {c.action_taken.replace(/_/g, " ")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
