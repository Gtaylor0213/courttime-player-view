import React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

export type CourtHoursDay = {
  open: string;
  close: string;
  closed?: boolean;
};

export type CourtHoursMap = Record<string, CourtHoursDay>;

const DEFAULT_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

type Props = {
  operatingHours: CourtHoursMap;
  onChange: (day: string, field: 'open' | 'close' | 'closed', value: string | boolean) => void;
  days?: readonly string[];
};

/** Shared court hours editor used in registration and facility management. */
export function CourtHoursEditor({
  operatingHours,
  onChange,
  days = DEFAULT_DAYS,
}: Props) {
  return (
    <div className="space-y-4">
      {days.map((day) => {
        const hours = operatingHours[day] ?? { open: '08:00', close: '20:00', closed: false };
        return (
          <div
            key={day}
            className="flex flex-col gap-3 p-3 bg-gray-50 rounded-lg sm:flex-row sm:items-center sm:gap-4"
          >
            <div className="font-medium capitalize sm:w-28">{day}</div>
            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2 sm:flex sm:flex-1 sm:items-center sm:gap-2">
              <div className="space-y-1 sm:space-y-0">
                <Label className="text-xs text-gray-600 sm:hidden">Start time</Label>
                <Input
                  type="time"
                  value={hours.open}
                  onChange={(e) => onChange(day, 'open', e.target.value)}
                  disabled={hours.closed}
                  className="w-full sm:w-32"
                />
              </div>
              <span className="text-gray-500 text-sm hidden sm:inline">to</span>
              <div className="space-y-1 sm:space-y-0">
                <Label className="text-xs text-gray-600 sm:hidden">End time</Label>
                <Input
                  type="time"
                  value={hours.close}
                  onChange={(e) => onChange(day, 'close', e.target.value)}
                  disabled={hours.closed}
                  className="w-full sm:w-32"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 sm:shrink-0">
              <Switch
                id={`court-hours-closed-${day}`}
                checked={!!hours.closed}
                onCheckedChange={(checked) => onChange(day, 'closed', checked)}
              />
              <Label htmlFor={`court-hours-closed-${day}`} className="text-sm text-gray-600">
                Closed
              </Label>
            </div>
          </div>
        );
      })}
    </div>
  );
}
