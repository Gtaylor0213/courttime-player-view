/**
 * Terms & Conditions acceptance gate
 * Renders when the authenticated player has pending T&C versions to accept.
 * Blocks the rest of the app until each pending facility's terms are accepted.
 */

import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../utils/alert';
import { useAuth } from '../contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius, TouchTarget, FontFamily } from '../constants/theme';
import { Button } from './Button';

// Strip HTML tags and decode common entities for plain-text rendering.
// Preserves block-level structure by mapping <p>, <br>, <li> to line breaks.
function htmlToPlainText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li)>/gi, '\n\n')
    .replace(/<li[^>]*>/gi, '\u2022 ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function TermsAcceptanceGate() {
  const { pendingTermsAcceptances, acceptTermsAndContinue, logout } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [reviewSecondsRemaining, setReviewSecondsRemaining] = useState(0);
  const [downloadedAttachmentIds, setDownloadedAttachmentIds] = useState<string[]>([]);

  const current = pendingTermsAcceptances[0];
  const plainText = useMemo(
    () => htmlToPlainText(current?.contentHtml || ''),
    [current?.contentHtml]
  );

  useEffect(() => {
    setAgreed(false);
    setReviewSecondsRemaining(Math.max(0, Number(current?.requiredReviewSeconds) || 0));
    setDownloadedAttachmentIds([]);
  }, [current?.facilityId, current?.currentVersionNumber, current?.requiredReviewSeconds]);

  useEffect(() => {
    if (reviewSecondsRemaining <= 0) return;

    const timeoutId = setTimeout(() => {
      setReviewSecondsRemaining((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => clearTimeout(timeoutId);
  }, [reviewSecondsRemaining]);

  if (!current) return null;

  const allAttachmentsDownloaded = current.attachments.every((attachment) =>
    downloadedAttachmentIds.includes(attachment.id)
  );
  const attachmentsStillRequired = current.attachments.length > 0 && !allAttachmentsDownloaded;

  const handleAccept = async () => {
    if (!agreed || submitting || reviewSecondsRemaining > 0 || attachmentsStillRequired) return;
    setSubmitting(true);
    const ok = await acceptTermsAndContinue(current.facilityId);
    if (ok) {
      setAgreed(false);
    } else {
      showAlert('Error', 'Could not accept Terms & Conditions. Please try again.');
    }
    setSubmitting(false);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Terms & Conditions Update</Text>
        <Text style={styles.subtitle}>
          You must accept the latest Terms & Conditions for{' '}
          <Text style={styles.facilityName}>{current.facilityName}</Text> to continue.
        </Text>
        <Text style={styles.versionMeta}>
          Version {current.currentVersionNumber} · Published{' '}
          {new Date(current.publishedAt).toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </Text>
      </View>

      <ScrollView style={styles.contentBox} contentContainerStyle={styles.contentInner}>
        <Text style={styles.contentText}>{plainText}</Text>
      </ScrollView>

      {current.attachments.length > 0 && (
        <View style={styles.attachmentsSection}>
          <Text style={styles.attachmentsTitle}>PDF Attachments</Text>
          {current.attachments.map((attachment) => (
            <Pressable
              key={attachment.id}
              style={({ pressed }) => [styles.attachmentButton, pressed && styles.pressedOpacity]}
              onPress={async () => {
                try {
                  await Linking.openURL(attachment.dataUrl);
                  setDownloadedAttachmentIds((prev) => (
                    prev.includes(attachment.id) ? prev : [...prev, attachment.id]
                  ));
                } catch (error) {
                  console.error('Failed to open terms attachment:', error);
                  showAlert('Error', `Could not open ${attachment.fileName}.`);
                }
              }}
            >
              <Text style={styles.attachmentText}>
                {downloadedAttachmentIds.includes(attachment.id)
                  ? `${attachment.fileName} (downloaded)`
                  : attachment.fileName}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {attachmentsStillRequired && (
        <Text style={styles.reviewTimer}>
          Download all attached PDFs to enable acceptance.
        </Text>
      )}

      {reviewSecondsRemaining > 0 && (
        <Text style={styles.reviewTimer}>
          Review time remaining: {reviewSecondsRemaining} second{reviewSecondsRemaining === 1 ? '' : 's'}.
        </Text>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.checkboxRow,
          (reviewSecondsRemaining > 0 || attachmentsStillRequired) && styles.checkboxRowDisabled,
          pressed && styles.pressedOpacity,
        ]}
        onPress={() => {
          if (reviewSecondsRemaining > 0 || attachmentsStillRequired) return;
          setAgreed(!agreed);
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed, disabled: reviewSecondsRemaining > 0 || attachmentsStillRequired }}
      >
        <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
          {agreed && <Ionicons name="checkmark" size={18} color={Colors.textInverse} />}
        </View>
        <Text style={styles.checkboxLabel}>
          I have read and agree to the Terms & Conditions
        </Text>
      </Pressable>

      <Button
        title="Accept & Continue"
        onPress={handleAccept}
        disabled={!agreed || reviewSecondsRemaining > 0 || attachmentsStillRequired}
        loading={submitting}
      />

      <Button variant="destructive" title="Log out instead" onPress={logout} style={styles.logoutButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xl + Spacing.lg,
    paddingBottom: Spacing.lg,
  },
  header: {
    marginBottom: Spacing.md,
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.bold,
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 4,
  },
  facilityName: {
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  versionMeta: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
  },
  contentBox: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: Spacing.md,
  },
  contentInner: {
    padding: Spacing.md,
  },
  contentText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.text,
    lineHeight: 22,
  },
  reviewTimer: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
  },
  attachmentsSection: {
    marginBottom: Spacing.md,
    gap: Spacing.sm,
  },
  attachmentsTitle: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    color: Colors.text,
  },
  attachmentButton: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
  },
  attachmentText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.primary,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
    minHeight: TouchTarget.min,
  },
  checkboxRowDisabled: {
    opacity: 0.5,
  },
  pressedOpacity: {
    opacity: 0.85,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.card,
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  checkboxLabel: {
    flex: 1,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.regular,
    color: Colors.text,
  },
  logoutButton: {
    marginTop: Spacing.sm,
  },
});
