/**
 * Terms & Conditions acceptance gate
 * Renders when the authenticated player has pending T&C versions to accept.
 * Blocks the rest of the app until each pending facility's terms are accepted.
 */

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../utils/alert';
import { useAuth } from '../contexts/AuthContext';
import { Colors, Spacing, FontSize, BorderRadius, TouchTarget, FontFamily } from '../constants/theme';
import { Button } from './Button';

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

function tryMarkNoScrollNeeded(viewportH: number, contentH: number, setScrolled: (v: boolean) => void) {
  if (viewportH > 0 && contentH > 0 && contentH <= viewportH + 8) {
    setScrolled(true);
  }
}

export function TermsAcceptanceGate() {
  const { pendingTermsAcceptances, acceptTermsAndContinue, logout } = useAuth();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const viewportHRef = useRef(0);
  const contentHRef = useRef(0);

  const current = pendingTermsAcceptances[0];
  const plainText = useMemo(
    () => htmlToPlainText(current?.contentHtml || ''),
    [current?.contentHtml]
  );

  useLayoutEffect(() => {
    setAgreed(false);
    setScrolledToBottom(false);
    viewportHRef.current = 0;
    contentHRef.current = 0;
  }, [current?.facilityId, current?.currentVersionNumber]);

  if (!current) return null;

  const scrollKey = `${current.facilityId}-${current.currentVersionNumber}`;

  const handleAccept = async () => {
    if (!agreed || submitting || !scrolledToBottom) return;
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

      <ScrollView
        key={scrollKey}
        style={styles.contentBox}
        contentContainerStyle={styles.contentInner}
        onLayout={(e) => {
          viewportHRef.current = e.nativeEvent.layout.height;
          tryMarkNoScrollNeeded(viewportHRef.current, contentHRef.current, setScrolledToBottom);
        }}
        onContentSizeChange={(_, h) => {
          contentHRef.current = h;
          tryMarkNoScrollNeeded(viewportHRef.current, contentHRef.current, setScrolledToBottom);
        }}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const padding = 24;
          const reachedBottom =
            layoutMeasurement.height + contentOffset.y >= contentSize.height - padding;
          if (reachedBottom) setScrolledToBottom(true);
        }}
        scrollEventThrottle={16}
      >
        <Text style={styles.contentText}>{plainText}</Text>
      </ScrollView>

      {!scrolledToBottom && (
        <Text style={styles.hint}>
          Scroll to the bottom of the terms to enable acceptance.
        </Text>
      )}

      <Pressable
        style={({ pressed }) => [
          styles.checkboxRow,
          !scrolledToBottom && styles.checkboxRowDisabled,
          pressed && styles.pressedOpacity,
        ]}
        onPress={() => {
          if (!scrolledToBottom) return;
          setAgreed(!agreed);
        }}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed, disabled: !scrolledToBottom }}
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
        disabled={!agreed || submitting || !scrolledToBottom}
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
  hint: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.regular,
    color: Colors.textMuted,
    marginBottom: Spacing.sm,
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
