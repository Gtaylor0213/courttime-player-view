import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { describe, it, expect, jest, afterEach } from '@jest/globals';
import { Text } from 'react-native';
import { CourtCalendarGrid } from '../src/components/CourtCalendarGrid';
import { api } from '../src/api/client';

describe('CourtCalendarGrid', () => {
  it('renders court columns when facility has courts', async () => {
    const getSpy = jest.spyOn(api, 'get').mockImplementation((endpoint: string) => {
      if (endpoint.startsWith('/api/bookings/facility/')) {
        return Promise.resolve({
          success: true,
          data: { bookings: [] },
        });
      }
      if (endpoint.startsWith('/api/court-config/facility/')) {
        return Promise.resolve({
          success: true,
          data: {
            courtConfigs: [
              { courtId: 'court-1', isOpen: true, openTime: '06:00', closeTime: '22:00' },
              { courtId: 'court-2', isOpen: true, openTime: '06:00', closeTime: '22:00' },
            ],
          },
        });
      }
      return Promise.resolve({ success: false, error: 'Unexpected endpoint' });
    });

    const courts = [
      { id: 'court-1', name: 'Court 1' },
      { id: 'court-2', name: 'Court 2' },
    ] as any;

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <CourtCalendarGrid
          courts={courts}
          selectedDate="2026-05-04"
          facilityId="facility-1"
          onBookingSelected={() => {}}
        />
      );
      await Promise.resolve();
    });

    const textNodes = (tree!.root.findAllByType(Text) || []).map((n: any) => n.props.children).flat();
    expect(textNodes).toContain('Court 1');
    expect(textNodes).toContain('Court 2');
    expect(textNodes).not.toContain('No courts available');
    getSpy.mockRestore();
  });

  /**
   * Web's booking wizard opens a new reservation at two hours. Mobile used to
   * hand back a single 30-minute row on tap, so the same action produced a
   * different booking length on each client.
   */
  it('requests the default two-hour duration when a single slot is tapped', async () => {
    const getSpy = jest.spyOn(api, 'get').mockImplementation((endpoint: string) => {
      if (endpoint.startsWith('/api/bookings/facility/')) {
        return Promise.resolve({ success: true, data: { bookings: [] } });
      }
      if (endpoint.startsWith('/api/court-config/facility/')) {
        return Promise.resolve({
          success: true,
          data: {
            courtConfigs: [{ courtId: 'court-1', isOpen: true, openTime: '06:00', closeTime: '22:00' }],
          },
        });
      }
      return Promise.resolve({ success: false, error: 'Unexpected endpoint' });
    });

    const onBookingSelected = jest.fn() as unknown as jest.Mock & ((c: unknown, s: string, e: string) => void);
    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <CourtCalendarGrid
          courts={[{ id: 'court-1', name: 'Court 1' }] as any}
          selectedDate="2026-05-04"
          facilityId="facility-1"
          onBookingSelected={onBookingSelected}
        />
      );
      await Promise.resolve();
    });

    // The accessibility action is the tap path that does not depend on gestures.
    const slots = tree!.root.findAll(
      (n: any) => typeof n.props?.onAccessibilityAction === 'function'
    );
    expect(slots.length).toBeGreaterThan(0);
    await act(async () => {
      (slots[0].props as any).onAccessibilityAction();
    });

    expect(onBookingSelected).toHaveBeenCalledTimes(1);
    const [, startTime, endTime] = onBookingSelected.mock.calls[0] as [unknown, string, string];
    const toMinutes = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };
    expect(toMinutes(endTime) - toMinutes(startTime)).toBe(120);

    getSpy.mockRestore();
  });

  /**
   * Touch handling on a free cell: a quick tap books, a touch that travels is a
   * scroll, and a hold arms drag-select so the drag extends the booking.
   */
  describe('cell touches', () => {
    const touch = (pageY: number) => ({ nativeEvent: { pageX: 100, pageY, locationY: 10 } });

    async function renderFutureDay(onBookingSelected: (c: unknown, s: string, e: string) => void) {
      jest.spyOn(api, 'get').mockImplementation((endpoint: string) => {
        if (endpoint.startsWith('/api/bookings/facility/')) {
          return Promise.resolve({ success: true, data: { bookings: [] } });
        }
        if (endpoint.startsWith('/api/court-config/facility/')) {
          return Promise.resolve({
            success: true,
            data: { courtConfigs: [{ courtId: 'court-1', isOpen: true, openTime: '06:00', closeTime: '22:00' }] },
          });
        }
        return Promise.resolve({ success: false, error: 'Unexpected endpoint' });
      });
      let tree: renderer.ReactTestRenderer;
      await act(async () => {
        tree = renderer.create(
          <CourtCalendarGrid
            courts={[{ id: 'court-1', name: 'Court 1' }] as any}
            selectedDate="2099-01-05"
            facilityId="facility-1"
            onBookingSelected={onBookingSelected}
          />
        );
        await Promise.resolve();
      });
      const cell = tree!.root.findAll(
        (n: any) => typeof n.props?.onTouchStart === 'function' && typeof n.props?.onAccessibilityAction === 'function'
      )[0];
      return cell.props as any;
    }

    afterEach(() => {
      jest.useRealTimers();
      jest.restoreAllMocks();
    });

    it('books the slot on a quick tap', async () => {
      const onBookingSelected = jest.fn();
      const cell = await renderFutureDay(onBookingSelected);
      await act(async () => {
        cell.onTouchStart(touch(200));
        cell.onTouchEnd(touch(200));
      });
      expect(onBookingSelected).toHaveBeenCalledTimes(1);
      expect((onBookingSelected.mock.calls[0] as unknown[])[1]).toBe('06:00:00');
    });

    it('does not book when the finger travels (a scroll) or the touch is cancelled', async () => {
      const onBookingSelected = jest.fn();
      const cell = await renderFutureDay(onBookingSelected);
      await act(async () => {
        cell.onTouchStart(touch(200));
        cell.onTouchMove(touch(230));
        cell.onTouchEnd(touch(230));
        cell.onTouchStart(touch(200));
        cell.onTouchCancel(touch(200));
      });
      expect(onBookingSelected).not.toHaveBeenCalled();
    });

    it('extends the booking when held then dragged down the column', async () => {
      const onBookingSelected = jest.fn();
      const cell = await renderFutureDay(onBookingSelected);
      jest.useFakeTimers();
      await act(async () => {
        cell.onTouchStart(touch(200));
        jest.advanceTimersByTime(250);
      });
      await act(async () => {
        // 10px into the first 48px row, +100px lands in the third row: 06:00 to 07:30.
        cell.onTouchMove(touch(300));
        cell.onTouchEnd(touch(300));
      });
      expect(onBookingSelected).toHaveBeenCalledTimes(1);
      const [, startTime, endTime] = onBookingSelected.mock.calls[0] as [unknown, string, string];
      expect(startTime).toBe('06:00:00');
      expect(endTime).toBe('07:30:00');
    });
  });
});
