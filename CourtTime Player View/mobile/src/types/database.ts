/**
 * Database Entity Types
 * Shared types matching the web app's PostgreSQL schema
 * Player-facing subset only (no admin-specific types)
 */

// =====================================================
// USERS & AUTHENTICATION
// =====================================================

export interface User {
  id: string;
  email: string;
  fullName: string;
  firstName: string;
  lastName: string;
  address?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  userType: 'player' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}

export interface UserPreferences {
  userId: string;
  notifications: boolean;
  timezone: string;
  theme: string;
  updatedAt: Date;
}

// =====================================================
// FACILITIES & COURTS
// =====================================================

export interface Facility {
  id: string;
  name: string;
  type?: string;
  address?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  email?: string;
  contactName?: string;
  description?: string;
  amenities?: string[];
  operatingHours?: Record<string, { open: string; close: string; closed?: boolean }>;
  generalRules?: string;
  cancellationPolicy?: string;
  bookingRules?: string;
  status?: 'active' | 'pending' | 'suspended' | 'closed';
  logoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Court {
  id: string;
  facilityId: string;
  name: string;
  courtNumber?: number;
  surfaceType?: 'Hard' | 'Clay' | 'Grass' | 'Synthetic';
  courtType?: 'Tennis' | 'Pickleball' | 'Dual';
  isIndoor: boolean;
  hasLights: boolean;
  status: 'available' | 'maintenance' | 'closed';
  createdAt: Date;
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

export interface Booking {
  id: string;
  courtId: string;
  userId: string;
  facilityId: string;
  bookingDate: Date;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed';
  bookingType?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

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

export interface HittingPartnerPost {
  id: string;
  userId: string;
  facilityId: string;
  skillLevel?: string;
  availability: string;
  playStyle: string[];
  description: string;
  postedDate: Date;
  expiresAt: Date;
  status: 'active' | 'expired' | 'deleted';
  createdAt: Date;
  updatedAt: Date;
}

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
