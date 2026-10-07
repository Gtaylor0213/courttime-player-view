import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import {
  User, Target, Calendar, Trophy, Save, RefreshCw, CheckCircle2, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi, unwrapApiPayload } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';

interface PickleProfile {
  id?: string;
  duprRating: number | null;
  birthdate: string | null;
  primaryGoals: string[];
  preferredFormats: string[];
  preferredPrograms: string[];
  availabilityJson: Record<string, unknown>;
  equipmentBrands: Record<string, unknown>;
}

interface LifecycleSnapshot {
  status: string;
  activity: string;
  visitCount: number;
  lastVisitAt: string | null;
  daysSinceLastVisit: number | null;
  milestones: Array<{ key: string; label: string; achieved: boolean; achievedAt?: string }>;
  recentVisits: Array<{ visitType: string; visitedAt: string; facilityName?: string }>;
}

const GOAL_OPTIONS = [
  'Improve DUPR rating',
  'Play more socially',
  'Compete in tournaments',
  'Learn fundamentals',
  'Stay active',
];

const FORMAT_OPTIONS = ['Doubles', 'Singles', 'Mixed doubles', 'Skinny singles'];

const PROGRAM_OPTIONS = ['Open play', 'Clinics', 'Leagues', 'Tournaments', 'Private lessons'];

const STATUS_COLORS: Record<string, string> = {
  lead: 'bg-gray-100 text-gray-800',
  drop_in: 'bg-blue-100 text-blue-800',
  trial_member: 'bg-amber-100 text-amber-800',
  member: 'bg-green-100 text-green-800',
  past_member: 'bg-red-100 text-red-800',
};

const ACTIVITY_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  at_risk: 'bg-amber-100 text-amber-800',
  inactive: 'bg-gray-100 text-gray-800',
};

function toggleArrayItem(arr: string[], item: string): string[] {
  return arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];
}

export function PicklePlayerProfileForm() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const orgId = searchParams.get('orgId') || user?.orgAdminOrgs?.[0]?.orgId || undefined;

  const [profile, setProfile] = useState<PickleProfile>({
    duprRating: null,
    birthdate: null,
    primaryGoals: [],
    preferredFormats: [],
    preferredPrograms: [],
    availabilityJson: {},
    equipmentBrands: {},
  });
  const [lifecycle, setLifecycle] = useState<LifecycleSnapshot | null>(null);
  const [paddleBrand, setPaddleBrand] = useState('');
  const [ballBrand, setBallBrand] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [orgId]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const profileRes = await pickleApi.getPickleProfile(orgId);
      if (profileRes.success && profileRes.data) {
        const payload = unwrapApiPayload<{ profile: PickleProfile | null }>(profileRes.data);
        if (payload?.profile) {
          setProfile(payload.profile);
          const brands = payload.profile.equipmentBrands || {};
          setPaddleBrand(String(brands.paddle || ''));
          setBallBrand(String(brands.ball || ''));
        }
      }

      if (orgId && user?.id) {
        const lifecycleRes = await pickleApi.getPlayerLifecycle(orgId, user.id);
        if (lifecycleRes.success && lifecycleRes.data) {
          const snap = unwrapApiPayload<LifecycleSnapshot>(lifecycleRes.data);
          if (snap) setLifecycle(snap);
        }
      }
    } catch {
      toast.error('Failed to load pickle profile');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await pickleApi.upsertPickleProfile({
        orgId,
        duprRating: profile.duprRating,
        birthdate: profile.birthdate || undefined,
        primaryGoals: profile.primaryGoals,
        preferredFormats: profile.preferredFormats,
        preferredPrograms: profile.preferredPrograms,
        availabilityJson: profile.availabilityJson,
        equipmentBrands: {
          paddle: paddleBrand || undefined,
          ball: ballBrand || undefined,
        },
      });
      if (result.success) {
        toast.success('Pickle profile saved');
        await loadProfile();
      } else {
        toast.error(result.error || 'Failed to save profile');
      }
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <User className="h-6 w-6" />
          Pickleball Profile
        </h1>
        <p className="text-gray-600 mt-1">
          Your pickle-specific preferences — separate from your tennis profile.
        </p>
      </div>

      {lifecycle && orgId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Your Status</CardTitle>
            <CardDescription>Lifecycle snapshot for this organization</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge className={STATUS_COLORS[lifecycle.status] || ''}>
                {lifecycle.status.replace('_', ' ')}
              </Badge>
              <Badge className={ACTIVITY_COLORS[lifecycle.activity] || ''}>
                {lifecycle.activity.replace('_', ' ')}
              </Badge>
              <Badge variant="outline">{lifecycle.visitCount} visits</Badge>
              {lifecycle.daysSinceLastVisit != null && (
                <Badge variant="outline">
                  Last visit {lifecycle.daysSinceLastVisit}d ago
                </Badge>
              )}
            </div>

            {lifecycle.milestones.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Trophy className="h-4 w-4" /> Milestones
                </p>
                <div className="flex flex-wrap gap-2">
                  {lifecycle.milestones.map((m) => (
                    <Badge
                      key={m.key}
                      variant={m.achieved ? 'default' : 'outline'}
                      className={m.achieved ? 'bg-green-600' : ''}
                    >
                      {m.achieved ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null}
                      {m.label}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {lifecycle.recentVisits.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <Calendar className="h-4 w-4" /> Recent Visits
                </p>
                <ul className="text-sm text-gray-600 space-y-1">
                  {lifecycle.recentVisits.slice(0, 5).map((v, i) => (
                    <li key={i}>
                      {v.facilityName || 'Facility'} — {v.visitType.replace('_', ' ')} —{' '}
                      {new Date(v.visitedAt).toLocaleDateString()}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <form onSubmit={handleSave}>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Profile Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dupr">DUPR Rating</Label>
                <Input
                  id="dupr"
                  type="number"
                  step="0.01"
                  min="0"
                  max="8"
                  placeholder="e.g. 3.5"
                  value={profile.duprRating ?? ''}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      duprRating: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div>
                <Label htmlFor="birthdate">Birthdate</Label>
                <Input
                  id="birthdate"
                  type="date"
                  value={profile.birthdate?.slice(0, 10) || ''}
                  onChange={(e) =>
                    setProfile({ ...profile, birthdate: e.target.value || null })
                  }
                />
              </div>
            </div>

            <div>
              <Label className="flex items-center gap-1 mb-2">
                <Target className="h-4 w-4" /> Primary Goals
              </Label>
              <div className="flex flex-wrap gap-2">
                {GOAL_OPTIONS.map((goal) => (
                  <Badge
                    key={goal}
                    variant={profile.primaryGoals.includes(goal) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() =>
                      setProfile({
                        ...profile,
                        primaryGoals: toggleArrayItem(profile.primaryGoals, goal),
                      })
                    }
                  >
                    {goal}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Preferred Formats</Label>
              <div className="flex flex-wrap gap-2">
                {FORMAT_OPTIONS.map((fmt) => (
                  <Badge
                    key={fmt}
                    variant={profile.preferredFormats.includes(fmt) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() =>
                      setProfile({
                        ...profile,
                        preferredFormats: toggleArrayItem(profile.preferredFormats, fmt),
                      })
                    }
                  >
                    {fmt}
                  </Badge>
                ))}
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Preferred Programs</Label>
              <div className="flex flex-wrap gap-2">
                {PROGRAM_OPTIONS.map((prog) => (
                  <Badge
                    key={prog}
                    variant={profile.preferredPrograms.includes(prog) ? 'default' : 'outline'}
                    className="cursor-pointer"
                    onClick={() =>
                      setProfile({
                        ...profile,
                        preferredPrograms: toggleArrayItem(profile.preferredPrograms, prog),
                      })
                    }
                  >
                    {prog}
                  </Badge>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="paddle">Paddle Brand</Label>
                <Input
                  id="paddle"
                  placeholder="e.g. Selkirk, JOOLA"
                  value={paddleBrand}
                  onChange={(e) => setPaddleBrand(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="ball">Ball Brand</Label>
                <Input
                  id="ball"
                  placeholder="e.g. Franklin X-40"
                  value={ballBrand}
                  onChange={(e) => setBallBrand(e.target.value)}
                />
              </div>
            </div>

            <Button type="submit" disabled={saving}>
              {saving ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Profile
            </Button>
          </CardContent>
        </Card>
      </form>

      {!orgId && (
        <div className="flex items-center gap-2 text-amber-700 bg-amber-50 p-3 rounded-lg text-sm">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Add ?orgId= to the URL to see lifecycle status for a specific organization.
        </div>
      )}
    </div>
  );
}
