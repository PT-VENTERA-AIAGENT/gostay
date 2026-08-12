import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

/**
 * Keadaan tunggakan langganan hotel yang sedang login.
 *
 * Dihitung DI DATABASE (`my_subscription_gate`, migration 058), bukan di sini:
 * periodenya diturunkan dari tanggal hotel mulai berlangganan sampai bulan
 * berjalan, jadi hotel yang tagihannya lupa diterbitkan tetap terhitung
 * menunggak. Kalau logika ini hidup di peramban, ia juga akan ikut hilang
 * bersama peramban yang menutupnya.
 *
 * Gagal baca = TIDAK tergerbang. Sebuah gangguan jaringan tidak boleh
 * mengunci hotel dari aplikasinya sendiri.
 */
export interface SubscriptionGate {
  gated: boolean;
  period: string;
  due_date: string;
  days_late: number;
  amount_due: number;
  /** Masa tenggang dari DB — supaya angkanya tidak diduplikasi di komponen. */
  grace_days: number;
}

export function useSubscriptionGate() {
  const { session, role } = useAuth();
  const isHotel = role === "staff" || role === "admin";

  return useQuery({
    queryKey: ["subscription-gate", session?.profile_id ?? "anon"],
    enabled: Boolean(session) && isHotel,
    // Dicek ulang tiap 5 menit: begitu tagihannya dibayar, gerbangnya membuka
    // tanpa hotel harus memuat ulang halamannya.
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<SubscriptionGate | null> => {
      // Untyped cast: RPC ini belum ada di generated types (pola yang sama
      // dipakai service-service tabel baru).
      const { data, error } = await (supabase as any).rpc("my_subscription_gate");
      if (error) return null;
      // Fungsi tabel: nol baris berarti tidak ada yang terutang.
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
      if (!row) return null;
      return {
        gated: row.gated === true,
        period: String(row.period),
        due_date: String(row.due_date),
        days_late: Number(row.days_late ?? 0),
        amount_due: Number(row.amount_due ?? 0),
        grace_days: Number(row.grace_days ?? 7),
      };
    },
  });
}
