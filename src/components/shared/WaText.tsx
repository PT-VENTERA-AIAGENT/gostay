import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Render a WhatsApp message the way WhatsApp renders it.
 *
 * The bot composes replies with real formatting — blank lines between sections,
 * indented list items, *bold* prices. The staff inbox was printing the raw
 * string into a <p>, so HTML collapsed every newline and run of spaces and the
 * whole reply arrived as one paragraph with stray asterisks in it:
 *
 *   *Lor Kali* Halo! Ada yang bisa kami bantu? 1. Pesan kamar 2. Lihat kamar…
 *
 * Staff reading that cannot tell what the guest actually saw, which is the one
 * thing the inbox exists for. Two fixes, both needed: preserve the whitespace,
 * and interpret the markers instead of showing them.
 *
 * ─── Deliberately not a markdown library ────────────────────────────────────
 * WhatsApp's syntax is not markdown. `_italic_` needs no spaces around it,
 * `*bold*` is a single asterisk, `~strike~` exists, and `#` or `>` are literal
 * characters a guest may well type. A markdown renderer gets all of that wrong,
 * and pulls in a dependency to do it. This is a five-token parser instead.
 *
 * No dangerouslySetInnerHTML anywhere: message text is guest-supplied, and the
 * output here is React nodes, so markup a guest types is text and stays text.
 */

const TOKEN_SOURCE = [
  "```([\\s\\S]+?)```",          // monospace block
  "\\*(\\S(?:[^*\\n]*\\S)?)\\*", // *bold*
  "_(\\S(?:[^_\\n]*\\S)?)_",     // _italic_
  "~(\\S(?:[^~\\n]*\\S)?)~",     // ~strikethrough~
  "(https?://[^\\s<>\"]+)",      // a link
].join("|");

/**
 * A FRESH regex per call, never a shared module-level one.
 *
 * parse() recurses (bold inside italic), and a /g regex carries mutable
 * `lastIndex`. Sharing one instance means the inner call rewinds the outer
 * call's cursor, so the outer loop re-matches the same token forever — it hung
 * the test runner until it ran out of heap rather than failing an assertion.
 */
function tokenRe(): RegExp {
  return new RegExp(TOKEN_SOURCE, "g");
}

/**
 * Markers only count when they hug their content — WhatsApp does not bold
 * "2 * 3 * 4", and neither do we. That rule lives in the regex above (`\S` on
 * both ends); this guard stops runaway recursion on pathological input.
 */
const MAX_DEPTH = 3;

function parse(text: string, depth = 0): ReactNode[] {
  if (depth >= MAX_DEPTH) return [text];

  const out: ReactNode[] = [];
  let last = 0;
  let key = 0;

  const re = tokenRe();
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const [, mono, bold, italic, strike, url] = m;

    if (mono !== undefined) {
      out.push(
        <code key={key++} className="rounded bg-black/10 px-1 font-mono text-[0.9em]">
          {mono}
        </code>,
      );
    } else if (bold !== undefined) {
      out.push(<strong key={key++}>{parse(bold, depth + 1)}</strong>);
    } else if (italic !== undefined) {
      out.push(<em key={key++}>{parse(italic, depth + 1)}</em>);
    } else if (strike !== undefined) {
      out.push(<s key={key++}>{parse(strike, depth + 1)}</s>);
    } else if (url !== undefined) {
      // Trailing punctuation is almost always the sentence's, not the URL's.
      const trimmed = url.replace(/[.,;:!?)\]]+$/, "");
      out.push(
        <a
          key={key++}
          href={trimmed}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:opacity-80"
        >
          {trimmed}
        </a>,
      );
      if (trimmed.length < url.length) out.push(url.slice(trimmed.length));
    }
    last = m.index + m[0].length;
  }

  if (last < text.length) out.push(text.slice(last));
  return out;
}

export default function WaText({
  children,
  className,
}: {
  children: string | null | undefined;
  className?: string;
}) {
  const text = children ?? "";
  return (
    <p
      className={cn(
        // pre-wrap, not pre-line: the bot indents list items with leading
        // spaces and WhatsApp keeps them, so collapsing them here would show
        // staff something the guest never saw.
        "whitespace-pre-wrap break-words text-sm",
        className,
      )}
    >
      {parse(text).map((node, i) => (
        <Fragment key={i}>{node}</Fragment>
      ))}
    </p>
  );
}
