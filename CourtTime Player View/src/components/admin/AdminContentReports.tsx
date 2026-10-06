import { useCallback } from 'react';
import { moderationApi } from '../../api/client';
import { useAppContext } from '../../contexts/AppContext';
import { Card, CardContent } from '../ui/card';
import { ContentReportsQueue, type ContentReport } from './ContentReportsQueue';

/** Club admin page: reported bulletin and hitting-partner posts at this club. */
export function AdminContentReports() {
  const { selectedFacilityId: facilityId } = useAppContext();

  const load = useCallback(
    async (status: 'open' | 'closed') => {
      const response = await moderationApi.listFacilityReports(facilityId as string, status);
      const data = response.data?.data ?? response.data;
      return {
        success: response.success,
        error: response.error,
        data: (data?.reports ?? []) as ContentReport[],
      };
    },
    [facilityId]
  );

  const resolve = useCallback(
    (reportId: string, action: 'remove' | 'dismiss') => moderationApi.resolveReport(reportId, action),
    []
  );

  if (!facilityId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-gray-400">
          Select a facility to view content reports.
        </CardContent>
      </Card>
    );
  }

  return (
    <ContentReportsQueue
      description="Posts your members have flagged on the bulletin board and hitting partner board. Review each within 24 hours. Reports about private messages are handled by the CourtTime team."
      load={load}
      resolve={resolve}
    />
  );
}
