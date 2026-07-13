import React, { useEffect, useState } from 'react';
import { Calendar, Tag, Users, AlertCircle, X } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { useAuth } from '../contexts/AuthContext';
import { bulletinBoardApi, facilitiesApi, stripeConnectApi, unwrapApiPayload } from '../api/client';
import { parseDollarsToCents } from '../../shared/utils/money';
import { EVENT_SIGNUP_TYPES } from '../utils/bulletinPostDisplay';
import { toast } from 'sonner';

const eventSignupTypes = EVENT_SIGNUP_TYPES;
const recurringEligibleTypes = new Set(['drill', 'clinic']);

export type LessonTypeOption = 'private_lesson' | 'group_clinic' | 'drill' | 'custom';

export const LESSON_TYPE_OPTIONS: Array<{ value: LessonTypeOption; label: string }> = [
  { value: 'private_lesson', label: 'Private Lesson' },
  { value: 'group_clinic', label: 'Group Clinic' },
  { value: 'drill', label: 'Drill' },
  { value: 'custom', label: 'Custom…' },
];

/** Lessons reuse the bulletin post categories so signups/payments/calendar behave identically. */
function lessonTypeToCategory(lessonType: LessonTypeOption): 'clinic' | 'drill' {
  return lessonType === 'drill' ? 'drill' : 'clinic';
}

type PostType = 'event' | 'clinic' | 'tournament' | 'social' | 'announcement' | 'drill';

const emptyNewPost = {
  title: '',
  description: '',
  type: 'announcement' as PostType,
  eventDate: '',
  eventTime: '',
  eventDurationMinutes: '60',
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
  lessonType: 'group_clinic' as LessonTypeOption,
  customLessonLabel: '',
};

interface BulletinPostCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after a post is created so the parent can reload its list. */
  onCreated: () => void;
  /** Facilities the current user can post to (admin facilities). */
  facilities: Array<{ facilityId: string; facilityName: string }>;
  defaultFacilityId?: string;
  /**
   * 'bulletin' (default): full bulletin board post types.
   * 'lesson': Lessons tab — lesson type selector (private lesson / group clinic /
   * drill / custom), posts tagged with lesson_type. Same create path either way.
   */
  mode?: 'bulletin' | 'lesson';
}

export function BulletinPostCreateModal({
  isOpen,
  onClose,
  onCreated,
  facilities,
  defaultFacilityId,
  mode = 'bulletin',
}: BulletinPostCreateModalProps) {
  const { user } = useAuth();
  const isLessonMode = mode === 'lesson';
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [courtsByFacility, setCourtsByFacility] = useState<Record<string, Array<{ id: string; name: string }>>>({});
  const [stripeOnboardedByFacility, setStripeOnboardedByFacility] = useState<Record<string, boolean>>({});
  const [stripeStatusLoadingByFacility, setStripeStatusLoadingByFacility] = useState<Record<string, boolean>>({});
  const [newPost, setNewPost] = useState({ ...emptyNewPost });

  // In lesson mode the bulletin category is derived from the selected lesson type.
  const effectiveType: PostType = isLessonMode ? lessonTypeToCategory(newPost.lessonType) : newPost.type;

  useEffect(() => {
    if (!isOpen) return;
    setNewPost({
      ...emptyNewPost,
      facilityId: defaultFacilityId || '',
      type: isLessonMode ? 'clinic' : 'drill',
    });
    if (defaultFacilityId) {
      void loadStripeStatusForFacility(defaultFacilityId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && newPost.facilityId) {
      loadCourtsForFacility(newPost.facilityId);
      loadStripeStatusForFacility(newPost.facilityId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, newPost.facilityId]);

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

  const handleClose = () => {
    setNewPost({ ...emptyNewPost });
    onClose();
  };

  const handleCreatePost = async () => {
    if (!user?.id || !newPost.title || !newPost.description) {
      toast.error('Please fill in all required fields');
      return;
    }
    if (!newPost.facilityId) {
      toast.error('Please select a facility for this post');
      return;
    }
    if (isLessonMode && newPost.lessonType === 'custom' && !newPost.customLessonLabel.trim()) {
      toast.error('Enter a name for your custom lesson type');
      return;
    }

    if (eventSignupTypes.has(effectiveType) && (!newPost.eventDate || !newPost.eventTime || !newPost.drillCourtId)) {
      toast.error('This post type requires date/time and court');
      return;
    }
    if (newPost.cancelIfMinNotMet && !newPost.minParticipants) {
      toast.error('Set Min Participants when auto-cancel is enabled');
      return;
    }
    if (newPost.recurrenceEnabled && recurringEligibleTypes.has(effectiveType)) {
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
      eventSignupTypes.has(effectiveType) && newPost.requirePayment
        ? parseDollarsToCents(newPost.signupFeeDollars)
        : 0;
    if (newPost.requirePayment) {
      if (!signupFeeCents || signupFeeCents <= 0) {
        toast.error('Enter a signup fee greater than $0');
        return;
      }
    }

    const wantsPaidSignup =
      eventSignupTypes.has(effectiveType) && newPost.requirePayment && signupFeeCents > 0;

    try {
      setIsSubmitting(true);
      const parsedMaxParticipants = newPost.maxParticipants ? parseInt(newPost.maxParticipants) : undefined;
      const expiresAfterEvent = newPost.expiresInDays === 'after_event';
      const response = await bulletinBoardApi.create({
        facilityId: newPost.facilityId,
        authorId: user.id,
        title: newPost.title,
        content: newPost.description,
        category: effectiveType,
        isAdminPost: true,
        ...(isLessonMode
          ? {
              lessonType: newPost.lessonType,
              ...(newPost.lessonType === 'custom'
                ? { lessonTypeLabel: newPost.customLessonLabel.trim() }
                : {}),
            }
          : {}),
        ...(expiresAfterEvent
          ? { expiresAfterEvent: true }
          : (newPost.expiresInDays ? { expiresInDays: parseInt(newPost.expiresInDays) } : {})),
        ...(eventSignupTypes.has(effectiveType)
          ? {
              drillStartAt: new Date(`${newPost.eventDate}T${newPost.eventTime}`).toISOString(),
              drillDurationMinutes: parseInt(newPost.eventDurationMinutes, 10) || 60,
              drillCourtId: newPost.drillCourtId,
              ...(typeof parsedMaxParticipants === 'number' && !Number.isNaN(parsedMaxParticipants)
                ? { drillMaxParticipants: parsedMaxParticipants }
                : {}),
              drillGenderRestriction: newPost.drillGenderRestriction,
              drillShowParticipants: newPost.drillShowParticipants
            }
          : {}),
        ...(eventSignupTypes.has(effectiveType) && newPost.minParticipants
          ? { minParticipants: parseInt(newPost.minParticipants) }
          : {}),
        ...(eventSignupTypes.has(effectiveType)
          ? { cancelIfMinNotMet: Boolean(newPost.cancelIfMinNotMet) }
          : {}),
        ...(wantsPaidSignup
          ? {
              requirePayment: true,
              signupAmountCents: signupFeeCents,
              signupFeeDollars: newPost.signupFeeDollars,
            }
          : {}),
        ...(newPost.recurrenceEnabled && recurringEligibleTypes.has(effectiveType)
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
        toast.success(isLessonMode ? 'Lesson created successfully!' : 'Post created successfully!');
        handleClose();
        onCreated();
      } else {
        toast.error(response.error || (isLessonMode ? 'Failed to create lesson' : 'Failed to create post'));
      }
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error(isLessonMode ? 'Failed to create lesson' : 'Failed to create post');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <Card
        className="max-w-xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold">{isLessonMode ? 'Create Lesson' : 'Create Bulletin Post'}</h2>
            <Button variant="ghost" size="sm" onClick={handleClose}>
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
                  {facilities.map(facility => (
                    <SelectItem key={facility.facilityId} value={facility.facilityId}>
                      {facility.facilityName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Post Type / Lesson Type */}
            {isLessonMode ? (
              <div className="space-y-2">
                <Label htmlFor="lessonType">Lesson Type *</Label>
                <Select
                  value={newPost.lessonType}
                  onValueChange={(value: LessonTypeOption) =>
                    setNewPost(prev => ({ ...prev, lessonType: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LESSON_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-green-600" />
                          {option.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newPost.lessonType === 'custom' && (
                  <Input
                    id="customLessonLabel"
                    value={newPost.customLessonLabel}
                    maxLength={60}
                    onChange={(e) => setNewPost(prev => ({ ...prev, customLessonLabel: e.target.value }))}
                    placeholder="Name this lesson type (e.g. Cardio Tennis)"
                  />
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="type">Post Type *</Label>
                <Select
                  value={newPost.type}
                  onValueChange={(value: PostType) =>
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
            )}

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={newPost.title}
                onChange={(e) => setNewPost(prev => ({ ...prev, title: e.target.value }))}
                placeholder={isLessonMode ? 'Enter lesson title' : 'Enter post title'}
              />
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Textarea
                id="description"
                value={newPost.description}
                onChange={(e) => setNewPost(prev => ({ ...prev, description: e.target.value }))}
                placeholder={isLessonMode ? 'Enter lesson description' : 'Enter post description'}
                rows={4}
              />
            </div>

            {/* Event-specific fields */}
            {effectiveType !== 'announcement' && (
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

                {eventSignupTypes.has(effectiveType) && (
                  <div className="space-y-2">
                    <Label htmlFor="eventDuration">Duration (minutes)</Label>
                    <Input
                      id="eventDuration"
                      type="number"
                      min={15}
                      max={480}
                      step={15}
                      value={newPost.eventDurationMinutes}
                      onChange={(e) => setNewPost(prev => ({ ...prev, eventDurationMinutes: e.target.value }))}
                    />
                  </div>
                )}

                {!eventSignupTypes.has(effectiveType) && (
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
                {eventSignupTypes.has(effectiveType) && (
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
                {eventSignupTypes.has(effectiveType) && (
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
                          Member Payments before publishing paid signups.
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
                    {recurringEligibleTypes.has(effectiveType) && (
                      <div className="space-y-3 border rounded-md p-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">Repeat Schedule</p>
                            <p className="text-xs text-gray-500">
                              {isLessonMode ? 'Create repeating lessons' : 'Create repeating drill/clinic posts'}
                            </p>
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
                  {eventSignupTypes.has(effectiveType) && (
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
                onClick={handleClose}
              >
                Cancel
              </Button>
              <Button
                className="flex-1"
                onClick={handleCreatePost}
                disabled={isSubmitting || !newPost.title || !newPost.description || !newPost.facilityId}
              >
                {isSubmitting
                  ? 'Creating...'
                  : isLessonMode
                    ? 'Create Lesson'
                    : 'Create Post'}
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
