import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { CalendarDays, CheckCircle2, Clock, DollarSign, Users } from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';
import {
  PICKLE_PROGRAM_TYPE_LABELS,
  type PickleProgramType,
} from '../../../../shared/constants/pickleProgramTypes';

interface ProgramInstance {
  id: string;
  templateId: string;
  facilityId: string;
  schedule: {
    startAt?: string;
    endAt?: string;
    label?: string;
  };
  capacity: number;
  priceCents: number;
  status: string;
  templateName?: string;
  templateType?: PickleProgramType;
  registrationCount?: number;
  spotsRemaining?: number;
  userRegistrationStatus?: string | null;
}

function formatSchedule(schedule: ProgramInstance['schedule']): string {
  if (schedule.label) return schedule.label;
  if (schedule.startAt) {
    const start = new Date(schedule.startAt);
    const end = schedule.endAt ? new Date(schedule.endAt) : null;
    const datePart = start.toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    const timePart = start.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    if (end) {
      const endPart = end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      return `${datePart} · ${timePart} – ${endPart}`;
    }
    return `${datePart} · ${timePart}`;
  }
  return 'Schedule TBD';
}

export function PickleProgramBrowser() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [instances, setInstances] = useState<ProgramInstance[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<string | null>(null);

  useEffect(() => {
    if (!facilityId || !user) {
      setLoading(false);
      return;
    }
    loadInstances();
  }, [facilityId, user]);

  const loadInstances = async () => {
    if (!facilityId) return;
    setLoading(true);
    try {
      const result = await pickleApi.listProgramInstances(facilityId);
      if (result.success && result.data) {
        const list = (result.data as { data?: { instances: ProgramInstance[] } }).data?.instances
          ?? (result.data as { instances?: ProgramInstance[] }).instances;
        if (list) setInstances(list);
      } else if (result.error) {
        toast.error(result.error);
      }
    } catch {
      toast.error('Failed to load programs');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (instanceId: string) => {
    setActionId(instanceId);
    try {
      const result = await pickleApi.registerForProgram(instanceId);
      if (result.success) {
        const reg = (result.data as { data?: { registration?: { status?: string } } }).data?.registration
          ?? (result.data as { registration?: { status?: string } }).registration;
        if (reg?.status === 'waitlisted') {
          toast.success('Added to waitlist');
        } else {
          toast.success('Registered for program');
        }
        await loadInstances();
      } else {
        toast.error(result.error || 'Registration failed');
      }
    } catch {
      toast.error('Registration failed');
    } finally {
      setActionId(null);
    }
  };

  const handleCancel = async (instanceId: string) => {
    setActionId(instanceId);
    try {
      const result = await pickleApi.cancelProgramRegistration(instanceId);
      if (result.success) {
        toast.success('Registration cancelled');
        await loadInstances();
      } else {
        toast.error(result.error || 'Cancellation failed');
      }
    } catch {
      toast.error('Cancellation failed');
    } finally {
      setActionId(null);
    }
  };

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p>Please log in to browse programs.</p>
        <Button className="mt-4" onClick={() => navigate('/login')}>Log in</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-green-700 font-medium">CourtTime-Pickle</p>
          <h1 className="text-2xl font-bold text-gray-900">Programs</h1>
          <p className="text-gray-500 text-sm">Book open plays, leagues, clinics, and more</p>
        </div>
        <Button variant="outline" onClick={() => navigate('/calendar')}>
          Back to Calendar
        </Button>
      </div>

      {!instances.length ? (
        <Card>
          <CardContent className="p-8 text-center text-gray-500">
            No programs are scheduled at this location yet. Check back soon.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {instances.map((instance) => {
            const isRegistered = instance.userRegistrationStatus === 'registered'
              || instance.userRegistrationStatus === 'waitlisted'
              || instance.userRegistrationStatus === 'attended';
            const priceLabel = instance.priceCents > 0
              ? `$${(instance.priceCents / 100).toFixed(2)}`
              : 'Free';

            return (
              <Card key={instance.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-lg">{instance.templateName || 'Program'}</CardTitle>
                      <CardDescription className="flex items-center gap-1 mt-1">
                        <CalendarDays className="h-4 w-4" />
                        {formatSchedule(instance.schedule)}
                      </CardDescription>
                    </div>
                    {instance.templateType && (
                      <Badge className="bg-green-100 text-green-800">
                        {PICKLE_PROGRAM_TYPE_LABELS[instance.templateType]}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <span className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {instance.spotsRemaining ?? instance.capacity} spots left
                    </span>
                    <span className="flex items-center gap-1">
                      <DollarSign className="h-4 w-4" />
                      {priceLabel}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-4 w-4" />
                      {instance.registrationCount ?? 0} registered
                    </span>
                  </div>

                  {isRegistered ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge className="bg-green-700">
                        <CheckCircle2 className="h-3 w-3 mr-1" />
                        {instance.userRegistrationStatus === 'waitlisted' ? 'Waitlisted' : 'Registered'}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={actionId === instance.id}
                        onClick={() => handleCancel(instance.id)}
                      >
                        {actionId === instance.id ? 'Cancelling...' : 'Cancel Registration'}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      className="bg-green-700 hover:bg-green-800"
                      disabled={
                        actionId === instance.id
                        || (instance.spotsRemaining !== undefined && instance.spotsRemaining <= 0)
                      }
                      onClick={() => handleRegister(instance.id)}
                    >
                      {actionId === instance.id
                        ? 'Registering...'
                        : (instance.spotsRemaining !== undefined && instance.spotsRemaining <= 0)
                          ? 'Full — Join Waitlist'
                          : 'Register'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
