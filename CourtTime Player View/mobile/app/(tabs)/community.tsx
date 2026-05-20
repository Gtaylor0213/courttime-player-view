/**
 * Community Tab
 * Three sub-tabs: Find Partners, Bulletin Board, Notifications
 */

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Modal,
  FlatList,
  ScrollView,
  Platform,
  Share,
  Animated,
  LayoutAnimation,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '../../src/utils/alert';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { api, paymentApi } from '../../src/api/client';
import { bulletinSignupCheckoutUrls } from '../../../shared/utils/mobileCheckoutUrls';
import { unwrapApiPayload } from '../../../shared/api/core';
import {
  extractCheckoutUrl,
  formatCentsAsUsd,
  isPaidBulletinSignup,
  openStripeCheckout,
} from '../../src/utils/payments';
import { Colors, Spacing, FontSize, BorderRadius, TouchTarget, Motion } from '../../src/constants/theme';
import type { HittingPartnerPostWithUser } from '../../src/types/database';
import { createRouteErrorBoundary } from '../../src/components/RouteErrorBoundary';
import { EmptyState } from '../../src/components/EmptyState';
import { createPollingTransport } from '../../../shared/api/sync';
import { formatBulletinPostProminentDate } from '../../../shared/utils/bulletinPostDisplay';
import { Card } from '../../src/components/Card';
import { Input } from '../../src/components/Input';
import { Skeleton } from '../../src/components/Skeleton';
import { OfflineBanner } from '../../src/components/OfflineBanner';
import { useOfflineApi } from '../../src/hooks/useOfflineApi';
import {
  isPartnerPostFormValid,
  buildHittingPartnerCreateBody,
  buildHittingPartnerPatchBody,
  partnerPostFailureUi,
  logCommunityCreatePost,
  PARTNER_DESCRIPTION_MIN,
  PARTNER_EXPIRY_MIN_DAYS,
  PARTNER_EXPIRY_MAX_DAYS,
} from '../../src/utils/communityPartnerPostForm';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export const ErrorBoundary = createRouteErrorBoundary('Community');

type Tab = 'partners' | 'bulletin' | 'notifications';

const SKILL_FILTERS = ['All', 'Beginner', 'Intermediate', 'Advanced', 'Professional'];
const PLAY_STYLE_OPTIONS = ['Singles', 'Doubles', 'Competitive', 'Casual', 'Baseline', 'Serve & Volley', 'All-court'];
const EXPIRY_DAY_CHOICES = [7, 14, 30, 60, 90] as const;
const BULLETIN_TYPES = ['All', 'announcement', 'event', 'clinic', 'tournament', 'social', 'drill'];
const BULLETIN_TYPE_LABELS: Record<string, string> = {
  All: 'All', announcement: 'Announcements', event: 'Events', clinic: 'Clinics',
  tournament: 'Tournaments', social: 'Social', drill: 'Drills',
};
const BULLETIN_TYPE_COLORS: Record<string, string> = {
  announcement: Colors.info, event: Colors.primary, clinic: Colors.success,
  tournament: Colors.warning, social: Colors.purple, drill: Colors.cyan,
};
const ACTIVE_FEED_POLL_MS = 5000;
const SIGNUP_EVENT_CATEGORIES = new Set(['event', 'drill', 'social', 'clinic', 'tournament']);

function formatRelativeTime(iso: string | undefined): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const d = Date.now() - t;
  const m = Math.floor(d / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const AVATAR_BG = [Colors.primary, Colors.purple, Colors.cyan] as const;
function avatarBackgroundForId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h + id.charCodeAt(i) * (i + 1)) % 997;
  return AVATAR_BG[h % AVATAR_BG.length];
}

function CommunityPostSkeletonBlock() {
  return (
    <Card style={styles.skeletonCard} padded>
      <View style={styles.skeletonRow}>
        <Skeleton width={44} height={44} borderRadius={BorderRadius.full} />
        <View style={{ flex: 1, gap: Spacing.sm }}>
          <Skeleton width="40%" height={14} />
          <Skeleton width="55%" height={12} />
          <Skeleton width="100%" height={12} />
          <Skeleton width="85%" height={12} />
          <View style={{ flexDirection: 'row', gap: Spacing.md, marginTop: Spacing.sm }}>
            <Skeleton width={72} height={14} />
            <Skeleton width={56} height={14} />
            <Skeleton width={56} height={14} />
          </View>
        </View>
      </View>
    </Card>
  );
}

function CommunityListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <View style={styles.skeletonList}>
      {Array.from({ length: count }).map((_, i) => (
        <CommunityPostSkeletonBlock key={i} />
      ))}
    </View>
  );
}

function paramString(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  const s = Array.isArray(v) ? v[0] : v;
  return typeof s === 'string' && s.length > 0 ? s : undefined;
}

export default function CommunityScreen() {
  const { user, facilityId } = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{
    signupSuccess?: string;
    session_id?: string;
    postId?: string;
  }>();
  const { bannerState, lastCachedAt, retryConnectivity } = useOfflineApi();
  const [activeTab, setActiveTab] = useState<Tab>('partners');
  const [tabBarWidth, setTabBarWidth] = useState(0);
  const underlineAnim = useRef(new Animated.Value(0)).current;

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
  const [postExpiresInDays, setPostExpiresInDays] = useState(30);
  const [savedPartnerIds, setSavedPartnerIds] = useState<Record<string, boolean>>({});
  const [creating, setCreating] = useState(false);
  const [loadingPartners, setLoadingPartners] = useState(false);
  const [loadingBulletins, setLoadingBulletins] = useState(false);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const isAdmin = user?.adminFacilities?.includes(facilityId || '') || false;

  // ── Fetch data ──
  const fetchPartners = useCallback(async () => {
    if (!facilityId) return;
    setLoadingPartners(true);
    try {
      const res = await api.get(`/api/hitting-partner/facility/${facilityId}`);
      if (res.success && res.data) {
        setPosts(res.data.posts || []);
      }
    } finally {
      setLoadingPartners(false);
    }
  }, [facilityId]);

  const fetchBulletins = useCallback(async () => {
    if (!facilityId) return;
    setLoadingBulletins(true);
    try {
      const res = await api.get(`/api/bulletin-board/${facilityId}`);
      if (res.success && res.data) {
        const list = Array.isArray(res.data) ? res.data : res.data.posts || [];
        setBulletins(list);
      }
    } finally {
      setLoadingBulletins(false);
    }
  }, [facilityId]);

  const fetchNotifications = useCallback(async () => {
    if (!user) return;
    setLoadingNotifications(true);
    try {
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
    } finally {
      setLoadingNotifications(false);
    }
  }, [user]);

  useEffect(() => {
    if (activeTab === 'partners') fetchPartners();
    else if (activeTab === 'bulletin') fetchBulletins();
    else fetchNotifications();
  }, [activeTab, fetchPartners, fetchBulletins, fetchNotifications]);

  useEffect(() => {
    const stopPolling = createPollingTransport(ACTIVE_FEED_POLL_MS).subscribe(() => {
      if (activeTab === 'partners') {
        fetchPartners();
      } else if (activeTab === 'bulletin') {
        fetchBulletins();
      }
    });
    return stopPolling;
  }, [activeTab, fetchPartners, fetchBulletins]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (activeTab === 'partners') await fetchPartners();
    else if (activeTab === 'bulletin') await fetchBulletins();
    else await fetchNotifications();
    setRefreshing(false);
  }, [activeTab, fetchPartners, fetchBulletins, fetchNotifications]);

  const partnerFormInput = useMemo(
    () => ({
      description: postDescription,
      availability: postAvailability,
      playStyles: postPlayStyles,
      expiresInDays: postExpiresInDays,
    }),
    [postDescription, postAvailability, postPlayStyles, postExpiresInDays]
  );
  const partnerFormValid = isPartnerPostFormValid(partnerFormInput);

  const selectTab = useCallback((t: Tab) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setActiveTab(t);
  }, []);

  useEffect(() => {
    const idx = activeTab === 'partners' ? 0 : activeTab === 'bulletin' ? 1 : 2;
    const w = tabBarWidth > 0 ? tabBarWidth / 3 : 0;
    Animated.timing(underlineAnim, {
      toValue: idx * w,
      duration: Motion.standard,
      useNativeDriver: true,
    }).start();
  }, [activeTab, tabBarWidth, underlineAnim]);

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
  const openCreatePost = useCallback(() => {
    setEditingPostId(null);
    setPostDescription('');
    setPostAvailability('');
    setPostPlayStyles([]);
    setPostExpiresInDays(30);
    setShowPostModal(true);
  }, []);

  const openEditPost = useCallback((post: HittingPartnerPostWithUser) => {
    setEditingPostId(post.id);
    setPostDescription(post.description || '');
    setPostAvailability(post.availability || '');
    setPostPlayStyles(post.playStyle || []);
    const exp = post.expiresAt ? new Date(post.expiresAt as unknown as string).getTime() : NaN;
    const daysLeft = Number.isFinite(exp)
      ? Math.ceil((exp - Date.now()) / 86400000)
      : 30;
    const clamped = Math.min(PARTNER_EXPIRY_MAX_DAYS, Math.max(PARTNER_EXPIRY_MIN_DAYS, daysLeft));
    setPostExpiresInDays(clamped);
    setShowPostModal(true);
  }, []);

  async function handleSavePost() {
    if (!user || !facilityId) return;
    if (!isPartnerPostFormValid(partnerFormInput)) return;
    setCreating(true);
    const payload = editingPostId
      ? buildHittingPartnerPatchBody(user.id, partnerFormInput)
      : buildHittingPartnerCreateBody(user.id, facilityId, partnerFormInput);
    const res = editingPostId
      ? await api.patch(`/api/hitting-partner/${editingPostId}`, payload)
      : await api.post('/api/hitting-partner', payload);
    logCommunityCreatePost(payload, res);
    if (res.success) {
      setShowPostModal(false);
      setEditingPostId(null);
      fetchPartners();
    } else {
      const ui = partnerPostFailureUi(res);
      if (ui.mode === 'silent') {
        /* offline — OfflineBanner reflects connectivity */
      } else if (ui.mode === 'reauth') {
        showAlert('Session expired', ui.message);
      } else {
        showAlert('Error', ui.message);
      }
    }
    setCreating(false);
  }

  const handleDeletePost = useCallback(
    (postId: string) => {
      if (!user) return;
      showAlert('Delete Post', 'Remove this hitting partner post?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await api.delete(`/api/hitting-partner/${postId}?userId=${encodeURIComponent(user.id)}`);
            fetchPartners();
          },
        },
      ]);
    },
    [user, fetchPartners]
  );

  const handleMessagePlayer = useCallback(
    (post: HittingPartnerPostWithUser) => {
      router.push({
        pathname: '/(tabs)/messages',
        params: { recipientId: post.userId, recipientName: post.userName },
      });
    },
    [router]
  );

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

  // ── Event signup ──
  const [signupBusyId, setSignupBusyId] = useState<string | null>(null);
  const signupConfirmRef = useRef<string | null>(null);

  useEffect(() => {
    const signupSuccess = paramString(params.signupSuccess);
    const sessionId = paramString(params.session_id);
    if (signupSuccess !== '1' || !user?.id) return;

    if (!sessionId || sessionId === '{CHECKOUT_SESSION_ID}') {
      showAlert('Payment received', 'Refreshing your signup status…');
      void fetchBulletins();
      return;
    }

    if (signupConfirmRef.current === sessionId) return;
    signupConfirmRef.current = sessionId;

    let cancelled = false;
    void (async () => {
      const response = await paymentApi.bulletinBoard.confirmSignupPayment(sessionId);
      if (cancelled) return;
      const payload = unwrapApiPayload<{
        status?: 'confirmed' | 'waitlist';
        waitlistPosition?: number | null;
      }>(response.data);
      if (response.success) {
        showAlert(
          'Signed up',
          response.message ||
            (payload?.status === 'waitlist'
              ? `Payment received — you are on the waitlist (#${payload.waitlistPosition ?? '?'})`
              : 'Payment received — you are signed up!')
        );
      } else {
        showAlert(
          'Signup',
          response.error || 'Payment received but signup could not be confirmed. Contact the club.'
        );
      }
      await fetchBulletins();
    })();

    return () => {
      cancelled = true;
    };
  }, [params.signupSuccess, params.session_id, user?.id]);

  async function handleEventSignup(postId: string, post?: { requirePayment?: boolean; signupAmountCents?: number | null }) {
    setSignupBusyId(postId);
    const urls = bulletinSignupCheckoutUrls(postId);
    const res = await paymentApi.bulletinBoard.signupForDrill(postId, urls);
    const checkoutUrl = res.success ? extractCheckoutUrl(res.data) : null;
    if (checkoutUrl) {
      const opened = await openStripeCheckout(checkoutUrl);
      if (!opened) {
        showAlert('Payment', 'Could not open Stripe checkout. Try again.');
      } else if (isPaidBulletinSignup(post ?? {})) {
        showAlert(
          'Complete payment',
          `Finish card payment (${formatCentsAsUsd(post?.signupAmountCents)}) to complete your signup.`
        );
      }
      setSignupBusyId(null);
      return;
    }
    if (res.success) {
      await fetchBulletins();
      if (res.message) showAlert('Signed Up', res.message);
    } else {
      showAlert('Could not sign up', res.error || 'Please try again.');
    }
    setSignupBusyId(null);
  }

  async function handleCancelEventSignup(postId: string) {
    showAlert('Cancel Signup', 'Remove yourself from this event?', [
      { text: 'Keep Signup', style: 'cancel' },
      {
        text: 'Cancel Signup',
        style: 'destructive',
        onPress: async () => {
          setSignupBusyId(postId);
          const res = await api.delete(`/api/bulletin-board/${postId}/signup`);
          if (res.success) await fetchBulletins();
          else showAlert('Error', res.error || 'Could not cancel signup.');
          setSignupBusyId(null);
        },
      },
    ]);
  }

  function formatDrillDateTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  }

  function genderRestrictionLabel(restriction?: string): string | null {
    if (!restriction || restriction === 'any') return null;
    if (restriction === 'male_only') return 'Men only';
    if (restriction === 'female_only') return 'Women only';
    return null;
  }

  // ── Notifications ──
  const markRead = useCallback(async (notificationId: string) => {
    await api.patch(`/api/notifications/${notificationId}/read`, {});
    fetchNotifications();
  }, [fetchNotifications]);

  const markAllRead = useCallback(async () => {
    if (!user) return;
    await api.patch(`/api/notifications/${user.id}/read-all`, {});
    fetchNotifications();
  }, [user, fetchNotifications]);

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

  const sharePartnerPost = useCallback(async (post: HittingPartnerPostWithUser) => {
    try {
      await Share.share({
        message: `${post.userName} — ${post.description}\n${post.availability}`,
      });
    } catch {
      /* dismissed */
    }
  }, []);

  const toggleSavePartner = useCallback((postId: string) => {
    setSavedPartnerIds(prev => ({ ...prev, [postId]: !prev[postId] }));
  }, []);

  const partnersHeader = useMemo(
    () => (
      <View style={styles.listHeaderBlock}>
        <TouchableOpacity style={styles.createButton} onPress={openCreatePost}>
          <Ionicons name="add-circle" size={20} color={Colors.textInverse} />
          <Text style={styles.createButtonText}>Post Looking for Partner</Text>
        </TouchableOpacity>
        <View style={styles.searchBar}>
          <Ionicons name="search" size={18} color={Colors.textMuted} />
          <Input
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search by name or description..."
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScrollContent}>
          {SKILL_FILTERS.map(level => (
            <TouchableOpacity
              key={level}
              style={[styles.filterChipNew, skillFilter === level && styles.filterChipNewActive]}
              onPress={() => setSkillFilter(level)}
            >
              <Text style={[styles.filterChipNewText, skillFilter === level && styles.filterChipNewTextActive]}>{level}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    ),
    [searchQuery, skillFilter, openCreatePost]
  );

  const renderPartnerItem = useCallback(
    ({ item: post }: { item: HittingPartnerPostWithUser }) => {
      const initials = post.userInitials || getInitials(post.userName);
      const rel = formatRelativeTime(post.postedDate as unknown as string);
      return (
        <Card style={styles.listCardSpacing} padded>
          <View style={styles.postHeader}>
            <View style={[styles.avatar, { backgroundColor: avatarBackgroundForId(post.userId) }]}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.postHeaderText}>
              <View style={styles.nameRow}>
                <Text style={styles.postAuthor} numberOfLines={1}>
                  {post.userName}
                </Text>
                {post.userSkillLevel ? (
                  <View style={styles.skillPill}>
                    <Text style={styles.skillPillInner}>{post.userSkillLevel}</Text>
                  </View>
                ) : null}
              </View>
            </View>
            {post.userId === user?.id ? (
              <View style={styles.ownerActions}>
                <TouchableOpacity onPress={() => openEditPost(post)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="create-outline" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => handleDeletePost(post.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Ionicons name="trash-outline" size={18} color={Colors.error} />
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
          <Text style={styles.postDescription}>{post.description}</Text>
          <View style={styles.postMeta}>
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.metaText}>{post.availability}</Text>
            </View>
            {post.playStyle?.length > 0 ? (
              <View style={styles.metaChip}>
                <Ionicons name="tennisball-outline" size={14} color={Colors.textSecondary} />
                <Text style={styles.metaText}>{post.playStyle.join(', ')}</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.postFooter}>
            <Text style={styles.postDate}>{rel}</Text>
            <View style={styles.actionRow}>
              {post.userId !== user?.id ? (
                <TouchableOpacity style={styles.iconAction} onPress={() => handleMessagePlayer(post)}>
                  <Ionicons name="chatbubble-outline" size={16} color={Colors.textSecondary} />
                  <Text style={styles.iconActionLabel}>Message</Text>
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity style={styles.iconAction} onPress={() => toggleSavePartner(post.id)}>
                <Ionicons
                  name={savedPartnerIds[post.id] ? 'bookmark' : 'bookmark-outline'}
                  size={16}
                  color={savedPartnerIds[post.id] ? Colors.primary : Colors.textSecondary}
                />
                <Text style={styles.iconActionLabel}>Save</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconAction} onPress={() => sharePartnerPost(post)}>
                <Ionicons name="share-outline" size={16} color={Colors.textSecondary} />
                <Text style={styles.iconActionLabel}>Share</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      );
    },
    [user?.id, savedPartnerIds, sharePartnerPost, toggleSavePartner, openEditPost, handleDeletePost, handleMessagePlayer]
  );

  const bulletinHeader = useMemo(
    () => (
      <View style={styles.listHeaderBlock}>
        {isAdmin ? (
          <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateBulletin(true)}>
            <Ionicons name="add-circle" size={20} color={Colors.textInverse} />
            <Text style={styles.createButtonText}>Create Post</Text>
          </TouchableOpacity>
        ) : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScrollContent}>
          {BULLETIN_TYPES.map(type => (
            <TouchableOpacity
              key={type}
              style={[styles.filterChipNew, bulletinFilter === type && styles.filterChipNewActive]}
              onPress={() => setBulletinFilter(type)}
            >
              <Text style={[styles.filterChipNewText, bulletinFilter === type && styles.filterChipNewTextActive]}>
                {BULLETIN_TYPE_LABELS[type] || type}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    ),
    [isAdmin, bulletinFilter]
  );

  const renderBulletinItem = useCallback(
    ({ item: post }: { item: any }) => (
      <Card style={styles.listCardSpacing} padded>
        {post.isPinned ? (
          <View style={styles.pinnedBadge}>
            <Ionicons name="pin" size={12} color={Colors.warning} />
            <Text style={styles.pinnedText}>Pinned</Text>
          </View>
        ) : null}
        <View style={styles.bulletinHeader}>
          <View
            style={[
              styles.categoryBadge,
              { backgroundColor: (BULLETIN_TYPE_COLORS[post.category] || Colors.textMuted) + '15' },
            ]}
          >
            <Text style={[styles.categoryText, { color: BULLETIN_TYPE_COLORS[post.category] || Colors.textMuted }]}>
              {post.category ? post.category.charAt(0).toUpperCase() + post.category.slice(1) : 'Post'}
            </Text>
          </View>
          {post.authorId === user?.id || isAdmin ? (
            <TouchableOpacity onPress={() => handleDeleteBulletin(post.id)}>
              <Ionicons name="trash-outline" size={16} color={Colors.error} />
            </TouchableOpacity>
          ) : null}
        </View>
        <Text style={styles.bulletinTitle}>{post.title}</Text>
        <Text style={styles.bulletinContent} numberOfLines={4}>
          {post.content}
        </Text>
        {SIGNUP_EVENT_CATEGORIES.has(post.category) ? (
          <>
            {post.drillStartAt ? (
              <View style={styles.bulletinEventRow}>
                <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                <Text style={styles.bulletinEventText}>{formatDrillDateTime(post.drillStartAt)}</Text>
              </View>
            ) : null}
            {post.drillCourtName ? (
              <View style={styles.bulletinEventRow}>
                <Ionicons name="tennisball-outline" size={14} color={Colors.primary} />
                <Text style={styles.bulletinEventText}>{post.drillCourtName}</Text>
              </View>
            ) : null}
            {typeof post.drillMaxParticipants === 'number' ? (
              <View style={styles.bulletinEventRow}>
                <Ionicons name="people-outline" size={14} color={Colors.primary} />
                <Text style={styles.bulletinEventText}>
                  {post.drillConfirmedCount || 0} / {post.drillMaxParticipants} signed up
                  {post.drillWaitlistCount > 0 ? ` · ${post.drillWaitlistCount} waitlist` : ''}
                </Text>
              </View>
            ) : null}
            {genderRestrictionLabel(post.drillGenderRestriction) ? (
              <View style={styles.bulletinEventRow}>
                <Ionicons name="person-outline" size={14} color={Colors.primary} />
                <Text style={styles.bulletinEventText}>{genderRestrictionLabel(post.drillGenderRestriction)}</Text>
              </View>
            ) : null}
            {post.currentUserSignupStatus === 'confirmed' ? (
              <View style={styles.drillStatusBadge}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.success} />
                <Text style={[styles.drillStatusText, { color: Colors.success }]}>You're signed up</Text>
              </View>
            ) : null}
            {post.currentUserSignupStatus === 'waitlist' ? (
              <View style={styles.drillStatusBadge}>
                <Ionicons name="time-outline" size={16} color={Colors.warning} />
                <Text style={[styles.drillStatusText, { color: Colors.warning }]}>
                  Waitlist #{post.currentUserWaitlistPosition}
                </Text>
              </View>
            ) : null}
            {post.currentUserSignupStatus ? (
              <TouchableOpacity
                style={[styles.drillButton, styles.drillButtonCancel]}
                onPress={() => handleCancelEventSignup(post.id)}
                disabled={signupBusyId === post.id}
              >
                <Text style={styles.drillButtonCancelText}>{signupBusyId === post.id ? '...' : 'Cancel Signup'}</Text>
              </TouchableOpacity>
            ) : post.currentUserCanSignup ? (
              <TouchableOpacity
                style={styles.drillButton}
                onPress={() => handleEventSignup(post.id, post)}
                disabled={signupBusyId === post.id}
              >
                <Text style={styles.drillButtonText}>
                  {signupBusyId === post.id
                    ? '...'
                    : isPaidBulletinSignup(post)
                      ? `Pay & Sign Up · ${formatCentsAsUsd(post.signupAmountCents)}`
                      : 'Sign Up'}
                </Text>
              </TouchableOpacity>
            ) : post.signupBlockedReason ? (
              <View style={styles.drillBlockedBox}>
                <Ionicons name="lock-closed-outline" size={14} color={Colors.textMuted} />
                <Text style={styles.drillBlockedText}>{post.signupBlockedReason}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            {post.eventDate ? (
              <View style={styles.bulletinEventRow}>
                <Ionicons name="calendar-outline" size={14} color={Colors.primary} />
                <Text style={styles.bulletinEventText}>{formatDate(post.eventDate)}</Text>
                {post.eventTime ? <Text style={styles.bulletinEventText}> at {post.eventTime}</Text> : null}
              </View>
            ) : null}
            {post.location ? (
              <View style={styles.bulletinEventRow}>
                <Ionicons name="location-outline" size={14} color={Colors.primary} />
                <Text style={styles.bulletinEventText}>{post.location}</Text>
              </View>
            ) : null}
            {post.maxParticipants ? (
              <View style={styles.bulletinEventRow}>
                <Ionicons name="people-outline" size={14} color={Colors.primary} />
                <Text style={styles.bulletinEventText}>
                  {post.currentParticipants || 0} / {post.maxParticipants} participants
                </Text>
              </View>
            ) : null}
          </>
        )}
        <Text style={styles.bulletinMeta}>
          {post.authorName || 'Admin'} · {formatBulletinPostProminentDate({ ...post, type: post.category }, 'short')}
        </Text>
      </Card>
    ),
    [user?.id, isAdmin, signupBusyId]
  );

  const notificationsHeader = useMemo(
    () =>
      unreadCount > 0 ? (
        <TouchableOpacity style={styles.markAllRead} onPress={markAllRead}>
          <Text style={styles.markAllReadText}>Mark all as read</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.notifHeaderSpacer} />
      ),
    [unreadCount, markAllRead]
  );

  const renderNotifItem = useCallback(
    ({ item: notif }: { item: any }) => (
      <Card style={[styles.listCardSpacing, !notif.read && styles.notifUnread]} padded={false}>
        <TouchableOpacity
          style={styles.notifCardInner}
          onPress={() => !notif.read && markRead(notif.id)}
          activeOpacity={0.7}
        >
          <View style={styles.notifIcon}>
            <Ionicons name={getNotifIcon(notif.type) as any} size={24} color={getNotifColor(notif.type, notif.read)} />
          </View>
          <View style={styles.notifBody}>
            <Text style={[styles.notifTitle, !notif.read && styles.notifTitleUnread]}>{notif.title}</Text>
            <Text style={styles.notifMessage} numberOfLines={2}>
              {notif.message}
            </Text>
            {notif.relatedReservation ? (
              <View style={styles.notifReservation}>
                <Text style={styles.notifReservationText}>
                  {notif.relatedReservation.courtName} · {formatShortDate(notif.relatedReservation.date)}
                </Text>
              </View>
            ) : null}
            <Text style={styles.notifTime}>{formatRelativeTime(notif.timestamp || notif.createdAt)}</Text>
          </View>
          {!notif.read ? <View style={styles.unreadDot} /> : null}
        </TouchableOpacity>
      </Card>
    ),
    [markRead]
  );

  const partnerEmpty = useMemo(
    () => (
      <EmptyState
        icon="tennisball-outline"
        title={posts.length === 0 ? 'No partner posts yet' : 'No matching posts'}
        description={
          posts.length === 0
            ? 'Be the first to post a partner request at your club.'
            : 'Try adjusting your filters.'
        }
        actionLabel={posts.length === 0 ? 'Post request' : undefined}
        onAction={posts.length === 0 ? openCreatePost : undefined}
      />
    ),
    [posts.length]
  );

  const bulletinEmpty = useMemo(
    () => (
      <EmptyState
        icon="newspaper-outline"
        title={bulletins.length === 0 ? 'No bulletins yet' : 'No matching posts'}
        description={
          bulletins.length === 0
            ? "Your club hasn't posted news this week."
            : 'Try another category filter.'
        }
      />
    ),
    [bulletins.length]
  );

  const notifEmpty = useMemo(
    () => (
      <EmptyState
        icon="notifications-off-outline"
        title="You're all caught up"
        description="No new alerts — we'll notify you when something changes."
      />
    ),
    []
  );

  const listCommon = {
    removeClippedSubviews: Platform.OS === 'android',
    initialNumToRender: 8,
    maxToRenderPerBatch: 8,
    windowSize: 7,
  } as const;

  return (
    <View style={styles.container}>
      <OfflineBanner state={bannerState} cachedAt={lastCachedAt} onRetry={retryConnectivity} />

      <View style={styles.segmentOuter}>
        <View style={styles.segmentPill} onLayout={e => setTabBarWidth(e.nativeEvent.layout.width)}>
          <View style={styles.segmentRow}>
            <TouchableOpacity style={styles.segmentTab} onPress={() => selectTab('partners')}>
              <Ionicons name="tennisball" size={14} color={activeTab === 'partners' ? Colors.primary : Colors.textMuted} />
              <Text style={[styles.segmentTabText, activeTab === 'partners' && styles.segmentTabTextActive]}>Partners</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.segmentTab} onPress={() => selectTab('bulletin')}>
              <Ionicons name="megaphone" size={14} color={activeTab === 'bulletin' ? Colors.primary : Colors.textMuted} />
              <Text style={[styles.segmentTabText, activeTab === 'bulletin' && styles.segmentTabTextActive]}>Bulletin</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.segmentTab} onPress={() => selectTab('notifications')}>
              <Ionicons name="notifications" size={14} color={activeTab === 'notifications' ? Colors.primary : Colors.textMuted} />
              <Text style={[styles.segmentTabText, activeTab === 'notifications' && styles.segmentTabTextActive]}>
                Alerts{unreadCount > 0 ? ` (${unreadCount})` : ''}
              </Text>
            </TouchableOpacity>
          </View>
          {tabBarWidth > 0 ? (
            <View style={styles.underlineTrack}>
              <Animated.View
                style={[
                  styles.tabUnderlineBar,
                  {
                    width: tabBarWidth / 3,
                    transform: [{ translateX: underlineAnim }],
                  },
                ]}
              />
            </View>
          ) : null}
        </View>
      </View>

      {activeTab === 'partners' && loadingPartners && !refreshing ? (
        <View style={styles.tabList}>
          <CommunityListSkeleton />
        </View>
      ) : null}
      {activeTab === 'partners' && !(loadingPartners && !refreshing) ? (
        <FlatList
          style={styles.tabList}
          data={filteredPosts}
          keyExtractor={item => item.id}
          renderItem={renderPartnerItem}
          ListHeaderComponent={partnersHeader}
          ListEmptyComponent={partnerEmpty}
          contentContainerStyle={styles.flatContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          {...listCommon}
        />
      ) : null}

      {activeTab === 'bulletin' && loadingBulletins && !refreshing ? (
        <View style={styles.tabList}>
          <CommunityListSkeleton />
        </View>
      ) : null}
      {activeTab === 'bulletin' && !(loadingBulletins && !refreshing) ? (
        <FlatList
          style={styles.tabList}
          data={filteredBulletins}
          keyExtractor={item => item.id}
          renderItem={renderBulletinItem}
          ListHeaderComponent={bulletinHeader}
          ListEmptyComponent={bulletinEmpty}
          contentContainerStyle={styles.flatContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          {...listCommon}
        />
      ) : null}

      {activeTab === 'notifications' && loadingNotifications && !refreshing ? (
        <View style={styles.tabList}>
          <CommunityListSkeleton />
        </View>
      ) : null}
      {activeTab === 'notifications' && !(loadingNotifications && !refreshing) ? (
        <FlatList
          style={styles.tabList}
          data={notifications}
          keyExtractor={item => item.id}
          renderItem={renderNotifItem}
          ListHeaderComponent={notificationsHeader}
          ListEmptyComponent={notifEmpty}
          contentContainerStyle={styles.flatContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
          {...listCommon}
        />
      ) : null}

      {/* ── Create / Edit Partner Post Modal ── */}
      <Modal visible={showPostModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowPostModal(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeaderSticky}>
            <TouchableOpacity onPress={() => setShowPostModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>{editingPostId ? 'Edit Post' : 'Find a Partner'}</Text>
            <TouchableOpacity onPress={handleSavePost} disabled={creating || !partnerFormValid}>
              <Text
                style={[
                  styles.modalPostCta,
                  (creating || !partnerFormValid) && styles.modalPostCtaDisabled,
                ]}
              >
                {creating ? '...' : editingPostId ? 'Save' : 'Post'}
              </Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalBody} keyboardShouldPersistTaps="handled">
            <Text style={styles.formLabel}>What are you looking for? *</Text>
            <Input
              style={[styles.formInput, styles.formTextArea]}
              value={postDescription}
              onChangeText={setPostDescription}
              placeholder="e.g. Looking for an intermediate player for singles practice..."
              multiline
            />
            {postDescription.trim().length > 0 && postDescription.trim().length < PARTNER_DESCRIPTION_MIN ? (
              <Text style={styles.fieldHint}>At least {PARTNER_DESCRIPTION_MIN} characters</Text>
            ) : null}

            <Text style={styles.formLabel}>Your availability *</Text>
            <Input
              style={styles.formInput}
              value={postAvailability}
              onChangeText={setPostAvailability}
              placeholder="e.g. Weekday evenings, Saturday mornings"
            />
            {!postAvailability.trim() ? <Text style={styles.fieldHintMuted}>Add at least one time window</Text> : null}

            <Text style={styles.formLabel}>Play styles *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScrollContent}>
              {PLAY_STYLE_OPTIONS.map(style => (
                <TouchableOpacity
                  key={style}
                  style={[styles.filterChipNew, postPlayStyles.includes(style) && styles.filterChipNewActive]}
                  onPress={() => togglePlayStyle(style)}
                >
                  <Text
                    style={[styles.filterChipNewText, postPlayStyles.includes(style) && styles.filterChipNewTextActive]}
                  >
                    {style}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {postPlayStyles.length < 1 ? <Text style={styles.fieldHint}>Select at least one play style</Text> : null}

            <Text style={styles.formLabel}>Visible for (days) *</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScrollContent}>
              {EXPIRY_DAY_CHOICES.map(days => (
                <TouchableOpacity
                  key={days}
                  style={[styles.filterChipNew, postExpiresInDays === days && styles.filterChipNewActive]}
                  onPress={() => setPostExpiresInDays(days)}
                >
                  <Text style={[styles.filterChipNewText, postExpiresInDays === days && styles.filterChipNewTextActive]}>
                    {days}d
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {(postExpiresInDays < PARTNER_EXPIRY_MIN_DAYS || postExpiresInDays > PARTNER_EXPIRY_MAX_DAYS) ? (
              <Text style={styles.fieldHint}>
                Expiry must be between {PARTNER_EXPIRY_MIN_DAYS} and {PARTNER_EXPIRY_MAX_DAYS} days
              </Text>
            ) : null}
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
            <Input style={styles.formInput} value={bulletinTitle} onChangeText={setBulletinTitle} placeholder="Post title" />

            <Text style={styles.formLabel}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.bulletinCategoryScroll}>
              <View style={styles.filterRow}>
                {BULLETIN_TYPES.filter(t => t !== 'All' && t !== 'drill').map(type => (
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
            <Input
              style={[styles.formInput, styles.formTextArea]}
              value={bulletinContent}
              onChangeText={setBulletinContent}
              placeholder="Write your announcement..."
              multiline
            />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },

  segmentOuter: {
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.sm,
    paddingBottom: Spacing.xs,
    backgroundColor: Colors.surface,
  },
  segmentPill: {
    backgroundColor: Colors.card,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  segmentRow: { flexDirection: 'row' },
  segmentTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
    paddingVertical: Spacing.sm,
    minHeight: TouchTarget.min - 8,
  },
  segmentTabText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textMuted },
  segmentTabTextActive: { color: Colors.primary },
  underlineTrack: {
    height: 2,
    backgroundColor: Colors.borderLight,
    position: 'relative',
  },
  tabUnderlineBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    height: 2,
    backgroundColor: Colors.primary,
  },

  tabList: { flex: 1 },
  flatContent: { paddingHorizontal: Spacing.md, paddingBottom: Spacing.xxl, flexGrow: 1 },
  listHeaderBlock: { paddingTop: Spacing.md, paddingBottom: Spacing.sm },
  listCardSpacing: { marginBottom: Spacing.sm },
  chipScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm + Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  filterChipNew: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    justifyContent: 'center',
  },
  filterChipNewActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  filterChipNewText: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary },
  filterChipNewTextActive: { color: Colors.textInverse },

  skeletonList: { paddingHorizontal: Spacing.md, paddingTop: Spacing.md, gap: Spacing.sm },
  skeletonCard: { marginBottom: Spacing.sm },
  skeletonRow: { flexDirection: 'row', gap: Spacing.md },

  // Create Button
  createButton: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: 12, minHeight: TouchTarget.min, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, marginBottom: Spacing.md },
  createButtonText: { color: Colors.textInverse, fontSize: FontSize.md, fontWeight: '600' },

  // Search & Filters
  searchBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.card, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, marginBottom: Spacing.sm, borderWidth: 1, borderColor: Colors.border, gap: Spacing.sm },
  searchInput: { flex: 1, fontSize: FontSize.sm, color: Colors.text, paddingVertical: 0 },
  filterRow: { flexDirection: 'row', gap: Spacing.sm },
  filterChip: { paddingHorizontal: Spacing.md, paddingVertical: Spacing.sm, minHeight: TouchTarget.min, borderRadius: BorderRadius.full, backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.border, justifyContent: 'center' },
  filterChipActive: { backgroundColor: Colors.primary + '15', borderColor: Colors.primary },
  filterChipText: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '600' },
  filterChipTextActive: { color: Colors.primary },
  bulletinCategoryScroll: { marginBottom: Spacing.md },

  // Partner Posts
  postHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginBottom: Spacing.sm },
  postHeaderText: { flex: 1, minWidth: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: Spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: Colors.textInverse, fontSize: FontSize.sm, fontWeight: '700' },
  postAuthor: { fontSize: FontSize.md, fontWeight: '600', color: Colors.text, flexShrink: 1 },
  skillPill: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.secondary,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  skillPillInner: { fontSize: FontSize.xs, fontWeight: '600', color: Colors.textSecondary, textTransform: 'capitalize' },
  ownerActions: { flexDirection: 'row', gap: Spacing.sm },
  postDescription: { fontSize: FontSize.sm, color: Colors.text, lineHeight: 22, marginBottom: Spacing.sm },
  postMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.sm },
  metaChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.surface, paddingHorizontal: Spacing.sm, paddingVertical: 4, borderRadius: BorderRadius.full },
  metaText: { fontSize: FontSize.xs, color: Colors.textSecondary },
  postFooter: { flexDirection: 'column', gap: Spacing.sm },
  postDate: { fontSize: FontSize.xs, color: Colors.textMuted },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.lg },
  iconAction: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  iconActionLabel: { fontSize: FontSize.xs, color: Colors.textSecondary, fontWeight: '500' },

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

  // Drill signups
  drillStatusBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: Spacing.sm },
  drillStatusText: { fontSize: FontSize.sm, fontWeight: '600' },
  drillButton: { backgroundColor: Colors.primary, borderRadius: BorderRadius.md, paddingVertical: 10, minHeight: TouchTarget.min, alignItems: 'center', justifyContent: 'center', marginTop: Spacing.sm },
  drillButtonText: { color: Colors.textInverse, fontSize: FontSize.sm, fontWeight: '700' },
  drillButtonCancel: { backgroundColor: Colors.card, borderWidth: 1, borderColor: Colors.error },
  drillButtonCancelText: { color: Colors.error, fontSize: FontSize.sm, fontWeight: '700' },
  drillBlockedBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: Colors.surface, padding: Spacing.sm, borderRadius: BorderRadius.sm, marginTop: Spacing.sm },
  drillBlockedText: { flex: 1, fontSize: FontSize.xs, color: Colors.textMuted },

  // Notifications
  notifHeaderSpacer: { height: Spacing.xs },
  markAllRead: { alignSelf: 'flex-end', marginBottom: Spacing.sm, marginHorizontal: Spacing.md },
  markAllReadText: { color: Colors.primary, fontSize: FontSize.sm, fontWeight: '600' },
  notifCardInner: {
    flexDirection: 'row',
    padding: Spacing.md,
    alignItems: 'flex-start',
    gap: Spacing.sm,
  },
  notifUnread: { backgroundColor: Colors.primary + '08', borderLeftWidth: 3, borderLeftColor: Colors.primary },
  notifBody: { flex: 1, minWidth: 0 },
  notifIcon: { marginTop: 2 },
  notifTitle: { fontSize: FontSize.sm, fontWeight: '500', color: Colors.text },
  notifTitleUnread: { fontWeight: '700' },
  notifMessage: { fontSize: FontSize.sm, color: Colors.textSecondary, marginTop: 2, lineHeight: 20 },
  notifReservation: { backgroundColor: Colors.surface, borderRadius: BorderRadius.sm, paddingHorizontal: Spacing.sm, paddingVertical: 2, marginTop: 4, alignSelf: 'flex-start' },
  notifReservationText: { fontSize: FontSize.xs, color: Colors.primary, fontWeight: '500' },
  notifTime: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: 4 },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.primary, marginTop: 6 },

  // Modal
  modalContainer: { flex: 1, backgroundColor: Colors.surface },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.md, borderBottomWidth: 1, borderBottomColor: Colors.border },
  modalHeaderSticky: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  modalCancel: { color: Colors.textSecondary, fontSize: FontSize.md },
  modalTitle: { fontSize: FontSize.lg, fontWeight: '700', color: Colors.text },
  modalSave: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },
  modalPostCta: { color: Colors.primary, fontSize: FontSize.md, fontWeight: '700' },
  modalPostCtaDisabled: { color: Colors.textMuted },
  modalBody: { flex: 1, padding: Spacing.md },
  formLabel: { fontSize: FontSize.sm, fontWeight: '600', color: Colors.text, marginBottom: Spacing.xs, marginTop: Spacing.md },
  formInput: { borderWidth: 1, borderColor: Colors.border, borderRadius: BorderRadius.md, paddingHorizontal: Spacing.md, paddingVertical: 12, fontSize: FontSize.md, color: Colors.text, backgroundColor: Colors.surface },
  formTextArea: { height: 100, textAlignVertical: 'top' },
  fieldHint: { fontSize: FontSize.xs, color: Colors.error, marginTop: Spacing.xs },
  fieldHintMuted: { fontSize: FontSize.xs, color: Colors.textMuted, marginTop: Spacing.xs },
  playStyleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: Spacing.sm },
});
