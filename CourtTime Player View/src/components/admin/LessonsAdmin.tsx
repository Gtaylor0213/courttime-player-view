import React, { useCallback, useEffect, useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  DollarSign,
  GraduationCap,
  MapPin,
  Plus,
  Trash2,
  Users,
  UserX,
} from 'lucide-react';
import { bulletinBoardApi, facilitiesApi, lessonsApi, unwrapApiPayload } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useAppContext } from '../../contexts/AppContext';
import {
  formatSignupFee,
  getLessonPostTypeLabel,
  isPaidSignupPost,
  mapPostFromApi,
  type BulletinPostView,
} from '../../utils/bulletinPostDisplay';
import { BulletinPostCreateModal } from '../BulletinPostCreateModal';
import { toast } from 'sonner';

/**
 * Admin Lessons tab (lessons_tab feature flag). Management home for the club's
 * lessons/clinics: create (same form + create path as the bulletin board),
 * upcoming/past lists, and per-lesson rosters. Lessons remain bulletin posts,
 * so they also appear on the bulletin board and hold their court on the calendar.
 */
export default function LessonsAdmin() {
  const { user } = useAuth();
  const { selectedFacilityId } = useAppContext();
  const [facilityName, setFacilityName] = useState('');
  const [scope, setScope] = useState<'upcoming' | 'past'>('upcoming');
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [lessons, setLessons] = useState<BulletinPostView[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [expandedLessonId, setExpandedLessonId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedFacilityId) return;
    void facilitiesApi.getById(selectedFacilityId).then((res) => {
      if (res.success && res.data?.facility?.name) {
        setFacilityName(res.data.facility.name);
      }
    });
  }, [selectedFacilityId]);

  const loadLessons = useCallback(async () => {
    if (!selectedFacilityId) return;
    try {
      setLoading(true);
      const response = await lessonsApi.getLessons(selectedFacilityId, scope);
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
  }, [selectedFacilityId, scope]);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  const handleDeleteLesson = async (lesson: BulletinPostView, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Delete "${lesson.title}"? This cancels its court hold and removes all signups.`)) return;
    try {
      const response = await bulletinBoardApi.delete(lesson.id, user?.id || '', true);
      if (response.success) {
        toast.success('Lesson deleted');
        void loadLessons();
      } else {
        toast.error(response.error || 'Failed to delete lesson');
      }
    } catch (err) {
      console.error('Delete lesson error:', err);
      toast.error('Failed to delete lesson');
    }
  };

  const handleRemoveParticipant = async (lessonId: string, memberUserId: string, fullName: string) => {
    if (!confirm(`Remove ${fullName} from this lesson?`)) return;
    try {
      const response = await bulletinBoardApi.adminRemoveDrillSignup(lessonId, memberUserId);
      if (response.success) {
        toast.success(`${fullName} removed`);
        void loadLessons();
      } else {
        toast.error(response.error || 'Failed to remove participant');
      }
    } catch (err) {
      console.error('Remove participant error:', err);
      toast.error('Failed to remove participant');
    }
  };

  if (!selectedFacilityId) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <GraduationCap className="h-12 w-12 mb-3" />
        <p className="text-sm">Select a facility to manage lessons.</p>
      </div>
    );
  }

  if (unavailable) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-400">
        <GraduationCap className="h-12 w-12 mb-3" />
        <p className="text-sm">Lessons are not enabled for this facility.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GraduationCap className="h-6 w-6 text-indigo-600" />
          <h1 className="text-2xl font-semibold text-gray-900">Lessons</h1>
        </div>
        <Button onClick={() => setShowCreateModal(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          Create Lesson
        </Button>
      </div>

      <Tabs value={scope} onValueChange={(value) => setScope(value as 'upcoming' | 'past')}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="past">Past</TabsTrigger>
        </TabsList>

        <TabsContent value={scope} className="mt-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
            </div>
          ) : lessons.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Calendar className="h-12 w-12 mb-3" />
              <p className="text-sm">
                {scope === 'upcoming'
                  ? 'No upcoming lessons. Create one to get started.'
                  : 'No past lessons yet.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {lessons.map((lesson) => {
                const maxSpots = lesson.drillMaxParticipants ?? 0;
                const confirmed = lesson.drillConfirmedCount ?? 0;
                const participants = lesson.participants || [];
                const isExpanded = expandedLessonId === lesson.id;
                return (
                  <Card
                    key={lesson.id}
                    className="p-4 cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setExpandedLessonId(isExpanded ? null : lesson.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-gray-900">{lesson.title}</h3>
                          <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">
                            {getLessonPostTypeLabel(lesson)}
                          </Badge>
                          {isPaidSignupPost(lesson) && (
                            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                              <DollarSign className="h-3 w-3 mr-0.5" />
                              {formatSignupFee(lesson.signupAmountCents)}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 flex-wrap text-sm text-gray-600">
                          {lesson.drillStartAt && (
                            <span className="flex items-center gap-1.5">
                              <Calendar className="h-4 w-4 text-gray-400" />
                              {new Date(lesson.drillStartAt).toLocaleString('en-US', {
                                weekday: 'short',
                                month: 'short',
                                day: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                          {lesson.drillCourtName && (
                            <span className="flex items-center gap-1.5">
                              <MapPin className="h-4 w-4 text-gray-400" />
                              {lesson.drillCourtName}
                            </span>
                          )}
                          <span className="flex items-center gap-1.5">
                            <Users className="h-4 w-4 text-gray-400" />
                            {confirmed}
                            {maxSpots > 0 ? ` / ${maxSpots}` : ''} signed up
                            {(lesson.drillWaitlistCount || 0) > 0 &&
                              ` · ${lesson.drillWaitlistCount} on waitlist`}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {scope === 'upcoming' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={(e) => void handleDeleteLesson(lesson, e)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                        {isExpanded ? (
                          <ChevronUp className="h-4 w-4 text-gray-400" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t" onClick={(e) => e.stopPropagation()}>
                        {lesson.description && (
                          <p className="text-sm text-gray-600 mb-3">{lesson.description}</p>
                        )}
                        <h4 className="text-sm font-medium text-gray-900 mb-2">
                          Roster ({participants.length})
                        </h4>
                        {participants.length === 0 ? (
                          <p className="text-sm text-gray-400">No signups yet.</p>
                        ) : (
                          <ul className="divide-y">
                            {participants.map((participant) => (
                              <li
                                key={participant.userId}
                                className="flex items-center justify-between py-2 text-sm"
                              >
                                <span className="flex items-center gap-2">
                                  {participant.fullName}
                                  {participant.status === 'waitlist' && (
                                    <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">
                                      Waitlist #{participant.waitlistPosition ?? '?'}
                                    </Badge>
                                  )}
                                </span>
                                {scope === 'upcoming' && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-red-600 hover:text-red-700 gap-1"
                                    onClick={() =>
                                      void handleRemoveParticipant(
                                        lesson.id,
                                        participant.userId,
                                        participant.fullName
                                      )
                                    }
                                  >
                                    <UserX className="h-4 w-4" />
                                    Remove
                                  </Button>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <BulletinPostCreateModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={() => {
          setScope('upcoming');
          void loadLessons();
        }}
        facilities={[{ facilityId: selectedFacilityId, facilityName: facilityName || 'This facility' }]}
        defaultFacilityId={selectedFacilityId}
        mode="lesson"
      />
    </div>
  );
}
