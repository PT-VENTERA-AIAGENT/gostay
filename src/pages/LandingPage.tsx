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
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

// ─── JSON-LD structured data ─────────────────────────────────────────────────

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "GoStay",
  applicationCategory: "BusinessApplication",
  description:
    "Platform manajemen hotel dan reservasi online untuk hotel dan penginapan Indonesia",
  url: "https://gostay.id",
  offers: { "@type": "Offer", price: "0", priceCurrency: "IDR" },
  provider: {
    "@type": "Organization",
    name: "GoStay",
    url: "https://gostay.id",
  },
};

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
  id,
  children,
}: {
  className?: string;
  id?: string;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      id={id}
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
          <a href="#faq" className="hover:text-foreground transition-colors">
            FAQ
          </a>
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/login">Masuk</Link>
          </Button>
          <Button size="sm" asChild>
            <Link to="/register">Coba Gratis 14 Hari</Link>
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
              Dipercaya 500+ Hotel & Penginapan Indonesia
            </span>
          </motion.div>

          <motion.h1
            variants={childFade}
            className="text-4xl sm:text-6xl font-extrabold leading-tight tracking-tight text-foreground max-w-3xl"
          >
            Booking Online Penuh,{" "}
            <span className="text-primary">Tanpa Ribet</span>
          </motion.h1>

          <motion.p
            variants={childFade}
            className="text-lg sm:text-xl text-muted-foreground max-w-2xl"
          >
            GoStay menggantikan spreadsheet dan telepon satu per satu. Terima
            reservasi online 24/7, kelola kamar real-time, dan kirim konfirmasi
            otomatis ke tamu — dari hotel butik hingga jaringan penginapan.
          </motion.p>

          <motion.div
            variants={childFade}
            className="flex flex-col sm:flex-row gap-3 mt-2"
          >
            <Button size="lg" className="gap-2" asChild>
              <Link to="/register">
                Coba Gratis 14 Hari
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link to="/login">Lihat Demo Dashboard</Link>
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
    title: "Reservasi Online 24/7",
    desc: "Tamu bisa booking langsung dari website Anda kapan saja. Tidak ada lagi telepon terlewat atau pesan WhatsApp yang menumpuk — semua tersinkron otomatis ke dashboard.",
    badge: "Real-time sync",
  },
  {
    icon: Hotel,
    title: "Kelola Kamar dengan Mudah",
    desc: "Atur tipe kamar, harga dinamis per musim, dan ketersediaan harian dengan tampilan grid yang intuitif. Tidak perlu spreadsheet yang bisa error.",
    badge: "Drag & drop",
  },
  {
    icon: BarChart3,
    title: "Laporan Bisnis Real-Time",
    desc: "Pantau occupancy rate, pendapatan harian, dan performa kamar dalam satu layar. Ekspor laporan ke PDF atau Excel untuk kebutuhan akuntansi dan investor.",
    badge: "Export ready",
  },
  {
    icon: MessageSquare,
    title: "Chat Tamu Terintegrasi",
    desc: "Balas pertanyaan calon tamu langsung dari dashboard. Riwayat percakapan tersimpan per booking sehingga staf tidak perlu menebak konteks pembicaraan.",
    badge: "Terpusat",
  },
  {
    icon: Shield,
    title: "Data Aman & Terenkripsi",
    desc: "Data hotel dan tamu disimpan di server terenkripsi dengan backup otomatis harian. Akses role-based sehingga staf hanya bisa melihat data yang relevan.",
    badge: "Bank-grade",
  },
  {
    icon: Zap,
    title: "Notifikasi Otomatis",
    desc: "Konfirmasi booking, reminder check-in, dan ucapan terima kasih dikirim otomatis ke tamu via email. Hemat waktu staf front desk hingga 3 jam per hari.",
    badge: "Auto-pilot",
  },
];

function Features() {
  return (
    <Section id="features" className="py-20 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div variants={fadeUp} custom={0} className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            Satu Platform, Semua yang Anda Butuhkan
          </h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Dari guest house 5 kamar hingga hotel bintang tiga — GoStay
            menggantikan belasan tools terpisah dengan satu sistem terpadu.
          </p>
        </motion.div>

        <motion.div
          variants={stagger}
          className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
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
    title: "Daftar Gratis",
    desc: "Buat akun dalam 60 detik. Tidak perlu kartu kredit, tidak perlu tanda tangan kontrak.",
  },
  {
    number: "02",
    title: "Setup Properti Anda",
    desc: "Tambahkan kamar, harga, dan foto dengan wizard langkah demi langkah. Rata-rata selesai dalam 30 menit.",
  },
  {
    number: "03",
    title: "Langsung Terima Booking",
    desc: "Bagikan link booking ke tamu atau pasang di website Anda. Notifikasi real-time ke email & WhatsApp Anda.",
  },
];

function HowItWorks() {
  return (
    <Section id="how-it-works" className="py-20 bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div variants={fadeUp} custom={0} className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            Dari Daftar ke Booking Pertama dalam 3 Langkah
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            GoStay dirancang agar Anda bisa langsung produktif — tanpa
            pelatihan panjang dan tanpa bantuan teknisi.
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
    text: "Sejak pakai GoStay, occupancy rate kami naik 23% dalam tiga bulan. Staf tidak perlu input manual di spreadsheet lagi — semuanya otomatis dan akurat.",
    stars: 5,
  },
  {
    name: "Sari Dewi",
    role: "Owner, Villa Tirta Bali — Ubud",
    text: "Setup-nya cepat, satu hari sudah live. Laporan keuangannya rapi dan sangat membantu waktu kami pitching ke investor. Sangat worth it.",
    stars: 5,
  },
  {
    name: "Hendra Kusuma",
    role: "Direktur, Archipelago Boutique Hotel — Lombok",
    text: "Tidak ada lagi double booking yang bikin stres. Integrasi OTA-nya mulus dan tim support GoStay sangat responsif — masalah selesai dalam hitungan jam.",
    stars: 5,
  },
];

function Testimonials() {
  return (
    <Section id="testimonials" className="py-20 bg-muted/30">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <motion.div variants={fadeUp} custom={0} className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            Dipercaya 500+ Hotel dari Sabang sampai Merauke
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Dari guest house di Jogja hingga villa premium di Bali — mereka sudah
            membuktikannya.
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

// ─── FAQ ─────────────────────────────────────────────────────────────────────

const faqs = [
  {
    q: "Apakah GoStay cocok untuk penginapan kecil?",
    a: "Ya. GoStay dirancang untuk semua skala — dari guest house 3 kamar hingga hotel bintang tiga dengan 200 kamar. Paket harga kami menyesuaikan jumlah kamar dan fitur yang Anda butuhkan, sehingga Anda tidak membayar lebih dari yang digunakan.",
  },
  {
    q: "Berapa biaya berlangganan GoStay?",
    a: "GoStay menawarkan free trial 14 hari tanpa kartu kredit. Setelah itu, paket mulai dari Rp 299.000/bulan untuk properti kecil. Detail paket lengkap tersedia setelah Anda mendaftar dan berbicara dengan tim kami.",
  },
  {
    q: "Apakah data booking saya aman?",
    a: "Sangat aman. Seluruh data disimpan di server terenkripsi dengan standar bank (TLS 1.3 + AES-256) dan backup otomatis setiap hari. Akses sistem dikontrol per role sehingga staf hanya bisa melihat data yang relevan dengan tugasnya.",
  },
  {
    q: "Bagaimana cara tamu melakukan reservasi online?",
    a: "Setiap hotel mendapatkan halaman booking publik di GoStay (contoh: gostay.id/namahotel). Anda bisa bagikan link ini di Instagram, WhatsApp, atau pasang tombol 'Pesan Sekarang' di website Anda sendiri. Tamu memilih tanggal, tipe kamar, dan konfirmasi dalam kurang dari 2 menit.",
  },
  {
    q: "Apakah ada integrasi dengan OTA seperti Traveloka atau Booking.com?",
    a: "GoStay mendukung sinkronisasi kalender (iCal) dengan berbagai OTA sehingga ketersediaan kamar selalu sinkron dan tidak terjadi double booking. Integrasi channel manager penuh (Traveloka, Booking.com, Agoda) tersedia di paket Premium.",
  },
  {
    q: "Apakah saya perlu install software khusus?",
    a: "Tidak perlu. GoStay berbasis web — cukup buka browser di laptop, tablet, atau smartphone Anda. Tidak ada instalasi, tidak ada update manual. Sistem selalu up-to-date secara otomatis.",
  },
  {
    q: "Berapa lama proses setup?",
    a: "Kebanyakan hotel selesai setup dalam 30–60 menit: tambah kamar, upload foto, atur harga, dan sistem siap menerima booking. Tim onboarding kami siap membantu via WhatsApp jika ada pertanyaan.",
  },
  {
    q: "Apakah ada free trial?",
    a: "Ya. Anda mendapatkan akses penuh ke semua fitur selama 14 hari gratis — tanpa kartu kredit, tanpa komitmen. Jika tidak cocok, tidak ada yang perlu dilakukan; akun otomatis non-aktif setelah masa trial berakhir.",
  },
];

function FAQ() {
  return (
    <Section id="faq" className="py-20 bg-background">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <motion.div variants={fadeUp} custom={0} className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold mb-3">
            Pertanyaan yang Sering Ditanyakan
          </h2>
          <p className="text-muted-foreground max-w-md mx-auto">
            Masih ada yang ingin ditanyakan? Hubungi kami via WhatsApp{" "}
            <a
              href="https://wa.me/6281318000263"
              className="text-primary hover:underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              +62 813 1800 0263
            </a>
            .
          </p>
        </motion.div>

        <motion.div variants={fadeUp} custom={0.1}>
          <Accordion type="single" collapsible className="w-full space-y-2">
            {faqs.map((faq, i) => (
              <AccordionItem
                key={i}
                value={`item-${i}`}
                className="border border-border rounded-xl px-2"
              >
                <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
                  {faq.q}
                </AccordionTrigger>
                <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </motion.div>
      </div>
    </Section>
  );
}

// ─── CTA ─────────────────────────────────────────────────────────────────────

function CTA() {
  return (
    <Section className="py-20 bg-muted/30">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <motion.div variants={stagger} className="flex flex-col items-center gap-6">
          <motion.h2
            variants={childFade}
            className="text-3xl sm:text-5xl font-extrabold"
          >
            Siap Berhenti Kehilangan Booking?
          </motion.h2>
          <motion.p variants={childFade} className="text-muted-foreground text-lg max-w-xl">
            Bergabung dengan 500+ hotel yang sudah menerima reservasi online,
            mengurangi no-show, dan mengelola bisnis lebih efisien bersama GoStay.
          </motion.p>
          <motion.div variants={childFade} className="flex flex-col sm:flex-row gap-3">
            <Button size="lg" className="gap-2" asChild>
              <Link to="/register">
                Coba Gratis 14 Hari
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
          <a href="#faq" className="hover:text-foreground transition-colors">
            FAQ
          </a>
          <a
            href="mailto:info@gostay.id"
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
  useEffect(() => {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(jsonLd);
    script.id = "gostay-jsonld";
    if (!document.getElementById("gostay-jsonld")) {
      document.head.appendChild(script);
    }
    return () => {
      const existing = document.getElementById("gostay-jsonld");
      if (existing) existing.remove();
    };
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1">
        <Hero />
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
