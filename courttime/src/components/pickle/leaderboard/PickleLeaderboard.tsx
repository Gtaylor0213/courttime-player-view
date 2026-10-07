import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Trophy, Medal, Users, CalendarDays, Star } from 'lucide-react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { toast } from 'sonner';
import { facilitiesApi, pickleApi } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';
import { isPickleProductLine } from '../../../../shared/constants/productLine';
import { safeDisplayText } from '../../../../shared/utils/safeDisplayText';

type LeaderboardMetric =
  | 'all_time_visits'
  | 'month_visits'
  | 'year_visits'
  | 'programs_attended'
  | 'dupr_rating_snapshot';

interface PlayerStatEntry {
  userId: string;
  fullName: string;
  allTimeVisits: number;
  monthVisits: number;
  yearVisits: number;
  programsAttended: number;
  duprRatingSnapshot: number | null;
  rank: number;
}

interface LeaderboardData {
  scope: 'facility' | 'org';
  facilityId?: string;
  orgId: string;
  metric: LeaderboardMetric;
  entries: PlayerStatEntry[];
  currentUserEntry?: PlayerStatEntry;
}

const METRIC_LABELS: Record<LeaderboardMetric, string> = {
  all_time_visits: 'All-time visits',
  month_visits: 'Visits this month',
  year_visits: 'Visits this year',
  programs_attended: 'Programs attended',
  dupr_rating_snapshot: 'DUPR rating',
};

function formatMetricValue(entry: PlayerStatEntry, metric: LeaderboardMetric): string {
  switch (metric) {
    case 'all_time_visits':
      return String(entry.allTimeVisits);
    case 'month_visits':
      return String(entry.monthVisits);
    case 'year_visits':
      return String(entry.yearVisits);
    case 'programs_attended':
      return String(entry.programsAttended);
    case 'dupr_rating_snapshot':
      return entry.duprRatingSnapshot != null ? entry.duprRatingSnapshot.toFixed(2) : '—';
    default:
      return '0';
  }
}

function rankIcon(rank: number) {
  if (rank === 1) return <Trophy className="h-4 w-4 text-amber-500" />;
  if (rank === 2) return <Medal className="h-4 w-4 text-slate-400" />;
  if (rank === 3) return <Medal className="h-4 w-4 text-amber-700" />;
  return <span className="text-sm font-medium text-gray-500 w-4 text-center">{rank}</span>;
}

export function PickleLeaderboard() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [facilityName, setFacilityName] = useState('');
  const [isPickleFacility, setIsPickleFacility] = useState<boolean | null>(null);
  const [metric, setMetric] = useState<LeaderboardMetric>('all_time_visits');
  const [leaderboard, setLeaderboard] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!facilityId) {
      setLoading(false);
      return;
    }

    const loadFacility = async () => {
      try {
        const response = await facilitiesApi.getById(facilityId);
        if (response.success && response.data?.facility) {
          const facility = response.data.facility as { name?: string; productLine?: string; product_line?: string };
          setFacilityName(safeDisplayText(facility.name) || 'Club');
          const productLine = facility.productLine ?? facility.product_line;
          setIsPickleFacility(isPickleProductLine(productLine));
        } else {
          setIsPickleFacility(false);
        }
      } catch {
        setIsPickleFacility(false);
      }
    };

    loadFacility();
  }, [facilityId]);

  useEffect(() => {
    if (!facilityId || !user || isPickleFacility !== true) {
      if (isPickleFacility !== null) setLoading(false);
      return;
    }

    const loadLeaderboard = async () => {
      setLoading(true);
      try {
        const result = await pickleApi.getFacilityLeaderboard(facilityId, metric);
        if (result.success && result.data) {
          const data = (result.data as { data?: { leaderboard?: LeaderboardData } }).data?.leaderboard
            ?? (result.data as { leaderboard?: LeaderboardData }).leaderboard;
          if (data) setLeaderboard(data);
        } else if (result.error) {
          toast.error(result.error);
        }
      } catch {
        toast.error('Failed to load leaderboard');
      } finally {
        setLoading(false);
      }
    };

    loadLeaderboard();
  }, [facilityId, user, isPickleFacility, metric]);

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p>Please log in to view club leaderboards.</p>
        <Button className="mt-4" onClick={() => navigate('/login')}>Log in</Button>
      </div>
    );
  }

  if (isPickleFacility === false) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <p className="text-gray-600">Leaderboards are available at CourtTime-Pickle locations only.</p>
        <Button variant="outline" onClick={() => navigate('/calendar')}>Back to Calendar</Button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-700" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <p className="text-sm text-green-700 font-medium">CourtTime-Pickle</p>
          <h1 className="text-2xl font-bold text-gray-900">Club Leaderboard</h1>
          <p className="text-gray-500 text-sm">
            Compare activity at {facilityName || 'your club'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => navigate(`/pickle/community/${facilityId}`)}>
            Community
          </Button>
          <Button variant="outline" onClick={() => navigate('/calendar')}>
            Calendar
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Trophy className="h-5 w-5 text-green-700" />
                Rankings
              </CardTitle>
              <CardDescription>Based on visits and program attendance</CardDescription>
            </div>
            <Select value={metric} onValueChange={(value) => setMetric(value as LeaderboardMetric)}>
              <SelectTrigger className="w-full sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(METRIC_LABELS) as LeaderboardMetric[]).map((key) => (
                  <SelectItem key={key} value={key}>
                    {METRIC_LABELS[key]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {!leaderboard?.entries.length ? (
            <p className="text-center text-gray-500 py-8">
              No stats yet. Play at the club or join programs to appear on the board.
            </p>
          ) : (
            <div className="space-y-2">
              {leaderboard.entries.map((entry) => {
                const isCurrentUser = entry.userId === user.id;
                return (
                  <div
                    key={entry.userId}
                    className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
                      isCurrentUser ? 'border-green-300 bg-green-50' : 'border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex-shrink-0 w-6 flex justify-center">
                        {rankIcon(entry.rank)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">
                          {safeDisplayText(entry.fullName) || 'Player'}
                          {isCurrentUser && (
                            <Badge variant="outline" className="ml-2 text-green-700 border-green-300">
                              You
                            </Badge>
                          )}
                        </p>
                        <div className="flex flex-wrap gap-3 text-xs text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <CalendarDays className="h-3 w-3" />
                            {entry.allTimeVisits} visits
                          </span>
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {entry.programsAttended} programs
                          </span>
                          {entry.duprRatingSnapshot != null && (
                            <span className="flex items-center gap-1">
                              <Star className="h-3 w-3" />
                              DUPR {entry.duprRatingSnapshot.toFixed(2)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 pl-3">
                      <p className="text-lg font-semibold text-green-800">
                        {formatMetricValue(entry, metric)}
                      </p>
                      <p className="text-xs text-gray-500">{METRIC_LABELS[metric]}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {leaderboard?.currentUserEntry
            && !leaderboard.entries.some((entry) => entry.userId === user.id) && (
            <div className="mt-4 pt-4 border-t">
              <p className="text-sm text-gray-500 mb-2">Your rank</p>
              <div className="flex items-center justify-between rounded-lg border border-green-300 bg-green-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-500 w-6 text-center">
                    #{leaderboard.currentUserEntry.rank}
                  </span>
                  <span className="font-medium">{safeDisplayText(leaderboard.currentUserEntry.fullName)}</span>
                </div>
                <span className="text-lg font-semibold text-green-800">
                  {formatMetricValue(leaderboard.currentUserEntry, metric)}
                </span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
