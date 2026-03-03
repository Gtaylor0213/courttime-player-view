import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { Messages } from './Messages';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import { facilitiesApi } from '../api/client';

export function MessagesPage() {
  const [searchParams] = useSearchParams();
  const selectedRecipientId = searchParams.get('recipientId') || undefined;
  const { user } = useAuth();
  const { selectedFacilityId } = useAppContext();
  const [facilityName, setFacilityName] = useState<string | undefined>();

  useEffect(() => {
    if (selectedFacilityId) {
      facilitiesApi.getById(selectedFacilityId).then(res => {
        if (res.success && res.data?.facility) {
          setFacilityName(res.data.facility.name);
        }
      }).catch(() => {});
    }
  }, [selectedFacilityId]);

  const hasFacility = !!selectedFacilityId;

  return (
    <div className="p-6">
        <div className="mb-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-medium">Messages</h1>
            <p className="text-gray-600 mt-1">Chat with other players at your facility</p>
          </div>
          <NotificationBell />
        </div>

        {!hasFacility ? (
          <div className="flex items-center justify-center text-center bg-white rounded-lg border" style={{ height: 'calc(100vh - 160px)' }}>
            <p className="text-gray-500">You need to be a member of a facility to send messages.</p>
          </div>
        ) : (
          <Messages
            facilityId={selectedFacilityId}
            facilityName={facilityName}
            selectedRecipientId={selectedRecipientId}
          />
        )}
      </div>
  );
}
