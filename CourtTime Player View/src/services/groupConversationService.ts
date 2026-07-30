/**
 * Creating group conversations.
 *
 * Extracted so both the Messages UI (POST /api/messages/groups) and the player
 * level groups board ("Message this tier") create groups through the same
 * validation: every member must be an active member of the facility, and the
 * group -- creator included -- must fit under GROUP_MEMBER_LIMIT.
 */

import { query } from '../database/connection';

/** Cap on group conversation size, including the creator. */
export const GROUP_MEMBER_LIMIT = 30;

/** Thrown for caller mistakes; `status` is the HTTP status the route should return. */
export class GroupConversationError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = 'GroupConversationError';
  }
}

/** Trims and validates a group name, throwing GroupConversationError when invalid. */
export function validateGroupName(rawName: unknown): string {
  if (typeof rawName !== 'string' || !rawName.trim()) {
    throw new GroupConversationError('Group name is required');
  }
  const name = rawName.trim();
  if (name.length > 100) {
    throw new GroupConversationError('Group name must be 100 characters or fewer');
  }
  return name;
}

export interface CreateGroupConversationOptions {
  facilityId: string;
  /** Raw name from the caller; validated here. */
  name: unknown;
  /** Always a member of the resulting group, and its manager. */
  creatorId: string;
  /** Other members. The creator is ignored if present, and duplicates collapse. */
  memberIds: unknown;
}

/**
 * Create a group conversation owned by `creatorId`. Returns the new
 * conversation's id and its trimmed name.
 */
export async function createGroupConversation(
  options: CreateGroupConversationOptions
): Promise<{ conversationId: string; name: string }> {
  const { facilityId, creatorId } = options;
  const name = validateGroupName(options.name);

  const requestedIds: unknown[] = Array.isArray(options.memberIds) ? options.memberIds : [];
  const memberIdSet = new Set(
    requestedIds.filter((id): id is string => typeof id === 'string' && id !== creatorId)
  );

  if (memberIdSet.size === 0) {
    throw new GroupConversationError('A group needs at least one other member');
  }
  if (memberIdSet.size + 1 > GROUP_MEMBER_LIMIT) {
    throw new GroupConversationError(`Groups are limited to ${GROUP_MEMBER_LIMIT} members`);
  }

  const memberIdList = Array.from(memberIdSet);
  const membershipCheck = await query(
    `SELECT user_id FROM facility_memberships
      WHERE facility_id = $1 AND user_id = ANY($2::uuid[]) AND status = 'active'`,
    [facilityId, memberIdList]
  );
  if (membershipCheck.rows.length !== memberIdList.length) {
    throw new GroupConversationError('All members must be active members of the facility', 403);
  }

  const conversationResult = await query(
    `INSERT INTO conversations (is_group, name, created_by, facility_id)
     VALUES (true, $1, $2, $3)
     RETURNING id`,
    [name, creatorId, facilityId]
  );
  const conversationId = conversationResult.rows[0].id;

  const participantRows = [creatorId, ...memberIdList];
  const values = participantRows
    .map((_, i) => `($1, $${i + 2}, $${participantRows.length + 2})`)
    .join(', ');
  await query(
    `INSERT INTO conversation_participants (conversation_id, user_id, added_by)
     VALUES ${values}`,
    [conversationId, ...participantRows, creatorId]
  );

  return { conversationId, name };
}
