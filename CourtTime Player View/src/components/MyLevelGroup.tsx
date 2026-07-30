/**
 * Player-facing side of the level groups feature: which level the player has
 * been placed in and who else is in it, so they can find a match at their own
 * standard. Renders nothing until an admin flips a level's visibility switch —
 * a facility can keep the board purely internal.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Layers, MessageCircle, Users } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import { playerLevelGroupsApi, type MyLevelGroup as MyLevelGroupData } from '../api/client';

interface MyLevelGroupProps {
  facilityId: string;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function MyLevelGroup({ facilityId }: MyLevelGroupProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<MyLevelGroupData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const response = await playerLevelGroupsApi.getMine(facilityId);
      // A 403 here just means the feature is off for this facility; the caller
      // only renders this component when the flag is on, so stay quiet either way.
      setData(response.success && response.mine ? response.mine : null);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [facilityId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-green-600" />
      </div>
    );
  }

  if (!data?.group) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <Layers className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm font-medium text-gray-700">You're not in a level group yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Your facility's staff group players by level. Once you're placed in one, you'll see
            your group and its other players here.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { group, members } = data;

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Layers className="h-5 w-5 text-green-600" />
          <span>{group.name}</span>
          <Badge variant="secondary">
            Level {group.rank} of {group.totalGroups}
          </Badge>
        </CardTitle>
        <p className="text-sm text-gray-500">
          {members.length === 0
            ? 'You are the only player in this level right now.'
            : `${members.length} other player${members.length === 1 ? '' : 's'} at your level — message anyone to set up a hit.`}
        </p>
      </CardHeader>
      <CardContent className="p-3">
        {members.length === 0 ? (
          <div className="py-6 text-center">
            <Users className="mx-auto mb-2 h-8 w-8 text-gray-300" />
            <p className="text-sm text-gray-500">Check back as more players are placed.</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {members.map((member) => (
              <div
                key={member.userId}
                className="flex items-center gap-3 rounded-lg border p-2"
              >
                <Avatar className="h-9 w-9">
                  <AvatarFallback className="bg-green-100 text-xs text-green-700">
                    {getInitials(member.fullName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">{member.fullName}</p>
                  {member.skillLevel && (
                    <span className="text-xs text-gray-500">{member.skillLevel}</span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(`/messages?recipientId=${member.userId}`)}
                  aria-label={`Message ${member.fullName}`}
                >
                  <MessageCircle className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
