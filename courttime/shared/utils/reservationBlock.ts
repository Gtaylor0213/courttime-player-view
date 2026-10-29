/**
 * What a reservation block on the court calendar says and how much of it fits.
 *
 * The web calendar (src/components/CourtCalendarView.tsx) and the app calendar
 * (mobile/src/components/CourtCalendarGrid.tsx) both draw their blocks from
 * these, so the two show the same words in the same order.
 */
import { BULLETIN_ACTIVITY_BOOKING_TYPES } from './bulletinPostDisplay';

/** Each line of a block at text scale 1: font size, the height it budgets, and its opacity over the block's text color. */
export const RESERVATION_BLOCK_TEXT = {
  name: { fontSize: 11, lineHeight: 14 },
  type: { fontSize: 10, lineHeight: 13, opacity: 0.8 },
  duration: { fontSize: 9, rowHeight: 15, opacity: 0.75 },
  notes: { fontSize: 9, rowHeight: 15, opacity: 0.7, maxChars: 30 },
  /** px-1.5 py-0.5 */
  paddingX: 6,
  paddingY: 2,
} as const;

/** Headline of a reservation block: a bulletin activity's title (kept in notes), else who booked it. */
export function reservationBlockName(booking: {
  bookingType?: string | null;
  notes?: string | null;
  walkInName?: string | null;
  userName?: string | null;
}): string {
  if (BULLETIN_ACTIVITY_BOOKING_TYPES.has(String(booking.bookingType || '').toLowerCase()) && booking.notes) {
    return String(booking.notes);
  }
  return booking.walkInName || booking.userName || 'Reserved';
}

/** Duration line of a reservation block, e.g. "120min". */
export function reservationBlockDuration(durationMinutes: number | string | null | undefined): string {
  return `${durationMinutes}min`;
}

/** "9:30 AM" from minutes-since-midnight (1440 reads as midnight). */
function formatMinutesAs12h(totalMinutes: number): string {
  const hours24 = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  const period = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

/** Duration line of a blackout block, e.g. "8:00 AM – 10:00 AM". */
export function blackoutBlockTimeRange(startMinutes: number, endMinutes: number): string {
  return `${formatMinutesAs12h(startMinutes)} – ${formatMinutesAs12h(endMinutes)}`;
}

/** Notes line of a reservation block, cut to fit one line. */
export function reservationBlockNotes(notes: string): string {
  const max = RESERVATION_BLOCK_TEXT.notes.maxChars;
  return notes.length > max ? `${notes.substring(0, max)}...` : notes;
}

/** Rough line count for `text` greedy-wrapped at `charsPerLine` (long words break mid-word). */
export function estimateWrappedLines(text: string, charsPerLine: number): number {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;
  let lines = 1;
  let lineLength = 0;
  for (const word of words) {
    if (lineLength > 0 && lineLength + 1 + word.length <= charsPerLine) {
      lineLength += 1 + word.length;
      continue;
    }
    if (lineLength > 0) lines += 1;
    lines += Math.ceil(word.length / charsPerLine) - 1;
    lineLength = word.length % charsPerLine || charsPerLine;
  }
  return lines;
}

export interface ReservationBlockLayout {
  nameMaxLines: number;
  showTypeFull: boolean;
  typeMaxLines: number;
  showDurationRow: boolean;
  /** Compact type badge beside the duration, used only when the full type line didn't fit. */
  showCategoryBadge: boolean;
  showNotes: boolean;
  /** Only the name fits: center it vertically. */
  isCompact: boolean;
}

/**
 * Vertical-space budget for a block: name gets priority, then the full type line, then the
 * duration row, then notes, each only if the remaining height allows it. Name and type wrap
 * onto as many lines as they're estimated to need (up to what the block can hold).
 */
export function layoutReservationBlock(opts: {
  name: string;
  typeLabel: string | null;
  /** Blocked related court or blackout: never shows a badge or notes. */
  isBlocked: boolean;
  hasBookingType: boolean;
  hasNotes: boolean;
  /** Block size in px, border included. */
  width: number;
  height: number;
  textScale?: number;
}): ReservationBlockLayout {
  const scale = opts.textScale ?? 1;
  const t = RESERVATION_BLOCK_TEXT;
  const contentWidth = Math.max(opts.width - 2 * t.paddingX, 0);
  const nameCharsPerLine = Math.max(1, Math.floor(contentWidth / (6.4 * scale)));
  const typeCharsPerLine = Math.max(1, Math.floor(contentWidth / (5.6 * scale)));
  const nameLinesNeeded = estimateWrappedLines(opts.name, nameCharsPerLine);
  const typeLinesNeeded = opts.typeLabel ? estimateWrappedLines(opts.typeLabel, typeCharsPerLine) : 0;

  const nameLineHeight = t.name.lineHeight * scale;
  const typeLineHeight = t.type.lineHeight * scale;
  const durationRowHeight = t.duration.rowHeight * scale;
  const notesRowHeight = t.notes.rowHeight * scale;

  let remaining = Math.max(opts.height - 2 * t.paddingY, 0);
  // The name may use every line the block has; the estimate only decides what's left below it.
  const nameMaxLines = Math.max(1, Math.floor(remaining / nameLineHeight));
  remaining -= nameLineHeight * Math.min(nameLinesNeeded, nameMaxLines);

  const showTypeFull = !!opts.typeLabel && remaining >= typeLineHeight;
  const typeMaxLines = Math.max(1, Math.floor(remaining / typeLineHeight));
  if (showTypeFull) remaining -= typeLineHeight * Math.min(typeLinesNeeded, typeMaxLines);

  const showDurationRow = remaining >= durationRowHeight;
  if (showDurationRow) remaining -= durationRowHeight;
  const showCategoryBadge =
    showDurationRow && !opts.isBlocked && !showTypeFull && opts.hasBookingType && opts.width >= 70;

  const showNotes = !opts.isBlocked && opts.hasNotes && remaining >= notesRowHeight;
  return {
    nameMaxLines,
    showTypeFull,
    typeMaxLines,
    showDurationRow,
    showCategoryBadge,
    showNotes,
    isCompact: !showDurationRow,
  };
}
