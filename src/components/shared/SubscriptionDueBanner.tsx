import { Link } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useSubscriptionGate } from "@/hooks/useSubscriptionGate";

// Peringatan sebelum gerbang turun.
//
// Gerbang yang datang tanpa aba-aba terasa seperti kerusakan, bukan penagihan —
// hotel membuka aplikasinya di pagi hari dan mendapati semuanya mati. Spanduk
// ini muncul begitu ada tagihan lewat jatuh tempo dan menghitung mundur hari
// tersisa, sehingga saat gerbangnya benar-benar turun tidak ada yang terkejut.

export default function SubscriptionDueBanner() {
  const t = useT();
  const { data: gate } = useSubscriptionGate();

  // Sudah tergerbang → yang tampil layar gerbangnya sendiri, bukan spanduk.
  if (!gate || gate.gated || gate.days_late <= 0) return null;

  // Masa tenggangnya datang dari DB bersama sisa datanya — menyalinnya sebagai
  // konstanta di sini berarti mengubahnya di satu tempat diam-diam membuat
  // hitung mundur ini berbohong.
  const sisa = Math.max(gate.grace_days - gate.days_late, 1);
  return (
    <div className="mx-4 mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm md:mx-6">
      <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
      <p className="text-foreground">
        {t("Langganan bulan ini belum dibayar")} — {gate.days_late} {t("hari lewat jatuh tempo")}.{" "}
        <span className="font-semibold">
          {t("Akses ditutup dalam")} {sisa} {t("hari lagi")}.
        </span>
      </p>
      <Link to="/saldo" className="ml-auto shrink-0 font-semibold text-primary hover:underline">
        {t("Bayar sekarang")}
      </Link>
    </div>
  );
}
