import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layers, MessageCircle } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { Messages } from './Messages';
import { MyLevelGroup } from './MyLevelGroup';
import { PlayerLevelGroups } from './admin/PlayerLevelGroups';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import { facilitiesApi } from '../api/client';
import { FEATURE_FLAGS } from '../../shared/constants/featureFlags';

export function MessagesPage() {
  const [searchParams] = useSearchParams();
  const selectedRecipientId = searchParams.get('recipientId') || undefined;
  const selectedConversationId = searchParams.get('conversationId') || undefined;
  const { user } = useAuth();
  const { selectedFacilityId, enabledFeatures } = useAppContext();
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
  const showLevels = hasFacility && enabledFeatures.includes(FEATURE_FLAGS.PLAYER_LEVEL_GROUPS);
  // Admins get the sorting board; players get a read-only view of their own
  // level. Super admins administer every facility, matching isFacilityAdminUser
  // on the server, so the board would 200 for them either way.
  const isFacilityAdmin =
    user?.isSuperAdmin === true || (user?.adminFacilities || []).includes(selectedFacilityId);

  const messagesView = (
    <Messages
      facilityId={selectedFacilityId}
      facilityName={facilityName}
      selectedRecipientId={selectedRecipientId}
      selectedConversationId={selectedConversationId}
      // The tab bar eats vertical space the panel's own height calc doesn't know about.
      heightOffsetPx={showLevels ? 216 : undefined}
    />
  );

  return (
    <div className="p-6">
        <div className="mb-4 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-medium">Messages</h1>
            <p className="mt-1 text-muted-foreground">Chat with other players at your facility</p>
          </div>
          <NotificationBell />
        </div>

        {!hasFacility ? (
          <div className="flex items-center justify-center rounded-lg border bg-card text-center" style={{ height: 'calc(100dvh - 160px)' }}>
            <p className="text-muted-foreground">You need to be a member of a facility to send messages.</p>
          </div>
        ) : !showLevels ? (
          messagesView
        ) : (
          <Tabs defaultValue="messages">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="messages" className="gap-2">
                <MessageCircle className="h-4 w-4 shrink-0" />
                Messages
              </TabsTrigger>
              <TabsTrigger value="levels" className="gap-2">
                <Layers className="h-4 w-4 shrink-0" />
                {isFacilityAdmin ? 'Player Levels' : 'My Level'}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="messages" className="mt-4">
              {messagesView}
            </TabsContent>

            <TabsContent value="levels" className="mt-4">
              {isFacilityAdmin ? (
                <PlayerLevelGroups facilityId={selectedFacilityId} />
              ) : (
                <MyLevelGroup facilityId={selectedFacilityId} />
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
  );
}
