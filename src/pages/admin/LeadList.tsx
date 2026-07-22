import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload, Search, Filter, MapPin, Star, Phone, RefreshCw,
  ChevronRight, TrendingUp, Users, MessageCircle, Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageTransition from "@/components/shared/PageTransition";

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
}

const STATUS_COLORS: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  contacted: "bg-blue-100 text-blue-700",
  replied: "bg-yellow-100 text-yellow-700",
  qualified: "bg-purple-100 text-purple-700",
  demo_booked: "bg-orange-100 text-orange-700",
  trial: "bg-green-100 text-green-700",
  paying: "bg-emerald-100 text-emerald-700",
  not_interested: "bg-red-100 text-red-600",
  unresponsive: "bg-gray-100 text-gray-500",
};

const STATUS_LABELS: Record<string, string> = {
  new: "Baru",
  contacted: "Dihubungi",
  replied: "Membalas",
  qualified: "Qualified",
  demo_booked: "Demo",
  trial: "Trial",
  paying: "Paying",
  not_interested: "Tidak Minat",
  unresponsive: "Tidak Respon",
};

function StatsBar({ leads }: { leads: Lead[] }) {
  const total = leads.length;
  const contacted = leads.filter((l) => l.status !== "new").length;
  const replied = leads.filter((l) =>
    ["replied", "qualified", "demo_booked", "trial", "paying"].includes(l.status)
  ).length;
  const converted = leads.filter((l) => ["trial", "paying"].includes(l.status)).length;

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
      {[
        { icon: Users, label: "Total Leads", value: total, color: "text-blue-600" },
        { icon: MessageCircle, label: "Dihubungi", value: contacted, color: "text-orange-600" },
        { icon: TrendingUp, label: "Membalas", value: replied, color: "text-purple-600" },
        { icon: Target, label: "Trial/Paying", value: converted, color: "text-green-600" },
      ].map(({ icon: Icon, label, value, color }) => (
        <div key={label} className="bg-card rounded-lg border p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`w-4 h-4 ${color}`} />
            <span className="text-xs text-muted-foreground">{label}</span>
          </div>
          <div className="text-2xl font-bold">{value}</div>
        </div>
      ))}
    </div>
  );
}

export default function LeadList() {
  const { session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [csvText, setCsvText] = useState("");
  const [importing, setImporting] = useState(false);

  const { data: leads = [], isLoading } = useQuery<Lead[]>({
    queryKey: ["outbound_leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("outbound_leads")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const filtered = leads.filter((l) => {
    const matchSearch =
      !search ||
      l.business_name.toLowerCase().includes(search.toLowerCase()) ||
      l.city?.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || l.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleImport = useCallback(async () => {
    if (!csvText.trim()) return;
    if (!session?.access_token) return;
    setImporting(true);
    try {
      const res = await fetch("/api/outbound/leads/import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ format: "csv", csv: csvText }),
      });
      const result = await res.json() as { inserted?: number; skipped?: number; errors?: string[] };
      if (res.ok) {
        toast({
          title: "Import berhasil",
          description: `${result.inserted} leads ditambahkan, ${result.skipped ?? 0} duplikat dilewati.`,
        });
        setCsvText("");
        qc.invalidateQueries({ queryKey: ["outbound_leads"] });
      } else {
        toast({ title: "Import gagal", description: JSON.stringify(result), variant: "destructive" });
      }
    } finally {
      setImporting(false);
    }
  }, [csvText, session, toast, qc]);

  return (
    <PageTransition>
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Lead Generation</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Outbound WA sales ke hotel & villa Indonesia
            </p>
          </div>
          <Button onClick={() => navigate("/admin/campaigns")}>
            Campaigns
          </Button>
        </div>

        <StatsBar leads={leads} />

        {/* Import CSV */}
        <div className="bg-card rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Upload className="w-4 h-4" />
            Import Leads via CSV
          </div>
          <p className="text-xs text-muted-foreground">
            Kolom: business_name, phone_wa, city, province, category, rating, review_count, gmaps_url, gmaps_place_id
          </p>
          <textarea
            className="w-full h-24 text-xs font-mono border rounded p-2 resize-none focus:outline-none focus:ring-1"
            placeholder="Paste CSV di sini (dengan header row)..."
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <Button size="sm" onClick={handleImport} disabled={importing || !csvText.trim()}>
            {importing ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
            {importing ? "Importing..." : "Import"}
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Cari nama atau kota..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-40">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Semua Status</SelectItem>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Lead Table */}
        <div className="bg-card rounded-lg border overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground text-sm">Memuat leads...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {leads.length === 0
                ? "Belum ada leads. Import CSV dari Google Maps untuk memulai."
                : "Tidak ada leads yang cocok dengan filter."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left px-4 py-3 font-medium">Properti</th>
                  <th className="text-left px-4 py-3 font-medium">Lokasi</th>
                  <th className="text-left px-4 py-3 font-medium">Rating</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Terakhir Kontak</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-muted/30 cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/leads/${lead.id}`)}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium">{lead.business_name}</div>
                      {lead.category && (
                        <div className="text-xs text-muted-foreground capitalize">{lead.category}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.city && (
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <MapPin className="w-3 h-3" />
                          {lead.city}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {lead.rating != null && (
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-yellow-500" />
                          <span>{lead.rating}</span>
                          {lead.review_count && (
                            <span className="text-xs text-muted-foreground">({lead.review_count})</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[lead.status] ?? "bg-gray-100"}`}>
                        {STATUS_LABELS[lead.status] ?? lead.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {lead.last_contacted_at
                        ? new Date(lead.last_contacted_at).toLocaleDateString("id-ID", {
                            day: "numeric", month: "short",
                          })
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
