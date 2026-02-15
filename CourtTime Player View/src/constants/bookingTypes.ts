export const BOOKING_TYPES = {
  match: {
    label: 'Match',
    color: 'bg-green-100 text-green-800 border-green-300',
    bgColor: 'bg-green-100'
  },
  league_match: {
    label: 'League Match',
    color: 'bg-purple-100 text-purple-800 border-purple-300',
    bgColor: 'bg-purple-100'
  },
  t2_match: {
    label: 'T2 Match',
    color: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    bgColor: 'bg-indigo-100'
  },
  lesson: {
    label: 'Lesson',
    color: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    bgColor: 'bg-yellow-100'
  },
  ball_machine: {
    label: 'Ball Machine',
    color: 'bg-orange-100 text-orange-800 border-orange-300',
    bgColor: 'bg-orange-100'
  },
  individual_practice: {
    label: 'Individual Practice',
    color: 'bg-green-100 text-green-800 border-green-300',
    bgColor: 'bg-green-100'
  },
  other: {
    label: 'Other',
    color: 'bg-gray-100 text-gray-800 border-gray-300',
    bgColor: 'bg-gray-100'
  },
} as const;

export type BookingTypeKey = keyof typeof BOOKING_TYPES;

export const getBookingTypeColor = (type: string | undefined): string => {
  if (!type) return BOOKING_TYPES.other.bgColor;
  // Normalize: lowercase and replace spaces with underscores
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
