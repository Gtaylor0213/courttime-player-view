import { useCallback, useState } from 'react';

/**
 * Size of the name and details printed on reservation blocks in the court calendar,
 * as a multiplier of the default. Only those blocks use it — the rest of the page is untouched.
 * Saved per browser so the preference sticks between visits.
 */
export const RESERVATION_TEXT_SCALE_MIN = 0.85;
export const RESERVATION_TEXT_SCALE_MAX = 1.75;
export const RESERVATION_TEXT_SCALE_STEP = 0.05;

const STORAGE_KEY = 'courttime:reservationTextScale';

function clampScale(value: number): number {
  if (!Number.isFinite(value)) return 1;
  const stepped = Math.round(value / RESERVATION_TEXT_SCALE_STEP) * RESERVATION_TEXT_SCALE_STEP;
  return Math.min(RESERVATION_TEXT_SCALE_MAX, Math.max(RESERVATION_TEXT_SCALE_MIN, Number(stepped.toFixed(2))));
}

function readStoredScale(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? 1 : clampScale(parseFloat(raw));
  } catch {
    return 1;
  }
}

export function useReservationTextScale() {
  const [textScale, setTextScaleState] = useState(readStoredScale);

  const setTextScale = useCallback((next: number) => {
    const scale = clampScale(next);
    setTextScaleState(scale);
    try {
      if (scale === 1) localStorage.removeItem(STORAGE_KEY);
      else localStorage.setItem(STORAGE_KEY, String(scale));
    } catch {
      // Storage unavailable (private mode) — the size still applies for this visit.
    }
  }, []);

  return { textScale, setTextScale };
}
