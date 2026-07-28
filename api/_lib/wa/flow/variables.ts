// {{variable}} interpolation for flow text.
//
// The values come from two places: facts the engine seeds every run with
// (hotel_name, guest_name, room_number, is_inhouse) and whatever `ask` nodes
// have gathered so far. Both live in one flat string map, so a hotel writing
// "Halo {{guest_name}}" does not need to know which is which.

/** Longest-plausible variable name; anything else is left as literal text. */
const TOKEN = /\{\{\s*([a-zA-Z0-9_]{1,64})\s*\}\}/g;

/**
 * Replace every {{token}} in `text` with its value.
 *
 * An unknown token renders as an EMPTY string rather than being left visible.
 * A guest seeing a raw "{{guest_name}}" in a WhatsApp message reads as broken
 * software; a missing name reads as a slightly terse greeting. The surrounding
 * whitespace is then collapsed so "Halo {{guest_name}}," does not become
 * "Halo ," when the name is unknown.
 */
export function interpolate(text: string, vars: Record<string, string>): string {
  if (!text) return "";
  const filled = text.replace(TOKEN, (_m, key: string) => {
    const v = vars[key];
    return typeof v === "string" ? v : "";
  });
  // Tidy the holes an empty substitution leaves: doubled spaces, and a space
  // stranded before a comma / full stop.
  return filled
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.!?])/g, "$1")
    .replace(/[ \t]+$/gm, "");
}
