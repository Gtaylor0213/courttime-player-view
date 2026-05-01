/**
 * Terms & Conditions acceptance gate
 * Renders when the authenticated player has pending T&C versions to accept.
 * Blocks the rest of the app until each pending facility's terms are accepted.
 */

import { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../utils/alert';
import { useAuth } from '../contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius } from '../constants/theme';

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

  const current = pendingTermsAcceptances[0];
  const plainText = useMemo(
    () => htmlToPlainText(current?.contentHtml || ''),
    [current?.contentHtml]
  );

  if (!current) return null;

  const handleAccept = async () => {
    if (!agreed || submitting) return;
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

      <TouchableOpacity
        style={styles.checkboxRow}
        onPress={() => setAgreed(!agreed)}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
          {agreed && <Ionicons name="checkmark" size={18} color={Colors.textInverse} />}
        </View>
        <Text style={styles.checkboxLabel}>
          I have read and agree to the Terms & Conditions
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.acceptButton, (!agreed || submitting) && styles.acceptButtonDisabled]}
        onPress={handleAccept}
        disabled={!agreed || submitting}
      >
        {submitting ? (
          <ActivityIndicator size="small" color={Colors.textInverse} />
        ) : (
          <Text style={styles.acceptButtonText}>Accept & Continue</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity style={styles.logoutLink} onPress={logout}>
        <Text style={styles.logoutText}>Log out instead</Text>
      </TouchableOpacity>
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
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
    marginBottom: 4,
  },
  facilityName: {
    fontWeight: '700',
    color: Colors.text,
  },
  versionMeta: {
    fontSize: FontSize.xs,
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
    color: Colors.text,
    lineHeight: 22,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
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
    color: Colors.text,
  },
  acceptButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  acceptButtonDisabled: {
    opacity: 0.5,
  },
  acceptButtonText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  logoutLink: {
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  logoutText: {
    color: Colors.textSecondary,
    fontSize: FontSize.sm,
  },
});
