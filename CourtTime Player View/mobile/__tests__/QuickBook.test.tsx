import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { describe, it, expect, jest } from '@jest/globals';
import { QuickBook } from '../src/components/QuickBook';
import { api } from '../src/api/client';

describe('QuickBook', () => {
  it('renders an available quick-book slot when availability exists', async () => {
    const getSpy = jest.spyOn(api, 'get').mockImplementation((endpoint: string) => {
      if (endpoint.startsWith('/api/facilities/facility-1/courts')) {
        return Promise.resolve({
          success: true,
          data: {
            courts: [
              { id: 'court-1', name: 'Court 1', status: 'available', isWalkUp: false },
            ],
          },
        });
      }
      if (endpoint.startsWith('/api/bookings/facility/facility-1')) {
        return Promise.resolve({
          success: true,
          data: { bookings: [] },
        });
      }
      if (endpoint.startsWith('/api/court-config/facility/facility-1')) {
        return Promise.resolve({
          success: true,
          data: {
            courtConfigs: [
              {
                courtId: 'court-1',
                isOpen: true,
                openTime: '00:00',
                closeTime: '23:59',
                slotDuration: 30,
              },
            ],
          },
        });
      }
      return Promise.resolve({ success: false, error: 'Unexpected endpoint' });
    });

    let tree: renderer.ReactTestRenderer;
    await act(async () => {
      tree = renderer.create(
        <QuickBook
          userId="user-1"
          facilityId="facility-1"
          refreshKey={0}
          onBooked={() => {}}
          onRuleViolations={() => {}}
        />
      );
      await Promise.resolve();
    });

    const textNodes = (tree!.root.findAllByType('Text') || [])
      .map((n: any) => n.props.children)
      .flat();

    expect(textNodes).toContain('Court 1');
    expect(textNodes).toContain('Book');
    expect(textNodes).not.toContain('All courts are booked right now.');
    getSpy.mockRestore();
  });
});
