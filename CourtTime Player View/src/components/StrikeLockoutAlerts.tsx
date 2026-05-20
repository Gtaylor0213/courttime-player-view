import { AlertTriangle, Lock } from 'lucide-react';
import type { StrikeLockoutStatus } from '../../shared/utils/strikeLockout';
import {
  formatLockoutEndDate,
  strikeLockoutMessage,
  strikeWarningMessage,
} from '../../shared/utils/strikeLockout';

interface StrikeLockoutAlertsProps {
  status: StrikeLockoutStatus | null;
  className?: string;
}

export function StrikeLockoutAlerts({ status, className = '' }: StrikeLockoutAlertsProps) {
  if (!status) return null;

  if (status.isLockedOut) {
    return (
      <div
        className={`flex-shrink-0 px-4 py-3 flex items-start gap-3 bg-red-50 border-b border-red-200 text-red-900 ${className}`}
      >
        <Lock className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden />
        <div>
          <p className="text-sm font-semibold">Account locked</p>
          <p className="text-sm mt-0.5">{strikeLockoutMessage(status)}</p>
          {status.lockoutEndsAt ? (
            <p className="text-xs text-red-700 mt-1">
              Until {formatLockoutEndDate(status.lockoutEndsAt)}
            </p>
          ) : null}
        </div>
      </div>
    );
  }

  if (status.activeStrikes > 0) {
    return (
      <div
        className={`flex-shrink-0 px-4 py-3 flex items-start gap-3 bg-amber-50 border-b border-amber-200 text-amber-900 ${className}`}
      >
        <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" aria-hidden />
        <p className="text-sm">{strikeWarningMessage(status)}</p>
      </div>
    );
  }

  return null;
}
