/**
 * Database Entity Types
 * TypeScript interfaces matching the PostgreSQL schema
 */

import type {
  Booking,
  Court,
  Facility,
  OpeningHours,
  PartnerPost as SharedPartnerPost,
  User,
} from '../../shared/types';

export type { Booking, Court, Facility, User };

// =====================================================
// USERS & AUTHENTICATION
// =====================================================

export interface UserPreferences {
  userId: string;
  notifications: boolean;
  timezone: string;
  theme: string;
  updatedAt: Date;
}

// =====================================================
// MEMBERSHIPS
// =====================================================

export interface FacilityMembership {
  id: string;
  userId: string;
  facilityId: string;
  membershipType?: string;
  status: 'active' | 'pending' | 'expired' | 'suspended';
  startDate: Date;
  endDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// BOOKINGS
// =====================================================

// =====================================================
// HITTING PARTNER POSTS
// =====================================================

export interface HittingPartnerPost extends SharedPartnerPost {}

// =====================================================
// BULLETIN BOARD
// =====================================================

export interface BulletinPost {
  id: string;
  facilityId: string;
  authorId: string;
  title: string;
  content: string;
  category?: string;
  drillStartAt?: Date;
  drillCourtId?: string;
  drillMaxParticipants?: number;
  minParticipants?: number;
  cancelIfMinNotMet?: boolean;
  drillGenderRestriction?: 'any' | 'male_only' | 'female_only';
  drillShowParticipants?: boolean;
  isPinned: boolean;
  isAdminPost: boolean;
  postedDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BulletinDrillSignup {
  id: string;
  bulletinPostId: string;
  userId: string;
  status: 'confirmed' | 'waitlist';
  waitlistPosition?: number;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// EVENTS
// =====================================================

export interface Event {
  id: string;
  facilityId: string;
  title: string;
  description?: string;
  eventType?: string;
  startDate: Date;
  endDate?: Date;
  startTime?: string;
  endTime?: string;
  maxParticipants?: number;
  currentParticipants: number;
  registrationDeadline?: Date;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface EventParticipant {
  id: string;
  eventId: string;
  userId: string;
  registrationDate: Date;
  status: 'registered' | 'waitlist' | 'cancelled';
}

// =====================================================
// LEAGUES & RANKINGS
// =====================================================

export interface League {
  id: string;
  facilityId: string;
  name: string;
  description?: string;
  leagueType?: string;
  skillLevel?: string;
  startDate: Date;
  endDate?: Date;
  status: 'active' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

export interface LeagueParticipant {
  id: string;
  leagueId: string;
  userId: string;
  wins: number;
  losses: number;
  points: number;
  ranking?: number;
  joinedDate: Date;
}

// =====================================================
// PLAYER PROFILES
// =====================================================

export interface PlayerProfile {
  userId: string;
  skillLevel?: string; // Beginner, Intermediate, Advanced, Professional
  ustaRating?: string; // USTA/NTRP rating (e.g., "3.0", "3.5", "4.0", etc.)
  bio?: string;
  profileImageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// NOTIFICATIONS
// =====================================================

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type?: string;
  isRead: boolean;
  actionUrl?: string;
  createdAt: Date;
}

// =====================================================
// MESSAGES
// =====================================================

export interface Conversation {
  id: string;
  participant1Id: string;
  participant2Id: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  messageText: string;
  isRead: boolean;
  createdAt: Date;
}

// =====================================================
// ANALYTICS
// =====================================================

export interface BookingAnalytics {
  id: string;
  facilityId: string;
  courtId?: string;
  bookingDate: Date;
  totalBookings: number;
  totalHours: number;
  peakHours?: Record<string, number>;
  createdAt: Date;
}

export interface FacilityUsageStats {
  id: string;
  facilityId: string;
  statDate: Date;
  totalMembers: number;
  activeMembers: number;
  newMembers: number;
  totalBookings: number;
  totalHoursBooked: number;
  revenue: number;
  createdAt: Date;
}

// =====================================================
// TERMS & CONDITIONS
// =====================================================

export interface FacilityTermsConditionsVersion {
  id: string;
  facilityId: string;
  versionNumber: number;
  contentHtml: string;
  publishedAt: Date;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MemberTermsAcceptance {
  id: string;
  userId: string;
  facilityId: string;
  termsVersionId: string;
  versionNumber: number;
  acceptedAt: Date;
  ipAddress?: string;
  createdAt: Date;
}

// =====================================================
// QUERY RESULT TYPES (with joins)
// =====================================================

export interface BookingWithDetails extends Booking {
  courtName: string;
  courtNumber?: number;
  facilityName: string;
  userName: string;
  userEmail: string;
}

export interface HittingPartnerPostWithUser extends HittingPartnerPost {
  userName: string;
  userInitials: string;
  userSkillLevel?: string;
  memberFacilities: string[];
}

export interface BulletinPostWithAuthor extends BulletinPost {
  authorName: string;
  authorInitials: string;
}

export interface EventWithDetails extends Event {
  facilityName: string;
  creatorName?: string;
  participantCount: number;
}
