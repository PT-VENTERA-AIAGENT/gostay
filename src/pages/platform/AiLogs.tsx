import { useMemo, useState } from "react";
import { Bot, Loader2 } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { tr } from "@/lib/i18n";
import { usePlatformAiReplies } from "@/hooks/usePlatform";
import { PageHeader, Table, Th, Td, EmptyState, SearchBox } from "@/components/platform/widgets";
import type { AiReplyStatus } from "@/services/platformService";

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("id-ID", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const STATUS_ORDER: AiReplyStatus[] = [
  "sent",
  "blocked_numbers",
  "blocked_pii",
  "ungrounded",
  "failed",
];

const STATUS_LABEL: Record<AiReplyStatus, string> = {
  sent: "Terkirim",
  blocked_numbers: "Angka ditolak",
  blocked_pii: "Data pribadi ditolak",
  ungrounded: "Tanpa data",
  failed: "Model gagal",
};

const STATUS_STYLE: Record<AiReplyStatus, string> = {
  sent: "bg-success/10 text-success",
  blocked_numbers: "bg-destructive/10 text-destructive",
  blocked_pii: "bg-destructive/10 text-destructive",
  ungrounded: "bg-warning/10 text-warning",
  failed: "bg-muted text-muted-foreground",
};

/**
 * Turn a status into something an operator can act on. The distinction that
 * matters is WHOSE problem it is: a blocked figure means the model is
 * misbehaving, `failed` means the vendor is, and they want opposite responses.
 */
function explain(status: AiReplyStatus): string {
  switch (status) {
    case "sent":
      return tr("Dijawab dari data hotel dan dikirim ke tamu.");
    case "blocked_numbers":
      return tr("Jawaban menyebut tarif/jumlah yang tidak ada di data — diganti, tidak dikirim.");
    case "blocked_pii":
      return tr("Jawaban memuat nomor/email/kode booking — diganti, tidak dikirim.");
    case "ungrounded":
      return tr("Model menjawab tanpa membuka data hotel sama sekali — jawaban dibuang.");
    case "failed":
      return tr("Tidak ada penyedia model yang menjawab (kredit habis, gangguan, atau belum diatur).");
  }
}

export default function PlatformAiLogs() {
  const { data: rows = [], isLoading } = usePlatformAiReplies();
  const [q, setQ] = useState("");
  const [hotel, setHotel] = useState("");
  const [status, setStatus] = useState<AiReplyStatus | "">("");

  const hotels = useMemo(() => Array.from(new Set(rows.map((r) => r.hotel))).sort(), [rows]);

  const visible = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows.filter((r) =>
      (!hotel || r.hotel === hotel) &&
      (!status || r.status === status) &&
      (!s || (r.hotel + r.question + (r.reply ?? "") + (r.model ?? "")).toLowerCase().includes(s)));
  }, [rows, q, hotel, status]);

  const countFor = (s: AiReplyStatus) => rows.filter((r) => r.status === s).length;
  const blocked = countFor("blocked_numbers") + countFor("blocked_pii");

  return (
    <PageTransition>
      <PageHeader
        icon={<Bot className="w-5 h-5" />}
        title={tr("Log AI")}
        description={tr("Setiap jawaban concierge di semua hotel — yang terkirim maupun yang ditahan guardrail.")}
        action={<SearchBox value={q} onChange={setQ} placeholder={tr("Cari pertanyaan / hotel / model...")} />}
      />

      <div className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1.5 rounded-lg bg-success/10 text-success font-medium text-sm">
              {countFor("sent")} {tr("terkirim")}
            </span>
            {blocked > 0 && (
              <span className="px-3 py-1.5 rounded-lg bg-destructive/10 text-destructive font-medium text-sm">
                {blocked} {tr("ditahan guardrail")}
              </span>
            )}
            {countFor("failed") > 0 && (
              <span className="px-3 py-1.5 rounded-lg bg-warning/10 text-warning font-medium text-sm">
                {countFor("failed")} {tr("model gagal")}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <select value={status} onChange={(e) => setStatus(e.target.value as AiReplyStatus | "")}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground">
              <option value="">{tr("Semua status")}</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>{tr(STATUS_LABEL[s])} ({countFor(s)})</option>
              ))}
            </select>
            <select value={hotel} onChange={(e) => setHotel(e.target.value)}
              className="px-3 py-2 rounded-lg border border-border bg-background text-sm text-foreground">
              <option value="">{tr("Semua hotel")}</option>
              {hotels.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : visible.length === 0 ? (
          <EmptyState message={tr("Belum ada jawaban AI yang tercatat")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tr("Waktu")}</Th>
                <Th>{tr("Hotel")}</Th>
                <Th>{tr("Status")}</Th>
                <Th>{tr("Model")}</Th>
                <Th>{tr("Pertanyaan tamu")}</Th>
                <Th>{tr("Jawaban")}</Th>
                <Th>{tr("Latensi")}</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id} className="align-top">
                  <Td>{fmtDate(r.created_at)}</Td>
                  <Td>{r.hotel}</Td>
                  <Td>
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[r.status]}`}
                      title={explain(r.status)}
                    >
                      {tr(STATUS_LABEL[r.status])}
                    </span>
                    {r.offenders.length > 0 && (
                      <span className="block mt-1 text-xs text-destructive">
                        {r.offenders.join(", ")}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-foreground">{r.provider ?? "—"}</span>
                    <span className="block text-xs text-muted-foreground">{r.model ?? "—"}</span>
                    {r.tools_used.length > 0 && (
                      <span className="block text-xs text-muted-foreground">
                        {r.tools_used.join(", ")}
                      </span>
                    )}
                  </Td>
                  <Td>
                    <span className="text-muted-foreground line-clamp-3">{r.question}</span>
                  </Td>
                  <Td>
                    {r.error ? (
                      <span className="text-destructive line-clamp-3">{r.error}</span>
                    ) : r.reply ? (
                      <span className="text-muted-foreground line-clamp-3">{r.reply}</span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{tr("tidak dikirim")}</span>
                    )}
                  </Td>
                  <Td className="tabular-nums text-xs text-muted-foreground">{r.latency_ms} ms</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </div>
    </PageTransition>
  );
}
