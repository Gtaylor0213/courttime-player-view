import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { NotificationBell } from './NotificationBell';
import { Calendar, Clock, Users, MapPin, Tag, Pin, AlertCircle, Plus, X } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { useAuth } from '../contexts/AuthContext';
import { bulletinBoardApi, playerProfileApi, facilitiesApi } from '../api/client';
import { toast } from 'sonner';


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

const typeColors: Record<string, string> = {
  event: 'bg-green-500',
  clinic: 'bg-green-500',
  tournament: 'bg-purple-500',
  social: 'bg-pink-500',
  announcement: 'bg-orange-500'
};

export function BulletinBoard() {
  const [searchParams] = useSearchParams();
  const clubId = searchParams.get('clubId') || undefined;
  const clubName = searchParams.get('clubName') || undefined;
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<BulletinPost[]>([]);
  const [memberFacilities, setMemberFacilities] = useState<any[]>([]);
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedFacility, setSelectedFacility] = useState<string>(clubId || 'all');
  const [selectedPost, setSelectedPost] = useState<BulletinPost | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newPost, setNewPost] = useState({
    title: '',
    description: '',
    type: 'announcement' as 'event' | 'clinic' | 'tournament' | 'social' | 'announcement',
    eventDate: '',
    eventTime: '',
    location: '',
    maxParticipants: '',
    facilityId: ''
  });

  // Check if user is admin of any facility
  const adminFacilities = memberFacilities.filter((f: any) => f.isFacilityAdmin);
  const isAdmin = adminFacilities.length > 0;

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id, selectedFacility]);

  // Map database response to frontend BulletinPost interface
  const mapPostFromApi = (post: any): BulletinPost => ({
    id: post.id,
    title: post.title,
    description: post.content || post.description || '',
    type: post.category || post.type || 'announcement',
    eventDate: post.eventDate || post.postedDate,
    eventTime: post.eventTime,
    location: post.location,
    facilityId: post.facilityId,
    facilityName: post.facilityName || '',
    maxParticipants: post.maxParticipants,
    currentParticipants: post.currentParticipants,
    isPinned: post.isPinned || false,
    createdAt: post.createdAt,
    authorName: post.authorName || 'Unknown'
  });

  const loadData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Load user's facilities with full details
      const profileResponse = await playerProfileApi.getProfile(user.id);
      console.log('BulletinBoard - Profile API response:', profileResponse);

      let activeFacilities: any[] = [];

      // Check for facilities in the API response (handles both data.profile and direct profile)
      let facilities = profileResponse.data?.profile?.memberFacilities
        || profileResponse.data?.memberFacilities
        || [];

      // Filter for active status
      activeFacilities = facilities.filter((f: any) => f.status === 'active');

      // If API didn't return facilities, fall back to AuthContext and fetch details
      if (activeFacilities.length === 0 && user.memberFacilities && user.memberFacilities.length > 0) {
        console.log('BulletinBoard - Falling back to AuthContext memberFacilities:', user.memberFacilities);
        // Fetch facility details for each facility ID from AuthContext
        for (const facilityId of user.memberFacilities) {
          try {
            const facilityResponse = await facilitiesApi.getById(facilityId);
            if (facilityResponse.success && facilityResponse.data?.facility) {
              activeFacilities.push({
                facilityId: facilityResponse.data.facility.id,
                facilityName: facilityResponse.data.facility.name,
                membershipType: 'Member',
                status: 'active',
                isFacilityAdmin: false
              });
            }
          } catch (err) {
            console.error('Error fetching facility details:', err);
          }
        }
      }

      setMemberFacilities(activeFacilities);

      // Load bulletin posts
      if (selectedFacility === 'all') {
        // Load posts from all user's facilities - only if they have facilities
        const allPosts: BulletinPost[] = [];
        if (activeFacilities.length > 0) {
          for (const facility of activeFacilities) {
            const response = await bulletinBoardApi.getPosts(facility.facilityId);
            if (response.success && response.data?.posts) {
              const mappedPosts = response.data.posts.map((p: any) => ({
                ...mapPostFromApi(p),
                facilityName: facility.facilityName
              }));
              allPosts.push(...mappedPosts);
            }
          }
        }
        setPosts(allPosts);
      } else {
        // Only load posts for specific facility if user is a member
        const isMember = activeFacilities.some((f: any) => f.facilityId === selectedFacility);
        if (!isMember) {
          setPosts([]);
          setLoading(false);
          return;
        }
        const response = await bulletinBoardApi.getPosts(selectedFacility);
        if (response.success && response.data?.posts) {
          const facility = activeFacilities.find((f: any) => f.facilityId === selectedFacility);
          const mappedPosts = response.data.posts.map((p: any) => ({
            ...mapPostFromApi(p),
            facilityName: facility?.facilityName || ''
          }));
          setPosts(mappedPosts);
        }
      }
    } catch (error) {
      console.error('Error loading bulletin board data:', error);
      toast.error('Failed to load bulletin board');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!user?.id || !newPost.title || !newPost.description || !newPost.facilityId) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await bulletinBoardApi.create({
        facilityId: newPost.facilityId,
        authorId: user.id,
        title: newPost.title,
        content: newPost.description,
        category: newPost.type,
        isAdminPost: true
      });

      if (response.success) {
        toast.success('Post created successfully!');
        setShowCreateModal(false);
        setNewPost({
          title: '',
          description: '',
          type: 'announcement',
          eventDate: '',
          eventTime: '',
          location: '',
          maxParticipants: '',
          facilityId: ''
        });
        // Reload posts
        loadData();
      } else {
        toast.error(response.error || 'Failed to create post');
      }
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Failed to create post');
    } finally {
      setIsSubmitting(false);
    }
  };

  const openCreateModal = () => {
    // Pre-select facility if only one admin facility or if a specific facility is selected
    const defaultFacility = selectedFacility !== 'all' && adminFacilities.some(f => f.facilityId === selectedFacility)
      ? selectedFacility
      : adminFacilities.length === 1
        ? adminFacilities[0].facilityId
        : '';

    setNewPost(prev => ({ ...prev, facilityId: defaultFacility }));
    setShowCreateModal(true);
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
    <>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-medium">Bulletin Board</h1>
              <p className="text-sm text-gray-600">
                {hasNoFacilities
                  ? 'Join a facility to see events and announcements'
                  : 'Events, clinics, and announcements from your clubs'}
              </p>
            </div>
            {!hasNoFacilities && (
              <div className="flex items-center gap-3">
                {isAdmin && (
                  <Button onClick={openCreateModal} className="gap-2">
                    <Plus className="h-4 w-4" />
                    Create Post
                  </Button>
                )}
                <NotificationBell />
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
            <Card className="mb-6 border-green-200 bg-green-50">
              <div className="p-6">
                <div className="flex items-start gap-4">
                  <AlertCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-medium text-green-900 mb-1">No Facility Membership</h3>
                    <p className="text-sm text-green-800 mb-3">
                      You're not currently a member of any facility. Request membership to see events and announcements.
                    </p>
                    <Button
                      onClick={() => navigate('/profile')}
                      size="sm"
                      className="bg-green-600 hover:bg-green-700"
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

          {/* Bulletin Board Posts */}
          {!hasNoFacilities && (
            <div className="space-y-4">
              {/* Empty State */}
              {filteredPosts.length === 0 && (
                <Card className="p-8 text-center">
                  <Calendar className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No posts yet</h3>
                  <p className="text-sm text-gray-500">
                    {selectedType === 'all'
                      ? 'Check back later for events and announcements from your facilities.'
                      : `No ${selectedType} posts at the moment.`}
                  </p>
                </Card>
              )}

              {/* Posts Grid */}
              {filteredPosts.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredPosts.map((post) => {
                    const Icon = typeIcons[post.type] || AlertCircle;
                    const bgColor = {
                      event: 'bg-green-50 border-green-100',
                      clinic: 'bg-green-50 border-green-100',
                      tournament: 'bg-purple-50 border-purple-100',
                      social: 'bg-pink-50 border-pink-100',
                      announcement: 'bg-orange-50 border-orange-100'
                    }[post.type] || 'bg-gray-50 border-gray-100';

                    return (
                      <Card
                        key={post.id}
                        className={`${bgColor} border hover:shadow-md transition-shadow cursor-pointer`}
                        onClick={() => setSelectedPost(post)}
                      >
                        <div className="p-6">
                          {/* Header with type badge */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                {post.isPinned && (
                                  <Pin className="h-3.5 w-3.5 text-red-500 fill-red-500 flex-shrink-0" />
                                )}
                                <h3 className="font-semibold text-gray-900 truncate">{post.title}</h3>
                              </div>
                              <p className="text-xs text-gray-500">{post.facilityName}</p>
                            </div>
                            <Badge variant="outline" className="text-gray-700 text-xs capitalize flex-shrink-0 bg-white/80">
                              <Icon className={`h-3 w-3 mr-1 ${typeColors[post.type]?.replace('bg-', 'text-') || 'text-gray-500'}`} />
                              {post.type}
                            </Badge>
                          </div>

                          {/* Description */}
                          <p className="text-sm text-gray-600 line-clamp-2 mb-4">{post.description}</p>

                          {/* Event Details */}
                          {post.eventDate && (
                            <div className="flex items-center gap-4 text-sm text-gray-600 mb-4">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="h-4 w-4 text-gray-400" />
                                <span>{new Date(post.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                              </div>
                              {post.eventTime && (
                                <div className="flex items-center gap-1.5">
                                  <Clock className="h-4 w-4 text-gray-400" />
                                  <span>{post.eventTime}</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Footer */}
                          <div className="flex items-center justify-between pt-3 border-t border-gray-200">
                            <span className="text-xs text-gray-500">
                              Posted by {post.authorName}
                            </span>
                            <span className="text-xs text-gray-400">
                              {new Date(post.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </span>
                          </div>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          )}
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

      {/* Create Post Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowCreateModal(false)}
        >
          <Card
            className="max-w-xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold">Create Bulletin Post</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowCreateModal(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Form */}
              <div className="space-y-4">
                {/* Facility Selection */}
                <div className="space-y-2">
                  <Label htmlFor="facility">Facility *</Label>
                  <Select
                    value={newPost.facilityId}
                    onValueChange={(value) => setNewPost(prev => ({ ...prev, facilityId: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select a facility" />
                    </SelectTrigger>
                    <SelectContent>
                      {adminFacilities.map(facility => (
                        <SelectItem key={facility.facilityId} value={facility.facilityId}>
                          {facility.facilityName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Post Type */}
                <div className="space-y-2">
                  <Label htmlFor="type">Post Type *</Label>
                  <Select
                    value={newPost.type}
                    onValueChange={(value: 'event' | 'clinic' | 'tournament' | 'social' | 'announcement') =>
                      setNewPost(prev => ({ ...prev, type: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="announcement">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-orange-500" />
                          Announcement
                        </div>
                      </SelectItem>
                      <SelectItem value="event">
                        <div className="flex items-center gap-2">
                          <Calendar className="h-4 w-4 text-green-500" />
                          Event
                        </div>
                      </SelectItem>
                      <SelectItem value="clinic">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-green-500" />
                          Clinic
                        </div>
                      </SelectItem>
                      <SelectItem value="tournament">
                        <div className="flex items-center gap-2">
                          <Tag className="h-4 w-4 text-purple-500" />
                          Tournament
                        </div>
                      </SelectItem>
                      <SelectItem value="social">
                        <div className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-pink-500" />
                          Social
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Title *</Label>
                  <Input
                    id="title"
                    value={newPost.title}
                    onChange={(e) => setNewPost(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter post title"
                  />
                </div>

                {/* Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Description *</Label>
                  <Textarea
                    id="description"
                    value={newPost.description}
                    onChange={(e) => setNewPost(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Enter post description"
                    rows={4}
                  />
                </div>

                {/* Event-specific fields */}
                {newPost.type !== 'announcement' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="eventDate">Event Date</Label>
                        <Input
                          id="eventDate"
                          type="date"
                          value={newPost.eventDate}
                          onChange={(e) => setNewPost(prev => ({ ...prev, eventDate: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="eventTime">Event Time</Label>
                        <Input
                          id="eventTime"
                          type="time"
                          value={newPost.eventTime}
                          onChange={(e) => setNewPost(prev => ({ ...prev, eventTime: e.target.value }))}
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        value={newPost.location}
                        onChange={(e) => setNewPost(prev => ({ ...prev, location: e.target.value }))}
                        placeholder="e.g., Main Court, Club House"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="maxParticipants">Max Participants</Label>
                      <Input
                        id="maxParticipants"
                        type="number"
                        min="0"
                        value={newPost.maxParticipants}
                        onChange={(e) => setNewPost(prev => ({ ...prev, maxParticipants: e.target.value }))}
                        placeholder="Leave empty for unlimited"
                      />
                    </div>
                  </>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-4">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowCreateModal(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleCreatePost}
                    disabled={isSubmitting || !newPost.title || !newPost.description || !newPost.facilityId}
                  >
                    {isSubmitting ? 'Creating...' : 'Create Post'}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
