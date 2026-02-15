import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { Messages } from './Messages';
import { useAuth } from '../contexts/AuthContext';
import { playerProfileApi, facilitiesApi } from '../api/client';

export function MessagesPage() {
  const [searchParams] = useSearchParams();
  const selectedRecipientId = searchParams.get('recipientId') || undefined;
  const navigate = useNavigate();
  const { user } = useAuth();
  const [memberFacilities, setMemberFacilities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFacilityFilter, setSelectedFacilityFilter] = useState<string>('all');

  useEffect(() => {
    if (user?.id) {
      loadFacilities();
    }
  }, [user?.id]);

  const loadFacilities = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const profileResponse = await playerProfileApi.getProfile(user.id);
      console.log('MessagesPage - Profile API response:', profileResponse);

      // Check for facilities in the API response (handles both data.profile and direct profile)
      let facilities = profileResponse.data?.profile?.memberFacilities
        || profileResponse.data?.memberFacilities
        || [];

      // Filter for active status
      let activeFacilities = facilities.filter((f: any) => f.status === 'active');

      // If API didn't return facilities, fall back to AuthContext and fetch details
      if (activeFacilities.length === 0 && user.memberFacilities && user.memberFacilities.length > 0) {
        console.log('MessagesPage - Falling back to AuthContext memberFacilities:', user.memberFacilities);
        // Fetch facility details for each facility ID from AuthContext
        activeFacilities = [];
        for (const facilityId of user.memberFacilities) {
          try {
            const facilityResponse = await facilitiesApi.getById(facilityId);
            if (facilityResponse.success && facilityResponse.data?.facility) {
              activeFacilities.push({
                facilityId: facilityResponse.data.facility.id,
                facilityName: facilityResponse.data.facility.name,
                membershipType: 'Member',
                status: 'active'
              });
            }
          } catch (err) {
            console.error('Error fetching facility details:', err);
          }
        }
      }

      setMemberFacilities(activeFacilities);
    } catch (error) {
      console.error('Error loading facilities:', error);
    } finally {
      setLoading(false);
    }
  };

  const facilityId = selectedFacilityFilter !== 'all'
    ? selectedFacilityFilter
    : memberFacilities[0]?.facilityId || '';

  const facilityName = memberFacilities.find(
    f => f.facilityId === facilityId
  )?.facilityName;

  return (
    <div className="p-6">
        <div className="mb-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-medium">Messages</h1>
            <p className="text-gray-600 mt-1">Chat with other players at your facility</p>
          </div>
          <NotificationBell />
        </div>

        {loading ? (
          <div className="flex items-center justify-center bg-white rounded-lg border" style={{ height: 'calc(100vh - 160px)' }}>
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          </div>
        ) : memberFacilities.length === 0 ? (
          <div className="flex items-center justify-center text-center bg-white rounded-lg border" style={{ height: 'calc(100vh - 160px)' }}>
            <p className="text-gray-500">You need to be a member of a facility to send messages.</p>
          </div>
        ) : (
          <Messages
            facilityId={facilityId}
            facilityName={facilityName}
            selectedRecipientId={selectedRecipientId}
          />
        )}
      </div>
  );
}
