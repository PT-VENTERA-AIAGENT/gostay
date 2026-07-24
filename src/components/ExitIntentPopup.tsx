"use client";

import React, { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";

const LEADS_COLLECTOR_URL =
  "https://wfthvovlhphnrodrqxqt.supabase.co/functions/v1/leads-collector";

export function ExitIntentPopup() {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [contact, setContact] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [hasTriggered, setHasTriggered] = useState(false);

  const isLandingPage = location.pathname === "/";

  useEffect(() => {
    if (import.meta.env.DEV || isLandingPage) return;

    const dismissed = sessionStorage.getItem("bm_exit_dismissed");
    if (dismissed) return;

    const handleMouseLeave = (e: MouseEvent) => {
      if (e.clientY <= 0 && !hasTriggered) {
        setIsOpen(true);
        setHasTriggered(true);
      }
    };

    document.addEventListener("mouseleave", handleMouseLeave);
    return () => document.removeEventListener("mouseleave", handleMouseLeave);
  }, [hasTriggered, isLandingPage]);

  const handleClose = () => {
    setIsOpen(false);
    sessionStorage.setItem("bm_exit_dismissed", "1");
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

  const handleSubmit = () => saveLead("exit-intent");

  const handleWhatsApp = async () => {
    if (contact.trim()) await saveLead("exit-intent-wa");
    const msg = encodeURIComponent(
      "Halo, saya mau minta demo gratis sistem reservasi GoStay.",
    );
    window.open(`https://wa.me/628138053323?text=${msg}`, "_blank");
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl bg-gradient-to-br from-red-600 to-orange-600 p-0 text-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          onClick={handleClose}
          className="absolute right-3 top-3 z-20 rounded-full bg-white/20 p-1.5 hover:bg-white/40 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Decorative */}
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="absolute top-0 left-0 w-20 h-20 bg-white rounded-full -translate-x-10 -translate-y-10" />
          <div className="absolute bottom-0 right-0 w-16 h-16 bg-white rounded-full translate-x-8 translate-y-8" />
        </div>

        <div className="relative z-10 px-6 pt-7 pb-6 space-y-4">
          {isDone ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-2">&#10003;</div>
              <p className="font-semibold">Data tersimpan! Kami segera hubungi kamu.</p>
            </div>
          ) : (
            <>
              <div className="text-center space-y-2">
                <h3 className="text-lg font-bold leading-tight">
                  Tunggu — Sistem Booking Kamu Bisa Lebih Efisien
                </h3>
                <p className="text-sm text-red-100 leading-relaxed">
                  Jangan kehilangan tamu karena booking manual. Tinggalkan WA, kami bantu setup sistem reservasi gratis.
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
                className="w-full rounded-lg bg-white text-red-700 hover:bg-red-50 py-2.5 text-sm font-bold transition-colors disabled:opacity-60"
              >
                {isLoading ? "Mengirim..." : "Minta Demo Gratis"}
              </button>

              <button
                onClick={handleWhatsApp}
                className="w-full text-center text-xs text-white/70 hover:text-white font-medium underline underline-offset-2"
              >
                Chat via WhatsApp
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
