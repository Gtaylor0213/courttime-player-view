/**
 * Admin Booking Rules — web's FacilityRulesTab, section for section: General
 * Rules, Restriction Type, Max Accounts Per Address + User-Based Limits, Split
 * Court Payments, Days in Advance, Max Reservation Duration and Peak Hours
 * Policy. Read-only until "Edit Rules"; "Save Changes" writes the facility's
 * booking rules through the same endpoint the web admin uses.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Keyboard,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { useFeatureFlags } from '../../src/contexts/FeatureFlagContext';
import { FEATURE_FLAGS } from '../../../shared/constants/featureFlags';
import { getFacilityDetails, rulesAdmin, updateFacilityDetails, type FacilityRuleRow } from '../../src/api/admin';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import {
  buildBookingRulesPayload,
  formatTime12,
  hoursInputToMinutes,
  minutesToHoursInput,
  newPeakSlot,
  readBookingRulesForm,
  validateBookingRulesForm,
  type BookingRulesForm,
  type PeakSlotForm,
  type PeakSlotRulesForm,
} from '../../src/utils/bookingRulesForm';

export const ErrorBoundary = createRouteErrorBoundary('Admin Booking Rules');

/** Web's rule switches are emerald-600 when on. */
const SWITCH_ON = '#059669';
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HALF_HOUR_TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
const MAX_ACCOUNTS_DESCRIPTION =
  'Limits how many member accounts can join a facility from the same street address. When off, there is no limit. This rule is separate from the address whitelist.';

function RuleSwitch({ value, onValueChange, disabled, label }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return <Switch value={value} onValueChange={onValueChange} disabled={disabled} trackColor={{ true: SWITCH_ON, false: Colors.border }} accessibilityLabel={label} />;
}

/** Web's BookingRuleToggleInput: a switch beside a number box that empties and locks when the rule is off. */
function ToggleInput({
  checked,
  onCheckedChange,
  value,
  onChange,
  disabled,
  label,
  decimal = false,
  suffix,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  label: string;
  decimal?: boolean;
  suffix?: string;
}) {
  return (
    <View style={styles.toggleInput}>
      <RuleSwitch value={checked} onValueChange={onCheckedChange} disabled={disabled} label={`${label} enabled`} />
      <Input
        value={checked ? value : ''}
        onChangeText={onChange}
        editable={!disabled && checked}
        keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
        style={[styles.numberInput, (!checked || disabled) && styles.inputOff]}
        accessibilityLabel={label}
      />
      {suffix ? <Text style={styles.suffix}>{suffix}</Text> : null}
    </View>
  );
}

/** Hours box over a minutes value. Keeps the typed text so "1." survives until the next digit. */
function HoursInput({ minutes, onChangeMinutes, disabled, label }: { minutes: string; onChangeMinutes: (m: string) => void; disabled: boolean; label: string }) {
  const [text, setText] = useState(minutesToHoursInput(minutes));
  // Resync only when the stored value changes from outside (load, cancel), not while typing.
  useEffect(() => {
    setText((current) => (hoursInputToMinutes(current) === String(Number(minutes) || 0) ? current : minutesToHoursInput(minutes)));
  }, [minutes]);
  return (
    <View style={styles.toggleInput}>
      <Input
        value={text}
        onChangeText={(t) => {
          setText(t);
          onChangeMinutes(hoursInputToMinutes(t));
        }}
        editable={!disabled}
        keyboardType="decimal-pad"
        style={[styles.numberInput, disabled && styles.inputOff]}
        accessibilityLabel={label}
      />
      <Text style={styles.suffix}>hours</Text>
    </View>
  );
}

function InfoBox({ text }: { text: string }) {
  return (
    <View style={styles.info}>
      <Ionicons name="information-circle-outline" size={20} color="#16A34A" />
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

function Section({ icon, title, description, right, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; description?: string; right?: ReactNode; children?: ReactNode }) {
  return (
    <Card style={styles.card}>
      <View style={styles.rowBetween}>
        <View style={styles.titleRow}>
          <Ionicons name={icon} size={20} color={Colors.text} />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        {right}
      </View>
      {description ? <Text style={styles.cardDescription}>{description}</Text> : null}
      {children ? <View style={styles.cardBody}>{children}</View> : null}
    </Card>
  );
}

function Field({ label, caption, small = false, children }: { label: string; caption?: string; small?: boolean; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={small ? styles.labelSmall : styles.label}>{label}</Text>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      {children}
    </View>
  );
}

export default function AdminBookingRulesScreen() {
  const { facilityId } = useAuth();
  const { isFeatureEnabled } = useFeatureFlags();
  const router = useRouter();
  const splitPaymentsFeature = isFeatureEnabled(FEATURE_FLAGS.SPLIT_COURT_PAYMENTS);
  const courtTypeMaxDuration = isFeatureEnabled(FEATURE_FLAGS.COURT_TYPE_MAX_DURATION);
  const generalRulesFeature = isFeatureEnabled(FEATURE_FLAGS.GENERAL_RULES);

  /** bookingRules exactly as saved, carried through on save so nothing the form doesn't show is lost. */
  const [savedRules, setSavedRules] = useState<unknown>(null);
  const [original, setOriginal] = useState<BookingRulesForm | null>(null);
  const [form, setForm] = useState<BookingRulesForm | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitBusy, setSplitBusy] = useState(false);
  const [timePick, setTimePick] = useState<{ slotId: string; field: 'startTime' | 'endTime' } | null>(null);

  const load = useCallback(async () => {
    if (!facilityId) return;
    const [facRes, rulesRes, splitRes] = await Promise.all([
      getFacilityDetails(facilityId),
      rulesAdmin.facilityRules(facilityId),
      splitPaymentsFeature ? rulesAdmin.splitPayments(facilityId) : Promise.resolve(null),
    ]);
    if (!facRes.success || !facRes.data) {
      setLoadFailed(true);
      return;
    }
    const facility = ((facRes.data as any).facility ?? facRes.data) as Record<string, any>;
    const next = readBookingRulesForm(facility);
    // Household max active reservations is enforced from its own rules-engine row; show that when it exists.
    const engineRows: FacilityRuleRow[] = rulesRes.success ? ((rulesRes.data as any)?.rules ?? []) : [];
    const hh002 = Array.isArray(engineRows) ? engineRows.find((r) => r.rule_code === 'HH-002') : undefined;
    if (hh002) {
      next.householdMaxActiveEnabled = !!hh002.is_enabled;
      const limit = hh002.rule_config?.max_active_household;
      if (limit !== undefined && limit !== null) next.householdMaxActive = String(limit);
    }
    setLoadFailed(false);
    setSavedRules(facility.bookingRules ?? null);
    setOriginal(next);
    setForm(next);
    if (splitRes) setSplitEnabled(!!(splitRes.success && (splitRes.data as any)?.enabled));
  }, [facilityId, splitPaymentsFeature]);

  useEffect(() => {
    setIsEditing(false);
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const set = <K extends keyof BookingRulesForm>(key: K, value: BookingRulesForm[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  const updateSlot = (slotId: string, updater: (slot: PeakSlotForm) => PeakSlotForm) =>
    setForm((prev) => (prev ? { ...prev, peakHoursSlots: prev.peakHoursSlots.map((s) => (s.id === slotId ? updater(s) : s)) } : prev));
  const setSlotRule = <K extends keyof PeakSlotRulesForm>(slotId: string, key: K, value: PeakSlotRulesForm[K]) =>
    updateSlot(slotId, (s) => ({ ...s, rules: { ...s.rules, [key]: value } }));

  function cancel() {
    Keyboard.dismiss();
    setForm(original);
    setIsEditing(false);
  }

  async function save() {
    if (!facilityId || !form || !original) return;
    // Drop focus first: otherwise iOS hands it back to the field when the alert
    // closes and the number pad reopens, which reads as if the save did not take.
    Keyboard.dismiss();
    const invalid = validateBookingRulesForm(form);
    if (invalid) {
      showAlert('Check your rules', invalid);
      return;
    }
    setSaving(true);
    const res = await updateFacilityDetails(facilityId, { bookingRules: buildBookingRulesPayload(savedRules, form) } as any);
    if (!res.success) {
      setSaving(false);
      showApiErrorAlert(res, 'Failed to update facility');
      return;
    }
    let engineOk = true;
    if (form.householdMaxActiveEnabled !== original.householdMaxActiveEnabled || form.householdMaxActive !== original.householdMaxActive) {
      const limit = Math.floor(Number(form.householdMaxActive));
      const enabled = form.householdMaxActiveEnabled && Number.isFinite(limit) && limit >= 1;
      const hh = await rulesAdmin.setRule(facilityId, 'HH-002', { isEnabled: enabled, ruleConfig: enabled ? { max_active_household: limit } : undefined });
      engineOk = hh.success;
    }
    await load();
    setSaving(false);
    setIsEditing(false);
    if (engineOk) showAlert('Saved', 'Facility updated successfully');
    else showAlert('Partly saved', 'Facility saved, but the household reservation limit failed to sync. Try saving again.');
  }

  async function toggleSplit(next: boolean) {
    if (!facilityId) return;
    setSplitBusy(true);
    const res = await rulesAdmin.setSplitPayments(facilityId, next);
    setSplitBusy(false);
    if (res.success) setSplitEnabled(next);
    else showApiErrorAlert(res, 'Could not update split payment setting');
  }

  const locked = !isEditing || saving;
  const actions = !isEditing ? (
    <Button title="Edit Rules" onPress={() => setIsEditing(true)} leftIcon={<Ionicons name="create-outline" size={16} color={Colors.textInverse} />} disabled={!form} />
  ) : (
    <View style={styles.actionRow}>
      <Button title="Cancel" variant="secondary" onPress={cancel} disabled={saving} />
      <Button title={saving ? 'Saving...' : 'Save Changes'} onPress={() => void save()} loading={saving} />
    </View>
  );

  const pickedSlot = timePick && form ? form.peakHoursSlots.find((s) => s.id === timePick.slotId) : undefined;
  const pickedValue = pickedSlot && timePick ? pickedSlot[timePick.field] : '';
  const pickerTimes = pickedValue && !HALF_HOUR_TIMES.includes(pickedValue) ? [...HALF_HOUR_TIMES, pickedValue].sort() : HALF_HOUR_TIMES;

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Booking Rules' }} />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} enabled={!isEditing} />}
      >
        <View style={styles.topActions}>{actions}</View>

        {!form ? (
          <Text style={styles.empty}>{loadFailed ? 'Could not load booking rules. Pull down to try again.' : 'Loading booking rules…'}</Text>
        ) : (
          <>
            <Section icon="shield-outline" title="General Rules">
              <InfoBox text="Set general facility policies and member expectations shown to users during booking." />
              {generalRulesFeature ? (
                <Button title="Manage in Club Policies" variant="secondary" onPress={() => router.push('/admin/policies')} style={styles.selfStart} />
              ) : (
                <Field label="General Usage Rules">
                  <Input
                    value={form.generalRules}
                    onChangeText={(t) => set('generalRules', t)}
                    editable={!locked}
                    multiline
                    placeholder="Enter your facility's general booking rules"
                    style={[styles.textarea, locked && styles.inputOff]}
                    accessibilityLabel="General usage rules"
                  />
                </Field>
              )}
            </Section>

            <Section icon="people-outline" title="Restriction Type" description="Controls whether household limits are enforced">
              <InfoBox text="Choose whether booking limits apply per individual account or are shared by household." />
              <Field label="Restriction Type">
                <View style={styles.segment}>
                  {(['account', 'address'] as const).map((type) => {
                    const selected = form.restrictionType === type;
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[styles.segmentOption, selected && styles.segmentSelected, locked && styles.dimmed]}
                        onPress={() => set('restrictionType', type)}
                        disabled={locked}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled: locked }}
                        accessibilityLabel={type === 'account' ? 'Per Account' : 'Per Address'}
                      >
                        <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{type === 'account' ? 'Per Account' : 'Per Address'}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </Field>
            </Section>

            <Section icon="people-outline" title="Max Accounts Per Address">
              <InfoBox text={MAX_ACCOUNTS_DESCRIPTION} />
              <Field label="Max Accounts">
                <ToggleInput
                  checked={form.householdMaxMembersEnabled}
                  onCheckedChange={(v) => set('householdMaxMembersEnabled', v)}
                  value={form.householdMaxMembers}
                  onChange={(v) => set('householdMaxMembers', v)}
                  disabled={locked}
                  label="Max accounts per address"
                />
              </Field>

              <View style={styles.separator} />

              <View>
                <Text style={styles.subheading}>User-Based Limits</Text>
                <Text style={styles.caption}>Configure how many courts can be booked by individuals and households across daily and weekly limits.</Text>
              </View>
              <Field label="Max Active Reservations (Household)" caption="Total upcoming reservations allowed across all accounts at the same address.">
                <ToggleInput
                  checked={form.householdMaxActiveEnabled}
                  onCheckedChange={(v) => set('householdMaxActiveEnabled', v)}
                  value={form.householdMaxActive}
                  onChange={(v) => set('householdMaxActive', v)}
                  disabled={locked}
                  label="Max active reservations per household"
                />
              </Field>
              <View style={styles.grid}>
                <View style={styles.gridCell}>
                  <Field label="Courts Per Week (Individual)">
                    <ToggleInput checked={form.courtsPerWeekUserEnabled} onCheckedChange={(v) => set('courtsPerWeekUserEnabled', v)} value={form.courtsPerWeekUser} onChange={(v) => set('courtsPerWeekUser', v)} disabled={locked} label="Courts per week, individual" />
                  </Field>
                </View>
                <View style={styles.gridCell}>
                  <Field label="Courts Per Day (Individual)">
                    <ToggleInput checked={form.courtsPerDayUserEnabled} onCheckedChange={(v) => set('courtsPerDayUserEnabled', v)} value={form.courtsPerDayUser} onChange={(v) => set('courtsPerDayUser', v)} disabled={locked} label="Courts per day, individual" />
                  </Field>
                </View>
                <View style={styles.gridCell}>
                  <Field label="Courts Per Week (Household)">
                    <ToggleInput checked={form.courtsPerWeekHouseholdEnabled} onCheckedChange={(v) => set('courtsPerWeekHouseholdEnabled', v)} value={form.courtsPerWeekHousehold} onChange={(v) => set('courtsPerWeekHousehold', v)} disabled={locked} label="Courts per week, household" />
                  </Field>
                </View>
                <View style={styles.gridCell}>
                  <Field label="Courts Per Day (Household)">
                    <ToggleInput checked={form.courtsPerDayHouseholdEnabled} onCheckedChange={(v) => set('courtsPerDayHouseholdEnabled', v)} value={form.courtsPerDayHousehold} onChange={(v) => set('courtsPerDayHousehold', v)} disabled={locked} label="Courts per day, household" />
                  </Field>
                </View>
              </View>
            </Section>

            {splitPaymentsFeature ? (
              <Section icon="people-outline" title="Split Court Payments">
                <InfoBox text="Lets members split a paid court's fee (up to 4 people) instead of one person covering it all. Only takes effect on courts that already require payment — set a court's fee under Courts to make this useful there." />
                <View style={styles.rowBetween}>
                  <Text style={[styles.label, styles.flex]}>Allow members to split court fees</Text>
                  <RuleSwitch value={splitEnabled} onValueChange={(v) => void toggleSplit(v)} disabled={splitBusy} label="Allow members to split court fees" />
                </View>
              </Section>
            ) : null}

            <Section icon="calendar-outline" title="Days in Advance">
              <InfoBox text="Define how far in advance members are allowed to reserve a court. Times open hour by hour: with a limit of 7, at 5:00 PM members can book anything that ends by 5:00 PM seven days from now." />
              <Field label="Days in Advance">
                <ToggleInput checked={form.daysInAdvanceEnabled} onCheckedChange={(v) => set('daysInAdvanceEnabled', v)} value={form.daysInAdvance} onChange={(v) => set('daysInAdvance', v)} disabled={locked} label="Days in advance" />
              </Field>
            </Section>

            <Section icon="time-outline" title="Max Reservation Duration">
              <InfoBox text="Control the maximum length of a single reservation." />
              <View style={styles.rowBetween}>
                <Text style={[styles.label, styles.flex]}>Enable Max Reservation Duration</Text>
                <RuleSwitch value={form.maxReservationDurationEnabled} onValueChange={(v) => set('maxReservationDurationEnabled', v)} disabled={locked} label="Enable max reservation duration" />
              </View>
              {form.maxReservationDurationEnabled ? (
                <>
                  {courtTypeMaxDuration ? (
                    <View style={[styles.rowBetween, styles.dividerTop]}>
                      <Text style={[styles.label, styles.flex]}>Different Max Duration for Tennis vs. Pickleball</Text>
                      <RuleSwitch value={form.maxReservationDurationByCourtTypeEnabled} onValueChange={(v) => set('maxReservationDurationByCourtTypeEnabled', v)} disabled={locked} label="Different max duration for tennis and pickleball" />
                    </View>
                  ) : null}
                  {courtTypeMaxDuration && form.maxReservationDurationByCourtTypeEnabled ? (
                    <>
                      <View style={styles.grid}>
                        <View style={styles.gridCell}>
                          <Field label="Tennis">
                            <HoursInput minutes={form.maxReservationDurationTennisMinutes} onChangeMinutes={(m) => set('maxReservationDurationTennisMinutes', m)} disabled={locked} label="Tennis max duration in hours" />
                          </Field>
                        </View>
                        <View style={styles.gridCell}>
                          <Field label="Pickleball">
                            <HoursInput minutes={form.maxReservationDurationPickleballMinutes} onChangeMinutes={(m) => set('maxReservationDurationPickleballMinutes', m)} disabled={locked} label="Pickleball max duration in hours" />
                          </Field>
                        </View>
                      </View>
                      <Text style={styles.caption}>Any other court type still uses the default max reservation duration configured for this facility.</Text>
                    </>
                  ) : (
                    <Field label="Max Reservation Duration">
                      <HoursInput minutes={form.maxReservationDurationMinutes} onChangeMinutes={(m) => set('maxReservationDurationMinutes', m)} disabled={locked} label="Max reservation duration in hours" />
                    </Field>
                  )}
                </>
              ) : null}
            </Section>

            <Section
              icon="calendar-outline"
              title="Peak Hours Policy"
              description="Set different restrictions during peak hours"
              right={<RuleSwitch value={form.hasPeakHours} onValueChange={(v) => set('hasPeakHours', v)} disabled={locked} label="Peak hours policy" />}
            >
              {form.hasPeakHours ? (
                <>
                  <InfoBox text="Configure peak-hour time slots and custom restrictions that apply during those windows." />
                  <View style={styles.rowBetween}>
                    <Text style={styles.subheading}>Peak Hours Slots</Text>
                    {isEditing ? (
                      <Button
                        title="Add Peak Hours Slot"
                        variant="secondary"
                        onPress={() => setForm((prev) => (prev ? { ...prev, peakHoursSlots: [...prev.peakHoursSlots, newPeakSlot()] } : prev))}
                        disabled={saving}
                        leftIcon={<Ionicons name="add" size={16} color={Colors.primary} />}
                      />
                    ) : null}
                  </View>
                  {form.peakHoursSlots.length === 0 ? (
                    <Text style={styles.caption}>No peak hours slots configured.</Text>
                  ) : (
                    form.peakHoursSlots.map((slot) => (
                      <View key={slot.id} style={styles.slot}>
                        <View style={styles.slotTimes}>
                          {(['startTime', 'endTime'] as const).map((field, i) => (
                            <View key={field} style={styles.slotTimeGroup}>
                              {i === 1 ? <Text style={styles.suffix}>to</Text> : null}
                              <TouchableOpacity
                                style={[styles.timeButton, locked && styles.inputOff]}
                                onPress={() => setTimePick({ slotId: slot.id, field })}
                                disabled={locked}
                                accessibilityRole="button"
                                accessibilityLabel={`${field === 'startTime' ? 'Start' : 'End'} time ${formatTime12(slot[field])}`}
                              >
                                <Text style={styles.timeButtonText}>{formatTime12(slot[field])}</Text>
                                <Ionicons name="time-outline" size={14} color={Colors.textMuted} />
                              </TouchableOpacity>
                            </View>
                          ))}
                          {isEditing ? (
                            <TouchableOpacity
                              onPress={() => setForm((prev) => (prev ? { ...prev, peakHoursSlots: prev.peakHoursSlots.filter((s) => s.id !== slot.id) } : prev))}
                              disabled={saving}
                              hitSlop={8}
                              accessibilityRole="button"
                              accessibilityLabel="Remove peak hours slot"
                            >
                              <Ionicons name="trash-outline" size={18} color={Colors.error} />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                        <View style={styles.slotBody}>
                          <Text style={styles.label}>Applies To Days</Text>
                          <View style={styles.days}>
                            {DAY_LABELS.map((label, day) => {
                              const on = slot.days.includes(day);
                              return (
                                <TouchableOpacity
                                  key={label}
                                  style={[styles.day, locked && styles.dimmed]}
                                  onPress={() => updateSlot(slot.id, (s) => ({ ...s, days: on ? s.days.filter((d) => d !== day) : [...s.days, day].sort((a, b) => a - b) }))}
                                  disabled={locked}
                                  accessibilityRole="checkbox"
                                  accessibilityState={{ checked: on, disabled: locked }}
                                  accessibilityLabel={label}
                                >
                                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={18} color={on ? SWITCH_ON : Colors.textMuted} />
                                  <Text style={styles.dayText}>{label}</Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          <Field label="Max Reservation Duration">
                            <ToggleInput checked={!slot.rules.maxDurationUnlimited} onCheckedChange={(v) => setSlotRule(slot.id, 'maxDurationUnlimited', !v)} value={slot.rules.maxDurationHours} onChange={(v) => setSlotRule(slot.id, 'maxDurationHours', v)} disabled={locked} label="Peak max reservation duration in hours" decimal suffix="hours" />
                          </Field>
                          <Text style={styles.label}>User-Based Limits</Text>
                          <View style={styles.grid}>
                            <View style={styles.gridCell}>
                              <Field label="Courts Per Day (Individual)" small>
                                <ToggleInput checked={!slot.rules.maxBookingsPerDayUnlimited} onCheckedChange={(v) => setSlotRule(slot.id, 'maxBookingsPerDayUnlimited', !v)} value={slot.rules.maxBookingsPerDay} onChange={(v) => setSlotRule(slot.id, 'maxBookingsPerDay', v)} disabled={locked} label="Peak courts per day, individual" />
                              </Field>
                            </View>
                            <View style={styles.gridCell}>
                              <Field label="Courts Per Week (Individual)" small>
                                <ToggleInput checked={!slot.rules.maxBookingsPerWeekUnlimited} onCheckedChange={(v) => setSlotRule(slot.id, 'maxBookingsPerWeekUnlimited', !v)} value={slot.rules.maxBookingsPerWeek} onChange={(v) => setSlotRule(slot.id, 'maxBookingsPerWeek', v)} disabled={locked} label="Peak courts per week, individual" />
                              </Field>
                            </View>
                            <View style={styles.gridCell}>
                              <Field label="Courts Per Week (Household)" small>
                                <ToggleInput checked={!slot.rules.maxBookingsPerWeekHouseholdUnlimited} onCheckedChange={(v) => setSlotRule(slot.id, 'maxBookingsPerWeekHouseholdUnlimited', !v)} value={slot.rules.maxBookingsPerWeekHousehold} onChange={(v) => setSlotRule(slot.id, 'maxBookingsPerWeekHousehold', v)} disabled={locked} label="Peak courts per week, household" />
                              </Field>
                            </View>
                            <View style={styles.gridCell}>
                              <Field label="Courts Per Day (Household)" small>
                                <ToggleInput checked={!slot.rules.maxBookingsPerDayHouseholdUnlimited} onCheckedChange={(v) => setSlotRule(slot.id, 'maxBookingsPerDayHouseholdUnlimited', !v)} value={slot.rules.maxBookingsPerDayHousehold} onChange={(v) => setSlotRule(slot.id, 'maxBookingsPerDayHousehold', v)} disabled={locked} label="Peak courts per day, household" />
                              </Field>
                            </View>
                          </View>
                        </View>
                      </View>
                    ))
                  )}
                </>
              ) : null}
            </Section>

            {isEditing ? <View style={styles.bottomActions}>{actions}</View> : null}
          </>
        )}
      </ScrollView>

      <Modal visible={!!timePick && !!pickedSlot} transparent animationType="fade" onRequestClose={() => setTimePick(null)}>
        <Pressable style={styles.overlay} onPress={() => setTimePick(null)}>
          <Pressable style={styles.timeSheet} onPress={() => undefined}>
            <Text style={styles.cardTitle}>{timePick?.field === 'startTime' ? 'Start time' : 'End time'}</Text>
            <ScrollView style={styles.timeList}>
              {pickerTimes.map((time) => {
                const selected = time === pickedValue;
                return (
                  <TouchableOpacity
                    key={time}
                    style={[styles.timeRow, selected && styles.timeRowSelected]}
                    onPress={() => {
                      if (timePick) updateSlot(timePick.slotId, (s) => ({ ...s, [timePick.field]: time }));
                      setTimePick(null);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={formatTime12(time)}
                  >
                    <Text style={[styles.timeRowText, selected && styles.segmentTextSelected]}>{formatTime12(time)}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl * 2, gap: Spacing.md },
  flex: { flex: 1 },
  selfStart: { alignSelf: 'flex-start' },
  topActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  bottomActions: { flexDirection: 'row', justifyContent: 'flex-end' },
  actionRow: { flexDirection: 'row', gap: Spacing.sm },
  empty: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center', paddingVertical: Spacing.xl },
  card: { padding: Spacing.md },
  cardBody: { marginTop: Spacing.md, gap: Spacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, flex: 1 },
  cardTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text, flexShrink: 1 },
  cardDescription: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 4 },
  subheading: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: BorderRadius.md, padding: Spacing.sm },
  infoText: { flex: 1, fontSize: FontSize.sm, color: '#166534' },
  field: { gap: Spacing.xs },
  label: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  labelSmall: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.text },
  caption: { fontSize: FontSize.xs, color: Colors.textMuted },
  toggleInput: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  numberInput: { width: 84, paddingVertical: 8, textAlign: 'left' },
  inputOff: { backgroundColor: Colors.surface, color: Colors.textMuted },
  suffix: { fontSize: FontSize.sm, color: Colors.textMuted },
  textarea: { minHeight: 100, textAlignVertical: 'top' },
  separator: { height: 1, backgroundColor: Colors.borderLight, marginVertical: Spacing.sm },
  dividerTop: { borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: Spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.md, rowGap: Spacing.md },
  gridCell: { flexGrow: 1, flexBasis: '45%', minWidth: 150 },
  segment: { flexDirection: 'row', borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, overflow: 'hidden' },
  segmentOption: { flex: 1, paddingVertical: Spacing.sm, alignItems: 'center', backgroundColor: Colors.card },
  segmentSelected: { backgroundColor: Colors.primary + '15' },
  segmentText: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.textSecondary },
  segmentTextSelected: { color: Colors.primary },
  dimmed: { opacity: 0.6 },
  slot: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, padding: Spacing.sm, gap: Spacing.sm },
  slotTimes: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.sm },
  slotTimeGroup: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  timeButton: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.sm, paddingVertical: 8, backgroundColor: Colors.card },
  timeButtonText: { fontSize: FontSize.sm, color: Colors.text },
  slotBody: { backgroundColor: Colors.surface, borderRadius: BorderRadius.md, padding: Spacing.sm, gap: Spacing.sm },
  days: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.sm, padding: Spacing.sm, backgroundColor: Colors.card },
  day: { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 64 },
  dayText: { fontSize: FontSize.sm, color: Colors.text },
  overlay: { flex: 1, backgroundColor: Colors.overlay, justifyContent: 'center', padding: Spacing.xl },
  timeSheet: { backgroundColor: Colors.card, borderRadius: BorderRadius.lg, padding: Spacing.md, maxHeight: '70%' },
  timeList: { marginTop: Spacing.sm },
  timeRow: { paddingVertical: Spacing.sm, paddingHorizontal: Spacing.sm, borderRadius: BorderRadius.sm },
  timeRowSelected: { backgroundColor: Colors.primary + '15' },
  timeRowText: { fontSize: FontSize.md, color: Colors.text },
});
