import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { Calendar, Clock, Users, MapPin, Tag, Pin, AlertCircle, Plus, X, Trash2, DollarSign } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import {
  bulletinBoardApi,
  playerProfileApi,
  facilitiesApi,
  stripeConnectApi,
  unwrapApiPayload,
  extractBulletinPosts,
  parseApiBoolean,
} from '../api/client';
import { formatCentsAsUsd, parseDollarsToCents } from '../../shared/utils/money';
import { toast } from 'sonner';


interface BulletinPost {
  id: string;
  title: string;
  description: string;
  type: 'event' | 'clinic' | 'tournament' | 'social' | 'announcement' | 'drill';
  eventDate?: string;
  eventTime?: string;
  location?: string;
  facilityId: string;
  facilityName: string;
  maxParticipants?: number;
  minParticipants?: number;
  cancelIfMinNotMet?: boolean;
  drillMaxParticipants?: number;
  currentParticipants?: number;
  drillCourtId?: string;
  drillCourtName?: string;
  drillStartAt?: string;
  drillGenderRestriction?: 'any' | 'male_only' | 'female_only';
  drillShowParticipants?: boolean;
  drillConfirmedCount?: number;
  drillWaitlistCount?: number;
  currentUserSignupStatus?: 'confirmed' | 'waitlist' | null;
  currentUserWaitlistPosition?: number | null;
  currentUserCanSignup?: boolean;
  signupBlockedReason?: string | null;
  requirePayment?: boolean;
  signupAmountCents?: number | null;
  participants?: Array<{ userId: string; fullName: string; status: 'confirmed' | 'waitlist'; waitlistPosition: number | null }>;
  isPinned: boolean;
  createdAt: string;
  authorName: string;
}

const typeIcons = {
  event: Calendar,
  clinic: Users,
  tournament: Tag,
  social: Users,
  announcement: AlertCircle
  ,drill: Users
};

const typeColors: Record<string, string> = {
  event: 'bg-green-500',
  clinic: 'bg-green-500',
  tournament: 'bg-purple-500',
  social: 'bg-pink-500',
  announcement: 'bg-orange-500'
  ,drill: 'bg-blue-500'
};
const eventSignupTypes = new Set(['event', 'drill', 'social', 'clinic', 'tournament']);
const recurringEligibleTypes = new Set(['drill', 'clinic']);

const emptyNewPost = {
  title: '',
  description: '',
  type: 'announcement' as 'event' | 'clinic' | 'tournament' | 'social' | 'announcement' | 'drill',
  eventDate: '',
  eventTime: '',
  location: '',
  maxParticipants: '',
  minParticipants: '',
  cancelIfMinNotMet: false,
  drillCourtId: '',
  drillGenderRestriction: 'any' as 'any' | 'male_only' | 'female_only',
  drillShowParticipants: false,
  facilityId: '',
  expiresInDays: '' as string,
  recurrenceEnabled: false,
  recurrenceFrequency: 'weekly' as 'daily' | 'weekly' | 'biweekly',
  recurrenceEndType: 'date' as 'date' | 'occurrences',
  recurrenceEndDate: '',
  recurrenceOccurrences: '4',
  requirePayment: false,
  signupFeeDollars: '',
};

function isPaidSignupPost(post: { requirePayment?: boolean; signupAmountCents?: number | null }) {
  const cents = post.signupAmountCents != null ? Number(post.signupAmountCents) : 0;
  if (!Number.isFinite(cents) || cents <= 0) return false;
  if (post.requirePayment === false) return false;
  return parseApiBoolean(post.requirePayment ?? true) || cents > 0;
}

function bulletinSignupReturnUrls(postId: string) {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const base = origin || '';
  return {
    successUrl: `${base}/bulletin-board?signupSuccess=1&postId=${encodeURIComponent(postId)}&session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${base}/bulletin-board?postId=${encodeURIComponent(postId)}`,
  };
}

function formatSignupFee(cents?: number | null) {
  if (!cents) return '';
  return formatCentsAsUsd(cents);
}

export function BulletinBoard() {
  const [searchParams] = useSearchParams();
  const clubId = searchParams.get('clubId') || undefined;
  const clubName = searchParams.get('clubName') || undefined;
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedFacilityId } = useAppContext();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<BulletinPost[]>([]);
  const [memberFacilities, setMemberFacilities] = useState<any[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');
  // Use clubId from URL params if present, otherwise use sidebar facility selection
  const selectedFacility = clubId || selectedFacilityId || 'all';
  const [selectedPost, setSelectedPost] = useState<BulletinPost | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [courtsByFacility, setCourtsByFacility] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [stripeOnboardedByFacility, setStripeOnboardedByFacility] = useState<Record<string, boolean>>({});
  const [stripeStatusLoadingByFacility, setStripeStatusLoadingByFacility] = useState<Record<string, boolean>>({});
  const [newPost, setNewPost] = useState({ ...emptyNewPost });
  const loadSeqRef = useRef(0);
  const confirmInFlightRef = useRef<string | null>(null);

  // Check if user is admin of any facility
  const adminFacilities = useMemo(() => {
    const fromProfile = memberFacilities.filter((f: any) => f.isFacilityAdmin);
    const seen = new Set(fromProfile.map((f: any) => f.facilityId));
    const extras = (user?.adminFacilities || [])
      .filter((id) => !seen.has(id))
      .map((id) => {
        const member = memberFacilities.find((f: any) => f.facilityId === id);
        return (
          member || {
            facilityId: id,
            facilityName: 'Your facility',
            membershipType: 'Admin',
            status: 'active',
            isFacilityAdmin: true,
          }
        );
      });
    return [...fromProfile, ...extras];
  }, [memberFacilities, user?.adminFacilities]);

  const isAdmin = adminFacilities.length > 0 || (user?.adminFacilities?.length ?? 0) > 0;

  // Map database response to frontend BulletinPost interface
  const mapPostFromApi = (post: any): BulletinPost => ({
    id: post.id,
    title: post.title,
    description: post.content || post.description || '',
    type: post.category || post.type || 'announcement',
    eventDate: post.eventDate || post.postedDate,
    eventTime: post.eventTime,
    location: post.location,
    facilityId: post.facilityId,
    facilityName: post.facilityName || '',
    maxParticipants: post.maxParticipants,
    minParticipants: post.minParticipants,
    cancelIfMinNotMet: post.cancelIfMinNotMet,
    drillMaxParticipants: post.drillMaxParticipants,
    currentParticipants: post.currentParticipants,
    drillCourtId: post.drillCourtId,
    drillCourtName: post.drillCourtName,
    drillStartAt: post.drillStartAt,
    drillGenderRestriction: post.drillGenderRestriction,
    drillShowParticipants: post.drillShowParticipants,
    drillConfirmedCount: post.drillConfirmedCount,
    drillWaitlistCount: post.drillWaitlistCount,
    currentUserSignupStatus: post.currentUserSignupStatus,
    currentUserWaitlistPosition: post.currentUserWaitlistPosition,
    currentUserCanSignup: post.currentUserCanSignup,
    signupBlockedReason: post.signupBlockedReason,
    requirePayment: parseApiBoolean(post.requirePayment ?? post.require_payment),
    signupAmountCents:
      post.signupAmountCents != null && post.signupAmountCents !== ''
        ? Number(post.signupAmountCents)
        : post.signup_amount_cents != null
          ? Number(post.signup_amount_cents)
          : null,
    participants: post.participants || [],
    isPinned: post.isPinned || false,
    createdAt: post.createdAt,
    authorName: post.authorName || 'Unknown'
  });

  const loadData = useCallback(async (): Promise<BulletinPost[]> => {
    if (!user?.id) return [];

    const seq = ++loadSeqRef.current;

    try {
      setLoading(true);

      const profileResponse = await playerProfileApi.getProfile(user.id);

      let activeFacilities: any[] = [];
      const facilities =
        profileResponse.data?.profile?.memberFacilities ||
        profileResponse.data?.memberFacilities ||
        [];

      activeFacilities = facilities.filter((f: any) => f.status === 'active');

      if (activeFacilities.length === 0 && user.memberFacilities && user.memberFacilities.length > 0) {
        for (const facilityId of user.memberFacilities) {
          try {
            const facilityResponse = await facilitiesApi.getById(facilityId);
            if (facilityResponse.success && facilityResponse.data?.facility) {
              activeFacilities.push({
                facilityId: facilityResponse.data.facility.id,
                facilityName: facilityResponse.data.facility.name,
                membershipType: 'Member',
                status: 'active',
                isFacilityAdmin: user.adminFacilities?.includes(facilityId) || false,
              });
            }
          } catch (err) {
            console.error('Error fetching facility details:', err);
          }
        }
      }

      if (seq !== loadSeqRef.current) return [];

      setMemberFacilities(activeFacilities);

      let loadedPosts: BulletinPost[] = [];

      if (selectedFacility === 'all') {
        if (activeFacilities.length > 0) {
          for (const facility of activeFacilities) {
            const response = await bulletinBoardApi.getPosts(facility.facilityId);
            const rawPosts = extractBulletinPosts(response.data);
            if (response.success) {
              loadedPosts.push(
                ...rawPosts.map((p: any) => ({
                  ...mapPostFromApi(p),
                  facilityName: facility.facilityName,
                }))
              );
            }
          }
        }
      } else {
        const isMember = activeFacilities.some((f: any) => f.facilityId === selectedFacility);
        if (!isMember) {
          if (seq === loadSeqRef.current) setPosts([]);
          return [];
        }
        const response = await bulletinBoardApi.getPosts(selectedFacility);
        const rawPosts = extractBulletinPosts(response.data);
        if (response.success) {
          const facility = activeFacilities.find((f: any) => f.facilityId === selectedFacility);
          loadedPosts = rawPosts.map((p: any) => ({
            ...mapPostFromApi(p),
            facilityName: facility?.facilityName || '',
          }));
        }
      }

      if (seq !== loadSeqRef.current) return [];

      setPosts(loadedPosts);
      return loadedPosts;
    } catch (error) {
      console.error('Error loading bulletin board data:', error);
      toast.error('Failed to load bulletin board');
      return [];
    } finally {
      if (seq === loadSeqRef.current) {
        setLoading(false);
      }
    }
  }, [user?.id, user?.memberFacilities, user?.adminFacilities, selectedFacility]);

  useEffect(() => {
    if (!user?.id) return;
    loadData();
  }, [user?.id, selectedFacility, loadData]);

  // Keep detail modal in sync after refresh (e.g. paid flags, signup status).
  useEffect(() => {
    if (!selectedPost) return;
    const updated = posts.find((p) => p.id === selectedPost.id);
    if (updated) setSelectedPost(updated);
  }, [posts, selectedPost?.id]);

  useEffect(() => {
    const signupSuccess = searchParams.get('signupSuccess');
    const sessionId = searchParams.get('session_id');
    const returnPostId = searchParams.get('postId');
    if (signupSuccess !== '1' || !user?.id) return;

    const clearReturnParams = () => {
      navigate('/bulletin-board', { replace: true });
    };

    const openPostAfterLoad = (loaded: BulletinPost[], openId?: string | null) => {
      if (!openId) return;
      const post = loaded.find((p) => p.id === openId);
      if (post) setSelectedPost(post);
    };

    if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}') {
      toast.info('Payment received. Refreshing your signup status…');
      void loadData().then((loaded) => {
        openPostAfterLoad(loaded, returnPostId);
        clearReturnParams();
      });
      return;
    }

    const alreadyDone =
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem(`bulletinSignupConfirmed:${sessionId}`) === '1';
    if (alreadyDone) {
      void loadData().then((loaded) => {
        openPostAfterLoad(loaded, returnPostId);
        clearReturnParams();
      });
      return;
    }

    if (confirmInFlightRef.current === sessionId) return;
    confirmInFlightRef.current = sessionId;

    let cancelled = false;
    (async () => {
      try {
        const response = await bulletinBoardApi.confirmSignupPayment(sessionId);
        if (cancelled) return;
        const payload = unwrapApiPayload<{
          status?: 'confirmed' | 'waitlist';
          waitlistPosition?: number | null;
          bulletinPostId?: string;
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
        const loaded = await loadData();
        if (!cancelled) {
          openPostAfterLoad(loaded, returnPostId || payload?.bulletinPostId);
        }
      } catch (err) {
        console.error('Confirm signup payment error:', err);
        if (!cancelled) {
          toast.error('Payment received but signup could not be confirmed. Contact the club.');
          await loadData();
        }
      } finally {
        confirmInFlightRef.current = null;
        if (!cancelled) clearReturnParams();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, user?.id, navigate, loadData]);

  const handleCreatePost = async () => {
    if (!user?.id || !newPost.title || !newPost.description) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!newPost.facilityId) {
      toast.error('Please select a facility for this post');
      return;
    }

    if (eventSignupTypes.has(newPost.type) && (!newPost.eventDate || !newPost.eventTime || !newPost.drillCourtId)) {
      toast.error('This post type requires date/time and court');
      return;
    }
    if (newPost.cancelIfMinNotMet && !newPost.minParticipants) {
      toast.error('Set Min Participants when auto-cancel is enabled');
      return;
    }
    if (newPost.recurrenceEnabled && recurringEligibleTypes.has(newPost.type)) {
      if (newPost.recurrenceEndType === 'date' && !newPost.recurrenceEndDate) {
        toast.error('Set a recurrence end date');
        return;
      }
      if (newPost.recurrenceEndType === 'occurrences' && !newPost.recurrenceOccurrences) {
        toast.error('Set number of recurrence occurrences');
        return;
      }
    }
    const signupFeeCents =
      eventSignupTypes.has(newPost.type) && newPost.requirePayment
        ? parseDollarsToCents(newPost.signupFeeDollars)
        : 0;
    if (newPost.requirePayment) {
      if (!signupFeeCents || signupFeeCents <= 0) {
        toast.error('Enter a signup fee greater than $0');
        return;
      }
    }

    const wantsPaidSignup =
      eventSignupTypes.has(newPost.type) && newPost.requirePayment && signupFeeCents > 0;

    try {
      setIsSubmitting(true);
      const parsedMaxParticipants = newPost.maxParticipants ? parseInt(newPost.maxParticipants) : undefined;
      const expiresAfterEvent = newPost.expiresInDays === 'after_event';
      const response = await bulletinBoardApi.create({
        facilityId: newPost.facilityId,
        authorId: user.id,
        title: newPost.title,
        content: newPost.description,
        category: newPost.type,
        isAdminPost: true,
        ...(expiresAfterEvent
          ? { expiresAfterEvent: true }
          : (newPost.expiresInDays ? { expiresInDays: parseInt(newPost.expiresInDays) } : {})),
        ...(eventSignupTypes.has(newPost.type)
          ? {
              drillStartAt: new Date(`${newPost.eventDate}T${newPost.eventTime}`).toISOString(),
              drillCourtId: newPost.drillCourtId,
              ...(typeof parsedMaxParticipants === 'number' && !Number.isNaN(parsedMaxParticipants)
                ? { drillMaxParticipants: parsedMaxParticipants }
                : {}),
              drillGenderRestriction: newPost.drillGenderRestriction,
              drillShowParticipants: newPost.drillShowParticipants
            }
          : {}),
        ...(eventSignupTypes.has(newPost.type) && newPost.minParticipants
          ? { minParticipants: parseInt(newPost.minParticipants) }
          : {}),
        ...(eventSignupTypes.has(newPost.type)
          ? { cancelIfMinNotMet: Boolean(newPost.cancelIfMinNotMet) }
          : {}),
        ...(wantsPaidSignup
          ? {
              requirePayment: true,
              signupAmountCents: signupFeeCents,
              signupFeeDollars: newPost.signupFeeDollars,
            }
          : {}),
        ...(newPost.recurrenceEnabled && recurringEligibleTypes.has(newPost.type)
          ? {
              recurrence: {
                frequency: newPost.recurrenceFrequency,
                ...(newPost.recurrenceEndType === 'date'
                  ? { endDate: newPost.recurrenceEndDate }
                  : { occurrenceCount: parseInt(newPost.recurrenceOccurrences) })
              }
            }
          : {}),
      });

      if (response.success) {
        toast.success('Post created successfully!');
        closeCreateModal();
        // Reload posts
        loadData();
      } else {
        toast.error(response.error || 'Failed to create post');
      }
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Failed to create post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCreateModal = () => {
    const adminIds = user?.adminFacilities || [];
    const defaultFacility =
      selectedFacility !== 'all' &&
      (adminFacilities.some((f) => f.facilityId === selectedFacility) || adminIds.includes(selectedFacility))
        ? selectedFacility
        : adminFacilities[0]?.facilityId || adminIds[0] || '';

    setNewPost({ ...emptyNewPost, facilityId: defaultFacility, type: 'drill' });
    setShowCreateModal(true);
    if (defaultFacility) {
      void loadStripeStatusForFacility(defaultFacility);
    }
  };

  const closeCreateModal = () => {
    setShowCreateModal(false);
    setNewPost({ ...emptyNewPost });
  };

  const loadCourtsForFacility = async (facilityId: string) => {
    if (!facilityId || courtsByFacility[facilityId]) return;
    try {
      const response = await facilitiesApi.getCourts(facilityId);
      if (response.success && response.data?.courts) {
        const courts = response.data.courts.map((court: any) => ({ id: court.id, name: court.name }));
        setCourtsByFacility((prev) => ({ ...prev, [facilityId]: courts }));
      }
    } catch (error) {
      console.error('Error loading courts:', error);
      toast.error('Failed to load courts for selected facility');
    }
  };

  useEffect(() => {
    if (showCreateModal && newPost.facilityId) {
      loadCourtsForFacility(newPost.facilityId);
      loadStripeStatusForFacility(newPost.facilityId);
    }
  }, [showCreateModal, newPost.facilityId]);

  const loadStripeStatusForFacility = async (facilityId: string): Promise<boolean> => {
    if (!facilityId) return false;
    setStripeStatusLoadingByFacility((prev) => ({ ...prev, [facilityId]: true }));
    try {
      const res = await stripeConnectApi.getStatus(facilityId);
      if (res.success) {
        const statusPayload =
          unwrapApiPayload<{ onboarded?: boolean; chargesEnabled?: boolean }>(res.data) ??
          (res.data as { onboarded?: boolean; chargesEnabled?: boolean } | undefined);
        const onboarded = Boolean(statusPayload?.onboarded ?? statusPayload?.chargesEnabled);
        setStripeOnboardedByFacility((prev) => ({ ...prev, [facilityId]: onboarded }));
        return onboarded;
      }
      setStripeOnboardedByFacility((prev) => ({ ...prev, [facilityId]: false }));
      return false;
    } catch (err) {
      console.error('Stripe Connect status check failed:', err);
      return false;
    } finally {
      setStripeStatusLoadingByFacility((prev) => ({ ...prev, [facilityId]: false }));
    }
  };

  const isStripeReadyForFacility = (facilityId: string) =>
    stripeOnboardedByFacility[facilityId] === true;

  const isStripeStatusLoading = (facilityId: string) =>
    Boolean(facilityId && stripeStatusLoadingByFacility[facilityId]);

  const handleDeletePost = async (postId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this post?')) return;

    try {
      const response = await bulletinBoardApi.delete(postId, user?.id || '', true);
      if (response.success) {
        toast.success('Post deleted');
        setSelectedPost(null);
        loadData();
      } else {
        toast.error(response.error || 'Failed to delete post');
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Failed to delete post');
    }
  };

  const handleDrillSignup = async (postId: string) => {
    try {
      const { successUrl, cancelUrl } = bulletinSignupReturnUrls(postId);
      const response = await bulletinBoardApi.signupForDrill(postId, { successUrl, cancelUrl });
      if (response.success) {
        const signupPayload = unwrapApiPayload<{
          checkoutUrl?: string;
          requiresPayment?: boolean;
        }>(response.data);
        if (signupPayload?.checkoutUrl) {
          window.location.href = signupPayload.checkoutUrl;
          return;
        }
        toast.success(response.message || 'Signup updated');
        loadData();
      } else {
        toast.error(response.error || 'Unable to sign up');
      }
    } catch (error) {
      console.error('Drill signup error:', error);
      toast.error('Failed to process signup');
    }
  };

  const handleCancelDrillSignup = async (postId: string) => {
    try {
      const response = await bulletinBoardApi.cancelDrillSignup(postId);
      if (response.success) {
        toast.success('Signup cancelled');
        loadData();
      } else {
        toast.error(response.error || 'Unable to cancel signup');
      }
    } catch (error) {
      console.error('Cancel signup error:', error);
      toast.error('Failed to cancel signup');
    }
  };

  const handleAdminRemoveSignup = async (postId: string, memberUserId: string) => {
    try {
      const response = await bulletinBoardApi.adminRemoveDrillSignup(postId, memberUserId);
      if (response.success) {
        toast.success('Member removed');
        loadData();
      } else {
        toast.error(response.error || 'Unable to remove member');
      }
    } catch (error) {
      console.error('Admin remove signup error:', error);
      toast.error('Failed to remove member');
    }
  };

  // Filter by type
  let filteredPosts = posts;
  if (selectedType !== 'all') {
    filteredPosts = filteredPosts.filter(post => post.type === selectedType);
  }

  // Sort: pinned first, then by date
  filteredPosts = filteredPosts.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const TypeIcon = selectedPost ? typeIcons[selectedPost.type] : Calendar;

  const hasNoFacilities = memberFacilities.length === 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium">Loading bulletin board...</div>
        </div>
      </div>
    );
  }

  return (
    <>
        {/* Content */}
        <div className="p-4 md:p-8 max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-medium text-gray-900">Bulletin Board</h1>
              <p className="text-sm text-gray-600">
                {hasNoFacilities
                  ? 'Join a facility to see events and announcements'
                  : 'Events, clinics, and announcements from your clubs'}
              </p>
            </div>
            {!hasNoFacilities && (
              <div className="flex items-center gap-3">
                {isAdmin && (
                  <Button onClick={openCreateModal} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Post
                  </Button>
                )}
                <NotificationBell />
              </div>
            )}
          </div>
          {/* No Facility Alert */}
          {hasNoFacilities && (
            <Card className="mb-6 border-green-200 bg-green-50">
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <AlertCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-medium text-green-900 mb-1">No Facility Membership</h3>
                    <p className="text-sm text-green-800 mb-3">
                      You're not currently a member of any facility. Request membership to see events and announcements.
                    </p>
                    <Button
                      onClick={() => navigate('/profile')}
                      size="sm"
                    >
                      Request Membership
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Filter Tabs */}
          {!hasNoFacilities && (
            <div className="mb-6 flex gap-2 flex-wrap">
              <Button
                variant={selectedType === 'all' ? 'default' : 'outline'}
                onClick={() => setSelectedType('all')}
                className="rounded-full"
              >
                All Posts
              </Button>
              <Button
                variant={selectedType === 'event' ? 'default' : 'outline'}
                onClick={() => setSelectedType('event')}
                className="rounded-full"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Events
              </Button>
              <Button
                variant={selectedType === 'clinic' ? 'default' : 'outline'}
                onClick={() => setSelectedType('clinic')}
                className="rounded-full"
              >
                <Users className="h-4 w-4 mr-2" />
                Clinics
              </Button>
              <Button
                variant={selectedType === 'tournament' ? 'default' : 'outline'}
                onClick={() => setSelectedType('tournament')}
                className="rounded-full"
              >
                <Tag className="h-4 w-4 mr-2" />
                Tournaments
              </Button>
              <Button
                variant={selectedType === 'social' ? 'default' : 'outline'}
                onClick={() => setSelectedType('social')}
                className="rounded-full"
              >
                <Users className="h-4 w-4 mr-2" />
                Social
              </Button>
              <Button
                variant={selectedType === 'announcement' ? 'default' : 'outline'}
                onClick={() => setSelectedType('announcement')}
                className="rounded-full"
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Announcements
              </Button>
              <Button
                variant={selectedType === 'drill' ? 'default' : 'outline'}
                onClick={() => setSelectedType('drill')}
                className="rounded-full"
              >
                <Users className="h-4 w-4 mr-2" />
                Drills
              </Button>
            </div>
          )}

          {/* Bulletin Board Posts */}
          {!hasNoFacilities && (
            <div className="space-y-4">
              {/* Empty State */}
              {filteredPosts.length === 0 && (
                <Card className="p-4 md:p-8 text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No posts yet</h3>
                  <p className="text-sm text-gray-500">
                    {selectedType === 'all'
                      ? 'Check back later for events and announcements from your facilities.'
                      : `No ${selectedType} posts at the moment.`}
                  </p>
                </Card>
              )}

              {/* Posts Grid */}
              {filteredPosts.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredPosts.map((post) => {
                    const Icon = typeIcons[post.type] || AlertCircle;
                    const bgColor = {
                      event: 'bg-green-50 border-green-100',
                      clinic: 'bg-green-50 border-green-100',
                      tournament: 'bg-purple-50 border-purple-100',
                      social: 'bg-pink-50 border-pink-100',
                      announcement: 'bg-orange-50 border-orange-100',
                      drill: 'bg-blue-50 border-blue-100'
                    }[post.type] || 'bg-gray-50 border-gray-100';
                    const confirmedSignups = (post.participants || []).filter((p) => p.status === 'confirmed');
                    const isAdminForPostFacility = adminFacilities.some((f: any) => f.facilityId === post.facilityId);
                    const showSignupRosterOnCard =
                      eventSignupTypes.has(post.type) &&
                      (post.drillShowParticipants || isAdminForPostFacility) &&
                      confirmedSignups.length > 0;
                    const rosterListSize = Math.min(Math.max(confirmedSignups.length, 2), 6);

                    return (
                      <Card
                        key={post.id}
                        className={`${bgColor} border hover:shadow-md transition-shadow cursor-pointer`}
                        onClick={() => setSelectedPost(post)}
                      >
                        <div className="p-6">
                          {/* Header with type badge */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {post.isPinned && (
                                  <Pin className="h-3.5 w-3.5 text-red-500 fill-red-500 flex-shrink-0" />
                                )}
                                <h3 className="font-semibold text-gray-900 truncate">{post.title}</h3>
                              </div>
                              <p className="text-xs text-gray-500">{post.facilityName}</p>
                            </div>
                            <div className="flex flex-col items-end gap-1 flex-shrink-0">
                              <Badge variant="outline" className="text-gray-700 text-xs capitalize bg-white/80">
                                <Icon className={`h-3 w-3 mr-1 ${typeColors[post.type]?.replace('bg-', 'text-') || 'text-gray-500'}`} />
                                {post.type}
                              </Badge>
                              {isPaidSignupPost(post) && (
                                <Badge className="bg-amber-100 text-amber-900 border-amber-200 text-xs">
                                  <DollarSign className="h-3 w-3 mr-1" />
                                  {formatSignupFee(post.signupAmountCents)} to join
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Description */}
                          <p className="text-sm text-gray-600 line-clamp-2 mb-4">{post.description}</p>

                          {/* Event Details */}
                          {post.eventDate && (
                            <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                <span>{new Date(post.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              </div>
                              {post.eventTime && (
                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-4 w-4 text-gray-400" />
                                  <span>{post.eventTime}</span>
                                </div>
                              )}
                            </div>
                          )}
                          {eventSignupTypes.has(post.type) && post.drillStartAt && (
                            <div className="text-xs text-gray-600 mb-2">
                              {new Date(post.drillStartAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                            </div>
                          )}

                          {showSignupRosterOnCard && (
                            <div
                              className="mb-3"
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => e.stopPropagation()}
                            >
                              <label className="mb-1 block text-xs font-medium text-gray-700">
                                Signed up so far ({confirmedSignups.length})
                              </label>
                              <select
                                className="w-full rounded-md border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-800 shadow-sm disabled:cursor-default disabled:opacity-100"
                                size={rosterListSize}
                                disabled
                                aria-readonly="true"
                                tabIndex={-1}
                                title="Who has signed up"
                              >
                                {confirmedSignups.map((p) => (
                                  <option key={p.userId} value={p.userId}>
                                    {p.fullName}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}

                          {/* Footer */}
                          <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                            <span className="text-xs text-gray-500">
                              Posted by {post.authorName}
                            </span>
                            <div className="flex items-center gap-2">
                              {isAdmin && (
                                <button
                                  onClick={(e) => handleDeletePost(post.id, e)}
                                  className="text-gray-400 hover:text-red-500 transition-colors"
                                  title="Delete post"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                              <span className="text-xs text-gray-400">
                                {new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

      {/* Detail Modal */}
      {selectedPost && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPost(null)}
        >
          <Card
            className="max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`${typeColors[selectedPost.type]} p-2 rounded-lg`}>
                      <TypeIcon className="h-5 w-5 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold">{selectedPost.title}</h2>
                  </div>
                  <Badge className="capitalize">{selectedPost.type}</Badge>
                  {isPaidSignupPost(selectedPost) && (
                    <Badge className="mt-2 bg-amber-100 text-amber-900 border-amber-200">
                      <DollarSign className="h-3.5 w-3.5 mr-1" />
                      Paid signup · {formatSignupFee(selectedPost.signupAmountCents)}
                    </Badge>
                  )}
                </div>
                <Button variant="ghost" onClick={() => setSelectedPost(null)}>
                  ✕
                </Button>
              </div>

              {/* Content */}
              <div className="space-y-6">
                <p className="text-gray-700 text-base">{selectedPost.description}</p>

                {eventSignupTypes.has(selectedPost.type) && isPaidSignupPost(selectedPost) && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-medium text-amber-900">
                      Card payment required — {formatSignupFee(selectedPost.signupAmountCents)} due at signup
                    </p>
                  </div>
                )}
                {eventSignupTypes.has(selectedPost.type) && (
                  <div className="rounded-lg border p-4 bg-blue-50/50">
                    <h3 className="font-semibold text-gray-900 mb-3">Event Details</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                      <div><span className="text-gray-500">Date & Time:</span> <span className="font-medium">{selectedPost.drillStartAt ? new Date(selectedPost.drillStartAt).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'TBD'}</span></div>
                      <div><span className="text-gray-500">Court:</span> <span className="font-medium">{selectedPost.drillCourtName || 'TBD'}</span></div>
                      <div><span className="text-gray-500">Spots:</span> <span className="font-medium">{selectedPost.drillConfirmedCount || 0} / {selectedPost.maxParticipants || selectedPost.drillMaxParticipants || 0}</span></div>
                      {selectedPost.minParticipants && (
                        <div><span className="text-gray-500">Minimum:</span> <span className="font-medium">{selectedPost.minParticipants}</span></div>
                      )}
                      <div><span className="text-gray-500">Waitlist:</span> <span className="font-medium">{selectedPost.drillWaitlistCount || 0}</span></div>
                    </div>
                  </div>
                )}

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    {selectedPost.eventDate && (
                      <div className="flex items-start">
                        <Calendar className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                        <div>
                          <p className="text-sm text-gray-500">Date</p>
                          <p className="font-medium">{new Date(selectedPost.eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                        </div>
                      </div>
                    )}
                    {selectedPost.eventTime && (
                      <div className="flex items-start">
                        <Clock className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                        <div>
                          <p className="text-sm text-gray-500">Time</p>
                          <p className="font-medium">{selectedPost.eventTime}</p>
                        </div>
                      </div>
                    )}
                    {selectedPost.location && (
                      <div className="flex items-start">
                        <MapPin className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                        <div>
                          <p className="text-sm text-gray-500">Location</p>
                          <p className="font-medium">{selectedPost.location}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start">
                      <Users className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-500">Facility</p>
                        <p className="font-medium">{selectedPost.facilityName}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedPost.maxParticipants && (
                      <div className="flex items-start">
                        <Users className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                        <div>
                          <p className="text-sm text-gray-500">Availability</p>
                          <p className="font-medium">
                            {selectedPost.maxParticipants - (selectedPost.currentParticipants || 0)} of {selectedPost.maxParticipants} spots available
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start">
                      <Users className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-500">Posted By</p>
                        <p className="font-medium">{selectedPost.authorName}</p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <Calendar className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-500">Posted</p>
                        <p className="font-medium">{new Date(selectedPost.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t">
                  {eventSignupTypes.has(selectedPost.type) ? (
                    selectedPost.currentUserSignupStatus ? (
                      <Button className="flex-1" variant="outline" onClick={() => handleCancelDrillSignup(selectedPost.id)}>
                        {selectedPost.currentUserSignupStatus === 'waitlist'
                          ? `Cancel Waitlist (#${selectedPost.currentUserWaitlistPosition || '-'})`
                          : 'Cancel Signup'}
                      </Button>
                    ) : (
                      <Button
                        className="flex-1"
                        disabled={selectedPost.currentUserCanSignup === false}
                        onClick={() => handleDrillSignup(selectedPost.id)}
                      >
                        {(selectedPost.drillConfirmedCount || 0) >= (selectedPost.maxParticipants || selectedPost.drillMaxParticipants || 0)
                          ? isPaidSignupPost(selectedPost)
                            ? `Join Waitlist — ${formatSignupFee(selectedPost.signupAmountCents)}`
                            : 'Join Waitlist'
                          : isPaidSignupPost(selectedPost)
                            ? `Pay & Sign Up — ${formatSignupFee(selectedPost.signupAmountCents)}`
                            : 'Sign Up'}
                      </Button>
                    )
                  ) : (
                    <Button className="flex-1" onClick={() => toast.info('Registration feature coming soon')}>
                      {selectedPost.type === 'announcement' ? 'Acknowledge' : 'Register Interest'}
                    </Button>
                  )}
                  <Button variant="outline" className="flex-1" onClick={() => toast.info('Share feature coming soon')}>
                    Share
                  </Button>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => handleDeletePost(selectedPost.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  )}
                </div>
                {eventSignupTypes.has(selectedPost.type) && isPaidSignupPost(selectedPost) && (
                  <p className="text-sm text-gray-600">
                    Card payment required to sign up ({formatSignupFee(selectedPost.signupAmountCents)}).
                  </p>
                )}
                {eventSignupTypes.has(selectedPost.type) && selectedPost.signupBlockedReason && !selectedPost.currentUserSignupStatus && (
                  <p className="text-sm text-red-600">{selectedPost.signupBlockedReason}</p>
                )}
                {eventSignupTypes.has(selectedPost.type) && (
                  <div className="space-y-3 border-t pt-4">
                    <h4 className="font-medium">
                      Participants
                      {selectedPost.drillShowParticipants ? '' : (isAdmin ? ' (admin view)' : ' (hidden by organizer)')}
                    </h4>
                    {(selectedPost.participants || []).filter((p) => p.status === 'confirmed').length > 0 ? (
                      <div className="space-y-2">
                        {(selectedPost.participants || []).filter((p) => p.status === 'confirmed').map((participant) => (
                          <div key={participant.userId} className="flex items-center justify-between text-sm">
                            <span>{participant.fullName}</span>
                            {isAdmin && (
                              <Button variant="ghost" size="sm" onClick={() => handleAdminRemoveSignup(selectedPost.id, participant.userId)}>
                                Remove
                              </Button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No confirmed participants yet.</p>
                    )}
                    {isAdmin && (
                      <div>
                        <h5 className="text-sm font-medium text-gray-700 mt-3 mb-1">Waitlist</h5>
                        {(selectedPost.participants || []).filter((p) => p.status === 'waitlist').length > 0 ? (
                          <div className="space-y-2">
                            {(selectedPost.participants || [])
                              .filter((p) => p.status === 'waitlist')
                              .sort((a, b) => (a.waitlistPosition || 0) - (b.waitlistPosition || 0))
                              .map((participant) => (
                                <div key={participant.userId} className="flex items-center justify-between text-sm">
                                  <span>#{participant.waitlistPosition} {participant.fullName}</span>
                                  <Button variant="ghost" size="sm" onClick={() => handleAdminRemoveSignup(selectedPost.id, participant.userId)}>
                                    Remove
                                  </Button>
                                </div>
                              ))}
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500">No members on the waitlist.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Create Post Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={closeCreateModal}
        >
          <Card
            className="max-w-xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Create Bulletin Post</h2>
                <Button variant="ghost" size="sm" onClick={closeCreateModal}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Form */}
              <div className="space-y-4">
                {/* Facility Selection */}
                <div className="space-y-2">
                  <Label htmlFor="facility">Facility *</Label>
                  <Select
                    value={newPost.facilityId}
                    onValueChange={(value) => {
                      setNewPost((prev) => ({
                        ...prev,
                        facilityId: value,
                        drillCourtId: '',
                        requirePayment: false,
                        signupFeeDollars: '',
                      }));
                      void loadStripeStatusForFacility(value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a facility" />
                    </SelectTrigger>
                    <SelectContent>
                      {adminFacilities.map(facility => (
                        <SelectItem key={facility.facilityId} value={facility.facilityId}>
                          {facility.facilityName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Post Type */}
                <div className="space-y-2">
                  <Label htmlFor="type">Post Type *</Label>
                  <Select
                    value={newPost.type}
                    onValueChange={(value: 'event' | 'clinic' | 'tournament' | 'social' | 'announcement' | 'drill') =>
                      setNewPost(prev => ({
                        ...prev,
                        type: value,
                        recurrenceEnabled: recurringEligibleTypes.has(value) ? prev.recurrenceEnabled : false
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="announcement">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-orange-500" />
                          Announcement
                        </div>
                      </SelectItem>
                      <SelectItem value="event">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-green-500" />
                          Event
                        </div>
                      </SelectItem>
                      <SelectItem value="clinic">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-green-500" />
                          Clinic
                        </div>
                      </SelectItem>
                      <SelectItem value="tournament">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-purple-500" />
                          Tournament
                        </div>
                      </SelectItem>
                      <SelectItem value="social">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-pink-500" />
                          Social
                        </div>
                      </SelectItem>
                      <SelectItem value="drill">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-blue-500" />
                          Drill
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={newPost.title}
                    onChange={(e) => setNewPost(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter post title"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    value={newPost.description}
                    onChange={(e) => setNewPost(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter post description"
                    rows={4}
                  />
                </div>

                {/* Event-specific fields */}
                {newPost.type !== 'announcement' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="eventDate">Event Date</Label>
                        <Input
                          id="eventDate"
                          type="date"
                          value={newPost.eventDate}
                          onChange={(e) => setNewPost(prev => ({ ...prev, eventDate: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="eventTime">Event Time</Label>
                        <Input
                          id="eventTime"
                          type="time"
                          value={newPost.eventTime}
                          onChange={(e) => setNewPost(prev => ({ ...prev, eventTime: e.target.value }))}
                        />
                      </div>
                    </div>

                    {!eventSignupTypes.has(newPost.type) && (
                      <div className="space-y-2">
                        <Label htmlFor="location">Location</Label>
                        <Input
                          id="location"
                          value={newPost.location}
                          onChange={(e) => setNewPost(prev => ({ ...prev, location: e.target.value }))}
                          placeholder="e.g., Main Court, Club House"
                        />
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label htmlFor="maxParticipants">Max Participants</Label>
                      <Input
                        id="maxParticipants"
                        type="number"
                        min="0"
                        value={newPost.maxParticipants}
                        onChange={(e) => setNewPost(prev => ({ ...prev, maxParticipants: e.target.value }))}
                        placeholder="Leave empty for unlimited"
                      />
                    </div>
                    {eventSignupTypes.has(newPost.type) && (
                      <div className="space-y-2">
                        <Label htmlFor="minParticipants">Min Participants</Label>
                        <Input
                          id="minParticipants"
                          type="number"
                          min="1"
                          value={newPost.minParticipants}
                          onChange={(e) => setNewPost(prev => ({ ...prev, minParticipants: e.target.value }))}
                          placeholder="Leave empty for no minimum"
                        />
                        <div className="flex items-center justify-between border rounded-md p-3">
                          <div>
                            <p className="text-sm font-medium">Auto-cancel if minimum not met</p>
                            <p className="text-xs text-gray-500">Cancel at event time and email all signed-up participants</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={newPost.cancelIfMinNotMet}
                            onChange={(e) => setNewPost(prev => ({ ...prev, cancelIfMinNotMet: e.target.checked }))}
                          />
                        </div>
                      </div>
                    )}
                    {eventSignupTypes.has(newPost.type) && (
                      <>
                        <div className="space-y-2">
                          <Label htmlFor="drillCourt">Court *</Label>
                          <Select
                            value={newPost.drillCourtId}
                            onValueChange={(value) => setNewPost(prev => ({ ...prev, drillCourtId: value }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select court" />
                            </SelectTrigger>
                            <SelectContent>
                              {(courtsByFacility[newPost.facilityId] || []).map((court) => (
                                <SelectItem key={court.id} value={court.id}>
                                  {court.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="drillGenderRestriction">Gender Restriction</Label>
                          <Select
                            value={newPost.drillGenderRestriction}
                            onValueChange={(value: 'any' | 'male_only' | 'female_only') =>
                              setNewPost(prev => ({ ...prev, drillGenderRestriction: value }))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="any">Any</SelectItem>
                              <SelectItem value="male_only">Male only</SelectItem>
                              <SelectItem value="female_only">Female only</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center justify-between border rounded-md p-3">
                          <div>
                            <p className="text-sm font-medium">Show Participants</p>
                            <p className="text-xs text-gray-500">Allow members to see who is signed up</p>
                          </div>
                          <input
                            type="checkbox"
                            checked={newPost.drillShowParticipants}
                            onChange={(e) => setNewPost(prev => ({ ...prev, drillShowParticipants: e.target.checked }))}
                          />
                        </div>
                        <div className="space-y-3 border rounded-md p-3">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="text-sm font-medium">Require card payment on signup</p>
                              <p className="text-xs text-gray-500">
                                Members pay with card via Stripe when they register
                              </p>
                            </div>
                            <input
                              type="checkbox"
                              checked={newPost.requirePayment}
                              disabled={!newPost.facilityId}
                              onChange={(e) => {
                                const checked = e.target.checked;
                                setNewPost((prev) => ({
                                  ...prev,
                                  requirePayment: checked,
                                  signupFeeDollars: checked ? prev.signupFeeDollars : '',
                                }));
                                if (checked && newPost.facilityId) {
                                  void loadStripeStatusForFacility(newPost.facilityId);
                                }
                              }}
                            />
                          </div>
                          {isStripeStatusLoading(newPost.facilityId) && newPost.facilityId && (
                            <p className="text-xs text-gray-500">Checking Stripe Connect status…</p>
                          )}
                          {!isStripeStatusLoading(newPost.facilityId) &&
                            !isStripeReadyForFacility(newPost.facilityId) &&
                            newPost.facilityId && (
                            <p className="text-xs text-amber-700">
                              Stripe Connect is not set up for this facility yet. Complete setup under
                              Facility Management → Payments before publishing paid signups.
                            </p>
                          )}
                          {isStripeReadyForFacility(newPost.facilityId) && (
                            <p className="text-xs text-green-700">Stripe Connect is active for this facility.</p>
                          )}
                          <div className="space-y-2">
                            <Label htmlFor="signupFee">
                              Signup fee (USD){newPost.requirePayment ? ' *' : ''}
                            </Label>
                            <Input
                              id="signupFee"
                              type="number"
                              min="0.01"
                              step="0.01"
                              value={newPost.signupFeeDollars}
                              onChange={(e) =>
                                setNewPost((prev) => ({ ...prev, signupFeeDollars: e.target.value }))
                              }
                              placeholder="e.g. 25.00"
                            />
                            <p className="text-xs text-gray-500">
                              Check “Require card payment” above and enter a fee to charge on signup.
                            </p>
                          </div>
                        </div>
                        {recurringEligibleTypes.has(newPost.type) && (
                          <div className="space-y-3 border rounded-md p-3">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-medium">Repeat Schedule</p>
                                <p className="text-xs text-gray-500">Create repeating drill/clinic posts</p>
                              </div>
                              <input
                                type="checkbox"
                                checked={newPost.recurrenceEnabled}
                                onChange={(e) => setNewPost(prev => ({ ...prev, recurrenceEnabled: e.target.checked }))}
                              />
                            </div>
                            {newPost.recurrenceEnabled && (
                              <>
                                <div className="space-y-2">
                                  <Label htmlFor="recurrenceFrequency">Frequency</Label>
                                  <Select
                                    value={newPost.recurrenceFrequency}
                                    onValueChange={(value: 'daily' | 'weekly' | 'biweekly') => setNewPost(prev => ({ ...prev, recurrenceFrequency: value }))}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="daily">Daily</SelectItem>
                                      <SelectItem value="weekly">Weekly</SelectItem>
                                      <SelectItem value="biweekly">Biweekly</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="recurrenceEndType">Ends</Label>
                                  <Select
                                    value={newPost.recurrenceEndType}
                                    onValueChange={(value: 'date' | 'occurrences') => setNewPost(prev => ({ ...prev, recurrenceEndType: value }))}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="date">On date</SelectItem>
                                      <SelectItem value="occurrences">After occurrences</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {newPost.recurrenceEndType === 'date' ? (
                                  <div className="space-y-2">
                                    <Label htmlFor="recurrenceEndDate">End Date</Label>
                                    <Input
                                      id="recurrenceEndDate"
                                      type="date"
                                      value={newPost.recurrenceEndDate}
                                      onChange={(e) => setNewPost(prev => ({ ...prev, recurrenceEndDate: e.target.value }))}
                                    />
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    <Label htmlFor="recurrenceOccurrences">Occurrences</Label>
                                    <Input
                                      id="recurrenceOccurrences"
                                      type="number"
                                      min="1"
                                      max="365"
                                      value={newPost.recurrenceOccurrences}
                                      onChange={(e) => setNewPost(prev => ({ ...prev, recurrenceOccurrences: e.target.value }))}
                                    />
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Auto-Expiration */}
                <div className="space-y-2">
                  <Label htmlFor="expiresInDays">Auto-expire after</Label>
                  <Select
                    value={newPost.expiresInDays || 'never'}
                    onValueChange={(value) => setNewPost(prev => ({ ...prev, expiresInDays: value === 'never' ? '' : value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="never">Never</SelectItem>
                      {eventSignupTypes.has(newPost.type) && (
                        <SelectItem value="after_event">After the event</SelectItem>
                      )}
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={closeCreateModal}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleCreatePost}
                    disabled={isSubmitting || !newPost.title || !newPost.description || !newPost.facilityId}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Post'}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
