/**
 * Blocking members and reporting offensive content (App Store Guideline 1.2).
 */

import { api } from './client';

export type ReportContentType = 'message' | 'bulletin_post' | 'hitting_partner_post' | 'user';
export type ReportReason = 'spam' | 'harassment' | 'inappropriate' | 'other';

export interface BlockedUser {
  userId: string;
  fullName: string;
  blockedAt: string;
}

export const moderationApi = {
  listBlocked: () => api.get<{ blockedUsers: BlockedUser[] }>('/api/moderation/blocks'),
  block: (userId: string) => api.post('/api/moderation/blocks', { userId }),
  unblock: (userId: string) => api.delete(`/api/moderation/blocks/${userId}`),
  report: (body: {
    contentType: ReportContentType;
    contentId: string;
    reason: ReportReason;
    details?: string;
    facilityId?: string | null;
  }) => api.post('/api/moderation/reports', body),
};

// ── Club admin review queue ──

export interface ContentReport {
  id: string;
  contentType: ReportContentType;
  reason: ReportReason;
  details: string | null;
  contentSnapshot: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string;
  reporterName: string | null;
  reportedUserName: string | null;
}

export const moderationAdminApi = {
  list: (facilityId: string, status: 'open' | 'closed') =>
    api.get<{ reports: ContentReport[] }>(`/api/moderation/reports/facility/${facilityId}?status=${status}`),
  resolve: (reportId: string, action: 'remove' | 'dismiss') =>
    api.post(`/api/moderation/reports/${reportId}/resolve`, { action }),
};
