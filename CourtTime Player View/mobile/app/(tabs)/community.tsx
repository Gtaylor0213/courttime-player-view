/**
 * Community Tab
 * Three sub-tabs: Find Partners, Bulletin Board, Notifications
 */

import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  TextInput,
  Modal,
  FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../../src/utils/alert';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { FacilitySelector } from '../../src/components/FacilitySelector';
import { api } from '../../src/api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import type { HittingPartnerPostWithUser } from '../../src/types/database';

type Tab = 'partners' | 'bulletin' | 'notifications';

const SKILL_FILTERS = ['All', 'Beginner', 'Intermediate', 'Advanced', 'Professional'];
const PLAY_STYLE_OPTIONS = ['Singles', 'Doubles', 'Competitive', 'Casual', 'Baseline', 'Serve & Volley', 'All-court'];
const BULLETIN_TYPES = ['All', 'announcement', 'event', 'clinic', 'tournament', 'social'];
const BULLETIN_TYPE_LABELS: Record<string, string> = {
  All: 'All', announcement: 'Announcements', event: 'Events', clinic: 'Clinics',
  tournament: 'Tournaments', social: 'Social',
};
const BULLETIN_TYPE_COLORS: Record<string, string> = {
  announcement: Colors.info, event: Colors.primary, clinic: Colors.success,
  tournament: Colors.warning, social: '#a855f7',
};

export default function CommunityScreen() {
  const { user, facilityId } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('partners');

  // Hitting partner state
  const [posts, setPosts] = useState<HittingPartnerPostWithUser[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);

  // Partner filters
  const [searchQuery, setSearchQuery] = useState('');
  const [skillFilter, setSkillFilter] = useState('All');

  // Bulletin board state
  const [bulletins, setBulletins] = useState<any[]>([]);
  const [bulletinFilter, setBulletinFilter] = useState('All');
  const [showCreateBulletin, setShowCreateBulletin] = useState(false);
  const [bulletinTitle, setBulletinTitle] = useState('');
  const [bulletinContent, setBulletinContent] = useState('');
  const [bulletinCategory, setBulletinCategory] = useState('announcement');
  const [bulletinCreating, setBulletinCreating] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Post form
  const [postDescription, setPostDescription] = useState('');
  const [postAvailability, setPostAvailability] = useState('');
  const [postPlayStyles, setPostPlayStyles] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const isAdmin = user?.adminFacilities?.includes(facilityId || '') || false;

  // ── Fetch data ──
  const fetchPartners = useCallback(async () => {
    if (!facilityId) return;
    const res = await api.get(`/api/hitting-partner/facility/${facilityId}`);
    if (res.success && res.data) {
      setPosts(res.data.posts || []);
    }
  }, [facilityId]);

  const fetchBulletins = useCallback(async () => {
    if (!facilityId) return;
    const res = await api.get(`/api/bulletin-board/${facilityId}`);
    if (res.success && res.data) {
      const list = Array.isArray(res.data) ? res.data : res.data.posts || [];
      setBulletins(list);
    }
  }, [facilityId]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    const [notifRes, countRes] = await Promise.all([
      api.get(`/api/notifications/${user.id}`),
      api.get(`/api/notifications/${user.id}/unread-count`),
    ]);
    if (notifRes.success && notifRes.data) {
      setNotifications(notifRes.data.notifications || []);
    }
    if (countRes.success && countRes.data) {
      setUnreadCount(countRes.data.count || 0);
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'partners') fetchPartners();
    else if (activeTab === 'bulletin') fetchBulletins();
    else fetchNotifications();
  }, [activeTab, fetchPartners, fetchBulletins, fetchNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'partners') await fetchPartners();
    else if (activeTab === 'bulletin') await fetchBulletins();
    else await fetchNotifications();
    setRefreshing(false);
  }, [activeTab, fetchPartners, fetchBulletins, fetchNotifications]);

  // ── Filtered partners ──
  const filteredPosts = posts.filter(post => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!post.userName?.toLowerCase().includes(q) && !post.description?.toLowerCase().includes(q)) return false;
    }
    if (skillFilter !== 'All' && post.userSkillLevel?.toLowerCase() !== skillFilter.toLowerCase()) return false;
    return true;
  });

  // ── Filtered bulletins ──
  const filteredBulletins = bulletins.filter(post => {
    if (bulletinFilter !== 'All' && post.category !== bulletinFilter) return false;
    return true;
  }).sort((a, b) => {
    // Pinned posts first
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return 0;
  });

  // ── Partner post CRUD ──
  function openCreatePost() {
    setEditingPostId(null);
    setPostDescription('');
    setPostAvailability('');
    setPostPlayStyles([]);
    setShowPostModal(true);
  }

  function openEditPost(post: HittingPartnerPostWithUser) {
    setEditingPostId(post.id);
    setPostDescription(post.description || '');
    setPostAvailability(post.availability || '');
    setPostPlayStyles(post.playStyle || []);
    setShowPostModal(true);
  }

  async function handleSavePost() {
    if (!postDescription.trim() || !postAvailability.trim() || !user || !facilityId) return;
    setCreating(true);
    const payload = {
      userId: user.id, facilityId,
      availability: postAvailability.trim(),
      description: postDescription.trim(),
      playStyle: postPlayStyles, expiresInDays: 30,
    };
    const res = editingPostId
      ? await api.patch(`/api/hitting-partner/${editingPostId}`, payload)
      : await api.post('/api/hitting-partner', payload);
    if (res.success) { setShowPostModal(false); setEditingPostId(null); fetchPartners(); }
    else { showAlert('Error', res.error || 'Could not save post'); }
    setCreating(false);
  }

  async function handleDeletePost(postId: string) {
    if (!user) return;
    showAlert('Delete Post', 'Remove this hitting partner post?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await api.delete(`/api/hitting-partner/${postId}`); fetchPartners(); } },
    ]);
  }

  function handleMessagePlayer(post: HittingPartnerPostWithUser) {
    router.push({ pathname: '/(tabs)/messages', params: { recipientId: post.userId, recipientName: post.userName } });
  }

  const togglePlayStyle = (style: string) => {
    setPostPlayStyles(prev => prev.includes(style) ? prev.filter(s => s !== style) : [...prev, style]);
  };

  // ── Bulletin board CRUD ──
  async function handleCreateBulletin() {
    if (!bulletinTitle.trim() || !bulletinContent.trim() || !user || !facilityId) return;
    setBulletinCreating(true);
    const res = await api.post('/api/bulletin-board', {
      facilityId, authorId: user.id,
      title: bulletinTitle.trim(), content: bulletinContent.trim(),
      category: bulletinCategory, isAdminPost: isAdmin,
    });
    if (res.success) {
      setShowCreateBulletin(false);
      setBulletinTitle(''); setBulletinContent(''); setBulletinCategory('announcement');
      fetchBulletins();
    } else {
      showAlert('Error', res.error || 'Could not create post');
    }
    setBulletinCreating(false);
  }

  async function handleDeleteBulletin(postId: string) {
    showAlert('Delete Post', 'Remove this bulletin post?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        await api.delete(`/api/bulletin-board/${postId}`);
        fetchBulletins();
      }},
    ]);
  }

  // ── Notifications ──
  async function markRead(notificationId: string) {
    await api.post(`/api/notifications/${notificationId}/read`, {});
    fetchNotifications();
  }
  async function markAllRead() {
    if (!user) return;
    await api.post(`/api/notifications/${user.id}/read-all`, {});
    fetchNotifications();
  }

  // ── Helpers ──
  const getInitials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const formatShortDate = (date: string) => new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  const getNotifIcon = (type?: string): string => {
    switch (type) {
      case 'reservation_confirmed': return 'checkmark-circle';
      case 'reservation_cancelled': return 'close-circle';
      case 'reservation_reminder': return 'alarm';
      case 'court_change': return 'swap-horizontal';
      case 'payment_received': return 'card';
      case 'facility_announcement': return 'megaphone';
      case 'weather_alert': return 'thunderstorm';
      default: return 'information-circle';
    }
  };
  const getNotifColor = (type?: string, read?: boolean): string => {
    if (read) return Colors.textMuted;
    switch (type) {
      case 'reservation_confirmed': return Colors.success;
      case 'reservation_cancelled': return Colors.error;
      case 'reservation_reminder': return Colors.success;
      case 'weather_alert': return Colors.warning;
      default: return Colors.primary;
    }
  };

  return (
    <View style={styles.container}>
      {/* Tab Switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity style={[styles.tab, activeTab === 'partners' && styles.tabActive]} onPress={() => setActiveTab('partners')}>
          <Ionicons name="tennisball" size={14} color={activeTab === 'partners' ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'partners' && styles.tabTextActive]}>Partners</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'bulletin' && styles.tabActive]} onPress={() => setActiveTab('bulletin')}>
          <Ionicons name="megaphone" size={14} color={activeTab === 'bulletin' ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'bulletin' && styles.tabTextActive]}>Bulletin</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'notifications' && styles.tabActive]} onPress={() => setActiveTab('notifications')}>
          <Ionicons name="notifications" size={14} color={activeTab === 'notifications' ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'notifications' && styles.tabTextActive]}>
            Alerts{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* ══════ PARTNERS TAB ══════ */}
        {activeTab === 'partners' && (
          <>
            <FacilitySelector />
            <TouchableOpacity style={styles.createButton} onPress={openCreatePost}>
              <Ionicons name="add-circle" size={20} color={Colors.textInverse} />
              <Text style={styles.createButtonText}>Post Looking for Partner</Text>
            </TouchableOpacity>

            <View style={styles.searchBar}>
              <Ionicons name="search" size={18} color={Colors.textMuted} />
              <TextInput style={styles.searchInput} value={searchQuery} onChangeText={setSearchQuery}
                placeholder="Search by name or description..." placeholderTextColor={Colors.textMuted} />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              <View style={styles.filterRow}>
                {SKILL_FILTERS.map(level => (
                  <TouchableOpacity key={level} style={[styles.filterChip, skillFilter === level && styles.filterChipActive]}
                    onPress={() => setSkillFilter(level)}>
                    <Text style={[styles.filterChipText, skillFilter === level && styles.filterChipTextActive]}>{level}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {filteredPosts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="tennisball-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>{posts.length === 0 ? 'No partner posts yet' : 'No matching posts'}</Text>
                <Text style={styles.emptyText}>{posts.length === 0 ? 'Be the first to post!' : 'Try adjusting your filters.'}</Text>
              </View>
            ) : (
              filteredPosts.map((post) => (
                <View key={post.id} style={styles.postCard}>
                  <View style={styles.postHeader}>
                    <View style={styles.avatar}><Text style={styles.avatarText}>{post.userInitials || getInitials(post.userName)}</Text></View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.postAuthor}>{post.userName}</Text>
                      {post.userSkillLevel && <Text style={styles.postSkill}>{post.userSkillLevel}</Text>}
                    </View>
                    {post.userId === user?.id && (
                      <View style={{ flexDirection: 'row', gap: Spacing.sm }}>
                        <TouchableOpacity onPress={() => openEditPost(post)}><Ionicons name="create-outline" size={18} color={Colors.primary} /></TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeletePost(post.id)}><Ionicons name="trash-outline" size={18} color={Colors.error} /></TouchableOpacity>
                      </View>
                    )}
                  </View>
                  <Text style={styles.postDescription}>{post.description}</Text>
                  <View style={styles.postMeta}>
                    <View style={styles.metaChip}><Ionicons name="time-outline" size={14} color={Colors.textSecondary} /><Text style={styles.metaText}>{post.availability}</Text></View>
                    {post.playStyle?.length > 0 && (
                      <View style={styles.metaChip}><Ionicons name="tennisball-outline" size={14} color={Colors.textSecondary} /><Text style={styles.metaText}>{post.playStyle.join(', ')}</Text></View>
                    )}
                  </View>
                  <View style={styles.postFooter}>
                    <Text style={styles.postDate}>Posted {formatDate(post.postedDate as unknown as string)}</Text>
                    {post.userId !== user?.id && (
                      <TouchableOpacity style={styles.messageButton} onPress={() => handleMessagePlayer(post)}>
                        <Ionicons name="chatbubble-outline" size={14} color={Colors.primary} />
                        <Text style={styles.messageButtonText}>Message</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ══════ BULLETIN BOARD TAB ══════ */}
        {activeTab === 'bulletin' && (
          <>
            <FacilitySelector />

            {/* Admin can create posts */}
            {isAdmin && (
              <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateBulletin(true)}>
                <Ionicons name="add-circle" size={20} color={Colors.textInverse} />
                <Text style={styles.createButtonText}>Create Post</Text>
              </TouchableOpacity>
            )}

            {/* Type Filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
              <View style={styles.filterRow}>
                {BULLETIN_TYPES.map(type => (
                  <TouchableOpacity key={type} style={[styles.filterChip, bulletinFilter === type && styles.filterChipActive]}
                    onPress={() => setBulletinFilter(type)}>
                    <Text style={[styles.filterChipText, bulletinFilter === type && styles.filterChipTextActive]}>
                      {BULLETIN_TYPE_LABELS[type] || type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {filteredBulletins.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="megaphone-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No posts yet</Text>
                <Text style={styles.emptyText}>Check back later for announcements and events.</Text>
              </View>
            ) : (
              filteredBulletins.map((post) => (
                <View key={post.id} style={styles.bulletinCard}>
                  {post.isPinned && (
                    <View style={styles.pinnedBadge}>
                      <Ionicons name="pin" size={12} color={Colors.warning} />
                      <Text style={styles.pinnedText}>Pinned</Text>
                    </View>
                  )}
                  <View style={styles.bulletinHeader}>
                    <View style={[styles.categoryBadge, { backgroundColor: (BULLETIN_TYPE_COLORS[post.category] || Colors.textMuted) + '15' }]}>
                      <Text style={[styles.categoryText, { color: BULLETIN_TYPE_COLORS[post.category] || Colors.textMuted }]}>
                        {post.category ? post.category.charAt(0).toUpperCase() + post.category.slice(1) : 'Post'}
                      </Text>
                    </View>
                    {(post.authorId === user?.id || isAdmin) && (
                      <TouchableOpacity onPress={() => handleDeleteBulletin(post.id)}>
                        <Ionicons name="trash-outline" size={16} color={Colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.bulletinTitle}>{post.title}</Text>
                  <Text style={styles.bulletinContent} numberOfLines={4}>{post.content}</Text>
                  {post.eventDate && (
                    <View style={styles.bulletinEventRow}>
                      <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                      <Text style={styles.bulletinEventText}>{formatDate(post.eventDate)}</Text>
                      {post.eventTime && <Text style={styles.bulletinEventText}> at {post.eventTime}</Text>}
                    </View>
                  )}
                  {post.location && (
                    <View style={styles.bulletinEventRow}>
                      <Ionicons name="location-outline" size={14} color={Colors.primary} />
                      <Text style={styles.bulletinEventText}>{post.location}</Text>
                    </View>
                  )}
                  {post.maxParticipants && (
                    <View style={styles.bulletinEventRow}>
                      <Ionicons name="people-outline" size={14} color={Colors.primary} />
                      <Text style={styles.bulletinEventText}>{post.currentParticipants || 0} / {post.maxParticipants} participants</Text>
                    </View>
                  )}
                  <Text style={styles.bulletinMeta}>
                    {post.authorName || 'Admin'} · {formatShortDate(post.createdAt || post.postedDate)}
                  </Text>
                </View>
              ))
            )}
          </>
        )}

        {/* ══════ NOTIFICATIONS TAB ══════ */}
        {activeTab === 'notifications' && (
          <>
            {unreadCount > 0 && (
              <TouchableOpacity style={styles.markAllRead} onPress={markAllRead}>
                <Text style={styles.markAllReadText}>Mark all as read</Text>
              </TouchableOpacity>
            )}

            {notifications.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="notifications-off-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No notifications</Text>
                <Text style={styles.emptyText}>You're all caught up!</Text>
              </View>
            ) : (
              notifications.map((notif) => (
                <TouchableOpacity key={notif.id} style={[styles.notifCard, !notif.read && styles.notifUnread]}
                  onPress={() => !notif.read && markRead(notif.id)}>
                  <View style={styles.notifIcon}>
                    <Ionicons name={getNotifIcon(notif.type) as any} size={24} color={getNotifColor(notif.type, notif.read)} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notifTitle, !notif.read && styles.notifTitleUnread]}>{notif.title}</Text>
                    <Text style={styles.notifMessage} numberOfLines={2}>{notif.message}</Text>
                    {notif.relatedReservation && (
                      <View style={styles.notifReservation}>
                        <Text style={styles.notifReservationText}>
                          {notif.relatedReservation.courtName} · {formatShortDate(notif.relatedReservation.date)}
                        </Text>
                      </View>
                    )}
                    <Text style={styles.notifTime}>{formatDate(notif.timestamp || notif.createdAt)}</Text>
                  </View>
                  {!notif.read && <View style={styles.unreadDot} />}
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {/* ── Create / Edit Partner Post Modal ── */}
      <Modal visible={showPostModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPostModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowPostModal(false)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>{editingPostId ? 'Edit Post' : 'Find a Partner'}</Text>
            <TouchableOpacity onPress={handleSavePost} disabled={creating}>
              <Text style={[styles.modalSave, creating && { opacity: 0.5 }]}>{creating ? '...' : editingPostId ? 'Save' : 'Post'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.formLabel}>What are you looking for? *</Text>
            <TextInput style={[styles.formInput, styles.formTextArea]} value={postDescription} onChangeText={setPostDescription}
              placeholder="e.g. Looking for an intermediate player for singles practice..." placeholderTextColor={Colors.textMuted} multiline />
            <Text style={styles.formLabel}>Your availability *</Text>
            <TextInput style={styles.formInput} value={postAvailability} onChangeText={setPostAvailability}
              placeholder="e.g. Weekday evenings, Saturday mornings" placeholderTextColor={Colors.textMuted} />
            <Text style={styles.formLabel}>Play Style</Text>
            <View style={styles.playStyleGrid}>
              {PLAY_STYLE_OPTIONS.map(style => (
                <TouchableOpacity key={style} style={[styles.filterChip, postPlayStyles.includes(style) && styles.filterChipActive]}
                  onPress={() => togglePlayStyle(style)}>
                  <Text style={[styles.filterChipText, postPlayStyles.includes(style) && styles.filterChipTextActive]}>{style}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── Create Bulletin Post Modal ── */}
      <Modal visible={showCreateBulletin} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCreateBulletin(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateBulletin(false)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>New Bulletin Post</Text>
            <TouchableOpacity onPress={handleCreateBulletin} disabled={bulletinCreating}>
              <Text style={[styles.modalSave, bulletinCreating && { opacity: 0.5 }]}>{bulletinCreating ? '...' : 'Post'}</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody}>
            <Text style={styles.formLabel}>Title *</Text>
            <TextInput style={styles.formInput} value={bulletinTitle} onChangeText={setBulletinTitle}
              placeholder="Post title" placeholderTextColor={Colors.textMuted} />

            <Text style={styles.formLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: Spacing.md }}>
              <View style={styles.filterRow}>
                {BULLETIN_TYPES.filter(t => t !== 'All').map(type => (
                  <TouchableOpacity key={type} style={[styles.filterChip, bulletinCategory === type && styles.filterChipActive]}
                    onPress={() => setBulletinCategory(type)}>
                    <Text style={[styles.filterChipText, bulletinCategory === type && styles.filterChipTextActive]}>
                      {BULLETIN_TYPE_LABELS[type] || type}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={styles.formLabel}>Content *</Text>
            <TextInput style={[styles.formInput, styles.formTextArea]} value={bulletinContent} onChangeText={setBulletinContent}
              placeholder="Write your announcement..." placeholderTextColor={Colors.textMuted} multiline />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  content: { flex: 1, padding: Spacing.md },

  // Tab Switcher
  tabBar: { flexDirection: 'row', backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, gap: 5, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: Colors.primary },
  tabText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  tabTextActive: { color: Colors.primary },

  // Create Button
  createButton: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  createButtonText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '600' },

  // Search & Filters
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.text, paddingVertical: 0 },
  filterScroll: { marginBottom: Spacing.md },
  filterRow: { flexDirection: 'row', gap: Spacing.sm },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, borderRadius: BorderRadius.full, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border },
  filterChipActive: { backgroundColor: Colors.primary + '15', borderColor: Colors.primary },
  filterChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: Colors.primary },

  // Empty State
  emptyCard: { backgroundColor: Colors.card, borderRadius: BorderRadius.md, padding: Spacing.xl, alignItems: 'center', gap: Spacing.sm },
  emptyTitle: { fontSize: FontSize.lg, fontWeight: '600', color: Colors.text },
  emptyText: { fontSize: FontSize.sm, color: Colors.textMuted, textAlign: 'center' },

  // Partner Posts
  postCard: { backgroundColor: Colors.card, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.primary, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: Colors.textInverse, fontSize: FontSize.sm, fontWeight: '700' },
  postAuthor: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text },
  postSkill: { fontSize: FontSize.xs, color: Colors.textSecondary, textTransform: 'capitalize' },
  postDescription: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 22, marginBottom: Spacing.sm },
  postMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  postFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  postDate: { fontSize: FontSize.xs, color: Colors.textMuted },
  messageButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary + '10', paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs, borderRadius: BorderRadius.full },
  messageButtonText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '600' },

  // Bulletin Board
  bulletinCard: { backgroundColor: Colors.card, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm },
  bulletinHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: Spacing.sm },
  categoryBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  categoryText: { fontSize: FontSize.xs, fontWeight: '600' },
  pinnedBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: Spacing.xs },
  pinnedText: { fontSize: FontSize.xs, color: Colors.warning, fontWeight: '600' },
  bulletinTitle: { fontSize: FontSize.md, fontWeight: '700', color: Colors.text, marginBottom: Spacing.xs },
  bulletinContent: { fontSize: FontSize.sm, color: Colors.textSecondary, lineHeight: 22, marginBottom: Spacing.sm },
  bulletinEventRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  bulletinEventText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '500' },
  bulletinMeta: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.sm },

  // Notifications
  markAllRead: { alignSelf: 'flex-end', marginBottom: Spacing.sm },
  markAllReadText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
  notifCard: { flexDirection: 'row', backgroundColor: Colors.card, borderRadius: BorderRadius.md, padding: Spacing.md, marginBottom: Spacing.sm, alignItems: 'flex-start', gap: Spacing.sm },
  notifUnread: { backgroundColor: Colors.primary + '08', borderLeftWidth: 3, borderLeftColor: Colors.primary },
  notifIcon: { marginTop: 2 },
  notifTitle: { fontSize: FontSize.sm, fontWeight: '500', color: Colors.text },
  notifTitleUnread: { fontWeight: '700' },
  notifMessage: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2, lineHeight: 20 },
  notifReservation: { backgroundColor: Colors.surface, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 2, marginTop: 4, alignSelf: 'flex-start' },
  notifReservationText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '500' },
  notifTime: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 6 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: Colors.background },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalCancel: { color: Colors.textSecondary, fontSize: FontSize.md },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalSave: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },
  modalBody: { padding: Spacing.md },
  formLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs, marginTop: Spacing.md },
  formInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.surface },
  formTextArea: { height: 100, textAlignVertical: 'top' },
  playStyleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
});
