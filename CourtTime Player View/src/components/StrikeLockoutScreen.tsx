import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';
import type { StrikeLockoutStatus } from '../../shared/utils/strikeLockout';
import {
  formatLockoutEndDate,
  strikeLockoutMessage,
} from '../../shared/utils/strikeLockout';

interface StrikeLockoutScreenProps {
  status: StrikeLockoutStatus;
  facilityName?: string;
}

export function StrikeLockoutScreen({ status, facilityName }: StrikeLockoutScreenProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
            <Lock className="h-6 w-6 text-red-600" aria-hidden />
          </div>
          <CardTitle>Account temporarily locked</CardTitle>
          {facilityName ? (
            <p className="text-sm text-muted-foreground mt-1">{facilityName}</p>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <p className="text-sm text-foreground">{strikeLockoutMessage(status)}</p>
          {status.lockoutEndsAt ? (
            <p className="text-sm text-muted-foreground">
              You can use CourtTime again after{' '}
              <strong>{formatLockoutEndDate(status.lockoutEndsAt)}</strong>.
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground">
            While locked, you cannot book courts or use club features for this facility. View your
            profile to see strike details or contact the club for help.
          </p>
          <Button variant="outline" className="w-full" onClick={() => navigate('/profile')}>
            View account status
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
