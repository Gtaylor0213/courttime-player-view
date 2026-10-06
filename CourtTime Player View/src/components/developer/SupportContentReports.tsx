import { getContentReports, resolveContentReport } from '../../api/supportClient';
import { ContentReportsQueue } from '../admin/ContentReportsQueue';

/** CourtTime team's queue: every report across every club, private messages included. */
export function SupportContentReports() {
  return (
    <ContentReportsQueue
      description="Every member report across all clubs, including private messages. Apple expects each to be acted on within 24 hours."
      showFacility
      load={getContentReports}
      resolve={resolveContentReport}
    />
  );
}
