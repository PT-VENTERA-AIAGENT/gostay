import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import WaText from "./WaText";

/** The rendered text with markers interpreted (i.e. what staff should read). */
function textOf(input: string): string {
  const { container } = render(<WaText>{input}</WaText>);
  return container.textContent ?? "";
}

function html(input: string): string {
  const { container } = render(<WaText>{input}</WaText>);
  return container.innerHTML;
}

describe("WaText — whitespace", () => {
  it("keeps the newlines the bot wrote", () => {
    // The bug this fixes: HTML collapsed these and the whole reply arrived as
    // one paragraph, so staff could not see what the guest saw.
    const { container } = render(<WaText>{"Baris satu\nBaris dua"}</WaText>);
    expect(container.textContent).toBe("Baris satu\nBaris dua");
    expect(container.querySelector("p")?.className).toContain("whitespace-pre-wrap");
  });

  it("keeps leading indentation on list items", () => {
    // pre-line would collapse these; WhatsApp does not, so neither do we.
    expect(textOf("*Deluxe*\n    Rp 185.000 / malam")).toBe("Deluxe\n    Rp 185.000 / malam");
  });

  it("renders an empty or missing message without crashing", () => {
    expect(textOf("")).toBe("");
    render(<WaText>{null}</WaText>);
    render(<WaText>{undefined}</WaText>);
  });
});

describe("WaText — WhatsApp markup", () => {
  it("renders *bold* as bold and drops the asterisks", () => {
    expect(html("Halo *Lor Kali*")).toContain("<strong>Lor Kali</strong>");
    expect(textOf("Halo *Lor Kali*")).toBe("Halo Lor Kali");
  });

  it("renders _italic_, ~strike~ and ```mono```", () => {
    expect(html("_miring_")).toContain("<em>miring</em>");
    expect(html("~coret~")).toContain("<s>coret</s>");
    expect(html("```kode```")).toContain("<code");
  });

  it("nests bold inside italic", () => {
    const out = html("*_tebal miring_*");
    expect(out).toContain("<strong>");
    expect(out).toContain("<em>");
  });

  it("leaves a lone asterisk alone", () => {
    // A marker only counts when it hugs its content. "2 * 3" is arithmetic.
    expect(textOf("2 * 3 * 4")).toBe("2 * 3 * 4");
    expect(html("2 * 3 * 4")).not.toContain("<strong>");
  });

  it("does not treat a marker spanning a newline as formatting", () => {
    expect(html("*baris satu\nbaris dua*")).not.toContain("<strong>");
  });

  it("leaves markdown that WhatsApp does not use as literal text", () => {
    // A guest may genuinely type these; they are not syntax here.
    expect(textOf("# Judul")).toBe("# Judul");
    expect(textOf("> kutipan")).toBe("> kutipan");
    expect(textOf("- item")).toBe("- item");
  });
});

describe("WaText — links", () => {
  it("makes a portal link clickable", () => {
    render(<WaText>{"Portal: https://app.gostay.id/portal?hotel=lor-kali"}</WaText>);
    const a = screen.getByRole("link");
    expect(a).toHaveAttribute("href", "https://app.gostay.id/portal?hotel=lor-kali");
    expect(a).toHaveAttribute("rel", expect.stringContaining("noopener"));
    expect(a).toHaveAttribute("target", "_blank");
  });

  it("does not swallow the sentence's punctuation into the URL", () => {
    render(<WaText>{"Lihat https://example.com/a, lalu balas."}</WaText>);
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://example.com/a");
    expect(screen.getByRole("link").textContent).toBe("https://example.com/a");
  });
});

describe("WaText — guest text is never markup", () => {
  it("renders HTML a guest typed as visible text, not as elements", () => {
    // Message bodies are guest-supplied. This is why the component builds React
    // nodes instead of setting innerHTML.
    const input = '<img src=x onerror="alert(1)"> <script>alert(2)</script>';
    const { container } = render(<WaText>{input}</WaText>);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("<img");
    expect(container.textContent).toContain("<script>");
  });

  it("does not build a javascript: link", () => {
    // Only http(s) is matched at all, so this stays plain text.
    const { container } = render(<WaText>{"javascript:alert(1)"}</WaText>);
    expect(container.querySelector("a")).toBeNull();
  });
});

describe("WaText — a real bot reply", () => {
  it("renders the availability answer the way the guest saw it", () => {
    const reply =
      "Ketersediaan kamar di *Lor Kali* untuk malam ini (28 Juli):\n\n" +
      "*Reguler* — Rp 120.000/malam\n" +
      "    ✅ *2* kamar tersedia dari 3\n\n" +
      "Ingin kami pesankan?";

    const { container } = render(<WaText>{reply}</WaText>);

    expect(container.querySelectorAll("strong")).toHaveLength(3);
    expect(container.textContent).toContain("\n\n");
    expect(container.textContent).toContain("    ✅");
    expect(container.textContent).not.toContain("*");
  });
});
