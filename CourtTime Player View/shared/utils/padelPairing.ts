/**
 * Pure pairing/rotation logic for Padel Social Play (Americano & Mexicano).
 * No DB access here -- the padelSocialService persists whatever these
 * functions compute. Keep this file deterministic and DB-free so it's
 * cheaply unit-testable.
 */

export interface AmericanoGroupAssignment {
  courtIndex: number;
  slot: number; // 1-4, fixed for the current 3-round cycle
  userId: string;
}

export interface TeamPairing {
  team1: [number, number]; // slots (Americano) or ranks (Mexicano, via mexicanoGroupsAndPairings)
  team2: [number, number];
}

/**
 * Splits players into groups of 4 and assigns each a fixed slot (1-4) for
 * the current Americano cycle. Order is shuffled via the supplied RNG so
 * repeated sessions don't always pair the same people first.
 */
export function assignAmericanoGroups(
  playerIds: string[],
  seedRandom: () => number = Math.random
): AmericanoGroupAssignment[] {
  if (playerIds.length === 0 || playerIds.length % 4 !== 0) {
    throw new Error('Americano requires a player count that is a multiple of 4');
  }

  const shuffled = shuffle(playerIds, seedRandom);
  const assignments: AmericanoGroupAssignment[] = [];
  for (let i = 0; i < shuffled.length; i += 1) {
    const courtIndex = Math.floor(i / 4);
    const slot = (i % 4) + 1;
    assignments.push({ courtIndex, slot, userId: shuffled[i] });
  }
  return assignments;
}

/**
 * The 3 distinct partner pairings possible for 4 people (P1-P4), cycled
 * across rounds so everyone partners with everyone once and plays against
 * everyone twice within a 3-round cycle.
 */
export function americanoPairingForCyclePos(cyclePos: 0 | 1 | 2): TeamPairing {
  switch (cyclePos) {
    case 0:
      return { team1: [1, 2], team2: [3, 4] };
    case 1:
      return { team1: [1, 3], team2: [2, 4] };
    case 2:
      return { team1: [1, 4], team2: [2, 3] };
    default:
      throw new Error(`Invalid Americano cycle position: ${cyclePos}`);
  }
}

/** 1-indexed round_number -> 0/1/2 position within its 3-round cycle. */
export function americanoCyclePos(roundNumber: number): 0 | 1 | 2 {
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    throw new Error(`Invalid round number: ${roundNumber}`);
  }
  return ((roundNumber - 1) % 3) as 0 | 1 | 2;
}

/**
 * True at the start of every cycle after the first (round 4, 7, 10, ...),
 * signaling group membership should be reshuffled across the whole pool so
 * players eventually meet people from other courts too.
 */
export function shouldReshuffleAmericanoGroups(roundNumber: number): boolean {
  return roundNumber > 1 && (roundNumber - 1) % 3 === 0;
}

export interface MexicanoStandingEntry {
  userId: string;
  points: number;
  seedSkill: number | null;
}

/**
 * Ranks players best-first for Mexicano seeding/re-seeding: by cumulative
 * points, tie-broken by seed skill, then a stable seeded random shuffle for
 * any remaining ties (covers round 1, where every player has 0 points).
 */
export function rankPlayersForMexicano(
  standings: MexicanoStandingEntry[],
  tieBreakRandom: () => number = Math.random
): string[] {
  const withTieBreak = standings.map(entry => ({ ...entry, tieBreak: tieBreakRandom() }));
  withTieBreak.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const aSkill = a.seedSkill ?? -Infinity;
    const bSkill = b.seedSkill ?? -Infinity;
    if (bSkill !== aSkill) return bSkill - aSkill;
    return b.tieBreak - a.tieBreak;
  });
  return withTieBreak.map(entry => entry.userId);
}

export interface MexicanoGroupPairing {
  courtGroupIndex: number;
  team1: [string, string];
  team2: [string, string];
}

/**
 * Splits a ranked player list into consecutive groups of 4 (ranks 1-4 ->
 * court 1, 5-8 -> court 2, ...) -- this doubles as court auto-assignment.
 * Within each group, teams are best+worst vs. the middle two, the standard
 * Mexicano "King's Court" split, which keeps matches competitive even
 * though group members are already similar in overall standing.
 */
export function mexicanoGroupsAndPairings(rankedUserIds: string[]): MexicanoGroupPairing[] {
  if (rankedUserIds.length === 0 || rankedUserIds.length % 4 !== 0) {
    throw new Error('Mexicano requires a player count that is a multiple of 4');
  }

  const groups: MexicanoGroupPairing[] = [];
  for (let i = 0; i < rankedUserIds.length; i += 4) {
    const [r1, r2, r3, r4] = rankedUserIds.slice(i, i + 4);
    groups.push({
      courtGroupIndex: i / 4,
      team1: [r1, r4],
      team2: [r2, r3],
    });
  }
  return groups;
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
