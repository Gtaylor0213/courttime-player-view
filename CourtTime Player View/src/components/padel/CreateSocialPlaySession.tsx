import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { padelApi } from '../../api/client';
import { toast } from 'sonner';

interface CreateSocialPlaySessionProps {
  isOpen: boolean;
  onClose: () => void;
  facilityId: string;
  /** Per-player drop-in fee; null = free/members-only session. */
  dropInRateCents: number | null;
  onCreated: () => void;
}

/** Player-count options: multiples of 4 only, per the Americano/Mexicano format. */
const PLAYER_COUNT_OPTIONS = [4, 8, 12, 16];

export function CreateSocialPlaySession({ isOpen, onClose, facilityId, dropInRateCents, onCreated }: CreateSocialPlaySessionProps) {
  const [format, setFormat] = useState<'americano' | 'mexicano'>('americano');
  const [sessionDate, setSessionDate] = useState('');
  const [startTime, setStartTime] = useState('18:00');
  const [durationMinutes, setDurationMinutes] = useState('90');
  const [playerCount, setPlayerCount] = useState('4');
  const [roundsCount, setRoundsCount] = useState('5');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!sessionDate || !startTime) {
      toast.error('Pick a date and start time');
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await padelApi.createSession({
        facilityId,
        format,
        sessionDate,
        startTime,
        durationMinutes: Number(durationMinutes),
        playerCount: Number(playerCount),
        roundsCount: Number(roundsCount),
      });
      if (res.success) {
        const data = res.data as { requiresPayment?: boolean; checkoutUrl?: string };
        if (data.requiresPayment && data.checkoutUrl) {
          window.location.assign(data.checkoutUrl);
          return;
        }
        toast.success('Social Play session created — share it with other members to fill the roster.');
        onCreated();
        onClose();
      } else {
        toast.error(res.error || 'Could not create session');
      }
    } catch (err) {
      console.error('Create Social Play session error:', err);
      toast.error('Could not create session');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Social Play Session</DialogTitle>
          <DialogDescription>
            Courts are assigned automatically once the roster is full and you start the session.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Format</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={format === 'americano' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setFormat('americano')}
              >
                Americano
              </Button>
              <Button
                type="button"
                variant={format === 'mexicano' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => setFormat('mexicano')}
              >
                Mexicano
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              {format === 'americano'
                ? 'Fixed rotating partners — everyone partners with everyone once.'
                : 'Adaptive pairing — strongest players are matched based on live standings each round.'}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={sessionDate} onChange={(e) => setSessionDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Start Time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Duration (minutes)</Label>
              <Select value={durationMinutes} onValueChange={setDurationMinutes}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="60">60</SelectItem>
                  <SelectItem value="90">90</SelectItem>
                  <SelectItem value="120">120</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rounds</Label>
              <Input
                type="number"
                min={1}
                value={roundsCount}
                onChange={(e) => setRoundsCount(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Players</Label>
            <Select value={playerCount} onValueChange={setPlayerCount}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PLAYER_COUNT_OPTIONS.map((n) => (
                  <SelectItem key={n} value={String(n)}>{n} players ({n / 4} court{n / 4 > 1 ? 's' : ''})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {dropInRateCents != null && (
            <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded-md p-2">
              ${(dropInRateCents / 100).toFixed(2)}/player — {Number(playerCount)} players ={' '}
              <span className="font-medium">${((dropInRateCents * Number(playerCount)) / 100).toFixed(2)}</span> total.
              Each player (including you) pays their own share when they join.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Creating…' : 'Create Session'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
