import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { AnimatePresence, MotionConfig, motion, useInView, useScroll, useSpring } from "framer-motion";
import { ArrowRight, CalendarPlus, ChevronLeft, ChevronRight, LogIn, LogOut, Menu, X } from "lucide-react";
import { AppLink } from "@/lib/site";
import { useAuth, roleHome } from "@/contexts/AuthContext";

/* ──────────────────────────────────────────────────────────────────────────
 * GoStay landing page.
 *
 * Copy is transcribed verbatim from the approved "LANDING PAGE GOSTAY.ID"
 * document — section order, headings and body text are not paraphrased.
 *
 * The card language is built around an architectural arch: panels alternate
 * between a tall arched top, an asymmetric leaf, a soft rounded box and a wedge
 * with one squared corner, each led by a short accent rule. Headings use
 * Fraunces, a warm optical serif that reads hospitality rather than SaaS, over
 * Plus Jakarta Sans for body and UI.
 *
 * Palette (kept as literals so the app-wide design tokens stay untouched):
 *   ink #0B0B0B · lime #D7F056 · lime-soft #EEF9CC · sky #DCEEF7
 *   sand #F6E8D8 · cream #FAF7EF / #FFFCF6 · grey #F2F3EE
 * ────────────────────────────────────────────────────────────────────────── */

const WA_NUMBER = "628138053323";

/** Shared easing — a soft decelerate used by every entrance on the page. */
const EASE = [0.22, 1, 0.36, 1] as const;

const jsonLd = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "GoStay",
  applicationCategory: "BusinessApplication",
  description:
    "Aplikasi manajemen booking untuk membantu hotel, villa, dan glamping mengelola reservasi dengan lebih rapi.",
  url: "https://gostay.id",
  offers: { "@type": "Offer", price: "0", priceCurrency: "IDR" },
  provider: { "@type": "Organization", name: "GoStay", url: "https://gostay.id" },
};

/* ─── primitives ─────────────────────────────────────────────────────────── */

/**
 * Word-by-word reveal: each word rides up from behind its own mask.
 * The mask carries extra bottom padding so descenders aren't clipped.
 */
function Words({ text, delay = 0 }: { text: string; delay?: number }) {
  return (
    <>
      {text.split(" ").map((word, i) => (
        <span
          key={`${word}-${i}`}
          className="-mb-[0.16em] mr-[0.24em] inline-block overflow-hidden pb-[0.16em] align-bottom"
        >
          <motion.span
            className="inline-block"
            variants={{
              hidden: { y: "115%" },
              show: { y: 0, transition: { duration: 0.75, ease: EASE, delay: delay + i * 0.035 } },
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </>
  );
}

/** Small uppercase label, introduced by a rule that draws itself in. */
function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`flex items-center text-[0.8125rem] font-bold uppercase leading-none tracking-[0.06em] ${className}`}>
      <motion.span
        initial={{ scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: "-40px" }}
        transition={{ duration: 0.7, ease: EASE }}
        className="mr-3 inline-block h-px w-8 origin-left bg-current opacity-50"
        aria-hidden="true"
      />
      {children}
    </p>
  );
}

/** Oversized section heading. `caps` switches to the uppercase black display cut. */
function Heading({
  children,
  caps = false,
  className = "",
}: {
  children: string;
  caps?: boolean;
  className?: string;
}) {
  return (
    <motion.h2
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      className={
        caps
          ? `font-display text-[1.875rem] font-black uppercase leading-[1.05] tracking-[-0.01em] sm:text-[2.5rem] lg:text-[3rem] ${className}`
          : `font-display text-[1.75rem] font-extrabold leading-[1.15] tracking-[-0.015em] sm:text-[2.25rem] lg:text-[2.875rem] ${className}`
      }
    >
      <Words text={children} />
    </motion.h2>
  );
}

/** Panel/card title — serif, so cards carry the same voice as the headings. */
function CardTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h3 className={`font-display text-[1.1875rem] font-bold leading-snug tracking-[-0.005em] ${className}`}>
      {children}
    </h3>
  );
}

function Container({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-[1278px] px-5 sm:px-8 ${className}`}>{children}</div>;
}

function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.55, ease: EASE, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/** Container that cascades its `<Child>` elements in on scroll. */
function Stagger({
  children,
  gap = 0.08,
  className = "",
}: {
  children: ReactNode;
  gap?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const childVariants = {
  hidden: { opacity: 0, y: 32, scale: 0.96 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 130, damping: 19, mass: 0.7 },
  },
};

function Child({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={childVariants} className={className}>
      {children}
    </motion.div>
  );
}

type BtnProps = {
  children: ReactNode;
  href?: string;
  to?: string;
  variant?: "lime" | "white" | "outline";
  external?: boolean;
  type?: "button" | "submit";
  className?: string;
};

function Btn({ children, href, to, variant = "lime", external, type, className = "" }: BtnProps) {
  const styles: Record<string, string> = {
    lime: "bg-[#D7F056] text-black hover:bg-[#C6E33F]",
    white: "bg-white text-black hover:bg-white/90",
    outline: "border border-current/30 hover:border-current",
  };
  const cls = `group inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-[0.8125rem] font-bold uppercase leading-none tracking-[0.06em] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-12px_rgba(0,0,0,0.5)] active:translate-y-0 ${styles[variant]} ${className}`;
  const inner = (
    <>
      {children}
      <ArrowRight className="h-3.5 w-3.5 shrink-0 -translate-x-1 opacity-0 transition-all duration-300 group-hover:translate-x-0 group-hover:opacity-100" />
    </>
  );

  if (to) {
    return (
      <AppLink to={to} className={cls}>
        {inner}
      </AppLink>
    );
  }
  if (href) {
    return (
      <a href={href} className={cls} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        {inner}
      </a>
    );
  }
  return (
    <button type={type ?? "button"} className={cls}>
      {inner}
    </button>
  );
}

/**
 * Card shapes. The arch is the lead motif — it echoes hotel architecture and
 * keeps the grid from reading as a row of identical boxes.
 */
const SHAPES = {
  arch: "rounded-t-[3.25rem] rounded-b-[1.25rem]",
  soft: "rounded-[1.75rem]",
  leaf: "rounded-[2.25rem_0.5rem_2.25rem_0.5rem]",
  wedge: "rounded-[1.75rem_1.75rem_1.75rem_0.25rem]",
} as const;

type Shape = keyof typeof SHAPES;

function Card({
  children,
  bg,
  shape = "soft",
  accent,
  className = "",
}: {
  children: ReactNode;
  bg: string;
  shape?: Shape;
  accent?: string;
  className?: string;
}) {
  return (
    <div
      className={`relative overflow-hidden transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-1.5 hover:shadow-[0_24px_48px_-26px_rgba(0,0,0,0.45)] ${SHAPES[shape]} ${bg} ${className}`}
    >
      {accent && <span className={`mb-5 block h-1 w-9 rounded-full ${accent}`} aria-hidden="true" />}
      {children}
    </div>
  );
}

/* ─── navbar ─────────────────────────────────────────────────────────────── */

const navLinks = [
  { label: "Fitur", href: "#fitur" },
  { label: "Cara Kerja", href: "#cara-kerja" },
  { label: "Cocok untuk Siapa", href: "#cocok-untuk-siapa" },
  { label: "FAQ", href: "#faq" },
];

function Navbar() {
  const { session, role, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const home = roleHome(role);

  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 140, damping: 30, mass: 0.3 });

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 bg-white transition-shadow duration-300 ${
        scrolled ? "border-b border-transparent shadow-[0_1px_20px_rgba(0,0,0,0.08)]" : "border-b border-black/10"
      }`}
    >
      <Container>
        <div className="flex h-[72px] items-center justify-between gap-6">
          <a href="#top" className="flex shrink-0 items-center" aria-label="GoStay">
            <img src="/gostay.svg" alt="GoStay" className="h-11 w-auto" />
          </a>

          <nav className="hidden items-center gap-8 lg:flex">
            {navLinks.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="group relative text-[0.9375rem] text-black/80 transition-colors hover:text-black"
              >
                {l.label}
                <span className="absolute -bottom-1 left-0 h-px w-full origin-right scale-x-0 bg-black transition-transform duration-300 ease-out group-hover:origin-left group-hover:scale-x-100" />
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {session ? (
              <>
                <AppLink
                  to={home}
                  className="hidden text-[0.8125rem] font-bold uppercase tracking-[0.06em] transition-opacity hover:opacity-60 sm:inline"
                >
                  {role === "admin" || role === "staff" ? "Dashboard" : "Portal Saya"}
                </AppLink>
                <button
                  onClick={signOut}
                  className="hidden text-[0.8125rem] font-bold uppercase tracking-[0.06em] transition-opacity hover:opacity-60 sm:inline"
                >
                  Keluar
                </button>
              </>
            ) : (
              <AppLink
                to="/login"
                className="hidden text-[0.8125rem] font-bold uppercase tracking-[0.06em] transition-opacity hover:opacity-60 sm:inline"
              >
                Masuk
              </AppLink>
            )}
            <Btn href="#demo" className="hidden sm:inline-flex">
              Jadwalkan Demo
            </Btn>
            <button
              className="-mr-2 p-2 lg:hidden"
              onClick={() => setOpen((v) => !v)}
              aria-label={open ? "Tutup menu" : "Buka menu"}
              aria-expanded={open}
            >
              {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </Container>

      {/* reading progress */}
      <motion.div
        style={{ scaleX: progress }}
        className="absolute inset-x-0 bottom-0 h-[2px] origin-left bg-[#D7F056]"
        aria-hidden="true"
      />

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: EASE }}
            className="overflow-hidden border-t border-black/10 bg-white lg:hidden"
          >
            <Container className="flex flex-col gap-1 py-4">
              {navLinks.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-2 py-3 text-[0.9375rem] font-medium hover:bg-[#F2F3EE]"
                >
                  {l.label}
                </a>
              ))}
              {!session && (
                <AppLink to="/login" className="rounded-lg px-2 py-3 text-[0.9375rem] font-medium hover:bg-[#F2F3EE]">
                  Masuk
                </AppLink>
              )}
              <a
                href="#demo"
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex h-11 items-center justify-center rounded-full bg-[#D7F056] px-5 text-[0.8125rem] font-bold uppercase tracking-[0.06em] sm:hidden"
              >
                Jadwalkan Demo
              </a>
            </Container>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}

/* ─── hero ───────────────────────────────────────────────────────────────── */

/** Eased count-up, started the first time the caller scrolls into view. */
function useCountUp(target: number, active: boolean, duration = 1300) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, active, duration]);

  return value;
}

/*
 * The dashboard mock mirrors the real product surfaces so the hero shows what
 * users actually get, not an invented UI:
 *   - StatCards.tsx  → New Bookings / Check-In / Check-Out tiles
 *   - BookingCalendar.tsx → week grid, status legend, status-coloured bars
 * Status colours track the app's semantic tokens (warning / info / primary /
 * muted), rendered here as literals so the app-wide tokens stay untouched.
 */
const heroDays = [
  { wd: "Rab", n: 3 },
  { wd: "Kam", n: 4, today: true },
  { wd: "Jum", n: 5 },
  { wd: "Sab", n: 6, weekend: true },
];

type Status = "pending" | "confirmed" | "checked_in" | "checked_out" | "block";

const STATUS: Record<Status, { bar: string; text: string; label: string }> = {
  pending: { bar: "bg-[#FADFA0] border-[#EAC873]", text: "text-black/70", label: "Menunggu" },
  confirmed: { bar: "bg-[#C4DBEA] border-[#9BBED4]", text: "text-black/70", label: "Terkonfirmasi" },
  checked_in: { bar: "bg-[#D6E491] border-[#BCD061]", text: "text-black/70", label: "Check-In" },
  checked_out: { bar: "bg-[#EAEBE6] border-black/[0.12]", text: "text-black/50", label: "Check-Out" },
  block: {
    bar: "bg-[repeating-linear-gradient(135deg,rgba(0,0,0,0.05)_0,rgba(0,0,0,0.05)_5px,transparent_5px,transparent_10px)] border-black/10",
    text: "text-black/40",
    label: "",
  },
};

type Bar = { start: number; span: number; name: string; status: Status };

const heroRows: { num: string; type: string; bars: Bar[] }[] = [
  { num: "101", type: "Deluxe", bars: [{ start: 1, span: 2, name: "Reza Mahendra", status: "confirmed" }] },
  { num: "102", type: "Deluxe", bars: [{ start: 0, span: 2, name: "Nadia Prawira", status: "checked_in" }] },
  { num: "103", type: "Superior", bars: [{ start: 2, span: 2, name: "Farhan Wijaya", status: "pending" }] },
  { num: "Villa A", type: "Private", bars: [] },
  { num: "Dome 1", type: "Glamping", bars: [{ start: 0, span: 4, name: "Perawatan unit", status: "block" }] },
  { num: "Dome 2", type: "Glamping", bars: [{ start: 1, span: 3, name: "Tania Kusuma", status: "confirmed" }] },
  { num: "Kabin 1", type: "Cabin", bars: [{ start: 0, span: 1, name: "Gilang Ramadhan", status: "checked_out" }] },
  { num: "Kabin 2", type: "Cabin", bars: [] },
  { num: "Villa B", type: "Private", bars: [{ start: 2, span: 2, name: "Bagas Hartono", status: "pending" }] },
  { num: "Kabin 3", type: "Cabin", bars: [{ start: 1, span: 2, name: "Salsa Ardelia", status: "confirmed" }] },
  { num: "Villa C", type: "Private", bars: [] },
];

const heroStats = [
  { label: "Booking Baru", value: 8, icon: CalendarPlus },
  { label: "Check-In", value: 6, icon: LogIn },
  { label: "Check-Out", value: 4, icon: LogOut },
];

function HeroStat({ label, value, icon: Icon, active }: (typeof heroStats)[number] & { active: boolean }) {
  const n = useCountUp(value, active, 900);
  return (
    <div className="bg-white px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-medium leading-snug text-black/55">{label}</p>
        <Icon className="h-3.5 w-3.5 shrink-0 text-black/30" />
      </div>
      <p className="mt-1 font-display text-xl font-bold leading-none tabular-nums">{n}</p>
    </div>
  );
}

/** Dashboard mock modelled on the real Overview + Booking Calendar screens. */
function HeroVisual() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <div
      ref={ref}
      className="relative flex items-center overflow-hidden rounded-t-[4rem] rounded-b-[2.25rem] bg-[#DCEEF7] p-4 sm:p-6"
    >
      <motion.div
        initial={{ opacity: 0, y: 36 }}
        animate={inView ? { opacity: 1, y: 0 } : undefined}
        transition={{ duration: 0.75, ease: EASE, delay: 0.15 }}
        className="w-full"
      >
        <motion.div
          animate={{ y: [0, -7, 0] }}
          transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
          className="relative flex w-full flex-col overflow-hidden rounded-[1.5rem] border border-black/10 bg-white shadow-[0_28px_64px_-28px_rgba(0,0,0,0.4)]"
        >
          {/* light sweeping across the glass */}
          <motion.span
            aria-hidden="true"
            initial={{ x: "-120%" }}
            animate={inView ? { x: "320%" } : undefined}
            transition={{ duration: 2.4, ease: "easeInOut", delay: 1, repeat: Infinity, repeatDelay: 6 }}
            className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/55 to-transparent"
          />

          {/* app bar */}
          <div className="flex items-center gap-2 border-b border-black/10 px-4 py-3">
            <span className="font-display text-[0.9375rem] font-extrabold tracking-[-0.01em]">GoStay</span>
            <span className="rounded-md bg-[#EEF9CC] px-2 py-0.5 text-[10px] font-semibold text-black/70">
              Reservasi
            </span>
          </div>

          {/* today summary — mirrors StatCards */}
          <div className="grid grid-cols-3 gap-px border-b border-black/10 bg-black/10">
            {heroStats.map((s) => (
              <HeroStat key={s.label} {...s} active={inView} />
            ))}
          </div>

          {/* calendar toolbar — week nav + status legend */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-black/10 px-4 py-2.5">
            <div className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-md border border-black/15 text-black/50">
                <ChevronLeft className="h-3 w-3" />
              </span>
              <span className="text-[11px] font-semibold">Oktober 2026</span>
              <span className="flex h-5 w-5 items-center justify-center rounded-md border border-black/15 text-black/50">
                <ChevronRight className="h-3 w-3" />
              </span>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {(["pending", "confirmed", "checked_in", "checked_out"] as Status[]).map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-sm border ${STATUS[s].bar}`} />
                  <span className="text-[9px] text-black/50">{STATUS[s].label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* reservation calendar */}
          <div>
            <div className="grid grid-cols-[92px_repeat(4,1fr)] border-b border-black/10 bg-[#FAFAF8]">
              <div className="px-3 py-2 text-[10px] font-medium text-black/40">Kamar</div>
              {heroDays.map((d) => (
                <div
                  key={d.n}
                  className={`px-2 py-1.5 text-center ${d.today ? "bg-[#EAF2C9]" : d.weekend ? "bg-black/[0.02]" : ""}`}
                >
                  <p className={`text-[10px] ${d.today ? "text-[#6E8329]" : "text-black/45"}`}>{d.wd}</p>
                  <p className={`text-[11px] font-semibold ${d.today ? "text-[#6E8329]" : "text-black/70"}`}>{d.n}</p>
                </div>
              ))}
            </div>

            {heroRows.map((r, ri) => (
              <div key={r.num} className="grid h-11 grid-cols-[92px_1fr] items-center border-b border-black/[0.06]">
                <div className="flex items-baseline gap-1 px-3">
                  <span className="text-[11px] font-semibold">{r.num}</span>
                  <span className="truncate text-[9px] text-black/40">{r.type}</span>
                </div>
                <div className="relative h-full overflow-hidden">
                  <div className="absolute inset-0 grid grid-cols-4">
                    {heroDays.map((d) => (
                      <div key={d.n} className={`border-l border-black/[0.06] ${d.today ? "bg-[#F4F8E4]" : ""}`} />
                    ))}
                  </div>
                  {r.bars.map((b) => {
                    const st = STATUS[b.status];
                    return (
                      <motion.div
                        key={b.name}
                        initial={{ scaleX: 0, opacity: 0 }}
                        animate={inView ? { scaleX: 1, opacity: 1 } : undefined}
                        transition={{ duration: 0.5, ease: EASE, delay: 0.4 + ri * 0.06 }}
                        className={`absolute inset-y-[6px] z-[1] flex origin-left items-center rounded-md border px-2 text-[10px] font-medium ${st.bar} ${st.text}`}
                        style={{
                          left: `calc(${(b.start / 4) * 100}% + 3px)`,
                          width: `calc(${(b.span / 4) * 100}% - 6px)`,
                        }}
                      >
                        <span className="truncate">{b.name}</span>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* guest detail preview */}
          <div className="flex items-center gap-3 border-t border-black/10 px-4 py-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#D7F056] text-[11px] font-bold">
              R
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] font-semibold">Reza Mahendra · 2 tamu</p>
              <p className="truncate text-[10px] text-black/50">Lunas · WhatsApp · 3–5 Okt</p>
            </div>
            <span className="ml-auto shrink-0 rounded-full border border-[#9BBED4] bg-[#C4DBEA] px-2 py-1 text-[10px] font-semibold text-black/70">
              Terkonfirmasi
            </span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

function Hero() {
  return (
    <section id="top" className="bg-white pt-4 sm:pt-6">
      <Container>
        <div className="grid gap-4 lg:grid-cols-2">
          <motion.div
            initial="hidden"
            animate="show"
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1, delayChildren: 0.05 } } }}
            className="relative flex items-center rounded-[2.25rem] bg-black p-8 text-white sm:p-12 xl:p-16"
          >
            <div className="flex flex-col gap-7">
              <Child>
                <p className="flex items-center text-[0.8125rem] font-bold uppercase leading-none tracking-[0.06em] text-white/60">
                  <motion.span
                    variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { duration: 0.7, ease: EASE } } }}
                    className="mr-3 inline-block h-px w-8 origin-left bg-current opacity-60"
                    aria-hidden="true"
                  />
                  Sistem Manajemen Booking Properti
                </p>
              </Child>

              <motion.h1
                variants={{ hidden: {}, show: { transition: { staggerChildren: 0.01 } } }}
                className="font-display text-[2.125rem] font-black uppercase leading-[1.05] tracking-[-0.01em] sm:text-[2.875rem] xl:text-[3.375rem]"
              >
                <Words text="Kelola Booking Hotel, Villa, dan Glamping dalam Satu Sistem" delay={0.1} />
              </motion.h1>

              <Child>
                <p className="max-w-xl text-[1.0625rem] leading-relaxed text-white/75 sm:text-lg">
                  GoStay membantu Anda mencatat reservasi, memantau ketersediaan unit, mengelola data tamu, dan melihat
                  tingkat hunian dengan lebih rapi—tanpa bergantung pada catatan manual yang tersebar.
                </p>
              </Child>

              <Child className="flex flex-wrap gap-3">
                <Btn href="#demo">Jadwalkan Demo GoStay</Btn>
                <Btn href="#cara-kerja" variant="outline">
                  Lihat Cara Kerjanya
                </Btn>
              </Child>

              <Child>
                <p className="text-sm text-white/50">
                  Kelola operasional properti dengan data booking yang lebih jelas dan mudah dipantau.
                </p>
              </Child>
            </div>
          </motion.div>

          <HeroVisual />
        </div>
      </Container>
    </section>
  );
}

/* ─── trust strip ────────────────────────────────────────────────────────── */

const propertyTypes = ["Hotel", "Villa", "Glamping", "Guest House", "Homestay"];

function TrustStrip() {
  return (
    <section className="bg-white py-14 sm:py-16">
      <Container>
        <Reveal className="flex flex-col items-center gap-3 text-center">
          <h2 className="font-display text-xl font-bold tracking-[-0.01em] sm:text-2xl">Dibuat untuk Bisnis Akomodasi</h2>
          <p className="max-w-xl text-[0.9375rem] text-black/60">
            Membantu pengelola properti merapikan proses reservasi dan operasional harian.
          </p>
        </Reveal>

        <Stagger gap={0.07} className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2">
          {propertyTypes.map((t) => (
            <Child key={t}>
              <span className="inline-block rounded-full border border-black/15 px-4 py-2 text-[0.8125rem] font-bold uppercase tracking-[0.06em] transition-all duration-300 hover:-translate-y-0.5 hover:border-black hover:bg-black hover:text-white">
                {t}
              </span>
            </Child>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}

/* ─── problem ────────────────────────────────────────────────────────────── */

const problems = [
  "Jadwal booking tersebar di chat dan spreadsheet.",
  "Sulit memastikan unit yang masih tersedia.",
  "Risiko jadwal reservasi bertabrakan.",
  "Status pembayaran tidak tercatat dengan jelas.",
  "Data tamu harus dicari satu per satu.",
  "Pergantian shift membuat informasi mudah terlewat.",
  "Tingkat hunian properti sulit dipantau.",
];

function Problem() {
  return (
    <section className="bg-[#FAF7EF] py-16 sm:py-24">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
          <div className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
            <Eyebrow className="text-black/45">Booking Ramai, Data Jangan Berantakan</Eyebrow>
            <Heading>Semakin Banyak Reservasi, Semakin Sulit Dikelola Secara Manual</Heading>
            <Reveal delay={0.15}>
              <p className="max-w-lg text-[1.0625rem] leading-relaxed text-black/65">
                Booking masuk melalui WhatsApp, telepon, media sosial, dan channel lainnya. Ketika semuanya dicatat
                secara terpisah, tim akan lebih mudah kehilangan informasi penting.
              </p>
            </Reveal>
          </div>

          <div>
            <Stagger gap={0.07} className="divide-y divide-black/10 border-y border-black/10">
              {problems.map((p) => (
                <Child key={p}>
                  <div className="group flex items-center gap-4 py-4 transition-[padding] duration-300 hover:pl-2">
                    <span className="relative flex h-2 w-2 shrink-0 items-center justify-center">
                      <span className="absolute inset-0 rounded-full bg-black transition-transform duration-300 group-hover:scale-[1.6]" />
                      <span className="absolute inset-0 rounded-full bg-black opacity-0 transition-all duration-500 group-hover:scale-[3] group-hover:opacity-10" />
                    </span>
                    <span className="text-[1.0625rem] leading-snug">{p}</span>
                  </div>
                </Child>
              ))}
            </Stagger>
            <Reveal delay={0.1}>
              <p className="mt-7 max-w-xl text-[1.0625rem] font-semibold leading-relaxed">
                GoStay menyatukan informasi booking agar pemilik dan tim operasional dapat bekerja menggunakan data yang
                sama.
              </p>
            </Reveal>
          </div>
        </div>
      </Container>
    </section>
  );
}

/* ─── value proposition ──────────────────────────────────────────────────── */

const values: { title: string; desc: string; bg: string; accent: string; shape: Shape }[] = [
  {
    title: "Booking Lebih Terorganisir",
    desc: "Catat detail reservasi, periode menginap, jumlah tamu, unit yang dipilih, dan informasi penting lainnya dalam satu sistem.",
    bg: "bg-[#F2F3EE]",
    accent: "bg-[#8CA82E]",
    shape: "arch",
  },
  {
    title: "Ketersediaan Unit Lebih Jelas",
    desc: "Lihat unit yang tersedia, sudah dipesan, sedang digunakan, atau selesai digunakan melalui kalender booking.",
    bg: "bg-[#DCEEF7]",
    accent: "bg-[#3E7C9B]",
    shape: "leaf",
  },
  {
    title: "Data Tamu Lebih Rapi",
    desc: "Simpan informasi tamu dan riwayat reservasi agar lebih mudah ditemukan ketika dibutuhkan.",
    bg: "bg-[#EEF9CC]",
    accent: "bg-[#7A9425]",
    shape: "wedge",
  },
  {
    title: "Status Pembayaran Lebih Mudah Dipantau",
    desc: "Pantau reservasi yang belum dibayar, sudah memberikan uang muka, atau sudah lunas.",
    bg: "bg-[#F2F3EE]",
    accent: "bg-black/35",
    shape: "soft",
  },
  {
    title: "Okupansi Mudah Dilihat",
    desc: "Ketahui tingkat hunian properti secara sederhana tanpa harus menghitung ulang data booking secara manual.",
    bg: "bg-[#F6E8D8]",
    accent: "bg-[#B07C46]",
    shape: "leaf",
  },
  {
    title: "Koordinasi Tim Lebih Praktis",
    desc: "Bantu admin dan tim operasional mengakses informasi reservasi yang sama untuk mengurangi miskomunikasi.",
    bg: "bg-[#F2F3EE]",
    accent: "bg-[#8CA82E]",
    shape: "arch",
  },
];

function ValueProposition() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <Container>
        {/* Heading is a sticky rail rather than a grid cell, so the cards keep
            their natural height instead of stretching to match it. */}
        <div className="grid gap-8 lg:grid-cols-[1fr_1.85fr] lg:gap-12">
          <div className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
            <Eyebrow className="text-black/45">Kenapa GoStay</Eyebrow>
            <Heading>Satu Dashboard untuk Mengelola Reservasi Properti</Heading>
            <Reveal delay={0.15}>
              <p className="text-[1.0625rem] leading-relaxed text-black/65">
                Tidak perlu lagi berpindah-pindah antara chat, buku catatan, dan spreadsheet hanya untuk memastikan
                jadwal booking.
              </p>
            </Reveal>
          </div>

          <Stagger className="grid gap-4 sm:grid-cols-2">
            {values.map((v) => (
              <Child key={v.title}>
                <Card bg={v.bg} shape={v.shape} accent={v.accent} className="h-full p-6 sm:p-7">
                  <CardTitle>{v.title}</CardTitle>
                  <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-black/65">{v.desc}</p>
                </Card>
              </Child>
            ))}
          </Stagger>
        </div>
      </Container>
    </section>
  );
}

/* ─── features ───────────────────────────────────────────────────────────── */

const features: {
  title: string;
  desc: string;
  span: string;
  bg: string;
  accent: string;
  shape: Shape;
  dark: boolean;
}[] = [
  {
    title: "Kalender Reservasi",
    desc: "Lihat jadwal check-in, check-out, durasi menginap, dan ketersediaan setiap unit dalam tampilan kalender.",
    span: "lg:col-span-2",
    bg: "bg-[#D7F056]",
    accent: "bg-black/40",
    shape: "leaf",
    dark: false,
  },
  {
    title: "Manajemen Kamar atau Unit",
    desc: "Kelola tipe kamar, villa, kabin, tenda glamping, atau unit lainnya sesuai kebutuhan properti.",
    span: "",
    bg: "bg-[#DCEEF7]",
    accent: "bg-[#3E7C9B]",
    shape: "arch",
    dark: false,
  },
  {
    title: "Data Reservasi",
    desc: "Simpan detail pemesanan, informasi tamu, jumlah pengunjung, harga, serta catatan khusus.",
    span: "",
    bg: "bg-[#161616]",
    accent: "bg-[#D7F056]",
    shape: "wedge",
    dark: true,
  },
  {
    title: "Status Booking",
    desc: "Bedakan reservasi baru, terkonfirmasi, check-in, check-out, selesai, atau dibatalkan.",
    span: "",
    bg: "bg-[#161616]",
    accent: "bg-white/40",
    shape: "soft",
    dark: true,
  },
  {
    title: "Pencatatan Pembayaran",
    desc: "Catat uang muka, sisa pembayaran, status pelunasan, dan metode pembayaran tamu.",
    span: "",
    bg: "bg-[#EEF9CC]",
    accent: "bg-[#7A9425]",
    shape: "arch",
    dark: false,
  },
  {
    title: "Ringkasan Okupansi",
    desc: "Pantau unit yang terisi dan tersedia dalam periode tertentu melalui tampilan yang lebih sederhana.",
    span: "",
    bg: "bg-[#161616]",
    accent: "bg-white/40",
    shape: "leaf",
    dark: true,
  },
  {
    title: "Riwayat Tamu",
    desc: "Temukan kembali data tamu dan riwayat menginap tanpa mencari percakapan lama.",
    span: "",
    bg: "bg-[#161616]",
    accent: "bg-[#D7F056]",
    shape: "soft",
    dark: true,
  },
  {
    title: "Laporan Operasional",
    desc: "Dapatkan ringkasan data booking sebagai bahan evaluasi operasional dan pengambilan keputusan.",
    span: "",
    bg: "bg-[#F6E8D8]",
    accent: "bg-[#B07C46]",
    shape: "wedge",
    dark: false,
  },
];

function Features() {
  return (
    <section id="fitur" className="bg-black py-16 text-white sm:py-24">
      <Container>
        <div className="flex flex-col items-start justify-between gap-6 lg:flex-row lg:items-end">
          <div className="flex max-w-2xl flex-col gap-4">
            <Eyebrow className="text-white/50">Fitur Utama</Eyebrow>
            <Heading className="text-white">Semua yang Dibutuhkan untuk Mengelola Booking Harian</Heading>
          </div>
          <Reveal delay={0.1} className="shrink-0">
            <Btn href="#demo">Lihat Demo Dashboard</Btn>
          </Reveal>
        </div>

        <Stagger gap={0.07} className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((f) => (
            <Child key={f.title} className={f.span}>
              <Card
                bg={f.bg}
                shape={f.shape}
                accent={f.accent}
                className={`h-full p-6 sm:p-7 ${f.dark ? "text-white ring-1 ring-white/10" : "text-black"}`}
              >
                <CardTitle>{f.title}</CardTitle>
                <p className={`mt-2.5 text-[0.9375rem] leading-relaxed ${f.dark ? "text-white/70" : "text-black/65"}`}>
                  {f.desc}
                </p>
              </Card>
            </Child>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}

/* ─── comparison ─────────────────────────────────────────────────────────── */

const comparison: [string, string][] = [
  ["Jadwal booking tersebar", "Reservasi tercatat dalam satu sistem"],
  ["Harus mengecek chat satu per satu", "Informasi tamu lebih mudah ditemukan"],
  ["Ketersediaan unit tidak langsung terlihat", "Status unit dapat dipantau melalui kalender"],
  ["Pembayaran dicatat terpisah", "Status pembayaran terhubung dengan reservasi"],
  ["Koordinasi bergantung pada admin tertentu", "Tim menggunakan informasi yang sama"],
  ["Okupansi dihitung manual", "Ringkasan hunian lebih mudah dilihat"],
];

function Comparison() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <Container>
        <div className="flex max-w-3xl flex-col gap-4">
          <Eyebrow className="text-black/45">Dari Manual Menjadi Terpusat</Eyebrow>
          <Heading>Tinggalkan Cara Kerja yang Membuat Tim Mudah Kehilangan Informasi</Heading>
        </div>

        <Reveal delay={0.08} className="mt-10">
          <div className="overflow-hidden rounded-[2rem_0.5rem_2rem_0.5rem] border border-black/10">
            <div className="grid grid-cols-2">
              <div className="bg-[#F2F3EE] px-5 py-4 sm:px-8">
                <Eyebrow className="text-black/50">Sebelum GoStay</Eyebrow>
              </div>
              <div className="bg-[#D7F056] px-5 py-4 sm:px-8">
                <Eyebrow>Dengan GoStay</Eyebrow>
              </div>
            </div>

            {comparison.map(([before, after], i) => (
              <div key={before} className={`group grid grid-cols-2 ${i > 0 ? "border-t border-black/10" : ""}`}>
                <motion.div
                  initial={{ opacity: 0, x: -28 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.55, ease: EASE, delay: i * 0.06 }}
                  className="px-5 py-4 text-[0.9375rem] leading-snug text-black/55 transition-colors group-hover:bg-[#FAFAF8] sm:px-8 sm:text-base"
                >
                  {before}
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, x: 28 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ duration: 0.55, ease: EASE, delay: i * 0.06 + 0.05 }}
                  className="border-l border-black/10 px-5 py-4 text-[0.9375rem] font-semibold leading-snug transition-colors group-hover:bg-[#F8FCE9] sm:px-8 sm:text-base"
                >
                  {after}
                </motion.div>
              </div>
            ))}
          </div>
        </Reveal>
      </Container>
    </section>
  );
}

/* ─── target user ────────────────────────────────────────────────────────── */

const audiences: { title: string; desc: string; bg: string; accent: string; shape: Shape; span: string }[] = [
  {
    title: "Hotel",
    desc: "Kelola reservasi dan ketersediaan banyak kamar dengan pencatatan yang lebih terstruktur.",
    bg: "bg-[#F2F3EE]",
    accent: "bg-[#8CA82E]",
    shape: "arch",
    span: "",
  },
  {
    title: "Villa",
    desc: "Pantau jadwal menginap, status pembayaran, dan kebutuhan tamu dalam satu dashboard.",
    bg: "bg-[#F6E8D8]",
    accent: "bg-[#B07C46]",
    shape: "arch",
    span: "",
  },
  {
    title: "Glamping",
    desc: "Kelola tenda, kabin, dome, serta unit glamping lainnya menggunakan kalender reservasi yang jelas.",
    bg: "bg-[#EEF9CC]",
    accent: "bg-[#7A9425]",
    shape: "arch",
    span: "",
  },
  {
    title: "Guest House dan Homestay",
    desc: "Rapikan pencatatan booking tanpa harus membangun sistem yang rumit.",
    bg: "bg-[#F2F3EE]",
    accent: "bg-black/35",
    shape: "wedge",
    span: "",
  },
  {
    title: "Pengelola Beberapa Unit",
    desc: "Bantu tim melihat jadwal dan status setiap unit secara lebih mudah dari satu tempat.",
    bg: "bg-[#DCEEF7]",
    accent: "bg-[#3E7C9B]",
    shape: "leaf",
    // Widened so the final row fills instead of leaving a hole.
    span: "sm:col-span-2 lg:col-span-2",
  },
];

function TargetUser() {
  return (
    <section id="cocok-untuk-siapa" className="bg-white pb-16 sm:pb-24">
      <Container>
        <div className="flex max-w-3xl flex-col gap-4">
          <Eyebrow className="text-black/45">Cocok untuk Siapa</Eyebrow>
          <Heading>Dibuat untuk Pengelola Berbagai Jenis Properti</Heading>
        </div>

        <Stagger gap={0.07} className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {audiences.map((a) => (
            <Child key={a.title} className={a.span}>
              <Card bg={a.bg} shape={a.shape} accent={a.accent} className="h-full p-6 sm:p-7">
                <CardTitle className="text-[1.3125rem]">{a.title}</CardTitle>
                <p className="mt-2.5 text-[0.9375rem] leading-relaxed text-black/65">{a.desc}</p>
              </Card>
            </Child>
          ))}
        </Stagger>
      </Container>
    </section>
  );
}

/* ─── service flow ───────────────────────────────────────────────────────── */

const steps = [
  {
    title: "Atur Data Properti",
    desc: "Masukkan informasi properti, kamar, villa, kabin, atau unit yang akan dikelola.",
  },
  {
    title: "Catat Reservasi",
    desc: "Masukkan detail tamu, tanggal menginap, unit yang dipilih, harga, dan status pembayaran.",
  },
  {
    title: "Pantau Kalender",
    desc: "Lihat jadwal booking dan ketersediaan unit melalui kalender yang mudah dipahami.",
  },
  {
    title: "Kelola Kedatangan Tamu",
    desc: "Perbarui status reservasi ketika tamu melakukan check-in, check-out, atau perubahan jadwal.",
  },
  {
    title: "Evaluasi Operasional",
    desc: "Gunakan ringkasan booking dan okupansi untuk membantu mengambil keputusan.",
  },
];

function ServiceFlow() {
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start 72%", "end 62%"] });
  const fill = useSpring(scrollYProgress, { stiffness: 90, damping: 28, mass: 0.4 });

  return (
    <section id="cara-kerja" className="bg-[#FAF7EF] py-16 sm:py-24">
      <Container>
        <div className="flex max-w-3xl flex-col gap-4">
          <Eyebrow className="text-black/45">Cara Kerja</Eyebrow>
          <Heading>Mulai Mengelola Booking dengan Lebih Rapi</Heading>
        </div>

        {/* A rail that fills as the section scrolls, instead of numbered steps. */}
        <div ref={trackRef} className="relative mt-10">
          <span className="absolute bottom-8 left-[7px] top-8 w-px bg-black/15" aria-hidden="true" />
          <motion.span
            style={{ scaleY: fill }}
            className="absolute bottom-8 left-[7px] top-8 w-px origin-top bg-black"
            aria-hidden="true"
          />

          <Stagger gap={0.1}>
            {steps.map((s, i) => (
              <Child key={s.title}>
                <div
                  className={`group relative grid gap-2 py-6 pl-9 sm:grid-cols-[320px_1fr] sm:gap-8 sm:pl-12 ${
                    i > 0 ? "border-t border-black/10" : ""
                  }`}
                >
                  <span
                    className="absolute left-0 top-[30px] flex h-[15px] w-[15px] items-center justify-center rounded-full border border-black/25 bg-[#FAF7EF] transition-colors duration-300 group-hover:border-black"
                    aria-hidden="true"
                  >
                    <span className="h-[7px] w-[7px] rounded-full bg-black/25 transition-colors duration-300 group-hover:bg-[#8CA82E]" />
                  </span>

                  <CardTitle className="text-[1.1875rem] sm:text-[1.375rem]">{s.title}</CardTitle>
                  <p className="max-w-xl text-[1.0625rem] leading-relaxed text-black/65">{s.desc}</p>
                </div>
              </Child>
            ))}
          </Stagger>
        </div>
      </Container>
    </section>
  );
}

/* ─── business outcome ───────────────────────────────────────────────────── */

const outcomes = [
  "Mengurangi risiko jadwal reservasi bertabrakan.",
  "Mengetahui unit yang masih tersedia lebih cepat.",
  "Mempercepat admin dalam merespons calon tamu.",
  "Menjaga informasi antarshift tetap konsisten.",
  "Memantau pembayaran setiap reservasi.",
  "Menemukan data tamu dengan lebih mudah.",
  "Melihat tingkat hunian tanpa menghitung manual.",
  "Membuat operasional properti lebih tertata.",
];

function Outcome() {
  return (
    <section className="bg-black py-16 text-white sm:py-24">
      <Container>
        <div className="grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-5 lg:sticky lg:top-28 lg:self-start">
            <Eyebrow className="text-white/50">Dampak untuk Operasional</Eyebrow>
            <Heading caps className="text-white">
              Lebih Sedikit Waktu Mengecek Catatan, Lebih Banyak Waktu Melayani Tamu
            </Heading>
            <Reveal delay={0.15}>
              <p className="text-[1.0625rem] text-white/70">
                Dengan pengelolaan booking yang lebih terpusat, bisnis dapat:
              </p>
            </Reveal>
          </div>

          <Stagger gap={0.06} className="grid gap-3 sm:grid-cols-2">
            {outcomes.map((o, i) => (
              <Child key={o}>
                <div
                  className={`h-full border border-white/12 p-5 text-[0.9375rem] leading-snug text-white/85 transition-colors duration-300 hover:border-white/30 hover:bg-white/[0.05] ${
                    i % 3 === 0 ? SHAPES.leaf : i % 3 === 1 ? SHAPES.soft : SHAPES.wedge
                  }`}
                >
                  {o}
                </div>
              </Child>
            ))}
          </Stagger>
        </div>
      </Container>
    </section>
  );
}

/* ─── social proof ───────────────────────────────────────────────────────── */

function SocialProof() {
  return (
    <section className="bg-white py-16 sm:py-24">
      <Container>
        <div className="flex max-w-3xl flex-col gap-4">
          <Eyebrow className="text-black/45">Digunakan dalam Operasional Nyata</Eyebrow>
          <Heading>Membantu Pengelola Properti Merapikan Booking Harian</Heading>
        </div>

        <div className="mt-10 grid gap-4 lg:grid-cols-[1.15fr_1fr]">
          <Reveal>
            <Card bg="bg-[#F2F3EE]" shape="leaf" accent="bg-[#8CA82E]" className="h-full p-7 sm:p-9">
              <CardTitle className="text-[1.3125rem]">Studi Kasus — Pengelolaan Reservasi Villa</CardTitle>

              <dl className="mt-7 flex flex-col gap-5">
                <div>
                  <dt className="text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-black/45">
                    Sebelum GoStay
                  </dt>
                  <dd className="mt-2 text-[1.0625rem] leading-relaxed text-black/75">
                    Booking dicatat melalui percakapan WhatsApp dan spreadsheet yang diperbarui oleh beberapa admin.
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-black/45">
                    Setelah Menggunakan GoStay
                  </dt>
                  <dd className="mt-2 text-[1.0625rem] leading-relaxed text-black/75">
                    Jadwal menginap, status unit, data tamu, dan pembayaran dapat dipantau dalam satu dashboard.
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.8125rem] font-bold uppercase tracking-[0.06em] text-black/45">Hasil</dt>
                  {/* Placeholder kept verbatim from the source copy — swap for a
                      verified metric before launch. */}
                  <dd className="mt-2 rounded-[1rem_0.25rem_1rem_0.25rem] border border-dashed border-black/25 bg-white/60 px-4 py-3 text-[0.9375rem] leading-relaxed text-black/50">
                    [Masukkan metrik valid, misalnya pengurangan kesalahan pencatatan atau waktu pengecekan booking]
                  </dd>
                </div>
              </dl>
            </Card>
          </Reveal>

          <Reveal delay={0.08}>
            <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-t-[3.25rem] rounded-b-[1.25rem] bg-black p-7 text-white sm:p-9">
              <div>
                <Eyebrow className="text-white/45">Testimoni</Eyebrow>
                <blockquote className="mt-6 font-display text-[1.3125rem] font-bold leading-[1.35] tracking-[-0.005em] sm:text-[1.5rem]">
                  <span className="mr-0.5 text-[#D7F056]">“</span>
                  GoStay membantu tim kami melihat jadwal booking dan ketersediaan unit dengan lebih jelas. Koordinasi
                  antaradmin juga menjadi lebih mudah.
                  <span className="ml-0.5 text-[#D7F056]">”</span>
                </blockquote>
              </div>

              <div className="mt-8">
                <p className="text-[0.9375rem] font-semibold text-white/85">[Nama Pengguna]</p>
                <p className="text-[0.9375rem] text-white/50">[Jabatan — Nama Properti]</p>
                <div className="mt-6">
                  <Btn href="#demo" variant="white">
                    Lihat Pengalaman Pengguna
                  </Btn>
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/* ─── differentiator ─────────────────────────────────────────────────────── */

const differentiators = [
  "Fokus pada pengelolaan booking bisnis akomodasi.",
  "Dapat digunakan untuk hotel, villa, dan glamping.",
  "Kalender reservasi mudah dipahami oleh tim.",
  "Informasi booking, tamu, dan pembayaran lebih terpusat.",
  "Membantu koordinasi antara admin dan operasional.",
  "Dapat disesuaikan dengan jenis unit properti.",
  "Memudahkan pemilik memantau kondisi bisnis.",
];

function Differentiator() {
  return (
    <section className="bg-[#FAF7EF] py-16 sm:py-24">
      <Container>
        <div className="grid gap-10 lg:grid-cols-[1fr_1.15fr] lg:gap-16">
          <div className="flex flex-col gap-4 lg:sticky lg:top-28 lg:self-start">
            <Eyebrow className="text-black/45">Kenapa Memilih GoStay</Eyebrow>
            <Heading>Dibuat untuk Operasional Properti yang Membutuhkan Kejelasan</Heading>
          </div>

          <Stagger gap={0.07} className="grid gap-3 sm:grid-cols-2">
            {differentiators.map((d, i) => (
              // The odd one out widens so the last row fills edge to edge.
              <Child key={d} className={i === differentiators.length - 1 ? "sm:col-span-2" : ""}>
                <div
                  className={`h-full border border-black/10 bg-white px-5 py-4 text-[0.9375rem] leading-snug transition-all duration-300 hover:-translate-y-0.5 hover:border-black/30 hover:shadow-[0_16px_32px_-24px_rgba(0,0,0,0.6)] ${
                    i % 2 === 0 ? SHAPES.wedge : SHAPES.leaf
                  }`}
                >
                  {d}
                </div>
              </Child>
            ))}
          </Stagger>
        </div>
      </Container>
    </section>
  );
}

/* ─── faq ────────────────────────────────────────────────────────────────── */

const faqs = [
  {
    q: "Apa itu GoStay?",
    a: "GoStay adalah aplikasi manajemen booking yang membantu hotel, villa, glamping, dan bisnis akomodasi lainnya mengelola reservasi dalam satu sistem.",
  },
  {
    q: "Apakah GoStay hanya untuk hotel?",
    a: "Tidak. GoStay dapat digunakan untuk berbagai jenis properti, seperti villa, glamping, guest house, homestay, kabin, dan bisnis akomodasi lainnya.",
  },
  {
    q: "Apakah GoStay bisa digunakan untuk mengelola beberapa unit?",
    a: "GoStay dirancang untuk membantu pengelola memantau ketersediaan dan jadwal reservasi setiap unit yang dimiliki.",
  },
  {
    q: "Apakah data booking lama dapat dimasukkan?",
    a: "Data reservasi yang masih aktif dapat dimasukkan ke dalam sistem agar tim dapat melanjutkan pengelolaan booking secara lebih terpusat.",
  },
  {
    q: "Apakah admin perlu memiliki kemampuan teknis?",
    a: "Tidak. Alur penggunaan GoStay dirancang agar dapat digunakan oleh pemilik properti, admin reservasi, dan tim operasional.",
  },
  {
    q: "Apakah GoStay dapat membantu mencegah double booking?",
    a: "Kalender reservasi membantu tim melihat unit yang sudah dipesan pada tanggal tertentu sehingga risiko benturan jadwal dapat dikurangi.",
  },
  {
    q: "Apakah pembayaran tamu bisa dicatat?",
    a: "Status pembayaran dapat dicatat bersama data reservasi agar admin lebih mudah memantau uang muka dan pelunasan.",
  },
  {
    q: "Apakah tersedia demo penggunaan?",
    a: "Ya. Anda dapat menjadwalkan demo untuk melihat cara kerja dashboard dan mendiskusikan kebutuhan properti Anda.",
  },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

function FAQ() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section id="faq" className="bg-[#FFFCF6] py-16 sm:py-24">
      <Container>
        <div className="mx-auto w-full max-w-[841px]">
          <Heading className="mb-8">Pertanyaan yang Sering Diajukan</Heading>

          <Stagger gap={0.05} className="border-t border-black/15">
            {faqs.map((f, i) => {
              const open = openIdx === i;
              return (
                <Child key={f.q}>
                  <div className="border-b border-black/15">
                    <h3>
                      <button
                        type="button"
                        onClick={() => setOpenIdx(open ? null : i)}
                        aria-expanded={open}
                        className="group flex w-full items-start justify-between gap-5 py-5 text-left"
                      >
                        <span className="font-display text-[1.0625rem] font-bold leading-snug transition-transform duration-300 ease-out group-hover:translate-x-1 sm:text-[1.1875rem]">
                          {f.q}
                        </span>
                        <motion.span
                          animate={{ backgroundColor: open ? "#D7F056" : "#E7E8E3", rotate: open ? 180 : 0 }}
                          transition={{ duration: 0.35, ease: EASE }}
                          className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                        >
                          <span className="relative block h-3 w-3" aria-hidden="true">
                            <span className="absolute left-0 top-1/2 h-[1.5px] w-3 -translate-y-1/2 rounded-full bg-black" />
                            <motion.span
                              animate={{ scaleY: open ? 0 : 1 }}
                              transition={{ duration: 0.3, ease: EASE }}
                              className="absolute left-1/2 top-0 h-3 w-[1.5px] -translate-x-1/2 rounded-full bg-black"
                            />
                          </span>
                        </motion.span>
                      </button>
                    </h3>

                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.35, ease: EASE }}
                          className="overflow-hidden"
                        >
                          <p className="max-w-[46rem] pb-6 pr-10 text-[1.0625rem] leading-relaxed text-black/70">
                            {f.a}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Child>
              );
            })}
          </Stagger>
        </div>
      </Container>
    </section>
  );
}

/* ─── final cta ──────────────────────────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="bg-[#FFFCF6]">
      <Container>
        <div className="relative overflow-hidden rounded-t-[5rem] rounded-b-[2rem] bg-black px-6 py-16 text-center text-white sm:px-12 sm:py-24">
          {/* slow drifting glow so the block never reads as a flat rectangle */}
          <motion.span
            aria-hidden="true"
            animate={{ scale: [1, 1.18, 1], rotate: [0, 10, 0], opacity: [0.55, 0.85, 0.55] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute -inset-1/4"
            style={{
              background:
                "radial-gradient(38% 38% at 28% 26%, rgba(215,240,86,0.22), transparent 70%), radial-gradient(34% 34% at 76% 68%, rgba(220,238,247,0.18), transparent 70%)",
            }}
          />

          <motion.div
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            variants={{ hidden: {}, show: { transition: { staggerChildren: 0.1 } } }}
            className="relative mx-auto flex max-w-4xl flex-col items-center gap-6"
          >
            <Child>
              <p className="flex items-center text-[0.8125rem] font-bold uppercase leading-none tracking-[0.06em] text-white/50">
                <motion.span
                  variants={{ hidden: { scaleX: 0 }, show: { scaleX: 1, transition: { duration: 0.7, ease: EASE } } }}
                  className="mr-3 inline-block h-px w-8 origin-left bg-current"
                  aria-hidden="true"
                />
                Rapikan Operasional Properti Anda
              </p>
            </Child>

            <motion.h2
              variants={{ hidden: {}, show: { transition: { staggerChildren: 0.01 } } }}
              className="font-display text-[1.875rem] font-black uppercase leading-[1.05] tracking-[-0.01em] sm:text-[2.75rem] lg:text-[3.375rem]"
            >
              <Words text="Kelola Booking Tanpa Harus Membuka Banyak Chat dan Spreadsheet" />
            </motion.h2>

            <Child>
              <p className="max-w-2xl text-[1.0625rem] leading-relaxed text-white/70">
                Lihat bagaimana GoStay membantu Anda memantau reservasi, ketersediaan unit, data tamu, pembayaran, dan
                tingkat hunian dalam satu sistem.
              </p>
            </Child>

            <Child className="flex flex-wrap justify-center gap-3">
              <Btn href="#demo">Jadwalkan Demo GoStay</Btn>
              <Btn
                href={`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(
                  "Halo GoStay, saya ingin mengonsultasikan kebutuhan properti saya.",
                )}`}
                external
                variant="outline"
              >
                Konsultasikan Kebutuhan Properti
              </Btn>
            </Child>

            <Child>
              <p className="text-sm text-white/50">
                Mulai dari proses booking yang lebih rapi untuk operasional yang lebih terkendali.
              </p>
            </Child>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}

/* ─── demo form ──────────────────────────────────────────────────────────── */

/* Deliberately short: three fields is the lowest-friction ask that still lets
   the team prepare before calling back. Everything else is asked on the call. */
const formFields = [
  { name: "nama", label: "Nama lengkap", type: "text", placeholder: "Mis. Budi Santoso" },
  { name: "wa", label: "Nomor WhatsApp", type: "tel", placeholder: "Mis. 0812 3456 7890" },
  { name: "jenis", label: "Jenis properti", type: "select", placeholder: "" },
] as const;

const inputCls =
  "w-full rounded-[0.875rem_0.25rem_0.875rem_0.25rem] border border-black/15 bg-white px-4 py-3 text-[0.9375rem] outline-none transition-colors duration-200 placeholder:text-black/30 focus:border-black focus-visible:ring-2 focus-visible:ring-black/15 focus-visible:ring-offset-0";

function DemoForm() {
  const [values, setValues] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setValues((p) => ({ ...p, [k]: v }));

  /* There is no inbound-lead endpoint yet, so the form hands off to the same
     WhatsApp number the other marketing surfaces use, with every answer
     pre-filled so nothing the visitor typed is lost. */
  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const lines = [
      "Halo GoStay, saya ingin menjadwalkan demo.",
      "",
      ...formFields.map((f) => `${f.label}: ${values[f.name]?.trim() || "-"}`),
    ];
    window.open(`https://wa.me/${WA_NUMBER}?text=${encodeURIComponent(lines.join("\n"))}`, "_blank");
  }

  return (
    <section id="demo" className="bg-[#FFFCF6] py-16 sm:py-24">
      <Container>
        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-4">
            <Heading>Jadwalkan Demo GoStay</Heading>
            <Reveal delay={0.15}>
              <p className="max-w-md text-[1.0625rem] leading-relaxed text-black/65">
                Tim GoStay akan menghubungi Anda untuk menyesuaikan jadwal demonstrasi.
              </p>
            </Reveal>
          </div>

          <Reveal delay={0.1}>
            <div className="rounded-t-[3.25rem] rounded-b-[1.25rem] border border-black/10 bg-white p-7 shadow-[0_24px_60px_-40px_rgba(0,0,0,0.5)] sm:p-9">
              <Stagger gap={0.06}>
                <form onSubmit={onSubmit} className="flex flex-col gap-4">
                  {formFields.map((f) => (
                    <Child key={f.name}>
                      <label
                        htmlFor={`demo-${f.name}`}
                        className="mb-1.5 block text-[0.8125rem] font-semibold text-black/70"
                      >
                        {f.label}
                      </label>

                      {f.type === "select" ? (
                        <select
                          id={`demo-${f.name}`}
                          required
                          value={values[f.name] ?? ""}
                          onChange={(e) => set(f.name, e.target.value)}
                          className={inputCls}
                        >
                          <option value="">Pilih jenis properti</option>
                          {propertyTypes.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                          <option value="Lainnya">Lainnya</option>
                        </select>
                      ) : (
                        <input
                          id={`demo-${f.name}`}
                          type={f.type}
                          required
                          placeholder={f.placeholder}
                          value={values[f.name] ?? ""}
                          onChange={(e) => set(f.name, e.target.value)}
                          className={inputCls}
                        />
                      )}
                    </Child>
                  ))}

                  <Child className="mt-2">
                    <Btn type="submit" className="w-full">
                      Jadwalkan Demo
                    </Btn>
                  </Child>
                </form>
              </Stagger>
            </div>
          </Reveal>
        </div>
      </Container>
    </section>
  );
}

/* ─── footer ─────────────────────────────────────────────────────────────── */

const footerNav = [
  { label: "Fitur", href: "#fitur" },
  { label: "Cara Kerja", href: "#cara-kerja" },
  { label: "FAQ", href: "#faq" },
  { label: "Jadwalkan Demo", href: "#demo" },
];

const footerSocial = [
  { label: "WhatsApp", href: `https://wa.me/${WA_NUMBER}`, external: true },
  { label: "Instagram", href: "https://instagram.com/gostay.id", external: true },
  { label: "Email", href: "mailto:info@gostay.id", external: false },
];

function Footer() {
  return (
    <footer className="bg-black pb-8 pt-14 text-white sm:pt-16">
      <Container>
        <div className="flex flex-col gap-10 border-b border-white/15 pb-10 lg:flex-row lg:justify-between">
          <div className="max-w-sm">
            <img src="/gostay.svg" alt="GoStay" className="h-11 w-auto brightness-0 invert" />
            <p className="mt-4 text-[0.9375rem] leading-relaxed text-white/60">
              Aplikasi manajemen booking untuk membantu hotel, villa, dan glamping mengelola reservasi dengan lebih
              rapi.
            </p>
          </div>

          <div className="flex flex-col gap-8 sm:flex-row sm:gap-20">
            <nav className="flex flex-col gap-3">
              {footerNav.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="w-fit text-[0.9375rem] text-white/75 transition-all duration-300 hover:translate-x-1 hover:text-white"
                >
                  {l.label}
                </a>
              ))}
            </nav>

            <nav className="flex flex-col gap-3">
              {footerSocial.map((l) => (
                <a
                  key={l.label}
                  href={l.href}
                  {...(l.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                  className="w-fit text-[0.9375rem] font-semibold text-white/75 transition-all duration-300 hover:translate-x-1 hover:text-white"
                >
                  {l.label}
                </a>
              ))}
            </nav>
          </div>
        </div>

        <p className="pt-5 text-[0.8125rem] text-white/45">© 2026 GoStay. All rights reserved.</p>
      </Container>
    </footer>
  );
}

/* ─── page ───────────────────────────────────────────────────────────────── */

function useJsonLd(id: string, data: unknown) {
  useEffect(() => {
    if (document.getElementById(id)) return;
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.id = id;
    script.text = JSON.stringify(data);
    document.head.appendChild(script);
    return () => document.getElementById(id)?.remove();
  }, [id, data]);
}

export default function LandingPage() {
  useJsonLd("gostay-jsonld", jsonLd);
  useJsonLd("gostay-faq-jsonld", faqJsonLd);

  return (
    // reducedMotion="user" makes every entrance on this page honour the OS
    // "reduce motion" setting without disabling opacity fades.
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-screen flex-col bg-white font-sans text-black antialiased">
        <Navbar />
        <main className="flex-1">
          <Hero />
          <TrustStrip />
          <Problem />
          <ValueProposition />
          <Features />
          <Comparison />
          <TargetUser />
          <ServiceFlow />
          <Outcome />
          <SocialProof />
          <Differentiator />
          <FAQ />
          <FinalCTA />
          <DemoForm />
        </main>
        <Footer />
      </div>
    </MotionConfig>
  );
}
