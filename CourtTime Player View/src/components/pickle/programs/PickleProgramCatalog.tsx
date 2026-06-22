import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { BookOpen, Layers, MapPin, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';
import {
  PICKLE_PROGRAM_TYPES,
  PICKLE_PROGRAM_TYPE_LABELS,
  type PickleProgramType,
} from '../../../../shared/constants/pickleProgramTypes';

interface ProgramTemplate {
  id: string;
  nationalProgramId?: string | null;
  orgId: string;
  type: PickleProgramType;
  name: string;
  defaultConfig: Record<string, unknown>;
  status: string;
}

interface OrgLocation {
  id: string;
  name: string;
  city: string;
  state: string;
}

interface ProgramRollout {
  id: string;
  templateId: string;
  facilityId: string;
  facilityName?: string;
  templateName?: string;
  templateType?: PickleProgramType;
}

export function PickleProgramCatalog() {
  const { orgId } = useParams<{ orgId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [templates, setTemplates] = useState<ProgramTemplate[]>([]);
  const [locations, setLocations] = useState<OrgLocation[]>([]);
  const [rollouts, setRollouts] = useState<ProgramRollout[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [newType, setNewType] = useState<PickleProgramType>('open_play');
  const [newName, setNewName] = useState('');
  const [newNationalId, setNewNationalId] = useState('');
  const [rolloutTemplateId, setRolloutTemplateId] = useState('');
  const [rolloutFacilityId, setRolloutFacilityId] = useState('');

  const isOrgAdmin = user?.orgAdminOrgs?.some((o) => o.orgId === orgId);

  useEffect(() => {
    if (!orgId || !isOrgAdmin) {
      setLoading(false);
      return;
    }
    loadData();
  }, [orgId, isOrgAdmin]);

  const loadData = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [templatesRes, locationsRes, rolloutsRes] = await Promise.all([
        pickleApi.listProgramTemplates(orgId),
        pickleApi.listLocations(orgId),
        pickleApi.listProgramRollouts(orgId),
      ]);

      if (templatesRes.success && templatesRes.data) {
        const list = (templatesRes.data as { data?: { templates: ProgramTemplate[] } }).data?.templates
          ?? (templatesRes.data as { templates?: ProgramTemplate[] }).templates;
        if (list) setTemplates(list);
      }
      if (locationsRes.success && locationsRes.data) {
        const locs = (locationsRes.data as { data?: { locations: OrgLocation[] } }).data?.locations
          ?? (locationsRes.data as { locations?: OrgLocation[] }).locations;
        if (locs) setLocations(locs);
      }
      if (rolloutsRes.success && rolloutsRes.data) {
        const rolls = (rolloutsRes.data as { data?: { rollouts: ProgramRollout[] } }).data?.rollouts
          ?? (rolloutsRes.data as { rollouts?: ProgramRollout[] }).rollouts;
        if (rolls) setRollouts(rolls);
      }
    } catch {
      toast.error('Failed to load program catalog');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !newName.trim()) return;
    setSaving(true);
    try {
      const result = await pickleApi.createProgramTemplate(orgId, {
        type: newType,
        name: newName.trim(),
        nationalProgramId: newNationalId.trim() || undefined,
      });
      if (result.success) {
        toast.success('Program template created');
        setNewName('');
        setNewNationalId('');
        await loadData();
      } else {
        toast.error(result.error || 'Failed to create template');
      }
    } catch {
      toast.error('Failed to create template');
    } finally {
      setSaving(false);
    }
  };

  const handleArchiveTemplate = async (templateId: string) => {
    if (!orgId) return;
    try {
      const result = await pickleApi.archiveProgramTemplate(templateId, orgId);
      if (result.success) {
        toast.success('Template archived');
        await loadData();
      } else {
        toast.error(result.error || 'Failed to archive template');
      }
    } catch {
      toast.error('Failed to archive template');
    }
  };

  const handleRollout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !rolloutTemplateId || !rolloutFacilityId) return;
    setSaving(true);
    try {
      const result = await pickleApi.rolloutProgramTemplate(orgId, {
        templateId: rolloutTemplateId,
        facilityId: rolloutFacilityId,
      });
      if (result.success) {
        toast.success('Program rolled out to location');
        setRolloutTemplateId('');
        setRolloutFacilityId('');
        await loadData();
      } else {
        toast.error(result.error || 'Failed to rollout program');
      }
    } catch {
      toast.error('Failed to rollout program');
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p>Please log in to view this page.</p>
        <Button className="mt-4" onClick={() => navigate('/login')}>Log in</Button>
      </div>
    );
  }

  if (!isOrgAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600">You do not have access to this organization.</p>
        <Button className="mt-4" variant="outline" onClick={() => navigate('/calendar')}>
          Go to Calendar
        </Button>
      </div>
    );
  }

  const orgName = user.orgAdminOrgs?.find((o) => o.orgId === orgId)?.orgName || 'Organization';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-green-700 font-medium">CourtTime-Pickle Programs</p>
          <h1 className="text-2xl font-bold text-gray-900">{orgName} Catalog</h1>
          <p className="text-gray-500 text-sm">Define national program templates and roll them out to locations</p>
        </div>
        <Button variant="outline" onClick={() => navigate(`/pickle/org/${orgId}`)}>
          Back to Dashboard
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Plus className="h-5 w-5" />
            New Program Template
          </CardTitle>
          <CardDescription>
            Open Plays, Round Robins, Kings Courts, Leagues, Tournaments, Clinics, and Social events.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreateTemplate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="programType">Type</Label>
              <Select value={newType} onValueChange={(v) => setNewType(v as PickleProgramType)}>
                <SelectTrigger id="programType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PICKLE_PROGRAM_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PICKLE_PROGRAM_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="programName">Name</Label>
              <Input
                id="programName"
                required
                placeholder="Friday Night Open Play"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="nationalId">National program ID (optional)</Label>
              <Input
                id="nationalId"
                placeholder="nat-open-play-v1"
                value={newNationalId}
                onChange={(e) => setNewNationalId(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full bg-green-700 hover:bg-green-800" disabled={saving}>
                {saving ? 'Saving...' : 'Add Template'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <BookOpen className="h-5 w-5" />
            Program Templates
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!templates.length ? (
            <p className="text-gray-500 text-sm">No templates yet. Create your first program above.</p>
          ) : (
            <div className="space-y-3">
              {templates.map((template) => (
                <div
                  key={template.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border rounded-lg p-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{template.name}</p>
                      <Badge variant="secondary">
                        {PICKLE_PROGRAM_TYPE_LABELS[template.type]}
                      </Badge>
                    </div>
                    {template.nationalProgramId && (
                      <p className="text-xs text-gray-500 mt-1">National ID: {template.nationalProgramId}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-700"
                    onClick={() => handleArchiveTemplate(template.id)}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Archive
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Layers className="h-5 w-5" />
            Roll Out to Location
          </CardTitle>
          <CardDescription>Enable a template at a franchise location so they can schedule sessions.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRollout} className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label>Template</Label>
              <Select value={rolloutTemplateId} onValueChange={setRolloutTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Location</Label>
              <Select value={rolloutFacilityId} onValueChange={setRolloutFacilityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.name} ({loc.city}, {loc.state})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                type="submit"
                className="w-full bg-green-700 hover:bg-green-800"
                disabled={saving || !rolloutTemplateId || !rolloutFacilityId}
              >
                Roll Out
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {rollouts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              Active Rollouts
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {rollouts.map((rollout) => (
                <div key={rollout.id} className="flex justify-between text-sm border-b pb-2">
                  <span>
                    {rollout.templateName || 'Template'} → {rollout.facilityName || rollout.facilityId}
                  </span>
                  {rollout.templateType && (
                    <Badge variant="outline">{PICKLE_PROGRAM_TYPE_LABELS[rollout.templateType]}</Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
