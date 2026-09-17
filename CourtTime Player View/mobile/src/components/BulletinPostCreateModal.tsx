/**
 * BulletinPostCreateModal
 * Admin "Create Post" form for the bulletin board. Mirrors the web
 * BulletinPostCreateModal section for section (bulletin mode): post type,
 * title, description, event date/time/duration, participants, court, gender
 * restriction, show participants, paid signup, repeat schedule, auto-expire.
 * Same validation and the same POST body as web.
 */

import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Modal,
  Switch,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { api } from '../api/client';
import { showAlert } from '../utils/alert';
import { hapticError, hapticSuccess } from '../utils/haptics';
import { isStripeConnectReadyFromResponse } from '../../../shared/api/core';
import { EVENT_SIGNUP_TYPES } from '../../../shared/utils/bulletinPostDisplay';
import { parseDollarsToCents } from '../../../shared/utils/money';
import { Input } from './Input';
import { MiniCalendar } from './MiniCalendar';
import { Colors, Spacing, FontSize, BorderRadius, TouchTarget } from '../constants/theme';
import type { Court } from '../types/database';

export type BulletinPostType = 'announcement' | 'event' | 'clinic' | 'tournament' | 'social' | 'drill';

const POST_TYPES: Array<{ value: BulletinPostType; label: string }> = [
  { value: 'announcement', label: 'Announcement' },
  { value: 'event', label: 'Event' },
  { value: 'clinic', label: 'Clinic' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'social', label: 'Social' },
  { value: 'drill', label: 'Drill' },
];

const RECURRING_ELIGIBLE_TYPES = new Set<BulletinPostType>(['drill', 'clinic']);

const GENDER_OPTIONS: Array<{ value: GenderRestriction; label: string }> = [
  { value: 'any', label: 'Any' },
  { value: 'male_only', label: 'Male only' },
  { value: 'female_only', label: 'Female only' },
];

const FREQUENCY_OPTIONS: Array<{ value: RecurrenceFrequency; label: string }> = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
];

const END_TYPE_OPTIONS: Array<{ value: RecurrenceEndType; label: string }> = [
  { value: 'date', label: 'On date' },
  { value: 'occurrences', label: 'After occurrences' },
];

/** Same choices as web's "Auto-expire after" select. */
const EXPIRE_OPTIONS: Array<{ value: string; label: string; signupOnly?: boolean }> = [
  { value: '', label: 'Never' },
  { value: 'after_event', label: 'After the event', signupOnly: true },
  { value: '7', label: '7 days' },
  { value: '14', label: '14 days' },
  { value: '30', label: '30 days' },
  { value: '60', label: '60 days' },
  { value: '90', label: '90 days' },
];

/** Compact time picker: hour chips 6 AM – 10 PM, then quarter-hour chips. */
const EVENT_HOURS: Array<{ value: string; label: string }> = Array.from({ length: 17 }, (_, i) => {
  const h = 6 + i;
  return { value: pad(h), label: `${h % 12 || 12} ${h >= 12 ? 'PM' : 'AM'}` };
});
const EVENT_MINUTES: Array<{ value: string; label: string }> = ['00', '15', '30', '45'].map((m) => ({
  value: m,
  label: `:${m}`,
}));

type GenderRestriction = 'any' | 'male_only' | 'female_only';
type RecurrenceFrequency = 'daily' | 'weekly' | 'biweekly';
type RecurrenceEndType = 'date' | 'occurrences';

interface FormState {
  title: string;
  description: string;
  type: BulletinPostType;
  eventDate: string;
  eventTime: string;
  eventDurationMinutes: string;
  maxParticipants: string;
  minParticipants: string;
  cancelIfMinNotMet: boolean;
  drillCourtId: string;
  drillGenderRestriction: GenderRestriction;
  drillShowParticipants: boolean;
  expiresInDays: string;
  recurrenceEnabled: boolean;
  recurrenceFrequency: RecurrenceFrequency;
  recurrenceEndType: RecurrenceEndType;
  recurrenceEndDate: string;
  recurrenceOccurrences: string;
  requirePayment: boolean;
  signupFeeDollars: string;
}

// Web opens in bulletin mode with type 'drill' preselected; match it.
const EMPTY_FORM: FormState = {
  title: '',
  description: '',
  type: 'drill',
  eventDate: '',
  eventTime: '',
  eventDurationMinutes: '60',
  maxParticipants: '',
  minParticipants: '',
  cancelIfMinNotMet: false,
  drillCourtId: '',
  drillGenderRestriction: 'any',
  drillShowParticipants: false,
  expiresInDays: '',
  recurrenceEnabled: false,
  recurrenceFrequency: 'weekly',
  recurrenceEndType: 'date',
  recurrenceEndDate: '',
  recurrenceOccurrences: '4',
  requirePayment: false,
  signupFeeDollars: '',
};

interface Props {
  visible: boolean;
  facilityId: string | null;
  onClose: () => void;
  /** Called after a post is created so the parent can reload its list. */
  onCreated: () => void;
}

/**
 * Build the POST /api/bulletin-board body from the form (same shape web sends).
 * Exported for tests.
 */
export function buildBulletinPostBody(form: FormState, facilityId: string, authorId: string) {
  const isSignup = EVENT_SIGNUP_TYPES.has(form.type);
  const parsedMax = form.maxParticipants ? parseInt(form.maxParticipants, 10) : undefined;
  const expiresAfterEvent = form.expiresInDays === 'after_event';
  const signupFeeCents = isSignup && form.requirePayment ? parseDollarsToCents(form.signupFeeDollars) : 0;
  const wantsPaidSignup = isSignup && form.requirePayment && signupFeeCents > 0;

  return {
    facilityId,
    authorId,
    title: form.title.trim(),
    content: form.description.trim(),
    category: form.type,
    isAdminPost: true,
    ...(expiresAfterEvent
      ? { expiresAfterEvent: true }
      : form.expiresInDays
        ? { expiresInDays: parseInt(form.expiresInDays, 10) }
        : {}),
    ...(isSignup
      ? {
          drillStartAt: new Date(`${form.eventDate}T${form.eventTime}`).toISOString(),
          drillDurationMinutes: parseInt(form.eventDurationMinutes, 10) || 60,
          drillCourtId: form.drillCourtId,
          ...(typeof parsedMax === 'number' && !Number.isNaN(parsedMax) ? { drillMaxParticipants: parsedMax } : {}),
          drillGenderRestriction: form.drillGenderRestriction,
          drillShowParticipants: form.drillShowParticipants,
          cancelIfMinNotMet: Boolean(form.cancelIfMinNotMet),
        }
      : {}),
    ...(isSignup && form.minParticipants ? { minParticipants: parseInt(form.minParticipants, 10) } : {}),
    ...(wantsPaidSignup
      ? { requirePayment: true, signupAmountCents: signupFeeCents, signupFeeDollars: form.signupFeeDollars }
      : {}),
    ...(form.recurrenceEnabled && RECURRING_ELIGIBLE_TYPES.has(form.type)
      ? {
          recurrence: {
            frequency: form.recurrenceFrequency,
            ...(form.recurrenceEndType === 'date'
              ? { endDate: form.recurrenceEndDate }
              : { occurrenceCount: parseInt(form.recurrenceOccurrences, 10) }),
          },
        }
      : {}),
  };
}

/** Same checks as web's handleCreatePost; returns the message to show, or null when valid. */
export function validateBulletinPostForm(form: FormState): string | null {
  const isSignup = EVENT_SIGNUP_TYPES.has(form.type);
  if (!form.title.trim() || !form.description.trim()) return 'Please fill in all required fields';
  if (isSignup && (!form.eventDate || !form.eventTime || !form.drillCourtId)) {
    return 'This post type requires date/time and court';
  }
  // Signup-only fields are hidden for announcements; ignore stale values from a previous type.
  if (isSignup && form.cancelIfMinNotMet && !form.minParticipants) {
    return 'Set Min Participants when auto-cancel is enabled';
  }
  if (form.recurrenceEnabled && RECURRING_ELIGIBLE_TYPES.has(form.type)) {
    if (form.recurrenceEndType === 'date' && !form.recurrenceEndDate) return 'Set a recurrence end date';
    if (form.recurrenceEndType === 'occurrences' && !form.recurrenceOccurrences) {
      return 'Set number of recurrence occurrences';
    }
  }
  if (isSignup && form.requirePayment) {
    const cents = parseDollarsToCents(form.signupFeeDollars);
    if (!cents || cents <= 0) return 'Enter a signup fee greater than $0';
  }
  return null;
}

export function BulletinPostCreateModal({ visible, facilityId, onClose, onCreated }: Props) {
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [stripeReady, setStripeReady] = useState<boolean | null>(null);
  const [showEventCalendar, setShowEventCalendar] = useState(false);
  const [showEventTime, setShowEventTime] = useState(false);
  const [showEndCalendar, setShowEndCalendar] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const isSignup = EVENT_SIGNUP_TYPES.has(form.type);
  const isRecurringEligible = RECURRING_ELIGIBLE_TYPES.has(form.type);

  // Reset on open, like web.
  useEffect(() => {
    if (!visible) return;
    setForm({ ...EMPTY_FORM });
    setShowEventCalendar(false);
    setShowEventTime(false);
    setShowEndCalendar(false);
  }, [visible]);

  // Courts + Stripe Connect status for the facility.
  useEffect(() => {
    if (!visible || !facilityId) return;
    let cancelled = false;
    setStripeReady(null);
    api.get(`/api/facilities/${facilityId}/courts`).then((res) => {
      if (cancelled) return;
      if (res.success && res.data) {
        const list = Array.isArray(res.data) ? res.data : res.data.courts || [];
        setCourts(list as Court[]);
      }
    });
    api.get(`/api/stripe/connect/status?clubId=${encodeURIComponent(facilityId)}`).then((res) => {
      if (cancelled) return;
      setStripeReady(isStripeConnectReadyFromResponse(res));
    });
    return () => {
      cancelled = true;
    };
  }, [visible, facilityId]);

  async function handleCreate() {
    if (!facilityId || submitting) return;
    const problem = validateBulletinPostForm(form);
    if (problem) {
      hapticError();
      showAlert('Missing information', problem);
      return;
    }
    setSubmitting(true);
    // authorId is overwritten server-side from the session; sent for parity with web.
    const res = await api.post('/api/bulletin-board', buildBulletinPostBody(form, facilityId, ''));
    setSubmitting(false);
    if (res.success) {
      hapticSuccess();
      onCreated();
      onClose();
    } else {
      hapticError();
      showAlert('Error', res.error || 'Could not create post');
    }
  }

  const canSubmit = !submitting && !!form.title.trim() && !!form.description.trim() && !!facilityId;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Cancel">
            <Text style={styles.headerCancel}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Bulletin Post</Text>
          <TouchableOpacity
            onPress={handleCreate}
            disabled={!canSubmit}
            accessibilityRole="button"
            accessibilityLabel="Create post"
            accessibilityState={{ disabled: !canSubmit }}
          >
            <Text style={[styles.headerSave, !canSubmit && styles.headerSaveDisabled]}>
              {submitting ? '...' : 'Create Post'}
            </Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled"
          >
            {/* Post Type */}
            <Text style={styles.label}>Post Type *</Text>
            <ChipRow
              options={POST_TYPES}
              value={form.type}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  type: value,
                  recurrenceEnabled: RECURRING_ELIGIBLE_TYPES.has(value) ? prev.recurrenceEnabled : false,
                }))
              }
            />

            {/* Title */}
            <Text style={styles.label}>Title *</Text>
            <Input
              style={styles.input}
              value={form.title}
              onChangeText={(v) => set('title', v)}
              placeholder="Enter post title"
            />

            {/* Description */}
            <Text style={styles.label}>Description *</Text>
            <Input
              style={[styles.input, styles.textArea]}
              value={form.description}
              onChangeText={(v) => set('description', v)}
              placeholder="Enter post description"
              multiline
            />

            {/* Event-specific fields (every non-announcement type takes signups) */}
            {form.type !== 'announcement' && (
              <>
                <Text style={styles.label}>Event Date{isSignup ? ' *' : ''}</Text>
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => setShowEventCalendar((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel="Event date"
                >
                  <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                  <Text style={[styles.pickerText, !form.eventDate && styles.placeholder]}>
                    {form.eventDate ? formatLongDate(form.eventDate) : 'Select a date'}
                  </Text>
                  <Ionicons name={showEventCalendar ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
                {showEventCalendar && (
                  <MiniCalendar
                    selectedDate={form.eventDate || todayYmd()}
                    onSelectDate={(d) => {
                      set('eventDate', d);
                      setShowEventCalendar(false);
                    }}
                    minDate={todayYmd()}
                  />
                )}

                <Text style={styles.label}>Event Time{isSignup ? ' *' : ''}</Text>
                <TouchableOpacity
                  style={styles.pickerRow}
                  onPress={() => setShowEventTime((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel="Event time"
                >
                  <Ionicons name="time-outline" size={18} color={Colors.primary} />
                  <Text style={[styles.pickerText, !form.eventTime && styles.placeholder]}>
                    {form.eventTime ? formatTime12(form.eventTime) : 'Select a time'}
                  </Text>
                  <Ionicons name={showEventTime ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
                </TouchableOpacity>
                {showEventTime && (
                  <View style={styles.timeBox}>
                    <Text style={styles.timeBoxLabel}>Hour</Text>
                    <ChipRow
                      options={EVENT_HOURS}
                      value={form.eventTime.slice(0, 2)}
                      onChange={(h) => set('eventTime', `${h}:${form.eventTime.slice(3, 5) || '00'}`)}
                    />
                    {form.eventTime ? (
                      <>
                        <Text style={styles.timeBoxLabel}>Minutes</Text>
                        <ChipRow
                          options={EVENT_MINUTES}
                          value={form.eventTime.slice(3, 5)}
                          onChange={(m) => {
                            set('eventTime', `${form.eventTime.slice(0, 2)}:${m}`);
                            setShowEventTime(false);
                          }}
                        />
                      </>
                    ) : null}
                  </View>
                )}

                {isSignup && (
                  <>
                    <Text style={styles.label}>Duration (minutes)</Text>
                    <Input
                      style={styles.input}
                      value={form.eventDurationMinutes}
                      onChangeText={(v) => set('eventDurationMinutes', v.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      placeholder="60"
                    />
                  </>
                )}

                <Text style={styles.label}>Max Participants</Text>
                <Input
                  style={styles.input}
                  value={form.maxParticipants}
                  onChangeText={(v) => set('maxParticipants', v.replace(/[^0-9]/g, ''))}
                  keyboardType="number-pad"
                  placeholder="Leave empty for unlimited"
                />

                {isSignup && (
                  <>
                    <Text style={styles.label}>Min Participants</Text>
                    <Input
                      style={styles.input}
                      value={form.minParticipants}
                      onChangeText={(v) => set('minParticipants', v.replace(/[^0-9]/g, ''))}
                      keyboardType="number-pad"
                      placeholder="Leave empty for no minimum"
                    />
                    <ToggleRow
                      title="Auto-cancel if minimum not met"
                      subtitle="Cancel at event time and email all signed-up participants"
                      value={form.cancelIfMinNotMet}
                      onChange={(v) => set('cancelIfMinNotMet', v)}
                    />

                    <Text style={styles.label}>Court *</Text>
                    {courts.length === 0 ? (
                      <Text style={styles.hint}>Loading courts…</Text>
                    ) : (
                      <ChipRow
                        options={courts.map((c) => ({ value: c.id, label: c.name }))}
                        value={form.drillCourtId}
                        onChange={(v) => set('drillCourtId', v)}
                      />
                    )}

                    <Text style={styles.label}>Gender Restriction</Text>
                    <ChipRow
                      options={GENDER_OPTIONS}
                      value={form.drillGenderRestriction}
                      onChange={(v) => set('drillGenderRestriction', v)}
                    />

                    <ToggleRow
                      title="Show Participants"
                      subtitle="Allow members to see who is signed up"
                      value={form.drillShowParticipants}
                      onChange={(v) => set('drillShowParticipants', v)}
                    />

                    {/* Paid signup */}
                    <View style={styles.groupBox}>
                      <ToggleRow
                        title="Require card payment on signup"
                        subtitle="Members pay with card via Stripe when they register"
                        value={form.requirePayment}
                        onChange={(checked) =>
                          setForm((prev) => ({
                            ...prev,
                            requirePayment: checked,
                            signupFeeDollars: checked ? prev.signupFeeDollars : '',
                          }))
                        }
                        inGroup
                      />
                      {stripeReady === null ? (
                        <Text style={styles.hint}>Checking Stripe Connect status…</Text>
                      ) : stripeReady ? (
                        <Text style={[styles.hint, styles.hintSuccess]}>Stripe Connect is active for this facility.</Text>
                      ) : (
                        <Text style={[styles.hint, styles.hintWarning]}>
                          Stripe Connect is not set up for this facility yet. Complete setup under Member Payments
                          before publishing paid signups.
                        </Text>
                      )}
                      <Text style={styles.label}>Signup fee (USD){form.requirePayment ? ' *' : ''}</Text>
                      <Input
                        style={styles.input}
                        value={form.signupFeeDollars}
                        onChangeText={(v) => set('signupFeeDollars', v.replace(/[^0-9.]/g, ''))}
                        keyboardType="decimal-pad"
                        placeholder="e.g. 25.00"
                      />
                      <Text style={styles.hint}>
                        Turn on “Require card payment” above and enter a fee to charge on signup.
                      </Text>
                    </View>

                    {/* Repeat schedule */}
                    {isRecurringEligible && (
                      <View style={styles.groupBox}>
                        <ToggleRow
                          title="Repeat Schedule"
                          subtitle="Create repeating drill/clinic posts"
                          value={form.recurrenceEnabled}
                          onChange={(v) => set('recurrenceEnabled', v)}
                          inGroup
                        />
                        {form.recurrenceEnabled && (
                          <>
                            <Text style={styles.label}>Frequency</Text>
                            <ChipRow
                              options={FREQUENCY_OPTIONS}
                              value={form.recurrenceFrequency}
                              onChange={(v) => set('recurrenceFrequency', v)}
                            />
                            <Text style={styles.label}>Ends</Text>
                            <ChipRow
                              options={END_TYPE_OPTIONS}
                              value={form.recurrenceEndType}
                              onChange={(v) => set('recurrenceEndType', v)}
                            />
                            {form.recurrenceEndType === 'date' ? (
                              <>
                                <Text style={styles.label}>End Date</Text>
                                <TouchableOpacity
                                  style={styles.pickerRow}
                                  onPress={() => setShowEndCalendar((v) => !v)}
                                  accessibilityRole="button"
                                  accessibilityLabel="Recurrence end date"
                                >
                                  <Ionicons name="calendar-outline" size={18} color={Colors.primary} />
                                  <Text style={[styles.pickerText, !form.recurrenceEndDate && styles.placeholder]}>
                                    {form.recurrenceEndDate ? formatLongDate(form.recurrenceEndDate) : 'Select an end date'}
                                  </Text>
                                  <Ionicons
                                    name={showEndCalendar ? 'chevron-up' : 'chevron-down'}
                                    size={18}
                                    color={Colors.textMuted}
                                  />
                                </TouchableOpacity>
                                {showEndCalendar && (
                                  <MiniCalendar
                                    selectedDate={form.recurrenceEndDate || form.eventDate || todayYmd()}
                                    onSelectDate={(d) => {
                                      set('recurrenceEndDate', d);
                                      setShowEndCalendar(false);
                                    }}
                                    minDate={form.eventDate || todayYmd()}
                                  />
                                )}
                              </>
                            ) : (
                              <>
                                <Text style={styles.label}>Occurrences</Text>
                                <Input
                                  style={styles.input}
                                  value={form.recurrenceOccurrences}
                                  onChangeText={(v) => set('recurrenceOccurrences', v.replace(/[^0-9]/g, ''))}
                                  keyboardType="number-pad"
                                  placeholder="4"
                                />
                              </>
                            )}
                          </>
                        )}
                      </View>
                    )}
                  </>
                )}
              </>
            )}

            {/* Auto-expire */}
            <Text style={styles.label}>Auto-expire after</Text>
            <ChipRow
              options={EXPIRE_OPTIONS.filter((o) => !o.signupOnly || isSignup)}
              value={form.expiresInDays}
              onChange={(v) => set('expiresInDays', v)}
            />

            <View style={{ height: Spacing.xl * 2 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ── Small building blocks ──

function ChipRow<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.chipRow}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <TouchableOpacity
            key={opt.value || 'none'}
            style={[styles.chip, selected && styles.chipSelected]}
            onPress={() => onChange(opt.value)}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={opt.label}
          >
            <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{opt.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
  inGroup = false,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (value: boolean) => void;
  inGroup?: boolean;
}) {
  return (
    <View style={[styles.toggleRow, inGroup && styles.toggleRowInGroup]}>
      <View style={styles.flex}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleSubtitle}>{subtitle}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: Colors.primary, false: Colors.border }}
        accessibilityLabel={title}
      />
    </View>
  );
}

// ── helpers ──

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime12(hhmm: string): string {
  const [hStr, m = '00'] = hhmm.split(':');
  const h = parseInt(hStr, 10);
  return `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatLongDate(ymd: string): string {
  return new Date(`${ymd}T00:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerCancel: { color: Colors.textSecondary, fontSize: FontSize.md },
  headerTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  headerSave: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },
  headerSaveDisabled: { opacity: 0.5 },
  body: { padding: Spacing.md },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  textArea: { height: 100, textAlignVertical: 'top' },
  hint: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs },
  hintSuccess: { color: Colors.success },
  hintWarning: { color: Colors.warning },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: TouchTarget.min,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: Colors.primary + '15', borderColor: Colors.primary },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  chipTextSelected: { color: Colors.primary },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  pickerText: { flex: 1, fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  placeholder: { color: Colors.textMuted, fontWeight: '400' },
  timeBox: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.sm,
    backgroundColor: Colors.card,
  },
  timeBoxLabel: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted, marginBottom: Spacing.xs, marginTop: Spacing.xs },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    backgroundColor: Colors.card,
  },
  toggleRowInGroup: { borderWidth: 0, padding: 0, marginTop: 0, backgroundColor: 'transparent' },
  toggleTitle: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  toggleSubtitle: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  groupBox: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginTop: Spacing.md,
    backgroundColor: Colors.card,
  },
});
