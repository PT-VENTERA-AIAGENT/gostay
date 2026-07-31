// Resepsionis AI — pratinjau fase 1 (docs/VOICE-AI.md).
//
// Browser staf bicara LANGSUNG ke OpenAI Realtime lewat WebRTC memakai
// ephemeral key yang dicetak /api/voice/session — kunci OpenAI asli tidak
// pernah menyentuh halaman ini. AI berbicara sebagai resepsionis hotel dengan
// tipe kamar & tarif ASLI, dan boleh memanggil satu tool baca:
// check_availability (RPC available_rooms yang sama dengan form booking).
//
// Selesai bicara, jejaknya disimpan lewat klien supabase di bawah RLS staf —
// baris call_logs (source 'ai', transkrip penuh) plus tamu CRM bila nomor
// penelepon (simulasi) diisi. Telepon sungguhan kelak memakai webhook
// /api/voice/call-ended dengan muara data yang sama.

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Mic, PhoneOff, Bot, User, Loader2, CheckCircle2 } from "lucide-react";
import PageTransition from "@/components/shared/PageTransition";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/sso";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { getRoomTypes, getAvailableRooms } from "@/services/roomService";
import { getOrCreateCustomer } from "@/services/bookingService";
import { createCallLog } from "@/services/callLogService";
import type { CallLogInsert, RoomType } from "@/types/database.types";

type Status = "idle" | "connecting" | "live" | "saving" | "saved" | "save_failed";
interface Line {
  who: "ai" | "guest";
  text: string;
}

function formatIDR(n: number) {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

/** Instruksi resepsionis: data hotel ASLI masuk ke prompt, bukan karangan. */
function receptionistInstructions(hotelName: string, types: RoomType[]): string {
  const menu = types
    .map((t) => `- ${t.name}: ${formatIDR(Number(t.base_rate))}/malam${t.max_occupancy ? `, maks ${t.max_occupancy} tamu` : ""}`)
    .join("\n");
  return (
    `Kamu resepsionis telepon hotel "${hotelName}" di Indonesia. Bicara Bahasa Indonesia yang ramah, ` +
    `singkat, dan jelas — ini telepon, bukan esai. Sapa penelepon lebih dulu dan tanyakan kebutuhannya.\n\n` +
    `Tipe kamar dan tarif per malam (JANGAN mengarang di luar ini):\n${menu}\n\n` +
    `Untuk pertanyaan ketersediaan tanggal tertentu, WAJIB memakai tool check_availability — jangan menebak. ` +
    `Tahun sekarang ${new Date().getFullYear()}. ` +
    `Kamu BELUM bisa membuat reservasi di telepon; bila penelepon ingin memesan, catat niatnya, minta nama, ` +
    `dan katakan staf kami akan menindaklanjuti (atau tawarkan memesan lewat WhatsApp hotel). ` +
    `Di akhir, ringkas apa yang penelepon butuhkan.`
  );
}

export default function VoiceAI() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [callerPhone, setCallerPhone] = useState("");
  const [followUp, setFollowUp] = useState(true);
  const [savedInfo, setSavedInfo] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const micRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startedAtRef = useRef<number>(0);
  const durationRef = useRef<number>(0);
  const roomTypesRef = useRef<RoomType[]>([]);
  const linesRef = useRef<Line[]>([]);
  linesRef.current = lines;

  useEffect(() => () => teardown(), []);

  function teardown() {
    dcRef.current?.close();
    pcRef.current?.close();
    micRef.current?.getTracks().forEach((t) => t.stop());
    dcRef.current = null;
    pcRef.current = null;
    micRef.current = null;
  }

  function pushLine(who: Line["who"], text: string) {
    const trimmed = (text ?? "").trim();
    if (!trimmed) return;
    setLines((prev) => [...prev, { who, text: trimmed }]);
  }

  async function runAvailabilityTool(args: { check_in?: string; check_out?: string; room_type?: string }) {
    try {
      const types = roomTypesRef.current;
      const wanted = (args.room_type ?? "").toLowerCase();
      const matched = wanted
        ? types.find((t) => t.name.toLowerCase().includes(wanted) || wanted.includes(t.name.toLowerCase()))
        : undefined;
      if (!args.check_in || !args.check_out) {
        return { error: "check_in dan check_out (YYYY-MM-DD) wajib diisi" };
      }
      const rooms = await getAvailableRooms(args.check_in, args.check_out, matched?.id);
      return {
        check_in: args.check_in,
        check_out: args.check_out,
        room_type: matched?.name ?? "semua tipe",
        rate_per_night: matched ? Number(matched.base_rate) : undefined,
        available_rooms: rooms.length,
      };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }

  function send(payload: Record<string, unknown>) {
    if (dcRef.current?.readyState === "open") dcRef.current.send(JSON.stringify(payload));
  }

  async function handleServerEvent(raw: string) {
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(raw);
    } catch {
      return;
    }
    const type = String(ev.type ?? "");

    // Transkrip ucapan penelepon (STT sisi OpenAI).
    if (type === "conversation.item.input_audio_transcription.completed") {
      pushLine("guest", String(ev.transcript ?? ""));
      return;
    }
    // Transkrip jawaban AI — nama event GA dan beta didengarkan dua-duanya.
    if (type === "response.output_audio_transcript.done" || type === "response.audio_transcript.done") {
      pushLine("ai", String(ev.transcript ?? ""));
      return;
    }
    // Tool call selesai terkumpul → jalankan lalu kirim hasilnya balik.
    if (type === "response.done") {
      const output = ((ev.response as Record<string, unknown>)?.output ?? []) as Array<Record<string, unknown>>;
      for (const item of output) {
        if (item.type !== "function_call" || item.name !== "check_availability") continue;
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(String(item.arguments ?? "{}"));
        } catch {
          /* biarkan kosong — tool membalas error yang bisa diucapkan AI */
        }
        const result = await runAvailabilityTool(args);
        send({
          type: "conversation.item.create",
          item: {
            type: "function_call_output",
            call_id: item.call_id,
            output: JSON.stringify(result),
          },
        });
        send({ type: "response.create" });
      }
    }
  }

  async function start() {
    setError(null);
    setSavedInfo(null);
    setLines([]);
    setStatus("connecting");
    try {
      const sso = getSession();
      const jwt = sso?.supabase_token;
      if (!jwt) throw new Error("Sesi login tidak ditemukan — muat ulang halaman dan masuk kembali.");

      // 1. Ephemeral key dari server (kunci asli tidak pernah ke browser).
      const sessRes = await fetch("/api/voice/session", {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const sess = (await sessRes.json()) as {
        error?: string;
        model?: string;
        client_secret?: { value?: string };
      };
      if (!sessRes.ok || !sess.client_secret?.value) {
        throw new Error(sess.error ?? "Gagal membuat sesi suara");
      }

      // 2. Data hotel asli untuk instruksi.
      const [types, tenantName] = await Promise.all([
        getRoomTypes(),
        (async () => {
          const tid = sso?.tenant_id;
          if (!tid) return "hotel kami";
          const { data } = await supabase.from("tenants").select("name").eq("id", tid).maybeSingle();
          return (data?.name as string | undefined) ?? "hotel kami";
        })(),
      ]);
      roomTypesRef.current = types;

      // 3. WebRTC ke OpenAI Realtime.
      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micRef.current = mic;
      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.addTrack(mic.getTracks()[0], mic);
      pc.ontrack = (e) => {
        if (audioRef.current) audioRef.current.srcObject = e.streams[0];
      };
      const dc = pc.createDataChannel("oai-events");
      dcRef.current = dc;
      dc.onmessage = (e) => void handleServerEvent(String(e.data));
      dc.onopen = () => {
        send({
          type: "session.update",
          // Bentuk sesi GA: type wajib, transkripsi input di audio.input.
          session: {
            type: "realtime",
            instructions: receptionistInstructions(tenantName, types),
            // language dikunci "id": pada ucapan pendek Whisper suka menebak
            // bahasa lain (transkrip pengguna pertama keluar berbahasa Korea).
            audio: { input: { transcription: { model: "whisper-1", language: "id" } } },
            tools: [
              {
                type: "function",
                name: "check_availability",
                description:
                  "Cek jumlah kamar yang benar-benar tersedia untuk rentang tanggal (dan opsional tipe kamar) dari sistem booking hotel.",
                parameters: {
                  type: "object",
                  properties: {
                    check_in: { type: "string", description: "Tanggal check-in, format YYYY-MM-DD" },
                    check_out: { type: "string", description: "Tanggal check-out, format YYYY-MM-DD" },
                    room_type: { type: "string", description: "Nama tipe kamar, mis. Deluxe. Kosongkan untuk semua tipe." },
                  },
                  required: ["check_in", "check_out"],
                },
              },
            ],
            tool_choice: "auto",
          },
        });
        // AI menyapa lebih dulu — seperti resepsionis mengangkat telepon.
        send({ type: "response.create" });
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const model = sess.model ?? "gpt-realtime";
      // Endpoint SDP GA (/v1/realtime/calls); jalur beta lama sudah 404.
      const sdpRes = await fetch(`https://api.openai.com/v1/realtime/calls?model=${encodeURIComponent(model)}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${sess.client_secret.value}`, "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!sdpRes.ok) throw new Error(`Realtime menolak koneksi (HTTP ${sdpRes.status})`);
      await pc.setRemoteDescription({ type: "answer", sdp: await sdpRes.text() });

      startedAtRef.current = Date.now();
      setStatus("live");
    } catch (e) {
      teardown();
      setStatus("idle");
      setError((e as Error).message);
    }
  }

  async function stopAndSave() {
    durationRef.current = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    teardown();
    await saveLog();
  }

  /**
   * Menyimpan jejak percakapan. SENGAJA dua tahap yang tidak saling menjatuhkan:
   * kegagalan membuat tamu CRM tidak boleh ikut menenggelamkan log panggilan —
   * log adalah jejak utamanya. Dan kalau penyimpanan tetap gagal, transkrip
   * masih di layar dan tombol "Coba simpan lagi" mengulang fungsi ini.
   */
  async function saveLog() {
    setStatus("saving");
    setError(null);
    try {
      const convo = linesRef.current;
      const transcript = convo.map((l) => `${l.who === "ai" ? "AI" : "Tamu"}: ${l.text}`).join("\n");
      const firstAsk = convo.find((l) => l.who === "guest")?.text ?? "";
      const summary =
        `[Resepsionis AI] ${firstAsk ? `Penelepon: ${firstAsk.slice(0, 160)}` : "Percakapan uji tanpa ucapan tamu"}`;

      // Nomor (simulasi) diisi → tamu CRM ikut tercatat, konvensi walk-in/WA.
      // Best-effort: gagal di sini hanya kehilangan tautan tamu, bukan log-nya.
      let customerId: string | null = null;
      if (callerPhone.trim()) {
        try {
          const customer = await getOrCreateCustomer({
            full_name: callerPhone.trim(),
            email: null,
            phone: callerPhone.trim(),
            nationality: null,
            profile_id: null,
          });
          customerId = customer.id;
        } catch (e) {
          console.error("[voice-ai] tamu CRM gagal dibuat:", (e as Error).message);
        }
      }

      const payload = {
        caller_phone: callerPhone.trim() || "simulasi-browser",
        direction: "inbound",
        duration_seconds: durationRef.current,
        summary,
        customer_id: customerId,
        follow_up: followUp,
        follow_up_due: followUp ? new Date(Date.now() + 86_400_000).toISOString().slice(0, 10) : null,
        agent_id: user?.id ?? "",
        // Kolom migration 049 — belum ada di tipe yang digenerate.
        transcript: transcript || null,
        source: "ai",
      } as CallLogInsert & { transcript: string | null; source: string };

      const log = await createCallLog(payload);
      setSavedInfo(log.id);
      setStatus("saved");
      toast({ title: "Tersimpan", description: "Percakapan masuk ke Log Panggilan (sumber: AI)." });
    } catch (e) {
      setStatus("save_failed");
      setError(`Log belum tersimpan: ${(e as Error).message}`);
    }
  }

  const live = status === "live";

  return (
    <PageTransition>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-3xl">
        <div className="flex items-center gap-4">
          <Link to="/calls" className="w-9 h-9 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-foreground">Resepsionis AI — Pratinjau</h1>
            <p className="text-sm text-muted-foreground">
              Bicara lewat mikrofon seolah menelepon hotel. AI menjawab dengan tarif & ketersediaan asli;
              percakapan tersimpan ke Log Panggilan dan nomornya masuk CRM.
            </p>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-4 md:p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-foreground mb-1.5 block">
                Nomor penelepon <span className="text-muted-foreground font-normal">(simulasi — untuk CRM)</span>
              </label>
              <input
                type="tel"
                value={callerPhone}
                onChange={(e) => setCallerPhone(e.target.value)}
                disabled={live}
                placeholder="+62812…"
                className="w-full px-4 py-2.5 rounded-lg border border-input bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-muted/50"
              />
            </div>
            <label className="flex items-end gap-2 pb-2 text-sm text-foreground cursor-pointer select-none">
              <input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} disabled={live} className="accent-primary w-4 h-4" />
              Tandai follow-up untuk staf (jatuh tempo besok)
            </label>
          </div>

          <div className="flex items-center gap-3">
            {status === "idle" || status === "saved" ? (
              <button onClick={start} className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
                <Mic className="w-4 h-4" /> Mulai bicara
              </button>
            ) : status === "connecting" ? (
              <button disabled className="bg-muted text-muted-foreground px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Menyambungkan…
              </button>
            ) : status === "saving" ? (
              <button disabled className="bg-muted text-muted-foreground px-4 py-2.5 rounded-lg text-sm font-semibold flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Menyimpan…
              </button>
            ) : status === "save_failed" ? (
              <button onClick={saveLog} className="bg-primary text-primary-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
                <Loader2 className="w-4 h-4" /> Coba simpan lagi
              </button>
            ) : (
              <button onClick={stopAndSave} className="bg-destructive text-destructive-foreground px-4 py-2.5 rounded-lg text-sm font-semibold hover:opacity-90 transition-opacity flex items-center gap-2">
                <PhoneOff className="w-4 h-4" /> Akhiri & simpan
              </button>
            )}
            {live && (
              <span className="flex items-center gap-2 text-sm text-success">
                <span className="w-2 h-2 rounded-full bg-success animate-pulse" /> Tersambung — silakan bicara
              </span>
            )}
            {status === "saved" && savedInfo && (
              <span className="flex items-center gap-1.5 text-sm text-success">
                <CheckCircle2 className="w-4 h-4" /> Tersimpan —{" "}
                <Link to="/calls" className="underline underline-offset-2">lihat Log Panggilan</Link>
              </span>
            )}
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
          <audio ref={audioRef} autoPlay className="hidden" />
        </div>

        <div className="bg-card rounded-xl border border-border p-4 md:p-5">
          <h2 className="font-semibold text-foreground mb-3">Transkrip</h2>
          {lines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada percakapan. Tekan "Mulai bicara", izinkan mikrofon, lalu bicara seperti tamu yang
              menelepon — mis. "Halo, ada kamar kosong untuk tanggal tiga sampai lima Agustus?"
            </p>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {lines.map((l, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  {l.who === "ai" ? (
                    <Bot className="w-4 h-4 mt-0.5 shrink-0 text-primary" />
                  ) : (
                    <User className="w-4 h-4 mt-0.5 shrink-0 text-muted-foreground" />
                  )}
                  <p className="text-foreground">{l.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PageTransition>
  );
}
