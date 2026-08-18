export const BOOKING_TYPES = {
  match: {
    label: 'Fun',
    color: 'bg-green-100 text-green-800 border-green-300',
    bgColor: 'bg-green-100'
  },
  league_match: {
    label: 'League Match',
    color: 'bg-purple-100 text-purple-800 border-purple-300',
    bgColor: 'bg-purple-100'
  },
  t2_match: {
    label: 'Flex Match (T-2)',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    bgColor: 'bg-indigo-100'
  },
  lesson: {
    label: 'Lesson',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    bgColor: 'bg-yellow-100'
  },
  group_lesson: {
    label: 'Group Lesson',
    color: 'bg-cyan-100 text-cyan-800 border-cyan-300',
    bgColor: 'bg-cyan-100'
  },
  ball_machine: {
    label: 'Ball Machine',
    color: 'bg-orange-100 text-orange-800 border-orange-300',
    bgColor: 'bg-orange-100'
  },
  clinic: {
    label: 'Clinic',
    color: 'bg-teal-100 text-teal-800 border-teal-300',
    bgColor: 'bg-teal-100'
  },
  drill: {
    label: 'Drill',
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    bgColor: 'bg-blue-100'
  },
  event: {
    label: 'Event',
    color: 'bg-green-100 text-green-800 border-green-300',
    bgColor: 'bg-green-100'
  },
  tournament: {
    label: 'Tournament',
    color: 'bg-purple-100 text-purple-800 border-purple-300',
    bgColor: 'bg-purple-100'
  },
  social: {
    label: 'Social',
    color: 'bg-pink-100 text-pink-800 border-pink-300',
    bgColor: 'bg-pink-100'
  },
  other: {
    label: 'Other',
    color: 'bg-gray-100 text-gray-800 border-gray-300',
    bgColor: 'bg-gray-100'
  },
  general_tennis: {
    label: 'General Tennis',
    color: 'bg-green-100 text-green-800 border-green-300',
    bgColor: 'bg-green-100'
  },
  alta_tennis: {
    label: 'ALTA Tennis',
    color: 'bg-purple-100 text-purple-800 border-purple-300',
    bgColor: 'bg-purple-100'
  },
  usta_tennis: {
    label: 'USTA Tennis',
    color: 'bg-blue-100 text-blue-800 border-blue-300',
    bgColor: 'bg-blue-100'
  },
  flex_tennis: {
    label: 'Flex Tennis',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    bgColor: 'bg-indigo-100'
  },
  team_tennis_lesson: {
    label: 'Team Tennis Lesson',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    bgColor: 'bg-yellow-100'
  },
  private_tennis_lesson: {
    label: 'Private Tennis Lesson',
    color: 'bg-amber-100 text-amber-800 border-amber-300',
    bgColor: 'bg-amber-100'
  },
  junior_tennis_lesson: {
    label: 'Junior Tennis Lesson',
    color: 'bg-lime-100 text-lime-800 border-lime-300',
    bgColor: 'bg-lime-100'
  },
  after_school_tennis_lesson: {
    label: 'After School Tennis Lesson',
    color: 'bg-orange-100 text-orange-800 border-orange-300',
    bgColor: 'bg-orange-100'
  },
  general_pickleball: {
    label: 'General Pickleball',
    color: 'bg-teal-100 text-teal-800 border-teal-300',
    bgColor: 'bg-teal-100'
  },
  alta_pickleball: {
    label: 'ALTA Pickleball',
    color: 'bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300',
    bgColor: 'bg-fuchsia-100'
  },
  usta_pickleball: {
    label: 'USTA Pickleball',
    color: 'bg-sky-100 text-sky-800 border-sky-300',
    bgColor: 'bg-sky-100'
  },
  flex_pickleball: {
    label: 'Flex Pickleball',
    color: 'bg-violet-100 text-violet-800 border-violet-300',
    bgColor: 'bg-violet-100'
  },
  team_pickleball_lesson: {
    label: 'Team Pickleball Lesson',
    color: 'bg-rose-100 text-rose-800 border-rose-300',
    bgColor: 'bg-rose-100'
  },
  private_pickleball_lesson: {
    label: 'Private Pickleball Lesson',
    color: 'bg-pink-100 text-pink-800 border-pink-300',
    bgColor: 'bg-pink-100'
  },
  maintenance: {
    label: 'Maintenance',
    color: 'bg-gray-100 text-gray-800 border-gray-300',
    bgColor: 'bg-gray-100'
  },
} as const;

export type BookingTypeKey = keyof typeof BOOKING_TYPES;

export const RESERVATION_LABEL_TYPE_KEYS: readonly BookingTypeKey[] = [
  'match',
  'league_match',
  't2_match',
  'lesson',
  'group_lesson',
  'ball_machine',
] as const;

// Alternate reservation type list used when the "Deer Lake Reservation Types"
// facility feature flag is enabled — swaps out the standard type list above.
export const DEER_LAKE_RESERVATION_TYPE_KEYS: readonly BookingTypeKey[] = [
  'general_tennis',
  'alta_tennis',
  'usta_tennis',
  'flex_tennis',
  'team_tennis_lesson',
  'private_tennis_lesson',
  'junior_tennis_lesson',
  'after_school_tennis_lesson',
  'general_pickleball',
  'alta_pickleball',
  'usta_pickleball',
  'flex_pickleball',
  'team_pickleball_lesson',
  'private_pickleball_lesson',
  'maintenance',
] as const;

export const getBookingTypeColor = (type: string | undefined): string => {
  if (!type) return BOOKING_TYPES.other.bgColor;
  const normalizedType = type.toLowerCase().replace(/\s+/g, '_');
  return BOOKING_TYPES[normalizedType as BookingTypeKey]?.bgColor || BOOKING_TYPES.other.bgColor;
};

export const getBookingTypeBadgeColor = (type: string | undefined): string => {
  if (!type) return BOOKING_TYPES.other.color;
  const normalizedType = type.toLowerCase().replace(/\s+/g, '_');
  return BOOKING_TYPES[normalizedType as BookingTypeKey]?.color || BOOKING_TYPES.other.color;
};

export const getBookingTypeLabel = (type: string | undefined): string => {
  if (!type) return 'Other';
  const normalizedType = type.toLowerCase().replace(/\s+/g, '_');
  return BOOKING_TYPES[normalizedType as BookingTypeKey]?.label || type;
};
