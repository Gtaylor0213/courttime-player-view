import React from 'react';
import { Clock } from 'lucide-react';
import { CourtHoursEditor } from '../booking-rules/CourtHoursEditor';
import { useRegistration } from './RegistrationContext';

export function FacilityOperatingHoursSection({ description }: { description?: string }) {
  const { formData, handleOperatingHoursChange } = useRegistration();

  return (
    <div>
      <h4 className="font-semibold mb-4 flex items-center gap-2">
        <Clock className="h-4 w-4" />
        Court hours
      </h4>
      {description && <p className="text-sm text-gray-600 mb-3">{description}</p>}
      <CourtHoursEditor
        operatingHours={formData.operatingHours}
        onChange={handleOperatingHoursChange}
      />
    </div>
  );
}
