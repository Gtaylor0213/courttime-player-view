import { describe, expect, it } from 'vitest';
import { planSplitCourtChanges } from '../courtService';

/**
 * Deleting a court deletes its bookings. Saving a split court must therefore keep the halves
 * that are still wanted instead of dropping and recreating them.
 */
describe('planSplitCourtChanges', () => {
  const children = [
    { id: 'a', name: 'Court 3a' },
    { id: 'b', name: 'Court 3b' },
  ];

  it('changes nothing when the wanted halves already exist', () => {
    expect(planSplitCourtChanges(children, ['3a', '3b'])).toEqual({ keepIds: ['a', 'b'], removeIds: [], addSplitNames: [] });
  });

  it('matches names regardless of case and spacing', () => {
    expect(planSplitCourtChanges(children, [' 3A', '3B '])).toEqual({ keepIds: ['a', 'b'], removeIds: [], addSplitNames: [] });
  });

  it('adds and removes only the halves that changed', () => {
    expect(planSplitCourtChanges(children, ['3a', '3c'])).toEqual({ keepIds: ['a'], removeIds: ['b'], addSplitNames: ['3c'] });
  });

  it('removes every half when the split is turned off', () => {
    expect(planSplitCourtChanges(children, [])).toEqual({ keepIds: [], removeIds: ['a', 'b'], addSplitNames: [] });
  });

  it('adds every half for a court that was not split', () => {
    expect(planSplitCourtChanges([], ['1a', '1b'])).toEqual({ keepIds: [], removeIds: [], addSplitNames: ['1a', '1b'] });
  });
});
