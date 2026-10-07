export const PICKLE_PROGRAM_TYPES = [
  'open_play',
  'round_robin',
  'kings_court',
  'league',
  'tournament',
  'clinic',
  'social',
] as const;

export type PickleProgramType = (typeof PICKLE_PROGRAM_TYPES)[number];

export const PICKLE_PROGRAM_TYPE_LABELS: Record<PickleProgramType, string> = {
  open_play: 'Open Play',
  round_robin: 'Round Robin',
  kings_court: 'Kings Court',
  league: 'League',
  tournament: 'Tournament',
  clinic: 'Clinic',
  social: 'Social',
};

export function isPickleProgramType(value: string): value is PickleProgramType {
  return (PICKLE_PROGRAM_TYPES as readonly string[]).includes(value);
}
