/**
 * Database Entity Types
 * Shared types matching the web app's PostgreSQL schema
 * Player-facing subset only (no admin-specific types)
 */

import type {
  Booking,
  Court,
  Facility,
  OpeningHours,
  PartnerPost as SharedPartnerPost,
  User,
} from '../../../shared/types';

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

export interface BookingWithDetails extends Booking {
  courtName: string;
  courtNumber?: number;
  facilityName: string;
  userName: string;
  userEmail: string;
}

// =====================================================
// HITTING PARTNER POSTS
// =====================================================

export interface HittingPartnerPost extends SharedPartnerPost {}

export interface HittingPartnerPostWithUser extends HittingPartnerPost {
  userName: string;
  userInitials: string;
  userSkillLevel?: string;
  memberFacilities: string[];
}

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
  minParticipants?: number;
  cancelIfMinNotMet?: boolean;
  isPinned: boolean;
  isAdminPost: boolean;
  postedDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BulletinPostWithAuthor extends BulletinPost {
  authorName: string;
  authorInitials: string;
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

// =====================================================
// PLAYER PROFILES
// =====================================================

export interface PlayerProfile {
  userId: string;
  skillLevel?: string;
  ustaRating?: string;
  bio?: string;
  profileImageUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

// =====================================================
// NOTIFICATIONS & MESSAGES
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
