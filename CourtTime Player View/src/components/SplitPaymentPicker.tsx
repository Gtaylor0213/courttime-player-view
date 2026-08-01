import { useEffect, useState } from 'react';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { bookingApi } from '../api/client';

const MAX_PARTICIPANTS = 4;

export interface SplitPaymentMember {
  userId: string;
  fullName: string;
}

interface SplitPaymentPickerProps {
  facilityId: string;
  currentUserId?: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  members: SplitPaymentMember[];
  onMembersChange: (members: SplitPaymentMember[]) => void;
  /** Unique per mount point (BookingWizard vs QuickReservePopup) so <Label htmlFor> never collides. */
  idPrefix?: string;
  /**
   * Drops the "split this fee" checkbox and intro copy, leaving just the member picker.
   * Used when editing an existing split's roster, where splitting is already decided.
   */
  pickerOnly?: boolean;
}

/**
 * Checkbox + live member search/picker for splitting a paid court's fee.
 * Shared by BookingWizard and QuickReservePopup — each parent still decides
 * *when* to show it (based on its own court-total/advanced-booking conditions).
 */
export function SplitPaymentPicker({
  facilityId,
  currentUserId,
  enabled,
  onEnabledChange,
  members,
  onMembersChange,
  idPrefix = 'split-payment',
  pickerOnly = false,
}: SplitPaymentPickerProps) {
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<Array<{ userId: string; fullName: string; email: string }>>([]);

  useEffect(() => {
    if (!enabled) { setMemberSearch(''); setMemberResults([]); return; }
    if (memberSearch.trim().length < 2) { setMemberResults([]); return; }
    let cancelled = false;
    bookingApi.lookupFacilityMembers(facilityId, memberSearch).then((res: any) => {
      const results = res.members || res.data?.members || [];
      if (!cancelled) setMemberResults(results.filter((member: any) => member.userId !== currentUserId));
    }).catch(() => { if (!cancelled) setMemberResults([]); });
    return () => { cancelled = true; };
  }, [enabled, memberSearch, facilityId, currentUserId]);

  const atCap = members.length >= MAX_PARTICIPANTS - 1;
  const visibleResults = memberResults.filter(
    (result) => !members.some((member) => member.userId === result.userId)
  );

  return (
    <div className="space-y-2 rounded-md border border-blue-200 bg-blue-50 p-3">
      {!pickerOnly && (
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${idPrefix}-checkbox`}
            checked={enabled}
            onCheckedChange={(checked) => onEnabledChange(checked === true)}
          />
          <Label htmlFor={`${idPrefix}-checkbox`} className="cursor-pointer text-sm font-medium">
            Split this court fee with members
          </Label>
        </div>
      )}
      {enabled && (
        <>
          {!pickerOnly && (
            <p className="text-xs text-blue-800">
              Add up to {MAX_PARTICIPANTS - 1} other members below. Your share is charged now; each of them gets
              2 hours to pay their own share before the hold is released and cancelled.
            </p>
          )}
          {atCap ? (
            <p className="text-xs font-medium text-blue-900">Maximum {MAX_PARTICIPANTS} people per split reservation</p>
          ) : (
            <Input
              value={memberSearch}
              onChange={(event) => setMemberSearch(event.target.value)}
              placeholder="Search member name or email"
            />
          )}
          {!atCap && visibleResults.map((member) => (
            <button
              type="button"
              key={member.userId}
              className="block w-full text-left text-sm text-blue-800 hover:underline"
              onClick={() => {
                onMembersChange([...members, member]);
                setMemberSearch('');
                setMemberResults([]);
              }}
            >
              {member.fullName} <span className="text-xs">({member.email})</span>
            </button>
          ))}
          {members.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {members.map((member) => (
                <button
                  type="button"
                  key={member.userId}
                  onClick={() => onMembersChange(members.filter((entry) => entry.userId !== member.userId))}
                  className="rounded bg-white px-2 py-1 text-xs text-blue-800"
                >
                  {member.fullName} ×
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
