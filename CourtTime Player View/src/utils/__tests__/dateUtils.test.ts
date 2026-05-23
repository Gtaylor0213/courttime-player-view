import { describe, expect, it } from 'vitest';
import {
  normalizeLocalDatetimeForStorage,
  parseLocalDate,
  toDatetimeLocalInput,
} from '../dateUtils';

describe('toDatetimeLocalInput', () => {
  it('formats wall-clock timestamps for datetime-local inputs', () => {
    expect(toDatetimeLocalInput('2026-05-01T08:30:00')).toBe('2026-05-01T08:30');
  });

  it('converts API ISO instants to local wall-clock', () => {
    const iso = '2026-05-01T11:00:00.000Z';
    const expected = parseLocalDate(iso);
    const pad = (n: number) => String(n).padStart(2, '0');
    const expectedInput = `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}T${pad(expected.getHours())}:${pad(expected.getMinutes())}`;
    expect(toDatetimeLocalInput(iso)).toBe(expectedInput);
  });
});

describe('normalizeLocalDatetimeForStorage', () => {
  it('appends seconds for datetime-local values', () => {
    expect(normalizeLocalDatetimeForStorage('2026-05-01T00:00')).toBe('2026-05-01T00:00:00');
  });

  it('converts zoned instants to local wall-clock for TIMESTAMP storage', () => {
    const iso = '2026-05-01T11:00:00.000Z';
    expect(normalizeLocalDatetimeForStorage(iso)).toBe(formatExpectedWallClock(iso));
  });
});

function formatExpectedWallClock(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

describe('parseLocalDate with timezone', () => {
  it('parses ISO zoned strings as instants', () => {
    const iso = '2026-05-01T11:00:00.000Z';
    expect(parseLocalDate(iso).getTime()).toBe(new Date(iso).getTime());
  });
});

describe('parseLocalDate blackout range', () => {
  it('treats date-only start as local midnight', () => {
    const start = parseLocalDate('2026-05-01');
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(4);
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
  });
});
