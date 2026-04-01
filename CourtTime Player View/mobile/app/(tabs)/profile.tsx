/**
 * Profile Tab
 * View and edit player profile, preferences, and logout
 */

import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Image,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { showAlert } from '../../src/utils/alert';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import type { PlayerProfile } from '../../src/types/database';

const SKILL_LEVELS = ['Beginner', 'Intermediate', 'Advanced', 'Professional'];
const USTA_RATINGS = ['1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0', '5.5', '6.0', '6.5', '7.0'];

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
];

export default function ProfileScreen() {
  const { user, logout, updateUser, facilities } = useAuth();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [bookingCount, setBookingCount] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edit form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [skillLevel, setSkillLevel] = useState('');
  const [ustaRating, setUstaRating] = useState('');
  const [bio, setBio] = useState('');
  const [profileImageUrl, setProfileImageUrl] = useState('');

  // Facility membership state
  const [showFindFacility, setShowFindFacility] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [requestingJoin, setRequestingJoin] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!user) return;

    const [profileRes, bookingsRes] = await Promise.all([
      api.get(`/api/player-profile/${user.id}`),
      api.get(`/api/bookings/user/${user.id}`),
    ]);

    if (profileRes.success && profileRes.data) {
      const p = profileRes.data.profile || profileRes.data;
      setProfile(p);
    }
    if (bookingsRes.success && bookingsRes.data) {
      const bookings = Array.isArray(bookingsRes.data) ? bookingsRes.data : bookingsRes.data.bookings || [];
      setBookingCount(bookings.length);
    }
  }, [user]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  // Populate edit form when entering edit mode
  const enterEditMode = () => {
    setFirstName(user?.firstName || '');
    setLastName(user?.lastName || '');
    setPhone(user?.phone || '');
    setStreetAddress(user?.streetAddress || '');
    setCity(user?.city || '');
    setState(user?.state || '');
    setZipCode(user?.zipCode || '');
    setSkillLevel(profile?.skillLevel || '');
    setUstaRating(profile?.ustaRating || '');
    setBio(profile?.bio || '');
    setProfileImageUrl(profile?.profileImageUrl || '');
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
  };

  const handleSave = async () => {
    if (!user) return;

    setSaving(true);
    try {
      const updates: Record<string, any> = {};
      if (firstName !== (user.firstName || '')) updates.firstName = firstName;
      if (lastName !== (user.lastName || '')) updates.lastName = lastName;
      if (phone !== (user.phone || '')) updates.phone = phone;
      if (streetAddress !== (user.streetAddress || '')) updates.streetAddress = streetAddress;
      if (city !== (user.city || '')) updates.city = city;
      if (state !== (user.state || '')) updates.state = state;
      if (zipCode !== (user.zipCode || '')) updates.zipCode = zipCode;
      if (skillLevel !== (profile?.skillLevel || '')) updates.skillLevel = skillLevel;
      if (ustaRating !== (profile?.ustaRating || '')) updates.ustaRating = ustaRating;
      if (bio !== (profile?.bio || '')) updates.bio = bio;
      if (profileImageUrl !== (profile?.profileImageUrl || '')) updates.profileImageUrl = profileImageUrl;

      if (Object.keys(updates).length === 0) {
        setEditing(false);
        return;
      }

      const result = await api.patch(`/api/player-profile/${user.id}`, updates);

      if (result.success) {
        // Update local auth state
        if (updateUser) {
          updateUser({
            firstName: firstName || user.firstName,
            lastName: lastName || user.lastName,
            fullName: `${firstName || user.firstName} ${lastName || user.lastName}`.trim(),
            phone: phone || user.phone,
            streetAddress: streetAddress || user.streetAddress,
            city: city || user.city,
            state: state || user.state,
            zipCode: zipCode || user.zipCode,
          });
        }
        await fetchProfile();
        setEditing(false);
        showAlert('Success', 'Profile updated successfully');
      } else {
        showAlert('Error', result.error || 'Failed to update profile');
      }
    } catch (error) {
      showAlert('Error', 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      showAlert('Permission Required', 'Please allow access to your photo library to upload a profile picture.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.5,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        const mimeType = asset.mimeType || 'image/jpeg';
        const dataUri = `data:${mimeType};base64,${asset.base64}`;
        setProfileImageUrl(dataUri);
      }
    }
  };

  const handleSearchFacilities = async (query: string) => {
    setSearchQuery(query);
    if (query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const result = await api.get(`/api/facilities/search?q=${encodeURIComponent(query.trim())}`);
    if (result.success && result.data) {
      const list = result.data.facilities || result.data || [];
      // Filter out facilities user is already a member of
      const memberIds = new Set(user?.memberFacilities || []);
      setSearchResults(Array.isArray(list) ? list.filter((f: any) => !memberIds.has(f.id)) : []);
    }
    setSearching(false);
  };

  const handleRequestJoin = async (facilityId: string) => {
    if (!user) return;
    setRequestingJoin(facilityId);
    const result = await api.post(`/api/player-profile/${user.id}/request-membership`, { facilityId });
    setRequestingJoin(null);
    if (result.success) {
      showAlert('Request Sent', 'Your membership request has been sent to the facility admin.');
      setShowFindFacility(false);
      setSearchQuery('');
      setSearchResults([]);
    } else {
      showAlert('Error', result.error || 'Failed to send membership request');
    }
  };

  const handleLeaveFacility = (facilityId: string, facilityName: string) => {
    if (!user) return;
    showAlert('Leave Facility', `Are you sure you want to leave ${facilityName}? You will need to request membership again to rejoin.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          const result = await api.delete(`/api/members/${facilityId}/${user.id}`);
          if (result.success) {
            showAlert('Left Facility', `You have left ${facilityName}.`);
            // Refresh to update facility list
            await fetchProfile();
          } else {
            showAlert('Error', result.error || 'Failed to leave facility');
          }
        },
      },
    ]);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchProfile();
    setRefreshing(false);
  }, [fetchProfile]);

  function handleLogout() {
    showAlert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: logout },
    ]);
  }

  const getInitials = () => {
    if (!user) return '?';
    return `${user.firstName?.[0] || ''}${user.lastName?.[0] || ''}`.toUpperCase();
  };

  const avatarSource = editing ? profileImageUrl : profile?.profileImageUrl;

  // ── Edit Mode ──

  if (editing) {
    return (
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
          {/* Header */}
          <View style={styles.editHeader}>
            <TouchableOpacity onPress={cancelEdit} disabled={saving}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.editTitle}>Edit Profile</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color={Colors.primary} />
              ) : (
                <Text style={styles.saveText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Avatar */}
          <View style={styles.editAvatarSection}>
            <TouchableOpacity onPress={handlePickImage} style={styles.avatarLarge}>
              {avatarSource ? (
                <Image source={{ uri: avatarSource }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{getInitials()}</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity onPress={handlePickImage}>
              <Text style={styles.changePhotoText}>Change Photo</Text>
            </TouchableOpacity>
          </View>

          {/* Form Fields */}
          <View style={styles.formSection}>
            <Text style={styles.formSectionTitle}>Personal Info</Text>

            <View style={styles.formRow}>
              <View style={styles.formFieldHalf}>
                <Text style={styles.formLabel}>First Name</Text>
                <TextInput
                  style={styles.formInput}
                  value={firstName}
                  onChangeText={setFirstName}
                  placeholder="First name"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <View style={styles.formFieldHalf}>
                <Text style={styles.formLabel}>Last Name</Text>
                <TextInput
                  style={styles.formInput}
                  value={lastName}
                  onChangeText={setLastName}
                  placeholder="Last name"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Phone</Text>
              <TextInput
                style={styles.formInput}
                value={phone}
                onChangeText={setPhone}
                placeholder="Phone number"
                placeholderTextColor={Colors.textMuted}
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Street Address</Text>
              <TextInput
                style={styles.formInput}
                value={streetAddress}
                onChangeText={setStreetAddress}
                placeholder="Street address"
                placeholderTextColor={Colors.textMuted}
              />
            </View>

            <View style={styles.formRow}>
              <View style={{ flex: 2, marginRight: Spacing.sm }}>
                <Text style={styles.formLabel}>City</Text>
                <TextInput
                  style={styles.formInput}
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                  placeholderTextColor={Colors.textMuted}
                />
              </View>
              <View style={{ flex: 1, marginRight: Spacing.sm }}>
                <Text style={styles.formLabel}>State</Text>
                <TouchableOpacity
                  style={styles.formInput}
                  onPress={() => {
                    showAlert('Select State', undefined, US_STATES.map(s => ({
                      text: s,
                      onPress: () => setState(s),
                    })));
                  }}
                >
                  <Text style={state ? styles.formInputText : styles.formPlaceholder}>
                    {state || 'State'}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>ZIP</Text>
                <TextInput
                  style={styles.formInput}
                  value={zipCode}
                  onChangeText={setZipCode}
                  placeholder="ZIP"
                  placeholderTextColor={Colors.textMuted}
                  keyboardType="number-pad"
                  maxLength={5}
                />
              </View>
            </View>
          </View>

          <View style={styles.formSection}>
            <Text style={styles.formSectionTitle}>Tennis Info</Text>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Skill Level</Text>
              <View style={styles.chipRow}>
                {SKILL_LEVELS.map(level => (
                  <TouchableOpacity
                    key={level}
                    style={[styles.chip, skillLevel === level && styles.chipSelected]}
                    onPress={() => setSkillLevel(skillLevel === level ? '' : level)}
                  >
                    <Text style={[styles.chipText, skillLevel === level && styles.chipTextSelected]}>
                      {level}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>USTA/NTRP Rating</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.chipRow}>
                  {USTA_RATINGS.map(rating => (
                    <TouchableOpacity
                      key={rating}
                      style={[styles.chip, ustaRating === rating && styles.chipSelected]}
                      onPress={() => setUstaRating(ustaRating === rating ? '' : rating)}
                    >
                      <Text style={[styles.chipText, ustaRating === rating && styles.chipTextSelected]}>
                        {rating}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={styles.formField}>
              <Text style={styles.formLabel}>Bio</Text>
              <TextInput
                style={[styles.formInput, styles.formTextArea]}
                value={bio}
                onChangeText={setBio}
                placeholder="Tell others about yourself..."
                placeholderTextColor={Colors.textMuted}
                multiline
                maxLength={500}
                textAlignVertical="top"
              />
              <Text style={styles.charCount}>{bio.length}/500</Text>
            </View>
          </View>

          <View style={{ height: Spacing.xxl }} />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  // ── View Mode ──

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
    >
      {/* Profile Header */}
      <View style={styles.header}>
        <View style={styles.avatarLarge}>
          {profile?.profileImageUrl ? (
            <Image source={{ uri: profile.profileImageUrl }} style={styles.avatarImage} />
          ) : (
            <Text style={styles.avatarText}>{getInitials()}</Text>
          )}
        </View>
        <Text style={styles.name}>{user?.fullName || `${user?.firstName} ${user?.lastName}`}</Text>
        <Text style={styles.email}>{user?.email}</Text>
        {profile?.skillLevel && (
          <View style={styles.skillBadge}>
            <Text style={styles.skillText}>{profile.skillLevel}</Text>
          </View>
        )}
        <TouchableOpacity style={styles.editButton} onPress={enterEditMode}>
          <Text style={styles.editButtonText}>Edit Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{bookingCount}</Text>
          <Text style={styles.statLabel}>Bookings</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{profile?.ustaRating || '-'}</Text>
          <Text style={styles.statLabel}>USTA Rating</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{profile?.skillLevel?.[0] || '-'}</Text>
          <Text style={styles.statLabel}>Level</Text>
        </View>
      </View>

      {/* Bio */}
      {profile?.bio && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.bioText}>{profile.bio}</Text>
        </View>
      )}

      {/* Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Details</Text>
        <View style={styles.detailCard}>
          {user?.phone && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Phone</Text>
              <Text style={styles.detailValue}>{user.phone}</Text>
            </View>
          )}
          {(user?.streetAddress || user?.city) && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Address</Text>
              <Text style={styles.detailValue}>
                {[user.streetAddress, user.city, user.state, user.zipCode].filter(Boolean).join(', ')}
              </Text>
            </View>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Member since</Text>
            <Text style={styles.detailValue}>
              {user?.createdAt
                ? new Date(user.createdAt).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                  })
                : '-'}
            </Text>
          </View>
        </View>
      </View>

      {/* My Facilities */}
      <View style={styles.section}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm }}>
          <Text style={styles.sectionTitle}>My Facilities</Text>
          <TouchableOpacity onPress={() => setShowFindFacility(true)}>
            <Text style={{ color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' }}>+ Find Facility</Text>
          </TouchableOpacity>
        </View>
        {facilities.length === 0 ? (
          <View style={styles.detailCard}>
            <View style={{ padding: Spacing.lg, alignItems: 'center' }}>
              <Text style={{ color: Colors.textMuted, fontSize: FontSize.sm }}>You're not a member of any facility yet.</Text>
              <TouchableOpacity onPress={() => setShowFindFacility(true)} style={{ marginTop: Spacing.sm }}>
                <Text style={{ color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' }}>Find a facility to join</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.detailCard}>
            {facilities.map((fac, idx) => (
              <View key={fac.id} style={[styles.detailRow, idx === facilities.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: FontSize.sm, fontWeight: '600', color: Colors.text }}>{fac.name}</Text>
                </View>
                <TouchableOpacity onPress={() => handleLeaveFacility(fac.id, fac.name)}>
                  <Text style={{ color: Colors.error, fontSize: FontSize.xs, fontWeight: '600' }}>Leave</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Find Facility Modal */}
      <Modal visible={showFindFacility} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowFindFacility(false)}>
        <View style={{ flex: 1, backgroundColor: Colors.surface }}>
          <View style={styles.editHeader}>
            <TouchableOpacity onPress={() => { setShowFindFacility(false); setSearchQuery(''); setSearchResults([]); }}>
              <Text style={styles.cancelText}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.editTitle}>Find Facility</Text>
            <View style={{ width: 50 }} />
          </View>
          <View style={{ padding: Spacing.md }}>
            <TextInput
              style={[styles.formInput, { marginBottom: Spacing.md }]}
              value={searchQuery}
              onChangeText={handleSearchFacilities}
              placeholder="Search by facility name..."
              placeholderTextColor={Colors.textMuted}
              autoFocus
            />
            {searching && <ActivityIndicator size="small" color={Colors.primary} style={{ marginBottom: Spacing.md }} />}
            {searchResults.length === 0 && searchQuery.length >= 2 && !searching && (
              <Text style={{ color: Colors.textMuted, textAlign: 'center', fontSize: FontSize.sm }}>No facilities found</Text>
            )}
            <FlatList
              data={searchResults}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => (
                <View style={{ backgroundColor: Colors.card, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <View style={{ flex: 1, marginRight: Spacing.md }}>
                    <Text style={{ fontSize: FontSize.md, fontWeight: '600', color: Colors.text }}>{item.name}</Text>
                    {item.city && item.state && (
                      <Text style={{ fontSize: FontSize.xs, color: Colors.textSecondary, marginTop: 2 }}>{item.city}, {item.state}</Text>
                    )}
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: Colors.primary, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.md }}
                    onPress={() => handleRequestJoin(item.id)}
                    disabled={requestingJoin === item.id}
                  >
                    <Text style={{ color: Colors.textInverse, fontSize: FontSize.xs, fontWeight: '600' }}>
                      {requestingJoin === item.id ? 'Sending...' : 'Request to Join'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Admin Note */}
      {user?.userType === 'admin' && (
        <View style={styles.adminNote}>
          <Text style={styles.adminNoteText}>
            You have admin access. Use the web app to manage your facility.
          </Text>
        </View>
      )}

      {/* Logout */}
      <View style={styles.section}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: Spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  // ── View Mode ──
  header: {
    backgroundColor: Colors.card,
    alignItems: 'center',
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  avatarLarge: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.sm,
    overflow: 'hidden',
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarText: {
    color: Colors.textInverse,
    fontSize: FontSize.xxl,
    fontWeight: '700',
  },
  name: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.xs,
  },
  email: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  skillBadge: {
    backgroundColor: Colors.primary + '15',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: BorderRadius.full,
    marginTop: Spacing.sm,
  },
  skillText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  editButton: {
    marginTop: Spacing.md,
    backgroundColor: Colors.primary,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
  },
  editButtonText: {
    color: Colors.textInverse,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNumber: {
    fontSize: FontSize.xl,
    fontWeight: '700',
    color: Colors.primary,
  },
  statLabel: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: Colors.border,
  },
  section: {
    padding: Spacing.md,
  },
  sectionTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.sm,
  },
  bioText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  detailCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    overflow: 'hidden',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  detailLabel: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  detailValue: {
    fontSize: FontSize.sm,
    color: Colors.text,
    fontWeight: '500',
    flexShrink: 1,
    textAlign: 'right',
    marginLeft: Spacing.md,
  },
  adminNote: {
    marginHorizontal: Spacing.md,
    backgroundColor: Colors.info + '10',
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    borderLeftWidth: 3,
    borderLeftColor: Colors.info,
  },
  adminNoteText: {
    fontSize: FontSize.sm,
    color: Colors.info,
  },
  logoutButton: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.error + '30',
  },
  logoutText: {
    color: Colors.error,
    fontSize: FontSize.md,
    fontWeight: '600',
  },
  // ── Edit Mode ──
  editHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.card,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.borderLight,
  },
  editTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  cancelText: {
    fontSize: FontSize.md,
    color: Colors.textSecondary,
  },
  saveText: {
    fontSize: FontSize.md,
    color: Colors.primary,
    fontWeight: '600',
  },
  editAvatarSection: {
    alignItems: 'center',
    paddingVertical: Spacing.lg,
    backgroundColor: Colors.card,
  },
  changePhotoText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
    marginTop: Spacing.sm,
  },
  formSection: {
    padding: Spacing.md,
  },
  formSectionTitle: {
    fontSize: FontSize.md,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: Spacing.md,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formField: {
    marginBottom: Spacing.md,
  },
  formRow: {
    flexDirection: 'row',
    marginBottom: Spacing.md,
  },
  formFieldHalf: {
    flex: 1,
    marginRight: Spacing.sm,
  },
  formLabel: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    fontWeight: '600',
    marginBottom: Spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  formInput: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm + 2,
    fontSize: FontSize.md,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
  },
  formInputText: {
    fontSize: FontSize.md,
    color: Colors.text,
  },
  formPlaceholder: {
    fontSize: FontSize.md,
    color: Colors.textMuted,
  },
  formTextArea: {
    minHeight: 100,
    paddingTop: Spacing.sm + 2,
  },
  charCount: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    textAlign: 'right',
    marginTop: Spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  chipSelected: {
    backgroundColor: Colors.primary + '15',
    borderColor: Colors.primary,
  },
  chipText: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
  },
  chipTextSelected: {
    color: Colors.primary,
    fontWeight: '600',
  },
});
