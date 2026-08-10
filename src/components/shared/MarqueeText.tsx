import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Teks yang berjalan HANYA kalau ia memang tidak muat.
 *
 * Nama hotel dan nama pengguna dipotong `truncate` di beberapa tempat, dan
 * "KEMA MERBABU Glamour Camping" terbaca "KEMA MERBABU G…" — nama yang dipotong
 * di tengah kata justru menyembunyikan informasi yang paling menentukan. Tooltip
 * `title` tidak menolong di layar sentuh.
 *
 * Yang muat tetap diam. Menggerakkan teks yang sebenarnya sudah terbaca penuh
 * hanya menarik perhatian tanpa memberi apa pun — dan di dasbor yang dipakai
 * seharian, gerak tanpa alasan itu melelahkan.
 *
 * Geraknya bolak-balik dengan jeda di kedua ujung, bukan gulungan tanpa henti:
 * mata perlu waktu diam untuk benar-benar membaca awal dan akhir teksnya.
 */
export default function MarqueeText({
  children,
  className,
  /** Piksel per detik. Lebih lambat dari yang terasa "benar" saat mendesain. */
  speed = 30,
}: {
  children: string;
  className?: string;
  speed?: number;
}) {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const o = outer.current;
    const i = inner.current;
    if (!o || !i) return;

    function measure() {
      if (!o || !i) return;
      // Toleransi 2px: pembulatan sub-piksel bisa melaporkan selisih 0.5px pada
      // teks yang sebenarnya pas, dan itu cukup untuk memicu gerak yang salah.
      const over = i.scrollWidth - o.clientWidth;
      setShift(over > 2 ? over : 0);
    }

    measure();

    // Lebar berubah karena sidebar mengembang/menyusut, jendela diubah ukurannya,
    // atau font baru selesai dimuat — ketiganya lewat sini.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    ro?.observe(o);
    ro?.observe(i);
    return () => ro?.disconnect();
  }, [children]);

  const running = shift > 0;

  return (
    <span
      ref={outer}
      // `title` tetap dipasang: penunjuk tetikus dan pembaca layar mendapat teks
      // penuh tanpa menunggu satu putaran animasi selesai.
      title={running ? children : undefined}
      className={cn("block overflow-hidden whitespace-nowrap", className)}
    >
      <span
        ref={inner}
        className={cn("inline-block", running && "animate-marquee motion-reduce:animate-none")}
        style={
          running
            ? ({
                "--marquee-shift": `-${shift}px`,
                // Jarak jauh butuh waktu lebih lama; kecepatannya yang tetap,
                // bukan durasinya. Ditambah 3 detik untuk jeda di kedua ujung.
                "--marquee-duration": `${(shift / speed) * 2 + 3}s`,
              } as React.CSSProperties)
            : undefined
        }
      >
        {children}
      </span>
    </span>
  );
}
