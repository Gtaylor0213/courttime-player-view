import { useCallback, useEffect, useState } from 'react';
import { Mail, Send, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { getAppLaunchEmail, sendAppLaunchTestEmail, startAppLaunchEmailSend } from '../../api/supportClient';

interface Job {
  status: 'sending' | 'done';
  total: number;
  sent: number;
  skipped: number;
  failed: number;
  errorMessage?: string;
}

interface LaunchEmailState {
  subject: string;
  previewHtml: string;
  remaining: number;
  sent: number;
  skipped: number;
  failed: number;
  unknown: number;
  job: Job | null;
}

const POLL_MS = 3000;

/**
 * The one-time "CourtTime is in the app stores" email to every account.
 * Send only reaches addresses that haven't been sent it, so pressing it again
 * after an interruption is safe.
 */
export function SupportAppLaunchEmail() {
  const [state, setState] = useState<LaunchEmailState | null>(null);
  const [loading, setLoading] = useState(true);
  const [testEmail, setTestEmail] = useState('');
  const [testName, setTestName] = useState('');
  const [testing, setTesting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [starting, setStarting] = useState(false);

  const load = useCallback(async () => {
    const res = await getAppLaunchEmail();
    if (res.success) setState(res.data);
    else toast.error(res.error || 'Failed to load');
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const sending = state?.job?.status === 'sending';
  useEffect(() => {
    if (!sending) return;
    const id = setInterval(load, POLL_MS);
    return () => clearInterval(id);
  }, [sending, load]);

  const handleTest = async () => {
    setTesting(true);
    const res = await sendAppLaunchTestEmail(testEmail.trim(), testName.trim() || undefined);
    setTesting(false);
    if (res.success) toast.success(`Test sent to ${testEmail.trim()}`);
    else toast.error(res.error || 'Test send failed');
  };

  const handleSend = async () => {
    if (!state) return;
    setStarting(true);
    const res = await startAppLaunchEmailSend(state.remaining);
    setStarting(false);
    setConfirmOpen(false);
    setConfirmText('');
    if (res.success) toast.success('Sending started');
    else toast.error(res.error || 'Could not start sending');
    load();
  };

  if (loading || !state) {
    return (
      <div className="flex justify-center py-10">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
      </div>
    );
  }

  const job = state.job;
  const done = job ? job.sent + job.skipped + job.failed : 0;
  const confirmPhrase = `SEND ${state.remaining}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">App Launch Email</h1>
          <p className="text-sm text-gray-500 mt-1">
            One email to every account with the App Store and Google Play badges. Each address gets it once.
          </p>
        </div>
        <Button variant="outline" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          ['Not sent yet', state.remaining],
          ['Sent', state.sent],
          ['Email turned off', state.skipped],
          ['Failed', state.failed],
          ['Interrupted', state.unknown],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">{label}</p>
              <p className="text-2xl font-semibold text-gray-900">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {job && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-sm font-medium text-gray-900">
              {job.status === 'sending' ? `Sending… ${done} of ${job.total}` : `Last run finished: ${done} of ${job.total}`}
            </p>
            <div className="h-2 w-full rounded bg-gray-100 overflow-hidden">
              <div
                className="h-full bg-green-600 transition-all"
                style={{ width: `${job.total ? Math.round((done / job.total) * 100) : 100}%` }}
              />
            </div>
            <p className="text-xs text-gray-500">
              {job.sent} sent · {job.skipped} email off · {job.failed} failed
              {job.errorMessage ? ` · first error: ${job.errorMessage}` : ''}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium text-gray-900">1. Send yourself a test</p>
          <p className="text-xs text-gray-500">
            Test sends don't count as sent. The badge images load from the live site, so test after the deploy.
          </p>
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="flex-1">
              <Label htmlFor="launch-test-email" className="sr-only">Email</Label>
              <Input id="launch-test-email" type="email" placeholder="you@example.com" value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)} />
            </div>
            <div className="sm:w-48">
              <Label htmlFor="launch-test-name" className="sr-only">Name</Label>
              <Input id="launch-test-name" placeholder="Name (optional)" value={testName}
                onChange={(e) => setTestName(e.target.value)} />
            </div>
            <Button onClick={handleTest} disabled={testing || !testEmail.trim()}>
              <Mail className="h-4 w-4 mr-2" />
              {testing ? 'Sending…' : 'Send test'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-sm font-medium text-gray-900">2. Send to everyone</p>
          <p className="text-xs text-gray-500">
            Goes to {state.remaining} addresses that haven't had it (about {Math.ceil((state.remaining * 0.75) / 60)} minutes).
            Members who turned email off are skipped. If it gets interrupted, press it again to finish the rest.
          </p>
          <Button className="bg-green-700 hover:bg-green-800" disabled={sending || state.remaining === 0}
            onClick={() => setConfirmOpen(true)}>
            <Send className="h-4 w-4 mr-2" />
            {state.remaining === 0 ? 'Everyone has it' : `Send to ${state.remaining} people`}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="text-sm font-medium text-gray-900">Preview</p>
          <p className="text-xs text-gray-500">Subject: {state.subject}</p>
          <iframe title="App launch email preview" srcDoc={state.previewHtml}
            className="w-full h-[720px] rounded border border-gray-200 bg-white" />
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email {state.remaining} people?</DialogTitle>
            <DialogDescription>
              This can't be undone. Type <span className="font-mono font-semibold">{confirmPhrase}</span> to confirm.
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
