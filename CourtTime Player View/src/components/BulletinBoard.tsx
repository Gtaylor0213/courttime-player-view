import React, { useState, useEffect } from 'react';
import { UnifiedSidebar } from './UnifiedSidebar';
import { ArrowLeft, Calendar, Clock, Users, MapPin, Tag, Pin, AlertCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { useAuth } from '../contexts/AuthContext';
import { bulletinBoardApi, playerProfileApi } from '../api/client';
import { toast } from 'sonner';

interface BulletinBoardProps {
  onBack: () => void;
  onLogout: () => void;
  onNavigateToProfile: () => void;
  onNavigateToPlayerDashboard: () => void;
  onNavigateToCalendar: () => void;
  onNavigateToClub?: (clubId: string) => void;
  onNavigateToBulletinBoard?: () => void;
  onNavigateToHittingPartner?: () => void;
  selectedFacilityId?: string;
  onFacilityChange?: (facilityId: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  clubId?: string;
  clubName?: string;
}

interface BulletinPost {
  id: string;
  title: string;
  description: string;
  type: 'event' | 'clinic' | 'tournament' | 'social' | 'announcement';
  eventDate?: string;
  eventTime?: string;
  location?: string;
  facilityId: string;
  facilityName: string;
  maxParticipants?: number;
  currentParticipants?: number;
  isPinned: boolean;
  createdAt: string;
  authorName: string;
}

const typeIcons = {
  event: Calendar,
  clinic: Users,
  tournament: Tag,
  social: Users,
  announcement: AlertCircle
};

const typeColors = {
  event: 'bg-blue-500',
  clinic: 'bg-green-500',
  tournament: 'bg-purple-500',
  social: 'bg-pink-500',
  announcement: 'bg-orange-500'
};

const cardColors = ['bg-yellow-100 border-yellow-200', 'bg-pink-100 border-pink-200', 'bg-blue-100 border-blue-200', 'bg-green-100 border-green-200', 'bg-orange-100 border-orange-200', 'bg-purple-100 border-purple-200'];
const rotations = [-2, 1, 2, -1, -3, 1.5];

export function BulletinBoard({
  onBack,
  onLogout,
  onNavigateToProfile,
  onNavigateToPlayerDashboard,
  onNavigateToCalendar,
  onNavigateToClub = () => {},
  onNavigateToBulletinBoard = () => {},
  onNavigateToHittingPartner = () => {},
  selectedFacilityId,
  onFacilityChange,
  sidebarCollapsed,
  onToggleSidebar,
  clubId,
  clubName
}: BulletinBoardProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<BulletinPost[]>([]);
  const [memberFacilities, setMemberFacilities] = useState<any[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedFacility, setSelectedFacility] = useState<string>(clubId || 'all');
  const [selectedPost, setSelectedPost] = useState<BulletinPost | null>(null);

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id, selectedFacility]);

  const loadData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Load user's facilities
      const profileResponse = await playerProfileApi.getProfile(user.id);
      if (profileResponse.success && profileResponse.data?.profile) {
        const facilities = profileResponse.data.profile.memberFacilities || [];
        setMemberFacilities(facilities.filter((f: any) => f.status === 'active'));
      }

      // Load bulletin posts
      if (selectedFacility === 'all') {
        // Load posts from all user's facilities
        const allPosts: BulletinPost[] = [];
        for (const facility of memberFacilities) {
          const response = await bulletinBoardApi.getPosts(facility.facilityId);
          if (response.success && response.data?.posts) {
            allPosts.push(...response.data.posts);
          }
        }
        setPosts(allPosts);
      } else {
        const response = await bulletinBoardApi.getPosts(selectedFacility);
        if (response.success && response.data?.posts) {
          setPosts(response.data.posts);
        }
      }
    } catch (error) {
      console.error('Error loading bulletin board data:', error);
      toast.error('Failed to load bulletin board');
    } finally {
      setLoading(false);
    }
  };

  // Filter by type
  let filteredPosts = posts;
  if (selectedType !== 'all') {
    filteredPosts = filteredPosts.filter(post => post.type === selectedType);
  }

  // Sort: pinned first, then by date
  filteredPosts = filteredPosts.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const TypeIcon = selectedPost ? typeIcons[selectedPost.type] : Calendar;

  const hasNoFacilities = memberFacilities.length === 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium">Loading bulletin board...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <UnifiedSidebar
        userType="player"
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToPlayerDashboard={onNavigateToPlayerDashboard}
        onNavigateToCalendar={onNavigateToCalendar}
        onNavigateToClub={onNavigateToClub}
        onNavigateToBulletinBoard={onNavigateToBulletinBoard}
        onNavigateToHittingPartner={onNavigateToHittingPartner}
        onLogout={onLogout}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        currentPage="bulletin-board"
      />

      <div className={`flex-1 ${sidebarCollapsed ? 'ml-16' : 'ml-64'} transition-all duration-300 ease-in-out`}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold">Bulletin Board</h1>
              <p className="text-sm text-gray-600">
                {hasNoFacilities
                  ? 'Join a facility to see events and announcements'
                  : 'Events, clinics, and announcements from your clubs'}
              </p>
            </div>
            {!hasNoFacilities && (
              <div className="flex items-center gap-3">
                <Select value={selectedFacility} onValueChange={setSelectedFacility}>
                  <SelectTrigger className="w-[240px]">
                    <SelectValue placeholder="Select a facility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Facilities</SelectItem>
                    {memberFacilities.map(facility => (
                      <SelectItem key={facility.facilityId} value={facility.facilityId}>
                        {facility.facilityName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-w-7xl mx-auto">
          {/* No Facility Alert */}
          {hasNoFacilities && (
            <Card className="mb-6 border-blue-200 bg-blue-50">
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-medium text-blue-900 mb-1">No Facility Membership</h3>
                    <p className="text-sm text-blue-800 mb-3">
                      You're not currently a member of any facility. Request membership to see events and announcements.
                    </p>
                    <Button
                      onClick={onNavigateToProfile}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      Request Membership
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* Filter Tabs */}
          {!hasNoFacilities && (
            <div className="mb-6 flex gap-2 flex-wrap">
              <Button
                variant={selectedType === 'all' ? 'default' : 'outline'}
                onClick={() => setSelectedType('all')}
                className="rounded-full"
              >
                All Posts
              </Button>
              <Button
                variant={selectedType === 'event' ? 'default' : 'outline'}
                onClick={() => setSelectedType('event')}
                className="rounded-full"
              >
                <Calendar className="h-4 w-4 mr-2" />
                Events
              </Button>
              <Button
                variant={selectedType === 'clinic' ? 'default' : 'outline'}
                onClick={() => setSelectedType('clinic')}
                className="rounded-full"
              >
                <Users className="h-4 w-4 mr-2" />
                Clinics
              </Button>
              <Button
                variant={selectedType === 'tournament' ? 'default' : 'outline'}
                onClick={() => setSelectedType('tournament')}
                className="rounded-full"
              >
                <Tag className="h-4 w-4 mr-2" />
                Tournaments
              </Button>
              <Button
                variant={selectedType === 'social' ? 'default' : 'outline'}
                onClick={() => setSelectedType('social')}
                className="rounded-full"
              >
                <Users className="h-4 w-4 mr-2" />
                Social
              </Button>
              <Button
                variant={selectedType === 'announcement' ? 'default' : 'outline'}
                onClick={() => setSelectedType('announcement')}
                className="rounded-full"
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Announcements
              </Button>
            </div>
          )}

          {/* Bulletin Board - Cork Board Style */}
          {!hasNoFacilities && (
            <div className="relative bg-gradient-to-br from-amber-700 via-amber-800 to-amber-900 rounded-lg p-12 shadow-xl min-h-[600px]">
              {/* Cork texture overlay */}
              <div className="absolute inset-0 opacity-30 rounded-lg"
                   style={{
                     backgroundImage: `radial-gradient(circle at 20% 50%, rgba(0,0,0,.1) 1px, transparent 1px),
                                      radial-gradient(circle at 80% 80%, rgba(0,0,0,.1) 1px, transparent 1px),
                                      radial-gradient(circle at 40% 20%, rgba(0,0,0,.1) 1px, transparent 1px),
                                      radial-gradient(circle at 60% 90%, rgba(0,0,0,.1) 1px, transparent 1px)`,
                     backgroundSize: '100px 100px, 120px 120px, 80px 80px, 150px 150px',
                     backgroundPosition: '0 0, 40px 40px, 20px 60px, 80px 20px'
                   }}>
              </div>

              {/* Empty State */}
              {filteredPosts.length === 0 && (
                <div className="relative flex items-center justify-center h-[400px]">
                  <Card className="bg-white p-8 text-center max-w-md">
                    <Calendar className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No posts yet</h3>
                    <p className="text-sm text-gray-600">
                      {selectedType === 'all'
                        ? 'Check back later for events and announcements from your facilities.'
                        : `No ${selectedType} posts at the moment.`}
                    </p>
                  </Card>
                </div>
              )}

              {/* Pinned Notes Grid */}
              {filteredPosts.length > 0 && (
                <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {filteredPosts.map((post, index) => {
                    const Icon = typeIcons[post.type];
                    const colorIndex = index % cardColors.length;
                    const rotationIndex = index % rotations.length;
                    return (
                      <div
                        key={post.id}
                        className="relative group cursor-pointer"
                        onClick={() => setSelectedPost(post)}
                      >
                        {/* Push Pin */}
                        <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 z-10">
                          <Pin className={`h-6 w-6 ${post.isPinned ? 'text-red-600 fill-red-600' : 'text-gray-400 fill-gray-400'} drop-shadow-md`} />
                        </div>

                        {/* Note Card */}
                        <Card
                          className={`${cardColors[colorIndex]} border-2 p-5 shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 relative overflow-hidden rounded-none`}
                        >
                          {/* Tape effect on corners */}
                          <div className="absolute top-0 right-0 w-16 h-6 bg-white/40 shadow-sm"></div>
                          <div className="absolute bottom-0 left-0 w-16 h-6 bg-white/40 shadow-sm"></div>

                          <div className="space-y-3">
                            {/* Header */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex-1">
                                <h3 className="font-bold text-gray-800 text-lg leading-tight">{post.title}</h3>
                                <p className="text-xs text-gray-600 font-medium mt-1">{post.facilityName}</p>
                              </div>
                              <div className={`${typeColors[post.type]} p-1.5 rounded-full flex-shrink-0`}>
                                <Icon className="h-4 w-4 text-white" />
                              </div>
                            </div>

                            {/* Description */}
                            <p className="text-sm text-gray-700 line-clamp-3">{post.description}</p>

                            {/* Details */}
                            {(post.eventDate || post.eventTime) && (
                              <div className="space-y-2 text-sm">
                                {post.eventDate && (
                                  <div className="flex items-center text-gray-700">
                                    <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                                    <span className="font-medium">{new Date(post.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                  </div>
                                )}
                                {post.eventTime && (
                                  <div className="flex items-center text-gray-700">
                                    <Clock className="h-4 w-4 mr-2 flex-shrink-0" />
                                    <span>{post.eventTime}</span>
                                  </div>
                                )}
                                {post.maxParticipants && (
                                  <div className="flex items-center text-gray-700">
                                    <Users className="h-4 w-4 mr-2 flex-shrink-0" />
                                    <span className="font-medium">{(post.maxParticipants - (post.currentParticipants || 0))} spots left</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Author & Date */}
                            <div className="pt-2 border-t border-gray-300 text-xs text-gray-600">
                              <p>Posted by {post.authorName}</p>
                              <p>{new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                            </div>
                          </div>
                        </Card>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail Modal */}
      {selectedPost && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPost(null)}
        >
          <Card
            className="max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`${typeColors[selectedPost.type]} p-2 rounded-lg`}>
                      <TypeIcon className="h-5 w-5 text-white" />
                    </div>
                    <h2 className="text-2xl font-bold">{selectedPost.title}</h2>
                  </div>
                  <Badge className="capitalize">{selectedPost.type}</Badge>
                </div>
                <Button variant="ghost" onClick={() => setSelectedPost(null)}>
                  ✕
                </Button>
              </div>

              {/* Content */}
              <div className="space-y-6">
                <p className="text-gray-700 text-base">{selectedPost.description}</p>

                {/* Details Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-3">
                    {selectedPost.eventDate && (
                      <div className="flex items-start">
                        <Calendar className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                        <div>
                          <p className="text-sm text-gray-500">Date</p>
                          <p className="font-medium">{new Date(selectedPost.eventDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                        </div>
                      </div>
                    )}
                    {selectedPost.eventTime && (
                      <div className="flex items-start">
                        <Clock className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                        <div>
                          <p className="text-sm text-gray-500">Time</p>
                          <p className="font-medium">{selectedPost.eventTime}</p>
                        </div>
                      </div>
                    )}
                    {selectedPost.location && (
                      <div className="flex items-start">
                        <MapPin className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                        <div>
                          <p className="text-sm text-gray-500">Location</p>
                          <p className="font-medium">{selectedPost.location}</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start">
                      <Users className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-500">Facility</p>
                        <p className="font-medium">{selectedPost.facilityName}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedPost.maxParticipants && (
                      <div className="flex items-start">
                        <Users className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                        <div>
                          <p className="text-sm text-gray-500">Availability</p>
                          <p className="font-medium">
                            {selectedPost.maxParticipants - (selectedPost.currentParticipants || 0)} of {selectedPost.maxParticipants} spots available
                          </p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start">
                      <Users className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-500">Posted By</p>
                        <p className="font-medium">{selectedPost.authorName}</p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <Calendar className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-500">Posted</p>
                        <p className="font-medium">{new Date(selectedPost.createdAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button className="flex-1" onClick={() => toast.info('Registration feature coming soon')}>
                    {selectedPost.type === 'announcement' ? 'Acknowledge' : 'Register Interest'}
                  </Button>
                  <Button variant="outline" className="flex-1" onClick={() => toast.info('Share feature coming soon')}>
                    Share
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
