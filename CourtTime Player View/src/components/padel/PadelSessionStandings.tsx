import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Trophy, ArrowLeft, RefreshCw } from 'lucide-react';
import { padelApi } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { toast } from 'sonner';

interface MatchView {
  id: string;
  courtId: string | null;
  courtName: string | null;
  team1: [string, string];
  team2: [string, string];
  team1Score: number | null;
  team2Score: number | null;
}

interface RoundView {
  id: string;
  roundNumber: number;
  status: string;
  matches: MatchView[];
}

interface SessionDetailView {
  session: {
    id: string;
    format: 'americano' | 'mexicano';
    sessionDate: string;
    startTime: string;
    status: string;
    createdBy: string;
    hostName: string;
    playerCount: number;
    roundsCount: number;
  };
  roster: { userId: string; fullName: string; isHost: boolean; paymentStatus: string }[];
  rounds: RoundView[];
}

interface StandingRow {
  userId: string;
  fullName: string;
  points: number;
  matchesPlayed: number;
}

export function PadelSessionStandings() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [detail, setDetail] = useState<SessionDetailView | null>(null);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, { team1: string; team2: string }>>({});
  const [busy, setBusy] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const nameFor = useCallback(
    (userId: string) => detail?.roster.find((p) => p.userId === userId)?.fullName || 'Player',
    [detail]
  );

  const load = useCallback(async () => {
    if (!sessionId) return;
    const [detailRes, standingsRes] = await Promise.all([
      padelApi.getSessionDetail(sessionId),
      padelApi.getStandings(sessionId),
    ]);
    if (detailRes.success) setDetail(detailRes.data as SessionDetailView);
    if (standingsRes.success) setStandings((standingsRes.data as { standings: StandingRow[] }).standings);
    setLoading(false);
  }, [sessionId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleScoreSubmit = async (matchId: string) => {
    const draft = scoreDrafts[matchId];
    if (!draft || draft.team1 === '' || draft.team2 === '') {
      toast.error('Enter both team scores');
      return;
    }
    setBusy(true);
    try {
      const res = await padelApi.recordMatchScore(matchId, Number(draft.team1), Number(draft.team2));
      if (res.success) {
        await load();
      } else {
        toast.error(res.error || 'Could not record score');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!sessionId) return;
    setIsCancelling(true);
    try {
      const res = await padelApi.cancelSession(sessionId);
      if (res.success) {
        toast.success('Session cancelled. Any paid players have been refunded.');
        setShowCancelConfirm(false);
        await load();
      } else {
        toast.error(res.error || 'Could not cancel session');
      }
    } finally {
      setIsCancelling(false);
    }
  };

  const handleNextRound = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const res = await padelApi.generateNextRound(sessionId);
      if (res.success) {
        toast.success('Next round generated');
        await load();
      } else {
        toast.error(res.error || 'Could not generate next round');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <p className="text-sm">Session not found.</p>
      </div>
    );
  }

  const { session, rounds, roster } = detail;
  const isHost = user?.id === session.createdBy;
  const latestRound = rounds[rounds.length - 1];
  const latestRoundComplete = latestRound?.matches.every((m) => m.team1Score !== null && m.team2Score !== null);
  const canGenerateNextRound =
    isHost && session.status === 'in_progress' && latestRoundComplete && rounds.length < session.roundsCount;
  const canCancel = isHost && ['open', 'full'].includes(session.status);

  return (
    <div className="space-y-6 pb-20">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate('/padel')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        {canCancel && (
          <Button variant="destructive" size="sm" onClick={() => setShowCancelConfirm(true)}>
            Cancel Session
          </Button>
        )}
      </div>

      <div className="flex items-center gap-3">
        <Trophy className="h-6 w-6 text-indigo-600" />
        <h1 className="text-2xl font-semibold text-gray-900">
          {session.format === 'americano' ? 'Americano' : 'Mexicano'} — {session.sessionDate}
        </h1>
        <Badge variant="outline">{session.status.replace('_', ' ')}</Badge>
      </div>

      {['open', 'full'].includes(session.status) && (
        <Card className="p-4">
          <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-3">Roster</h2>
          <div className="space-y-1">
            {roster.map((p) => (
              <div key={p.userId} className="flex items-center justify-between py-1.5 border-b last:border-0 text-sm">
                <span>{p.fullName}{p.isHost && <span className="text-xs text-gray-400 ml-1">(host)</span>}</span>
                {p.paymentStatus === 'pending' && <Badge variant="outline">Payment pending</Badge>}
                {p.paymentStatus === 'refunded' && <Badge variant="outline">Refunded</Badge>}
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Standings */}
      <Card className="p-4">
        <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500 mb-3">Standings</h2>
        <div className="space-y-1">
          {standings.map((row, idx) => (
            <div key={row.userId} className="flex items-center justify-between py-1.5 border-b last:border-0">
              <span className="flex items-center gap-2 text-sm">
                <span className="text-gray-400 w-5">{idx + 1}.</span>
                {row.fullName}
              </span>
              <span className="text-sm font-medium">
                {row.points} pts <span className="text-gray-400">({row.matchesPlayed} matches)</span>
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Rounds */}
      {rounds.map((round) => (
        <Card key={round.id} className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium uppercase tracking-wide text-gray-500">
              Round {round.roundNumber}
            </h2>
            <Badge variant={round.status === 'completed' ? 'default' : 'outline'}>{round.status}</Badge>
          </div>
          <div className="space-y-3">
            {round.matches.map((match) => {
              const isScored = match.team1Score !== null && match.team2Score !== null;
              const draft = scoreDrafts[match.id] || { team1: '', team2: '' };
              return (
                <div key={match.id} className="border rounded-md p-3">
                  <p className="text-xs text-gray-500 mb-2">{match.courtName || 'Court TBD'}</p>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <div>{nameFor(match.team1[0])} / {nameFor(match.team1[1])}</div>
                      <div className="text-gray-400 text-xs my-1">vs</div>
                      <div>{nameFor(match.team2[0])} / {nameFor(match.team2[1])}</div>
                    </div>
                    {isScored ? (
                      <div className="text-lg font-semibold">
                        {match.team1Score} – {match.team2Score}
                      </div>
                    ) : isHost ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min={0}
                          className="w-16"
                          value={draft.team1}
                          onChange={(e) =>
                            setScoreDrafts((prev) => ({ ...prev, [match.id]: { ...draft, team1: e.target.value } }))
                          }
                        />
                        <span>–</span>
                        <Input
                          type="number"
                          min={0}
                          className="w-16"
                          value={draft.team2}
                          onChange={(e) =>
                            setScoreDrafts((prev) => ({ ...prev, [match.id]: { ...draft, team2: e.target.value } }))
                          }
                        />
                        <Button size="sm" disabled={busy} onClick={() => handleScoreSubmit(match.id)}>
                          Save
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}

      {canGenerateNextRound && (
        <Button onClick={handleNextRound} disabled={busy}>
          <RefreshCw className="h-4 w-4 mr-2" /> Generate Next Round
        </Button>
      )}

      <Dialog open={showCancelConfirm} onOpenChange={setShowCancelConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Session?</DialogTitle>
            <DialogDescription>
              This cancels the session for everyone. Any player who already paid will be automatically refunded.
              This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-3">
            <Button variant="outline" onClick={() => setShowCancelConfirm(false)} disabled={isCancelling}>
              Keep Session
            </Button>
            <Button variant="destructive" onClick={handleCancel} disabled={isCancelling}>
              {isCancelling ? 'Cancelling…' : 'Yes, Cancel Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
