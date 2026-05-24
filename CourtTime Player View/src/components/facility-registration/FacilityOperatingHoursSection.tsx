import React from 'react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Clock } from 'lucide-react';
import { useRegistration } from './RegistrationContext';

export function FacilityOperatingHoursSection({ description }: { description?: string }) {
  const { formData, handleOperatingHoursChange } = useRegistration();

  return (
    <div>
      <h4 className="font-semibold mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4" />
        Court hours (default for all courts)
      </h4>
      {description && <p className="text-sm text-gray-600 mb-3">{description}</p>}
      <div className="space-y-3">
        {Object.keys(formData.operatingHours).map((day) => {
          const hours = formData.operatingHours[day as keyof typeof formData.operatingHours];
          return (
            <div key={day} className="rounded-lg border bg-white p-3 sm:border-0 sm:bg-transparent sm:p-0 sm:rounded-none space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-4">
              <div className="w-full sm:w-28 font-medium capitalize text-sm">{day}</div>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:flex-1 min-w-0">
                <Input
                  type="time"
                  value={hours.open}
                  onChange={(e) => handleOperatingHoursChange(day, 'open', e.target.value)}
                  disabled={hours.closed}
                  className="w-full sm:w-32"
                />
                <span className="text-gray-500 text-sm">to</span>
                <Input
                  type="time"
                  value={hours.close}
                  onChange={(e) => handleOperatingHoursChange(day, 'close', e.target.value)}
                  disabled={hours.closed}
                  className="w-full sm:w-32"
                />
                <div className="flex items-center gap-2 sm:ml-4 pt-1 sm:pt-0">
                  <Switch
                    checked={hours.closed}
                    onCheckedChange={(checked) => handleOperatingHoursChange(day, 'closed', checked)}
                  />
                  <Label className="text-sm">Closed</Label>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
