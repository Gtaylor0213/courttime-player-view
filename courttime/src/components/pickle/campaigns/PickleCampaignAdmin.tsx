import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Badge } from '../../ui/badge';
import { Textarea } from '../../ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import {
  Megaphone, Plus, Send, Eye, RefreshCw, AlertCircle, Mail,
} from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi, unwrapApiPayload } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';

interface Campaign {
  id: string;
  name: string;
  channel: string;
  status: string;
  segmentFilter: Record<string, unknown>;
  templateBody: string;
  createdAt: string;
}

interface SegmentPreview {
  count: number;
  sample: Array<{ userId: string; fullName: string; email: string }>;
}

interface SendResult {
  sent: number;
  failed: number;
  skipped: number;
}

const LIFECYCLE_OPTIONS = ['lead', 'drop_in', 'trial_member', 'member', 'past_member'];
const ACTIVITY_OPTIONS = ['active', 'at_risk', 'inactive'];

export function PickleCampaignAdmin() {
  const { orgId } = useParams<{ orgId: string }>();
  const { user } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [preview, setPreview] = useState<SegmentPreview | null>(null);
  const [previewCampaignId, setPreviewCampaignId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [templateBody, setTemplateBody] = useState('');
  const [channel, setChannel] = useState<'email' | 'push' | 'sms'>('email');
  const [gender, setGender] = useState<string>('');
  const [minAge, setMinAge] = useState('');
  const [maxAge, setMaxAge] = useState('');
  const [minDupr, setMinDupr] = useState('');
  const [maxDupr, setMaxDupr] = useState('');
  const [lifecycleStatus, setLifecycleStatus] = useState<string[]>([]);
  const [activityLevel, setActivityLevel] = useState<string[]>([]);

  const isOrgAdmin = user?.orgAdminOrgs?.some((o) => o.orgId === orgId);

  useEffect(() => {
    if (!orgId || !isOrgAdmin) {
      setLoading(false);
      return;
    }
    loadCampaigns();
  }, [orgId, isOrgAdmin]);

  const loadCampaigns = async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await pickleApi.listCampaigns(orgId);
      if (res.success && res.data) {
        const payload = unwrapApiPayload<{ campaigns: Campaign[] }>(res.data);
        if (payload?.campaigns) setCampaigns(payload.campaigns);
      }
    } catch {
      toast.error('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const buildSegmentFilter = () => {
    const filter: Record<string, unknown> = {};
    if (gender) filter.gender = gender;
    if (minAge) filter.minAge = Number(minAge);
    if (maxAge) filter.maxAge = Number(maxAge);
    if (minDupr) filter.minDupr = Number(minDupr);
    if (maxDupr) filter.maxDupr = Number(maxDupr);
    if (lifecycleStatus.length) filter.lifecycleStatus = lifecycleStatus;
    if (activityLevel.length) filter.activityLevel = activityLevel;
    return filter;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgId || !name.trim() || !templateBody.trim()) return;
    setCreating(true);
    try {
      const res = await pickleApi.createCampaign(orgId, {
        name: name.trim(),
        templateBody: templateBody.trim(),
        channel,
        segmentFilter: buildSegmentFilter(),
      });
      if (res.success) {
        toast.success('Campaign created');
        setShowForm(false);
        setName('');
        setTemplateBody('');
        setGender('');
        setMinAge('');
        setMaxAge('');
        setMinDupr('');
        setMaxDupr('');
        setLifecycleStatus([]);
        setActivityLevel([]);
        await loadCampaigns();
      } else {
        toast.error(res.error || 'Failed to create campaign');
      }
    } catch {
      toast.error('Failed to create campaign');
    } finally {
      setCreating(false);
    }
  };

  const handlePreview = async (campaignId: string) => {
    if (!orgId) return;
    setPreviewCampaignId(campaignId);
    try {
      const res = await pickleApi.previewCampaign(orgId, campaignId);
      if (res.success && res.data) {
        const data = unwrapApiPayload<SegmentPreview>(res.data);
        if (data) setPreview(data);
      } else {
        toast.error(res.error || 'Preview failed');
      }
    } catch {
      toast.error('Preview failed');
    }
  };

  const handleSend = async (campaignId: string) => {
    if (!orgId) return;
    if (!window.confirm('Send this campaign to all matching recipients?')) return;
    setSendingId(campaignId);
    try {
      const res = await pickleApi.sendCampaign(orgId, campaignId);
      if (res.success && res.data) {
        const result = unwrapApiPayload<SendResult>(res.data);
        if (result) {
          toast.success(`Sent ${result.sent}, failed ${result.failed}, skipped ${result.skipped}`);
        }
        await loadCampaigns();
      } else {
        toast.error(res.error || 'Send failed');
      }
    } catch {
      toast.error('Send failed');
    } finally {
      setSendingId(null);
    }
  };

  const toggleFilter = (arr: string[], item: string, setter: (v: string[]) => void) => {
    setter(arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item]);
  };

  const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-800',
    scheduled: 'bg-blue-100 text-blue-800',
    sending: 'bg-amber-100 text-amber-800',
    sent: 'bg-green-100 text-green-800',
    canceled: 'bg-red-100 text-red-800',
  };

  if (!isOrgAdmin) {
    return (
      <div className="p-6 flex items-center gap-2 text-red-600">
        <AlertCircle className="h-5 w-5" />
        You must be an organization admin to manage campaigns.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Megaphone className="h-6 w-6" />
            Marketing Campaigns
          </h1>
          <p className="text-gray-600 mt-1">
            Segment players by demographics and lifecycle, then send email campaigns.
          </p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-2" />
          New Campaign
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Create Campaign</CardTitle>
            <CardDescription>Define audience filters and message content</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <Label htmlFor="campaign-name">Campaign Name</Label>
                <Input
                  id="campaign-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Spring clinic promo"
                  required
                />
              </div>

              <div>
                <Label>Channel</Label>
                <Select value={channel} onValueChange={(v) => setChannel(v as typeof channel)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="push">Push (stub)</SelectItem>
                    <SelectItem value="sms">SMS (stub)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <Label>Gender</Label>
                  <Select value={gender || 'any'} onValueChange={(v) => setGender(v === 'any' ? '' : v)}>
                    <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="any">Any</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Min Age</Label>
                  <Input type="number" value={minAge} onChange={(e) => setMinAge(e.target.value)} />
                </div>
                <div>
                  <Label>Max Age</Label>
                  <Input type="number" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
                </div>
                <div>
                  <Label>Min DUPR</Label>
                  <Input type="number" step="0.1" value={minDupr} onChange={(e) => setMinDupr(e.target.value)} />
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Lifecycle Status</Label>
                <div className="flex flex-wrap gap-2">
                  {LIFECYCLE_OPTIONS.map((s) => (
                    <Badge
                      key={s}
                      variant={lifecycleStatus.includes(s) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleFilter(lifecycleStatus, s, setLifecycleStatus)}
                    >
                      {s.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label className="mb-2 block">Activity Level</Label>
                <div className="flex flex-wrap gap-2">
                  {ACTIVITY_OPTIONS.map((a) => (
                    <Badge
                      key={a}
                      variant={activityLevel.includes(a) ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => toggleFilter(activityLevel, a, setActivityLevel)}
                    >
                      {a.replace('_', ' ')}
                    </Badge>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="template">Message Body</Label>
                <Textarea
                  id="template"
                  rows={5}
                  value={templateBody}
                  onChange={(e) => setTemplateBody(e.target.value)}
                  placeholder="Hi! Join us for our spring clinic series..."
                  required
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={creating}>
                  {creating ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Create Draft
                </Button>
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {preview && previewCampaignId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Segment Preview</CardTitle>
            <CardDescription>{preview.count} matching recipients</CardDescription>
          </CardHeader>
          <CardContent>
            {preview.sample.length > 0 ? (
              <ul className="text-sm space-y-1">
                {preview.sample.map((s) => (
                  <li key={s.userId}>{s.fullName} — {s.email}</li>
                ))}
              </ul>
            ) : (
              <p className="text-gray-500 text-sm">No sample recipients</p>
            )}
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setPreview(null)}>
              Close
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {campaigns.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-gray-500">
              No campaigns yet. Create one to get started.
            </CardContent>
          </Card>
        ) : (
          campaigns.map((c) => (
            <Card key={c.id}>
              <CardContent className="py-4 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <span className="font-medium">{c.name}</span>
                    <Badge className={STATUS_COLORS[c.status] || ''}>{c.status}</Badge>
                    <Badge variant="outline">{c.channel}</Badge>
                  </div>
                  <p className="text-sm text-gray-500 mt-1 line-clamp-1">{c.templateBody}</p>
                  <p className="text-xs text-gray-400 mt-1">
                    Created {new Date(c.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(c.id)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    Preview
                  </Button>
                  {c.status === 'draft' && (
                    <Button
                      size="sm"
                      onClick={() => handleSend(c.id)}
                      disabled={sendingId === c.id}
                    >
                      {sendingId === c.id ? (
                        <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4 mr-1" />
                      )}
                      Send
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
