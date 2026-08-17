import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { membersApi } from '../api/client';

interface MemberNumberDialogProps {
  open: boolean;
  facilityId: string;
  facilityName?: string;
  onSaved: (memberNumber: string) => void;
}

export function MemberNumberDialog({ open, facilityId, facilityName, onSaved }: MemberNumberDialogProps) {
  const [memberNumber, setMemberNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const trimmed = memberNumber.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await membersApi.saveMyMemberNumber(facilityId, trimmed);
      if (res.success) {
        onSaved(trimmed);
      } else {
        setError(res.error || 'Failed to save member number');
      }
    } catch (err) {
      console.error('Failed to save member number:', err);
      setError('Failed to save member number');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => { /* mandatory — cannot be dismissed without saving */ }}>
      <DialogContent className="max-w-md" onEscapeKeyDown={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()} showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Member Number Required</DialogTitle>
          <DialogDescription>
            {facilityName ? `${facilityName} requires` : 'This club requires'} your member number before you can continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="member-number-input">Member Number</Label>
          <Input
            id="member-number-input"
            value={memberNumber}
            onChange={(e) => setMemberNumber(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            placeholder="Enter your member number"
            autoFocus
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={!memberNumber.trim() || submitting}>
            {submitting ? 'Saving...' : 'Save & Continue'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
