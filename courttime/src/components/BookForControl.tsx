import { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { User } from 'lucide-react';
import { bookingApi } from '../api/client';

export type BookForMode = 'self' | 'member' | 'custom';

interface BookForControlProps {
  facilityId: string;
  currentUserId?: string;
  mode: BookForMode;
  onModeChange: (mode: BookForMode) => void;
  memberId: string | null;
  memberLabel: string | null;
  onMemberSelect: (userId: string, fullName: string) => void;
  customName: string;
  onCustomNameChange: (name: string) => void;
  /** Unique per mount point (BookingWizard vs QuickReservePopup) so <Label htmlFor> never collides. */
  idPrefix?: string;
}

/**
 * Admin-only "book for" control: Myself / Member / Custom Name.
 * Shared by QuickReservePopup and BookingWizard — each parent decides when to
 * render it (gated behind the admin_book_for_others flag) and owns the state.
 */
export function BookForControl({
  facilityId,
  currentUserId,
  mode,
  onModeChange,
  memberId,
  memberLabel,
  onMemberSelect,
  customName,
  onCustomNameChange,
  idPrefix = 'book-for',
}: BookForControlProps) {
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<Array<{ userId: string; fullName: string; email: string }>>([]);

  useEffect(() => {
    if (mode !== 'member') { setMemberSearch(''); setMemberResults([]); return; }
    if (memberSearch.trim().length < 2) { setMemberResults([]); return; }
    let cancelled = false;
    bookingApi.lookupFacilityMembers(facilityId, memberSearch).then((res: any) => {
      const results = res.members || res.data?.members || [];
      if (!cancelled) setMemberResults(results.filter((member: any) => member.userId !== currentUserId));
    }).catch(() => { if (!cancelled) setMemberResults([]); });
    return () => { cancelled = true; };
  }, [mode, memberSearch, facilityId, currentUserId]);

  const modes: Array<{ value: BookForMode; label: string }> = [
    { value: 'self', label: 'Myself' },
    { value: 'member', label: 'Member' },
    { value: 'custom', label: 'Custom Name' },
  ];

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <Label className="flex items-center gap-2 min-w-[80px]">
          <User className="h-4 w-4" />
          Book For
        </Label>
        <div className="flex gap-2">
          {modes.map(({ value, label }) => (
            <Button
              key={value}
              type="button"
              variant={mode === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => onModeChange(value)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>

      {mode === 'member' && (
        <div className="ml-[92px] space-y-2">
          {memberLabel ? (
            <button
              type="button"
              onClick={() => onMemberSelect('', '')}
              className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-800"
            >
              {memberLabel} ×
            </button>
          ) : (
            <>
              <Input
                id={`${idPrefix}-member-search`}
                value={memberSearch}
                onChange={(event) => setMemberSearch(event.target.value)}
                placeholder="Search member name or email"
              />
              {memberResults.map((member) => (
                <button
                  type="button"
                  key={member.userId}
                  className="block w-full text-left text-sm text-gray-700 hover:underline"
                  onClick={() => {
                    onMemberSelect(member.userId, member.fullName);
                    setMemberSearch('');
                    setMemberResults([]);
                  }}
                >
                  {member.fullName} <span className="text-xs text-gray-500">({member.email})</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {mode === 'custom' && (
        <div className="ml-[92px]">
          <Input
            id={`${idPrefix}-custom-name`}
            value={customName}
            onChange={(event) => onCustomNameChange(event.target.value)}
            placeholder="Enter guest name"
          />
        </div>
      )}
    </div>
  );
}
