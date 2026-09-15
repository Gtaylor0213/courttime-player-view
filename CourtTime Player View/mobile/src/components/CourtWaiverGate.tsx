/**
 * Per-court waiver acceptance, gating the booking submit.
 *
 * Mirrors web's `useCourtWaiverGate` / `CourtWaiverAcceptanceDialog`. Without
 * this, a member at a facility with `court_waivers` on — which is **default
 * ON** — books a waiver-required court, the server rejects it with
 * COURT-WAIVER-NOT-ACCEPTED, and the app offers no way to resolve it.
 *
 * Acceptance is per booking, not once per member: the server only counts an
 * acceptance recorded in the last 15 minutes, so this runs on every attempt.
 *
 * Usage:
 *   const waiverGate = useCourtWaiverGate();
 *   if (!(await waiverGate.ensureAccepted(courtIds))) return; // declined
 *   ...
 *   <CourtWaiverAcceptanceModal {...waiverGate.modalProps} />
 */

import React, { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { courtWaiverEndpoints } from '../api/endpoints';
import { unwrapApiPayload } from '../../../shared/api/core';
import { htmlToDisplayText } from '../utils/htmlToText';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import { Button } from './Button';

export interface PendingCourtWaiver {
  courtId: string;
  courtName: string;
  facilityId: string;
  waiverVersionId: string;
  versionNumber: number;
  contentHtml: string;
  publishedAt: string;
}

function parsePendingWaivers(responseData: unknown): PendingCourtWaiver[] {
  const payload = unwrapApiPayload<{ pending?: unknown }>(responseData);
  const pending = payload?.pending;
  if (!Array.isArray(pending)) return [];
  return pending.filter(
    (w): w is PendingCourtWaiver =>
      Boolean(w) && typeof (w as PendingCourtWaiver).courtId === 'string'
  );
}

export function useCourtWaiverGate() {
  const [pendingWaivers, setPendingWaivers] = useState<PendingCourtWaiver[]>([]);
  const resolverRef = useRef<((accepted: boolean) => void) | null>(null);

  const finish = useCallback((accepted: boolean) => {
    setPendingWaivers([]);
    resolverRef.current?.(accepted);
    resolverRef.current = null;
  }, []);

  const ensureAccepted = useCallback(async (courtIds: string[]): Promise<boolean> => {
    const uniqueIds = [...new Set(courtIds.filter(Boolean))];
    if (uniqueIds.length === 0) return true;

    const res = await courtWaiverEndpoints.pending(uniqueIds);
    if (!res.success) {
      // Let the booking proceed: the server blocks an unaccepted waiver itself
      // and returns a violation the booking flow already surfaces. Failing
      // open here avoids blocking bookings on courts with no waiver at all.
      return true;
    }

    const waivers = parsePendingWaivers(res.data);
    if (waivers.length === 0) return true;

    setPendingWaivers(waivers);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleAccepted = useCallback((courtId: string) => {
    setPendingWaivers((prev) => {
      const remaining = prev.filter((w) => w.courtId !== courtId);
      if (remaining.length === 0) {
        resolverRef.current?.(true);
        resolverRef.current = null;
      }
      return remaining;
    });
  }, []);

  const handleDeclined = useCallback(() => finish(false), [finish]);

  return {
    ensureAccepted,
    modalProps: {
      pendingWaivers,
      onAccepted: handleAccepted,
      onDeclined: handleDeclined,
    },
  };
}

/** Marks short waivers as read when they don't fill the scroll viewport. */
function tryMarkNoScrollNeeded(
  viewportH: number,
  contentH: number,
  setScrolled: (v: boolean) => void
) {
  if (viewportH > 0 && contentH > 0 && contentH <= viewportH + 8) {
    setScrolled(true);
  }
}

export function CourtWaiverAcceptanceModal({
  pendingWaivers,
  onAccepted,
  onDeclined,
}: {
  pendingWaivers: PendingCourtWaiver[];
  onAccepted: (courtId: string) => void;
  onDeclined: () => void;
}) {
  const current = pendingWaivers[0];
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrolledToBottom, setScrolledToBottom] = useState(false);
  const viewportHRef = useRef(0);
  const contentHRef = useRef(0);

  const waiverText = useMemo(
    () => htmlToDisplayText(current?.contentHtml),
    [current?.contentHtml]
  );

  // Fresh state per waiver when several are reviewed back to back.
  useLayoutEffect(() => {
    setAgreed(false);
    setError(null);
    setScrolledToBottom(false);
    viewportHRef.current = 0;
    contentHRef.current = 0;
  }, [current?.courtId, current?.versionNumber]);

  const handleAccept = async () => {
    if (!current || !agreed || submitting) return;
    setSubmitting(true);
    setError(null);
    const res = await courtWaiverEndpoints.accept(current.courtId);
    setSubmitting(false);
    if (res.success) {
      onAccepted(current.courtId);
    } else {
      setError(res.error || 'Could not record your acceptance. Please try again.');
    }
  };

  if (!current) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onDeclined}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Text style={styles.title}>Waiver Required</Text>
          <Text style={styles.subtitle}>
            <Text style={styles.courtName}>{current.courtName}</Text> requires you to accept its
            waiver each time you book it.
            {pendingWaivers.length > 1 ? ` ${pendingWaivers.length} waivers to review.` : ''}
          </Text>

          <ScrollView
            key={`${current.courtId}-${current.versionNumber}`}
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
              if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 24) {
                setScrolledToBottom(true);
              }
            }}
            scrollEventThrottle={16}
          >
            <Text style={styles.contentText}>{waiverText}</Text>
          </ScrollView>

          {!scrolledToBottom && (
            <Text style={styles.hint}>Scroll to the bottom of the waiver to continue.</Text>
          )}

          <Pressable
            style={({ pressed }) => [
              styles.checkboxRow,
              !scrolledToBottom && styles.checkboxRowDisabled,
              pressed && styles.pressed,
            ]}
            onPress={() => {
              if (!scrolledToBottom) return;
              setAgreed((v) => !v);
            }}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed, disabled: !scrolledToBottom }}
          >
            <View style={[styles.checkbox, agreed && styles.checkboxChecked]}>
              {agreed && <Ionicons name="checkmark" size={18} color={Colors.textInverse} />}
            </View>
            <Text style={styles.checkboxLabel}>
              I have read and agree to the waiver for {current.courtName}
            </Text>
          </Pressable>

          {error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Button
              title="Cancel"
              variant="secondary"
              onPress={onDeclined}
              disabled={submitting}
              style={styles.actionButton}
            />
            <Button
              title={submitting ? 'Accepting…' : 'Accept & Continue'}
              onPress={handleAccept}
              disabled={!agreed || submitting}
              style={styles.actionButton}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.background,
    borderTopLeftRadius: BorderRadius.lg,
    borderTopRightRadius: BorderRadius.lg,
    padding: Spacing.lg,
    maxHeight: '90%',
    gap: Spacing.sm,
  },
  title: {
    fontSize: FontSize.xl,
    fontFamily: FontFamily.bold,
    fontWeight: '800',
    color: Colors.text,
  },
  subtitle: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 20,
  },
  courtName: {
    fontFamily: FontFamily.bold,
    fontWeight: '700',
    color: Colors.text,
  },
  contentBox: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    maxHeight: 280,
  },
  contentInner: {
    padding: Spacing.md,
  },
  contentText: {
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 21,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    paddingVertical: Spacing.xs,
  },
  checkboxRowDisabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.7,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: BorderRadius.sm,
    borderWidth: 2,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
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
  error: {
    fontSize: FontSize.sm,
    color: Colors.error,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
});
