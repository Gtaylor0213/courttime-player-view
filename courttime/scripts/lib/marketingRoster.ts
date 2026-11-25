/**
 * Fictional members that scripts/seed-marketing-demo.ts adds to the CourtTime
 * Demo Club. Every address is @courttimeapp.com and every name is made up.
 *
 * Kept in its own module so `npm run seed:review -- --remove` can delete these
 * accounts too.
 */

export interface MarketingMember {
  /** Stable key the seed script uses to refer to this person. */
  key: string;
  email: string;
  name: string;
  skill: string;
  bio: string;
  /** Days before today that the membership started. */
  joinedDaysAgo: number;
  /** Street address on the profile; admin Households groups members by it. */
  street: string;
  /** 'pending' shows up as a membership request in member management. */
  status?: 'active' | 'pending';
  role?: 'coach' | 'junior';
  household?: string;
  householdPrimary?: boolean;
}

export const MARKETING_MEMBERS: MarketingMember[] = [
  { key: 'natalie', street: '61 Cedar Hollow Rd', email: 'demo.natalie@courttimeapp.com', name: 'Natalie Brooks', skill: '5.0', role: 'coach', joinedDaysAgo: 610,
    bio: 'Head pro. Private lessons, cardio tennis and junior clinics.' },
  { key: 'priya', street: '14 Magnolia Walk', email: 'demo.priya@courttimeapp.com', name: 'Priya Raman', skill: '4.0', joinedDaysAgo: 420,
    bio: 'Doubles player, usually on court after work. Always up for a hit.' },
  { key: 'marcus', street: '305 Ridgecrest Dr', email: 'demo.marcus@courttimeapp.com', name: 'Marcus Johnson', skill: '4.0', joinedDaysAgo: 380,
    bio: 'Big serve, questionable volleys. Captain of the Tuesday league team.' },
  { key: 'sofia', street: '88 Briar Glen Ct', email: 'demo.sofia@courttimeapp.com', name: 'Sofia Alvarez', skill: '3.5', joinedDaysAgo: 300,
    bio: 'Weekend doubles and the occasional ball machine session.' },
  { key: 'david', street: '42 Willow Bend Ct', email: 'demo.david@courttimeapp.com', name: 'David Chen', skill: '4.5', household: 'Chen-Wong Household', householdPrimary: true, joinedDaysAgo: 540,
    bio: 'Singles grinder. Happy to play anyone who likes long rallies.' },
  { key: 'meilin', street: '42 Willow Bend Ct', email: 'demo.meilin@courttimeapp.com', name: 'Mei Lin Wong', skill: '3.5', household: 'Chen-Wong Household', joinedDaysAgo: 540,
    bio: 'Pickleball convert, still sneaking in tennis on Sundays.' },
  { key: 'aisha', street: '7 Foxtail Ln', email: 'demo.aisha@courttimeapp.com', name: 'Aisha Bello', skill: '3.5', joinedDaysAgo: 150,
    bio: 'Back on court after ten years off. Working on my backhand.' },
  { key: 'tom', street: '219 Old Mill Rd', email: 'demo.tom@courttimeapp.com', name: 'Tom Gallagher', skill: '3.0', joinedDaysAgo: 90,
    bio: 'Early mornings before work. Coffee after.' },
  { key: 'carlos', street: '3 Sparrow Pt', email: 'demo.carlos@courttimeapp.com', name: 'Carlos Mendoza', skill: '4.0', joinedDaysAgo: 260,
    bio: 'Pickleball most nights, tennis when someone twists my arm.' },
  { key: 'hannah', street: '150 Bramblewood Way', email: 'demo.hannah@courttimeapp.com', name: 'Hannah Schultz', skill: '3.5', joinedDaysAgo: 200,
    bio: 'Pickleball open play regular. Bring your paddle!' },
  { key: 'kwame', street: '26 Hidden Creek Dr', email: 'demo.kwame@courttimeapp.com', name: 'Kwame Mensah', skill: '4.0', joinedDaysAgo: 330,
    bio: 'Lefty. Doubles strategy nerd.' },
  { key: 'elena', street: '71 Lantern Ct', email: 'demo.elena@courttimeapp.com', name: 'Elena Petrova', skill: '4.0', joinedDaysAgo: 18,
    bio: 'New to the neighborhood and looking for regular singles.' },
  { key: 'ben', street: '402 Stonebridge Pkwy', email: 'demo.ben@courttimeapp.com', name: 'Ben Carter', skill: '3.0', joinedDaysAgo: 12,
    bio: 'Learning the game with my coworkers. Evenings only.' },
  { key: 'chidi', street: '118 Brookhaven Ln', email: 'demo.chidi@courttimeapp.com', name: 'Chidi Okafor', skill: '3.5', household: 'Okafor Family', householdPrimary: true, joinedDaysAgo: 470,
    bio: 'Weekend doubles and court-side dad for two juniors.' },
  { key: 'grace', street: '118 Brookhaven Ln', email: 'demo.grace@courttimeapp.com', name: 'Grace Okafor', skill: '3.5', household: 'Okafor Family', joinedDaysAgo: 470,
    bio: 'Wednesday morning doubles group.' },
  { key: 'ada', street: '118 Brookhaven Ln', email: 'demo.ada@courttimeapp.com', name: 'Ada Okafor', skill: '3.0', role: 'junior', household: 'Okafor Family', joinedDaysAgo: 470,
    bio: 'Junior player, 14.' },
  { key: 'tobi', street: '118 Brookhaven Ln', email: 'demo.tobi@courttimeapp.com', name: 'Tobi Okafor', skill: '2.5', role: 'junior', household: 'Okafor Family', joinedDaysAgo: 8,
    bio: 'Junior player, 11. Just started lessons.' },
  { key: 'ryan', street: '9 Aspen Trace', email: 'demo.ryan@courttimeapp.com', name: "Ryan O'Neill", skill: '3.5', status: 'pending', joinedDaysAgo: 1,
    bio: 'Just moved in. Looking forward to meeting everyone.' },
  { key: 'fatima', street: '55 Larkspur Ln', email: 'demo.fatima@courttimeapp.com', name: 'Fatima Haddad', skill: '4.0', status: 'pending', joinedDaysAgo: 2,
    bio: 'Former college player getting back into it.' },
];

export const HOUSEHOLDS = [
  { name: 'Okafor Family', street: '118 Brookhaven Ln', maxMembers: 6 },
  { name: 'Chen-Wong Household', street: '42 Willow Bend Ct', maxMembers: 4 },
];
