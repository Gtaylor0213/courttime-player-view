import { Platform } from 'react-native';
import * as Calendar from 'expo-calendar';

type CalendarAddResultReason =
  | 'unsupported'
  | 'permission_denied'
  | 'no_writable_calendar'
  | 'error';

export interface DeviceCalendarEventInput {
  title: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  location?: string;
  notes?: string;
  alarmMinutesBefore?: number;
}

export interface DeviceCalendarAddResult {
  success: boolean;
  eventId?: string;
  reason?: CalendarAddResultReason;
}

function parseBookingDateTime(dateYmd: string, time: string): Date {
  const normalizedTime = time.length >= 5 ? time.slice(0, 5) : time;
  return new Date(`${dateYmd}T${normalizedTime}:00`);
}

async function getWritableCalendarId(): Promise<string | null> {
  if (Platform.OS === 'ios') {
    const defaultCalendar = await Calendar.getDefaultCalendarAsync();
    if (defaultCalendar?.allowsModifications !== false) {
      return defaultCalendar.id;
    }
  }

  const calendars = await Calendar.getCalendarsAsync(Calendar.EntityTypes.EVENT);
  const writableCalendars = calendars.filter((calendar) => calendar.allowsModifications !== false);
  const primaryCalendar = writableCalendars.find((calendar) => calendar.isPrimary);

  if (primaryCalendar) {
    return primaryCalendar.id;
  }

  const ownedCalendar = writableCalendars.find((calendar) =>
    calendar.accessLevel === Calendar.CalendarAccessLevel.OWNER ||
    calendar.accessLevel === Calendar.CalendarAccessLevel.EDITOR ||
    calendar.accessLevel === Calendar.CalendarAccessLevel.CONTRIBUTOR
  );

  return ownedCalendar?.id ?? writableCalendars[0]?.id ?? null;
}

export function buildBookingCalendarEvent(input: DeviceCalendarEventInput) {
  return {
    title: input.title,
    startDate: parseBookingDateTime(input.bookingDate, input.startTime),
    endDate: parseBookingDateTime(input.bookingDate, input.endTime),
    location: input.location,
    notes: input.notes,
    alarms: input.alarmMinutesBefore
      ? [{ relativeOffset: -Math.abs(input.alarmMinutesBefore) }]
      : undefined,
  };
}

export async function addBookingToDeviceCalendar(
  input: DeviceCalendarEventInput
): Promise<DeviceCalendarAddResult> {
  if (Platform.OS === 'web') {
    return { success: false, reason: 'unsupported' };
  }

  try {
    const permission = await Calendar.requestCalendarPermissionsAsync();
    if (!permission.granted) {
      return { success: false, reason: 'permission_denied' };
    }

    const calendarId = await getWritableCalendarId();
    if (!calendarId) {
      return { success: false, reason: 'no_writable_calendar' };
    }

    const eventId = await Calendar.createEventAsync(
      calendarId,
      buildBookingCalendarEvent(input)
    );

    return { success: true, eventId };
  } catch {
    return { success: false, reason: 'error' };
  }
}
