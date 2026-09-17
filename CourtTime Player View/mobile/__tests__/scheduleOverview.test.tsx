/**
 * Week/month overview. The range maths live in
 * shared/utils/__tests__/scheduleOverview.test.ts; these cover the mobile
 * rendering: what each mode shows, how many days it fetches, and that tapping
 * a day hands the date back so the caller can open its court view.
 */
import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { Text } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

import { api } from '../src/api/client';
import { ScheduleOverview } from '../src/components/ScheduleOverview';

function allText(tree: renderer.ReactTestRenderer): string {
  return tree.root
    .findAllByType(Text)
    .map((n) => {
      const c = n.props.children;
      return Array.isArray(c) ? c.map(String).join('') : String(c ?? '');
    })
    .join(' ')
    .replace(/\s+/g, ' ');
}

function pressA11y(tree: renderer.ReactTestRenderer, label: string) {
  const node = tree.root.findAll(
    (n) => (n.props as { accessibilityLabel?: string })?.accessibilityLabel === label
  )[0];
  if (!node) throw new Error(`no control labelled "${label}"`);
  act(() => {
    (node.props as { onPress?: () => void }).onPress?.();
  });
}

function pressA11yMatching(tree: renderer.ReactTestRenderer, pattern: RegExp) {
  const node = tree.root.findAll((n) =>
    pattern.test((n.props as { accessibilityLabel?: string })?.accessibilityLabel || '')
  )[0];
  if (!node) throw new Error(`no control matching ${pattern}`);
  act(() => {
    (node.props as { onPress?: () => void }).onPress?.();
  });
}

let getSpy: ReturnType<typeof jest.spyOn>;
let onSelectDate: jest.Mock;

/** One booking on 2026-05-06, so a known day has content. */
function mockBookings() {
  getSpy.mockImplementation(async (url: string) => {
    // The range endpoint returns every booking in [startDate, endDate].
    if (url.includes('/range?')) {
      return {
        success: true,
        data: {
          bookings: [
            {
              bookingDate: '2026-05-06',
              startTime: '09:00:00',
              endTime: '10:00:00',
              courtName: 'Court 1',
              bookingType: 'match',
            },
          ],
        },
      };
    }
    return { success: true, data: { bookings: [] } };
  });
}

beforeEach(() => {
  getSpy = jest.spyOn(api, 'get');
  onSelectDate = jest.fn();
  mockBookings();
});

afterEach(() => {
  getSpy.mockRestore();
});

async function render(selectedDate = '2026-05-06') {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {
    tree = renderer.create(
      <ScheduleOverview
        facilityId="facility-1"
        selectedDate={selectedDate}
        onSelectDate={onSelectDate}
      />
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return tree!;
}

describe('ScheduleOverview', () => {
  it('opens on the week containing the selected date and fetches its 7 days', async () => {
    const tree = await render();

    // One range request for the week of Mon 4 May to Sun 10 May.
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith(
      '/api/bookings/facility/facility-1/range?startDate=2026-05-04&endDate=2026-05-10'
    );
    expect(allText(tree)).toContain('May 4 – 10');
  });

  it('shows each day with its bookings', async () => {
    const text = allText(await render());
    expect(text).toContain('9:00 AM · Court 1');
    expect(text).toContain('1 booked');
    // Days without bookings read as open rather than showing nothing.
    expect(text).toContain('Open');
  });

  it('hands the date back when a day is tapped', async () => {
    const tree = await render();
    pressA11yMatching(tree, /^Wednesday, May 6/);
    expect(onSelectDate).toHaveBeenCalledWith('2026-05-06');
  });

  it('switches to the month and fetches every day of it', async () => {
    const tree = await render();
    getSpy.mockClear();

    pressA11y(tree, 'Month view');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // One range request covering all 31 days of May.
    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith(
      '/api/bookings/facility/facility-1/range?startDate=2026-05-01&endDate=2026-05-31'
    );
    expect(allText(tree)).toContain('May 2026');
  });

  it('counts bookings per day in the month grid', async () => {
    const tree = await render();
    pressA11y(tree, 'Month view');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    const day6 = tree.root.findAll((n) =>
      /^May 6, 1 reservation$/.test((n.props as { accessibilityLabel?: string })?.accessibilityLabel || '')
    );
    expect(day6.length).toBeGreaterThan(0);
  });

  it('steps back a week without leaving the current week selected', async () => {
    const tree = await render();

    pressA11y(tree, 'Previous week');
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(allText(tree)).toContain('Apr 27 – May 3');
  });

  it('keeps rendering when the bookings request fails', async () => {
    getSpy.mockResolvedValue({ success: false, error: 'network' } as never);
    const tree = await render();

    // Every day reads as open rather than the view breaking.
    expect(allText(tree)).toContain('Open');
  });
});
