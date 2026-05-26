import React from 'react';
import renderer, { act } from 'react-test-renderer';
import { afterEach, describe, it, expect, jest } from '@jest/globals';
import { Text } from 'react-native';
import { QuickBook } from '../src/components/QuickBook';
import { api } from '../src/api/client';

describe('QuickBook', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

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

    const textNodes = (tree!.root.findAllByType(Text) || [])
      .map((n: any) => n.props.children)
      .flat();

    expect(textNodes).toContain('Court 1');
    expect(textNodes).toContain('Book');
    expect(textNodes).not.toContain('All courts are booked right now.');
  });

  it('skips candidate slots that partially overlap existing bookings', async () => {
    jest.spyOn(Date.prototype, 'getHours').mockReturnValue(8);
    jest.spyOn(Date.prototype, 'getMinutes').mockReturnValue(0);

    jest.spyOn(api, 'get').mockImplementation((endpoint: string) => {
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
          data: {
            bookings: [
              {
                courtId: 'court-1',
                startTime: '09:30:00',
                endTime: '10:00:00',
              },
            ],
          },
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
                openTime: '09:00',
                closeTime: '12:00',
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

    const textNodes = (tree!.root.findAllByType(Text) || [])
      .map((n: any) => n.props.children)
      .flat();
    const joinedText = textNodes.filter(Boolean).join('');

    expect(joinedText).toContain('10:00 AM – 12:00 PM');
    expect(joinedText).not.toContain('9:00 AM – 11:00 AM');
  });
});
