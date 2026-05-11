import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { describe, it, expect, jest } from '@jest/globals';
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
});
