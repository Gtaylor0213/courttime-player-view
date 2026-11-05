/**
 * Background refresh for the website's court calendar, so a screen left open
 * (e.g. a monitor in a club office) picks up reservations added, changed or
 * removed elsewhere without a manual page reload.
 *
 * - Polls every `intervalMs` while the tab is visible; hidden tabs don't poll.
 * - Refreshes when the tab becomes visible / focused again if the data is stale
 *   (a sleeping laptop can miss timer ticks entirely).
 * - Never refreshes while `isBusy()` says someone is mid-interaction (a modal,
 *   a drag); the skipped refresh runs from `flushPending()` once they finish.
 */

export const CALENDAR_AUTO_REFRESH_MS = 5 * 60 * 1000;
/** Returning to the tab only re-fetches if the last refresh is at least this old. */
export const CALENDAR_REFOCUS_STALE_MS = 30 * 1000;

type VisibilityDoc = Pick<Document, 'visibilityState' | 'addEventListener' | 'removeEventListener'>;
type FocusWin = Pick<Window, 'addEventListener' | 'removeEventListener'>;

export interface CalendarAutoRefreshOptions {
  refresh: () => void;
  isBusy: () => boolean;
  intervalMs?: number;
  refocusStaleMs?: number;
  doc?: VisibilityDoc;
  win?: FocusWin;
}

export interface CalendarAutoRefreshHandle {
  /** Run a refresh that was skipped while busy or hidden, if one is owed. */
  flushPending: () => void;
  stop: () => void;
}

export function startCalendarAutoRefresh(options: CalendarAutoRefreshOptions): CalendarAutoRefreshHandle {
  const {
    refresh,
    isBusy,
    intervalMs = CALENDAR_AUTO_REFRESH_MS,
    refocusStaleMs = CALENDAR_REFOCUS_STALE_MS,
    doc = document,
    win = window,
  } = options;

  // The calendar has just loaded its data when this starts.
  let lastRefreshAt = Date.now();
  let pending = false;

  const isHidden = () => doc.visibilityState === 'hidden';

  const attempt = () => {
    if (isHidden() || isBusy()) {
      pending = true;
      return;
    }
    pending = false;
    lastRefreshAt = Date.now();
    refresh();
  };

  const interval = setInterval(attempt, intervalMs);

  const handleVisibleOrFocused = () => {
    if (isHidden()) return;
    if (pending || Date.now() - lastRefreshAt >= refocusStaleMs) attempt();
  };
  doc.addEventListener('visibilitychange', handleVisibleOrFocused);
  win.addEventListener('focus', handleVisibleOrFocused);

  return {
    flushPending: () => {
      if (pending) attempt();
    },
    stop: () => {
      clearInterval(interval);
      doc.removeEventListener('visibilitychange', handleVisibleOrFocused);
      win.removeEventListener('focus', handleVisibleOrFocused);
    },
  };
}
