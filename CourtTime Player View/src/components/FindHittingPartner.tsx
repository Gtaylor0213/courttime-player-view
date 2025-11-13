import React, { useState } from 'react';
import { UnifiedSidebar } from './UnifiedSidebar';
import { Search, Filter, Users, Calendar, Plus, X, Building } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui/button';
import { Card, CardContent } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Badge } from './ui/badge';
import { Avatar, AvatarFallback } from './ui/avatar';

interface FindHittingPartnerProps {
  onBack: () => void;
  onLogout: () => void;
  onNavigateToProfile: () => void;
  onNavigateToPlayerDashboard: () => void;
  onNavigateToCalendar: () => void;
  onNavigateToClub?: (clubId: string) => void;
  selectedFacilityId?: string;
  onFacilityChange?: (facilityId: string) => void;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

interface PartnerPost {
  id: string;
  user: {
    name: string;
    initials: string;
    skillLevel: string;
    memberClubs: string[];
  };
  availability: string;
  playStyle: string[];
  description: string;
  postedDate: string;
  expiresAt: string; // ISO date string
}

// Sample posts
const samplePosts: PartnerPost[] = [
  {
    id: '1',
    user: {
      name: 'Sarah Martinez',
      initials: 'SM',
      skillLevel: 'Advanced',
      memberClubs: ['riverside']
    },
    availability: 'Weekday mornings',
    playStyle: ['Singles', 'Competitive'],
    description: 'Looking for consistent hitting partner for weekday morning sessions. I play at an advanced level and looking to prepare for upcoming tournaments. Prefer someone who can rally and practice match play.',
    postedDate: '2 days ago',
    expiresAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString() // Expires in 28 days
  },
  {
    id: '2',
    user: {
      name: 'Michael Chen',
      initials: 'MC',
      skillLevel: 'Intermediate',
      memberClubs: ['sunrise-valley', 'riverside']
    },
    availability: 'Evenings & Weekends',
    playStyle: ['Doubles', 'Social'],
    description: 'Casual player looking for doubles partners. I enjoy friendly matches and improving my game. Open to players of similar skill level for fun rallies and maybe some social doubles games.',
    postedDate: '4 days ago',
    expiresAt: new Date(Date.now() + 26 * 24 * 60 * 60 * 1000).toISOString() // Expires in 26 days
  },
  {
    id: '3',
    user: {
      name: 'Jennifer Wu',
      initials: 'JW',
      skillLevel: 'Intermediate',
      memberClubs: ['sunrise-valley']
    },
    availability: 'Weekend mornings',
    playStyle: ['Singles', 'Drills'],
    description: 'Looking for someone to practice with on Saturday or Sunday mornings. Would love to work on specific drills and improve consistency. I\'m a 3.5 level player working my way up.',
    postedDate: '1 week ago',
    expiresAt: new Date(Date.now() + 23 * 24 * 60 * 60 * 1000).toISOString() // Expires in 23 days
  },
  {
    id: '4',
    user: {
      name: 'David Thompson',
      initials: 'DT',
      skillLevel: 'Beginner',
      memberClubs: ['downtown']
    },
    availability: 'Flexible',
    playStyle: ['Singles', 'Learning'],
    description: 'New to tennis and looking for a patient hitting partner to learn with. Happy to split court fees and practice basic strokes.',
    postedDate: '3 days ago',
    expiresAt: new Date(Date.now() + 27 * 24 * 60 * 60 * 1000).toISOString() // Expires in 27 days
  },
  {
    id: '5',
    user: {
      name: 'Amanda Rodriguez',
      initials: 'AR',
      skillLevel: 'Advanced',
      memberClubs: ['riverside']
    },
    availability: 'Tuesday & Thursday evenings',
    playStyle: ['Singles', 'Competitive', 'Match Play'],
    description: 'Competitive player seeking hitting partner for Tuesday/Thursday evening sessions. Looking for someone who can push me and enjoys playing points/practice matches. 4.5+ level preferred.',
    postedDate: '5 days ago',
    expiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString() // Expires in 25 days
  }
];

// Define facilities (matching the structure from CourtCalendarView)
const memberFacilities = [
  { id: 'sunrise-valley', name: 'Sunrise Valley HOA' },
  { id: 'downtown', name: 'Downtown Tennis Center' },
  { id: 'riverside', name: 'Riverside Tennis Club' },
  { id: 'mountain-view', name: 'Mountain View Racquet Club' },
  { id: 'lakeside', name: 'Lakeside Sports Complex' }
];

export function FindHittingPartner({
  onBack,
  onLogout,
  onNavigateToProfile,
  onNavigateToPlayerDashboard,
  onNavigateToCalendar,
  onNavigateToClub = () => {},
  selectedFacilityId,
  onFacilityChange,
  sidebarCollapsed,
  onToggleSidebar
}: FindHittingPartnerProps) {
  const { user } = useAuth();
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterLevel, setFilterLevel] = useState('all');
  const [filterPlayStyle, setFilterPlayStyle] = useState('all');
  const [selectedFacilityFilter, setSelectedFacilityFilter] = useState<string>('all');

  // Form state for creating new post
  const [newPost, setNewPost] = useState({
    availability: '',
    playStyle: [] as string[],
    description: '',
    expirationDays: 30 // Default to 30 days
  });

  const filteredPosts = samplePosts.filter(post => {
    const matchesSearch =
      post.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      post.description.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesLevel = filterLevel === 'all' || post.user.skillLevel.toLowerCase() === filterLevel;
    const matchesPlayStyle = filterPlayStyle === 'all' || post.playStyle.some(style =>
      style.toLowerCase() === filterPlayStyle
    );

    // Filter out expired posts
    const isNotExpired = new Date(post.expiresAt) > new Date();

    // Filter by facility membership - only show posts from members of the same facility
    const userMemberFacilities = user?.memberFacilities || [];
    const hasSameFacility = selectedFacilityFilter === 'all'
      ? post.user.memberClubs.some(club => userMemberFacilities.includes(club))
      : post.user.memberClubs.includes(selectedFacilityFilter);

    return matchesSearch && matchesLevel && matchesPlayStyle && isNotExpired && hasSameFacility;
  });

  const handleTogglePlayStyle = (style: string) => {
    setNewPost(prev => ({
      ...prev,
      playStyle: prev.playStyle.includes(style)
        ? prev.playStyle.filter(s => s !== style)
        : [...prev.playStyle, style]
    }));
  };

  const handleCreatePost = () => {
    // TODO: Send post to backend
    console.log('Creating post:', newPost);
    setShowCreatePost(false);
    // Reset form
    setNewPost({
      availability: '',
      playStyle: [],
      description: '',
      expirationDays: 30
    });
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <UnifiedSidebar
        userType="player"
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToPlayerDashboard={onNavigateToPlayerDashboard}
        onNavigateToCalendar={onNavigateToCalendar}
        onNavigateToClub={onNavigateToClub}
        onLogout={onLogout}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        currentPage="hitting-partner"
      />

      <div className={`flex-1 ${sidebarCollapsed ? 'ml-16' : 'ml-64'} transition-all duration-300 ease-in-out`}>
        {/* Header */}
        <div className="bg-white border-b border-gray-200 p-6">
          <div className="flex items-center justify-between max-w-7xl mx-auto">
            <div>
              <h1 className="text-2xl font-bold">Find a Hitting Partner</h1>
              <p className="text-sm text-gray-600 mt-1">Connect with players in your area</p>
            </div>
            <Button onClick={() => setShowCreatePost(true)} className="bg-blue-600 hover:bg-blue-700">
              <Plus className="h-4 w-4 mr-2" />
              Create Post
            </Button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="bg-white border-b border-gray-200 p-6">
          <div className="max-w-7xl mx-auto space-y-4">
            <div className="flex gap-4 flex-wrap">
              <div className="flex-1 min-w-[300px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search by name or keywords..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              {/* Facility Filter - only show if user has multiple memberships */}
              {user?.memberFacilities && user.memberFacilities.length > 1 && (
                <Select value={selectedFacilityFilter} onValueChange={setSelectedFacilityFilter}>
                  <SelectTrigger className="w-[220px]">
                    <Building className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="All My Facilities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All My Facilities</SelectItem>
                    {user.memberFacilities.map((facilityId) => {
                      const facility = memberFacilities.find(f => f.id === facilityId);
                      return (
                        <SelectItem key={facilityId} value={facilityId}>
                          {facility?.name || facilityId}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}

              <Select value={filterLevel} onValueChange={setFilterLevel}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Skill Level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Levels</SelectItem>
                  <SelectItem value="beginner">Beginner</SelectItem>
                  <SelectItem value="intermediate">Intermediate</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                  <SelectItem value="professional">Professional</SelectItem>
                </SelectContent>
              </Select>

              <Select value={filterPlayStyle} onValueChange={setFilterPlayStyle}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Play Style" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Styles</SelectItem>
                  <SelectItem value="singles">Singles</SelectItem>
                  <SelectItem value="doubles">Doubles</SelectItem>
                  <SelectItem value="competitive">Competitive</SelectItem>
                  <SelectItem value="social">Social</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Posts List */}
        <div className="p-6 max-w-7xl mx-auto">
          <div className="space-y-4">
            {filteredPosts.map((post) => (
              <Card key={post.id} className="hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="flex gap-4">
                    {/* Avatar */}
                    <Avatar className="h-12 w-12 flex-shrink-0">
                      <AvatarFallback className="bg-blue-100 text-blue-700 font-semibold">
                        {post.user.initials}
                      </AvatarFallback>
                    </Avatar>

                    {/* Content */}
                    <div className="flex-1">
                      {/* Header */}
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h3 className="font-semibold text-lg">{post.user.name}</h3>
                          <div className="flex items-center gap-2 mt-1 text-sm text-gray-600">
                            <Badge variant="secondary">{post.user.skillLevel}</Badge>
                          </div>
                        </div>
                        <span className="text-sm text-gray-500">{post.postedDate}</span>
                      </div>

                      {/* Member Clubs */}
                      {post.user.memberClubs.length > 0 && (
                        <div className="flex items-center gap-2 mb-3">
                          <Users className="h-4 w-4 text-gray-400" />
                          <span className="text-sm text-gray-600">
                            Member: {post.user.memberClubs.map(clubId => {
                              const facility = memberFacilities.find(f => f.id === clubId);
                              return facility?.name || clubId;
                            }).join(', ')}
                          </span>
                        </div>
                      )}

                      {/* Description */}
                      <p className="text-gray-700 mb-3">{post.description}</p>

                      {/* Details */}
                      <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2 text-gray-600">
                          <Calendar className="h-4 w-4" />
                          <span className="font-medium">Availability:</span>
                          <span>{post.availability}</span>
                        </div>
                      </div>

                      {/* Play Style Tags */}
                      <div className="flex flex-wrap gap-2 mt-3">
                        {post.playStyle.map((style, idx) => (
                          <Badge key={idx} variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            {style}
                          </Badge>
                        ))}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 mt-4">
                        <Button variant="default" size="sm">
                          Contact Player
                        </Button>
                        <Button variant="outline" size="sm">
                          View Profile
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}

            {filteredPosts.length === 0 && (
              <Card>
                <CardContent className="p-12 text-center">
                  <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">No posts found</h3>
                  <p className="text-gray-600 mb-4">
                    Try adjusting your filters or be the first to create a post!
                  </p>
                  <Button onClick={() => setShowCreatePost(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Post
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Create Post Modal */}
      {showCreatePost && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setShowCreatePost(false)}
        >
          <Card
            className="max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-bold">Find a Hitting Partner</h2>
                <Button variant="ghost" size="sm" onClick={() => setShowCreatePost(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Form */}
              <div className="space-y-4">
                {/* Availability */}
                <div>
                  <Label htmlFor="availability">Availability</Label>
                  <Input
                    id="availability"
                    placeholder="e.g., Weekday mornings, Tuesday evenings"
                    value={newPost.availability}
                    onChange={(e) => setNewPost({ ...newPost, availability: e.target.value })}
                  />
                </div>

                {/* Post Duration */}
                <div>
                  <Label htmlFor="expiration">Post Duration</Label>
                  <Select
                    value={newPost.expirationDays.toString()}
                    onValueChange={(value) => setNewPost({ ...newPost, expirationDays: parseInt(value) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="7">7 days</SelectItem>
                      <SelectItem value="14">14 days</SelectItem>
                      <SelectItem value="30">30 days</SelectItem>
                      <SelectItem value="60">60 days</SelectItem>
                      <SelectItem value="90">90 days</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-gray-500 mt-1">
                    Your post will automatically expire after the selected duration.
                  </p>
                </div>

                {/* Play Style */}
                <div>
                  <Label>Play Style (select all that apply)</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {['Singles', 'Doubles', 'Competitive', 'Social', 'Drills', 'Match Play', 'Learning'].map((style) => (
                      <Button
                        key={style}
                        type="button"
                        variant={newPost.playStyle.includes(style) ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => handleTogglePlayStyle(style)}
                      >
                        {style}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* Description */}
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Tell others about what you're looking for in a hitting partner..."
                    rows={5}
                    value={newPost.description}
                    onChange={(e) => setNewPost({ ...newPost, description: e.target.value })}
                  />
                  <p className="text-sm text-gray-500 mt-1">
                    Include details like your skill level, preferred playing times, and what you're looking to work on.
                  </p>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowCreatePost(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    onClick={handleCreatePost}
                  >
                    Post
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
