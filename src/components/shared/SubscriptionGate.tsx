import { useLocation, Link } from "react-router-dom";
import { Lock, CalendarClock, ArrowRight } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useSubscriptionGate } from "@/hooks/useSubscriptionGate";

// Gerbang tunggakan langganan (058).
//
// Hotel yang belum membayar lebih dari seminggu setelah jatuh tempo kehilangan
// akses ke aplikasi stafnya sampai membayar. Dua hal yang sengaja TIDAK ikut
// dikunci, dan keduanya bukan kelonggaran melainkan syarat supaya gerbangnya
// masuk akal:
//
//   • Halaman Saldo — di situlah tombol bayarnya. Gerbang yang mengunci jalan
//     keluarnya sendiri berhenti jadi penagihan dan berubah jadi jebakan.
//   • Portal tamu dan bot WhatsApp — keduanya melayani TAMU, bukan hotel.
//     Menghukum tamu yang sudah memesan atas tagihan hotelnya adalah kerugian
//     yang ditanggung orang yang salah.
//
// Ini gerbang di lapisan tampilan; sumber kebenarannya fungsi DB. Ia menahan
// orang, bukan permintaan HTTP — untuk menahan permintaan, kuncinya harus di
// RLS, dan itu keputusan terpisah karena salah sedikit bisa mengunci hotel
// dari datanya sendiri.

/** Halaman yang tetap terbuka saat tergerbang. */
const TETAP_TERBUKA = ["/saldo"];

function fmtIDR(n: number) {
  return "Rp" + Math.round(n).toLocaleString("id-ID");
}
function fmtTanggal(s: string) {
  return new Date(s).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
}

export default function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const t = useT();
  const { pathname } = useLocation();
  const { data: gate } = useSubscriptionGate();

  if (!gate?.gated || TETAP_TERBUKA.some((p) => pathname.startsWith(p))) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center p-4 md:p-6">
      <div className="w-full max-w-lg rounded-2xl border border-destructive/30 bg-card p-6 md:p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <Lock className="h-6 w-6 text-destructive" />
        </div>
        <h1 className="text-xl font-bold text-foreground">{t("Langganan tertunggak")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Tagihan langganan yang jatuh tempo")} {fmtTanggal(gate.due_date)}{" "}
          {t("belum dibayar sampai hari ini")} — {gate.days_late} {t("hari terlambat")}.{" "}
          {t("Akses aplikasi dibuka kembali segera setelah pembayarannya masuk.")}
        </p>

        <div className="my-5 rounded-xl border border-border bg-muted/40 p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{t("Yang harus dibayar")}</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{fmtIDR(gate.amount_due)}</p>
          <p className="mt-1 text-xs text-muted-foreground inline-flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5" />
            {t("Periode")} {new Date(gate.period).toLocaleDateString("id-ID", { month: "long", year: "numeric" })}
          </p>
        </div>

        <Link
          to="/saldo"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
        >
          {t("Bayar sekarang")} <ArrowRight className="h-4 w-4" />
        </Link>

        <p className="mt-4 text-xs text-muted-foreground">
          {t("Tanggal tagih bulan berikutnya tidak berubah — membayar sekarang tidak menggeser jatuh tempo Anda.")}
        </p>
      </div>
    </div>
  );
}
