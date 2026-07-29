import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/lib/i18n";
import GlobalSearch from "./GlobalSearch";

// This component renders in the top bar of every route, so anything that throws
// here takes down the whole app rather than one page. That is not hypothetical:
// an i18n sweep added t("Search room, guest, book…") without a `useT()` call and
// app.gostay.id served ReferenceError: t is not defined on every URL, login
// included.
//
// Three things that should have caught it did not. `tsc` passed, because line 29
// holds `const t = e.target` inside a keydown handler and the name resolved to
// something. A grep for `t("` matched `useState("")` in nearly every React file,
// so the one real break was indistinguishable from 21 false positives. And no
// test rendered this component at all — which is the gap this file closes.
//
// The assertions below are deliberately shallow. The point is not what the
// component displays; it is that mounting it does not throw.

vi.mock("@/services/bookingService", () => ({
  getBookings: vi.fn(async () => []),
  searchCustomers: vi.fn(async () => []),
}));

vi.mock("@/hooks/useRooms", () => ({
  useRooms: () => ({ data: [] }),
  useRoomTypes: () => ({ data: [] }),
}));

function mount() {
  // retry:false so a rejected query surfaces immediately instead of being
  // swallowed by backoff and passing the test for the wrong reason.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LanguageProvider>
        <MemoryRouter>
          <GlobalSearch />
        </MemoryRouter>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

describe("GlobalSearch", () => {
  it("mounts without throwing", () => {
    expect(() => mount()).not.toThrow();
  });

  it("shows its placeholder translated, not the English source", () => {
    // Two failures in one assertion. A bare t() throws during render, so
    // reaching this line at all proves the binding. And asserting the
    // Indonesian text — the default language — proves t() is doing its job
    // rather than falling through to the untranslated source, which is the whole
    // point of the sweep and would otherwise pass unnoticed.
    mount();
    expect(screen.getByText("Cari kamar, tamu, pemesanan…")).toBeTruthy();
    expect(screen.queryByText(/Search room, guest, book/i)).toBeNull();
  });

  it("survives a keypress on the document", () => {
    // The "/" shortcut runs a handler with its own local `t`, which is what let
    // the broken build typecheck. Exercise it so that path is covered too.
    mount();
    expect(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "/" }));
    }).not.toThrow();
  });
});
