/**
 * Admin Facility Settings — web's FacilityManagement > Details tab: name,
 * type, description, primary address, phone/email, timezone, logo, primary
 * and secondary contacts; plus additional locations.
 */

import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAuth } from '../../src/contexts/AuthContext';
import {
  createFacilityLocation,
  deleteFacilityLocation,
  getFacilityDetails,
  listFacilityLocations,
  updateFacilityDetails,
  updateFacilityLocation,
  type AdminFacilityDetails,
  type FacilityContact,
  type FacilityLocationRow,
} from '../../src/api/admin';
import { FACILITY_TYPE_OPTIONS, normalizeFacilityType } from '../../../shared/constants/facilityTypes';
import { US_STATE_CODES } from '../../src/constants/usStates';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showAlert, showApiErrorAlert } from '../../src/utils/alert';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Admin Facility');

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Anchorage', label: 'Alaska' },
  { value: 'Pacific/Honolulu', label: 'Hawaii' },
];

const EMPTY_LOCATION: Omit<FacilityLocationRow, 'id'> = { locationName: '', streetAddress: '', city: '', state: '', zipCode: '', phone: '' };

export default function AdminFacilityScreen() {
  const { facilityId } = useAuth();
  const [refreshing, setRefreshing] = useState(false);
  const [form, setForm] = useState<AdminFacilityDetails | null>(null);
  const [saving, setSaving] = useState(false);
  const [locations, setLocations] = useState<FacilityLocationRow[]>([]);
  const [editingLocation, setEditingLocation] = useState<{ id: string | null; data: Omit<FacilityLocationRow, 'id'> } | null>(null);
  const [savingLocation, setSavingLocation] = useState(false);

  const load = useCallback(async () => {
    if (!facilityId) return;
    const [facRes, locRes] = await Promise.all([getFacilityDetails(facilityId), listFacilityLocations(facilityId)]);
    if (facRes.success && facRes.data) {
      const f = ((facRes.data as any).facility ?? facRes.data) as any;
      setForm({
        id: f.id,
        name: f.name ?? '',
        type: normalizeFacilityType(f.type ?? f.facilityType),
        description: f.description ?? '',
        primaryLocationLabel: f.primaryLocationLabel ?? '',
        streetAddress: f.streetAddress ?? '',
        city: f.city ?? '',
        state: f.state ?? '',
        zipCode: f.zipCode ?? '',
        phone: f.phone ?? '',
        email: f.email ?? '',
        timezone: f.timezone ?? 'America/New_York',
        logoUrl: f.logoUrl ?? '',
        primaryContact: f.primaryContact ?? (f.contactName ? { name: f.contactName } : { name: '', email: '', phone: '' }),
        secondaryContacts: Array.isArray(f.secondaryContacts) ? f.secondaryContacts : [],
      });
    } else {
      showApiErrorAlert(facRes, 'Could not load facility');
    }
    const list = locRes.success ? ((locRes.data as any)?.locations ?? (locRes.data as any)?.data?.locations) : null;
    setLocations(Array.isArray(list) ? list : []);
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const set = <K extends keyof AdminFacilityDetails>(key: K, value: AdminFacilityDetails[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  async function pickLogo() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      showAlert('Permission Required', 'Please allow access to your photo library to choose a logo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6, base64: true });
    if (!result.canceled && result.assets[0]?.base64) {
      const asset = result.assets[0];
      // Stored as a data URL so it persists (web does the same).
      set('logoUrl', `data:${asset.mimeType || 'image/jpeg'};base64,${asset.base64}`);
    }
  }

  async function save() {
    if (!facilityId || !form) return;
    if (!form.name?.trim()) {
      showAlert('Facility', 'Facility name is required.');
      return;
    }
    setSaving(true);
    const res = await updateFacilityDetails(facilityId, {
      name: form.name.trim(),
      type: form.type || undefined,
      description: form.description ?? '',
      primaryLocationLabel: form.primaryLocationLabel ?? '',
      streetAddress: form.streetAddress ?? '',
      city: form.city ?? '',
      state: form.state ?? '',
      zipCode: form.zipCode ?? '',
      phone: form.phone ?? '',
      email: form.email ?? '',
      timezone: form.timezone ?? undefined,
      logoUrl: form.logoUrl || undefined,
      primaryContact: form.primaryContact ?? undefined,
      secondaryContacts: (form.secondaryContacts ?? []).filter((c) => (c.name || c.email || c.phone)),
    });
    setSaving(false);
    if (res.success) {
      showAlert('Saved', 'Facility updated successfully.');
      await load();
    } else {
      showApiErrorAlert(res, 'Could not save facility');
    }
  }

  async function saveLocation() {
    if (!facilityId || !editingLocation) return;
    const d = editingLocation.data;
    if (!d.locationName?.trim() || !d.streetAddress?.trim() || !d.city?.trim() || !d.state?.trim() || !d.zipCode?.trim()) {
      showAlert('Location', 'Location name and full address are required.');
      return;
    }
    setSavingLocation(true);
    const res = editingLocation.id
      ? await updateFacilityLocation(facilityId, editingLocation.id, d)
      : await createFacilityLocation(facilityId, d);
    setSavingLocation(false);
    if (res.success) {
      setEditingLocation(null);
      await load();
    } else {
      showApiErrorAlert(res, 'Could not save location');
    }
  }

  function confirmDeleteLocation(loc: FacilityLocationRow) {
    if (!facilityId) return;
    Alert.alert('Delete location', `Remove "${loc.locationName}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const res = await deleteFacilityLocation(facilityId, loc.id);
            if (res.success) await load();
            else showApiErrorAlert(res, 'Could not delete location');
          })();
        },
      },
    ]);
  }

  const updateContact = (index: number | 'primary', patch: Partial<FacilityContact>) =>
    setForm((prev) => {
      if (!prev) return prev;
      if (index === 'primary') return { ...prev, primaryContact: { ...(prev.primaryContact ?? {}), ...patch } };
      const list = [...(prev.secondaryContacts ?? [])];
      list[index] = { ...list[index], ...patch };
      return { ...prev, secondaryContacts: list };
    });

  if (!form) {
    return (
      <View style={styles.container}>
        <Stack.Screen options={{ title: 'Facility Settings' }} />
        <Text style={[styles.muted, { padding: Spacing.md }]}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ padding: Spacing.md, paddingBottom: Spacing.xl * 2 }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <Stack.Screen options={{ title: 'Facility Settings' }} />

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Facility logo</Text>
        <View style={styles.logoRow}>
          {form.logoUrl ? <Image source={{ uri: form.logoUrl }} style={styles.logo} accessibilityLabel="Facility logo" /> : <View style={[styles.logo, styles.logoEmpty]}><Ionicons name="image-outline" size={28} color={Colors.textMuted} /></View>}
          <View style={{ gap: Spacing.xs }}>
            <Button title={form.logoUrl ? 'Change image' : 'Upload image'} variant="secondary" onPress={() => void pickLogo()} />
            {form.logoUrl ? <Button title="Remove" variant="secondary" onPress={() => set('logoUrl', '')} /> : null}
          </View>
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Facility details</Text>
        <Text style={styles.label}>Facility name</Text>
        <Input value={form.name} onChangeText={(v) => set('name', v)} />
        <Text style={styles.label}>Facility type</Text>
        <View style={styles.chips}>
          {FACILITY_TYPE_OPTIONS.map((o) => (
            <TouchableOpacity key={o.value} style={[styles.chip, form.type === o.value && styles.chipSelected]} onPress={() => set('type', o.value)} accessibilityRole="button" accessibilityState={{ selected: form.type === o.value }} accessibilityLabel={o.label}>
              <Text style={[styles.chipText, form.type === o.value && styles.chipTextSelected]}>{o.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Description</Text>
        <Input value={form.description ?? ''} onChangeText={(v) => set('description', v)} multiline style={styles.multiline} placeholder="Tell members about your facility" />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Primary address</Text>
        <Text style={styles.label}>Address label</Text>
        <Input value={form.primaryLocationLabel ?? ''} onChangeText={(v) => set('primaryLocationLabel', v)} placeholder="Main Campus" />
        <Text style={styles.label}>Street address</Text>
        <Input value={form.streetAddress ?? ''} onChangeText={(v) => set('streetAddress', v)} placeholder="123 Main Street" />
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>City</Text>
            <Input value={form.city ?? ''} onChangeText={(v) => set('city', v)} placeholder="City" />
          </View>
          <View style={styles.colSm}>
            <Text style={styles.label}>ZIP</Text>
            <Input value={form.zipCode ?? ''} onChangeText={(v) => set('zipCode', v)} placeholder="12345" keyboardType="number-pad" />
          </View>
        </View>
        <Text style={styles.label}>State</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.chips}>
            {US_STATE_CODES.map((s) => (
              <TouchableOpacity key={s} style={[styles.chip, form.state === s && styles.chipSelected]} onPress={() => set('state', s)} accessibilityRole="button" accessibilityLabel={s}>
                <Text style={[styles.chipText, form.state === s && styles.chipTextSelected]}>{s}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <Text style={styles.label}>Phone</Text>
        <Input value={form.phone ?? ''} onChangeText={(v) => set('phone', v)} keyboardType="phone-pad" placeholder="(555) 000-0000" />
        <Text style={styles.label}>Email</Text>
        <Input value={form.email ?? ''} onChangeText={(v) => set('email', v)} keyboardType="email-address" autoCapitalize="none" placeholder="info@club.com" />
        <Text style={styles.label}>Timezone</Text>
        <View style={styles.chips}>
          {TIMEZONES.map((t) => (
            <TouchableOpacity key={t.value} style={[styles.chip, form.timezone === t.value && styles.chipSelected]} onPress={() => set('timezone', t.value)} accessibilityRole="button" accessibilityLabel={`${t.label} time`}>
              <Text style={[styles.chipText, form.timezone === t.value && styles.chipTextSelected]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Contacts</Text>
        <Text style={styles.label}>Primary contact</Text>
        <Input value={form.primaryContact?.name ?? ''} onChangeText={(v) => updateContact('primary', { name: v })} placeholder="Full name" />
        <Input value={form.primaryContact?.email ?? ''} onChangeText={(v) => updateContact('primary', { email: v })} placeholder="email@example.com" keyboardType="email-address" autoCapitalize="none" style={{ marginTop: Spacing.xs }} />
        <Input value={form.primaryContact?.phone ?? ''} onChangeText={(v) => updateContact('primary', { phone: v })} placeholder="(555) 555-5555" keyboardType="phone-pad" style={{ marginTop: Spacing.xs }} />
        <View style={[styles.rowBetween, { marginTop: Spacing.md }]}>
          <Text style={styles.label}>Additional contacts</Text>
          <TouchableOpacity onPress={() => setForm((p) => (p ? { ...p, secondaryContacts: [...(p.secondaryContacts ?? []), { name: '', email: '', phone: '' }] } : p))} accessibilityRole="button" accessibilityLabel="Add contact">
            <Text style={styles.link}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {(form.secondaryContacts ?? []).map((c, i) => (
          <View key={i} style={styles.contactBox}>
            <Input value={c.name ?? ''} onChangeText={(v) => updateContact(i, { name: v })} placeholder="Name" />
            <Input value={c.email ?? ''} onChangeText={(v) => updateContact(i, { email: v })} placeholder="Email" keyboardType="email-address" autoCapitalize="none" style={{ marginTop: Spacing.xs }} />
            <Input value={c.phone ?? ''} onChangeText={(v) => updateContact(i, { phone: v })} placeholder="Phone" keyboardType="phone-pad" style={{ marginTop: Spacing.xs }} />
            <TouchableOpacity onPress={() => setForm((p) => (p ? { ...p, secondaryContacts: (p.secondaryContacts ?? []).filter((_, j) => j !== i) } : p))} accessibilityRole="button" accessibilityLabel="Remove contact" style={{ marginTop: Spacing.xs }}>
              <Text style={styles.remove}>Remove</Text>
            </TouchableOpacity>
          </View>
        ))}
        <Button title={saving ? 'Saving…' : 'Save facility'} onPress={() => void save()} loading={saving} disabled={saving} style={{ marginTop: Spacing.md }} />
      </Card>

      <Card style={styles.card}>
        <View style={styles.rowBetween}>
          <Text style={styles.cardTitle}>Additional locations</Text>
          <TouchableOpacity onPress={() => setEditingLocation({ id: null, data: { ...EMPTY_LOCATION } })} accessibilityRole="button" accessibilityLabel="Add location">
            <Ionicons name="add-circle" size={26} color={Colors.primary} />
          </TouchableOpacity>
        </View>
        {locations.length === 0 && !editingLocation ? <Text style={styles.muted}>No additional locations.</Text> : null}
        {locations.map((loc) => (
          <View key={loc.id} style={styles.locRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.locName}>{loc.locationName}</Text>
              <Text style={styles.muted}>{[loc.streetAddress, [loc.city, loc.state].filter(Boolean).join(', '), loc.zipCode].filter(Boolean).join(' · ')}</Text>
              {loc.phone ? <Text style={styles.muted}>{loc.phone}</Text> : null}
            </View>
            <TouchableOpacity onPress={() => setEditingLocation({ id: loc.id, data: { locationName: loc.locationName ?? '', streetAddress: loc.streetAddress ?? '', city: loc.city ?? '', state: loc.state ?? '', zipCode: loc.zipCode ?? '', phone: loc.phone ?? '' } })} accessibilityRole="button" accessibilityLabel={`Edit ${loc.locationName}`} hitSlop={8}>
              <Ionicons name="create-outline" size={20} color={Colors.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => confirmDeleteLocation(loc)} accessibilityRole="button" accessibilityLabel={`Delete ${loc.locationName}`} hitSlop={8}>
              <Ionicons name="trash-outline" size={20} color={Colors.error} />
            </TouchableOpacity>
          </View>
        ))}
        {editingLocation ? (
          <View style={styles.contactBox}>
            <Text style={styles.label}>{editingLocation.id ? 'Edit location' : 'New location'}</Text>
            <Input value={editingLocation.data.locationName ?? ''} onChangeText={(v) => setEditingLocation({ ...editingLocation, data: { ...editingLocation.data, locationName: v } })} placeholder="North Campus" />
            <Input value={editingLocation.data.streetAddress ?? ''} onChangeText={(v) => setEditingLocation({ ...editingLocation, data: { ...editingLocation.data, streetAddress: v } })} placeholder="123 Main St" style={{ marginTop: Spacing.xs }} />
            <View style={[styles.row, { marginTop: Spacing.xs }]}>
              <Input value={editingLocation.data.city ?? ''} onChangeText={(v) => setEditingLocation({ ...editingLocation, data: { ...editingLocation.data, city: v } })} placeholder="City" style={{ flex: 2 }} />
              <Input value={editingLocation.data.state ?? ''} onChangeText={(v) => setEditingLocation({ ...editingLocation, data: { ...editingLocation.data, state: v.toUpperCase().slice(0, 2) } })} placeholder="ST" autoCapitalize="characters" style={{ flex: 1 }} />
              <Input value={editingLocation.data.zipCode ?? ''} onChangeText={(v) => setEditingLocation({ ...editingLocation, data: { ...editingLocation.data, zipCode: v } })} placeholder="12345" keyboardType="number-pad" style={{ flex: 1 }} />
            </View>
            <Input value={editingLocation.data.phone ?? ''} onChangeText={(v) => setEditingLocation({ ...editingLocation, data: { ...editingLocation.data, phone: v } })} placeholder="(555) 000-0000" keyboardType="phone-pad" style={{ marginTop: Spacing.xs }} />
            <View style={[styles.row, { marginTop: Spacing.sm }]}>
              <Button title="Save location" onPress={() => void saveLocation()} loading={savingLocation} style={{ flex: 1 }} />
              <Button title="Cancel" variant="secondary" onPress={() => setEditingLocation(null)} style={{ flex: 1 }} />
            </View>
          </View>
        ) : null}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.xs },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: Spacing.sm },
  muted: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  link: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.primary },
  remove: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.error },
  row: { flexDirection: 'row', gap: Spacing.sm },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  col: { flex: 2 },
  colSm: { flex: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.xs },
  chip: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.full, paddingHorizontal: Spacing.sm, paddingVertical: 6, backgroundColor: Colors.surface },
  chipSelected: { borderColor: Colors.primary, backgroundColor: Colors.primary + '15' },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary, fontWeight: '700' },
  multiline: { minHeight: 80, textAlignVertical: 'top' },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  logo: { width: 84, height: 84, borderRadius: BorderRadius.md, backgroundColor: Colors.surface },
  logoEmpty: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: Colors.border },
  contactBox: { borderWidth: 1, borderColor: Colors.borderLight, borderRadius: BorderRadius.md, padding: Spacing.sm, marginTop: Spacing.sm },
  locRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.borderLight },
  locName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
});
