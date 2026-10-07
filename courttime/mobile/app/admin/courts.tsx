/**
 * Admin Courts & Facility: court CRUD, per-court schedule, and maintenance blackouts.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { parseSplitNames, readCourtSplit } from '../../src/utils/courtSplit';
import { formatLocalDate, parseLocalDate } from '../../src/utils/dateUtils';
import {
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  getFacilityCourts,
  createCourt,
  updateCourt,
  deleteCourt,
  getCourtSchedule,
  updateCourtSchedule,
  getFacilityBlackouts,
  createBlackout,
  updateBlackout,
  bulkUpdateCourts,
  type BulkCourtUpdates,
  deleteBlackout,
  getCourtWaiver,
  publishCourtWaiver,
  removeCourtWaiver,
  getCourtWaiverAcceptance,
  bulkAddCourts,
  type AdminCourtRow,
  type CourtScheduleDay,
  type AdminBlackoutRow,
} from '../../src/api/admin';
import { STANDARD_COURT_TYPE_VALUES } from '../../../shared/constants/courtTypes';
import { blackoutCourtIds, blackoutCourtsLabel } from '../../../shared/utils/blackoutSlots';
import { FEATURE_FLAGS } from '../../../shared/constants/featureFlags';
import { useFeatureFlags } from '../../src/contexts/FeatureFlagContext';
import { htmlToDisplayText } from '../../src/utils/htmlToText';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';
import { PLATFORM_BILLING_IN_APP } from '../../src/utils/legalLinks';

export const ErrorBoundary = createRouteErrorBoundary('Admin Courts');

const SURFACE_TYPES = ['Hard', 'Clay', 'Grass', 'Synthetic'];
/** Same blackout types the web offers. */
const BLACKOUT_TYPES = [
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'event', label: 'Event' },
  { value: 'tournament', label: 'Tournament' },
  { value: 'holiday', label: 'Holiday' },
  { value: 'weather', label: 'Weather' },
  { value: 'custom', label: 'Custom' },
];
/** Blackout times are club wall-clock values: read them as written, never shifted by the phone's timezone. */
function splitLocalDatetime(value: string): { date: string; time: string } {
  const d = parseLocalDate(value);
  if (Number.isNaN(d.getTime())) return { date: todayYmd(), time: '12:00' };
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: formatLocalDate(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}
function formatBlackoutWhen(value: string): string {
  const d = parseLocalDate(value);
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
/** Same three statuses the web court form offers. */
const COURT_STATUSES = [
  { value: 'available', label: 'Available' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'closed', label: 'Closed' },
];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function AdminCourtsScreen() {
  const { facilityId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [courts, setCourts] = useState<AdminCourtRow[]>([]);
  const [blackouts, setBlackouts] = useState<AdminBlackoutRow[]>([]);
  const [editingCourt, setEditingCourt] = useState<AdminCourtRow | 'new' | null>(null);
  const [scheduleCourt, setScheduleCourt] = useState<AdminCourtRow | null>(null);
  /** 'new' to add, a row to edit. */
  const [blackoutForm, setBlackoutForm] = useState<AdminBlackoutRow | 'new' | null>(null);
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkEditing, setBulkEditing] = useState(false);

  const loadData = useCallback(async () => {
    if (!facilityId) return;
    const [courtsRes, blackoutsRes] = await Promise.all([
      getFacilityCourts(facilityId),
      getFacilityBlackouts(facilityId),
    ]);
    if (courtsRes.success && courtsRes.data) {
      const list = Array.isArray(courtsRes.data)
        ? courtsRes.data
        : (courtsRes.data as { courts?: AdminCourtRow[] }).courts || [];
      setCourts(list);
    }
    if (blackoutsRes.success && blackoutsRes.data) {
      setBlackouts(blackoutsRes.data.blackouts || []);
    }
  }, [facilityId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardTitle}>Courts ({courts.length})</Text>
          <View style={{ flexDirection: 'row', gap: Spacing.md, alignItems: 'center' }}>
            <TouchableOpacity onPress={() => setBulkEditing(true)} accessibilityRole="button" accessibilityLabel="Edit several courts or set fees for all">
              <Ionicons name="options-outline" size={22} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setBulkAdding(true)} accessibilityRole="button" accessibilityLabel="Bulk add courts">
              <Ionicons name="copy-outline" size={22} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setEditingCourt('new')} accessibilityLabel="Add court">
              <Ionicons name="add-circle" size={26} color={Colors.primary} />
            </TouchableOpacity>
          </View>
        </View>
        {courts.map((c) => (
          <View key={c.id} style={styles.courtRow}>
            <TouchableOpacity style={styles.courtMain} onPress={() => setEditingCourt(c)}>
              <Text style={styles.courtName}>
                #{c.courtNumber} {c.name}
              </Text>
              <Text style={styles.courtMeta}>
                {c.courtType || 'Tennis'} • {c.surfaceType || 'Hard'} • {c.status}
                {c.isIndoor ? ' • Indoor' : ''}
                {c.hasLights ? ' • Lights' : ''}
                {c.isAdminOnly ? ' • Admin only' : ''}
                {c.requirePayment ? (c.billingMode === 'daily' ? ` • $${((c.dailyRateCents ?? 0) / 100).toFixed(2)}/day` : ` • $${((c.bookingAmountCents ?? 0) / 100).toFixed(2)}/hr`) : ''}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setScheduleCourt(c)} style={styles.scheduleBtn}>
              <Ionicons name="time-outline" size={20} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
        ))}
      </Card>

      <Card style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.cardTitle}>Blackouts</Text>
          <TouchableOpacity onPress={() => setBlackoutForm('new')} accessibilityLabel="Add blackout">
            <Ionicons name="add-circle" size={26} color={Colors.primary} />
          </TouchableOpacity>
        </View>
        {blackouts.length === 0 ? (
          <Text style={styles.emptyText}>No upcoming blackouts.</Text>
        ) : (
          blackouts.map((b) => (
            <View key={b.id} style={styles.blackoutRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.courtName}>{b.title}</Text>
                <Text style={styles.courtMeta}>
                  {b.blackout_type || 'maintenance'} • {blackoutCourtsLabel(b)} • {formatBlackoutWhen(b.start_datetime)} –{' '}
                  {formatBlackoutWhen(b.end_datetime)}
                </Text>
                {b.description ? <Text style={styles.blackoutDescription}>{b.description}</Text> : null}
              </View>
              <TouchableOpacity onPress={() => setBlackoutForm(b)} accessibilityRole="button" accessibilityLabel={`Edit ${b.title}`} hitSlop={8}>
                <Ionicons name="create-outline" size={20} color={Colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  showAlert('Delete blackout?', `Remove "${b.title}"?`, [
                    { text: 'Cancel', style: 'cancel' },
                    {
                      text: 'Delete',
                      style: 'destructive',
                      onPress: () => void deleteBlackout(b.id).then(() => loadData()),
                    },
                  ])
                }
              >
                <Ionicons name="trash-outline" size={20} color={Colors.error} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </Card>

      {editingCourt ? (
        <CourtFormModal
          facilityId={facilityId}
          court={editingCourt === 'new' ? null : editingCourt}
          allCourts={courts}
          onClose={() => setEditingCourt(null)}
          onChanged={loadData}
        />
      ) : null}

      {scheduleCourt ? (
        <ScheduleModal court={scheduleCourt} onClose={() => setScheduleCourt(null)} />
      ) : null}

      {bulkEditing ? <BulkEditCourtsModal courts={courts} onClose={() => setBulkEditing(false)} onChanged={loadData} /> : null}

      {bulkAdding ? (
        <BulkAddModal facilityId={facilityId} nextNumber={courts.reduce((m, c) => Math.max(m, Number(c.courtNumber) || 0), 0) + 1} onClose={() => setBulkAdding(false)} onChanged={loadData} />
      ) : null}

      {blackoutForm ? (
        <BlackoutFormModal
          facilityId={facilityId}
          courts={courts}
          blackout={blackoutForm === 'new' ? null : blackoutForm}
          onClose={() => setBlackoutForm(null)}
          onChanged={loadData}
        />
      ) : null}
    </ScrollView>
  );
}

function CourtFormModal({
  facilityId,
  court,
  allCourts,
  onClose,
  onChanged,
}: {
  facilityId: string | null | undefined;
  court: AdminCourtRow | null;
  allCourts: AdminCourtRow[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [name, setName] = useState(court?.name || '');
  const [courtNumber, setCourtNumber] = useState(String(court?.courtNumber || ''));
  const [courtType, setCourtType] = useState(court?.courtType || 'Tennis');
  const [surfaceType, setSurfaceType] = useState(court?.surfaceType || 'Hard');
  const [isIndoor, setIsIndoor] = useState(court?.isIndoor || false);
  const [hasLights, setHasLights] = useState(court?.hasLights || false);
  const [isWalkUp, setIsWalkUp] = useState(court?.isWalkUp || false);
  const { isFeatureEnabled } = useFeatureFlags();
  const adminOnlyEnabled = isFeatureEnabled(FEATURE_FLAGS.ADMIN_ONLY_COURTS);
  const waiversEnabled = isFeatureEnabled(FEATURE_FLAGS.COURT_WAIVERS);
  const [isAdminOnly, setIsAdminOnly] = useState(court?.isAdminOnly || false);
  // Split (web FacilityCourtFormBody). A half of a split court cannot itself be split.
  const isSplitHalf = !!court?.parentCourtId;
  const initialSplit = useMemo(() => readCourtSplit(court, allCourts), [court, allCourts]);
  const [canSplit, setCanSplit] = useState(initialSplit.canSplit);
  const [splitNamesText, setSplitNamesText] = useState(initialSplit.splitNames.join(', '));
  const [splitType, setSplitType] = useState<'Tennis' | 'Pickleball'>(initialSplit.splitType);
  const [status, setStatus] = useState(COURT_STATUSES.some((s) => s.value === court?.status) ? (court?.status as string) : 'available');
  // Fees (web PaidCourtBookingFields): hourly or daily court fee, guest fee, ball machine fee.
  const dollars = (cents?: number | null) => (cents != null && cents > 0 ? (cents / 100).toFixed(2) : '');
  const [requirePayment, setRequirePayment] = useState(court?.requirePayment || false);
  const [billingMode, setBillingMode] = useState<'hourly' | 'daily'>(court?.billingMode === 'daily' ? 'daily' : 'hourly');
  const [bookingFeeDollars, setBookingFeeDollars] = useState(dollars(court?.bookingAmountCents));
  const [dailyRateDollars, setDailyRateDollars] = useState(dollars(court?.dailyRateCents));
  const [guestFeeEnabled, setGuestFeeEnabled] = useState(!!court?.guestFeeCents);
  const [guestFeeDollars, setGuestFeeDollars] = useState(dollars(court?.guestFeeCents));
  const [ballFeeEnabled, setBallFeeEnabled] = useState(!!court?.ballMachineFeeCents);
  const [ballFeeDollars, setBallFeeDollars] = useState(dollars(court?.ballMachineFeeCents));
  const [submitting, setSubmitting] = useState(false);

  // Court waiver (web CourtWaiverSection): current version, acceptance counts, publish/remove.
  const [waiverLoaded, setWaiverLoaded] = useState(false);
  const [waiverEnabled, setWaiverEnabled] = useState(false);
  const [waiverContent, setWaiverContent] = useState('');
  const [waiverVersion, setWaiverVersion] = useState<{ versionNumber?: number; contentHtml?: string } | null>(null);
  const [waiverCounts, setWaiverCounts] = useState<{ accepted?: number; notAccepted?: number } | null>(null);
  const [waiverSaving, setWaiverSaving] = useState(false);
  useEffect(() => {
    if (!court || !waiversEnabled) return;
    void (async () => {
      const [w, a] = await Promise.all([getCourtWaiver(court.id), getCourtWaiverAcceptance(court.id)]);
      const current = (w.data as any)?.data?.currentVersion ?? (w.data as any)?.currentVersion ?? null;
      setWaiverVersion(current);
      setWaiverEnabled(!!current);
      setWaiverContent(current?.contentHtml ? htmlToDisplayText(current.contentHtml) : '');
      const summary = (a.data as any)?.data ?? a.data;
      setWaiverCounts(summary ? { accepted: summary.acceptedCount ?? summary.accepted, notAccepted: summary.notAcceptedCount ?? summary.notAccepted } : null);
      setWaiverLoaded(true);
    })();
  }, [court?.id, waiversEnabled]);

  async function saveWaiver() {
    if (!court) return;
    setWaiverSaving(true);
    const res = waiverEnabled
      ? await publishCourtWaiver(court.id, waiverContent.trim())
      : await removeCourtWaiver(court.id);
    setWaiverSaving(false);
    if (!res.success) {
      showApiErrorAlert(res, 'Could not save waiver');
      return;
    }
    showAlert('Waiver', waiverEnabled ? 'New waiver version published — members must re-accept.' : 'Court waiver removed.');
  }

  async function submit() {
    if (!facilityId || !name.trim()) return;
    if (requirePayment && !(billingMode === 'daily' ? Number(dailyRateDollars) > 0 : Number(bookingFeeDollars) > 0)) {
      showAlert('Court fee', billingMode === 'daily' ? 'Enter a valid daily rate.' : 'Enter a valid hourly booking fee.');
      return;
    }
    const splitNames = parseSplitNames(splitNamesText);
    if (!isSplitHalf && canSplit && splitNames.length === 0) {
      showAlert('Split courts', 'Enter the split court names (for example "3a, 3b"), or turn the split off.');
      return;
    }
    const splitChanged =
      !isSplitHalf &&
      (canSplit !== initialSplit.canSplit ||
        (canSplit && (splitNames.join('|') !== initialSplit.splitNames.join('|') || splitType !== initialSplit.splitType)));
    setSubmitting(true);
    const input = {
      name: name.trim(),
      courtNumber: Number(courtNumber) || 1,
      courtType,
      surfaceType,
      isIndoor,
      hasLights,
      isWalkUp,
      isAdminOnly,
      // Split and status are only sent when the admin changed them. Existing halves are sent
      // back by name, so the server keeps them (and their reservations).
      ...(!splitChanged ? {} : canSplit ? { canSplit: true, splitConfig: { splitNames, splitType } } : { canSplit: false }),
      ...(court && status !== court.status ? { status } : {}),
      requirePayment,
      billingMode,
      bookingFeeDollars: requirePayment && billingMode === 'hourly' ? bookingFeeDollars : '',
      dailyRateDollars: requirePayment && billingMode === 'daily' ? dailyRateDollars : '',
      guestFeeDollars: guestFeeEnabled ? guestFeeDollars : '',
      ballMachineFeeDollars: ballFeeEnabled ? ballFeeDollars : '',
    };
    const res = court ? await updateCourt(court.id, input) : await createCourt(facilityId, input);
    setSubmitting(false);
    if (!res.success) {
      showApiErrorAlert(res, 'Could not save court');
      return;
    }
    if ((res.data as any)?.requiresPayment) {
      showAlert(
        'Payment required',
        PLATFORM_BILLING_IN_APP
          ? 'Adding this court requires a one-time platform fee. Complete this on the web at Admin > Courts.'
          : 'Adding this court requires a one-time platform fee, which cannot be paid in this app.'
      );
      return;
    }
    await onChanged();
    onClose();
  }

  function doDelete() {
    if (!court) return;
    showAlert('Delete court?', `Permanently remove "${court.name}"? This cannot be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          const res = await deleteCourt(court.id);
          if (!res.success) {
            showApiErrorAlert(res, 'Could not delete court');
            return;
          }
          await onChanged();
          onClose();
        },
      },
    ]);
  }

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{court ? 'Edit Court' : 'Add Court'}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Name</Text>
            <Input value={name} onChangeText={setName} placeholder="Court 1" />
            <Text style={styles.label}>Court number</Text>
            <Input value={courtNumber} onChangeText={setCourtNumber} keyboardType="number-pad" placeholder="1" />

            <Text style={styles.label}>Type</Text>
            <View style={styles.chipsWrap}>
              {STANDARD_COURT_TYPE_VALUES.map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.chip, courtType === t && styles.chipSelected]}
                  onPress={() => setCourtType(t)}
                >
                  <Text style={[styles.chipText, courtType === t && styles.chipTextSelected]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Surface</Text>
            <View style={styles.chipsWrap}>
              {SURFACE_TYPES.map((s) => (
                <TouchableOpacity
                  key={s}
                  style={[styles.chip, surfaceType === s && styles.chipSelected]}
                  onPress={() => setSurfaceType(s)}
                >
                  <Text style={[styles.chipText, surfaceType === s && styles.chipTextSelected]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <ToggleRow label="Indoor" value={isIndoor} onChange={setIsIndoor} />
            <ToggleRow label="Has lights" value={hasLights} onChange={setHasLights} />
            <ToggleRow label="Walk-up (no reservation needed)" value={isWalkUp} onChange={setIsWalkUp} />
            {adminOnlyEnabled ? <ToggleRow label="Admin only (only admins/sub-admins can book)" value={isAdminOnly} onChange={setIsAdminOnly} /> : null}
            {!isSplitHalf ? <ToggleRow label="Can be split into multiple courts" value={canSplit} onChange={setCanSplit} /> : null}
            {!isSplitHalf && canSplit ? (
              <>
                <Text style={styles.label}>Split names (comma-separated)</Text>
                <Input value={splitNamesText} onChangeText={setSplitNamesText} placeholder="3a, 3b" autoCapitalize="none" accessibilityLabel="Split court names" />
                <Text style={styles.label}>Split type</Text>
                <View style={styles.chipsWrap}>
                  {(['Tennis', 'Pickleball'] as const).map((t) => (
                    <TouchableOpacity key={t} style={[styles.chip, splitType === t && styles.chipSelected]} onPress={() => setSplitType(t)} accessibilityRole="button" accessibilityState={{ selected: splitType === t }}>
                      <Text style={[styles.chipText, splitType === t && styles.chipTextSelected]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            {court ? (
              <>
                <Text style={styles.label}>Status</Text>
                <View style={styles.chipsWrap}>
                  {COURT_STATUSES.map((s) => (
                    <TouchableOpacity key={s.value} style={[styles.chip, status === s.value && styles.chipSelected]} onPress={() => setStatus(s.value)} accessibilityRole="button" accessibilityState={{ selected: status === s.value }}>
                      <Text style={[styles.chipText, status === s.value && styles.chipTextSelected]}>{s.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </>
            ) : null}

            <Text style={styles.sectionTitle}>Fees</Text>
            <ToggleRow label="Charge a court booking fee" value={requirePayment} onChange={setRequirePayment} />
            {requirePayment ? (
              <>
                <View style={styles.chipsWrap}>
                  {(['hourly', 'daily'] as const).map((m) => (
                    <TouchableOpacity key={m} style={[styles.chip, billingMode === m && styles.chipSelected]} onPress={() => setBillingMode(m)} accessibilityRole="button" accessibilityLabel={m === 'hourly' ? 'Hourly billing' : 'Daily billing'}>
                      <Text style={[styles.chipText, billingMode === m && styles.chipTextSelected]}>{m === 'hourly' ? 'Hourly' : 'Flat day rate'}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                {billingMode === 'hourly' ? (
                  <>
                    <Text style={styles.label}>Booking fee per hour (USD)</Text>
                    <Input value={bookingFeeDollars} onChangeText={(v) => setBookingFeeDollars(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="20.00" />
                  </>
                ) : (
                  <>
                    <Text style={styles.label}>Daily rate (USD)</Text>
                    <Input value={dailyRateDollars} onChangeText={(v) => setDailyRateDollars(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="60.00" />
                  </>
                )}
              </>
            ) : null}
            <ToggleRow label="Guest fee" value={guestFeeEnabled} onChange={setGuestFeeEnabled} />
            {guestFeeEnabled ? (
              <>
                <Text style={styles.label}>Guest fee per guest (USD)</Text>
                <Input value={guestFeeDollars} onChangeText={(v) => setGuestFeeDollars(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="10.00" />
              </>
            ) : null}
            <ToggleRow label="Ball machine fee" value={ballFeeEnabled} onChange={setBallFeeEnabled} />
            {ballFeeEnabled ? (
              <>
                <Text style={styles.label}>Ball machine hourly rate (USD)</Text>
                <Input value={ballFeeDollars} onChangeText={(v) => setBallFeeDollars(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="15.00" />
              </>
            ) : null}

            {court && waiversEnabled ? (
              <>
                <Text style={styles.sectionTitle}>Court waiver</Text>
                {!waiverLoaded ? (
                  <Text style={styles.emptyText}>Loading…</Text>
                ) : (
                  <>
                    <ToggleRow label="Require members to accept a waiver before booking" value={waiverEnabled} onChange={setWaiverEnabled} />
                    {waiverVersion?.versionNumber ? (
                      <Text style={styles.emptyText}>
                        Version {waiverVersion.versionNumber} published
                        {waiverCounts ? ` · ${waiverCounts.accepted ?? 0} accepted, ${waiverCounts.notAccepted ?? 0} not yet` : ''}
                      </Text>
                    ) : null}
                    {waiverEnabled ? (
                      <Input value={waiverContent} onChangeText={setWaiverContent} placeholder="Paste your waiver text…" multiline style={{ minHeight: 120, textAlignVertical: 'top' }} />
                    ) : null}
                    <Button
                      title={waiverEnabled ? 'Publish waiver version' : 'Remove waiver'}
                      variant="secondary"
                      onPress={() => void saveWaiver()}
                      loading={waiverSaving}
                      disabled={waiverSaving || (waiverEnabled && !waiverContent.trim()) || (!waiverEnabled && !waiverVersion)}
                      style={{ marginTop: Spacing.sm }}
                    />
                  </>
                )}
              </>
            ) : null}

            <Button
              title={court ? 'Save Changes' : 'Add Court'}
              onPress={submit}
              loading={submitting}
              disabled={!name.trim() || submitting}
              style={{ marginTop: Spacing.md }}
            />
            {court ? (
              <Button
                title="Delete Court"
                variant="destructive"
                onPress={doDelete}
                style={{ marginTop: Spacing.sm }}
              />
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function BulkAddModal({
  facilityId,
  nextNumber,
  onClose,
  onChanged,
}: {
  facilityId: string | null | undefined;
  nextNumber: number;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [count, setCount] = useState('4');
  const [startingNumber, setStartingNumber] = useState(String(nextNumber));
  const [courtType, setCourtType] = useState('Tennis');
  const [surfaceType, setSurfaceType] = useState('Hard');
  const [isIndoor, setIsIndoor] = useState(false);
  const [hasLights, setHasLights] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!facilityId) return;
    const n = Number(count);
    if (!n || n < 1 || n > 50) {
      showAlert('Bulk add', 'Count must be between 1 and 50.');
      return;
    }
    setSubmitting(true);
    const res = await bulkAddCourts(facilityId, { count: n, startingNumber: Number(startingNumber) || 1, courtType, surfaceType, isIndoor, hasLights });
    setSubmitting(false);
    if (!res.success) {
      showApiErrorAlert(res, 'Failed to create courts');
      return;
    }
    if ((res.data as any)?.requiresPayment) {
      showAlert(
        'Payment required',
        PLATFORM_BILLING_IN_APP
          ? 'Adding these courts requires a one-time platform fee. Complete this on the web at Admin > Courts.'
          : 'Adding these courts requires a one-time platform fee, which cannot be paid in this app.'
      );
      return;
    }
    await onChanged();
    onClose();
  }

  return (
    <Modal visible transparent animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Bulk Add Courts</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.emptyText}>Create multiple courts with shared properties, numbered from the starting number.</Text>
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Number of courts</Text>
                <Input value={count} onChangeText={(v) => setCount(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Starting number</Text>
                <Input value={startingNumber} onChangeText={(v) => setStartingNumber(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" />
              </View>
            </View>
            <Text style={styles.label}>Type</Text>
            <View style={styles.chipsWrap}>
              {STANDARD_COURT_TYPE_VALUES.map((t) => (
                <TouchableOpacity key={t} style={[styles.chip, courtType === t && styles.chipSelected]} onPress={() => setCourtType(t)}>
                  <Text style={[styles.chipText, courtType === t && styles.chipTextSelected]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Surface</Text>
            <View style={styles.chipsWrap}>
              {SURFACE_TYPES.map((s) => (
                <TouchableOpacity key={s} style={[styles.chip, surfaceType === s && styles.chipSelected]} onPress={() => setSurfaceType(s)}>
                  <Text style={[styles.chipText, surfaceType === s && styles.chipTextSelected]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <ToggleRow label="Indoor" value={isIndoor} onChange={setIsIndoor} />
            <ToggleRow label="Has lights" value={hasLights} onChange={setHasLights} />
            <Button title="Create courts" onPress={submit} loading={submitting} style={{ marginTop: Spacing.md }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: Colors.primary }} />
    </View>
  );
}

function ScheduleModal({ court, onClose }: { court: AdminCourtRow; onClose: () => void }) {
  const [schedule, setSchedule] = useState<CourtScheduleDay[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await getCourtSchedule(court.id);
      if (res.success && res.data) setSchedule(res.data.schedule);
    })();
  }, [court.id]);

  function updateDay(dayOfWeek: number, patch: Partial<CourtScheduleDay>) {
    setSchedule((prev) =>
      (prev || []).map((d) => (d.day_of_week === dayOfWeek ? { ...d, ...patch } : d))
    );
  }

  async function save() {
    if (!schedule) return;
    setSaving(true);
    const res = await updateCourtSchedule(court.id, schedule);
    setSaving(false);
    if (!res.success) {
      showApiErrorAlert(res, 'Could not save schedule');
      return;
    }
    onClose();
  }

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{court.name} Schedule</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {!schedule ? (
            <Text style={styles.emptyText}>Loading…</Text>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled">
              {schedule
                .slice()
                .sort((a, b) => a.day_of_week - b.day_of_week)
                .map((d) => (
                  <View key={d.day_of_week} style={styles.dayRow}>
                    <Text style={styles.dayName}>{DAY_NAMES[d.day_of_week]}</Text>
                    <Switch
                      value={d.is_open}
                      onValueChange={(v) => updateDay(d.day_of_week, { is_open: v })}
                      trackColor={{ true: Colors.primary }}
                    />
                    <Input
                      style={styles.dayTimeInput}
                      value={d.open_time}
                      onChangeText={(v) => updateDay(d.day_of_week, { open_time: v })}
                      editable={d.is_open}
                      placeholder="08:00"
                    />
                    <Text style={styles.dayDash}>–</Text>
                    <Input
                      style={styles.dayTimeInput}
                      value={d.close_time}
                      onChangeText={(v) => updateDay(d.day_of_week, { close_time: v })}
                      editable={d.is_open}
                      placeholder="20:00"
                    />
                  </View>
                ))}
              <Button title="Save Schedule" onPress={save} loading={saving} style={{ marginTop: Spacing.md }} />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** Dollars text → positive cents, or null when blank/invalid. */
function feeCents(dollars: string): number | null {
  const n = Math.round(parseFloat(dollars) * 100);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Web's bulk edit and "Set Fees for All Courts": pick courts, then change shared
 * properties (only the ones chosen) or replace their fee settings.
 */
function BulkEditCourtsModal({ courts, onClose, onChanged }: { courts: AdminCourtRow[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [mode, setMode] = useState<'properties' | 'fees'>('properties');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(courts.map((c) => c.id)));
  // Properties: '' means "leave as is".
  const [courtType, setCourtType] = useState('');
  const [surfaceType, setSurfaceType] = useState('');
  const [status, setStatus] = useState('');
  const [indoor, setIndoor] = useState<'' | 'true' | 'false'>('');
  const [lights, setLights] = useState<'' | 'true' | 'false'>('');
  // Fees: applying replaces the fee settings on the selected courts.
  const [requirePayment, setRequirePayment] = useState(false);
  const [bookingFeeDollars, setBookingFeeDollars] = useState('');
  const [guestFeeEnabled, setGuestFeeEnabled] = useState(false);
  const [guestFeeDollars, setGuestFeeDollars] = useState('');
  const [ballFeeEnabled, setBallFeeEnabled] = useState(false);
  const [ballFeeDollars, setBallFeeDollars] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function apply() {
    const courtIds = courts.filter((c) => selected.has(c.id)).map((c) => c.id);
    if (courtIds.length === 0) {
      showAlert('Courts', 'Select at least one court.');
      return;
    }
    let updates: BulkCourtUpdates;
    if (mode === 'properties') {
      updates = {};
      if (courtType) updates.courtType = courtType;
      if (surfaceType) updates.surfaceType = surfaceType;
      if (status) updates.status = status;
      if (indoor) updates.isIndoor = indoor === 'true';
      if (lights) updates.hasLights = lights === 'true';
      if (Object.keys(updates).length === 0) {
        showAlert('Courts', 'Select at least one property to change.');
        return;
      }
    } else {
      const bookingAmountCents = feeCents(bookingFeeDollars);
      const guestFeeCents = feeCents(guestFeeDollars);
      const ballMachineFeeCents = feeCents(ballFeeDollars);
      if (requirePayment && !bookingAmountCents) return showAlert('Fees', 'Enter an hourly rate when paid court booking is enabled.');
      if (guestFeeEnabled && !guestFeeCents) return showAlert('Fees', 'Enter a valid guest fee amount.');
      if (ballFeeEnabled && !ballMachineFeeCents) return showAlert('Fees', 'Enter a valid ball machine hourly rate.');
      updates = {
        requirePayment,
        bookingAmountCents: requirePayment ? bookingAmountCents : null,
        guestFeeCents: guestFeeEnabled ? guestFeeCents : null,
        ballMachineFeeCents: ballFeeEnabled ? ballMachineFeeCents : null,
      };
    }
    setSubmitting(true);
    const res = await bulkUpdateCourts(courtIds, updates);
    setSubmitting(false);
    if (!res.success) {
      showApiErrorAlert(res, mode === 'fees' ? 'Failed to apply fees' : 'Failed to update courts');
      return;
    }
    await onChanged();
    onClose();
  }

  const choice = (label: string, value: string, current: string, set: (v: any) => void) => (
    <TouchableOpacity key={label} style={[styles.chip, current === value && styles.chipSelected]} onPress={() => set(value)} accessibilityRole="button" accessibilityState={{ selected: current === value }}>
      <Text style={[styles.chipText, current === value && styles.chipTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <Modal visible transparent animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>Edit Several Courts</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.chipsWrap}>
              {choice('Properties', 'properties', mode, setMode)}
              {choice('Set fees', 'fees', mode, setMode)}
            </View>

            <Text style={styles.label}>Courts ({selected.size} of {courts.length})</Text>
            <View style={styles.chipsWrap}>
              <TouchableOpacity style={styles.chip} onPress={() => setSelected(selected.size === courts.length ? new Set() : new Set(courts.map((c) => c.id)))} accessibilityRole="button">
                <Text style={styles.chipText}>{selected.size === courts.length ? 'Clear all' : 'Select all'}</Text>
              </TouchableOpacity>
              {courts.map((c) => (
                <TouchableOpacity key={c.id} style={[styles.chip, selected.has(c.id) && styles.chipSelected]} onPress={() => toggle(c.id)} accessibilityRole="checkbox" accessibilityState={{ checked: selected.has(c.id) }}>
                  <Text style={[styles.chipText, selected.has(c.id) && styles.chipTextSelected]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {mode === 'properties' ? (
              <>
                <Text style={styles.emptyText}>Only the properties you pick are changed.</Text>
                <Text style={styles.label}>Court type</Text>
                <View style={styles.chipsWrap}>
                  {choice('No change', '', courtType, setCourtType)}
                  {STANDARD_COURT_TYPE_VALUES.map((t) => choice(t, t, courtType, setCourtType))}
                </View>
                <Text style={styles.label}>Surface</Text>
                <View style={styles.chipsWrap}>
                  {choice('No change', '', surfaceType, setSurfaceType)}
                  {SURFACE_TYPES.map((t) => choice(t, t, surfaceType, setSurfaceType))}
                </View>
                <Text style={styles.label}>Status</Text>
                <View style={styles.chipsWrap}>
                  {choice('No change', '', status, setStatus)}
                  {COURT_STATUSES.map((t) => choice(t.label, t.value, status, setStatus))}
                </View>
                <Text style={styles.label}>Indoor</Text>
                <View style={styles.chipsWrap}>
                  {choice('No change', '', indoor, setIndoor)}
                  {choice('Indoor', 'true', indoor, setIndoor)}
                  {choice('Outdoor', 'false', indoor, setIndoor)}
                </View>
                <Text style={styles.label}>Lights</Text>
                <View style={styles.chipsWrap}>
                  {choice('No change', '', lights, setLights)}
                  {choice('Has lights', 'true', lights, setLights)}
                  {choice('No lights', 'false', lights, setLights)}
                </View>
              </>
            ) : (
              <>
                <Text style={styles.emptyText}>Applying replaces the current fee settings on the selected courts.</Text>
                <ToggleRow label="Charge a court booking fee" value={requirePayment} onChange={setRequirePayment} />
                {requirePayment ? (
                  <>
                    <Text style={styles.label}>Hourly rate ($)</Text>
                    <Input value={bookingFeeDollars} onChangeText={(v) => setBookingFeeDollars(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="20.00" />
                  </>
                ) : null}
                <ToggleRow label="Charge a guest fee" value={guestFeeEnabled} onChange={setGuestFeeEnabled} />
                {guestFeeEnabled ? <Input value={guestFeeDollars} onChangeText={(v) => setGuestFeeDollars(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="10.00" accessibilityLabel="Guest fee in dollars" /> : null}
                <ToggleRow label="Charge a ball machine hourly fee" value={ballFeeEnabled} onChange={setBallFeeEnabled} />
                {ballFeeEnabled ? <Input value={ballFeeDollars} onChangeText={(v) => setBallFeeDollars(v.replace(/[^0-9.]/g, ''))} keyboardType="decimal-pad" placeholder="15.00" accessibilityLabel="Ball machine hourly fee in dollars" /> : null}
              </>
            )}
            <Button title={mode === 'fees' ? 'Apply Fees' : 'Apply Changes'} onPress={() => void apply()} loading={submitting} style={{ marginTop: Spacing.md }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function BlackoutFormModal({
  facilityId,
  courts,
  blackout,
  onClose,
  onChanged,
}: {
  facilityId: string | null | undefined;
  courts: AdminCourtRow[];
  /** The blackout being edited, or null to add one. */
  blackout: AdminBlackoutRow | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const initialStart = blackout ? splitLocalDatetime(blackout.start_datetime) : { date: todayYmd(), time: '12:00' };
  const initialEnd = blackout ? splitLocalDatetime(blackout.end_datetime) : { date: todayYmd(), time: '13:00' };
  /** Empty means every court, including ones added later. */
  const [courtIds, setCourtIds] = useState<string[]>(blackout ? blackoutCourtIds(blackout) : []);
  const toggleCourt = (id: string) =>
    // Kept in court-list order so the saved names read the same way.
    setCourtIds((prev) => courts.map((c) => c.id).filter((cid) => (cid === id ? !prev.includes(id) : prev.includes(cid))));
  const [blackoutType, setBlackoutType] = useState(blackout?.blackout_type || 'maintenance');
  const [title, setTitle] = useState(blackout?.title ?? '');
  const [description, setDescription] = useState(blackout?.description ?? '');
  const [startDate, setStartDate] = useState(initialStart.date);
  const [start, setStart] = useState(initialStart.time);
  const [endDate, setEndDate] = useState(initialEnd.date);
  const [end, setEnd] = useState(initialEnd.time);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!facilityId) return;
    const dateOk = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
    const timeOk = (t: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
    if (!dateOk(startDate) || !dateOk(endDate) || !timeOk(start) || !timeOk(end)) {
      showAlert('Blackout', 'Enter dates as YYYY-MM-DD and times as HH:MM (24-hour).');
      return;
    }
    const startDatetime = `${startDate}T${start}:00`;
    const endDatetime = `${endDate}T${end}:00`;
    if (endDatetime <= startDatetime) {
      showAlert('Blackout', 'The end must be after the start.');
      return;
    }
    const fields = {
      blackoutType,
      title: title.trim() || BLACKOUT_TYPES.find((t) => t.value === blackoutType)?.label || 'Blackout',
      description: description.trim(),
      startDatetime,
      endDatetime,
    };
    setSubmitting(true);
    const res = blackout
      ? await updateBlackout(blackout.id, { ...fields, courtIds })
      : await createBlackout({ ...fields, courtIds, facilityId });
    setSubmitting(false);
    if (!res.success) {
      showApiErrorAlert(res, blackout ? 'Could not update blackout' : 'Could not add blackout');
      return;
    }
    await onChanged();
    onClose();
  }

  return (
    <Modal
      visible
      transparent
      animationType="slide"
      presentationStyle={Platform.OS === 'ios' ? 'overFullScreen' : undefined}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{blackout ? 'Edit Blackout' : 'Add Blackout'}</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Type</Text>
            <View style={styles.chipsWrap}>
              {BLACKOUT_TYPES.map((t) => (
                <TouchableOpacity
                  key={t.value}
                  style={[styles.chip, blackoutType === t.value && styles.chipSelected]}
                  onPress={() => setBlackoutType(t.value)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: blackoutType === t.value }}
                >
                  <Text style={[styles.chipText, blackoutType === t.value && styles.chipTextSelected]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Courts</Text>
            <View style={styles.chipsWrap}>
              <TouchableOpacity
                style={[styles.chip, courtIds.length === 0 && styles.chipSelected]}
                onPress={() => setCourtIds([])}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: courtIds.length === 0 }}
              >
                <Text style={[styles.chipText, courtIds.length === 0 && styles.chipTextSelected]}>All courts</Text>
              </TouchableOpacity>
              {courts.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, courtIds.includes(c.id) && styles.chipSelected]}
                  onPress={() => toggleCourt(c.id)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: courtIds.includes(c.id) }}
                >
                  <Text style={[styles.chipText, courtIds.includes(c.id) && styles.chipTextSelected]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Title</Text>
            <Input value={title} onChangeText={setTitle} placeholder="e.g. Court resurfacing" />
            <Text style={styles.label}>Description (optional)</Text>
            <Input value={description} onChangeText={setDescription} multiline placeholder="Shown to members on the calendar" />
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Start date (YYYY-MM-DD)</Text>
                <Input value={startDate} onChangeText={setStartDate} autoCapitalize="none" accessibilityLabel="Start date" />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>Start time (HH:MM)</Text>
                <Input value={start} onChangeText={setStart} accessibilityLabel="Start time" />
              </View>
            </View>
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>End date (YYYY-MM-DD)</Text>
                <Input value={endDate} onChangeText={setEndDate} autoCapitalize="none" accessibilityLabel="End date" />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>End time (HH:MM)</Text>
                <Input value={end} onChangeText={setEnd} accessibilityLabel="End time" />
              </View>
            </View>
            <Button title={blackout ? 'Save Changes' : 'Save Blackout'} onPress={submit} loading={submitting} style={{ marginTop: Spacing.md }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted },
  courtRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
  },
  courtMain: { flex: 1 },
  courtName: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  courtMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, textTransform: 'capitalize' },
  scheduleBtn: { padding: Spacing.xs },
  blackoutDescription: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 2 },
  blackoutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.borderLight,
    gap: Spacing.sm,
  },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: Colors.card,
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    padding: Spacing.md,
    maxHeight: '88%',
  },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  sheetTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: Spacing.xs },
  row: { flexDirection: 'row', gap: Spacing.sm },
  col: { flex: 1 },
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
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.xs,
  },
  toggleLabel: { fontSize: FontSize.sm, color: Colors.text, flexShrink: 1, marginRight: Spacing.sm },
  sectionTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text, marginTop: Spacing.md, marginBottom: Spacing.xs },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  dayName: { width: 36, fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '700' },
  dayTimeInput: { flex: 1, paddingVertical: 6 },
  dayDash: { color: Colors.textMuted },
});
