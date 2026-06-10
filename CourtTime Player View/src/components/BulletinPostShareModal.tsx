import React, { useEffect, useState } from 'react';
import { Loader2, Mail, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { bulletinBoardApi } from '../api/client';
import { toast } from 'sonner';

export interface BulletinPostShareTarget {
  id: string;
  title: string;
  facilityName?: string;
}

type ShareMode = 'one' | 'all';

interface BulletinPostShareModalProps {
  isOpen: boolean;
  post: BulletinPostShareTarget | null;
  canSendToAllMembers?: boolean;
  onClose: () => void;
}

export function BulletinPostShareModal({
  isOpen,
  post,
  canSendToAllMembers = false,
  onClose,
}: BulletinPostShareModalProps) {
  const [shareMode, setShareMode] = useState<ShareMode>('one');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [personalMessage, setPersonalMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setShareMode('one');
      setRecipientEmail('');
      setPersonalMessage('');
      setSending(false);
    }
  }, [isOpen, post?.id]);

  useEffect(() => {
    if (!canSendToAllMembers && shareMode === 'all') {
      setShareMode('one');
    }
  }, [canSendToAllMembers, shareMode]);

  const handleSend = async () => {
    if (!post) return;

    if (shareMode === 'one') {
      const email = recipientEmail.trim();
      if (!email) {
        toast.error('Enter an email address');
        return;
      }
    }

    setSending(true);
    try {
      const response = await bulletinBoardApi.sharePost(post.id, {
        recipientEmail: shareMode === 'one' ? recipientEmail.trim() : undefined,
        personalMessage: personalMessage.trim() || undefined,
        sendToAllMembers: shareMode === 'all',
      });
      if (response.success) {
        toast.success(response.message || 'Email sent');
        onClose();
      } else {
        toast.error(response.error || 'Could not send email');
      }
    } catch (err) {
      console.error('Share bulletin post error:', err);
      toast.error('Could not send email');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Share by email</DialogTitle>
          <DialogDescription>
            {post
              ? `Send "${post.title}"${post.facilityName ? ` from ${post.facilityName}` : ''} by email.`
              : 'Send this bulletin post by email.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {canSendToAllMembers ? (
            <div className="space-y-3">
              <Label>Send to</Label>
              <RadioGroup
                value={shareMode}
                onValueChange={(value) => setShareMode(value as ShareMode)}
                className="gap-3"
                disabled={sending}
              >
                <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer has-[:checked]:border-green-600 has-[:checked]:bg-green-50">
                  <RadioGroupItem value="one" id="share-mode-one" className="mt-0.5" />
                  <div className="space-y-1">
                    <span className="text-sm font-medium leading-none">One person</span>
                    <p className="text-sm text-gray-500">Email a specific address</p>
                  </div>
                </label>
                <label className="flex items-start gap-3 rounded-lg border p-3 cursor-pointer has-[:checked]:border-green-600 has-[:checked]:bg-green-50">
                  <RadioGroupItem value="all" id="share-mode-all" className="mt-0.5" />
                  <div className="space-y-1">
                    <span className="text-sm font-medium leading-none">All active members</span>
                    <p className="text-sm text-gray-500">
                      Email everyone with an active membership
                      {post?.facilityName ? ` at ${post.facilityName}` : ''}
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>
          ) : null}

          {shareMode === 'one' && (
            <div className="space-y-2">
              <Label htmlFor="share-recipient-email">Recipient email</Label>
              <Input
                id="share-recipient-email"
                type="email"
                autoComplete="email"
                placeholder="friend@example.com"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                disabled={sending}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="share-personal-message">Personal message (optional)</Label>
            <Textarea
              id="share-personal-message"
              placeholder="Add a short note..."
              rows={3}
              value={personalMessage}
              onChange={(e) => setPersonalMessage(e.target.value)}
              disabled={sending}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button onClick={() => void handleSend()} disabled={sending || !post}>
            {sending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Sending...
              </>
            ) : shareMode === 'all' ? (
              <>
                <Users className="h-4 w-4 mr-2" />
                Email all members
              </>
            ) : (
              <>
                <Mail className="h-4 w-4 mr-2" />
                Send email
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
