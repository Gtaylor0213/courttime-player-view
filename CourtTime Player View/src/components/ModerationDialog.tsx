import { useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import { toast } from 'sonner';
import { moderationApi } from '../api/client';
import { Button } from './ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { Textarea } from './ui/textarea';

export interface ModerationTarget {
  contentType: 'message' | 'bulletin_post' | 'hitting_partner_post' | 'user';
  /** Id of the message or post; for `user`, the member's id. */
  contentId: string;
  /** The member who wrote it, offered as "Block". */
  userId: string;
  userName: string;
  facilityId?: string | null;
}

interface ModerationDialogProps {
  target: ModerationTarget | null;
  onClose: () => void;
  /** Called after a successful block, so the page can drop that member's content. */
  onBlocked?: (userId: string) => void;
}

type Reason = 'harassment' | 'inappropriate' | 'spam' | 'other';

const REASONS: Array<{ value: Reason; label: string }> = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate', label: 'Offensive or inappropriate' },
  { value: 'spam', label: 'Spam or scam' },
  { value: 'other', label: 'Something else' },
];

const TITLES: Record<ModerationTarget['contentType'], string> = {
  message: 'Report message',
  bulletin_post: 'Report post',
  hitting_partner_post: 'Report post',
  user: 'Report member',
};

/**
 * Report / block dialog, shared by every place a member can see someone
 * else's content. The mobile app's ModerationSheet is its counterpart.
 */
export function ModerationDialog({ target, onClose, onBlocked }: ModerationDialogProps) {
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState<'report' | 'block' | null>(null);

  useEffect(() => {
    setReason(null);
    setDetails('');
    setBusy(null);
  }, [target?.contentType, target?.contentId]);

  if (!target) return null;

  const submitReport = async () => {
    if (!reason) return;
    setBusy('report');
    const response = await moderationApi.report({
      contentType: target.contentType,
      contentId: target.contentId,
      reason,
      details: details.trim() || undefined,
      facilityId: target.facilityId,
    });
    setBusy(null);
    if (!response.success) {
      toast.error(response.error || 'Could not send report');
      return;
    }
    toast.success('Report sent. We review reports within 24 hours.');
    onClose();
  };

  const block = async () => {
    if (!window.confirm(
      `Block ${target.userName}?\n\nYou won't see their messages or posts, and neither of you will be able to message the other. They won't be told. You can unblock them from your profile.`
    )) return;
    setBusy('block');
    const response = await moderationApi.block(target.userId);
    setBusy(null);
    if (!response.success) {
      toast.error(response.error || 'Could not block member');
      return;
    }
    toast.success(`${target.userName} is blocked`);
    onClose();
    onBlocked?.(target.userId);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{TITLES[target.contentType]}</DialogTitle>
          <DialogDescription>
            Why are you reporting this? {target.userName} won't be told who reported it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2" role="radiogroup" aria-label="Reason">
          {REASONS.map((option) => (
            <label
              key={option.value}
              className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm cursor-pointer ${
                reason === option.value ? 'border-green-600 bg-green-50' : 'border-gray-200'
              }`}
            >
              <input
                type="radio"
                name="report-reason"
                checked={reason === option.value}
                onChange={() => setReason(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>

        <Textarea
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Add details (optional)"
          maxLength={1000}
          aria-label="Report details"
        />

        <Button onClick={submitReport} disabled={!reason || busy !== null}>
          {busy === 'report' ? 'Sending…' : 'Send report'}
        </Button>

        <div className="border-t pt-3">
          <button
            type="button"
            onClick={block}
            disabled={busy !== null}
            className="flex w-full items-start gap-3 rounded-md p-2 text-left hover:bg-red-50 disabled:opacity-50"
          >
            <Ban className="h-4 w-4 mt-0.5 text-red-600" />
            <span>
              <span className="block text-sm font-semibold text-red-600">Block {target.userName}</span>
              <span className="block text-xs text-gray-500">
                Hide their messages and posts and stop them messaging you
              </span>
            </span>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
