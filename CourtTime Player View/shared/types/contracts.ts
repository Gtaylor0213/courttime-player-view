export type Id = string;

export interface OpeningHoursRange {
  open: string;
  close: string;
  closed?: boolean;
}

export type OpeningHours = Record<string, OpeningHoursRange>;

/** Alias for facility weekly schedules (matches DB naming). */
export type OperatingHours = OpeningHours;

export interface Facility {
  id: Id;
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
  operatingHours?: OpeningHours;
  generalRules?: string;
  bookingRules?: string;
  status?: "active" | "pending" | "suspended" | "closed";
  logoUrl?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface Court {
  id: Id;
  facilityId: Id;
  name: string;
  courtNumber?: number;
  surfaceType?: "Hard" | "Clay" | "Grass" | "Synthetic";
  /** Preset (Tennis, Pickleball, Dual Purpose) or facility-defined label (e.g. Clubhouse). */
  courtType?: string;
  isIndoor: boolean;
  hasLights: boolean;
  isWalkUp?: boolean;
  status: "available" | "maintenance" | "closed";
  /** Stripe Connect: court booking fee (cents). */
  requirePayment?: boolean;
  bookingAmountCents?: number | null;
  /** Guest fee (cents), independent of requirePayment. */
  guestFeeCents?: number | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface Booking {
  id: Id;
  courtId: Id;
  userId: Id;
  facilityId: Id;
  bookingDate: Date | string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: "confirmed" | "pending" | "cancelled" | "completed";
  bookingType?: string;
  notes?: string;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface User {
  id: Id;
  email: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  gender?: "male" | "female" | "other" | "prefer_not_to_say" | null;
  address?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  phone?: string;
  userType: "player" | "admin";
  /** Server-side only in practice; omitted from mobile payloads. */
  passwordHash?: string;
  isSuperAdmin?: boolean;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface PartnerPost {
  id: Id;
  userId: Id;
  facilityId: Id;
  skillLevel?: string;
  availability: string;
  playStyle: string[];
  description: string;
  postedDate: Date | string;
  expiresAt: Date | string;
  status: "active" | "expired" | "deleted";
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export interface AuthUserShape {
  id: Id;
  email: string;
  fullName: string;
  firstName?: string;
  lastName?: string;
  userType: "player" | "admin";
  memberFacilities: Id[];
  adminFacilities: Id[];
}

export interface AuthResponseShape {
  token: string;
  user: AuthUserShape;
}
