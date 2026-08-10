/**
 * "3 malam" / "1 night" — the night count, in whichever language is on.
 *
 * The same three words were being produced four different ways, and three of
 * them were wrong:
 *
 *   {nights} malam                    Indonesian forced in, wrong under EN
 *   {nights} {t("nights")}            "1 nights" under EN
 *   ({nights} nights)                 raw English inside the Indonesian console
 *   {n} night{n !== 1 ? "s" : ""}     correct plural, never translated
 *
 * None of them was obviously broken on its own, which is why all four survived.
 * Collapsing them into one place is the only way the next screen gets it right
 * without anyone remembering to.
 *
 * Indonesian has no plural form, so both keys resolve to "malam" and the count
 * simply reads naturally. English picks the right one. Callers pass their own
 * `t` because it comes from a hook.
 */
export function nightsLabel(count: number, t: (s: string) => string): string {
  return `${count} ${t(count === 1 ? "night" : "nights")}`;
}

/**
 * "2 tamu" / "2 guests" — persoalan yang sama persis, jadi ia tinggal di sini
 * juga alih-alih di modulnya sendiri.
 *
 * `{guests} guest{guests !== 1 ? "s" : ""}` tersebar di layar pemesanan portal:
 * jamaknya benar dalam bahasa Inggris, dan tidak pernah diterjemahkan. Seorang
 * tamu Indonesia membaca "2 guests" tepat sebelum membayar.
 */
export function guestsLabel(count: number, t: (s: string) => string): string {
  return `${count} ${t(count === 1 ? "guest" : "guests")}`;
}
