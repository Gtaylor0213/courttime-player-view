/**
 * Messages tab helpers: both conversation shapes the server returns (direct and
 * group) must normalise, title, and send correctly.
 */
import { describe, expect, it } from '@jest/globals';
import {
  buildSendBody,
  conversationTitle,
  isGroupManager,
  normalizeConversations,
} from '../src/utils/messagesThread';

describe('normalizeConversations', () => {
  it('keeps direct messages and normalises the snake_case image field', () => {
    const [dm] = normalizeConversations([
      {
        id: 'c1',
        isGroup: false,
        otherUser: { id: 'u2', name: 'Dana', profile_image_url: 'https://x/y.png' },
        lastMessage: null,
        unreadCount: '2',
      },
    ]);
    expect(dm).toMatchObject({ id: 'c1', isGroup: false, unreadCount: 2 });
    expect(dm.otherUser).toMatchObject({ id: 'u2', name: 'Dana', profileImageUrl: 'https://x/y.png' });
  });

  it('keeps group rows with their name, creator and member count', () => {
    const [group] = normalizeConversations([
      { id: 'g1', isGroup: true, groupName: '4.0', createdBy: 'u1', memberCount: '5', lastMessage: null, unreadCount: 0 },
    ]);
    expect(group).toMatchObject({ id: 'g1', isGroup: true, groupName: '4.0', createdBy: 'u1', memberCount: 5 });
    expect(group.otherUser).toBeUndefined();
  });
});

describe('conversationTitle', () => {
  it('uses the group name for groups and the other member for DMs', () => {
    expect(conversationTitle({ isGroup: true, groupName: 'Ladder' })).toBe('Ladder');
    expect(conversationTitle({ isGroup: true })).toBe('Group');
    expect(conversationTitle({ isGroup: false, otherUser: { id: 'u2', name: 'Dana' } })).toBe('Dana');
  });
});

describe('isGroupManager', () => {
  it('is the creator or a facility admin, and never for a DM', () => {
    const group = { isGroup: true, createdBy: 'u1' };
    expect(isGroupManager(group, 'u1', [], 'f1')).toBe(true);
    expect(isGroupManager(group, 'u9', ['f1'], 'f1')).toBe(true);
    expect(isGroupManager(group, 'u9', ['f2'], 'f1')).toBe(false);
    expect(isGroupManager({ isGroup: false }, 'u1', ['f1'], 'f1')).toBe(false);
  });
});

describe('buildSendBody', () => {
  it('sends to a group by conversation id', () => {
    expect(buildSendBody({ id: 'g1', isGroup: true }, 'f1', 'hi')).toEqual({ conversationId: 'g1', messageText: 'hi' });
  });
  it('sends a direct message (draft or existing) by recipient', () => {
    expect(buildSendBody({ id: '', isGroup: false, otherUser: { id: 'u2', name: 'Dana' } }, 'f1', 'hi')).toEqual({
      recipientId: 'u2',
      facilityId: 'f1',
      messageText: 'hi',
    });
  });
});
