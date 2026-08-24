import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Calendar, Clock, Users } from 'lucide-react';

export interface PadelSessionSummary {
  id: string;
  format: 'americano' | 'mexicano';
  sessionDate: string;
  startTime: string;
  durationMinutes: number;
  playerCount: number;
  roundsCount: number;
  status: 'open' | 'full' | 'in_progress' | 'completed' | 'cancelled';
  createdBy: string;
  hostName: string;
  joinedCount: number;
  isJoined: boolean;
}

interface PadelSessionListProps {
  sessions: PadelSessionSummary[];
  currentUserId?: string;
  /** Per-player drop-in fee; null = free/members-only. */
  dropInRateCents?: number | null;
  onJoin: (sessionId: string) => void;
  onStart: (sessionId: string) => void;
}

function formatTime(time: string): string {
  const [h, m] = time.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}

export function PadelSessionList({ sessions, currentUserId, dropInRateCents, onJoin, onStart }: PadelSessionListProps) {
  const navigate = useNavigate();

  if (sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <Users className="h-10 w-10 mb-3" />
        <p className="text-sm">No upcoming Social Play sessions. Create one to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sessions.map((session) => {
        const isHost = session.createdBy === currentUserId;
        const alreadyJoined = session.isJoined;
        const full = session.joinedCount >= session.playerCount;
        return (
          <Card key={session.id} className="p-4 flex items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant={session.format === 'americano' ? 'default' : 'secondary'}>
                  {session.format === 'americano' ? 'Americano' : 'Mexicano'}
                </Badge>
                <Badge variant="outline">{session.status === 'full' ? 'Full' : 'Open'}</Badge>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                <span className="flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5" /> {session.sessionDate}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> {formatTime(session.startTime)} ({session.durationMinutes} min)
                </span>
                <span className="flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> {session.joinedCount}/{session.playerCount}
                </span>
              </div>
              <p className="text-xs text-gray-500">Hosted by {session.hostName}</p>
            </div>

            <div className="flex items-center gap-2">
              {isHost && full && (
                <Button size="sm" onClick={() => onStart(session.id)}>Start</Button>
              )}
              {!isHost && !alreadyJoined && !full && (
                <Button size="sm" onClick={() => onJoin(session.id)}>
                  {dropInRateCents ? `Join — $${(dropInRateCents / 100).toFixed(2)}` : 'Join'}
                </Button>
              )}
              {(alreadyJoined || isHost) && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/padel/${session.id}`)}>
                  View
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
