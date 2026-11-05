import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startCalendarAutoRefresh,
  CALENDAR_AUTO_REFRESH_MS,
  CALENDAR_REFOCUS_STALE_MS,
} from '../calendarAutoRefresh';

/** Minimal document/window stand-ins (tests run in Node, no DOM). */
function makeEnv() {
  const listeners: Record<string, Array<() => void>> = {};
  const add = (type: string, fn: any) => { (listeners[type] ||= []).push(fn); };
  const remove = (type: string, fn: any) => {
    listeners[type] = (listeners[type] || []).filter((f) => f !== fn);
  };
  const doc = { visibilityState: 'visible' as DocumentVisibilityState, addEventListener: add, removeEventListener: remove };
  const win = { addEventListener: add, removeEventListener: remove };
  const fire = (type: string) => (listeners[type] || []).forEach((fn) => fn());
  return { doc: doc as any, win: win as any, fire, listeners };
}

describe('startCalendarAutoRefresh', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('polls every 5 minutes while the tab is visible', () => {
    const env = makeEnv();
    const refresh = vi.fn();
    startCalendarAutoRefresh({ refresh, isBusy: () => false, doc: env.doc, win: env.win });

    expect(CALENDAR_AUTO_REFRESH_MS).toBe(5 * 60 * 1000);
    vi.advanceTimersByTime(CALENDAR_AUTO_REFRESH_MS - 1);
    expect(refresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CALENDAR_AUTO_REFRESH_MS * 2);
    expect(refresh).toHaveBeenCalledTimes(3);
  });

  it('does not poll while hidden, and catches up when the tab is shown again', () => {
    const env = makeEnv();
    const refresh = vi.fn();
    startCalendarAutoRefresh({ refresh, isBusy: () => false, doc: env.doc, win: env.win });

    env.doc.visibilityState = 'hidden';
    vi.advanceTimersByTime(CALENDAR_AUTO_REFRESH_MS * 3);
    expect(refresh).not.toHaveBeenCalled();

    env.doc.visibilityState = 'visible';
    env.fire('visibilitychange');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes on focus only when the data is stale', () => {
    const env = makeEnv();
    const refresh = vi.fn();
    startCalendarAutoRefresh({ refresh, isBusy: () => false, doc: env.doc, win: env.win });

    vi.advanceTimersByTime(CALENDAR_REFOCUS_STALE_MS - 1);
    env.fire('focus');
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    env.fire('focus');
    expect(refresh).toHaveBeenCalledTimes(1);
    env.fire('focus'); // just refreshed — no repeat
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('holds a refresh while busy and runs it once the user is done', () => {
    const env = makeEnv();
    const refresh = vi.fn();
    let busy = true;
    const handle = startCalendarAutoRefresh({ refresh, isBusy: () => busy, doc: env.doc, win: env.win });

    vi.advanceTimersByTime(CALENDAR_AUTO_REFRESH_MS);
    expect(refresh).not.toHaveBeenCalled();
    handle.flushPending(); // still busy
    expect(refresh).not.toHaveBeenCalled();

    busy = false;
    handle.flushPending();
    expect(refresh).toHaveBeenCalledTimes(1);
    handle.flushPending(); // nothing owed any more
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('flushPending does nothing when no refresh was skipped', () => {
    const env = makeEnv();
    const refresh = vi.fn();
    const handle = startCalendarAutoRefresh({ refresh, isBusy: () => false, doc: env.doc, win: env.win });
    handle.flushPending();
    expect(refresh).not.toHaveBeenCalled();
  });

  it('stop() clears the timer and listeners', () => {
    const env = makeEnv();
    const refresh = vi.fn();
    const handle = startCalendarAutoRefresh({ refresh, isBusy: () => false, doc: env.doc, win: env.win });
    handle.stop();

    vi.advanceTimersByTime(CALENDAR_AUTO_REFRESH_MS * 2);
    env.fire('focus');
    env.fire('visibilitychange');
    expect(refresh).not.toHaveBeenCalled();
    expect(env.listeners.focus).toHaveLength(0);
    expect(env.listeners.visibilitychange).toHaveLength(0);
  });
});
