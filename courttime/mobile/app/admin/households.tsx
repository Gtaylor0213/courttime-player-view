/**
 * Admin Households — web's HouseholdManagement: member accounts grouped by
 * street address (client-side, from the members list), with search.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { getFacilityMembers } from '../../src/api/admin';
import { filterHouseholds, groupMembersIntoHouseholds, type HouseholdRecord } from '../../src/utils/households';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { EmptyState } from '../../src/components/EmptyState';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { showApiErrorAlert } from '../../src/utils/alert';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';

export const ErrorBoundary = createRouteErrorBoundary('Admin Households');

export default function AdminHouseholdsScreen() {
  const { facilityId } = useAuth();
  const [households, setHouseholds] = useState<HouseholdRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!facilityId) return;
    const res = await getFacilityMembers(facilityId);
    if (res.success && res.data) setHouseholds(groupMembersIntoHouseholds((res.data.members || []) as any[]));
    else showApiErrorAlert(res, 'Failed to load households');
    setLoading(false);
  }, [facilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const filtered = useMemo(() => filterHouseholds(households, search), [households, search]);
  const totalMembers = households.reduce((n, h) => n + h.members.length, 0);
  const grouped = households.filter((h) => !h.isUngrouped).length;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
      <Stack.Screen options={{ title: 'Households' }} />
      <Text style={styles.summary}>{grouped} household{grouped === 1 ? '' : 's'} · {totalMembers} member{totalMembers === 1 ? '' : 's'}</Text>
      <Text style={styles.hint}>Members are grouped by the street address on their profile. Add a street address to include an account in an address-based household.</Text>
      <Input value={search} onChangeText={setSearch} placeholder="Search address, last name, member, or email" accessibilityLabel="Search households" style={{ marginVertical: Spacing.sm }} />
      {!loading && filtered.length === 0 ? (
        <EmptyState icon="home-outline" title={households.length === 0 ? 'No households found' : 'No households match your search'} description={households.length === 0 ? 'No registered members yet.' : 'Try another search.'} />
      ) : null}
      {filtered.map((h) => {
        const open = expanded === h.id;
        return (
          <Card key={h.id} style={styles.card}>
            <TouchableOpacity style={styles.header} onPress={() => setExpanded(open ? null : h.id)} accessibilityRole="button" accessibilityLabel={`${h.address}, ${h.members.length} account${h.members.length === 1 ? '' : 's'}`}>
              <Ionicons name={h.isUngrouped ? 'person-outline' : 'home-outline'} size={18} color={Colors.primary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.address}>{h.address}</Text>
                <Text style={styles.meta}>{h.lastNames.length ? h.lastNames.join(', ') + ' · ' : ''}{h.members.length} account{h.members.length === 1 ? '' : 's'}{h.isUngrouped ? ' · no address on file' : ''}</Text>
              </View>
              <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={Colors.textMuted} />
            </TouchableOpacity>
            {open ? (
              <View style={styles.members}>
                {h.members.map((m) => (
                  <View key={m.userId} style={styles.memberRow}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{(m.firstName[0] || '') + (m.lastName[0] || '')}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.memberName}>{m.fullName || m.email}</Text>
                      <Text style={styles.meta}>{m.email}{m.membershipType ? ` · ${m.membershipType}` : ''}{m.status ? ` · ${m.status}` : ''}{m.isFacilityAdmin ? ' · Admin' : ''}</Text>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.md, paddingBottom: Spacing.xl, gap: Spacing.sm },
  summary: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text },
  hint: { fontSize: FontSize.xs, color: Colors.textSecondary },
  card: { padding: Spacing.md },
  header: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  address: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  meta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 },
  members: { marginTop: Spacing.sm, borderTopWidth: 1, borderTopColor: Colors.borderLight, paddingTop: Spacing.sm, gap: Spacing.sm },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.primary + '20', alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontSize: FontSize.xs, fontWeight: '700', color: Colors.primary },
  memberName: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text },
  _r: { borderRadius: BorderRadius.md },
});
