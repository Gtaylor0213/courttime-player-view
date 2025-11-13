/**
 * Database Entity Types
 * TypeScript interfaces matching the PostgreSQL schema
 */

// =====================================================
// USERS & AUTHENTICATION
// =====================================================

export interface User {
  id: string;
  email: string;
  passwordHash?: string; // Only used server-side
  fullName: string;
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
  phone?: string;
  email?: string;
  description?: string;
  amenities?: string[];
  operatingHours?: Record<string, { open: string; close: string }>;
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
  startTime: string; // Time format: HH:MM:SS
  endTime: string;
  durationMinutes: number;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed';
  bookingType?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
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
  skillLevel?: string;
  ntrpRating?: number;
  playingHand?: 'Right' | 'Left' | 'Both';
  playingStyle?: string;
  preferredCourtSurface?: string;
  bio?: string;
  profileImageUrl?: string;
  yearsPlaying?: number;
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
