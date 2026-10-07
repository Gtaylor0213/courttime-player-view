/**
 * Report / block sheet.
 * One sheet for every place a member can see someone else's content: a
 * message, a bulletin post, a hitting-partner post, or the member themselves.
 * Required by App Store Guideline 1.2 (report offensive content, block
 * abusive users).
 */

import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { moderationApi, type ReportContentType, type ReportReason } from '../api/moderation';
import { showAlert, showApiErrorAlert } from '../utils/alert';
import { COURTTIME_TEAM_USER_ID } from '../../../shared/constants/courttimeTeam';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import { Button } from './Button';

export interface ModerationTarget {
  contentType: ReportContentType;
  /** Id of the message or post; for `user`, the member's id. */
  contentId: string;
  /** The member who wrote it, offered as "Block". */
  userId: string;
  userName: string;
  facilityId?: string | null;
}

interface ModerationSheetProps {
  target: ModerationTarget | null;
  onClose: () => void;
  /** Called after a successful block, so the screen can drop that member's content. */
  onBlocked?: (userId: string) => void;
}

const REASONS: Array<{ value: ReportReason; label: string }> = [
  { value: 'harassment', label: 'Harassment or bullying' },
  { value: 'inappropriate', label: 'Offensive or inappropriate' },
  { value: 'spam', label: 'Spam or scam' },
  { value: 'other', label: 'Something else' },
];

const TITLES: Record<ReportContentType, string> = {
  message: 'Report message',
  bulletin_post: 'Report post',
  hitting_partner_post: 'Report post',
  user: 'Report member',
};

export function ModerationSheet({ target, onClose, onBlocked }: ModerationSheetProps) {
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState<'report' | 'block' | null>(null);

  useEffect(() => {
    setReason(null);
    setDetails('');
    setBusy(null);
  }, [target?.contentType, target?.contentId]);

  if (!target) return null;
  const firstName = target.userName.trim().split(' ')[0] || 'this member';
  // The official account can be reported but not blocked (the server refuses too).
  const canBlock = target.userId !== COURTTIME_TEAM_USER_ID;

  async function submitReport() {
    if (!target || !reason) return;
    setBusy('report');
    const res = await moderationApi.report({
      contentType: target.contentType,
      contentId: target.contentId,
      reason,
      details: details.trim() || undefined,
      facilityId: target.facilityId,
    });
    setBusy(null);
    if (!res.success) {
      showApiErrorAlert(res, 'Could not send report');
      return;
    }
    onClose();
    showAlert(
      'Report sent',
      canBlock
        ? `Thanks for letting us know. We review reports within 24 hours and remove content that breaks our rules. You can also block ${firstName} so you no longer see their messages or posts.`
        : 'Thanks for letting us know. We review reports within 24 hours and remove content that breaks our rules.'
    );
  }

  function confirmBlock() {
    if (!target) return;
    showAlert(
      `Block ${target.userName}?`,
      "You won't see their messages or posts, and neither of you will be able to message the other. They won't be told. You can unblock them from Profile.",
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => void block() },
      ]
    );
  }

  async function block() {
    if (!target) return;
    setBusy('block');
    const res = await moderationApi.block(target.userId);
    setBusy(null);
    if (!res.success) {
      showApiErrorAlert(res, 'Could not block member');
      return;
    }
    onClose();
    onBlocked?.(target.userId);
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <TouchableOpacity style={styles.dismissArea} onPress={onClose} accessibilityLabel="Close" />
        <View style={styles.sheet}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.headerRow}>
              <Text style={styles.title}>{TITLES[target.contentType]}</Text>
              <TouchableOpacity
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons name="close" size={24} color={Colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <Text style={styles.subtitle}>
              Why are you reporting this? {target.userName} won't be told who reported it.
            </Text>

            {REASONS.map((option) => {
              const selected = reason === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  style={[styles.reasonRow, selected && styles.reasonRowSelected]}
                  onPress={() => setReason(option.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={option.label}
                >
                  <Ionicons
                    name={selected ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={selected ? Colors.primary : Colors.textMuted}
                  />
                  <Text style={styles.reasonLabel}>{option.label}</Text>
                </TouchableOpacity>
              );
            })}

            <TextInput
              style={styles.details}
              value={details}
              onChangeText={setDetails}
              placeholder="Add details (optional)"
              placeholderTextColor={Colors.textMuted}
              multiline
              maxLength={1000}
              accessibilityLabel="Report details"
            />

            <Button
              title="Send report"
              onPress={() => void submitReport()}
              loading={busy === 'report'}
              disabled={!reason || busy !== null}
            />

            {canBlock ? (
              <>
              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.blockRow}
                onPress={confirmBlock}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel={`Block ${target.userName}`}
              >
                <Ionicons name="ban-outline" size={20} color={Colors.destructive} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.blockTitle}>Block {target.userName}</Text>
                  <Text style={styles.blockDescription}>
                    Hide their messages and posts and stop them messaging you
                  </Text>
                </View>
              </TouchableOpacity>
              </>
            ) : null}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  dismissArea: {
    flex: 1,
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: '85%',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: FontSize.lg,
    fontFamily: FontFamily.semiBold,
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: Spacing.xs,
    marginBottom: Spacing.md,
  },
  reasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.sm,
    borderRadius: BorderRadius.md,
    minHeight: 44,
  },
  reasonRowSelected: {
    backgroundColor: Colors.surface,
  },
  reasonLabel: {
    flex: 1,
    fontSize: FontSize.md,
    color: Colors.text,
  },
  details: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    minHeight: 72,
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    fontSize: FontSize.md,
    color: Colors.text,
    textAlignVertical: 'top',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
    marginVertical: Spacing.md,
  },
  blockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    minHeight: 44,
  },
  blockTitle: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.semiBold,
    color: Colors.destructive,
  },
  blockDescription: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    marginTop: 2,
  },
});
