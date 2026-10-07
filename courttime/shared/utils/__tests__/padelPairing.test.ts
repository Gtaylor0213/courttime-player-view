import { describe, expect, it } from 'vitest';
import {
  americanoCyclePos,
  americanoPairingForCyclePos,
  assignAmericanoGroups,
  mexicanoGroupsAndPairings,
  rankPlayersForMexicano,
  shouldReshuffleAmericanoGroups,
} from '../padelPairing';

// Deterministic "random" for reproducible tests.
function fixedRandom(sequence: number[]): () => number {
  let i = 0;
  return () => sequence[(i += 1) - 1] ?? 0.5;
}

describe('assignAmericanoGroups', () => {
  it('assigns every player exactly one slot 1-4 per group of 4', () => {
    const players = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const assignments = assignAmericanoGroups(players, fixedRandom([0.1, 0.9, 0.3, 0.7]));

    expect(assignments).toHaveLength(8);
    expect(new Set(assignments.map(a => a.userId))).toEqual(new Set(players));

    const byCourt = new Map<number, typeof assignments>();
    for (const a of assignments) {
      byCourt.set(a.courtIndex, [...(byCourt.get(a.courtIndex) ?? []), a]);
    }
    expect(byCourt.size).toBe(2);
    for (const groupAssignments of byCourt.values()) {
      expect(groupAssignments).toHaveLength(4);
      expect(new Set(groupAssignments.map(a => a.slot))).toEqual(new Set([1, 2, 3, 4]));
    }
  });

  it('rejects player counts that are not a multiple of 4', () => {
    expect(() => assignAmericanoGroups(['a', 'b', 'c'])).toThrow(/multiple of 4/);
    expect(() => assignAmericanoGroups([])).toThrow(/multiple of 4/);
  });
});

describe('americanoPairingForCyclePos / americanoCyclePos', () => {
  it('covers all 3 distinct partner pairings with no repeats across a cycle', () => {
    const pairings = [0, 1, 2].map(pos => americanoPairingForCyclePos(pos as 0 | 1 | 2));
    const partnerPairs = pairings.flatMap(p => [
      [...p.team1].sort().join('-'),
      [...p.team2].sort().join('-'),
    ]);
    expect(new Set(partnerPairs).size).toBe(6); // 3 rounds x 2 teams, all distinct
    // every player (1-4) appears exactly 3 times as a partner across the cycle
    const allSlots = pairings.flatMap(p => [...p.team1, ...p.team2]);
    for (const slot of [1, 2, 3, 4]) {
      expect(allSlots.filter(s => s === slot)).toHaveLength(3);
    }
  });

  it('maps round numbers to the correct cycle position', () => {
    expect(americanoCyclePos(1)).toBe(0);
    expect(americanoCyclePos(2)).toBe(1);
    expect(americanoCyclePos(3)).toBe(2);
    expect(americanoCyclePos(4)).toBe(0);
    expect(americanoCyclePos(7)).toBe(0);
  });

  it('rejects invalid round numbers', () => {
    expect(() => americanoCyclePos(0)).toThrow();
    expect(() => americanoCyclePos(-1)).toThrow();
    expect(() => americanoCyclePos(1.5)).toThrow();
  });
});

describe('shouldReshuffleAmericanoGroups', () => {
  it('reshuffles only at the start of a new cycle after the first', () => {
    expect(shouldReshuffleAmericanoGroups(1)).toBe(false);
    expect(shouldReshuffleAmericanoGroups(2)).toBe(false);
    expect(shouldReshuffleAmericanoGroups(3)).toBe(false);
    expect(shouldReshuffleAmericanoGroups(4)).toBe(true);
    expect(shouldReshuffleAmericanoGroups(5)).toBe(false);
    expect(shouldReshuffleAmericanoGroups(7)).toBe(true);
  });
});

describe('rankPlayersForMexicano', () => {
  it('ranks by points descending', () => {
    const ranked = rankPlayersForMexicano([
      { userId: 'a', points: 3, seedSkill: null },
      { userId: 'b', points: 9, seedSkill: null },
      { userId: 'c', points: 6, seedSkill: null },
    ]);
    expect(ranked).toEqual(['b', 'c', 'a']);
  });

  it('breaks point ties by seed skill descending', () => {
    const ranked = rankPlayersForMexicano([
      { userId: 'a', points: 5, seedSkill: 3 },
      { userId: 'b', points: 5, seedSkill: 7 },
    ]);
    expect(ranked).toEqual(['b', 'a']);
  });

  it('falls back to the tiebreak random when points and skill both tie (round 1, no ratings)', () => {
    const ranked = rankPlayersForMexicano(
      [
        { userId: 'a', points: 0, seedSkill: null },
        { userId: 'b', points: 0, seedSkill: null },
      ],
      fixedRandom([0.2, 0.8])
    );
    expect(ranked).toEqual(['b', 'a']);
  });
});

describe('mexicanoGroupsAndPairings', () => {
  it('splits ranked players into contiguous groups of 4 with best+worst vs. middle two', () => {
    const ranked = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];
    const groups = mexicanoGroupsAndPairings(ranked);

    expect(groups).toEqual([
      { courtGroupIndex: 0, team1: ['r1', 'r4'], team2: ['r2', 'r3'] },
      { courtGroupIndex: 1, team1: ['r5', 'r8'], team2: ['r6', 'r7'] },
    ]);
  });

  it('every match has 4 distinct players', () => {
    const ranked = Array.from({ length: 12 }, (_, i) => `p${i}`);
    const groups = mexicanoGroupsAndPairings(ranked);
    for (const group of groups) {
      const players = [...group.team1, ...group.team2];
      expect(new Set(players).size).toBe(4);
    }
  });

  it('rejects player counts that are not a multiple of 4', () => {
    expect(() => mexicanoGroupsAndPairings(['a', 'b', 'c'])).toThrow(/multiple of 4/);
  });
});
