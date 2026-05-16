import React, { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Alert, AlertDescription } from '../ui/alert';
import { membersApi } from '../../api/client';

export interface LockMemberTarget {
  userId: string;
  fullName: string;
  email: string;
}

interface LockMemberPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  facilityId: string | null;
  member: LockMemberTarget | null;
  stripeConnected?: boolean;
  onSuccess?: () => void;
}

export function LockMemberPaymentDialog({
  open,
  onOpenChange,
  facilityId,
  member,
  stripeConnected = true,
  onSuccess,
}: LockMemberPaymentDialogProps) {
  const [amountDollars, setAmountDollars] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setAmountDollars('');
      setDescription('');
      setSubmitting(false);
    }
  }, [open]);

  const handleSubmit = async () => {
    if (!facilityId || !member) return;
    if (!stripeConnected) {
      toast.error('Complete Stripe Connect setup under Facility Management → Payments first');
      return;
    }

    const amount = Number(amountDollars);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount greater than $0');
      return;
    }

    const amountCents = Math.round(amount * 100);
    setSubmitting(true);
    try {
      const res = await membersApi.createLockoutPayment(
        facilityId,
        member.userId,
        amountCents,
        description.trim() || 'Account balance due'
      );
      if (!res.success) {
        throw new Error(res.error || 'Failed to lock member');
      }
      toast.success('Member locked — they will be prompted to pay before accessing the app');
      onOpenChange(false);
      onSuccess?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to lock member';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-red-600" />
            Lock member & require payment
          </DialogTitle>
          <DialogDescription>
            {member ? (
              <>
                <span className="font-medium text-gray-900">{member.fullName}</span>
                {' '}({member.email}) will be blocked from the app until they pay via Stripe.
              </>
            ) : (
              'Select a member to lock.'
            )}
          </DialogDescription>
        </DialogHeader>

        {!stripeConnected && (
          <Alert variant="destructive">
            <AlertDescription>
              Stripe Connect must be set up under Facility Management → Payments before members can pay to unlock.
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="lock-member-amount">Amount owed (USD)</Label>
            <Input
              id="lock-member-amount"
              type="number"
              step="0.01"
              min="0.50"
              placeholder="25.00"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
              disabled={!stripeConnected || submitting}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lock-member-desc">Description (optional)</Label>
            <Input
              id="lock-member-desc"
              placeholder="e.g. Court damage fee"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!stripeConnected || submitting}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting || !member || !stripeConnected}
            className="gap-2"
          >
            <Lock className="h-4 w-4" />
            {submitting ? 'Locking…' : 'Lock & require payment'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
