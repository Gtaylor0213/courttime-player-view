import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, DollarSign, Loader2, MapPin, Users } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { bulletinBoardApi, unwrapApiPayload } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { getBookingTypeBadgeColor, getBookingTypeLabel } from '../constants/bookingTypes';
import { toast } from 'sonner';
import {
  bulletinSignupReturnUrls,
  EVENT_SIGNUP_TYPES,
  formatSignupFee,
  isPaidSignupPost,
  mapPostFromApi,
  type BulletinPostView,
} from '../utils/bulletinPostDisplay';

interface BulletinActivitySignupModalProps {
  isOpen: boolean;
  postId: string | null;
  onClose: () => void;
  onSignupChange?: () => void;
  /** Where Stripe returns after paid signup */
  returnPath?: 'calendar' | 'bulletin-board';
}

export function BulletinActivitySignupModal({
  isOpen,
  postId,
  onClose,
  onSignupChange,
  returnPath = 'calendar',
}: BulletinActivitySignupModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [post, setPost] = useState<BulletinPostView | null>(null);

  const loadPost = useCallback(async () => {
    if (!postId) return;
    setLoading(true);
    try {
      const response = await bulletinBoardApi.getPost(postId);
      const rawPost = (response as { post?: Record<string, unknown> }).post;
      if (response.success && rawPost) {
        setPost(mapPostFromApi(rawPost));
      } else {
        toast.error(response.error || 'Could not load event');
        onClose();
      }
    } catch (err) {
      console.error('Load bulletin post error:', err);
      toast.error('Could not load event');
      onClose();
    } finally {
      setLoading(false);
    }
  }, [postId, onClose]);

  useEffect(() => {
    if (isOpen && postId) {
      void loadPost();
    } else {
      setPost(null);
    }
  }, [isOpen, postId, loadPost]);

  const isOrganizer = Boolean(post?.authorId && user?.id && post.authorId === user.id);
  const maxSpots = post?.maxParticipants ?? post?.drillMaxParticipants ?? 0;
  const confirmed = post?.drillConfirmedCount ?? 0;
  const isFull = maxSpots > 0 && confirmed >= maxSpots;

  const handleSignup = async () => {
    if (!postId) return;
    setSubmitting(true);
    try {
      const { successUrl, cancelUrl } = bulletinSignupReturnUrls(postId, returnPath);
      const response = await bulletinBoardApi.signupForDrill(postId, { successUrl, cancelUrl });
      if (response.success) {
        const signupPayload = unwrapApiPayload<{ checkoutUrl?: string }>(response.data);
        if (signupPayload?.checkoutUrl) {
          window.location.href = signupPayload.checkoutUrl;
          return;
        }
        toast.success(response.message || 'You are signed up!');
        await loadPost();
        onSignupChange?.();
      } else {
        toast.error(response.error || 'Unable to sign up');
      }
    } catch (err) {
      console.error('Signup error:', err);
      toast.error('Failed to process signup');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelSignup = async () => {
    if (!postId) return;
    setSubmitting(true);
    try {
      const response = await bulletinBoardApi.cancelDrillSignup(postId);
      if (response.success) {
        toast.success('Signup cancelled');
        await loadPost();
        onSignupChange?.();
      } else {
        toast.error(response.error || 'Unable to cancel signup');
      }
    } catch (err) {
      console.error('Cancel signup error:', err);
      toast.error('Failed to cancel signup');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 pr-6">
            {post ? (
              <>
                <Badge className={getBookingTypeBadgeColor(post.type)}>
                  {getBookingTypeLabel(post.type)}
                </Badge>
                <span className="truncate">{post.title}</span>
              </>
            ) : (
              'Club event'
            )}
          </DialogTitle>
          <DialogDescription>
            {isOrganizer
              ? 'You scheduled this event. Members can sign up from the bulletin board or calendar.'
              : 'Sign up to join this clinic, drill, or event.'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
          </div>
        ) : post ? (
          <div className="space-y-4 py-1">
            {post.description && (
              <p className="text-sm text-gray-700">{post.description}</p>
            )}

            <div className="rounded-lg border bg-blue-50/50 p-3 space-y-2 text-sm">
              {post.drillStartAt && (
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-gray-500 shrink-0" />
                  <span>
                    {new Date(post.drillStartAt).toLocaleString('en-US', {
                      weekday: 'short',
                      month: 'long',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              )}
              {post.drillCourtName && (
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gray-500 shrink-0" />
                  <span>{post.drillCourtName}</span>
                </div>
              )}
              {maxSpots > 0 && (
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-gray-500 shrink-0" />
                  <span>
                    {confirmed} / {maxSpots} signed up
                    {(post.drillWaitlistCount || 0) > 0 &&
                      ` · ${post.drillWaitlistCount} on waitlist`}
                  </span>
                </div>
              )}
              {isPaidSignupPost(post) && (
                <div className="flex items-center gap-2 text-amber-900">
                  <DollarSign className="h-4 w-4 shrink-0" />
                  <span>Paid signup · {formatSignupFee(post.signupAmountCents)}</span>
                </div>
              )}
            </div>

            {post.signupBlockedReason && !post.currentUserSignupStatus && !isOrganizer && (
              <p className="text-sm text-red-600">{post.signupBlockedReason}</p>
            )}
          </div>
        ) : null}

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto">
            Close
          </Button>
          {post && EVENT_SIGNUP_TYPES.has(post.type) && !isOrganizer && (
            <>
              {post.currentUserSignupStatus ? (
                <Button
                  variant="outline"
                  className="w-full sm:flex-1"
                  disabled={submitting}
                  onClick={() => void handleCancelSignup()}
                >
                  {post.currentUserSignupStatus === 'waitlist'
                    ? `Leave waitlist (#${post.currentUserWaitlistPosition ?? '?'})`
                    : 'Cancel signup'}
                </Button>
              ) : (
                <Button
                  className="w-full sm:flex-1"
                  disabled={submitting || post.currentUserCanSignup === false}
                  onClick={() => void handleSignup()}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing…
                    </>
                  ) : isFull ? (
                    isPaidSignupPost(post)
                      ? `Join waitlist — ${formatSignupFee(post.signupAmountCents)}`
                      : 'Join waitlist'
                  ) : isPaidSignupPost(post) ? (
                    `Pay & sign up — ${formatSignupFee(post.signupAmountCents)}`
                  ) : (
                    'Sign up'
                  )}
                </Button>
              )}
            </>
          )}
          {isOrganizer && post && (
            <Button
              variant="secondary"
              className="w-full sm:flex-1"
              onClick={() => {
                onClose();
                navigate(`/bulletin-board?postId=${encodeURIComponent(post.id)}`);
              }}
            >
              Open on bulletin board
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
