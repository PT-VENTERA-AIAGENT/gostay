"use client";

import React, { useState, useEffect } from "react";

const LEADS_COLLECTOR_URL =
  "https://wfthvovlhphnrodrqxqt.supabase.co/functions/v1/leads-collector";

export function PromoPopup() {
  if (import.meta.env.DEV) return null;
  const [isOpen, setIsOpen] = useState(false);
  const [contact, setContact] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const dismissed = sessionStorage.getItem("bm_promo_dismissed");
    if (dismissed) return;

    const timer = setTimeout(() => {
      setIsOpen(true);
    }, 5000);

    return () => clearTimeout(timer);
  }, []);

  const handleClose = () => {
    setIsOpen(false);
    sessionStorage.setItem("bm_promo_dismissed", "1");
  };

  const saveLead = async (source: string) => {
    if (!contact.trim()) return;
    setIsLoading(true);
    try {
      await fetch(LEADS_COLLECTOR_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: contact.includes("@") ? contact : "",
          whatsapp: !contact.includes("@") ? contact : "",
          domain: window.location.hostname,
          project: "gostay-hotel",
          source,
        }),
      });
      setIsDone(true);
      setTimeout(handleClose, 2000);
    } catch {
      // fail silently
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = () => saveLead("promo-popup");

  const handleWhatsApp = async () => {
    if (contact.trim()) await saveLead("promo-popup-wa");
    const msg = encodeURIComponent(
      "Halo, saya mau tanya soal sistem booking hotel GoStay.",
    );
    window.open(`https://wa.me/6281318000263?text=${msg}`, "_blank");
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 p-0 text-white shadow-2xl overflow-hidden">
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 z-10 rounded-full bg-white/10 p-1.5 hover:bg-white/20 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Decorative */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white rounded-full translate-x-12 -translate-y-12" />
          <div className="absolute bottom-0 left-0 w-20 h-20 bg-white rounded-full -translate-x-10 translate-y-10" />
        </div>

        <div className="relative z-10 px-6 pt-7 pb-6 space-y-4">
          {isDone ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">&#10003;</div>
              <p className="font-semibold">Terima kasih! Kami akan hubungi kamu.</p>
            </div>
          ) : (
            <>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-bold leading-tight">
                  Kelola Reservasi Hotel Tanpa Ribet?
                </h3>
                <p className="text-sm text-blue-100 leading-relaxed">
                  GoStay membantu hotel dan penginapan kamu menerima booking online, kelola kamar, dan otomasi konfirmasi — semua dari satu dashboard.
                </p>
              </div>

              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="WhatsApp / Email"
                className="w-full rounded-lg bg-white/10 border border-white/30 px-4 py-2.5 text-sm text-white placeholder-white/60 focus:border-white/50 focus:outline-none"
              />

              <button
                onClick={handleSubmit}
                disabled={isLoading || !contact.trim()}
                className="w-full rounded-lg bg-green-500 hover:bg-green-600 py-2.5 text-sm font-bold text-white transition-colors disabled:opacity-60"
              >
                {isLoading ? "Mengirim..." : "Coba GoStay Gratis"}
              </button>

              <button
                onClick={handleWhatsApp}
                className="w-full text-center text-xs text-white/70 hover:text-white font-medium underline underline-offset-2 flex items-center justify-center gap-1.5"
              >
                Chat langsung via WhatsApp
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
