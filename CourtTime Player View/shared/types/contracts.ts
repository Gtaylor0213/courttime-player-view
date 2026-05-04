export type Id = string;

export interface OpeningHoursRange {
  open: string;
  close: string;
  closed?: boolean;
}

export type OpeningHours = Record<string, OpeningHoursRange>;

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
  cancellationPolicy?: string;
  bookingRules?: string;
  status?: "active" | "pending" | "suspended" | "closed";
  logoUrl?: string;
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
