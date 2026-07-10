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
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

// ─── Animation helpers ──────────────────────────────────────────────────────

const fadeUp = {
  hidden: { opacity: 0, y: 32 },
  show: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.55, ease: "easeOut", delay },
  }),
};

const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.12 } },
};

const childFade = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

// ─── Section wrapper (viewport trigger) ─────────────────────────────────────

function Section({
  className = "",
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

// ─── Navbar ─────────────────────────────────────────────────────────────────

function Navbar() {
  return (
    <header className="sticky top-0 z-50 bg-background/80 backdrop-blur border-b border-border">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Hotel className="h-6 w-6 text-primary" />
          <span className="font-bold text-lg tracking-tight">GoStay</span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">
            Fitur
          </a>
          <a href="#how-it-works" className="hover:text-foreground transition-colors">
            Cara Kerja
          </a>
          <a href="#testimonials" className="hover:text-foreground transition-colors">
            Testimoni
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Masuk</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/register">Mulai Gratis</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}

// ─── Hero ────────────────────────────────────────────────────────────────────

function Hero() {
  return (
    <section className="relative overflow-hidden bg-background py-20 sm:py-32">
      {/* soft gradient blob */}
      <div
        aria-hidden
        className="absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full opacity-20 pointer-events-none"
        style={{
          background:
            "radial-gradient(circle, hsl(72 45% 55%) 0%, transparent 70%)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 text-center">
        <motion.div
          initial="hidden"
          animate="show"
          variants={stagger}
          className="flex flex-col items-center gap-6"
        >
          <motion.div variants={childFade}>
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest bg-primary/10 text-primary px-3 py-1.5 rounded-full">
              <Zap className="h-3 w-3" />
              Platform Hotel #1 Indonesia
            </span>
          </motion.div>

          <motion.h1
            variants={childFade}
            className="text-4xl sm:text-6xl font-extrabold leading-tight tracking-tight text-foreground max-w-3xl"
          >
            Kelola Hotel Anda dengan{" "}
            <span className="text-primary">GoStay</span>
          </motion.h1>

          <motion.p
            variants={childFade}
            className="text-lg sm:text-xl text-muted-foreground max-w-xl"
          >
            Platform manajemen hotel & reservasi online terlengkap — dari
            booking tamu hingga laporan keuangan, semua dalam satu dashboard.
          </motion.p>

          <motion.div
            variants={childFade}
            className="flex flex-col sm:flex-row gap-3 mt-2"
          >
            <Button size="lg" className="gap-2" asChild>
              <Link to="/register">
                Mulai Gratis
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/login">Lihat Demo</Link>
            </Button>
          </motion.div>

          <motion.p
            variants={childFade}
            className="text-xs text-muted-foreground"
          >
            Gratis 14 hari · Tanpa kartu kredit · Setup dalam 5 menit
          </motion.p>
        </motion.div>

        {/* mock dashboard preview */}
        <motion.div
          initial={{ opacity: 0, y: 48, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
          className="mt-16 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
        >
          <div className="bg-muted/60 px-4 py-3 flex items-center gap-2 border-b border-border">
            <span className="h-3 w-3 rounded-full bg-destructive/60" />
            <span className="h-3 w-3 rounded-full bg-warning/60" />
            <span className="h-3 w-3 rounded-full bg-success/60" />
            <span className="ml-3 text-xs text-muted-foreground font-mono">
              app.gostay.id/dashboard
            </span>
          </div>
          <div className="grid grid-cols-3 gap-4 p-6">
            {[
              { label: "Reservasi Hari Ini", value: "24", icon: Calendar },
              { label: "Kamar Tersedia", value: "12", icon: Hotel },
              { label: "Pendapatan Bulan Ini", value: "Rp 48 jt", icon: BarChart3 },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="bg-background rounded-xl p-4 border border-border flex flex-col gap-1"
              >
                <Icon className="h-5 w-5 text-primary mb-1" />
                <p className="text-2xl font-bold">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

// ─── Features ────────────────────────────────────────────────────────────────

const features = [
  {
    icon: Calendar,
    title: "Reservasi Online",
    desc: "Terima booking 24/7 dari berbagai channel — website, OTA, maupun walk-in — semua tersinkron otomatis.",
    badge: "Real-time sync",
  },
  {
    icon: Hotel,
    title: "Manajemen Kamar",
    desc: "Atur tipe kamar, harga dinamis, dan ketersediaan dengan tampilan grid yang intuitif.",
    badge: "Drag & drop",
  },
  {
    icon: BarChart3,
    title: "Laporan & Analitik",
    desc: "Dashboard keuangan, tingkat hunian, dan performa channel dalam satu layar — ekspor ke PDF/Excel.",
    badge: "Export ready",
  },
];

function Features() {
  return (
    <Section id="features" className="py-20 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div variants={fadeUp} custom={0} className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            Semua yang Anda Butuhkan
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Fitur lengkap untuk hotel butik, resort, hingga jaringan hotel besar.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          className="grid gap-6 sm:grid-cols-3"
        >
          {features.map(({ icon: Icon, title, desc, badge }) => (
            <motion.div key={title} variants={childFade}>
              <Card className="h-full card-hover">
                <CardContent className="pt-6 flex flex-col gap-4">
                  <div className="h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-lg">{title}</h3>
                      <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                        {badge}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {desc}
                    </p>
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

// ─── How it works ────────────────────────────────────────────────────────────

const steps = [
  {
    number: "01",
    title: "Daftar",
    desc: "Buat akun gratis dalam 60 detik. Tidak perlu kartu kredit.",
  },
  {
    number: "02",
    title: "Setup Hotel",
    desc: "Tambahkan properti, tipe kamar, harga, dan foto. Wizard langkah demi langkah.",
  },
  {
    number: "03",
    title: "Terima Booking",
    desc: "Mulai terima reservasi online. Notifikasi real-time ke email & WhatsApp.",
  },
];

function HowItWorks() {
  return (
    <Section id="how-it-works" className="py-20 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div variants={fadeUp} custom={0} className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            Mulai dalam 3 Langkah
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            GoStay dirancang agar Anda bisa langsung produktif tanpa pelatihan panjang.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          className="grid gap-8 sm:grid-cols-3 relative"
        >
          {/* connector line (desktop only) */}
          <div
            aria-hidden
            className="hidden sm:block absolute top-8 left-[calc(33%-16px)] right-[calc(33%-16px)] h-px bg-border"
          />

          {steps.map(({ number, title, desc }) => (
            <motion.div
              key={number}
              variants={childFade}
              className="flex flex-col items-center text-center gap-3"
            >
              <div className="relative h-16 w-16 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-extrabold text-lg shadow-lg">
                {number}
                <CheckCircle className="absolute -bottom-1 -right-1 h-5 w-5 text-success bg-background rounded-full" />
              </div>
              <h3 className="font-semibold text-lg">{title}</h3>
              <p className="text-sm text-muted-foreground max-w-[200px]">{desc}</p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </Section>
  );
}

// ─── Testimonials ────────────────────────────────────────────────────────────

const testimonials = [
  {
    name: "Budi Santoso",
    role: "GM, Grand Wahana Hotel — Yogyakarta",
    text: "Sejak pakai GoStay, occupancy rate kami naik 23%. Manajemen kamar jadi jauh lebih efisien dan staf kami tidak perlu lagi input manual di spreadsheet.",
    stars: 5,
  },
  {
    name: "Sari Dewi",
    role: "Owner, Villa Tirta Bali — Ubud",
    text: "Setup-nya cepat banget, satu hari langsung live. Laporan keuangannya sangat membantu waktu kami pitching ke investor. Highly recommended!",
    stars: 5,
  },
  {
    name: "Hendra Kusuma",
    role: "Direktur, Archipelago Boutique Hotel — Lombok",
    text: "Integrasi channel booking OTA-nya mulus. Tidak ada lagi double booking yang bikin stres. Tim support GoStay juga responsif banget.",
    stars: 5,
  },
];

function Testimonials() {
  return (
    <Section id="testimonials" className="py-20 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div variants={fadeUp} custom={0} className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            Dipercaya Ratusan Hotel
          </h2>
          <p className="text-muted-foreground">
            Dari Sabang sampai Merauke, hotel-hotel terbaik menggunakan GoStay.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          className="grid gap-6 sm:grid-cols-3"
        >
          {testimonials.map(({ name, role, text, stars }) => (
            <motion.div key={name} variants={childFade}>
              <Card className="h-full">
                <CardContent className="pt-6 flex flex-col gap-4">
                  <div className="flex gap-0.5">
                    {Array.from({ length: stars }).map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-primary text-primary"
                      />
                    ))}
                  </div>
                  <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                    "{text}"
                  </p>
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

// ─── CTA ─────────────────────────────────────────────────────────────────────

function CTA() {
  return (
    <Section className="py-20 bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <motion.div variants={stagger} className="flex flex-col items-center gap-6">
          <motion.h2
            variants={childFade}
            className="text-3xl sm:text-5xl font-extrabold"
          >
            Siap mulai perjalanan Anda?
          </motion.h2>
          <motion.p variants={childFade} className="text-muted-foreground text-lg">
            Bergabung dengan 500+ hotel yang sudah mempercayakan bisnis mereka
            ke GoStay.
          </motion.p>
          <motion.div variants={childFade} className="flex flex-col sm:flex-row gap-3">
            <Button size="lg" className="gap-2" asChild>
              <Link to="/register">
                Mulai Gratis Sekarang
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/login">Masuk ke Dashboard</Link>
            </Button>
          </motion.div>
          <motion.p variants={childFade} className="text-xs text-muted-foreground">
            Gratis 14 hari · Tidak perlu kartu kredit · Batalkan kapan saja
          </motion.p>
        </motion.div>
      </div>
    </Section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────

function Footer() {
  return (
    <footer className="border-t border-border bg-muted/30 py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Hotel className="h-5 w-5 text-primary" />
          <span className="font-bold">GoStay</span>
          <span className="text-muted-foreground text-sm ml-2">
            © 2026 GoStay. Hak cipta dilindungi.
          </span>
        </div>

        <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <a href="#features" className="hover:text-foreground transition-colors">
            Fitur
          </a>
          <a href="#how-it-works" className="hover:text-foreground transition-colors">
            Harga
          </a>
          <a
            href="mailto:halo@gostay.id"
            className="hover:text-foreground transition-colors"
          >
            Kontak
          </a>
          <Link to="/login" className="hover:text-foreground transition-colors">
            Masuk
          </Link>
        </nav>
      </div>
    </footer>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
        <Features />
        <HowItWorks />
        <Testimonials />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
