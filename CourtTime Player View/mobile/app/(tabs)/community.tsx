/**
 * Community Tab
 * Hitting partner posts, events, and notifications in one place
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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../../src/utils/alert';
import { useAuth } from '../../src/contexts/AuthContext';
import { api } from '../../src/api/client';
import { Colors, Spacing, FontSize, BorderRadius } from '../../src/constants/theme';
import type { HittingPartnerPostWithUser, Notification } from '../../src/types/database';

type Tab = 'partners' | 'notifications';

interface EventItem {
  id: string;
  title: string;
  description?: string;
  eventType?: string;
  startDate: string;
  startTime?: string;
  endTime?: string;
  maxParticipants?: number;
  currentParticipants: number;
  status: string;
}

export default function CommunityScreen() {
  const { user, facilityId } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('partners');

  // Hitting partner state
  const [posts, setPosts] = useState<HittingPartnerPostWithUser[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreatePost, setShowCreatePost] = useState(false);

  // Notifications state
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  // Create post form
  const [postDescription, setPostDescription] = useState('');
  const [postAvailability, setPostAvailability] = useState('');
  const [postPlayStyle, setPostPlayStyle] = useState('');
  const [creating, setCreating] = useState(false);

  // ── Fetch data ──
  const fetchPartners = useCallback(async () => {
    if (!facilityId) return;
    const res = await api.get(`/api/hitting-partner/facility/${facilityId}`);
    if (res.success && res.data) {
      setPosts(res.data.posts || []);
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
    else fetchNotifications();
  }, [activeTab, fetchPartners, fetchNotifications]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'partners') await fetchPartners();
    else await fetchNotifications();
    setRefreshing(false);
  }, [activeTab, fetchPartners, fetchNotifications]);

  // ── Create hitting partner post ──
  async function handleCreatePost() {
    if (!postDescription.trim() || !postAvailability.trim() || !user || !facilityId) return;

    setCreating(true);
    const res = await api.post('/api/hitting-partner', {
      userId: user.id,
      facilityId,
      availability: postAvailability.trim(),
      description: postDescription.trim(),
      playStyle: postPlayStyle ? postPlayStyle.split(',').map(s => s.trim()) : [],
      expiresInDays: 30,
    });

    if (res.success) {
      setShowCreatePost(false);
      setPostDescription('');
      setPostAvailability('');
      setPostPlayStyle('');
      fetchPartners();
    } else {
      showAlert('Error', res.error || 'Could not create post');
    }
    setCreating(false);
  }

  // ── Delete own post ──
  async function handleDeletePost(postId: string) {
    if (!user) return;
    showAlert('Delete Post', 'Remove this hitting partner post?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await api.delete(`/api/hitting-partner/${postId}`);
          fetchPartners();
        }
      },
    ]);
  }

  // ── Mark notification read ──
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
  const getInitials = (name: string) =>
    name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  // ── RENDER ──
  return (
    <View style={styles.container}>
      {/* Tab Switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'partners' && styles.tabActive]}
          onPress={() => setActiveTab('partners')}
        >
          <Ionicons name="tennisball" size={16} color={activeTab === 'partners' ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'partners' && styles.tabTextActive]}>
            Find Partners
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'notifications' && styles.tabActive]}
          onPress={() => setActiveTab('notifications')}
        >
          <Ionicons name="notifications" size={16} color={activeTab === 'notifications' ? Colors.primary : Colors.textMuted} />
          <Text style={[styles.tabText, activeTab === 'notifications' && styles.tabTextActive]}>
            Notifications{unreadCount > 0 ? ` (${unreadCount})` : ''}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {/* ── HITTING PARTNERS TAB ── */}
        {activeTab === 'partners' && (
          <>
            <TouchableOpacity style={styles.createButton} onPress={() => setShowCreatePost(true)}>
              <Ionicons name="add-circle" size={20} color={Colors.textInverse} />
              <Text style={styles.createButtonText}>Post Looking for Partner</Text>
            </TouchableOpacity>

            {posts.length === 0 ? (
              <View style={styles.emptyCard}>
                <Ionicons name="tennisball-outline" size={48} color={Colors.textMuted} />
                <Text style={styles.emptyTitle}>No partner posts yet</Text>
                <Text style={styles.emptyText}>
                  Be the first to post! Let others know you're looking for a hitting partner.
                </Text>
              </View>
            ) : (
              posts.map((post) => (
                <View key={post.id} style={styles.postCard}>
                  <View style={styles.postHeader}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{post.userInitials || getInitials(post.userName)}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.postAuthor}>{post.userName}</Text>
                      {post.userSkillLevel && (
                        <Text style={styles.postSkill}>{post.userSkillLevel}</Text>
                      )}
                    </View>
                    {post.userId === user?.id && (
                      <TouchableOpacity onPress={() => handleDeletePost(post.id)}>
                        <Ionicons name="trash-outline" size={18} color={Colors.error} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.postDescription}>{post.description}</Text>
                  <View style={styles.postMeta}>
                    <View style={styles.metaChip}>
                      <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                      <Text style={styles.metaText}>{post.availability}</Text>
                    </View>
                    {post.playStyle?.length > 0 && (
                      <View style={styles.metaChip}>
                        <Ionicons name="tennisball-outline" size={14} color={Colors.textSecondary} />
                        <Text style={styles.metaText}>{post.playStyle.join(', ')}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.postDate}>
                    Posted {formatDate(post.postedDate as unknown as string)}
                  </Text>
                </View>
              ))
            )}
          </>
        )}

        {/* ── NOTIFICATIONS TAB ── */}
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
                <TouchableOpacity
                  key={notif.id}
                  style={[styles.notifCard, !notif.read && styles.notifUnread]}
                  onPress={() => !notif.read && markRead(notif.id)}
                >
                  <View style={styles.notifIcon}>
                    <Ionicons
                      name={notif.type === 'booking_confirmed' ? 'checkmark-circle' :
                            notif.priority === 'high' ? 'alert-circle' : 'information-circle'}
                      size={24}
                      color={!notif.read ? Colors.primary : Colors.textMuted}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.notifTitle, !notif.read && styles.notifTitleUnread]}>
                      {notif.title}
                    </Text>
                    <Text style={styles.notifMessage} numberOfLines={2}>{notif.message}</Text>
                    <Text style={styles.notifTime}>{formatDate(notif.timestamp)}</Text>
                  </View>
                  {!notif.read && <View style={styles.unreadDot} />}
                </TouchableOpacity>
              ))
            )}
          </>
        )}

        <View style={{ height: Spacing.xl }} />
      </ScrollView>

      {/* ── Create Post Modal ── */}
      <Modal visible={showCreatePost} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreatePost(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Find a Partner</Text>
            <TouchableOpacity onPress={handleCreatePost} disabled={creating}>
              <Text style={[styles.modalSave, creating && { opacity: 0.5 }]}>
                {creating ? '...' : 'Post'}
              </Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <Text style={styles.formLabel}>What are you looking for? *</Text>
            <TextInput
              style={[styles.formInput, styles.formTextArea]}
              value={postDescription}
              onChangeText={setPostDescription}
              placeholder="e.g. Looking for an intermediate player for singles practice..."
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
            />

            <Text style={styles.formLabel}>Your availability *</Text>
            <TextInput
              style={styles.formInput}
              value={postAvailability}
              onChangeText={setPostAvailability}
              placeholder="e.g. Weekday evenings, Saturday mornings"
              placeholderTextColor={Colors.textMuted}
            />

            <Text style={styles.formLabel}>Play style (comma-separated)</Text>
            <TextInput
              style={styles.formInput}
              value={postPlayStyle}
              onChangeText={setPostPlayStyle}
              placeholder="e.g. Singles, Doubles, Competitive"
              placeholderTextColor={Colors.textMuted}
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.surface,
  },
  content: {
    flex: 1,
    padding: Spacing.md,
  },

  // ── Tab Switcher ──
  tabBar: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: Colors.primary,
  },
  tabText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.textMuted,
  },
  tabTextActive: {
    color: Colors.primary,
  },

  // ── Create Button ──
  createButton: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  createButtonText: {
    color: Colors.textInverse,
    fontSize: FontSize.md,
    fontWeight: '600',
  },

  // ── Empty State ──
  emptyCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.xl,
    alignItems: 'center',
    gap: Spacing.sm,
  },
  emptyTitle: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    color: Colors.text,
  },
  emptyText: {
    fontSize: FontSize.sm,
    color: Colors.textMuted,
    textAlign: 'center',
  },

  // ── Hitting Partner Posts ──
  postCard: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: Colors.textInverse,
    fontSize: FontSize.sm,
    fontWeight: '700',
  },
  postAuthor: {
    fontSize: FontSize.md,
    fontWeight: '600',
    color: Colors.text,
  },
  postSkill: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
    textTransform: 'capitalize',
  },
  postDescription: {
    fontSize: FontSize.sm,
    color: Colors.text,
    lineHeight: 22,
    marginBottom: Spacing.sm,
  },
  postMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
    borderRadius: BorderRadius.full,
  },
  metaText: {
    fontSize: FontSize.xs,
    color: Colors.textSecondary,
  },
  postDate: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
  },

  // ── Notifications ──
  markAllRead: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.sm,
  },
  markAllReadText: {
    color: Colors.primary,
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  notifCard: {
    flexDirection: 'row',
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  notifUnread: {
    backgroundColor: Colors.primary + '08',
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary,
  },
  notifIcon: {
    marginTop: 2,
  },
  notifTitle: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    color: Colors.text,
  },
  notifTitleUnread: {
    fontWeight: '700',
  },
  notifMessage: {
    fontSize: FontSize.sm,
    color: Colors.textSecondary,
    marginTop: 2,
    lineHeight: 20,
  },
  notifTime: {
    fontSize: FontSize.xs,
    color: Colors.textMuted,
    marginTop: 4,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary,
    marginTop: 6,
  },

  // ── Modal ──
  modalContainer: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalCancel: {
    color: Colors.textSecondary,
    fontSize: FontSize.md,
  },
  modalTitle: {
    fontSize: FontSize.lg,
    fontWeight: '700',
    color: Colors.text,
  },
  modalSave: {
    color: Colors.primary,
    fontSize: FontSize.md,
    fontWeight: '700',
  },
  modalBody: {
    padding: Spacing.md,
  },
  formLabel: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: Spacing.xs,
    marginTop: Spacing.md,
  },
  formInput: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: 12,
    fontSize: FontSize.md,
    color: Colors.text,
    backgroundColor: Colors.surface,
  },
  formTextArea: {
    height: 100,
    textAlignVertical: 'top',
  },
});
