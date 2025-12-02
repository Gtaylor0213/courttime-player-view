import React, { useState, useEffect } from 'react';
import { UnifiedSidebar } from './UnifiedSidebar';
import { NotificationBell } from './NotificationBell';
import { Search, Filter, Users, Calendar, Plus, X, Building, Edit, Trash2, AlertCircle, MessageCircle } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { hittingPartnerApi, playerProfileApi, facilitiesApi } from '../api/client';
import { Button } from './ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';
import { toast } from 'sonner';

interface FindHittingPartnerProps {
  onBack: () => void;
  onLogout: () => void;
  onNavigateToProfile: () => void;
  onNavigateToPlayerDashboard: () => void;
  onNavigateToCalendar: () => void;
  onNavigateToClub?: (clubId: string) => void;
  onNavigateToBulletinBoard?: () => void;
  onNavigateToMessages?: (recipientId?: string) => void;
  onNavigateToAdminDashboard?: () => void;
  onNavigateToFacilityManagement?: () => void;
  onNavigateToCourtManagement?: () => void;
  onNavigateToBookingManagement?: () => void;
  onNavigateToAdminBooking?: () => void;
  onNavigateToMemberManagement?: () => void;
  selectedFacilityId?: string;
  onFacilityChange?: (facilityId: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

export function FindHittingPartner({
  onBack,
  onLogout,
  onNavigateToProfile,
  onNavigateToPlayerDashboard,
  onNavigateToCalendar,
  onNavigateToClub = () => {},
  onNavigateToBulletinBoard = () => {},
  onNavigateToMessages = () => {},
  onNavigateToAdminDashboard = () => {},
  onNavigateToFacilityManagement = () => {},
  onNavigateToCourtManagement = () => {},
  onNavigateToBookingManagement = () => {},
  onNavigateToAdminBooking = () => {},
  onNavigateToMemberManagement = () => {},
  selectedFacilityId,
  onFacilityChange,
  sidebarCollapsed,
  onToggleSidebar
}: FindHittingPartnerProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState<any[]>([]);
  const [memberFacilities, setMemberFacilities] = useState<any[]>([]);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [editingPost, setEditingPost] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterPlayStyle, setFilterPlayStyle] = useState('all');
  const [selectedFacilityFilter, setSelectedFacilityFilter] = useState<string>(selectedFacilityId || 'all');

  // Form state for creating/editing post
  const [formData, setFormData] = useState({
    facilityId: '',
    availability: '',
    playStyle: [] as string[],
    description: '',
    expiresInDays: 30
  });

  useEffect(() => {
    if (user?.id) {
      loadData();
    }
  }, [user?.id, selectedFacilityFilter]);

  const loadData = async () => {
    if (!user?.id) return;

    try {
      setLoading(true);

      // Load user's facilities with full details
      const profileResponse = await playerProfileApi.getProfile(user.id);
      console.log('HittingPartner - Profile API response:', profileResponse);

      let activeFacilities: any[] = [];

      // Check for facilities in the API response (handles both data.profile and direct profile)
      let facilities = profileResponse.data?.profile?.memberFacilities
        || profileResponse.data?.memberFacilities
        || [];

      // Filter for active status
      activeFacilities = facilities.filter((f: any) => f.status === 'active');

      // If API didn't return facilities, fall back to AuthContext and fetch details
      if (activeFacilities.length === 0 && user.memberFacilities && user.memberFacilities.length > 0) {
        console.log('HittingPartner - Falling back to AuthContext memberFacilities:', user.memberFacilities);
        // Fetch facility details for each facility ID from AuthContext
        for (const facilityId of user.memberFacilities) {
          try {
            const facilityResponse = await facilitiesApi.getById(facilityId);
            if (facilityResponse.success && facilityResponse.data?.facility) {
              activeFacilities.push({
                facilityId: facilityResponse.data.facility.id,
                facilityName: facilityResponse.data.facility.name,
                membershipType: 'Member',
                status: 'active'
              });
            }
          } catch (err) {
            console.error('Error fetching facility details:', err);
          }
        }
      }

      setMemberFacilities(activeFacilities);

      // Set default facility for creating posts
      if (activeFacilities.length > 0 && !formData.facilityId) {
        setFormData(prev => ({ ...prev, facilityId: activeFacilities[0].facilityId }));
      }

      // Load hitting partner posts - filter by member facilities
      let postsResponse;
      if (selectedFacilityFilter === 'all' || !selectedFacilityFilter) {
        // If user has facilities, fetch posts from all their facilities
        if (activeFacilities.length > 0) {
          // Fetch posts from all member facilities
          const facilityIds = activeFacilities.map((f: any) => f.facilityId);
          const allPosts: any[] = [];

          for (const facilityId of facilityIds) {
            const response = await hittingPartnerApi.getByFacility(facilityId);
            if (response.success && response.data?.posts) {
              allPosts.push(...response.data.posts);
            }
          }

          // Remove duplicates and set posts
          const uniquePosts = Array.from(new Map(allPosts.map(post => [post.id, post])).values());
          setPosts(uniquePosts);
        } else {
          // If no facilities, show NO posts (user must join a facility first)
          setPosts([]);
        }
        setLoading(false);
        return;
      } else {
        // Show posts for specific facility - but only if user is a member
        const isMember = activeFacilities.some((f: any) => f.facilityId === selectedFacilityFilter);
        if (isMember) {
          postsResponse = await hittingPartnerApi.getByFacility(selectedFacilityFilter);
        } else {
          // User is not a member of this facility
          setPosts([]);
          setLoading(false);
          return;
        }
      }

      if (postsResponse.success && postsResponse.data?.posts) {
        setPosts(postsResponse.data.posts);
      }
    } catch (error) {
      console.error('Error loading hitting partner data:', error);
      toast.error('Failed to load hitting partner posts');
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePost = async () => {
    if (!user?.id) return;

    if (!formData.facilityId) {
      toast.error('Please select a facility');
      return;
    }

    if (!formData.availability || !formData.description || formData.playStyle.length === 0) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (formData.expiresInDays < 7 || formData.expiresInDays > 90) {
      toast.error('Expiration must be between 7 and 90 days');
      return;
    }

    try {
      const response = await hittingPartnerApi.create({
        userId: user.id,
        facilityId: formData.facilityId,
        availability: formData.availability,
        playStyle: formData.playStyle,
        description: formData.description,
        expiresInDays: formData.expiresInDays
      });

      if (response.success) {
        toast.success('Hitting partner post created!');
        setShowCreatePost(false);
        resetForm();
        loadData();
      } else {
        toast.error(response.error || 'Failed to create post');
      }
    } catch (error) {
      console.error('Error creating post:', error);
      toast.error('Failed to create post');
    }
  };

  const handleUpdatePost = async () => {
    if (!user?.id || !editingPost) return;

    try {
      const response = await hittingPartnerApi.update(editingPost.id, user.id, {
        availability: formData.availability,
        playStyle: formData.playStyle,
        description: formData.description,
        expiresInDays: formData.expiresInDays
      });

      if (response.success) {
        toast.success('Post updated successfully');
        setEditingPost(null);
        resetForm();
        loadData();
      } else {
        toast.error(response.error || 'Failed to update post');
      }
    } catch (error) {
      console.error('Error updating post:', error);
      toast.error('Failed to update post');
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!user?.id) return;

    if (!confirm('Are you sure you want to delete this post?')) {
      return;
    }

    try {
      const response = await hittingPartnerApi.delete(postId, user.id);

      if (response.success) {
        toast.success('Post deleted successfully');
        loadData();
      } else {
        toast.error(response.error || 'Failed to delete post');
      }
    } catch (error) {
      console.error('Error deleting post:', error);
      toast.error('Failed to delete post');
    }
  };

  const startEdit = (post: any) => {
    setEditingPost(post);
    setFormData({
      facilityId: post.facilityId,
      availability: post.availability,
      playStyle: post.playStyle,
      description: post.description,
      expiresInDays: 30 // Default for editing
    });
  };

  const resetForm = () => {
    setFormData({
      facilityId: memberFacilities.length > 0 ? memberFacilities[0].facilityId : '',
      availability: '',
      playStyle: [],
      description: '',
      expiresInDays: 30
    });
  };

  const togglePlayStyle = (style: string) => {
    setFormData(prev => ({
      ...prev,
      playStyle: prev.playStyle.includes(style)
        ? prev.playStyle.filter(s => s !== style)
        : [...prev.playStyle, style]
    }));
  };

  const formatPostedDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getDaysUntilExpiration = (expiresAt: string) => {
    const expires = new Date(expiresAt);
    const now = new Date();
    const diffMs = expires.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const filteredPosts = posts.filter(post => {
    const matchesSearch = searchQuery === '' ||
      post.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesLevel = filterLevel === 'all' || post.skillLevel === filterLevel;
    const matchesPlayStyle = filterPlayStyle === 'all' || post.playStyle.includes(filterPlayStyle);

    return matchesSearch && matchesLevel && matchesPlayStyle;
  });

  const hasNoFacilities = memberFacilities.length === 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium">Loading hitting partners...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <UnifiedSidebar
        userType="player"
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToPlayerDashboard={onNavigateToPlayerDashboard}
        onNavigateToCalendar={onNavigateToCalendar}
        onNavigateToClub={onNavigateToClub}
        onNavigateToBulletinBoard={onNavigateToBulletinBoard}
        onNavigateToHittingPartner={() => {}}
        onNavigateToMessages={onNavigateToMessages}
        onNavigateToAdminDashboard={onNavigateToAdminDashboard}
        onNavigateToFacilityManagement={onNavigateToFacilityManagement}
        onNavigateToCourtManagement={onNavigateToCourtManagement}
        onNavigateToBookingManagement={onNavigateToBookingManagement}
        onNavigateToAdminBooking={onNavigateToAdminBooking}
        onNavigateToMemberManagement={onNavigateToMemberManagement}
                onLogout={onLogout}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        currentPage="hitting-partner"
      />

      <div className={`${sidebarCollapsed ? 'ml-16' : 'ml-64'} transition-all duration-300 ease-in-out`}>
        <div className="p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-medium">Find Hitting Partner</h1>
              <p className="text-gray-600 mt-1">Connect with players looking for practice partners</p>
            </div>
            <div className="flex items-center gap-3">
              <NotificationBell />
              {!hasNoFacilities && (
                <Button onClick={() => setShowCreatePost(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Post
                </Button>
              )}
            </div>
          </div>

          {/* No Facility Alert */}
          {hasNoFacilities && (
            <Card className="mb-6 border-blue-200 bg-blue-50">
              <CardContent className="pt-6">
                <div className="flex items-start gap-4">
                  <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="font-medium text-blue-900 mb-1">No Facility Membership</h3>
                    <p className="text-sm text-blue-800 mb-3">
                      You need to join a facility to view and create hitting partner posts. Hitting partner posts are facility-specific to help you connect with players at your club.
                    </p>
                    <Button
                      onClick={onNavigateToProfile}
                      size="sm"
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      <Building className="h-4 w-4 mr-2" />
                      Request Facility Membership
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search posts..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                {memberFacilities.length > 1 && (
                  <div>
                    <Label>Facility</Label>
                    <Select
                      value={selectedFacilityFilter}
                      onValueChange={setSelectedFacilityFilter}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Facilities</SelectItem>
                        {memberFacilities.map((facility: any) => (
                          <SelectItem key={facility.facilityId} value={facility.facilityId}>
                            {facility.facilityName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label>Skill Level</Label>
                  <Select value={filterLevel} onValueChange={setFilterLevel}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Levels</SelectItem>
                      <SelectItem value="Beginner">Beginner</SelectItem>
                      <SelectItem value="Intermediate">Intermediate</SelectItem>
                      <SelectItem value="Advanced">Advanced</SelectItem>
                      <SelectItem value="Professional">Professional</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Play Style</Label>
                  <Select value={filterPlayStyle} onValueChange={setFilterPlayStyle}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Styles</SelectItem>
                      <SelectItem value="Singles">Singles</SelectItem>
                      <SelectItem value="Doubles">Doubles</SelectItem>
                      <SelectItem value="Competitive">Competitive</SelectItem>
                      <SelectItem value="Social">Social</SelectItem>
                      <SelectItem value="Drills">Drills</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Posts */}
          <div className="space-y-4">
            {filteredPosts.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-500">
                  <Users className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="font-medium">No hitting partner posts found</p>
                  <p className="text-sm mt-1">
                    {hasNoFacilities
                      ? 'Join a facility to create your first post'
                      : 'Be the first to create a post!'}
                  </p>
                </CardContent>
              </Card>
            ) : (
              filteredPosts.map((post) => {
                const isMyPost = user?.id === post.userId;
                const daysLeft = getDaysUntilExpiration(post.expiresAt);

                return (
                  <Card key={post.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="pt-6">
                      <div className="flex gap-4">
                        <Avatar className="h-12 w-12">
                          <AvatarFallback>{post.userInitials}</AvatarFallback>
                        </Avatar>

                        <div className="flex-1">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h3 className="font-semibold">{post.userName}</h3>
                              <div className="flex gap-2 mt-1">
                                {post.skillLevel && (
                                  <Badge variant="outline">{post.skillLevel}</Badge>
                                )}
                                <Badge variant="secondary">
                                  <Building className="h-3 w-3 mr-1" />
                                  {post.facilityName}
                                </Badge>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              {!isMyPost && (
                                <Button
                                  variant="default"
                                  size="sm"
                                  onClick={() => onNavigateToMessages(post.userId)}
                                  className="bg-blue-600 hover:bg-blue-700"
                                >
                                  <MessageCircle className="h-4 w-4 mr-1" />
                                  Message
                                </Button>
                              )}
                              {isMyPost && (
                                <>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => startEdit(post)}
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handleDeletePost(post.id)}
                                    className="text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4 mb-3 text-sm">
                            <div>
                              <span className="text-gray-600">Availability:</span>
                              <p className="font-medium">{post.availability}</p>
                            </div>
                            <div>
                              <span className="text-gray-600">Play Style:</span>
                              <div className="flex gap-1 mt-1">
                                {post.playStyle.map((style: string, idx: number) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {style}
                                  </Badge>
                                ))}
                              </div>
                            </div>
                          </div>

                          <p className="text-gray-700 mb-3">{post.description}</p>

                          <div className="flex justify-between items-center text-sm text-gray-500">
                            <span>Posted {formatPostedDate(post.postedDate)}</span>
                            <span className={daysLeft <= 7 ? 'text-orange-600' : ''}>
                              Expires in {daysLeft} day{daysLeft !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            )}
          </div>

          {/* Create/Edit Post Dialog */}
          <Dialog open={showCreatePost || editingPost !== null} onOpenChange={(open) => {
            if (!open) {
              setShowCreatePost(false);
              setEditingPost(null);
              resetForm();
            }
          }}>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{editingPost ? 'Edit Post' : 'Create Hitting Partner Post'}</DialogTitle>
                <DialogDescription>
                  Share your availability and find the perfect practice partner
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {!editingPost && (
                  <div>
                    <Label>Facility *</Label>
                    <Select
                      value={formData.facilityId}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, facilityId: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select facility" />
                      </SelectTrigger>
                      <SelectContent>
                        {memberFacilities.map((facility: any) => (
                          <SelectItem key={facility.facilityId} value={facility.facilityId}>
                            {facility.facilityName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div>
                  <Label>Availability *</Label>
                  <Input
                    placeholder="e.g., Weekday mornings, Tuesday & Thursday evenings"
                    value={formData.availability}
                    onChange={(e) => setFormData(prev => ({ ...prev, availability: e.target.value }))}
                  />
                </div>

                <div>
                  <Label>Play Style * (Select all that apply)</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['Singles', 'Doubles', 'Competitive', 'Social', 'Drills', 'Match Play'].map((style) => (
                      <Badge
                        key={style}
                        variant={formData.playStyle.includes(style) ? 'default' : 'outline'}
                        className="cursor-pointer"
                        onClick={() => togglePlayStyle(style)}
                      >
                        {style}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <Label>Description *</Label>
                  <Textarea
                    placeholder="Describe what you're looking for in a hitting partner..."
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    rows={4}
                  />
                </div>

                <div>
                  <Label>Expires In (days) *</Label>
                  <Input
                    type="number"
                    min="7"
                    max="90"
                    value={formData.expiresInDays}
                    onChange={(e) => setFormData(prev => ({ ...prev, expiresInDays: parseInt(e.target.value) || 30 }))}
                  />
                  <p className="text-xs text-gray-500 mt-1">Posts can be active for 7-90 days</p>
                </div>

                <div className="flex justify-end gap-2 pt-4">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCreatePost(false);
                      setEditingPost(null);
                      resetForm();
                    }}
                  >
                    Cancel
                  </Button>
                  <Button onClick={editingPost ? handleUpdatePost : handleCreatePost}>
                    {editingPost ? 'Update Post' : 'Create Post'}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
