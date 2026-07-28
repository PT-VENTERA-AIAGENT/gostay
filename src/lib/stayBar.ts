// Where a stay's bar sits on the room calendar.
//
// Extracted from BookingCalendar so the geometry can be tested. It is small, but
// it encodes a hotel convention that is easy to get subtly wrong and hard to
// notice — the first version filled whole day cells, which read as "this room is
// occupied all of the check-out day" and, worse, "this room is free all of it".
//
// ─── Why half a cell ─────────────────────────────────────────────────────────
// A night is not a day. A guest arrives on the afternoon of the check-in date
// and leaves on the morning of the check-out date, so the SAME calendar day can
// belong to two bookings: one ending, one starting. Drawing bars edge-to-edge
// makes those two indistinguishable from a double-booking, and makes the
// check-out day look completely free when housekeeping has not even been in yet.
//
// Shifting both ends half a cell to the right fixes both readings at once:
//
//   day:      27        28        29        30
//           |─────────|─────────|─────────|─────────|
//   before  [████████████████████████████]              ← 30 looks free
//   after        [████████████████████████████]         ← ends midday 30
//                                          ↑ a new stay starting on the 30th
//                                            begins here, visibly after
//
// The WIDTH is unchanged — both ends move together — so the bar still spans
// exactly as many cells as there are nights. Only its origin moves.

export interface StayBar {
  /** Pixels from the left edge of the first visible day column. */
  left: number;
  width: number;
}

export interface StayBarInput {
  /** Whole days from the first visible column to the check-in date. May be negative. */
  startOffset: number;
  /** Whole days from the first visible column to the check-out date. */
  endOffset: number;
  cellWidth: number;
  /** How many day columns are visible, so a stay running off the edge is clipped. */
  numDays: number;
  /** Horizontal breathing room so touching bars do not merge visually. */
  gap?: number;
}

/**
 * The bar for one stay, or null when it falls entirely outside the view.
 *
 * Clipping happens BEFORE the half-cell shift so a stay that began before the
 * visible range still starts flush at the left edge — its arrival is off-screen,
 * and pretending it arrived at midday of the first visible column would be a
 * lie the calendar cannot support.
 */
export function stayBar(input: StayBarInput): StayBar | null {
  const { cellWidth, numDays, gap = 2 } = input;

  const clippedStart = Math.max(0, input.startOffset);
  const clippedEnd = Math.min(numDays, input.endOffset);
  const spanCells = clippedEnd - clippedStart;
  if (spanCells <= 0) return null;

  // Only shift the start when the real check-in is visible. A stay clipped at
  // the left edge keeps its flush origin (see the note above).
  const arrivesInView = input.startOffset >= 0;
  const shift = arrivesInView ? cellWidth / 2 : 0;

  // The trailing half-cell may run past the last column when a stay ends on the
  // day after the visible range; clamp so it never overflows the grid.
  const maxRight = numDays * cellWidth;
  const rawLeft = clippedStart * cellWidth + shift;
  const rawRight = Math.min(maxRight, clippedEnd * cellWidth + cellWidth / 2);

  const left = rawLeft + gap;
  const width = rawRight - rawLeft - gap * 2;
  if (width <= 0) return null;

  return { left, width };
}
