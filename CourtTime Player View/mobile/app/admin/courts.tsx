/**
 * Admin Courts & Facility: court CRUD, per-court schedule, and maintenance blackouts.
 */
import { useCallback, useEffect, useState } from 'react';
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
  deleteBlackout,
  type AdminCourtRow,
  type CourtScheduleDay,
  type AdminBlackoutRow,
} from '../../src/api/admin';
import { STANDARD_COURT_TYPE_VALUES } from '../../../shared/constants/courtTypes';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';

export const ErrorBoundary = createRouteErrorBoundary('Admin Courts');

const SURFACE_TYPES = ['Hard', 'Clay', 'Grass', 'Synthetic'];
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
  const [addingBlackout, setAddingBlackout] = useState(false);

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
          <TouchableOpacity onPress={() => setEditingCourt('new')} accessibilityLabel="Add court">
            <Ionicons name="add-circle" size={26} color={Colors.primary} />
          </TouchableOpacity>
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
          <Text style={styles.cardTitle}>Maintenance blackouts</Text>
          <TouchableOpacity onPress={() => setAddingBlackout(true)} accessibilityLabel="Add blackout">
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
                  {b.court_name || 'All courts'} • {new Date(b.start_datetime).toLocaleString()} –{' '}
                  {new Date(b.end_datetime).toLocaleString()}
                </Text>
              </View>
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
          onClose={() => setEditingCourt(null)}
          onChanged={loadData}
        />
      ) : null}

      {scheduleCourt ? (
        <ScheduleModal court={scheduleCourt} onClose={() => setScheduleCourt(null)} />
      ) : null}

      {addingBlackout ? (
        <BlackoutFormModal
          facilityId={facilityId}
          courts={courts}
          onClose={() => setAddingBlackout(false)}
          onChanged={loadData}
        />
      ) : null}
    </ScrollView>
  );
}

function CourtFormModal({
  facilityId,
  court,
  onClose,
  onChanged,
}: {
  facilityId: string | null | undefined;
  court: AdminCourtRow | null;
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
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!facilityId || !name.trim()) return;
    setSubmitting(true);
    const input = {
      name: name.trim(),
      courtNumber: Number(courtNumber) || 1,
      courtType,
      surfaceType,
      isIndoor,
      hasLights,
      isWalkUp,
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
        'Adding this court requires a one-time platform fee. Complete this on the web at Admin > Courts.'
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

function BlackoutFormModal({
  facilityId,
  courts,
  onClose,
  onChanged,
}: {
  facilityId: string | null | undefined;
  courts: AdminCourtRow[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [courtId, setCourtId] = useState<string | null>(null);
  const [title, setTitle] = useState('Maintenance Block');
  const [date, setDate] = useState(todayYmd());
  const [start, setStart] = useState('12:00');
  const [end, setEnd] = useState('13:00');
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (!facilityId) return;
    setSubmitting(true);
    const res = await createBlackout({
      courtId,
      facilityId,
      blackoutType: 'maintenance',
      title: title.trim() || 'Maintenance Block',
      startDatetime: `${date}T${start}:00`,
      endDatetime: `${date}T${end}:00`,
    });
    setSubmitting(false);
    if (!res.success) {
      showApiErrorAlert(res, 'Could not add blackout');
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
            <Text style={styles.sheetTitle}>Add Maintenance Block</Text>
            <TouchableOpacity onPress={onClose} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={Colors.textSecondary} />
            </TouchableOpacity>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.label}>Court</Text>
            <View style={styles.chipsWrap}>
              <TouchableOpacity
                style={[styles.chip, courtId === null && styles.chipSelected]}
                onPress={() => setCourtId(null)}
              >
                <Text style={[styles.chipText, courtId === null && styles.chipTextSelected]}>All courts</Text>
              </TouchableOpacity>
              {courts.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.chip, courtId === c.id && styles.chipSelected]}
                  onPress={() => setCourtId(c.id)}
                >
                  <Text style={[styles.chipText, courtId === c.id && styles.chipTextSelected]}>{c.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.label}>Title</Text>
            <Input value={title} onChangeText={setTitle} />
            <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
            <Input value={date} onChangeText={setDate} />
            <View style={styles.row}>
              <View style={styles.col}>
                <Text style={styles.label}>Start</Text>
                <Input value={start} onChangeText={setStart} />
              </View>
              <View style={styles.col}>
                <Text style={styles.label}>End</Text>
                <Input value={end} onChangeText={setEnd} />
              </View>
            </View>
            <Button title="Save Block" onPress={submit} loading={submitting} style={{ marginTop: Spacing.md }} />
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
  toggleLabel: { fontSize: FontSize.sm, color: Colors.text },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.xs },
  dayName: { width: 36, fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '700' },
  dayTimeInput: { flex: 1, paddingVertical: 6 },
  dayDash: { color: Colors.textMuted },
});
