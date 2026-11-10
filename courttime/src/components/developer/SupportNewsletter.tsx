import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Send, RefreshCw, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { AutoGrowTextarea } from '../ui/auto-grow-textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../ui/utils';
import { buildNewsletterEmailHtml } from '../../../shared/utils/newsletterEmail';
import { NewsletterAudiencePicker, audiencePeople } from './NewsletterAudiencePicker';
import {
  deleteNewsletterDraft,
  getNewsletterSummary,
  listNewsletters,
  saveNewsletter,
  sendNewsletterTestEmail,
  startNewsletterSend,
  type NewsletterAudience,
  type NewsletterDraft,
  type NewsletterTarget,
} from '../../api/supportClient';

interface Newsletter extends NewsletterDraft {
  id: string;
  createdAt: string;
  sentAt: string | null;
}

interface ListItem extends Newsletter {
  sent: number;
  skipped: number;
  failed: number;
}

interface Job {
  newsletterId: string;
  status: 'sending' | 'done';
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  errorMessage?: string;
}

interface Summary {
  newsletter: Newsletter;
  targets: NewsletterTarget[];
  remaining: number;
  sent: number;
  skipped: number;
  failed: number;
  unknown: number;
  job: Job | null;
}

const POLL_MS = 3000;

const STARTER: NewsletterDraft = {
  subject: '',
  preheader: '',
  audience: 'all_admins',
  targetIds: [],
  body: `Hello CourtTime Admins,

A quick note on what's new in CourtTime.

## New Features

- **Feature name:** What it does and where to find it.
- **Feature name:** What it does and where to find it.

## Spotlight Feature: Feature name

A few sentences on the feature and how clubs can use it.

Best regards,

Reid Bissell
Founder, CourtTime`,
};

function sameDraft(a: NewsletterDraft, b: NewsletterDraft) {
  return a.subject === b.subject && (a.preheader || '') === (b.preheader || '') && a.body === b.body &&
    a.audience === b.audience && a.targetIds.join(',') === b.targetIds.join(',');
}

function toDraft(n: NewsletterDraft): NewsletterDraft {
  return { subject: n.subject, preheader: n.preheader || '', body: n.body, audience: n.audience, targetIds: n.targetIds ?? [] };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Write a newsletter, preview it in the branded CourtTime email layout, send
 * yourself a test, then send it to all or picked club admins, players or
 * clubs. Each issue
 * reaches an address once; pressing Send again only finishes the rest.
 */
export function SupportNewsletter() {
  const [list, setList] = useState<ListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NewsletterDraft>(STARTER);
  const [saved, setSaved] = useState<NewsletterDraft>(STARTER);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [testing, setTesting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [starting, setStarting] = useState(false);
  const [liveCount, setLiveCount] = useState<number | null>(null);

  const locked = Boolean(summary?.newsletter.sentAt);
  const dirty = !locked && !sameDraft(draft, saved);
  const previewHtml = useMemo(() => buildNewsletterEmailHtml(draft), [draft]);

  const loadList = useCallback(async () => {
    const res = await listNewsletters();
    if (res.success) setList(res.data);
    else toast.error(res.error || 'Failed to load newsletters');
    setLoading(false);
  }, []);

  const loadSummary = useCallback(async (id: string, resetDraft = false): Promise<Summary | null> => {
    const res = await getNewsletterSummary(id);
    if (!res.success) {
      toast.error(res.error || 'Failed to load the newsletter');
      return null;
    }
    const data: Summary = res.data;
    setSummary(data);
    if (resetDraft) {
      const loaded = toDraft(data.newsletter);
      setDraft(loaded);
      setSaved(loaded);
    }
    return data;
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  const sending = summary?.job?.status === 'sending';
  useEffect(() => {
    if (!sending || !selectedId) return;
    const id = setInterval(() => {
      loadSummary(selectedId);
      loadList();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [sending, selectedId, loadSummary, loadList]);

  const leaveCurrent = () => !dirty || window.confirm('Discard your unsaved changes?');

  const openNewsletter = async (id: string) => {
    if (id === selectedId || !leaveCurrent()) return;
    setSelectedId(id);
    setSummary(null);
    await loadSummary(id, true);
  };

  const startNew = () => {
    if (!leaveCurrent()) return;
    setSelectedId(null);
    setSummary(null);
    setDraft(STARTER);
    setSaved(STARTER);
  };

  const set = <K extends keyof NewsletterDraft>(key: K, value: NewsletterDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  /** Saves when needed; returns the id, or null if the save failed. */
  const save = async (): Promise<string | null> => {
    if (selectedId && !dirty) return selectedId;
    setSaving(true);
    const res = await saveNewsletter(draft, selectedId);
    setSaving(false);
    if (!res.success) {
      toast.error(res.error || 'Save failed');
      return null;
    }
    const id: string = res.data.id;
    const stored = toDraft(res.data);
    setSelectedId(id);
    setDraft(stored);
    setSaved(stored);
    await Promise.all([loadSummary(id), loadList()]);
    return id;
  };

  const handleSave = async () => {
    if (await save()) toast.success('Draft saved');
  };

  const handleDelete = async () => {
    if (!selectedId || !window.confirm('Delete this draft?')) return;
    const res = await deleteNewsletterDraft(selectedId);
    if (!res.success) {
      toast.error(res.error || 'Delete failed');
      return;
    }
    toast.success('Draft deleted');
    setSelectedId(null);
    setSummary(null);
    setDraft(STARTER);
    setSaved(STARTER);
    loadList();
  };

  const handleTest = async () => {
    setTesting(true);
    const { subject, preheader, body } = draft;
    const res = await sendNewsletterTestEmail(testEmail.trim(), { subject, preheader, body });
    setTesting(false);
    if (res.success) toast.success(`Test sent to ${testEmail.trim()}`);
    else toast.error(res.error || 'Test send failed');
  };

  const prepareSend = async () => {
    const id = await save();
    if (!id) return;
    const fresh = await loadSummary(id);
    if (!fresh) return;
    if (fresh.remaining === 0) {
      toast.error('Nobody left to send this to');
      return;
    }
    setConfirmText('');
    setConfirmOpen(true);
  };

  const handleSend = async () => {
    if (!selectedId || !summary) return;
    setStarting(true);
    const res = await startNewsletterSend(selectedId, summary.remaining);
    setStarting(false);
    setConfirmOpen(false);
    setConfirmText('');
    if (res.success) toast.success('Sending started');
    else toast.error(res.error || 'Could not start sending');
    await Promise.all([loadSummary(selectedId), loadList()]);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const job = summary?.job ?? null;
  const done = job ? job.sent + job.skipped + job.failed : 0;
  const people = audiencePeople(draft.audience);
  // Before sending: the picker's live count. After: who still hasn't had it.
  const shownCount = locked ? summary?.remaining ?? null : liveCount;
  // The dialog uses the count fetched right after saving, which is what the server checks.
  const remaining = summary?.remaining ?? 0;
  const confirmPhrase = `SEND ${remaining}`;
  const canSend = Boolean(draft.subject.trim() && draft.body.trim()) && !sending && shownCount !== 0;
  const sendLabel = shownCount === null
    ? `Send to ${people}…`
    : shownCount === 0
      ? locked ? 'Everyone has it' : 'Nobody to send to yet'
      : `Send to ${shownCount}${locked ? ' remaining' : ''} ${people}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Newsletter</h1>
          <p className="text-sm text-gray-500 mt-1">
            Write an email, preview it in the CourtTime layout, test it, then send it. Each address gets an issue once.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => { loadList(); if (selectedId) loadSummary(selectedId); }}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={startNew}>
            <Plus className="h-4 w-4 mr-2" />
            New newsletter
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <Card className="h-fit">
          <CardContent className="p-2">
            {list.length === 0 && <p className="text-sm text-gray-500 p-3">No newsletters yet.</p>}
            {list.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => openNewsletter(item.id)}
                className={cn(
                  'w-full text-left rounded-md px-3 py-2 hover:bg-gray-50',
                  item.id === selectedId && 'bg-gray-100'
                )}
              >
                <p className="text-sm font-medium text-gray-900 truncate">{item.subject}</p>
                <p className="text-xs text-gray-500">
                  {item.sentAt ? `Sent ${formatDate(item.sentAt)} · ${item.sent} delivered` : `Draft · ${formatDate(item.createdAt)}`}
                </p>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6 min-w-0">
          {locked && summary && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {[
                ['Not sent yet', summary.remaining],
                ['Sent', summary.sent],
                ['Email turned off', summary.skipped],
                ['Failed', summary.failed],
                ['Interrupted', summary.unknown],
              ].map(([label, value]) => (
                <Card key={label as string}>
                  <CardContent className="p-4">
                    <p className="text-xs text-gray-500">{label}</p>
                    <p className="text-2xl font-semibold text-gray-900">{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {job && (
            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium text-gray-900">
                  {job.status === 'sending' ? `Sending… ${done} of ${job.total}` : `Last run finished: ${done} of ${job.total}`}
                </p>
                <div className="h-2 w-full rounded bg-gray-100 overflow-hidden">
                  <div className="h-full bg-green-600 transition-all"
                    style={{ width: `${job.total ? Math.round((done / job.total) * 100) : 100}%` }} />
                </div>
                <p className="text-xs text-gray-500">
                  {job.sent} sent · {job.skipped} email off · {job.failed} failed
                  {job.errorMessage ? ` · first error: ${job.errorMessage}` : ''}
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-6 xl:grid-cols-2">
            <Card>
              <CardContent className="p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{selectedId ? 'Edit' : 'New newsletter'}</p>
                  {locked ? <Badge variant="secondary">Sent · read only</Badge> : dirty ? <Badge variant="outline">Unsaved</Badge> : null}
                </div>

                <div className="space-y-1">
                  <Label htmlFor="nl-subject">Subject</Label>
                  <Input id="nl-subject" value={draft.subject} disabled={locked} maxLength={200}
                    placeholder="What's new in CourtTime: November"
                    onChange={(e) => set('subject', e.target.value)} />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="nl-preheader">Preview text (optional)</Label>
                  <Input id="nl-preheader" value={draft.preheader || ''} disabled={locked} maxLength={200}
                    placeholder="The line inboxes show after the subject"
                    onChange={(e) => set('preheader', e.target.value)} />
                </div>

                <NewsletterAudiencePicker
                  audience={draft.audience}
                  targetIds={draft.targetIds}
                  knownTargets={summary?.targets ?? []}
                  disabled={locked}
                  onChange={(audience: NewsletterAudience, targetIds: string[]) =>
                    setDraft((d) => ({ ...d, audience, targetIds }))}
                  onCount={setLiveCount}
                />

                <div className="space-y-1">
                  <Label htmlFor="nl-body">Email</Label>
                  <AutoGrowTextarea id="nl-body" value={draft.body} disabled={locked} maxHeight={720}
                    className="w-full min-h-[320px] rounded-md border border-gray-300 px-3 py-2 text-sm font-mono leading-relaxed disabled:bg-gray-50"
                    onChange={(e) => set('body', e.target.value)} />
                  <p className="text-xs text-gray-500">
                    Blank line = new paragraph · <code>## Heading</code> · <code>- bullet</code> · <code>**bold**</code> ·{' '}
                    <code>[link text](https://…)</code> · pasted https:// links work too
                  </p>
                </div>

                {!locked && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={handleSave} disabled={saving || (!dirty && Boolean(selectedId))}>
                      <Save className="h-4 w-4 mr-2" />
                      {saving ? 'Saving…' : 'Save draft'}
                    </Button>
                    {selectedId && (
                      <Button variant="outline" onClick={handleDelete} className="text-red-600 hover:text-red-700">
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete draft
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4 space-y-2">
                <p className="text-sm font-medium text-gray-900">Preview</p>
                <p className="text-xs text-gray-500 truncate">Subject: {draft.subject || '(no subject yet)'}</p>
                <iframe title="Newsletter preview" srcDoc={previewHtml}
                  className="w-full h-[760px] rounded border border-gray-200 bg-white" />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium text-gray-900">1. Send yourself a test</p>
              <p className="text-xs text-gray-500">Sends what's in the editor now, saved or not. Tests don't count as sent.</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <Label htmlFor="nl-test-email" className="sr-only">Email</Label>
                  <Input id="nl-test-email" type="email" placeholder="you@example.com" value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)} />
                </div>
                <Button onClick={handleTest}
                  disabled={testing || !testEmail.trim() || !draft.subject.trim() || !draft.body.trim()}>
                  <Mail className="h-4 w-4 mr-2" />
                  {testing ? 'Sending…' : 'Send test'}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <p className="text-sm font-medium text-gray-900">2. Send it</p>
              <p className="text-xs text-gray-500">
                {locked
                  ? 'Already sent. This reaches only people who haven’t had it yet (people who joined the audience since, or failed sends).'
                  : 'Saves the draft and locks it, so everyone gets the same words.'}{' '}
                Members who turned email off are skipped. If it gets interrupted, press it again to finish the rest.
              </p>
              <Button className="bg-green-700 hover:bg-green-800" disabled={!canSend || saving} onClick={prepareSend}>
                <Send className="h-4 w-4 mr-2" />
                {sendLabel}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email {remaining} {people}?</DialogTitle>
            <DialogDescription>
              “{draft.subject}” goes out now and can’t be edited afterwards (about{' '}
              {Math.max(1, Math.ceil((remaining * 0.75) / 60))} min). Type{' '}
              <span className="font-mono font-semibold">{confirmPhrase}</span> to confirm.
            </DialogDescription>
          </DialogHeader>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={confirmPhrase} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button className="bg-green-700 hover:bg-green-800" disabled={starting || confirmText.trim() !== confirmPhrase}
              onClick={handleSend}>
              {starting ? 'Starting…' : 'Send now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
