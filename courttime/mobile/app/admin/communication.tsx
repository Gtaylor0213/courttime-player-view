/**
 * Admin Communication: email blast to members, plus the existing bulletin-board announcement post.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import { sendEmailBlast } from '../../src/api/admin';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';

export const ErrorBoundary = createRouteErrorBoundary('Admin Communication');

const RECIPIENT_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'pending', label: 'Pending' },
  { value: 'suspended', label: 'Suspended' },
];

export default function AdminCommunicationScreen() {
  const { user, facilityId } = useAuth();

  // Email blast
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [recipientFilter, setRecipientFilter] = useState('all');
  const [sendingBlast, setSendingBlast] = useState(false);

  // Bulletin announcement
  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);

  async function sendBlast() {
    if (!facilityId || !subject.trim() || !message.trim()) return;
    showAlert(
      'Send email blast?',
      `This will email every ${recipientFilter === 'all' ? '' : recipientFilter + ' '}member. This can't be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSendingBlast(true);
            const res = await sendEmailBlast(facilityId, subject.trim(), message.trim(), recipientFilter);
            setSendingBlast(false);
            if (res.success && res.data?.data) {
              const { sent, failed, total } = res.data.data;
              showAlert('Sent', `Delivered to ${sent} of ${total} recipients${failed ? ` (${failed} failed)` : ''}.`);
              setSubject('');
              setMessage('');
            } else {
              showApiErrorAlert(res, 'Could not send email blast');
            }
          },
        },
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
        <Button
          title="Send Email Blast"
          onPress={sendBlast}
          loading={sendingBlast}
          disabled={!subject.trim() || !message.trim() || sendingBlast}
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
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  cardSubtitle: { fontSize: FontSize.xs, color: Colors.textSecondary, marginBottom: Spacing.sm },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: Spacing.xs },
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
  chipTextSelected: { color: Colors.primary, fontWeight: '700' },
  multiline: { minHeight: 88, textAlignVertical: 'top', marginBottom: Spacing.sm },
});
