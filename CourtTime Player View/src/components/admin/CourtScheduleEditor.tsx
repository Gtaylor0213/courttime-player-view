import React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';

export const COURT_SCHEDULE_DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export interface CourtScheduleDay {
  day_of_week: number;
  is_open: boolean;
  open_time?: string;
  close_time?: string;
  prime_time_start?: string | null;
  prime_time_end?: string | null;
}

interface CourtScheduleEditorProps {
  schedule: CourtScheduleDay[];
  onUpdateDay: (dayOfWeek: number, field: string, value: unknown) => void;
  peakStartLabel?: string;
  peakEndLabel?: string;
}

export function CourtScheduleEditor({
  schedule,
  onUpdateDay,
  peakStartLabel = 'Peak Start',
  peakEndLabel = 'Peak End',
}: CourtScheduleEditorProps) {
  return (
    <>
      {/* Mobile: stacked cards so start/end times are always visible */}
      <div className="space-y-3 md:hidden">
        {schedule.map((day) => (
          <div
            key={day.day_of_week}
            className="rounded-lg border border-green-200 bg-white p-3 space-y-3"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm">
                {COURT_SCHEDULE_DAY_NAMES[day.day_of_week]}
              </span>
              <div className="flex items-center gap-2">
                <Label htmlFor={`open-${day.day_of_week}`} className="text-xs text-gray-600">
                  Open
                </Label>
                <Switch
                  id={`open-${day.day_of_week}`}
                  checked={day.is_open}
                  onCheckedChange={(checked: boolean) =>
                    onUpdateDay(day.day_of_week, 'is_open', checked)
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">Start time</Label>
                <Input
                  type="time"
                  value={day.open_time || '06:00'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onUpdateDay(day.day_of_week, 'open_time', e.target.value)
                  }
                  disabled={!day.is_open}
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">End time</Label>
                <Input
                  type="time"
                  value={day.close_time || '22:00'}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onUpdateDay(day.day_of_week, 'close_time', e.target.value)
                  }
                  disabled={!day.is_open}
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">{peakStartLabel}</Label>
                <Input
                  type="time"
                  value={day.prime_time_start || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onUpdateDay(day.day_of_week, 'prime_time_start', e.target.value || null)
                  }
                  disabled={!day.is_open}
                  className="w-full"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-600">{peakEndLabel}</Label>
                <Input
                  type="time"
                  value={day.prime_time_end || ''}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    onUpdateDay(day.day_of_week, 'prime_time_end', e.target.value || null)
                  }
                  disabled={!day.is_open}
                  className="w-full"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left p-2">Day</th>
              <th className="text-center p-2">Open</th>
              <th className="text-center p-2">Start Time</th>
              <th className="text-center p-2">End Time</th>
              <th className="text-center p-2">{peakStartLabel}</th>
              <th className="text-center p-2">{peakEndLabel}</th>
            </tr>
          </thead>
          <tbody>
            {schedule.map((day) => (
              <tr key={day.day_of_week} className="border-b">
                <td className="p-2 font-medium">{COURT_SCHEDULE_DAY_NAMES[day.day_of_week]}</td>
                <td className="p-2 text-center">
                  <Switch
                    checked={day.is_open}
                    onCheckedChange={(checked: boolean) =>
                      onUpdateDay(day.day_of_week, 'is_open', checked)
                    }
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="time"
                    value={day.open_time || '06:00'}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      onUpdateDay(day.day_of_week, 'open_time', e.target.value)
                    }
                    disabled={!day.is_open}
                    className="w-28"
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="time"
                    value={day.close_time || '22:00'}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      onUpdateDay(day.day_of_week, 'close_time', e.target.value)
                    }
                    disabled={!day.is_open}
                    className="w-28"
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="time"
                    value={day.prime_time_start || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      onUpdateDay(day.day_of_week, 'prime_time_start', e.target.value || null)
                    }
                    disabled={!day.is_open}
                    className="w-28"
                  />
                </td>
                <td className="p-2">
                  <Input
                    type="time"
                    value={day.prime_time_end || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      onUpdateDay(day.day_of_week, 'prime_time_end', e.target.value || null)
                    }
                    disabled={!day.is_open}
                    className="w-28"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
