import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { MessageSquare, Trophy, CalendarDays, Users, ArrowRight } from 'lucide-react';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { toast } from 'sonner';
import { bulletinBoardApi, facilitiesApi, extractBulletinPosts } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';
import { useAppContext } from '../../../contexts/AppContext';
import { isPickleProductLine } from '../../../../shared/constants/productLine';
import { safeDisplayText } from '../../../../shared/utils/safeDisplayText';

interface BulletinPreviewPost {
  id: string;
  title: string;
  description: string;
  type: string;
  authorName: string;
  createdAt: string;
  isPinned?: boolean;
}

export function PickleCommunityHub() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { setSelectedFacilityId } = useAppContext();
  const [facilityName, setFacilityName] = useState('');
  const [isPickleFacility, setIsPickleFacility] = useState<boolean | null>(null);
  const [posts, setPosts] = useState<BulletinPreviewPost[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (facilityId) {
      setSelectedFacilityId(facilityId);
    }
  }, [facilityId, setSelectedFacilityId]);

  useEffect(() => {
    if (!facilityId) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const facilityResponse = await facilitiesApi.getById(facilityId);
        if (facilityResponse.success && facilityResponse.data?.facility) {
          const facility = facilityResponse.data.facility as {
            name?: string;
            productLine?: string;
            product_line?: string;
          };
          setFacilityName(safeDisplayText(facility.name) || 'Club');
          const productLine = facility.productLine ?? facility.product_line;
          const pickle = isPickleProductLine(productLine);
          setIsPickleFacility(pickle);

          if (pickle) {
            const postsResponse = await bulletinBoardApi.getPosts(facilityId);
            if (postsResponse.success) {
              const allPosts = extractBulletinPosts(postsResponse) as BulletinPreviewPost[];
              setPosts(allPosts.slice(0, 5));
            }
          }
        } else {
          setIsPickleFacility(false);
        }
      } catch {
        toast.error('Failed to load community hub');
        setIsPickleFacility(false);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [facilityId]);

  if (!user) {
    return (
      <div className="p-8 text-center">
        <p>Please log in to view your club community.</p>
        <Button className="mt-4" onClick={() => navigate('/login')}>Log in</Button>
      </div>
    );
  }

  if (isPickleFacility === false) {
    return (
      <div className="max-w-2xl mx-auto p-8 text-center space-y-4">
        <p className="text-gray-600">The community hub is available at CourtTime-Pickle locations only.</p>
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
          <h1 className="text-2xl font-bold text-gray-900">Community</h1>
          <p className="text-gray-500 text-sm">
            Stay connected at {facilityName || 'your club'}
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/calendar')}>
          Calendar
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="cursor-pointer hover:border-green-300 transition-colors" onClick={() => navigate('/bulletin-board')}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-green-700" />
              Bulletin Board
            </CardTitle>
            <CardDescription>Events, clinics, and announcements</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="link" className="px-0 text-green-700">
              Open full board <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-green-300 transition-colors"
          onClick={() => navigate(`/pickle/leaderboard/${facilityId}`)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Trophy className="h-4 w-4 text-green-700" />
              Leaderboard
            </CardTitle>
            <CardDescription>Compare visits and program stats</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="link" className="px-0 text-green-700">
              View rankings <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:border-green-300 transition-colors"
          onClick={() => navigate(`/pickle/programs/${facilityId}`)}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-green-700" />
              Programs
            </CardTitle>
            <CardDescription>Open play, leagues, and clinics</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="link" className="px-0 text-green-700">
              Browse programs <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-green-700" />
                Recent from the bulletin
              </CardTitle>
              <CardDescription>Latest posts at this club</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/bulletin-board')}>
              View all
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!posts.length ? (
            <p className="text-center text-gray-500 py-6">
              No bulletin posts yet. Check back soon or visit the full bulletin board.
            </p>
          ) : (
            <div className="space-y-3">
              {posts.map((post) => (
                <div
                  key={post.id}
                  className="rounded-lg border border-gray-200 p-4 hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate('/bulletin-board')}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{safeDisplayText(post.title)}</p>
                      <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                        {safeDisplayText(post.description)}
                      </p>
                      <p className="text-xs text-gray-400 mt-2">
                        {safeDisplayText(post.authorName)} · {new Date(post.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                      <Badge variant="outline" className="capitalize">
                        {post.type}
                      </Badge>
                      {post.isPinned && (
                        <Badge className="bg-green-100 text-green-800">Pinned</Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
