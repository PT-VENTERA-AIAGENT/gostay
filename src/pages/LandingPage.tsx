import { useEffect } from "react";
import { motion } from "framer-motion";
import {
  Hotel,
  Calendar,
  BarChart3,
  CheckCircle,
  ArrowRight,
  Star,
  Users,
  Zap,
  MessageSquare,
  Shield,
  X,
  Phone,
  FileSpreadsheet,
  BellOff,
  Clock,
  Bot,
  Smartphone,
  RefreshCw,
  AlertTriangle,
} from "lucide-react";
import { AppLink } from "@/lib/site";
import { useAuth, roleHome } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "GoStay",
  applicationCategory: "BusinessApplication",
  description:
    "Platform manajemen hotel dan reservasi online untuk hotel dan penginapan Indonesia",
  url: "https://gostay.id",
  offers: { "@type": "Offer", price: "0", priceCurrency: "IDR" },
  provider: { "@type": "Organization", name: "GoStay", url: "https://gostay.id" },
};

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show: (delay = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.55, ease: "easeOut", delay },
  }),
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.1 } },
};

const childFade = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

function Section({ className = "", id, children }: { className?: string; id?: string; children: React.ReactNode }) {
  return (
    <motion.section id={id} initial="hidden" whileInView="show" viewport={{ once: true, margin: "-80px" }} className={className}>
      {children}
    </motion.section>
  );
}

// ─── Navbar ──────────────────────────────────────────────────────────────────

function Navbar() {
  const { session, role, signOut } = useAuth();
  const home = roleHome(role);

  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center">
          <img src="/gostay.svg" alt="GoStay" className="h-14 w-auto" />
        </div>
        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#pain" className="hover:text-foreground transition-colors">Masalah</a>
          <a href="#features" className="hover:text-foreground transition-colors">Solusi</a>
          <a href="#wa-bot" className="hover:text-foreground transition-colors">WA Chatbot</a>
          <a href="#testimonials" className="hover:text-foreground transition-colors">Testimoni</a>
          <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          {session ? (
            <>
              <Button variant="ghost" size="sm" asChild>
                <AppLink to={home}>{role === "admin" || role === "staff" ? "Dashboard" : "Portal Saya"}</AppLink>
              </Button>
              <Button variant="outline" size="sm" onClick={signOut}>Keluar</Button>
            </>
          ) : (
            <Button size="sm" asChild><AppLink to="/login">Masuk</AppLink></Button>
          )}
        </div>
      </div>
    </header>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden bg-background py-20 sm:py-32">
      <div aria-hidden className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-20 pointer-events-none"
        style={{ background: "radial-gradient(circle, hsl(72 45% 55%) 0%, transparent 70%)" }} />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
        <motion.div initial="hidden" animate="show" variants={stagger} className="flex flex-col items-center gap-6">
          <motion.div variants={childFade}>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest bg-destructive/10 text-destructive px-3 py-1.5 rounded-full">
              <AlertTriangle className="h-3 w-3" />
              Masih terima booking manual? Ini saatnya berubah.
            </span>
          </motion.div>

          <motion.h1 variants={childFade} className="text-4xl sm:text-6xl font-extrabold leading-tight tracking-tight text-foreground max-w-4xl">
            Hotel Anda Kehilangan Booking{" "}
            <span className="text-primary">Setiap Hari</span>{" "}
            karena Kelola Manual
          </motion.h1>

          <motion.p variants={childFade} className="text-lg sm:text-xl text-muted-foreground max-w-2xl">
            WhatsApp telat dibalas, spreadsheet berantakan, staf kelelahan balas pesan satu-satu —
            sementara calon tamu pergi ke hotel lain yang lebih mudah dipesan.
            <strong className="text-foreground"> GoStay menghentikan kebocoran itu.</strong>
          </motion.p>

          <motion.div variants={childFade} className="flex flex-col sm:flex-row gap-3 mt-2">
            <Button size="lg" className="gap-2" asChild>
              <AppLink to="/register">Coba Gratis 14 Hari <ArrowRight className="h-4 w-4" /></AppLink>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <AppLink to="/login">Lihat Demo Dashboard</AppLink>
            </Button>
          </motion.div>

          <motion.p variants={childFade} className="text-xs text-muted-foreground">
            Gratis 14 hari · Tanpa kartu kredit · Setup dalam 30 menit
          </motion.p>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Dashboard Preview ────────────────────────────────────────────────────────

const recentBookings = [
  { name: "Budi Santoso", room: "Deluxe King", checkIn: "11 Jul", checkOut: "13 Jul", status: "Confirmed", src: "WA Bot" },
  { name: "Dewi Rahayu", room: "Superior Twin", checkIn: "11 Jul", checkOut: "12 Jul", status: "Check-in", src: "Website" },
  { name: "Ahmad Fauzi", room: "Suite Premium", checkIn: "12 Jul", checkOut: "15 Jul", status: "Pending", src: "WA Bot" },
  { name: "Siti Nurhaliza", room: "Deluxe King", checkIn: "13 Jul", checkOut: "14 Jul", status: "Confirmed", src: "OTA" },
];

const statusColor: Record<string, string> = {
  Confirmed: "bg-primary/15 text-primary",
  "Check-in": "bg-emerald-500/15 text-emerald-600",
  Pending: "bg-amber-500/15 text-amber-600",
};

function DashboardPreview() {
  return (
    <section className="bg-muted/30 py-16 overflow-hidden">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
          className="text-center mb-10">
          <p className="text-sm font-semibold text-primary uppercase tracking-widest mb-2">Dashboard GoStay</p>
          <h2 className="text-2xl sm:text-3xl font-bold">Semua yang Anda Butuhkan, dalam Satu Layar</h2>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 48, scale: 0.97 }} whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true }} transition={{ duration: 0.7, ease: "easeOut" }}
          className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden ring-1 ring-border/50">

          {/* Browser chrome */}
          <div className="bg-muted/70 px-4 py-2.5 flex items-center gap-2 border-b border-border">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
            <div className="ml-4 flex-1 max-w-xs bg-background/60 rounded-md px-3 py-1 text-[11px] text-muted-foreground font-mono border border-border/50">
              app.gostay.id/dashboard
            </div>
          </div>

          {/* App shell */}
          <div className="flex h-[420px] text-xs overflow-hidden">
            {/* Sidebar */}
            <div className="hidden sm:flex w-44 flex-col border-r border-border bg-card px-2 py-4 gap-1 shrink-0">
              <div className="flex items-center gap-2 px-2 mb-4">
                <div className="w-6 h-6 rounded-md bg-primary flex items-center justify-center shrink-0">
                  <span className="text-primary-foreground font-bold text-[10px]">G</span>
                </div>
                <span className="font-bold text-sm">GoStay</span>
              </div>
              {[
                { label: "Dashboard", active: true },
                { label: "Reservasi", active: false },
                { label: "Kamar", active: false },
                { label: "Pesan", active: false, badge: "7" },
                { label: "Inventaris", active: false },
                { label: "Laporan", active: false },
              ].map(({ label, active, badge }) => (
                <div key={label} className={`flex items-center justify-between rounded-lg px-3 py-2 font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
                  <span>{label}</span>
                  {badge && <span className="bg-destructive text-destructive-foreground text-[9px] rounded-full w-4 h-4 flex items-center justify-center font-bold">{badge}</span>}
                </div>
              ))}
            </div>

            {/* Main content */}
            <div className="flex-1 overflow-y-auto bg-background p-4 flex flex-col gap-4">
              {/* Top bar */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-bold text-sm text-foreground">Selamat pagi, Pak Budi 👋</p>
                  <p className="text-[11px] text-muted-foreground">Jumat, 11 Juli 2026</p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <div className="w-6 h-6 rounded-full bg-muted border border-border flex items-center justify-center">
                      <MessageSquare className="h-3 w-3 text-muted-foreground" />
                    </div>
                    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-destructive rounded-full" />
                  </div>
                  <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary text-[10px]">B</div>
                </div>
              </div>

              {/* Stat cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Booking Hari Ini", value: "24", sub: "+8 via WA Bot", color: "text-primary" },
                  { label: "Kamar Tersedia", value: "12/30", sub: "Update real-time", color: "text-emerald-600" },
                  { label: "Occupancy Rate", value: "60%", sub: "↑ vs kemarin", color: "text-amber-600" },
                  { label: "Pendapatan Bulan Ini", value: "48 jt", sub: "+23% vs lalu", color: "text-primary" },
                ].map(({ label, value, sub, color }) => (
                  <div key={label} className="bg-card rounded-xl p-3 border border-border flex flex-col gap-1">
                    <p className={`text-lg font-extrabold ${color}`}>{value}</p>
                    <p className="text-[10px] text-muted-foreground leading-tight">{label}</p>
                    <p className={`text-[10px] font-medium ${color}`}>{sub}</p>
                  </div>
                ))}
              </div>

              {/* Recent bookings table */}
              <div className="bg-card rounded-xl border border-border overflow-hidden flex-1">
                <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
                  <span className="font-semibold text-foreground text-[11px]">Reservasi Terbaru</span>
                  <span className="text-primary text-[10px] font-medium cursor-pointer hover:underline">Lihat semua →</span>
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      {["Tamu", "Kamar", "Check-in", "Check-out", "Sumber", "Status"].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-[10px] text-muted-foreground font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recentBookings.map((b, i) => (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                        <td className="px-3 py-2 font-medium text-foreground text-[11px]">{b.name}</td>
                        <td className="px-3 py-2 text-muted-foreground text-[11px]">{b.room}</td>
                        <td className="px-3 py-2 text-muted-foreground text-[11px]">{b.checkIn}</td>
                        <td className="px-3 py-2 text-muted-foreground text-[11px]">{b.checkOut}</td>
                        <td className="px-3 py-2 text-[11px]">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${b.src === "WA Bot" ? "bg-emerald-500/15 text-emerald-600" : "bg-muted text-muted-foreground"}`}>{b.src}</span>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${statusColor[b.status]}`}>{b.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </motion.div>

        <motion.p initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} transition={{ delay: 0.4 }}
          className="text-center text-xs text-muted-foreground mt-4">
          Dashboard nyata GoStay — bukan mockup. <AppLink to="/login" className="text-primary hover:underline font-medium">Coba langsung gratis →</AppLink>
        </motion.p>
      </div>
    </section>
  );
}

// ─── Pain Points ──────────────────────────────────────────────────────────────

const pains = [
  {
    icon: Phone,
    title: "WA telat dibalas, tamu sudah pesan di tempat lain",
    desc: "Calon tamu tanya kamar via WA jam 11 malam — staf tidak ada yang jaga. Pagi-pagi baru dibalas, tamu sudah booking di hotel sebelah.",
  },
  {
    icon: FileSpreadsheet,
    title: "Spreadsheet yang tidak pernah akurat",
    desc: "Dua staf edit file Excel yang sama, hasilnya double booking. Tamu complain, refund, reputasi turun.",
  },
  {
    icon: BellOff,
    title: "Konfirmasi booking dilakukan manual",
    desc: "Staf harus WA satu per satu untuk konfirmasi, reminder, dan follow-up. Makan waktu 2–3 jam per hari hanya untuk ini.",
  },
  {
    icon: Clock,
    title: "Tidak tahu kamar mana yang tersedia",
    desc: "Setiap ada tamu tanya, harus cek fisik atau telepon staf lain dulu. Tidak ada visibility real-time sama sekali.",
  },
];

function PainPoints() {
  return (
    <Section id="pain" className="py-20 bg-destructive/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div variants={fadeUp} custom={0} className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-destructive bg-destructive/10 px-3 py-1.5 rounded-full inline-block mb-4">
            Apakah ini terdengar familiar?
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            Masalah yang Dialami 9 dari 10 Hotel di Indonesia
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Bukan salah Anda — sistem lama memang tidak dirancang untuk era digital.
            Tapi setiap hari yang terlewat, booking terus bocor.
          </p>
        </motion.div>

        <motion.div variants={stagger} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {pains.map(({ icon: Icon, title, desc }) => (
            <motion.div key={title} variants={childFade}>
              <Card className="h-full border-destructive/20 bg-card">
                <CardContent className="pt-6 flex flex-col gap-3">
                  <div className="flex items-start gap-3">
                    <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                      <Icon className="h-5 w-5 text-destructive" />
                    </div>
                    <X className="h-4 w-4 text-destructive shrink-0 mt-3" />
                  </div>
                  <h3 className="font-semibold text-foreground leading-snug">{title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>

        <motion.div variants={fadeUp} custom={0.3} className="mt-10 text-center">
          <p className="text-muted-foreground font-medium">
            Rata-rata hotel yang belum digital{" "}
            <strong className="text-destructive">kehilangan 15–30% potensi booking</strong>{" "}
            per bulan karena masalah di atas.
          </p>
        </motion.div>
      </div>
    </Section>
  );
}

// ─── WA Chatbot Highlight ────────────────────────────────────────────────────

function WAChatbot() {
  return (
    <Section id="wa-bot" className="py-20 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* left: copy */}
          <motion.div variants={stagger} className="flex flex-col gap-6">
            <motion.div variants={childFade}>
              <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1.5 rounded-full inline-block mb-4">
                🤖 WA Chatbot + Booking Otomatis
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
                Tamu WA, Booking Masuk Otomatis —{" "}
                <span className="text-primary">Tanpa Staf Jaga 24 Jam</span>
              </h2>
            </motion.div>

            <motion.p variants={childFade} className="text-muted-foreground text-lg leading-relaxed">
              Chatbot GoStay terhubung langsung ke nomor WhatsApp hotel Anda.
              Ketika tamu bertanya soal kamar, ketersediaan, atau harga —
              bot langsung menjawab real-time dan memandu mereka selesaikan
              booking <strong>tanpa perlu staf sama sekali.</strong>
            </motion.p>

            <motion.div variants={stagger} className="flex flex-col gap-4">
              {[
                { icon: Bot, text: "Bot balas otomatis 24/7 — tamu tanya jam 2 pagi pun langsung dapat jawaban" },
                { icon: RefreshCw, text: "Ketersediaan kamar & harga real-time langsung dari sistem — tidak pernah salah info" },
                { icon: CheckCircle, text: "Booking dikonfirmasi otomatis, data masuk ke dashboard — staf tinggal siapkan kamar" },
                { icon: Smartphone, text: "Tamu tidak perlu install app — cukup WA biasa seperti biasa" },
              ].map(({ icon: Icon, text }) => (
                <motion.div key={text} variants={childFade} className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <p className="text-sm text-foreground leading-relaxed">{text}</p>
                </motion.div>
              ))}
            </motion.div>

            <motion.div variants={childFade}>
              <Button size="lg" className="gap-2" asChild>
                <AppLink to="/register">Aktifkan WA Bot Saya <ArrowRight className="h-4 w-4" /></AppLink>
              </Button>
            </motion.div>
          </motion.div>

          {/* right: mock WA chat */}
          <motion.div variants={fadeUp} custom={0.2} className="relative">
            <div className="rounded-2xl border border-border bg-card shadow-2xl overflow-hidden max-w-sm mx-auto">
              {/* WA header */}
              <div className="bg-[#075E54] px-4 py-3 flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-white/20 flex items-center justify-center">
                  <Hotel className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="text-white font-semibold text-sm">GoStay Hotel Bot</p>
                  <p className="text-white/70 text-xs">● Online</p>
                </div>
              </div>
              {/* chat messages */}
              <div className="bg-[#ECE5DD] p-4 space-y-3 min-h-[320px]">
                {[
                  { from: "guest", text: "Halo, ada kamar kosong untuk tanggal 15-17 Juli?" },
                  { from: "bot", text: "Halo! 😊 Tersedia untuk 15–17 Juli (2 malam):\n\n🛏 Deluxe Room — Rp 1.250.000/malam\n🛏 Suite — Rp 2.500.000/malam\n\nMau booking yang mana?" },
                  { from: "guest", text: "Deluxe aja, untuk 2 orang" },
                  { from: "bot", text: "Oke! Total Rp 2.500.000 untuk 2 malam.\n\nSilakan isi nama & nomor HP untuk konfirmasi ya 👇" },
                ].map((msg, i) => (
                  <div key={i} className={`flex ${msg.from === "guest" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-line shadow-sm ${
                      msg.from === "guest" ? "bg-[#DCF8C6] text-gray-800 rounded-br-none" : "bg-white text-gray-800 rounded-bl-none"
                    }`}>
                      {msg.text}
                      {msg.from === "bot" && (
                        <span className="block text-[10px] text-green-600 font-medium mt-1">🤖 GoStay Bot</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="bg-[#F0F0F0] px-3 py-2 flex items-center gap-2 border-t">
                <div className="flex-1 bg-white rounded-full px-3 py-1.5 text-xs text-gray-400">Ketik pesan...</div>
                <div className="h-8 w-8 rounded-full bg-[#075E54] flex items-center justify-center">
                  <ArrowRight className="h-4 w-4 text-white" />
                </div>
              </div>
            </div>
            {/* floating badge */}
            <div className="absolute -top-4 -right-4 bg-primary text-primary-foreground text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">
              Auto 24/7
            </div>
          </motion.div>
        </div>
      </div>
    </Section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const features = [
  {
    icon: Calendar,
    title: "Booking Online Langsung dari Website",
    desc: "Tamu bisa pesan kamar kapan saja dari halaman hotel Anda sendiri — tanpa perlu OTA, tanpa komisi. Setiap booking langsung masuk ke dashboard dan staf dapat notifikasi real-time.",
    badge: "Zero komisi",
  },
  {
    icon: Hotel,
    title: "Manajemen Kamar Real-Time",
    desc: "Lihat status setiap kamar (tersedia, terisi, check-in, maintenance) dalam satu grid. Update harga, blokir tanggal, atau ubah tipe kamar — perubahan langsung terpublikasi.",
    badge: "Live update",
  },
  {
    icon: BarChart3,
    title: "Laporan & Analitik Bisnis",
    desc: "Occupancy rate, pendapatan harian, performa per kamar, dan tren booking — semua otomatis terhitung. Ekspor ke PDF untuk laporan bulanan atau presentasi investor.",
    badge: "Auto report",
  },
  {
    icon: MessageSquare,
    title: "Inbox Chat Terpusat",
    desc: "Semua pesan tamu dari WA Bot, website, dan portal dikumpulkan dalam satu inbox. Staf tidak perlu pindah-pindah app — balas semua dari satu tempat.",
    badge: "Semua di satu",
  },
  {
    icon: Shield,
    title: "Data Aman, Backup Otomatis",
    desc: "Data hotel dan tamu dienkripsi standar perbankan. Backup otomatis harian, akses per role, audit log — tidak ada data yang hilang atau bocor.",
    badge: "Bank-grade",
  },
  {
    icon: Zap,
    title: "Konfirmasi & Reminder Otomatis",
    desc: "Begitu booking masuk, konfirmasi langsung terkirim ke tamu via WA/email. H-1 check-in, reminder otomatis dikirim. Tidak ada lagi staf yang lupa follow up.",
    badge: "Auto-pilot",
  },
];

function Features() {
  return (
    <Section id="features" className="py-20 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div variants={fadeUp} custom={0} className="text-center mb-12">
          <span className="text-xs font-bold uppercase tracking-widest text-primary bg-primary/10 px-3 py-1.5 rounded-full inline-block mb-4">
            ✅ Solusi GoStay
          </span>
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            Satu Platform, Ganti Semua Tool yang Berantakan
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Tidak perlu lagi WA, spreadsheet, Google Form, dan aplikasi booking terpisah.
            GoStay menyatukan semuanya — dan mengotomasi yang bisa diotomasi.
          </p>
        </motion.div>

        <motion.div variants={stagger} className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, desc, badge }) => (
            <motion.div key={title} variants={childFade}>
              <Card className="h-full hover:shadow-md transition-shadow">
                <CardContent className="pt-6 flex flex-col gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-semibold text-lg leading-snug">{title}</h3>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full shrink-0">
                        {badge}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">{desc}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </Section>
  );
}

// ─── How it works ─────────────────────────────────────────────────────────────

const steps = [
  { number: "01", title: "Daftar Gratis", desc: "Buat akun dalam 60 detik. Tidak perlu kartu kredit, tidak perlu tanda tangan kontrak." },
  { number: "02", title: "Setup Hotel Anda", desc: "Tambah kamar, harga, dan foto dengan wizard langkah demi langkah. Rata-rata selesai dalam 30 menit. Tim kami standby di WA." },
  { number: "03", title: "Aktifkan WA Bot", desc: "Hubungkan nomor WA hotel Anda. Bot langsung aktif menjawab calon tamu dan memproses booking otomatis." },
  { number: "04", title: "Terima Booking 24/7", desc: "Dashboard Anda langsung aktif. Notifikasi real-time setiap ada booking masuk — WA, email, atau push notification." },
];

function HowItWorks() {
  return (
    <Section id="how-it-works" className="py-20 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div variants={fadeUp} custom={0} className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            Dari Daftar ke Booking Pertama dalam Hari Ini
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Tidak perlu IT, tidak perlu training panjang. Jika bisa pakai WA, bisa pakai GoStay.
          </p>
        </motion.div>

        <motion.div variants={stagger} className="grid gap-8 sm:grid-cols-4 relative">
          <div aria-hidden className="hidden sm:block absolute top-8 left-[calc(12.5%+8px)] right-[calc(12.5%+8px)] h-px bg-border" />
          {steps.map(({ number, title, desc }) => (
            <motion.div key={number} variants={childFade} className="flex flex-col items-center text-center gap-3">
              <div className="relative h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-extrabold text-lg shadow-lg">
                {number}
                <CheckCircle className="absolute -bottom-1 -right-1 h-5 w-5 text-success bg-background rounded-full" />
              </div>
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-sm text-muted-foreground max-w-[180px]">{desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </Section>
  );
}

// ─── Testimonials ─────────────────────────────────────────────────────────────

const testimonials = [
  {
    name: "Budi Santoso",
    role: "GM, Grand Wahana Hotel — Yogyakarta",
    text: "Dulu staf kami habiskan 3 jam sehari cuma untuk balas WA dan konfirmasi booking manual. Sekarang WA Bot GoStay yang handle — staf bisa fokus ke pelayanan tamu langsung. Occupancy naik 23% dalam 3 bulan.",
    stars: 5,
  },
  {
    name: "Sari Dewi",
    role: "Owner, Villa Tirta Bali — Ubud",
    text: "Saya pernah kena double booking 3 kali dalam sebulan karena spreadsheet yang tidak sinkron. Sejak pakai GoStay, belum pernah terjadi lagi. Laporan keuangannya juga rapi banget untuk pitching investor.",
    stars: 5,
  },
  {
    name: "Hendra Kusuma",
    role: "Direktur, Archipelago Boutique Hotel — Lombok",
    text: "Yang paling kerasa adalah bot WA-nya. Jam 2 pagi ada tamu tanya kamar, bot langsung balas dan proses booking — saya baru lihat notifikasinya pagi hari. Sudah ada booking masuk tanpa saya angkat HP.",
    stars: 5,
  },
];

function Testimonials() {
  return (
    <Section id="testimonials" className="py-20 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div variants={fadeUp} custom={0} className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            Hotel yang Sudah Berhenti Kelola Manual
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Dari guest house di Jogja hingga villa premium di Bali — mereka sudah membuktikannya.
          </p>
        </motion.div>

        <motion.div variants={stagger} className="grid gap-6 sm:grid-cols-3">
          {testimonials.map(({ name, role, text, stars }) => (
            <motion.div key={name} variants={childFade}>
              <Card className="h-full">
                <CardContent className="pt-6 flex flex-col gap-4">
                  <div className="flex gap-0.5">
                    {Array.from({ length: stars }).map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-primary text-primary" />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">"{text}"</p>
                  <div className="flex items-center gap-3 pt-2 border-t border-border">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
                      <Users className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold">{name}</p>
                      <p className="text-xs text-muted-foreground">{role}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </Section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const faqs = [
  {
    q: "WA Bot-nya pakai nomor WA saya sendiri, atau nomor baru?",
    a: "Bisa pakai nomor WA yang sudah ada (via WhatsApp Business API) atau kami bantu setup nomor baru khusus hotel Anda. Bot akan menjawab atas nama hotel, dengan gaya bahasa yang bisa Anda atur sendiri.",
  },
  {
    q: "Apakah bot WA bisa menjawab pertanyaan di luar booking?",
    a: "Ya. Bot bisa menjawab FAQ hotel (fasilitas, lokasi, kebijakan, harga), cek ketersediaan, proses booking, hingga kirim konfirmasi — semuanya otomatis. Jika ada pertanyaan yang tidak dikenali, percakapan akan diteruskan ke staf Anda.",
  },
  {
    q: "Bagaimana jika tamu mau negosiasi harga atau ada permintaan khusus?",
    a: "Bot akan menangani pertanyaan standar. Untuk negosiasi atau permintaan khusus, percakapan otomatis diarahkan ke staf — lengkap dengan konteks pembicaraan sebelumnya sehingga staf tidak perlu tanya ulang dari awal.",
  },
  {
    q: "Apakah GoStay cocok untuk penginapan kecil seperti guest house 5 kamar?",
    a: "Sangat cocok. GoStay justru dirancang untuk skala kecil-menengah yang tidak punya tim IT. Paket harga kami menyesuaikan jumlah kamar — penginapan 5 kamar tidak perlu bayar seperti hotel 100 kamar.",
  },
  {
    q: "Berapa biaya berlangganan GoStay?",
    a: "Mulai dari Rp 299.000/bulan untuk properti kecil, termasuk WA Bot dan semua fitur inti. Free trial 14 hari tanpa kartu kredit — bayar setelah yakin hasilnya.",
  },
  {
    q: "Apakah ada integrasi dengan OTA seperti Traveloka atau Booking.com?",
    a: "GoStay mendukung sinkronisasi kalender (iCal) dengan berbagai OTA sehingga ketersediaan kamar selalu sinkron dan tidak terjadi double booking. Integrasi channel manager penuh tersedia di paket Premium.",
  },
  {
    q: "Berapa lama proses setup sampai siap terima booking?",
    a: "Rata-rata 30–60 menit: tambah kamar, upload foto, atur harga, aktifkan WA Bot. Tim onboarding kami siap membantu via WhatsApp di setiap langkah — tidak perlu teknisi.",
  },
  {
    q: "Apakah data tamu dan booking aman?",
    a: "Sangat aman. Data dienkripsi standar perbankan (TLS 1.3 + AES-256), backup otomatis harian, dan akses dikontrol per role. Server kami bersertifikat ISO 27001.",
  },
];

function FAQ() {
  return (
    <Section id="faq" className="py-20 bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <motion.div variants={fadeUp} custom={0} className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">Pertanyaan yang Sering Ditanyakan</h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Masih ada yang ingin ditanyakan?{" "}
            <a href="https://wa.me/6281318000263" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">
              Chat langsung via WhatsApp
            </a>
            .
          </p>
        </motion.div>
        <motion.div variants={fadeUp} custom={0.1}>
          <Accordion type="single" collapsible className="w-full space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem key={i} value={`item-${i}`} className="border border-border rounded-xl px-2">
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">{faq.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </Section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────

function CTA() {
  return (
    <Section className="py-20 bg-primary/5 border-t border-primary/10">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <motion.div variants={stagger} className="flex flex-col items-center gap-6">
          <motion.h2 variants={childFade} className="text-3xl sm:text-5xl font-extrabold">
            Berapa Booking yang Sudah Bocor Bulan Ini?
          </motion.h2>
          <motion.p variants={childFade} className="text-muted-foreground text-lg max-w-xl">
            Setiap hari yang dikelola manual adalah hari di mana calon tamu memilih
            hotel lain yang lebih mudah dipesan. Mulai hari ini — gratis 14 hari.
          </motion.p>
          <motion.div variants={childFade} className="flex flex-col sm:flex-row gap-3">
            <Button size="lg" className="gap-2" asChild>
              <AppLink to="/register">Coba Gratis 14 Hari <ArrowRight className="h-4 w-4" /></AppLink>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="https://wa.me/6281318000263?text=Halo%2C%20saya%20mau%20coba%20GoStay%20untuk%20hotel%20saya" target="_blank" rel="noopener noreferrer">
                Tanya via WhatsApp
              </a>
            </Button>
          </motion.div>
          <motion.p variants={childFade} className="text-xs text-muted-foreground">
            Gratis 14 hari · Tidak perlu kartu kredit · Setup 30 menit · Batalkan kapan saja
          </motion.p>
        </motion.div>
      </div>
    </Section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30 py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Hotel className="h-5 w-5 text-primary" />
          <span className="font-bold">GoStay</span>
          <span className="text-muted-foreground text-sm ml-2">© 2026 GoStay. Hak cipta dilindungi.</span>
        </div>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <a href="#pain" className="hover:text-foreground transition-colors">Masalah</a>
          <a href="#features" className="hover:text-foreground transition-colors">Solusi</a>
          <a href="#wa-bot" className="hover:text-foreground transition-colors">WA Bot</a>
          <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          <a href="mailto:info@gostay.id" className="hover:text-foreground transition-colors">Kontak</a>
          <AppLink to="/login" className="hover:text-foreground transition-colors">Masuk</AppLink>
        </nav>
      </div>
    </footer>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(jsonLd);
    script.id = "gostay-jsonld";
    if (!document.getElementById("gostay-jsonld")) document.head.appendChild(script);
    return () => { const el = document.getElementById("gostay-jsonld"); if (el) el.remove(); };
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <DashboardPreview />
        <PainPoints />
        <WAChatbot />
        <Features />
        <HowItWorks />
        <Testimonials />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
