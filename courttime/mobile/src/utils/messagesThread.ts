/**
 * Pure helpers for the Messages tab so its conversation shapes (direct and
 * group) can be unit-tested without rendering the screen.
 *
 * The server returns two row shapes from GET /api/messages/conversations:
 *   DM:    { id, isGroup: false, otherUser: { id, name, email }, lastMessage, unreadCount }
 *   Group: { id, isGroup: true, groupName, createdBy, memberCount, lastMessage, unreadCount }
 */

export interface ConversationUser {
  id: string;
  name: string;
  email?: string;
  profileImageUrl?: string;
}

export interface ConversationItem {
  id: string;
  isGroup: boolean;
  /** Present on direct messages only. */
  otherUser?: ConversationUser;
  /** Present on groups only. */
  groupName?: string;
  createdBy?: string;
  memberCount?: number;
  lastMessage: { text: string; senderId: string; sentAt: string } | null;
  unreadCount: number;
}

/** Normalise raw API rows (either shape, snake_case image field) into ConversationItem. */
export function normalizeConversations(rows: unknown[]): ConversationItem[] {
  return rows
    .filter((row): row is Record<string, any> => !!row && typeof row === 'object')
    .map((row) => {
      const isGroup = row.isGroup === true || row.is_group === true;
      const base: ConversationItem = {
        id: String(row.id ?? ''),
        isGroup,
        lastMessage: row.lastMessage ?? null,
        unreadCount: Number(row.unreadCount ?? 0) || 0,
      };
      if (isGroup) {
        return {
          ...base,
          groupName: row.groupName ?? row.name ?? 'Group',
          createdBy: row.createdBy ?? row.created_by,
          memberCount: Number(row.memberCount ?? row.member_count ?? 0) || 0,
        };
      }
      const other = row.otherUser ?? {};
      return {
        ...base,
        otherUser: {
          id: String(other.id ?? ''),
          name: String(other.name ?? ''),
          email: other.email,
          profileImageUrl: other.profileImageUrl || other.profile_image_url,
        },
      };
    });
}

/** What to call the thread in the list and header. */
export function conversationTitle(convo: Pick<ConversationItem, 'isGroup' | 'groupName' | 'otherUser'>): string {
  if (convo.isGroup) return convo.groupName || 'Group';
  return convo.otherUser?.name || 'Member';
}

/** The creator or any active admin of the facility may rename, add/remove members, or delete. */
export function isGroupManager(
  convo: Pick<ConversationItem, 'isGroup' | 'createdBy'> | null | undefined,
  userId: string | undefined,
  adminFacilities: string[] | undefined,
  facilityId: string | null | undefined
): boolean {
  if (!convo?.isGroup || !userId) return false;
  if (convo.createdBy === userId) return true;
  return !!facilityId && (adminFacilities ?? []).includes(facilityId);
}

/**
 * Body for POST /api/messages. Groups (and any thread that already has an id)
 * send by conversationId; a draft DM has no id yet and sends by recipient.
 */
export function buildSendBody(
  convo: Pick<ConversationItem, 'id' | 'isGroup' | 'otherUser'>,
  facilityId: string,
  messageText: string
): Record<string, string> {
  if (convo.isGroup || (convo.id && !convo.otherUser)) {
    return { conversationId: convo.id, messageText };
  }
  return { recipientId: convo.otherUser?.id ?? '', facilityId, messageText };
}
