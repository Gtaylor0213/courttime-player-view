# Player CRUD Full Database Integration - Implementation Guide

## Overview
This document outlines the complete implementation for removing all dummy data and ensuring full CRUD functionality for players from registration through profile management, all backed by the PostgreSQL database.

## Backend Services Created ✅

### 1. Player Profile Service
**File**: `src/services/playerProfileService.ts`
- `getPlayerProfile(userId)` - Get profile with facility memberships
- `updatePlayerProfile(userId, updates)` - Update profile fields
- `requestFacilityMembership(userId, facilityId, membershipType)` - Request to join facility
- `getUserBookings(userId, upcoming)` - Get user's court bookings

### 2. Hitting Partner Service
**File**: `src/services/hittingPartnerService.ts`
- `getFacilityHittingPartnerPosts(facilityId)` - Get posts for a facility
- `getAllHittingPartnerPosts()` - Get all posts (for users with no facility)
- `createHittingPartnerPost(data)` - Create new post
- `updateHittingPartnerPost(postId, userId, updates)` - Update post
- `deleteHittingPartnerPost(postId, userId)` - Delete post
- `getUserHittingPartnerPosts(userId)` - Get user's own posts

### 3. Bulletin Board Service
**File**: `src/services/bulletinBoardService.ts`
- `getFacilityBulletinPosts(facilityId)` - Get posts for facility
- `createBulletinPost(data)` - Create new post
- `updateBulletinPost(postId, authorId, updates)` - Update post
- `deleteBulletinPost(postId, authorId)` - Delete post
- `togglePinBulletinPost(postId, facilityId, isPinned)` - Pin/unpin (admin)

## API Routes Created ✅

### 1. Player Profile Routes
**File**: `server/routes/playerProfile.ts`
- `GET /api/player-profile/:userId` - Get profile
- `PATCH /api/player-profile/:userId` - Update profile
- `POST /api/player-profile/:userId/request-membership` - Request facility membership
- `GET /api/player-profile/:userId/bookings` - Get bookings

### 2. Hitting Partner Routes
**File**: `server/routes/hittingPartner.ts`
- `GET /api/hitting-partner` - Get all posts
- `GET /api/hitting-partner/facility/:facilityId` - Get facility posts
- `GET /api/hitting-partner/user/:userId` - Get user's posts
- `POST /api/hitting-partner` - Create post
- `PATCH /api/hitting-partner/:postId` - Update post
- `DELETE /api/hitting-partner/:postId` - Delete post

### 3. Bulletin Board Routes
**File**: `server/routes/bulletinBoard.ts`
- `GET /api/bulletin-board/:facilityId` - Get posts
- `POST /api/bulletin-board` - Create post
- `PATCH /api/bulletin-board/:postId` - Update post
- `DELETE /api/bulletin-board/:postId` - Delete post
- `PUT /api/bulletin-board/:postId/pin` - Pin/unpin post

## Frontend Components To Update

### Priority 1: Core Player Components

#### 1. PlayerProfile.tsx
**Current State**: Has hardcoded dummy data (John Doe, etc.)
**Required Changes**:
- Remove all dummy data in useState
- Add useAuth to get current user
- Add useEffect to fetch profile on mount using `/api/player-profile/:userId`
- Update handleSave to call `/api/player-profile/:userId` PATCH endpoint
- Add "Request Membership" section with facility search
- Replace hardcoded facilities list with `/api/facilities/search` API call
- Add facility membership request functionality
- Show user's current facility memberships from profile data

#### 2. PlayerDashboard.tsx
**Current State**: Has hardcoded upcomingReservations array
**Required Changes**:
- Remove upcomingReservations dummy data
- Add useAuth to get current user ID
- Add useEffect to fetch bookings using `/api/player-profile/:userId/bookings?upcoming=true`
- Display "No upcoming bookings" when empty
- If user has no facility memberships, show simplified dashboard with message to request membership

#### 3. FindHittingPartner.tsx
**Current State**: Has large samplePosts array with dummy data
**Required Changes**:
- Remove all sample posts
- Add useAuth to get current user
- Add useEffect to fetch posts based on user's facility
- If user has facility: call `/api/hitting-partner/facility/:facilityId`
- If user has NO facility: call `/api/hitting-partner` (all posts)
- Implement create post functionality using `/api/hitting-partner` POST
- Add edit/delete for user's own posts
- Show "No hitting partner posts yet" when empty

#### 4. ClubInfo.tsx & BulletinBoard.tsx
**Current State**: Likely has dummy bulletin board posts
**Required Changes**:
- Remove dummy posts
- Fetch posts using `/api/bulletin-board/:facilityId`
- Implement create post functionality
- Show "No posts" message when empty
- If user has no facility, show message "Join a facility to see club information"

#### 5. UserRegistration.tsx
**Current State**: Has mock facility search results
**Required Changes**:
- Replace mockFacilities with real `/api/facilities/search?q=` call
- Allow registration with NO facility selected (optional)
- If no facilities selected, create account but skip membership creation
- Show message during registration: "You can request facility membership later from your profile"

### Priority 2: Supporting Components

#### 6. UnifiedSidebar.tsx
**Needs Check**: May need updates to handle no-facility state
- Disable facility-specific menu items if user has no memberships
- Show indicator when user needs to request membership

### Priority 3: New Component - NoFacilityView

Create: `src/components/NoFacilityView.tsx`
**Purpose**: Show when user has no facility memberships
**Features**:
- Welcome message
- Explanation of facility memberships
- Button to "Browse Facilities"
- Links to request membership from profile

## API Client Updates

**File**: `src/api/client.ts`

Add new exports:

```typescript
// Player Profile API
export const playerProfileApi = {
  getProfile: async (userId: string) => { ... },
  updateProfile: async (userId: string, updates: any) => { ... },
  requestMembership: async (userId: string, facilityId: string, membershipType?: string) => { ... },
  getBookings: async (userId: string, upcoming?: boolean) => { ... }
};

// Hitting Partner API
export const hittingPartnerApi = {
  getAll: async () => { ... },
  getByFacility: async (facilityId: string) => { ... },
  getUserPosts: async (userId: string) => { ... },
  create: async (data: any) => { ... },
  update: async (postId: string, userId: string, updates: any) => { ... },
  delete: async (postId: string, userId: string) => { ... }
};

// Bulletin Board API
export const bulletinBoardApi = {
  getPosts: async (facilityId: string) => { ... },
  create: async (data: any) => { ... },
  update: async (postId: string, authorId: string, updates: any) => { ... },
  delete: async (postId: string, authorId: string) => { ... },
  togglePin: async (postId: string, facilityId: string, isPinned: boolean) => { ... }
};
```

## Implementation Order

1. ✅ Create backend services (DONE)
2. ✅ Create API routes (DONE)
3. ✅ Update server/index.ts with routes (DONE)
4. ⏳ Update src/api/client.ts with new API methods
5. ⏳ Update PlayerProfile.tsx with database integration
6. ⏳ Update PlayerDashboard.tsx with database integration
7. ⏳ Update FindHittingPartner.tsx with database integration
8. ⏳ Update ClubInfo/BulletinBoard.tsx with database integration
9. ⏳ Update UserRegistration.tsx to allow no-facility registration
10. ⏳ Create NoFacilityView.tsx component
11. ⏳ Test complete lifecycle

## Testing Checklist

### Registration Flow
- [ ] Register new user WITHOUT selecting any facility
- [ ] Register new user WITH facility selection
- [ ] Verify user can login after registration

### Profile Management
- [ ] View profile shows correct user data from database
- [ ] Update profile fields (skill level, bio, etc.)
- [ ] Request membership to additional facility
- [ ] See pending membership requests in profile

### No-Facility Experience
- [ ] User with no facility sees appropriate messaging
- [ ] Hitting partner page shows all posts (not just facility-specific)
- [ ] Dashboard shows simplified view with "request membership" prompt
- [ ] ClubInfo shows "join a facility" message

### With-Facility Experience
- [ ] Dashboard shows real bookings from database
- [ ] Hitting partner shows facility-specific posts
- [ ] Can create hitting partner post
- [ ] Can edit/delete own hitting partner posts
- [ ] Bulletin board shows facility posts
- [ ] Can create bulletin board post

### Data Validation
- [ ] No dummy data visible anywhere
- [ ] Empty states show appropriate messages
- [ ] All data comes from PostgreSQL database
- [ ] Changes persist after page refresh

## Database Schema Verification

Ensure these tables exist and are properly configured:
- ✅ users
- ✅ player_profiles
- ✅ facilities
- ✅ facility_memberships (with is_facility_admin field)
- ✅ courts
- ✅ bookings
- ✅ hitting_partner_posts
- ✅ bulletin_posts
- ✅ user_preferences

## Next Steps

The backend is complete. Now we need to:
1. Update frontend API client
2. Update each component to remove dummy data and use real APIs
3. Test the complete player lifecycle
4. Handle edge cases (no facility, pending membership, etc.)

This is a significant refactoring but will result in a fully functional, database-backed player management system.
