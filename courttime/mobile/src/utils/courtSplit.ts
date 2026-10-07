/**
 * Split-court settings for the admin court form. A court that splits into
 * smaller courts (e.g. tennis court 3 → pickleball 3a + 3b) owns child courts
 * named "Court <split name>". Removing a child deletes its bookings, so the
 * form must load the halves that really exist and send them back unchanged.
 */

export interface SplitCourtLike {
  id: string;
  name: string;
  courtType?: string | null;
  parentCourtId?: string | null;
  isSplitCourt?: boolean | null;
  splitConfiguration?: unknown;
}

export interface CourtSplitSettings {
  canSplit: boolean;
  splitNames: string[];
  splitType: 'Tennis' | 'Pickleball';
}

function parseConfiguration(value: unknown): Record<string, any> {
  if (!value) return {};
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, any>) : {};
  } catch {
    return {};
  }
}

/** "3a, 3b" → ["3a", "3b"]. */
export function parseSplitNames(text: string): string[] {
  return text.split(',').map((n) => n.trim()).filter(Boolean);
}

/**
 * The court's current split. The child courts are the source of truth for the
 * names (the stored configuration has drifted from them on some clubs); the
 * configuration is the fallback when the list holds no children.
 */
export function readCourtSplit(court: SplitCourtLike | null | undefined, allCourts: SplitCourtLike[]): CourtSplitSettings {
  if (!court) return { canSplit: false, splitNames: [], splitType: 'Pickleball' };
  const children = allCourts.filter((c) => c.parentCourtId === court.id);
  const config = parseConfiguration(court.splitConfiguration);
  const configNames: unknown = config.splitInto ?? config.splitNames;
  const splitNames =
    children.length > 0
      ? children.map((c) => c.name.replace(/^Court\s+/i, '').trim()).filter(Boolean)
      : Array.isArray(configNames)
        ? configNames.map((n) => String(n).trim()).filter(Boolean)
        : [];
  const type = children[0]?.courtType ?? config.splitType;
  return {
    canSplit: splitNames.length > 0 && (children.length > 0 || !!court.isSplitCourt),
    splitNames,
    splitType: type === 'Tennis' ? 'Tennis' : 'Pickleball',
  };
}
