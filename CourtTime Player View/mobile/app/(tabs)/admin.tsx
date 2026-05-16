import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { Input } from '../../src/components/Input';
import { Button } from '../../src/components/Button';
import { Card } from '../../src/components/Card';
import { AdminRevenueCard } from '../../src/components/AdminRevenueCard';
import { AdminPaymentLockoutCard } from '../../src/components/AdminPaymentLockoutCard';
import { showAlert } from '../../src/utils/alert';
import { parseAdminRevenueResponse, type AdminRevenueData } from '../../src/utils/adminRevenue';
import {
  parseAdminLockoutMembers,
  type AdminLockoutMember,
} from '../../src/utils/adminPaymentLockout';
import { isStripeConnectReadyFromResponse } from '../../../shared/api/core';

export const ErrorBoundary = createRouteErrorBoundary('Admin');

type MemberOption = { userId: string; fullName: string };
type CourtOption = { id: string; name: string };
type AdminBooking = {
  id: string;
  userId: string;
  userName?: string;
  courtId: string;
  courtName?: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: 'confirmed' | 'cancelled' | 'completed' | string;
};

function todayYmd() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatTime(value: string) {
  const [hStr, mStr = '00'] = value.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
}

export default function AdminScreen() {
  const { user, facilityId } = useAuth();
  const isAdmin = user?.adminFacilities?.includes(facilityId || '') || false;
  const [refreshing, setRefreshing] = useState(false);

  const [members, setMembers] = useState<MemberOption[]>([]);
  const [lockoutMembers, setLockoutMembers] = useState<AdminLockoutMember[]>([]);
  const [stripeConnected, setStripeConnected] = useState(true);
  const [courts, setCourts] = useState<CourtOption[]>([]);
  const [todayBookings, setTodayBookings] = useState<AdminBooking[]>([]);

  const [memberId, setMemberId] = useState('');
  const [courtId, setCourtId] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [submittingBooking, setSubmittingBooking] = useState(false);

  const [blackoutCourtId, setBlackoutCourtId] = useState('');
  const [blackoutDate, setBlackoutDate] = useState(todayYmd());
  const [blackoutStart, setBlackoutStart] = useState('12:00');
  const [blackoutEnd, setBlackoutEnd] = useState('13:00');
  const [blackoutTitle, setBlackoutTitle] = useState('Maintenance Block');
  const [submittingBlackout, setSubmittingBlackout] = useState(false);

  const [announcementTitle, setAnnouncementTitle] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [postingAnnouncement, setPostingAnnouncement] = useState(false);

  const [revenueData, setRevenueData] = useState<AdminRevenueData | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [revenueError, setRevenueError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (!facilityId || !isAdmin) return;
    const day = todayYmd();
    setRevenueLoading(true);
    const [membersRes, courtsRes, bookingsRes, revenueRes, stripeRes] = await Promise.all([
      api.get(`/api/members/${facilityId}`),
      api.get(`/api/facilities/${facilityId}/courts`),
      api.get(`/api/admin/bookings/${facilityId}?startDate=${day}&endDate=${day}`),
      api.get(`/api/admin/revenue/${facilityId}?months=1&limit=50`),
      api.get(`/api/stripe/connect/status?clubId=${encodeURIComponent(facilityId)}`),
    ]);

    if (membersRes.success) {
      const raw = Array.isArray((membersRes as any).members)
        ? (membersRes as any).members
        : Array.isArray((membersRes.data as any)?.members)
          ? (membersRes.data as any).members
          : [];
      const parsed = parseAdminLockoutMembers(raw);
      setLockoutMembers(parsed);
      setMembers(parsed.map((m) => ({ userId: m.userId, fullName: m.fullName })));
    }

    setStripeConnected(isStripeConnectReadyFromResponse(stripeRes));

    if (courtsRes.success) {
      const list = Array.isArray(courtsRes.data) ? courtsRes.data : (courtsRes.data as any)?.courts || [];
      setCourts(list.map((c: any) => ({ id: c.id, name: c.name })));
    }

    if (bookingsRes.success) {
      const bookings = Array.isArray((bookingsRes.data as any)?.bookings) ? (bookingsRes.data as any).bookings : [];
      setTodayBookings(bookings);
    }

    if (revenueRes.success) {
      const parsed = parseAdminRevenueResponse(revenueRes.data);
      if (parsed) {
        setRevenueData(parsed);
        setRevenueError(null);
      } else {
        setRevenueError('Could not read revenue data.');
      }
    } else {
      setRevenueError(revenueRes.error || 'Could not load revenue.');
    }
    setRevenueLoading(false);
  }, [facilityId, isAdmin]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const canCreateBooking = useMemo(
    () => Boolean(memberId && courtId && startTime && endTime && facilityId && user),
    [memberId, courtId, startTime, endTime, facilityId, user]
  );

  const createManualBooking = async () => {
    if (!facilityId || !user || !canCreateBooking) return;
    setSubmittingBooking(true);
    const durationMinutes =
      (Number(endTime.split(':')[0]) * 60 + Number(endTime.split(':')[1])) -
      (Number(startTime.split(':')[0]) * 60 + Number(startTime.split(':')[1]));

    const res = await api.post('/api/bookings', {
      courtId,
      userId: memberId,
      facilityId,
      bookingDate: todayYmd(),
      startTime: `${startTime}:00`,
      endTime: `${endTime}:00`,
      durationMinutes,
      bookingType: 'admin_manual',
      notes: `Admin booking by ${user.id}`,
    });
    setSubmittingBooking(false);
    if (res.success) {
      showAlert('Created', 'Booking created successfully.');
      await loadData();
    } else {
      showAlert('Failed', res.error || 'Could not create booking.');
    }
  };

  const patchBookingStatus = async (bookingId: string, status: 'confirmed' | 'cancelled' | 'completed') => {
    const res = await api.patch(`/api/admin/bookings/${bookingId}/status`, { status });
    if (!res.success) {
      showAlert('Update failed', res.error || 'Could not update booking status.');
      return;
    }
    await loadData();
  };

  const markNoShow = async (bookingId: string) => {
    if (!user) return;
    const res = await api.post(`/api/bookings/${bookingId}/no-show`, { markedBy: user.id });
    if (!res.success) {
      showAlert('No-show failed', res.error || 'Could not mark no-show.');
      return;
    }
    await loadData();
  };

  const checkIn = async (bookingId: string) => {
    const res = await api.post(`/api/bookings/${bookingId}/check-in`, {});
    if (!res.success) {
      showAlert('Check-in failed', res.error || 'Could not check in booking.');
      return;
    }
    await loadData();
  };

  const createBlackout = async () => {
    if (!facilityId || !blackoutCourtId) return;
    setSubmittingBlackout(true);
    const res = await api.post('/api/court-config/blackouts', {
      courtId: blackoutCourtId,
      facilityId,
      blackoutType: 'maintenance',
      title: blackoutTitle || 'Maintenance Block',
      startDatetime: `${blackoutDate}T${blackoutStart}:00`,
      endDatetime: `${blackoutDate}T${blackoutEnd}:00`,
    });
    setSubmittingBlackout(false);
    if (res.success) {
      showAlert('Saved', 'Maintenance block added.');
    } else {
      showAlert('Failed', res.error || 'Could not add maintenance block.');
    }
  };

  const postAnnouncement = async () => {
    if (!facilityId || !user || !announcementTitle.trim() || !announcementBody.trim()) return;
    setPostingAnnouncement(true);
    const res = await api.post('/api/bulletin-board', {
      facilityId,
      authorId: user.id,
      title: announcementTitle.trim(),
      content: announcementBody.trim(),
      category: 'announcement',
      isAdminPost: true,
    });
    setPostingAnnouncement(false);
    if (res.success) {
      showAlert('Posted', 'Facility announcement posted.');
      setAnnouncementTitle('');
      setAnnouncementBody('');
    } else {
      showAlert('Failed', res.error || 'Could not post announcement.');
    }
  };

  if (!isAdmin) {
    return (
      <View style={styles.centered}>
        <Ionicons name="shield-outline" size={34} color={Colors.textMuted} />
        <Text style={styles.centeredTitle}>Admin Access Only</Text>
        <Text style={styles.centeredBody}>This tab is visible to facility admins only.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: Spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      <AdminRevenueCard data={revenueData} loading={revenueLoading} error={revenueError} />

      <AdminPaymentLockoutCard
        facilityId={facilityId}
        members={lockoutMembers}
        stripeConnected={stripeConnected}
        onChanged={loadData}
      />

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Manual Booking (On Behalf of Member)</Text>
        <Text style={styles.label}>Member</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
          <View style={styles.chipsWrap}>
            {members.slice(0, 25).map((m) => (
              <TouchableOpacity
                key={m.userId}
                style={[styles.chip, memberId === m.userId && styles.chipSelected]}
                onPress={() => setMemberId(m.userId)}
              >
                <Text style={[styles.chipText, memberId === m.userId && styles.chipTextSelected]}>{m.fullName}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <Text style={styles.label}>Court</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
          <View style={styles.chipsWrap}>
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
        </ScrollView>
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Start (HH:MM)</Text>
            <Input value={startTime} onChangeText={setStartTime} placeholder="09:00" />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>End (HH:MM)</Text>
            <Input value={endTime} onChangeText={setEndTime} placeholder="10:00" />
          </View>
        </View>
        <Button title="Create Booking" onPress={createManualBooking} loading={submittingBooking} disabled={!canCreateBooking} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Today's Bookings Management</Text>
        {todayBookings.length === 0 ? (
          <Text style={styles.emptyText}>No bookings found for today.</Text>
        ) : (
          todayBookings.slice(0, 40).map((b) => (
            <View key={b.id} style={styles.bookingItem}>
              <Text style={styles.bookingTitle}>{b.courtName || 'Court'} • {b.userName || 'Member'}</Text>
              <Text style={styles.bookingMeta}>{formatTime(b.startTime)} - {formatTime(b.endTime)} • {b.status}</Text>
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.actionBtn} onPress={() => patchBookingStatus(b.id, 'cancelled')}>
                  <Text style={styles.actionCancel}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => patchBookingStatus(b.id, 'completed')}>
                  <Text style={styles.actionDone}>Complete</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => checkIn(b.id)}>
                  <Text style={styles.actionDefault}>Check-in</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actionBtn} onPress={() => markNoShow(b.id)}>
                  <Text style={styles.actionWarning}>No-show</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))
        )}
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Quick Maintenance Block</Text>
        <Text style={styles.label}>Court</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
          <View style={styles.chipsWrap}>
            {courts.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={[styles.chip, blackoutCourtId === c.id && styles.chipSelected]}
                onPress={() => setBlackoutCourtId(c.id)}
              >
                <Text style={[styles.chipText, blackoutCourtId === c.id && styles.chipTextSelected]}>{c.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
        <Input value={blackoutDate} onChangeText={setBlackoutDate} />
        <View style={styles.row}>
          <View style={styles.col}>
            <Text style={styles.label}>Start</Text>
            <Input value={blackoutStart} onChangeText={setBlackoutStart} />
          </View>
          <View style={styles.col}>
            <Text style={styles.label}>End</Text>
            <Input value={blackoutEnd} onChangeText={setBlackoutEnd} />
          </View>
        </View>
        <Text style={styles.label}>Title</Text>
        <Input value={blackoutTitle} onChangeText={setBlackoutTitle} />
        <Button title="Save Maintenance Block" onPress={createBlackout} loading={submittingBlackout} disabled={!blackoutCourtId} />
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardTitle}>Facility Announcement</Text>
        <Text style={styles.label}>Title</Text>
        <Input value={announcementTitle} onChangeText={setAnnouncementTitle} placeholder="Important update" />
        <Text style={styles.label}>Message</Text>
        <Input
          value={announcementBody}
          onChangeText={setAnnouncementBody}
          placeholder="Write announcement..."
          multiline
          style={styles.multiline}
        />
        <Button title="Post Announcement" onPress={postAnnouncement} loading={postingAnnouncement} disabled={!announcementTitle.trim() || !announcementBody.trim()} />
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface, padding: Spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg, gap: Spacing.sm },
  centeredTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  centeredBody: { fontSize: FontSize.sm, color: Colors.textSecondary, textAlign: 'center' },
  card: { marginBottom: Spacing.md, padding: Spacing.md },
  cardTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.sm },
  label: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600', marginBottom: 6, marginTop: Spacing.xs },
  chipsRow: { marginBottom: Spacing.xs },
  chipsWrap: { flexDirection: 'row', gap: Spacing.xs },
  chip: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    backgroundColor: Colors.surface,
  },
  chipSelected: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primary + '15',
  },
  chipText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  chipTextSelected: { color: Colors.primary, fontWeight: '700' },
  row: { flexDirection: 'row', gap: Spacing.sm },
  col: { flex: 1 },
  bookingItem: {
    borderWidth: 1,
    borderColor: Colors.borderLight,
    borderRadius: BorderRadius.md,
    padding: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  bookingTitle: { fontSize: FontSize.sm, fontWeight: '700', color: Colors.text },
  bookingMeta: { fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2, marginBottom: 6 },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  actionBtn: { paddingVertical: 2 },
  actionDefault: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '700' },
  actionCancel: { fontSize: FontSize.xs, color: Colors.error, fontWeight: '700' },
  actionDone: { fontSize: FontSize.xs, color: Colors.success, fontWeight: '700' },
  actionWarning: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: '700' },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted },
  multiline: { minHeight: 88, textAlignVertical: 'top' },
});

