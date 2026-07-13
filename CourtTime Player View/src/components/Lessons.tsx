import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Calendar, DollarSign, GraduationCap, MapPin, Users } from 'lucide-react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import { bulletinBoardApi, lessonsApi, unwrapApiPayload } from '../api/client';
import {
  formatSignupFee,
  getLessonPostTypeLabel,
  isPaidSignupPost,
  mapPostFromApi,
  type BulletinPostView,
} from '../utils/bulletinPostDisplay';
import { BulletinActivitySignupModal } from './BulletinActivitySignupModal';
import { toast } from 'sonner';

/**
 * Member Lessons tab (lessons_tab feature flag). Lessons are the same bulletin
 * posts served on the bulletin board and calendar; signup and payment reuse the
 * bulletin signup flow (BulletinActivitySignupModal → Stripe Connect).
 */
export function Lessons() {
  const { user } = useAuth();
  const { selectedFacilityId } = useAppContext();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [lessons, setLessons] = useState<BulletinPostView[]>([]);
  const [signupPostId, setSignupPostId] = useState<string | null>(null);
  const confirmInFlightRef = useRef<string | null>(null);

  const loadLessons = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      setLoading(true);
      const response = await lessonsApi.getLessons(selectedFacilityId, 'upcoming');
      if (response.success) {
        const payload =
          unwrapApiPayload<{ posts?: Record<string, unknown>[] }>(response.data) ??
          (response.data as { posts?: Record<string, unknown>[] } | undefined);
        setLessons((payload?.posts || []).map(mapPostFromApi));
        setUnavailable(false);
      } else {
        setLessons([]);
        setUnavailable(true);
      }
    } catch (err) {
      console.error('Error loading lessons:', err);
      toast.error('Failed to load lessons');
    } finally {
      setLoading(false);
    }
  }, [selectedFacilityId]);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  // Complete paid signups after the Stripe Checkout redirect back to /lessons.
  useEffect(() => {
    const signupSuccess = searchParams.get('signupSuccess');
    const sessionId = searchParams.get('session_id');
    const returnPostId = searchParams.get('postId');
    if (signupSuccess !== '1' || !user?.id) return;

    const finish = () => {
      if (returnPostId) setSignupPostId(returnPostId);
      navigate('/lessons', { replace: true });
    };

    if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}') {
      toast.info('Payment received. Refreshing your signup status…');
      void loadLessons().then(finish);
      return;
    }

    const alreadyDone =
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(`bulletinSignupConfirmed:${sessionId}`) === '1';
    if (alreadyDone) {
      void loadLessons().then(finish);
      return;
    }

    if (confirmInFlightRef.current === sessionId) return;
    confirmInFlightRef.current = sessionId;

    void (async () => {
      try {
        const response = await bulletinBoardApi.confirmSignupPayment(sessionId);
        const payload = unwrapApiPayload<{
          status?: 'confirmed' | 'waitlist';
          waitlistPosition?: number | null;
        }>(response.data);
        if (response.success) {
          sessionStorage.setItem(`bulletinSignupConfirmed:${sessionId}`, '1');
          toast.success(
            response.message ||
              (payload?.status === 'waitlist'
                ? `Payment received — you are on the waitlist (#${payload.waitlistPosition ?? '?'})`
                : 'Payment received — you are signed up!')
          );
        } else {
          toast.error(
            response.error || 'Payment received but signup could not be confirmed. Contact the club.'
          );
        }
      } catch (err) {
        console.error('Confirm signup payment error:', err);
        toast.error('Payment received but signup could not be confirmed. Contact the club.');
      } finally {
        confirmInFlightRef.current = null;
        await loadLessons();
        finish();
      }
    })();
  }, [searchParams, user?.id, navigate, loadLessons]);

  if (!selectedFacilityId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <GraduationCap className="h-12 w-12 mb-3" />
        <p className="text-sm">Select a facility to view lessons.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <GraduationCap className="h-12 w-12 mb-3" />
        <p className="text-sm">Lessons are not available for this facility.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center gap-3">
        <GraduationCap className="h-6 w-6 text-indigo-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Lessons</h1>
      </div>

      {lessons.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-gray-400">
          <Calendar className="h-12 w-12 mb-3" />
          <p className="text-sm">No upcoming lessons yet. Check back soon!</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {lessons.map((lesson) => {
            const maxSpots = lesson.drillMaxParticipants ?? 0;
            const confirmed = lesson.drillConfirmedCount ?? 0;
            const isFull = maxSpots > 0 && confirmed >= maxSpots;
            return (
              <Card
                key={lesson.id}
                className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSignupPostId(lesson.id)}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-semibold text-gray-900 leading-snug">{lesson.title}</h3>
                    <Badge className="shrink-0 bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                      {getLessonPostTypeLabel(lesson)}
                    </Badge>
                  </div>

                  {lesson.description && (
                    <p className="text-sm text-gray-600 line-clamp-2">{lesson.description}</p>
                  )}

                  <div className="space-y-1.5 text-sm text-gray-700">
                    {lesson.drillStartAt && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-gray-400 shrink-0" />
                        <span>
                          {new Date(lesson.drillStartAt).toLocaleString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            hour: 'numeric',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                    )}
                    {lesson.drillCourtName && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-400 shrink-0" />
                        <span>{lesson.drillCourtName}</span>
                      </div>
                    )}
                    {maxSpots > 0 && (
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-gray-400 shrink-0" />
                        <span>
                          {confirmed} / {maxSpots} signed up
                          {(lesson.drillWaitlistCount || 0) > 0 &&
                            ` · ${lesson.drillWaitlistCount} on waitlist`}
                        </span>
                      </div>
                    )}
                    {isPaidSignupPost(lesson) && (
                      <div className="flex items-center gap-2 text-amber-900">
                        <DollarSign className="h-4 w-4 shrink-0" />
                        <span>{formatSignupFee(lesson.signupAmountCents)} to join</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    {lesson.currentUserSignupStatus === 'confirmed' && (
                      <Badge className="bg-green-100 text-green-700 hover:bg-green-100">Signed up</Badge>
                    )}
                    {lesson.currentUserSignupStatus === 'waitlist' && (
                      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                        Waitlist #{lesson.currentUserWaitlistPosition ?? '?'}
                      </Badge>
                    )}
                    {!lesson.currentUserSignupStatus && isFull && (
                      <Badge variant="secondary">Full — waitlist open</Badge>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <BulletinActivitySignupModal
        isOpen={Boolean(signupPostId)}
        postId={signupPostId}
        onClose={() => setSignupPostId(null)}
        onSignupChange={() => void loadLessons()}
        returnPath="lessons"
      />
    </div>
  );
}

export default Lessons;
