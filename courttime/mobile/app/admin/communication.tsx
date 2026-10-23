/**
 * Admin Communication: email blast to members, plus the existing bulletin-board announcement post.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import {
  sendEmailBlast,
  getEmailBlastJob,
  getLatestEmailBlast,
  type EmailBlastJob,
} from '../../src/api/admin';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';

export const ErrorBoundary = createRouteErrorBoundary('Admin Communication');

const RECIPIENT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'suspended', label: 'Suspended' },
];

const POLL_INTERVAL_MS = 2000;
/** A finished blast stays on screen (and counts as "just sent") for this long. */
const RECENT_MS = 30 * 60 * 1000;

function isRecent(job: EmailBlastJob) {
  return Date.now() - Date.parse(job.startedAt) < RECENT_MS;
}

function blastStatusText(job: EmailBlastJob) {
  if (job.status === 'sending') {
    return `Sending "${job.subject}"… ${job.sent + job.failed} of ${job.total}. You can leave this screen — sending continues on the server.`;
  }
  return `"${job.subject}" delivered to ${job.sent} of ${job.total} recipients${job.failed ? ` (${job.failed} failed)` : ''}.`;
}

export default function AdminCommunicationScreen() {
  const { user, facilityId } = useAuth();

  // Email blast
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientFilter, setRecipientFilter] = useState('all');
  const [sendingBlast, setSendingBlast] = useState(false);
  const [blastJob, setBlastJob] = useState<EmailBlastJob | null>(null);
  const blastInProgress = blastJob?.status === 'sending';

  // Bulletin announcement
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);

  // Show a blast that is still going (or just finished) when the screen opens.
  useEffect(() => {
    if (!facilityId) return;
    setBlastJob(null);
    getLatestEmailBlast(facilityId).then((res) => {
      const latest = res.success ? res.data?.data?.job : null;
      if (latest && (latest.status === 'sending' || isRecent(latest))) setBlastJob(latest);
    });
  }, [facilityId]);

  // Poll while sending; a failed poll just retries on the next tick.
  useEffect(() => {
    if (!blastJob || blastJob.status !== 'sending') return;
    const timer = setInterval(async () => {
      const res = await getEmailBlastJob(blastJob.facilityId, blastJob.jobId);
      const next = res.success ? res.data?.data?.job : null;
      if (!next) return;
      setBlastJob(next);
      if (next.status === 'done') showAlert('Sent', blastStatusText(next));
    }, POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [blastJob?.jobId, blastJob?.status]);

  async function startBlast(allowDuplicate: boolean) {
    if (!facilityId) return;
    setSendingBlast(true);
    const res = await sendEmailBlast(facilityId, subject.trim(), message.trim(), recipientFilter, allowDuplicate);
    const result = res.success ? res.data?.data : null;

    if (!result?.job) {
      // The request may have reached the server before the connection dropped,
      // so look for the blast before suggesting a resend.
      const latest = await getLatestEmailBlast(facilityId);
      const latestJob = latest.success ? latest.data?.data?.job : null;
      setSendingBlast(false);
      if (latestJob && latestJob.subject === subject.trim() && isRecent(latestJob)) {
        setBlastJob(latestJob);
      } else {
        showApiErrorAlert(res, 'Could not send email blast');
      }
      return;
    }

    setSendingBlast(false);
    setBlastJob(result.job);
    if (result.duplicate) {
      if (result.job.status === 'sending') return;
      showAlert('Already sent', `${blastStatusText(result.job)}\n\nSend it to everyone again?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send again', style: 'destructive', onPress: () => startBlast(true) },
      ]);
      return;
    }
    setSubject('');
    setMessage('');
  }

  function sendBlast() {
    if (!facilityId || !subject.trim() || !message.trim()) return;
    showAlert(
      'Send email blast?',
      `This will email every ${recipientFilter === 'all' ? '' : recipientFilter + ' '}member. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Send', onPress: () => startBlast(false) },
      ]
    );
  }

  async function postAnnouncement() {
    if (!facilityId || !user || !announcementTitle.trim() || !announcementBody.trim()) return;
    setPostingAnnouncement(true);
    const res = await api.post('/api/bulletin-board', {
      facilityId,
      authorId: user.id,
      title: announcementTitle.trim(),
      content: announcementBody.trim(),
      category: 'announcement',
      isAdminPost: true,
    });
    setPostingAnnouncement(false);
    if (res.success) {
      showAlert('Posted', 'Facility announcement posted.');
      setAnnouncementTitle('');
      setAnnouncementBody('');
    } else {
      showApiErrorAlert(res, 'Could not post announcement');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xl }}>
      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Email Blast</Text>
        <Text style={styles.cardSubtitle}>Sends a real email to every matching member — use for important updates.</Text>

        <Text style={styles.label}>Recipients</Text>
        <View style={styles.chipsWrap}>
          {RECIPIENT_FILTERS.map((f) => (
            <TouchableOpacity
              key={f.value}
              style={[styles.chip, recipientFilter === f.value && styles.chipSelected]}
              onPress={() => setRecipientFilter(f.value)}
            >
              <Text style={[styles.chipText, recipientFilter === f.value && styles.chipTextSelected]}>{f.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Subject</Text>
        <Input value={subject} onChangeText={setSubject} placeholder="Important update" />
        <Text style={styles.label}>Message</Text>
        <Input
          value={message}
          onChangeText={setMessage}
          placeholder="Write your message..."
          multiline
          style={styles.multiline}
        />
        {blastJob && <Text style={styles.blastStatus}>{blastStatusText(blastJob)}</Text>}
        <Button
          title={blastInProgress ? 'Sending…' : 'Send Email Blast'}
          onPress={sendBlast}
          loading={sendingBlast || blastInProgress}
          disabled={!subject.trim() || !message.trim() || sendingBlast || blastInProgress}
        />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Facility Announcement</Text>
        <Text style={styles.cardSubtitle}>Posts to the in-app bulletin board (not an email).</Text>
        <Text style={styles.label}>Title</Text>
        <Input value={announcementTitle} onChangeText={setAnnouncementTitle} placeholder="Important update" />
        <Text style={styles.label}>Message</Text>
        <Input
          value={announcementBody}
          onChangeText={setAnnouncementBody}
          placeholder="Write announcement..."
          multiline
          style={styles.multiline}
        />
        <Button
          title="Post Announcement"
          onPress={postAnnouncement}
          loading={postingAnnouncement}
          disabled={!announcementTitle.trim() || !announcementBody.trim()}
        />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontFamily: FontFamily.bold, color: Colors.text, marginBottom: 4 },
  cardSubtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: Spacing.sm },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontFamily: FontFamily.medium, marginBottom: 6, marginTop: Spacing.xs },
  blastStatus: { fontSize: FontSize.sm, color: Colors.text, marginBottom: Spacing.sm },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs, marginBottom: Spacing.sm },
  chip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
  },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primaryDark, fontFamily: FontFamily.bold },
  multiline: { minHeight: 88, textAlignVertical: 'top', marginBottom: Spacing.sm },
});
