/**
 * Fill the CourtTime Demo Club with a busy, realistic (and entirely fictional)
 * club for marketing screenshots.
 *
 * Builds on scripts/seed-review-account.ts: run that once first so the demo
 * facility and the two reviewer logins exist. This script never creates the
 * facility, never touches another facility, and never changes either
 * reviewer login's password.
 *
 *   npm run seed:marketing              # dry run: prints what it would write
 *   npm run seed:marketing -- --apply   # write it (one transaction)
 *   npm run seed:marketing -- --remove  # delete the demo club and every demo account
 *
 * Nothing here notifies anyone. Rows go straight into the database (no email,
 * push or Stripe), and the production server's background sweeps are kept off
 * the seeded rows:
 *  - booking reminders: every booking is stamped reminder_sent_at
 *  - bulletin min-participant cancellations (email + Stripe refund): every
 *    event has cancel_if_min_not_met = false and no min_participants
 *  - no paid signups, no connect_payments; revenue is cash settlement charges
 *
 * Re-runnable: rows owned by demo/reviewer accounts at the demo club are
 * replaced, everything else is upserted, and dates are relative to today.
 *
 * Reads DATABASE_URL from .env. In this project that is production.
 */

import dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { randomBytes, randomUUID } from 'crypto';
import type { PoolClient } from 'pg';
import { getClient } from '../src/database/connection';
import {
  ADMIN_EMAIL,
  ADMIN_NAME,
  EXTRAS,
  FACILITY_ID,
  REVIEWER_EMAIL,
  REVIEWER_NAME,
  removeDemoClub,
  ymd,
} from './lib/demoClub';
import { HOUSEHOLDS, MARKETING_MEMBERS, type MarketingMember } from './lib/marketingRoster';

dotenv.config();
// Booking dates/times are wall-clock values in the club's timezone.
process.env.TZ = 'America/New_York';

const APPLY = process.argv.includes('--apply');

/** How far back to generate completed bookings (dashboard + reports). */
const PAST_DAYS = 60;
/** Today plus the next six days. */
const FUTURE_DAYS = 6;
const OPEN = 7 * 60;
const CLOSE = 21 * 60;

type Row = Record<string, unknown>;

// ── Time helpers ────────────────────────────────────────────────────────────

const NOW = new Date();

/** Local wall-clock instant: `day` days from today at `minutes` past midnight. */
function at(day: number, minutes: number): Date {
  const d = new Date(NOW);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + day);
  d.setMinutes(minutes);
  return d;
}

/** For `timestamp without time zone` columns, which this database keeps in UTC. */
function utc(d: Date): string {
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

function minutesAgo(m: number): string {
  return utc(new Date(NOW.getTime() - m * 60_000));
}

function hhmm(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}:00`;
}

function dow(day: number): number {
  return at(day, 0).getDay();
}

function weekday(day: number): string {
  return at(day, 0).toLocaleDateString('en-US', { weekday: 'long' });
}

function shortDate(day: number, minutes: number): string {
  const d = at(day, minutes);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

/** Days from today to the next given weekday (0 = today if it matches). */
function nextDow(target: number): number {
  return (target - NOW.getDay() + 7) % 7;
}

// ── Deterministic randomness, so a re-run on the same day lays out the same ─

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ── People ──────────────────────────────────────────────────────────────────

interface Person {
  key: string;
  id: string;
  name: string;
  exists: boolean;
  member?: MarketingMember;
}

const people = new Map<string, Person>();

function person(key: string): Person {
  const p = people.get(key);
  if (!p) throw new Error(`Unknown demo person "${key}"`);
  return p;
}

function initials(key: string): string {
  const [first, last] = person(key).name.split(' ');
  return `${first} ${last ? `${last[0]}.` : ''}`.trim();
}

/** Adults who book courts themselves, weighted by how often they play. */
const BOOKER_WEIGHTS: Record<string, number> = {
  priya: 4, marcus: 4, jordan: 3, david: 3, carlos: 3, kwame: 3, sofia: 2, hannah: 2,
  sam: 2, riley: 2, meilin: 2, aisha: 2, tom: 2, chidi: 2, grace: 2, elena: 2, ben: 1,
};

// ── Courts ──────────────────────────────────────────────────────────────────

const COURTS = [
  { name: 'Court 1', number: 1, surface: 'Hard', type: 'Tennis' },
  { name: 'Court 2', number: 2, surface: 'Hard', type: 'Tennis' },
  { name: 'Court 3', number: 3, surface: 'Clay', type: 'Tennis' },
  { name: 'Court 4', number: 4, surface: 'Hard', type: 'Tennis' },
  { name: 'Pickleball 1', number: 5, surface: 'Hard', type: 'Pickleball' },
  { name: 'Pickleball 2', number: 6, surface: 'Hard', type: 'Pickleball' },
];
const C1 = 0, C2 = 1, C3 = 2, C4 = 3, P1 = 4, P2 = 5;
const isPickleball = (court: number) => COURTS[court]!.type === 'Pickleball';

// ── Plan ────────────────────────────────────────────────────────────────────

interface PlannedBooking {
  id: string;
  court: number;
  day: number;
  start: number;
  end: number;
  host: string;
  type: string;
  notes: string | null;
  participants: string[];
  status: 'confirmed' | 'completed' | 'cancelled';
  openToMembers?: boolean;
  maxPlayers?: number;
  bulletinPostId?: string;
  noShow?: boolean;
  guestName?: string;
  cashCents?: number;
  checkedIn?: boolean;
}

const bookings: PlannedBooking[] = [];
const courtBusy = new Map<string, Array<[number, number]>>();
const personBusy = new Map<string, Array<[number, number]>>();

function overlaps(list: Array<[number, number]> | undefined, start: number, end: number): boolean {
  return !!list?.some(([s, e]) => start < e && s < end);
}
function mark(map: Map<string, Array<[number, number]>>, key: string, start: number, end: number) {
  const list = map.get(key) ?? [];
  list.push([start, end]);
  map.set(key, list);
}
const courtFree = (court: number, day: number, start: number, end: number) =>
  !overlaps(courtBusy.get(`${court}|${day}`), start, end);
const personFree = (key: string, day: number, start: number, end: number) =>
  !overlaps(personBusy.get(`${key}|${day}`), start, end);

const skipped: string[] = [];

function addBooking(b: Omit<PlannedBooking, 'id' | 'status'> & { status?: PlannedBooking['status'] }): PlannedBooking | null {
  if (!courtFree(b.court, b.day, b.start, b.end)) {
    skipped.push(`${COURTS[b.court]!.name} ${ymd(b.day)} ${hhmm(b.start)} (${b.notes ?? b.type})`);
    return null;
  }
  const booking: PlannedBooking = {
    ...b,
    id: randomUUID(),
    status: b.status ?? (b.day < 0 ? 'completed' : 'confirmed'),
  };
  bookings.push(booking);
  mark(courtBusy, `${b.court}|${b.day}`, b.start, b.end);
  for (const k of [b.host, ...b.participants]) mark(personBusy, `${k}|${b.day}`, b.start, b.end);
  return booking;
}

const t = (h: number, m = 0) => h * 60 + m;

const SATURDAY = nextDow(6);
const FRIDAY = nextDow(5);
const SUNDAY = nextDow(0);

interface PlannedPost {
  id: string;
  author: string;
  title: string;
  content: string;
  category: 'announcement' | 'event' | 'clinic' | 'tournament' | 'social' | 'drill';
  pinned?: boolean;
  postedMinutesAgo: number;
  event?: {
    day: number;
    start: number;
    duration: number;
    court: number | null;
    max: number;
    confirmed: string[];
    waitlist?: string[];
    lessonType?: 'group_clinic' | 'drill';
  };
}

function planPosts(): PlannedPost[] {
  return [
    {
      id: randomUUID(), author: 'casey', category: 'announcement', pinned: true, postedMinutesAgo: 60 * 24 * 6,
      title: 'Lights on until 10pm on all six courts',
      content: 'The new LED lights are in on every tennis and pickleball court. Evening slots fill up fast, so book ahead in the app.',
    },
    {
      id: randomUUID(), author: 'natalie', category: 'clinic', postedMinutesAgo: 60 * 24 * 4,
      title: 'Cardio Tennis',
      content: 'An hour of high-energy drills set to music. Great workout, all levels welcome. Racquets available to borrow.',
      event: { day: 1, start: t(9, 30), duration: 60, court: C1, max: 8, lessonType: 'group_clinic',
        confirmed: ['sofia', 'aisha', 'grace', 'hannah', 'tom', 'meilin'] },
    },
    {
      id: randomUUID(), author: 'natalie', category: 'clinic', postedMinutesAgo: 60 * 24 * 5,
      title: 'Doubles Strategy Clinic',
      content: 'Poaching, signals and covering the middle. 3.5 and up. Bring a partner or we will pair you up.',
      event: { day: SATURDAY, start: t(10, 30), duration: 90, court: C3, max: 8, lessonType: 'group_clinic',
        confirmed: ['alex', 'priya', 'kwame', 'marcus', 'chidi', 'grace', 'sofia', 'david'],
        waitlist: ['aisha', 'elena'] },
    },
    {
      id: randomUUID(), author: 'natalie', category: 'clinic', postedMinutesAgo: 60 * 24 * 3,
      title: 'Intro to Pickleball',
      content: 'Never played? Learn the rules, the serve and the kitchen in 90 minutes. Paddles and balls provided.',
      event: { day: SUNDAY, start: t(16), duration: 90, court: P2, max: 8, lessonType: 'group_clinic',
        confirmed: ['ben', 'tom', 'riley', 'aisha', 'grace'] },
    },
    {
      id: randomUUID(), author: 'natalie', category: 'drill', postedMinutesAgo: 60 * 24 * 2,
      title: 'Live-Ball Drill Night',
      content: 'Fast-paced, point-based drills with rotating partners. 3.5+ recommended.',
      event: { day: FUTURE_DAYS, start: t(19), duration: 90, court: C4, max: 6, lessonType: 'drill',
        confirmed: ['jordan', 'kwame', 'david', 'priya'] },
    },
    {
      id: randomUUID(), author: 'casey', category: 'social', postedMinutesAgo: 60 * 24 * 3 + 120,
      title: 'Friday Night Pickleball Mixer',
      content: 'Round-robin pickleball, music and snacks. Rotating partners every game, so come solo or bring a friend.',
      event: { day: FRIDAY, start: t(18), duration: 120, court: P1, max: 16,
        confirmed: ['carlos', 'hannah', 'meilin', 'alex', 'sam', 'chidi', 'grace', 'aisha', 'tom', 'riley', 'sofia'] },
    },
    {
      id: randomUUID(), author: 'casey', category: 'tournament', postedMinutesAgo: 60 * 24 * 8,
      title: 'Winter Club Championships',
      content: "Singles and doubles draws for every level. Sign up by next Friday. The draw goes up on the board the following Monday.",
      event: { day: 17, start: t(9), duration: 480, court: null, max: 32,
        confirmed: ['jordan', 'david', 'priya', 'marcus', 'kwame', 'elena', 'carlos', 'sofia', 'riley', 'sam', 'chidi', 'grace', 'alex', 'aisha'] },
    },
    {
      id: randomUUID(), author: 'casey', category: 'event', postedMinutesAgo: 60 * 24 * 1 + 300,
      title: 'Junior Winter Camp',
      content: 'Three mornings of games, drills and match play for ages 8–14, led by Coach Natalie. Spots are limited.',
      event: { day: 26, start: t(9), duration: 180, court: null, max: 16,
        confirmed: ['ada', 'tobi'] },
    },
    {
      id: randomUUID(), author: 'casey', category: 'announcement', postedMinutesAgo: 60 * 30,
      title: 'Welcome to our newest members',
      content: 'Please say hello to Elena, Ben and Tobi when you see them on court. Elena is looking for singles partners!',
    },
  ];
}

function planFixedBookings(posts: PlannedPost[]) {
  // Event court holds first, like the app does when an event reserves a court.
  for (const post of posts) {
    const e = post.event;
    if (!e || e.court === null || e.day > FUTURE_DAYS) continue;
    const label = post.category.charAt(0).toUpperCase() + post.category.slice(1);
    addBooking({
      court: e.court, day: e.day, start: e.start, end: e.start + e.duration, host: post.author,
      type: post.category, notes: `${label}: ${post.title}`, participants: [], bulletinPostId: post.id,
    });
  }

  // The demo member's own week (these are what My Reservations shows).
  addBooking({ court: C2, day: 0, start: t(18), end: t(19, 30), host: 'alex', type: 'match', notes: 'Doubles',
    participants: ['priya', 'marcus', 'jordan'] });
  addBooking({ court: C4, day: 1, start: t(8), end: t(9, 30), host: 'marcus', type: 'match', notes: 'Doubles',
    participants: ['alex', 'sofia', 'kwame'] });
  addBooking({ court: C1, day: SATURDAY, start: t(9), end: t(10, 30), host: 'alex', type: 'match', notes: 'Singles',
    participants: ['jordan'] });
  addBooking({ court: P1, day: 5, start: t(19), end: t(20, 30), host: 'alex', type: 'social', notes: 'Pickleball open play',
    participants: ['hannah', 'carlos', 'meilin'] });

  // Open-match spots other members can claim.
  addBooking({ court: C3, day: FRIDAY, start: t(18, 30), end: t(20), host: 'elena', type: 'match',
    notes: 'Doubles · 2 spots open', participants: ['ben'], openToMembers: true, maxPlayers: 4 });
  addBooking({ court: P2, day: SUNDAY, start: t(10), end: t(11, 30), host: 'carlos', type: 'match',
    notes: 'Pickleball doubles · 1 spot open', participants: ['hannah', 'meilin'], openToMembers: true, maxPlayers: 4 });

  // The demo member's history.
  addBooking({ court: C1, day: -3, start: t(18), end: t(19, 30), host: 'alex', type: 'match', notes: 'Doubles',
    participants: [], checkedIn: true });
  addBooking({ court: C2, day: -10, start: t(9), end: t(10, 30), host: 'alex', type: 'match', notes: 'Singles',
    participants: [], checkedIn: true });
  addBooking({ court: P1, day: -17, start: t(18, 30), end: t(20), host: 'alex', type: 'social', notes: 'Pickleball open play',
    participants: [], checkedIn: true });

  // Two no-shows, each with a strike (see planStrikes).
  addBooking({ court: C2, day: -4, start: t(19), end: t(20, 30), host: 'ben', type: 'match', notes: 'Singles',
    participants: [], noShow: true, checkedIn: false });
  addBooking({ court: C4, day: -9, start: t(7, 30), end: t(9), host: 'tom', type: 'match', notes: 'Singles',
    participants: [], noShow: true, checkedIn: false });

  // Weekly fixtures: league nights and junior group lessons.
  for (let day = -PAST_DAYS; day <= FUTURE_DAYS; day++) {
    const d = dow(day);
    if (d === 2 || d === 4) {
      for (const court of [C1, C2]) {
        addBooking({ court, day, start: t(18), end: t(20), host: 'marcus', type: 'league_match',
          notes: 'League night · home match', participants: [] });
      }
      addBooking({ court: C3, day, start: t(16), end: t(17, 30), host: 'natalie', type: 'group_lesson',
        notes: 'Junior group lesson', participants: day >= 0 ? ['ada', 'tobi'] : [] });
    }
  }
}

/** Target share of court time booked, by day and time. */
function occupancy(day: number, minute: number): number {
  const d = dow(day);
  const weekend = d === 0 || d === 6;
  let o: number;
  if (weekend) o = minute < t(12) ? 0.8 : minute < t(17) ? 0.68 : 0.62;
  else if (minute < t(9)) o = 0.45;
  else if (minute < t(12)) o = 0.35;
  else if (minute < t(16)) o = 0.22;
  else if (minute < t(17)) o = 0.45;
  else o = 0.7;
  if (day < 0) o *= 0.9;
  // Last month a little quieter, so the dashboard shows growth.
  if (at(day, 0).getMonth() !== NOW.getMonth()) o *= 0.85;
  return o;
}

interface SlotType {
  type: string;
  notes: (student?: string) => string;
  durations: number[];
  extraPlayers: number;
  coach?: boolean;
}

const TENNIS_TYPES: Array<[number, SlotType]> = [
  [44, { type: 'match', notes: () => 'Doubles', durations: [90, 120, 90], extraPlayers: 3 }],
  [24, { type: 'match', notes: () => 'Singles', durations: [60, 90], extraPlayers: 1 }],
  [14, { type: 'lesson', notes: (s) => (s ? `Private lesson · ${s}` : 'Private lesson'), durations: [60], extraPlayers: 1, coach: true }],
  [8, { type: 'ball_machine', notes: () => 'Ball machine', durations: [60], extraPlayers: 0 }],
  [10, { type: 'match', notes: () => 'Practice set', durations: [60, 90], extraPlayers: 1 }],
];
const PICKLEBALL_TYPES: Array<[number, SlotType]> = [
  [55, { type: 'match', notes: () => 'Pickleball doubles', durations: [60, 90], extraPlayers: 3 }],
  [35, { type: 'social', notes: () => 'Pickleball open play', durations: [120, 90], extraPlayers: 5 }],
  [10, { type: 'lesson', notes: (s) => (s ? `Pickleball lesson · ${s}` : 'Pickleball lesson'), durations: [60], extraPlayers: 1, coach: true }],
];

function pickWeighted<T>(rng: () => number, items: Array<[number, T]>): T {
  const total = items.reduce((sum, [w]) => sum + w, 0);
  let r = rng() * total;
  for (const [w, item] of items) {
    r -= w;
    if (r <= 0) return item;
  }
  return items[items.length - 1]![1];
}

function eligibleBookers(day: number, start: number, end: number, exclude: Set<string>): Array<[number, string]> {
  return Object.entries(BOOKER_WEIGHTS)
    .filter(([key]) => !exclude.has(key))
    .filter(([key]) => {
      const joined = person(key).member?.joinedDaysAgo;
      return joined === undefined || day >= -joined;
    })
    .filter(([key]) => personFree(key, day, start, end))
    .map(([key, w]) => [w, key]);
}

function planGeneratedBookings() {
  for (let day = -PAST_DAYS; day <= FUTURE_DAYS; day++) {
    for (let court = 0; court < COURTS.length; court++) {
      const rng = mulberry32(hashString(`${ymd(day)}|${court}`));
      let minute = OPEN;
      while (minute < CLOSE) {
        const o = occupancy(day, minute);
        const p = (o * 30) / (90 * (1 - o) + o * 30);
        if (rng() >= p) {
          minute += 30;
          continue;
        }
        const slot = pickWeighted(rng, isPickleball(court) ? PICKLEBALL_TYPES : TENNIS_TYPES);
        const duration = [...slot.durations, 60].find(
          (dur) => minute + dur <= CLOSE && courtFree(court, day, minute, minute + dur)
        );
        if (!duration) {
          minute += 30;
          continue;
        }
        const end = minute + duration;
        const used = new Set<string>();
        let host: string;
        if (slot.coach) {
          if (!personFree('natalie', day, minute, end)) {
            minute += 30;
            continue;
          }
          host = 'natalie';
        } else {
          const pool = eligibleBookers(day, minute, end, used);
          if (pool.length === 0) {
            minute += 30;
            continue;
          }
          host = pickWeighted(rng, pool);
        }
        used.add(host);
        const others: string[] = [];
        for (let i = 0; i < slot.extraPlayers; i++) {
          const pool = eligibleBookers(day, minute, end, used);
          if (pool.length === 0) break;
          const k = pickWeighted(rng, pool);
          used.add(k);
          others.push(k);
        }
        const status: PlannedBooking['status'] = day < 0 && rng() < 0.05 ? 'cancelled' : day < 0 ? 'completed' : 'confirmed';
        const booking = addBooking({
          court, day, start: minute, end, host, type: slot.type,
          notes: slot.notes(others[0] ? initials(others[0]) : undefined),
          // Past bookings keep only the host, which is what reports count.
          participants: day >= 0 ? others : [],
          status,
          checkedIn: day < 0 && status === 'completed' ? rng() < 0.75 : undefined,
        });
        if (booking && day < 0 && status === 'completed' && !slot.coach) {
          if (slot.type === 'ball_machine') {
            booking.cashCents = 1000;
          } else if (rng() < 0.14) {
            booking.guestName = GUESTS[Math.floor(rng() * GUESTS.length)]!;
            booking.cashCents = 1500;
          }
        }
        minute = end;
      }
    }
  }
}

const GUESTS = ['Lauren Pike', 'Omar Siddiqui', 'Jess Moreau', 'Nate Kowalski', 'Ines Duarte', 'Paul Lindqvist'];

// ── Conversations ───────────────────────────────────────────────────────────

interface PlannedConversation {
  id: string;
  name?: string;
  createdBy?: string;
  members: string[];
  messages: Array<{ from: string; text: string; minutesAgo: number; unread?: boolean }>;
}

function planConversations(): PlannedConversation[] {
  const sat = weekday(SATURDAY);
  return [
    {
      id: randomUUID(),
      members: ['alex', 'priya'],
      messages: [
        { from: 'priya', text: 'Hey Alex! Still on for doubles tonight at 6? Marcus and Jordan are in.', minutesAgo: 60 * 13 },
        { from: 'alex', text: "Yes! I've got Court 2 from 6 to 7:30. Lights are on, so we can play late if we need to.", minutesAgo: 60 * 13 - 6 },
        { from: 'priya', text: "Perfect. I'll bring a fresh can of balls 🎾", minutesAgo: 60 * 13 - 8 },
        { from: 'alex', text: 'Thank you. The last ones were dead by the second set 😂', minutesAgo: 60 * 12 - 40 },
        { from: 'priya', text: "It's supposed to get chilly tonight, so bring a layer. Want to warm up at 5:45?", minutesAgo: 70, unread: true },
      ],
    },
    {
      id: randomUUID(),
      members: ['alex', 'jordan'],
      messages: [
        { from: 'jordan', text: `Rematch on ${sat}? I've been working on my backhand all week`, minutesAgo: 60 * 46 },
        { from: 'alex', text: 'You’re on. Does 9am work?', minutesAgo: 60 * 46 - 12 },
        { from: 'jordan', text: 'Works for me. Court 1 if it’s free', minutesAgo: 60 * 45 },
        { from: 'alex', text: 'Booked. Court 1, 9 to 10:30', minutesAgo: 60 * 45 - 5 },
        { from: 'jordan', text: 'Loser buys coffee ☕', minutesAgo: 60 * 44 },
        { from: 'alex', text: 'Deal', minutesAgo: 60 * 44 - 3 },
      ],
    },
    {
      id: randomUUID(),
      name: 'Early Doubles Crew',
      createdBy: 'marcus',
      members: ['marcus', 'alex', 'sofia', 'kwame', 'david'],
      messages: [
        { from: 'marcus', text: 'Who’s up for an early hit tomorrow morning? Thinking 8am.', minutesAgo: 60 * 20 },
        { from: 'sofia', text: 'I’m in!', minutesAgo: 60 * 20 - 9 },
        { from: 'kwame', text: 'Count me in. I can do 8 to 9:30', minutesAgo: 60 * 19 },
        { from: 'alex', text: 'In. Want me to check if Court 4 is open?', minutesAgo: 60 * 19 - 4 },
        { from: 'marcus', text: 'Already booked it 🙌 Court 4, 8 to 9:30', minutesAgo: 60 * 18 },
        { from: 'david', text: 'I’ll sub in if anyone drops. Have fun!', minutesAgo: 60 * 17, unread: true },
      ],
    },
  ];
}

// ── Main ────────────────────────────────────────────────────────────────────

async function insertRows(client: PoolClient, table: string, rows: Row[], conflict = '') {
  if (rows.length === 0) return;
  const cols = Object.keys(rows[0]!);
  for (let i = 0; i < rows.length; i += 250) {
    const chunk = rows.slice(i, i + 250);
    const params: unknown[] = [];
    const values = chunk.map((row) => {
      const placeholders = cols.map((c) => {
        params.push(row[c] ?? null);
        return `$${params.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await client.query(
      `INSERT INTO ${table} (${cols.join(', ')}) VALUES ${values.join(', ')} ${conflict}`,
      params
    );
  }
}

async function seed() {
  const client = await getClient();
  try {
    // ── Read what exists (read-only) ──
    await client.query('BEGIN');
    if (!APPLY) await client.query('SET TRANSACTION READ ONLY');

    const facility = await client.query(`SELECT id, name FROM facilities WHERE id = $1`, [FACILITY_ID]);
    if (facility.rows.length === 0) {
      throw new Error(`Facility ${FACILITY_ID} not found. Run "npm run seed:review" first.`);
    }

    const known = [
      { key: 'alex', email: REVIEWER_EMAIL },
      { key: 'casey', email: ADMIN_EMAIL },
      ...EXTRAS.map((e) => ({ key: e.email.split('@')[0]!.replace('demo.', ''), email: e.email })),
    ];
    for (const { key, email } of known) {
      const r = await client.query(`SELECT id, full_name FROM users WHERE email = $1`, [email]);
      if (r.rows.length === 0) throw new Error(`${email} not found. Run "npm run seed:review" first.`);
      people.set(key, { key, id: r.rows[0].id, name: r.rows[0].full_name, exists: true });
    }
    for (const member of MARKETING_MEMBERS) {
      const r = await client.query(`SELECT id FROM users WHERE email = $1`, [member.email]);
      people.set(member.key, {
        key: member.key,
        id: r.rows[0]?.id ?? randomUUID(),
        name: member.name,
        exists: r.rows.length > 0,
        member,
      });
    }
    // Display names only; seed:review uses the same ones.
    person('alex').name = REVIEWER_NAME;
    person('casey').name = ADMIN_NAME;
    const demoIds = [...people.values()].map((p) => p.id);
    const id = (key: string) => person(key).id;

    const courtRows = await client.query(
      `SELECT id, name, court_number, has_lights, court_type, surface_type FROM courts WHERE facility_id = $1`,
      [FACILITY_ID]
    );
    const courtIds: string[] = [];
    const courtInserts: Row[] = [];
    const courtUpdates: Array<{ id: string; number: number }> = [];
    for (const c of COURTS) {
      const existing = courtRows.rows.find((r) => r.name === c.name);
      if (existing) {
        courtIds.push(existing.id);
        if (existing.court_number !== c.number || existing.has_lights !== true) {
          courtUpdates.push({ id: existing.id, number: c.number });
        }
      } else {
        const newId = randomUUID();
        courtIds.push(newId);
        courtInserts.push({
          id: newId, facility_id: FACILITY_ID, name: c.name, court_number: c.number,
          surface_type: c.surface, court_type: c.type, has_lights: true, status: 'available',
        });
      }
    }

    // Bookings that stay (not owned by a demo account), so nothing overlaps them.
    const kept = await client.query(
      `SELECT court_id, TO_CHAR(booking_date, 'YYYY-MM-DD') AS date,
              EXTRACT(HOUR FROM start_time) * 60 + EXTRACT(MINUTE FROM start_time) AS s,
              EXTRACT(HOUR FROM end_time) * 60 + EXTRACT(MINUTE FROM end_time) AS e
         FROM bookings
        WHERE facility_id = $1 AND status <> 'cancelled' AND NOT (user_id = ANY($2::uuid[]))
          AND booking_date BETWEEN $3::date AND $4::date`,
      [FACILITY_ID, demoIds, ymd(-PAST_DAYS), ymd(FUTURE_DAYS)]
    );
    // Day offsets from the club's local today (the database's CURRENT_DATE is UTC).
    const dayOf = new Map<string, number>();
    for (let d = -PAST_DAYS; d <= FUTURE_DAYS; d++) dayOf.set(ymd(d), d);
    for (const r of kept.rows) {
      const court = courtIds.indexOf(r.court_id);
      const day = dayOf.get(r.date);
      if (court >= 0 && day !== undefined) mark(courtBusy, `${court}|${day}`, Number(r.s), Number(r.e));
    }

    const ruleDefs = await client.query(`SELECT id, rule_code FROM booking_rule_definitions`);
    const ruleId = (code: string) => {
      const row = ruleDefs.rows.find((r) => r.rule_code === code);
      if (!row) throw new Error(`Rule ${code} not defined`);
      return row.id as string;
    };

    // What gets replaced: rows at the demo club owned by demo/reviewer accounts.
    const deletes: Array<{ table: string; where: string; params: unknown[] }> = [
      { table: 'account_strikes', where: `facility_id = $1 AND user_id = ANY($2::uuid[])`, params: [FACILITY_ID, demoIds] },
      { table: 'bookings', where: `facility_id = $1 AND user_id = ANY($2::uuid[])`, params: [FACILITY_ID, demoIds] },
      { table: 'bulletin_posts', where: `facility_id = $1 AND author_id = ANY($2::uuid[])`, params: [FACILITY_ID, demoIds] },
      { table: 'hitting_partner_posts', where: `facility_id = $1 AND user_id = ANY($2::uuid[])`, params: [FACILITY_ID, demoIds] },
      {
        table: 'conversations',
        where: `facility_id = $1 AND ((participant1_id = ANY($2::uuid[]) AND participant2_id = ANY($2::uuid[]))
                 OR (is_group = true AND created_by = ANY($2::uuid[])))`,
        params: [FACILITY_ID, demoIds],
      },
      { table: 'household_groups', where: `facility_id = $1 AND household_name = ANY($2::text[])`, params: [FACILITY_ID, HOUSEHOLDS.map((h) => h.name)] },
    ];
    const deleteCounts: Record<string, number> = {};
    for (const d of deletes) {
      const r = await client.query(`SELECT COUNT(*)::int AS n FROM ${d.table} WHERE ${d.where}`, d.params);
      deleteCounts[d.table] = r.rows[0].n;
    }
    const cascade = await client.query(
      `SELECT
         (SELECT COUNT(*)::int FROM booking_participants bp JOIN bookings b ON b.id = bp.booking_id
           WHERE b.facility_id = $1 AND b.user_id = ANY($2::uuid[])) AS participants,
         (SELECT COUNT(*)::int FROM booking_cancellations bc JOIN bookings b ON b.id = bc.booking_id
           WHERE b.facility_id = $1 AND b.user_id = ANY($2::uuid[])) AS cancellations,
         (SELECT COUNT(*)::int FROM booking_settlement_charges s JOIN bookings b ON b.id = s.booking_id
           WHERE b.facility_id = $1 AND b.user_id = ANY($2::uuid[])) AS charges,
         (SELECT COUNT(*)::int FROM messages m JOIN conversations c ON c.id = m.conversation_id
           WHERE c.facility_id = $1 AND ((c.participant1_id = ANY($2::uuid[]) AND c.participant2_id = ANY($2::uuid[]))
                 OR (c.is_group = true AND c.created_by = ANY($2::uuid[])))) AS messages,
         (SELECT COUNT(*)::int FROM bulletin_drill_signups s JOIN bulletin_posts p ON p.id = s.bulletin_post_id
           WHERE p.facility_id = $1 AND p.author_id = ANY($2::uuid[])) AS signups`,
      [FACILITY_ID, demoIds]
    );

    // ── Build the plan in memory ──
    const posts = planPosts();
    planFixedBookings(posts);
    planGeneratedBookings();
    const conversations = planConversations();

    const users: Row[] = MARKETING_MEMBERS.map((m) => ({
      id: id(m.key), email: m.email, full_name: m.name,
      first_name: m.name.split(' ')[0], last_name: m.name.split(' ').slice(1).join(' '),
      city: 'Norcross', state: 'GA',
    }));
    const profiles: Row[] = MARKETING_MEMBERS.map((m) => ({ user_id: id(m.key), skill_level: m.skill, bio: m.bio }));
    const memberships: Row[] = MARKETING_MEMBERS.map((m) => ({
      user_id: id(m.key), facility_id: FACILITY_ID, membership_type: 'Full',
      status: m.status ?? 'active', start_date: ymd(-m.joinedDaysAgo),
    }));

    const bookingRows: Row[] = bookings.map((b) => {
      const startAt = at(b.day, b.start);
      const endAt = at(b.day, b.end);
      const rng = mulberry32(hashString(b.id));
      const createdAt = b.day < 0
        ? new Date(startAt.getTime() - (1 + rng() * 6) * 86_400_000)
        : new Date(NOW.getTime() - (30 + rng() * 60 * 24 * 5) * 60_000);
      const settled = b.cashCents ? utc(new Date(endAt.getTime() + 10 * 60_000)) : null;
      return {
        id: b.id, court_id: courtIds[b.court], user_id: id(b.host), facility_id: FACILITY_ID,
        booking_date: ymd(b.day), start_time: hhmm(b.start), end_time: hhmm(b.end),
        duration_minutes: b.end - b.start, status: b.status, booking_type: b.type, notes: b.notes,
        created_at: utc(createdAt), updated_at: utc(createdAt),
        checked_in: b.checkedIn ?? false,
        checked_in_at: b.checkedIn ? utc(new Date(startAt.getTime() - 5 * 60_000)) : null,
        no_show_marked: b.noShow ?? false,
        bring_guest: !!b.guestName,
        guest_names: b.guestName ? [b.guestName] : null,
        open_to_members: b.openToMembers ?? false,
        max_players: b.maxPlayers ?? null,
        bulletin_post_id: b.bulletinPostId ?? null,
        settlement_status: settled ? 'settled' : 'not_applicable',
        settled_at: settled,
        settled_by: settled ? id('casey') : null,
        // Keeps the server's reminder sweep (email + push) off every seeded booking.
        reminder_sent_at: b.day < 0 ? utc(new Date(startAt.getTime() - 60 * 60_000)) : utc(NOW),
      };
    });
    const participantRows: Row[] = bookings.flatMap((b) =>
      b.participants.map((k) => ({ booking_id: b.id, user_id: id(k), added_by: id(b.host) }))
    );
    const chargeRows: Row[] = bookings
      .filter((b) => b.cashCents)
      .map((b) => {
        const when = utc(new Date(at(b.day, b.end).getTime() + 10 * 60_000));
        return {
          booking_id: b.id, user_id: id(b.host), amount_cents: b.cashCents, status: 'cash',
          resolved_by: id('casey'), resolved_at: when, created_at: when, updated_at: when,
        };
      });

    const postRows: Row[] = posts.map((p) => {
      const posted = minutesAgo(p.postedMinutesAgo);
      const e = p.event;
      return {
        id: p.id, facility_id: FACILITY_ID, author_id: id(p.author), title: p.title, content: p.content,
        category: p.category, is_pinned: p.pinned ?? false, is_admin_post: true,
        posted_date: posted, created_at: posted, updated_at: posted, status: 'active',
        drill_start_at: e ? utc(at(e.day, e.start)) : null,
        drill_court_id: e && e.court !== null ? courtIds[e.court] : null,
        drill_max_participants: e?.max ?? null,
        drill_duration_minutes: e?.duration ?? null,
        drill_show_participants: !!e,
        // Never let the min-participant sweep cancel (and email/refund) these.
        cancel_if_min_not_met: false,
        min_participants: null,
        require_payment: false,
        lesson_type: e?.lessonType ?? null,
      };
    });
    const signupRows: Row[] = posts.flatMap((p) => {
      if (!p.event) return [];
      const base = p.postedMinutesAgo;
      return [
        ...p.event.confirmed.map((k, i) => ({
          bulletin_post_id: p.id, user_id: id(k), status: 'confirmed', waitlist_position: null,
          created_at: minutesAgo(Math.max(5, base - 45 * (i + 1))),
        })),
        ...(p.event.waitlist ?? []).map((k, i) => ({
          bulletin_post_id: p.id, user_id: id(k), status: 'waitlist', waitlist_position: i + 1,
          created_at: minutesAgo(Math.max(5, base - 45 * (p.event!.confirmed.length + i + 1))),
        })),
      ];
    });
    const postBookingLinks = bookings.filter((b) => b.bulletinPostId);

    const partnerRows: Row[] = [
      { key: 'sam', skill: 'Intermediate', availability: 'Weekday evenings after 6pm', style: ['Singles', 'Match Play'],
        text: 'Looking for a regular singles partner around 3.5. Happy to drill or play sets.', ago: 60 * 24 * 3 },
      { key: 'riley', skill: 'Beginner', availability: 'Saturday and Sunday mornings', style: ['Doubles', 'Social'],
        text: 'Still fairly new and keen to find a friendly doubles group for weekend mornings.', ago: 60 * 24 * 5 },
      { key: 'elena', skill: 'Advanced', availability: 'Weekdays 6:30–8am, some lunchtimes', style: ['Singles', 'Drilling'],
        text: 'Just joined! 4.0 singles player looking for early-morning hitting partners. I bring the coffee.', ago: 60 * 26 },
      { key: 'kwame', skill: 'Intermediate', availability: 'Tue/Thu evenings, Sunday afternoons', style: ['Doubles', 'Pickleball'],
        text: 'Looking for a pickleball doubles partner to play the Friday mixers and some weeknight games.', ago: 60 * 9 },
    ].map((p) => ({
      user_id: id(p.key as string), facility_id: FACILITY_ID, skill_level: p.skill, availability: p.availability,
      play_style: p.style, description: p.text, posted_date: minutesAgo(p.ago as number),
      created_at: minutesAgo(p.ago as number), expires_at: utc(at(45, 0)), status: 'active',
    }));

    const conversationRows: Row[] = conversations.map((c) => {
      const first = Math.max(...c.messages.map((m) => m.minutesAgo));
      const last = Math.min(...c.messages.map((m) => m.minutesAgo));
      return {
        id: c.id,
        participant1_id: c.name ? null : id(c.members[0]!),
        participant2_id: c.name ? null : id(c.members[1]!),
        facility_id: FACILITY_ID, is_group: !!c.name, name: c.name ?? null,
        created_by: c.createdBy ? id(c.createdBy) : null,
        created_at: minutesAgo(first + 1), updated_at: minutesAgo(last),
      };
    });
    const conversationParticipantRows: Row[] = conversations
      .filter((c) => c.name)
      .flatMap((c) => c.members.map((k) => ({
        conversation_id: c.id, user_id: id(k), added_by: id(c.createdBy!),
        joined_at: minutesAgo(Math.max(...c.messages.map((m) => m.minutesAgo)) + 1),
      })));
    const messageRows: Row[] = conversations.flatMap((c) =>
      c.messages.map((m) => ({
        conversation_id: c.id, sender_id: id(m.from), message_text: m.text,
        is_read: !m.unread, created_at: minutesAgo(m.minutesAgo),
      }))
    );

    const householdRows: Row[] = HOUSEHOLDS.map((h) => ({
      id: randomUUID(), facility_id: FACILITY_ID, household_name: h.name, street_address: h.street,
      city: 'Norcross', state: 'GA', zip_code: '30092', max_members: h.maxMembers,
    }));
    const householdMemberRows: Row[] = MARKETING_MEMBERS.filter((m) => m.household).map((m) => {
      const hh = householdRows.find((h) => h.household_name === m.household)!;
      const added = utc(at(-m.joinedDaysAgo, t(10)));
      return {
        household_id: hh.id, user_id: id(m.key), is_primary: m.householdPrimary ?? false,
        verification_status: 'verified', added_at: added, added_by: id('casey'),
        verified_at: added, verified_by: id('casey'),
      };
    });

    const strikeRows: Row[] = bookings
      .filter((b) => b.noShow)
      .map((b) => {
        const issued = new Date(at(b.day, b.end).getTime() + 30 * 60_000);
        return {
          user_id: id(b.host), facility_id: FACILITY_ID, strike_type: 'no_show',
          strike_reason: `No-show: ${COURTS[b.court]!.name}, ${shortDate(b.day, b.start)}`,
          related_booking_id: b.id, issued_at: utc(issued), issued_by: id('casey'),
          expires_at: utc(new Date(issued.getTime() + 30 * 86_400_000)), appealed: false, revoked: false,
        };
      });

    const ruleRows: Row[] = [
      ['ACC-005', { max_days_ahead: 7 }],
      ['CRT-005', { max_duration_minutes: 120 }],
      ['ACC-008', { penalty_type: 'strike', penalty_value: 1, late_cancel_cutoff_minutes: 240 }],
      ['ACC-009', { lockout_days: 7, strike_threshold: 3, strike_window_days: 30 }],
      ['HH-002', { max_active_household: '3' }],
      ['CRT-001', {
        peak_windows: [
          { id: 'slot-demo-weeknights', days: [1, 2, 3, 4, 5], start_time: '17:00', end_time: '21:00',
            applies_to_all_courts: true, selected_court_ids: [],
            rules: { max_duration_hours: -1, max_bookings_per_day: -1, max_bookings_per_week: -1,
              max_bookings_per_day_household: -1, max_bookings_per_week_household: -1 } },
          { id: 'slot-demo-weekends', days: [0, 6], start_time: '08:00', end_time: '12:00',
            applies_to_all_courts: true, selected_court_ids: [],
            rules: { max_duration_hours: -1, max_bookings_per_day: -1, max_bookings_per_week: -1,
              max_bookings_per_day_household: -1, max_bookings_per_week_household: -1 } },
        ],
      }],
    ].map(([code, config]) => ({
      facility_id: FACILITY_ID, rule_definition_id: ruleId(code as string),
      rule_config: JSON.stringify(config), is_enabled: true, priority: 100, created_by: id('casey'),
    }));

    const hours = Object.fromEntries(
      ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].map((d) => [d, { open: '07:00', close: '22:00' }])
    );

    // ── Report ──
    const newUsers = MARKETING_MEMBERS.filter((m) => !person(m.key).exists).length;
    const upcoming = bookings.filter((b) => b.day >= 0);
    const evening = (b: PlannedBooking) => b.end > t(17);
    const fillRate = (pred: (b: PlannedBooking) => boolean, from: number, to: number, days: number[]) => {
      const booked = upcoming.filter((b) => days.includes(b.day) && pred(b))
        .reduce((sum, b) => sum + Math.max(0, Math.min(b.end, to) - Math.max(b.start, from)), 0);
      return Math.round((booked / ((to - from) * COURTS.length * days.length)) * 100);
    };
    const weekdays = Array.from({ length: FUTURE_DAYS + 1 }, (_, d) => d).filter((d) => ![0, 6].includes(dow(d)));
    const weekends = Array.from({ length: FUTURE_DAYS + 1 }, (_, d) => d).filter((d) => [0, 6].includes(dow(d)));

    const insertPlan: Array<[string, number, string?]> = [
      ['users', users.length, `${newUsers} new, ${users.length - newUsers} refreshed (name/city only, passwords untouched)`],
      ['player_profiles', profiles.length, 'upsert'],
      ['facility_memberships', memberships.length, `upsert (${memberships.filter((m) => m.status === 'pending').length} pending requests)`],
      ['courts', courtInserts.length, courtInserts.map((c) => c.name).join(', ')],
      ['bookings', bookingRows.length,
        `${upcoming.length} today→+${FUTURE_DAYS}d, ${bookings.length - upcoming.length} past ${PAST_DAYS}d ` +
        `(${bookings.filter((b) => b.status === 'cancelled').length} cancelled, 2 no-shows, 2 open matches, ` +
        `${postBookingLinks.length} event court holds)`],
      ['booking_participants', participantRows.length],
      ['booking_settlement_charges', chargeRows.length,
        `status 'cash', $${(chargeRows.reduce((s, r) => s + Number(r.amount_cents), 0) / 100).toFixed(0)} total, no Stripe`],
      ['bulletin_posts', postRows.length,
        `${posts.filter((p) => !['clinic', 'drill'].includes(p.category)).length} board posts + ` +
        `${posts.filter((p) => ['clinic', 'drill'].includes(p.category)).length} clinics/drills`],
      ['bulletin_drill_signups', signupRows.length, `${signupRows.filter((s) => s.status === 'waitlist').length} waitlisted`],
      ['hitting_partner_posts', partnerRows.length],
      ['conversations', conversationRows.length, '2 direct + 1 group'],
      ['conversation_participants', conversationParticipantRows.length, 'group members'],
      ['messages', messageRows.length, `${messageRows.filter((m) => !m.is_read).length} unread for the demo member`],
      ['household_groups', householdRows.length, HOUSEHOLDS.map((h) => h.name).join(', ')],
      ['household_members', householdMemberRows.length],
      ['account_strikes', strikeRows.length, 'no_show, 30-day expiry'],
      ['facility_rule_configs', ruleRows.length, 'upsert: ACC-005 (7 days), CRT-005, ACC-008, ACC-009, HH-002, CRT-001'],
      ['facility_features', 1, 'upsert lessons_tab = on (needed for the Clinics/Lessons screen)'],
    ];

    console.log(`\n📸 Marketing seed for ${facility.rows[0].name} (${FACILITY_ID}) — ${APPLY ? 'APPLYING' : 'DRY RUN, nothing written'}\n`);
    console.log('  Replaced (existing rows owned by demo/reviewer accounts at this club):');
    for (const [table, n] of Object.entries(deleteCounts)) console.log(`    - ${table.padEnd(28)} ${n}`);
    const c = cascade.rows[0];
    console.log(`      (cascade: ${c.participants} booking_participants, ${c.cancellations} booking_cancellations, ` +
      `${c.charges} settlement charges, ${c.messages} messages, ${c.signups} drill signups)`);
    console.log('\n  Inserted:');
    for (const [table, n, note] of insertPlan) console.log(`    + ${table.padEnd(28)} ${String(n).padStart(5)}  ${note ?? ''}`);
    console.log('\n  Updated:');
    console.log(`    ~ courts                       ${courtUpdates.length}  (lights on, renumbered so Pickleball sorts after Court 4)`);
    console.log('    ~ bulletin_posts.booking_id    ' + postBookingLinks.length + '  (link events to their court holds)');
    console.log('    ~ facilities                   1  (operating hours 7am–10pm daily)');
    console.log(`    ~ users                        2  (reviewer display names → ${REVIEWER_NAME} / ${ADMIN_NAME})`);
    console.log(`\n  Upcoming fill rate: weekday evenings 5–9pm ${fillRate(evening, t(17), CLOSE, weekdays)}%, ` +
      `weekends ${fillRate(() => true, OPEN, CLOSE, weekends)}%, weekday daytime ${fillRate(() => true, OPEN, t(17), weekdays)}%`);
    if (skipped.length) console.log(`  Skipped (slot already taken by a non-demo booking): ${skipped.join('; ')}`);

    if (!APPLY) {
      await client.query('ROLLBACK');
      console.log('\n  Dry run only. Re-run with --apply to write.\n');
      return;
    }

    // ── Write (same transaction) ──
    for (const d of deletes) await client.query(`DELETE FROM ${d.table} WHERE ${d.where}`, d.params);

    await client.query(`UPDATE facilities SET operating_hours = $2 WHERE id = $1`, [FACILITY_ID, JSON.stringify(hours)]);
    await client.query(
      `INSERT INTO facility_features (facility_id, feature_key, is_enabled, updated_at)
       VALUES ($1, 'lessons_tab', true, NOW())
       ON CONFLICT (facility_id, feature_key) DO UPDATE SET is_enabled = true, updated_at = NOW()`,
      [FACILITY_ID]
    );
    for (const u of courtUpdates) {
      await client.query(`UPDATE courts SET court_number = $2, has_lights = true WHERE id = $1`, [u.id, u.number]);
    }
    await insertRows(client, 'courts', courtInserts);

    // New accounts get an unguessable password nobody holds; existing ones keep theirs.
    const unusable = await bcrypt.hash(randomBytes(24).toString('hex'), 10);
    await insertRows(
      client,
      'users',
      users.map((u) => ({ ...u, password_hash: unusable, user_type: 'player' })),
      `ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name, first_name = EXCLUDED.first_name,
         last_name = EXCLUDED.last_name, city = EXCLUDED.city, state = EXCLUDED.state, deleted_at = NULL`
    );
    {
      for (const key of ['alex', 'casey']) {
        const name = person(key).name;
        await client.query(`UPDATE users SET full_name = $2, first_name = $3, last_name = $4 WHERE id = $1`,
          [id(key), name, name.split(' ')[0], name.split(' ').slice(1).join(' ')]);
      }
    }
    await insertRows(client, 'player_profiles', profiles,
      `ON CONFLICT (user_id) DO UPDATE SET skill_level = EXCLUDED.skill_level, bio = EXCLUDED.bio`);
    await insertRows(client, 'facility_memberships', memberships,
      `ON CONFLICT (user_id, facility_id) DO UPDATE SET status = EXCLUDED.status, start_date = EXCLUDED.start_date,
         membership_type = EXCLUDED.membership_type, end_date = NULL`);

    await insertRows(client, 'bulletin_posts', postRows);
    await insertRows(client, 'bulletin_drill_signups', signupRows);
    await insertRows(client, 'bookings', bookingRows);
    for (const b of postBookingLinks) {
      await client.query(`UPDATE bulletin_posts SET booking_id = $1 WHERE id = $2`, [b.id, b.bulletinPostId]);
    }
    await insertRows(client, 'booking_participants', participantRows);
    await insertRows(client, 'booking_settlement_charges', chargeRows);
    await insertRows(client, 'account_strikes', strikeRows);
    await insertRows(client, 'hitting_partner_posts', partnerRows);
    await insertRows(client, 'conversations', conversationRows);
    await insertRows(client, 'conversation_participants', conversationParticipantRows);
    await insertRows(client, 'messages', messageRows);
    await insertRows(client, 'household_groups', householdRows);
    await insertRows(client, 'household_members', householdMemberRows);
    await insertRows(client, 'facility_rule_configs', ruleRows,
      `ON CONFLICT (facility_id, rule_definition_id) DO UPDATE SET rule_config = EXCLUDED.rule_config,
         is_enabled = true, updated_at = NOW()`);

    await client.query('COMMIT');
    console.log('\n  ✓ Written.\n');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

async function remove() {
  console.log(`\n🧹 Removing the demo club (${FACILITY_ID}) and every demo account\n`);
  const emails = [REVIEWER_EMAIL, ADMIN_EMAIL, ...EXTRAS.map((e) => e.email), ...MARKETING_MEMBERS.map((m) => m.email)];
  const removed = await removeDemoClub(emails);
  console.log(`  ✓ facility removed, ${removed} demo accounts removed\n`);
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set. Add it to .env first.');
    process.exit(1);
  }
  if (process.argv.includes('--remove')) {
    await remove();
  } else {
    await seed();
  }
  process.exit(0);
}

main().catch((error) => {
  console.error('\n❌ Marketing seed failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
