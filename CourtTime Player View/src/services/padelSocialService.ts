import { query, transaction } from '../database/connection';
import { createBooking } from './bookingService';
import { notificationService } from './notificationService';
import {
  americanoCyclePos,
  americanoPairingForCyclePos,
  assignAmericanoGroups,
  mexicanoGroupsAndPairings,
  rankPlayersForMexicano,
  shouldReshuffleAmericanoGroups,
} from '../../shared/utils/padelPairing';
import { createPadelDropInCheckoutSession, executeConnectPaymentRefund } from './stripeConnectService';

/**
 * Refunds a padel drop-in charge. No admin-authorization check here (unlike
 * stripeConnectService's refundConnectPayment) -- callers are padel-specific
 * flows that have already established the caller may trigger this: a player
 * refunding their own payment on leave, a host/admin cancelling their own
 * session, or the system sweep. No-ops if the payment isn't in a refundable
 * ('PAID') state, so it's safe to call defensively.
 */
async function refundPadelDropInPayment(connectPaymentId: string): Promise<void> {
  const result = await query(
    `SELECT cp.status, cp.stripe_payment_intent_id as "stripePaymentIntentId",
            f.stripe_account_id as "stripeAccountId"
       FROM connect_payments cp
       JOIN facilities f ON f.id = cp.club_id
      WHERE cp.id = $1`,
    [connectPaymentId]
  );
  const row = result.rows[0];
  if (!row || row.status !== 'PAID' || !row.stripePaymentIntentId || !row.stripeAccountId) {
    return;
  }
  await executeConnectPaymentRefund({
    connectPaymentId,
    stripePaymentIntentId: row.stripePaymentIntentId,
    stripeAccountId: row.stripeAccountId,
  });
  await query(
    `UPDATE padel_social_players SET payment_status = 'refunded' WHERE connect_payment_id = $1`,
    [connectPaymentId]
  );
}

function defaultAppUrl(): string {
  return process.env.NODE_ENV !== 'production'
    ? process.env.DEV_APP_URL || 'http://localhost:5173'
    : process.env.APP_URL || 'http://localhost:5173';
}

export interface PadelSocialSessionSummary {
  id: string;
  facilityId: string;
  format: 'americano' | 'mexicano';
  sessionDate: string;
  startTime: string;
  durationMinutes: number;
  playerCount: number;
  roundsCount: number;
  status: 'open' | 'full' | 'in_progress' | 'completed' | 'cancelled';
  createdBy: string;
  hostName: string;
  joinedCount: number;
  isJoined: boolean;
}

export interface MatchAssignment {
  matchId: string;
  courtId: string | null;
  team1: [string, string];
  team2: [string, string];
}

/** Creates the session shell and enrolls the creator as the first (host) player. */
export async function createSession(params: {
  facilityId: string;
  createdBy: string;
  format: 'americano' | 'mexicano';
  sessionDate: string;
  startTime: string;
  durationMinutes: number;
  playerCount: number;
  roundsCount: number;
}): Promise<{ sessionId: string; requiresPayment?: boolean; checkoutUrl?: string }> {
  if (params.playerCount <= 0 || params.playerCount % 4 !== 0) {
    throw new Error('playerCount must be a positive multiple of 4');
  }

  const priceResult = await query(`SELECT padel_dropin_rate_cents as "dropInRateCents" FROM facilities WHERE id = $1`, [
    params.facilityId,
  ]);
  const dropInRateCents: number | null = priceResult.rows[0]?.dropInRateCents ?? null;
  const isPaid = dropInRateCents != null && dropInRateCents > 0;

  const { sessionId, padelSocialPlayerId } = await transaction(async client => {
    const sessionResult = await client.query(
      `INSERT INTO padel_social_sessions (
        facility_id, created_by, format, session_date, start_time,
        duration_minutes, player_count, rounds_count
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id`,
      [
        params.facilityId,
        params.createdBy,
        params.format,
        params.sessionDate,
        params.startTime,
        params.durationMinutes,
        params.playerCount,
        params.roundsCount,
      ]
    );
    const sessionId = sessionResult.rows[0].id as string;

    const skillResult = await client.query(
      `SELECT padel_skill_level FROM player_profiles WHERE user_id = $1`,
      [params.createdBy]
    );
    const seedSkill = parseSkillLevel(skillResult.rows[0]?.padel_skill_level);

    // The host is also a roster spot and, when the club charges for drop-in,
    // pays their own share too -- same "organizer pays immediately" precedent
    // split_court_payments uses.
    const insert = await client.query(
      isPaid
        ? `INSERT INTO padel_social_players
             (session_id, user_id, is_host, seed_skill, payment_status, amount_cents, payment_hold_expires_at)
           VALUES ($1, $2, true, $3, 'pending', $4, NOW() + INTERVAL '30 minutes')
           RETURNING id`
        : `INSERT INTO padel_social_players (session_id, user_id, is_host, seed_skill, payment_status)
           VALUES ($1, $2, true, $3, 'not_required')
           RETURNING id`,
      isPaid ? [sessionId, params.createdBy, seedSkill, dropInRateCents] : [sessionId, params.createdBy, seedSkill]
    );

    return { sessionId, padelSocialPlayerId: insert.rows[0].id as string };
  });

  if (!isPaid) {
    return { sessionId };
  }

  const { url } = await createPadelDropInCheckoutSession({
    sessionId,
    padelSocialPlayerId,
    facilityId: params.facilityId,
    memberId: params.createdBy,
    amountCents: dropInRateCents!,
    sessionLabel: `${params.format === 'americano' ? 'Americano' : 'Mexicano'} · ${params.sessionDate} ${params.startTime}`,
    successUrl: `${defaultAppUrl()}/padel?padelPaymentSuccess=1&sessionId=${sessionId}`,
    cancelUrl: `${defaultAppUrl()}/padel?padelPaymentCancelled=1`,
  });

  return { sessionId, requiresPayment: true, checkoutUrl: url };
}

export interface JoinSessionResult {
  joined: boolean;
  playerCount: number;
  playerTarget: number;
  requiresPayment?: boolean;
  checkoutUrl?: string;
}

export async function joinSession(sessionId: string, userId: string): Promise<JoinSessionResult> {
  const priceResult = await query(
    `SELECT f.padel_dropin_rate_cents as "dropInRateCents", s.session_date as "sessionDate",
            s.start_time as "startTime", s.format
     FROM padel_social_sessions s
     JOIN facilities f ON f.id = s.facility_id
     WHERE s.id = $1`,
    [sessionId]
  );
  if (priceResult.rows.length === 0) {
    throw new Error('Session not found');
  }
  const dropInRateCents: number | null = priceResult.rows[0].dropInRateCents;
  const isPaid = dropInRateCents != null && dropInRateCents > 0;

  const { padelSocialPlayerId, facilityId, newOccupancy, playerTarget } = await transaction(async client => {
    const sessionResult = await client.query(
      `SELECT status, player_count as "playerCount", facility_id as "facilityId"
       FROM padel_social_sessions WHERE id = $1 FOR UPDATE`,
      [sessionId]
    );
    if (sessionResult.rows.length === 0) {
      throw new Error('Session not found');
    }
    const session = sessionResult.rows[0];
    if (session.status !== 'open') {
      throw new Error('This session is no longer accepting players');
    }

    // Setting a drop-in price is what makes a club's padel open to the public --
    // a self-registered first-timer who landed 'pending' (no whitelist match) can
    // already pay for other things via isClubMember(); free sessions keep the
    // stricter active-only requirement unchanged.
    const membership = await client.query(
      isPaid
        ? `SELECT 1 FROM facility_memberships WHERE user_id = $1 AND facility_id = $2 AND status IN ('active', 'pending') LIMIT 1`
        : `SELECT 1 FROM facility_memberships WHERE user_id = $1 AND facility_id = $2 AND status = 'active' LIMIT 1`,
      [userId, session.facilityId]
    );
    if (membership.rows.length === 0) {
      throw new Error('Only club members can join this session');
    }

    // Pending (unpaid, unexpired) joins count toward the cap too, so two people
    // can't both grab the last spot while one of them is mid-checkout.
    const countResult = await client.query(
      `SELECT COUNT(*)::int as count FROM padel_social_players
       WHERE session_id = $1 AND payment_status IN ('not_required', 'pending', 'paid')`,
      [sessionId]
    );
    const currentCount = countResult.rows[0].count as number;
    if (currentCount >= session.playerCount) {
      throw new Error('This session is already full');
    }

    const skillResult = await client.query(
      `SELECT padel_skill_level FROM player_profiles WHERE user_id = $1`,
      [userId]
    );
    const seedSkill = parseSkillLevel(skillResult.rows[0]?.padel_skill_level);

    const insert = await client.query(
      isPaid
        ? `INSERT INTO padel_social_players
             (session_id, user_id, is_host, seed_skill, payment_status, amount_cents, payment_hold_expires_at)
           VALUES ($1, $2, false, $3, 'pending', $4, NOW() + INTERVAL '30 minutes')
           ON CONFLICT (session_id, user_id) DO NOTHING
           RETURNING id`
        : `INSERT INTO padel_social_players (session_id, user_id, is_host, seed_skill, payment_status)
           VALUES ($1, $2, false, $3, 'not_required')
           ON CONFLICT (session_id, user_id) DO NOTHING
           RETURNING id`,
      isPaid ? [sessionId, userId, seedSkill, dropInRateCents] : [sessionId, userId, seedSkill]
    );
    if (insert.rows.length === 0) {
      throw new Error('You have already joined this session');
    }
    const padelSocialPlayerId = insert.rows[0].id as string;

    const newCount = currentCount + 1;
    // Free sessions fill the moment the roster is full; paid sessions only fill
    // once everyone has actually paid (see finalizePadelDropInPayment).
    if (!isPaid && newCount >= session.playerCount) {
      await client.query(`UPDATE padel_social_sessions SET status = 'full', updated_at = NOW() WHERE id = $1`, [
        sessionId,
      ]);

      const hostResult = await client.query(
        `SELECT created_by FROM padel_social_sessions WHERE id = $1`,
        [sessionId]
      );
      await notificationService.createNotification(
        hostResult.rows[0].created_by,
        'Your Social Play session is full',
        'All spots are filled. Start the session when everyone is ready.',
        'padel_session_full',
        { actionUrl: '/padel' }
      );
    }

    return {
      padelSocialPlayerId,
      facilityId: session.facilityId as string,
      newOccupancy: newCount,
      playerTarget: session.playerCount as number,
    };
  });

  if (!isPaid) {
    return { joined: true, playerCount: newOccupancy, playerTarget };
  }

  const { format, sessionDate, startTime } = priceResult.rows[0];
  const { url } = await createPadelDropInCheckoutSession({
    sessionId,
    padelSocialPlayerId,
    facilityId,
    memberId: userId,
    amountCents: dropInRateCents!,
    sessionLabel: `${format === 'americano' ? 'Americano' : 'Mexicano'} · ${sessionDate} ${startTime}`,
    successUrl: `${defaultAppUrl()}/padel?padelPaymentSuccess=1&sessionId=${sessionId}`,
    cancelUrl: `${defaultAppUrl()}/padel?padelPaymentCancelled=1`,
  });

  return { joined: true, playerCount: newOccupancy, playerTarget, requiresPayment: true, checkoutUrl: url };
}

export async function leaveSession(sessionId: string, userId: string): Promise<void> {
  const sessionResult = await query(
    `SELECT status FROM padel_social_sessions WHERE id = $1`,
    [sessionId]
  );
  if (sessionResult.rows.length === 0) {
    throw new Error('Session not found');
  }
  if (!['open', 'full'].includes(sessionResult.rows[0].status)) {
    throw new Error('This session has already started');
  }

  const playerResult = await query(
    `SELECT payment_status as "paymentStatus", connect_payment_id as "connectPaymentId"
     FROM padel_social_players WHERE session_id = $1 AND user_id = $2 AND is_host = false`,
    [sessionId, userId]
  );
  const player = playerResult.rows[0];
  if (player?.paymentStatus === 'paid' && player.connectPaymentId) {
    // They paid to hold this spot; backing out gets them their money back,
    // same "auto-refund" policy applied to cancelled/unfilled sessions.
    await refundPadelDropInPayment(player.connectPaymentId).catch(err =>
      console.error('Refund on padel session leave failed (will need manual resolution):', err)
    );
  }

  await query(
    `DELETE FROM padel_social_players WHERE session_id = $1 AND user_id = $2 AND is_host = false`,
    [sessionId, userId]
  );
  await query(
    `UPDATE padel_social_sessions SET status = 'open', updated_at = NOW() WHERE id = $1 AND status = 'full'`,
    [sessionId]
  );
}

export async function listOpenSessions(
  facilityId: string,
  requestingUserId?: string
): Promise<PadelSocialSessionSummary[]> {
  const result = await query(
    `SELECT
      s.id, s.facility_id as "facilityId", s.format,
      TO_CHAR(s.session_date, 'YYYY-MM-DD') as "sessionDate",
      s.start_time as "startTime", s.duration_minutes as "durationMinutes",
      s.player_count as "playerCount", s.rounds_count as "roundsCount",
      s.status, s.created_by as "createdBy", u.full_name as "hostName",
      (SELECT COUNT(*)::int FROM padel_social_players p
        WHERE p.session_id = s.id AND p.payment_status IN ('not_required', 'paid')) as "joinedCount",
      EXISTS(
        SELECT 1 FROM padel_social_players p WHERE p.session_id = s.id AND p.user_id = $2
      ) as "isJoined"
     FROM padel_social_sessions s
     JOIN users u ON s.created_by = u.id
     WHERE s.facility_id = $1
       AND s.status IN ('open', 'full')
       AND s.session_date >= CURRENT_DATE
     ORDER BY s.session_date ASC, s.start_time ASC`,
    [facilityId, requestingUserId ?? null]
  );
  return result.rows;
}

/**
 * Host/admin starts the session: auto-assigns padel courts, creates the
 * bookings that block the calendar, assigns Americano groups (Mexicano
 * groups are computed fresh every round instead), and generates round 1.
 */
export async function startSession(
  sessionId: string,
  startedBy: string
): Promise<{ sessionId: string; bookingIds: string[] }> {
  const sessionResult = await query(
    `SELECT * FROM padel_social_sessions WHERE id = $1`,
    [sessionId]
  );
  if (sessionResult.rows.length === 0) {
    throw new Error('Session not found');
  }
  const session = sessionResult.rows[0];
  if (session.created_by !== startedBy) {
    throw new Error('Only the session host can start it');
  }
  if (!['open', 'full'].includes(session.status)) {
    throw new Error('Session has already started or was cancelled');
  }

  const playersResult = await query(
    `SELECT user_id as "userId" FROM padel_social_players
     WHERE session_id = $1 AND payment_status IN ('not_required', 'paid')
     ORDER BY joined_at ASC`,
    [sessionId]
  );
  const playerIds: string[] = playersResult.rows.map((r: any) => r.userId);
  if (playerIds.length !== session.player_count) {
    throw new Error(`Need ${session.player_count} paid players to start (have ${playerIds.length})`);
  }

  const courtsNeeded = playerIds.length / 4;
  const courtsResult = await query(
    `SELECT id FROM courts
     WHERE facility_id = $1
       AND LOWER(court_type) = 'padel'
       AND status = 'available'
     ORDER BY court_number ASC NULLS LAST, name ASC
     LIMIT $2`,
    [session.facility_id, courtsNeeded]
  );
  if (courtsResult.rows.length < courtsNeeded) {
    throw new Error(`Not enough available padel courts: need ${courtsNeeded}, found ${courtsResult.rows.length}`);
  }
  const courtIds: string[] = courtsResult.rows.map((r: any) => r.id);

  const endTime = addMinutesToTime(session.start_time, session.duration_minutes);
  const bookingIds: string[] = [];
  for (const courtId of courtIds) {
    const result = await createBooking({
      courtId,
      userId: startedBy,
      facilityId: session.facility_id,
      bookingDate: session.session_date,
      startTime: session.start_time,
      endTime,
      durationMinutes: session.duration_minutes,
      bookingType: 'social',
      activityType: 'padel',
      maxPlayers: 4,
      padelSessionId: sessionId,
      skipRulesValidation: true,
      skipPaymentCheck: true,
    });
    if (!result.success || !result.booking) {
      throw new Error(result.error || 'Failed to reserve a court for this session');
    }
    bookingIds.push(result.booking.id);
  }

  await query(
    `UPDATE padel_social_sessions SET court_ids = $2, status = 'in_progress', updated_at = NOW() WHERE id = $1`,
    [sessionId, courtIds]
  );

  if (session.format === 'americano') {
    const assignments = assignAmericanoGroups(playerIds);
    for (const a of assignments) {
      await query(
        `UPDATE padel_social_players SET group_court_index = $1, group_slot = $2
         WHERE session_id = $3 AND user_id = $4`,
        [a.courtIndex, a.slot, sessionId, a.userId]
      );
    }
  }

  await generateNextRound(sessionId);

  return { sessionId, bookingIds };
}

export async function generateNextRound(
  sessionId: string
): Promise<{ roundId: string; roundNumber: number; matches: MatchAssignment[] }> {
  const sessionResult = await query(
    `SELECT format, court_ids as "courtIds", status FROM padel_social_sessions WHERE id = $1`,
    [sessionId]
  );
  if (sessionResult.rows.length === 0) {
    throw new Error('Session not found');
  }
  const session = sessionResult.rows[0];
  if (session.status !== 'in_progress' && session.status !== 'completed') {
    throw new Error('Session has not started');
  }

  const roundCountResult = await query(
    `SELECT COALESCE(MAX(round_number), 0) as "maxRound" FROM padel_social_rounds WHERE session_id = $1`,
    [sessionId]
  );
  const roundNumber = (roundCountResult.rows[0].maxRound as number) + 1;
  const courtIds: string[] = session.courtIds;

  let groups: { courtGroupIndex: number; team1: [string, string]; team2: [string, string] }[];

  if (session.format === 'americano') {
    if (shouldReshuffleAmericanoGroups(roundNumber)) {
      const playersResult = await query(
        `SELECT user_id as "userId" FROM padel_social_players
         WHERE session_id = $1 AND payment_status IN ('not_required', 'paid')`,
        [sessionId]
      );
      const playerIds: string[] = playersResult.rows.map((r: any) => r.userId);
      const assignments = assignAmericanoGroups(playerIds);
      for (const a of assignments) {
        await query(
          `UPDATE padel_social_players SET group_court_index = $1, group_slot = $2
           WHERE session_id = $3 AND user_id = $4`,
          [a.courtIndex, a.slot, sessionId, a.userId]
        );
      }
    }

    const rosterResult = await query(
      `SELECT user_id as "userId", group_court_index as "courtIndex", group_slot as "slot"
       FROM padel_social_players
       WHERE session_id = $1 AND payment_status IN ('not_required', 'paid')
       ORDER BY group_court_index ASC, group_slot ASC`,
      [sessionId]
    );
    const byCourtIndex = new Map<number, { userId: string; slot: number }[]>();
    for (const row of rosterResult.rows as { userId: string; courtIndex: number; slot: number }[]) {
      const list = byCourtIndex.get(row.courtIndex) ?? [];
      list.push({ userId: row.userId, slot: row.slot });
      byCourtIndex.set(row.courtIndex, list);
    }

    const cyclePos = americanoCyclePos(roundNumber);
    const pairing = americanoPairingForCyclePos(cyclePos);
    groups = [...byCourtIndex.entries()].map(([courtGroupIndex, players]) => {
      const bySlot = new Map(players.map(p => [p.slot, p.userId]));
      return {
        courtGroupIndex,
        team1: [bySlot.get(pairing.team1[0])!, bySlot.get(pairing.team1[1])!] as [string, string],
        team2: [bySlot.get(pairing.team2[0])!, bySlot.get(pairing.team2[1])!] as [string, string],
      };
    });
  } else {
    const standings = await getSessionStandings(sessionId);
    const ranked = rankPlayersForMexicano(
      standings.map(s => ({ userId: s.userId, points: s.points, seedSkill: s.seedSkill }))
    );
    groups = mexicanoGroupsAndPairings(ranked);
  }

  return transaction(async client => {
    const roundResult = await client.query(
      `INSERT INTO padel_social_rounds (session_id, round_number, status)
       VALUES ($1, $2, 'in_progress')
       RETURNING id`,
      [sessionId, roundNumber]
    );
    const roundId = roundResult.rows[0].id as string;

    const matches: MatchAssignment[] = [];
    for (const group of groups) {
      const courtId = courtIds[group.courtGroupIndex] ?? null;
      const matchResult = await client.query(
        `INSERT INTO padel_social_matches (
          round_id, session_id, court_id,
          team1_player1_id, team1_player2_id, team2_player1_id, team2_player2_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [roundId, sessionId, courtId, group.team1[0], group.team1[1], group.team2[0], group.team2[1]]
      );
      matches.push({
        matchId: matchResult.rows[0].id,
        courtId,
        team1: group.team1,
        team2: group.team2,
      });
    }

    return { roundId, roundNumber, matches };
  });
}

export async function recordMatchScore(
  matchId: string,
  team1Score: number,
  team2Score: number,
  recordedBy: string
): Promise<void> {
  if (team1Score < 0 || team2Score < 0) {
    throw new Error('Scores cannot be negative');
  }
  const result = await query(
    `UPDATE padel_social_matches
     SET team1_score = $2, team2_score = $3, recorded_by = $4, completed_at = NOW()
     WHERE id = $1
     RETURNING round_id as "roundId"`,
    [matchId, team1Score, team2Score, recordedBy]
  );
  if (result.rows.length === 0) {
    throw new Error('Match not found');
  }

  const roundId = result.rows[0].roundId as string;
  const remaining = await query(
    `SELECT COUNT(*)::int as count FROM padel_social_matches WHERE round_id = $1 AND completed_at IS NULL`,
    [roundId]
  );
  if (remaining.rows[0].count === 0) {
    await query(`UPDATE padel_social_rounds SET status = 'completed' WHERE id = $1`, [roundId]);
  }
}

export async function getSessionStandings(
  sessionId: string
): Promise<{ userId: string; fullName: string; points: number; matchesPlayed: number; seedSkill: number | null }[]> {
  const result = await query(
    `SELECT
      p.user_id as "userId", u.full_name as "fullName", p.seed_skill as "seedSkill",
      COALESCE(SUM(
        CASE
          WHEN m.completed_at IS NULL THEN 0
          WHEN p.user_id IN (m.team1_player1_id, m.team1_player2_id) THEN m.team1_score
          WHEN p.user_id IN (m.team2_player1_id, m.team2_player2_id) THEN m.team2_score
          ELSE 0
        END
      ), 0)::int as "points",
      COUNT(m.id) FILTER (WHERE m.completed_at IS NOT NULL AND
        p.user_id IN (m.team1_player1_id, m.team1_player2_id, m.team2_player1_id, m.team2_player2_id)
      )::int as "matchesPlayed"
     FROM padel_social_players p
     JOIN users u ON p.user_id = u.id
     LEFT JOIN padel_social_matches m ON m.session_id = p.session_id
       AND p.user_id IN (m.team1_player1_id, m.team1_player2_id, m.team2_player1_id, m.team2_player2_id)
     WHERE p.session_id = $1 AND p.payment_status IN ('not_required', 'paid')
     GROUP BY p.user_id, u.full_name, p.seed_skill
     ORDER BY "points" DESC, u.full_name ASC`,
    [sessionId]
  );
  return result.rows;
}

export async function getSessionDetail(sessionId: string): Promise<{
  session: PadelSocialSessionSummary & { courtIds: string[] };
  roster: { userId: string; fullName: string; isHost: boolean; paymentStatus: string }[];
  rounds: { id: string; roundNumber: number; status: string; matches: any[] }[];
}> {
  const sessionResult = await query(
    `SELECT
      s.id, s.facility_id as "facilityId", s.format,
      TO_CHAR(s.session_date, 'YYYY-MM-DD') as "sessionDate",
      s.start_time as "startTime", s.duration_minutes as "durationMinutes",
      s.player_count as "playerCount", s.rounds_count as "roundsCount",
      s.status, s.created_by as "createdBy", u.full_name as "hostName",
      s.court_ids as "courtIds",
      (SELECT COUNT(*)::int FROM padel_social_players p
        WHERE p.session_id = s.id AND p.payment_status IN ('not_required', 'paid')) as "joinedCount"
     FROM padel_social_sessions s
     JOIN users u ON s.created_by = u.id
     WHERE s.id = $1`,
    [sessionId]
  );
  if (sessionResult.rows.length === 0) {
    throw new Error('Session not found');
  }

  const rosterResult = await query(
    `SELECT p.user_id as "userId", u.full_name as "fullName", p.is_host as "isHost",
            p.payment_status as "paymentStatus"
     FROM padel_social_players p
     JOIN users u ON p.user_id = u.id
     WHERE p.session_id = $1
     ORDER BY p.joined_at ASC`,
    [sessionId]
  );

  const roundsResult = await query(
    `SELECT
      r.id, r.round_number as "roundNumber", r.status,
      m.id as "matchId", m.court_id as "courtId", c.name as "courtName",
      m.team1_player1_id as "t1p1", m.team1_player2_id as "t1p2",
      m.team2_player1_id as "t2p1", m.team2_player2_id as "t2p2",
      m.team1_score as "team1Score", m.team2_score as "team2Score"
     FROM padel_social_rounds r
     LEFT JOIN padel_social_matches m ON m.round_id = r.id
     LEFT JOIN courts c ON m.court_id = c.id
     WHERE r.session_id = $1
     ORDER BY r.round_number ASC`,
    [sessionId]
  );

  const roundsById = new Map<string, { id: string; roundNumber: number; status: string; matches: any[] }>();
  for (const row of roundsResult.rows) {
    if (!roundsById.has(row.id)) {
      roundsById.set(row.id, { id: row.id, roundNumber: row.roundNumber, status: row.status, matches: [] });
    }
    if (row.matchId) {
      roundsById.get(row.id)!.matches.push({
        id: row.matchId,
        courtId: row.courtId,
        courtName: row.courtName,
        team1: [row.t1p1, row.t1p2],
        team2: [row.t2p1, row.t2p2],
        team1Score: row.team1Score,
        team2Score: row.team2Score,
      });
    }
  }

  return {
    session: sessionResult.rows[0],
    roster: rosterResult.rows,
    rounds: [...roundsById.values()],
  };
}

/**
 * Called from the Connect webhook (via stripeConnectService.markCheckoutSessionPaid)
 * once a padel drop-in Checkout Session completes. Marks the player's roster row
 * paid, and flips the session to 'full' once every slot is actually paid for
 * (not just joined) -- see joinSession, which no longer flips 'full' itself when
 * a drop-in price is configured.
 */
export async function finalizePadelDropInPayment(connectPaymentId: string): Promise<void> {
  const result = await query(
    `UPDATE padel_social_players SET payment_status = 'paid', paid_at = NOW()
     WHERE connect_payment_id = $1 AND payment_status = 'pending'
     RETURNING session_id as "sessionId"`,
    [connectPaymentId]
  );
  if (result.rows.length === 0) return;
  const sessionId = result.rows[0].sessionId as string;

  const sessionResult = await query(
    `SELECT player_count as "playerCount", status, created_by as "createdBy" FROM padel_social_sessions WHERE id = $1`,
    [sessionId]
  );
  const session = sessionResult.rows[0];
  if (!session || session.status !== 'open') return;

  const paidCount = await query(
    `SELECT COUNT(*)::int as count FROM padel_social_players
     WHERE session_id = $1 AND payment_status IN ('not_required', 'paid')`,
    [sessionId]
  );
  if (paidCount.rows[0].count >= session.playerCount) {
    await query(`UPDATE padel_social_sessions SET status = 'full', updated_at = NOW() WHERE id = $1`, [sessionId]);
    await notificationService.createNotification(
      session.createdBy,
      'Your Social Play session is full',
      'Everyone has paid and all spots are filled. Start the session when ready.',
      'padel_session_full',
      { actionUrl: '/padel' }
    );
  }
}

/**
 * Cancels a session before it starts, refunding every player who already paid.
 * Internal helper does the state change + refunds; the two public entry points
 * differ only in how they authorize the caller.
 */
async function cancelSessionInternal(sessionId: string): Promise<void> {
  const playersResult = await query(
    `SELECT user_id as "userId", is_host as "isHost", payment_status as "paymentStatus",
            connect_payment_id as "connectPaymentId"
     FROM padel_social_players WHERE session_id = $1`,
    [sessionId]
  );

  await query(`UPDATE padel_social_sessions SET status = 'cancelled', updated_at = NOW() WHERE id = $1`, [sessionId]);

  for (const player of playersResult.rows) {
    if (player.paymentStatus === 'paid' && player.connectPaymentId) {
      await refundPadelDropInPayment(player.connectPaymentId).catch(err =>
        console.error(`Refund on session cancel failed for player ${player.userId} (will need manual resolution):`, err)
      );
    }
    if (!player.isHost) {
      await notificationService.createNotification(
        player.userId,
        'Social Play session cancelled',
        player.paymentStatus === 'paid'
          ? 'The session was cancelled and your payment has been refunded.'
          : 'The session was cancelled.',
        'padel_session_full',
        { actionUrl: '/padel' }
      ).catch(err => console.error('Cancellation notification failed:', err));
    }
  }
}

export async function cancelSession(sessionId: string, cancelledBy: string): Promise<void> {
  const sessionResult = await query(
    `SELECT facility_id as "facilityId", created_by as "createdBy", status FROM padel_social_sessions WHERE id = $1`,
    [sessionId]
  );
  const session = sessionResult.rows[0];
  if (!session) throw new Error('Session not found');
  if (!['open', 'full'].includes(session.status)) {
    throw new Error('This session has already started or was already cancelled');
  }

  const isHost = session.createdBy === cancelledBy;
  if (!isHost) {
    const admin = await query(
      `SELECT 1 FROM facility_admins WHERE user_id = $1 AND facility_id = $2 AND status = 'active' LIMIT 1`,
      [cancelledBy, session.facilityId]
    );
    if (admin.rows.length === 0) {
      throw new Error('Only the session host or a facility admin can cancel this session');
    }
  }

  await cancelSessionInternal(sessionId);
}

/**
 * Runs every 60s (server/index.ts, same pattern as expireSplitCourtReservations):
 * (a) frees roster slots held by an abandoned/unpaid checkout past its hold
 *     deadline, and (b) auto-cancels (with refunds) any session whose start
 *     time has passed while it was still open/full -- it never actually ran.
 */
export async function sweepPadelDropIns(): Promise<void> {
  const expired = await query(
    `SELECT id, connect_payment_id as "connectPaymentId"
     FROM padel_social_players
     WHERE payment_status = 'pending' AND payment_hold_expires_at < NOW()`
  );
  for (const row of expired.rows) {
    if (row.connectPaymentId) {
      await query(`UPDATE connect_payments SET status = 'FAILED' WHERE id = $1 AND status = 'PENDING'`, [
        row.connectPaymentId,
      ]).catch(err => console.error('Marking expired padel drop-in payment failed:', err));
    }
    await query(`DELETE FROM padel_social_players WHERE id = $1`, [row.id]).catch(err =>
      console.error('Freeing expired padel drop-in hold failed:', err)
    );
  }

  const staleSessions = await query(
    `SELECT id FROM padel_social_sessions
     WHERE status IN ('open', 'full')
       AND (session_date < CURRENT_DATE OR (session_date = CURRENT_DATE AND start_time < CURRENT_TIME))`
  );
  for (const row of staleSessions.rows) {
    await cancelSessionInternal(row.id).catch(err =>
      console.error(`Auto-cancel of stale padel session ${row.id} failed:`, err)
    );
  }
}

function parseSkillLevel(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m, s] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const endH = Math.floor(total / 60) % 24;
  const endM = total % 60;
  return `${String(endH).padStart(2, '0')}:${String(endM).padStart(2, '0')}:${String(s ?? 0).padStart(2, '0')}`;
}
