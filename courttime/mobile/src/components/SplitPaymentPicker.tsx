/**
 * Split court payment picker.
 *
 * Mirrors web's `SplitPaymentPicker`: a toggle plus a member search for
 * splitting a paid court's fee. The organiser's share is charged at checkout;
 * each other participant gets a window to pay their own share before the hold
 * is released.
 *
 * The parent decides *when* to show this — web gates it on the flag, a court
 * total, a single court, and neither recurring nor post-play settlement.
 */

import React, { useEffect, useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { bookingMemberEndpoints } from '../api/endpoints';
import { unwrapApiPayload } from '../../../shared/api/core';
import { Colors, Spacing, FontSize, BorderRadius, FontFamily } from '../constants/theme';
import { Input } from './Input';

/** Organiser plus three others, matching web. */
export const MAX_SPLIT_PARTICIPANTS = 4;

export interface SplitPaymentMember {
  userId: string;
  fullName: string;
  email?: string;
}

/** The lookup returns `{ success, members }`, sometimes wrapped in `data`. */
export function parseMemberLookup(responseData: unknown): SplitPaymentMember[] {
  const direct = (responseData as { members?: unknown })?.members;
  const nested = unwrapApiPayload<{ members?: unknown }>(responseData)?.members;
  const list = Array.isArray(direct) ? direct : Array.isArray(nested) ? nested : [];
  return list.filter(
    (m): m is SplitPaymentMember =>
      Boolean(m) && typeof (m as SplitPaymentMember).userId === 'string'
  );
}

interface SplitPaymentPickerProps {
  facilityId: string;
  currentUserId?: string;
  enabled: boolean;
  onEnabledChange: (enabled: boolean) => void;
  members: SplitPaymentMember[];
  onMembersChange: (members: SplitPaymentMember[]) => void;
  /** Hide the enable switch — the caller already decided the fee is split (editing an existing roster). */
  pickerOnly?: boolean;
}

export function SplitPaymentPicker({
  facilityId,
  currentUserId,
  enabled,
  onEnabledChange,
  members,
  onMembersChange,
  pickerOnly = false,
}: SplitPaymentPickerProps) {
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<SplitPaymentMember[]>([]);

  useEffect(() => {
    if (!enabled) {
      setMemberSearch('');
      setMemberResults([]);
      return;
    }
    if (memberSearch.trim().length < 2) {
      setMemberResults([]);
      return;
    }

    let cancelled = false;
    void bookingMemberEndpoints
      .lookup(facilityId, memberSearch)
      .then((res) => {
        if (cancelled) return;
        const found = res.success ? parseMemberLookup(res.data) : [];
        // Never offer the organiser as one of the other participants.
        setMemberResults(found.filter((m) => m.userId !== currentUserId));
      })
      .catch(() => {
        if (!cancelled) setMemberResults([]);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, memberSearch, facilityId, currentUserId]);

  const atCap = members.length >= MAX_SPLIT_PARTICIPANTS - 1;
  const visibleResults = memberResults.filter(
    (result) => !members.some((member) => member.userId === result.userId)
  );

  return (
    <View style={styles.container}>
      {!pickerOnly && (
        <View style={styles.toggleRow}>
          <Text style={styles.label}>Split this court fee with members</Text>
          <Switch
            value={enabled}
            onValueChange={onEnabledChange}
            trackColor={{ false: Colors.border, true: Colors.primary + '88' }}
            thumbColor={enabled ? Colors.primary : Colors.textMuted}
            accessibilityLabel="Split this court fee with members"
          />
        </View>
      )}

      {enabled && (
        <>
          <Text style={styles.hint}>
            Add up to {MAX_SPLIT_PARTICIPANTS - 1} other members. Your share is charged now; each of
            them gets 2 hours to pay their share before the hold is released and cancelled.
          </Text>

          {atCap ? (
            <Text style={styles.capNotice}>
              Maximum {MAX_SPLIT_PARTICIPANTS} people per split reservation
            </Text>
          ) : (
            <Input
              value={memberSearch}
              onChangeText={setMemberSearch}
              placeholder="Search member name or email"
              accessibilityLabel="Search members to split with"
              autoCapitalize="none"
            />
          )}

          {!atCap &&
            visibleResults.map((member) => (
              <TouchableOpacity
                key={member.userId}
                style={styles.resultRow}
                onPress={() => {
                  onMembersChange([...members, member]);
                  setMemberSearch('');
                  setMemberResults([]);
                }}
                accessibilityRole="button"
                accessibilityLabel={`Add ${member.fullName} to the split`}
              >
                <Text style={styles.resultName}>{member.fullName}</Text>
                {member.email ? <Text style={styles.resultEmail}>{member.email}</Text> : null}
              </TouchableOpacity>
            ))}

          {members.length > 0 && (
            <View style={styles.chipRow}>
              {members.map((member) => (
                <TouchableOpacity
                  key={member.userId}
                  style={styles.chip}
                  onPress={() =>
                    onMembersChange(members.filter((entry) => entry.userId !== member.userId))
                  }
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${member.fullName} from the split`}
                >
                  <Text style={styles.chipText}>{member.fullName}</Text>
                  <Ionicons name="close" size={14} color={Colors.primary} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    backgroundColor: Colors.surface,
    padding: Spacing.md,
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  label: {
    flex: 1,
    fontSize: FontSize.sm,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.text,
  },
  hint: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    lineHeight: 17,
  },
  capNotice: {
    fontSize: FontSize.xs,
    fontFamily: FontFamily.bold,
    fontWeight: '600',
    color: Colors.text,
  },
  resultRow: {
    paddingVertical: Spacing.xs,
  },
  resultName: {
    fontSize: FontSize.sm,
    color: Colors.text,
  },
  resultEmail: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.background,
    borderRadius: BorderRadius.sm,
    paddingVertical: 4,
    paddingHorizontal: Spacing.sm,
  },
  chipText: {
    fontSize: FontSize.xs,
    color: Colors.primary,
  },
});
