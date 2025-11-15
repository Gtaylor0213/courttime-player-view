import React, { useState } from 'react';
import { UnifiedSidebar } from './UnifiedSidebar';
import { ArrowLeft, Calendar, Clock, Users, MapPin, Tag, Pin } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';

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
  type: 'event' | 'clinic' | 'tournament' | 'social';
  date: string;
  time: string;
  location: string;
  clubId: string;
  clubName: string;
  spots?: number;
  spotsAvailable?: number;
  instructor?: string;
  fee?: string;
  tags: string[];
  color: string;
  rotation: number;
}

// Sample bulletin board posts
const samplePosts: BulletinPost[] = [
  {
    id: '1',
    title: 'Summer Tennis Clinic',
    description: 'Join us for an intensive 3-day tennis clinic focused on improving your serve and volley techniques. All skill levels welcome!',
    type: 'clinic',
    date: 'July 15-17, 2025',
    time: '9:00 AM - 12:00 PM',
    location: 'Courts 1-4',
    clubId: 'riverside-tennis',
    clubName: 'Riverside Tennis Club',
    spots: 20,
    spotsAvailable: 7,
    instructor: 'Coach Sarah Martinez',
    fee: '$150',
    tags: ['Beginner Friendly', 'All Ages'],
    color: 'bg-yellow-100 border-yellow-200',
    rotation: -2
  },
  {
    id: '2',
    title: 'Member Social Mixer',
    description: 'Come meet fellow club members! Enjoy refreshments, casual doubles matches, and networking. Bring a friend!',
    type: 'social',
    date: 'June 28, 2025',
    time: '6:00 PM - 9:00 PM',
    location: 'Clubhouse & Courts',
    clubId: 'riverside-tennis',
    clubName: 'Riverside Tennis Club',
    tags: ['Social', 'Free Event'],
    color: 'bg-pink-100 border-pink-200',
    rotation: 1
  },
  {
    id: '3',
    title: 'Singles Tournament',
    description: 'Annual club championship tournament. Round-robin format followed by knockout rounds. Register by June 20th.',
    type: 'tournament',
    date: 'July 8-9, 2025',
    time: 'All Day',
    location: 'All Courts',
    clubId: 'downtown-racquet',
    clubName: 'Downtown Racquet Club',
    spots: 32,
    spotsAvailable: 12,
    fee: '$40',
    tags: ['Competitive', 'Prize Pool'],
    color: 'bg-blue-100 border-blue-200',
    rotation: 2
  },
  {
    id: '4',
    title: 'Junior Development Program',
    description: 'Weekly training program for ages 8-16. Focus on fundamentals, match play, and fitness. 8-week session starts soon!',
    type: 'clinic',
    date: 'Starts Aug 1, 2025',
    time: 'Mon/Wed 4:00 PM - 6:00 PM',
    location: 'Courts 5-6',
    clubId: 'downtown-racquet',
    clubName: 'Downtown Racquet Club',
    spots: 16,
    spotsAvailable: 4,
    instructor: 'Coach Mike Thompson',
    fee: '$280/session',
    tags: ['Youth', 'Ongoing'],
    color: 'bg-green-100 border-green-200',
    rotation: -1
  },
  {
    id: '5',
    title: 'Morning Drop-In Doubles',
    description: 'Casual doubles play every Tuesday and Thursday morning. No registration needed - just show up and play!',
    type: 'event',
    date: 'Every Tue & Thu',
    time: '7:00 AM - 9:00 AM',
    location: 'Courts 2-4',
    clubId: 'riverside-tennis',
    clubName: 'Riverside Tennis Club',
    tags: ['Drop-In', 'Social', 'Free'],
    color: 'bg-orange-100 border-orange-200',
    rotation: -3
  },
  {
    id: '6',
    title: 'Advanced Strategy Workshop',
    description: 'Learn pro-level tactics and mental game strategies. Perfect for competitive players looking to take their game to the next level.',
    type: 'clinic',
    date: 'July 22, 2025',
    time: '2:00 PM - 5:00 PM',
    location: 'Court 1',
    clubId: 'downtown-racquet',
    clubName: 'Downtown Racquet Club',
    spots: 12,
    spotsAvailable: 9,
    instructor: 'Coach David Lee',
    fee: '$85',
    tags: ['Advanced', 'Strategy'],
    color: 'bg-purple-100 border-purple-200',
    rotation: 1.5
  }
];

const typeIcons = {
  event: Calendar,
  clinic: Users,
  tournament: Tag,
  social: Users
};

const typeColors = {
  event: 'bg-blue-500',
  clinic: 'bg-green-500',
  tournament: 'bg-purple-500',
  social: 'bg-pink-500'
};

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
  // Get unique clubs from posts
  const availableClubs = Array.from(new Set(samplePosts.map(post => post.clubId)))
    .map(id => ({
      id,
      name: samplePosts.find(p => p.clubId === id)?.clubName || id
    }));

  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedClub, setSelectedClub] = useState<string>(clubId || 'all');
  const [selectedPost, setSelectedPost] = useState<BulletinPost | null>(null);

  // Filter by both type and club
  let filteredPosts = samplePosts;
  if (selectedClub !== 'all') {
    filteredPosts = filteredPosts.filter(post => post.clubId === selectedClub);
  }
  if (selectedType !== 'all') {
    filteredPosts = filteredPosts.filter(post => post.type === selectedType);
  }

  const TypeIcon = selectedPost ? typeIcons[selectedPost.type] : Calendar;

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
              <p className="text-sm text-gray-600">Events, clinics, and announcements from your clubs</p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedClub} onValueChange={setSelectedClub}>
                <SelectTrigger className="w-[240px]">
                  <SelectValue placeholder="Select a club" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Clubs</SelectItem>
                  {availableClubs.map(club => (
                    <SelectItem key={club.id} value={club.id}>
                      {club.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-w-7xl mx-auto">
          {/* Filter Tabs */}
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
          </div>

          {/* Bulletin Board - Cork Board Style */}
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

            {/* Pinned Notes Grid */}
            <div className="relative grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredPosts.map((post) => {
                const Icon = typeIcons[post.type];
                return (
                  <div
                    key={post.id}
                    className="relative group cursor-pointer"
                    onClick={() => setSelectedPost(post)}
                  >
                    {/* Push Pin */}
                    <div className="absolute -top-2 left-1/2 transform -translate-x-1/2 z-10">
                      <Pin className="h-6 w-6 text-red-600 fill-red-600 drop-shadow-md" />
                    </div>

                    {/* Note Card */}
                    <Card
                      className={`${post.color} border-2 p-5 shadow-lg hover:shadow-2xl transition-all duration-300 hover:scale-105 relative overflow-hidden rounded-none`}
                    >
                      {/* Tape effect on corners */}
                      <div className="absolute top-0 right-0 w-16 h-6 bg-white/40 shadow-sm"></div>
                      <div className="absolute bottom-0 left-0 w-16 h-6 bg-white/40 shadow-sm"></div>

                      <div className="space-y-3">
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1">
                            <h3 className="font-bold text-gray-800 text-lg leading-tight">{post.title}</h3>
                            <p className="text-xs text-gray-600 font-medium mt-1">{post.clubName}</p>
                          </div>
                          <div className={`${typeColors[post.type]} p-1.5 rounded-full flex-shrink-0`}>
                            <Icon className="h-4 w-4 text-white" />
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-sm text-gray-700 line-clamp-3">{post.description}</p>

                        {/* Details */}
                        <div className="space-y-2 text-sm">
                          <div className="flex items-center text-gray-700">
                            <Calendar className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span className="font-medium">{post.date}</span>
                          </div>
                          <div className="flex items-center text-gray-700">
                            <Clock className="h-4 w-4 mr-2 flex-shrink-0" />
                            <span>{post.time}</span>
                          </div>
                          {post.spotsAvailable !== undefined && (
                            <div className="flex items-center text-gray-700">
                              <Users className="h-4 w-4 mr-2 flex-shrink-0" />
                              <span className="font-medium">{post.spotsAvailable} spots left</span>
                            </div>
                          )}
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-1">
                          {post.tags.map((tag, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs bg-white/60">
                              {tag}
                            </Badge>
                          ))}
                        </div>

                        {/* Footer */}
                        {post.fee && (
                          <div className="pt-2 border-t border-gray-300">
                            <span className="font-bold text-gray-800">{post.fee}</span>
                          </div>
                        )}
                      </div>
                    </Card>
                  </div>
                );
              })}
            </div>
          </div>
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
                    <div className="flex items-start">
                      <Calendar className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-500">Date</p>
                        <p className="font-medium">{selectedPost.date}</p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <Clock className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-500">Time</p>
                        <p className="font-medium">{selectedPost.time}</p>
                      </div>
                    </div>
                    <div className="flex items-start">
                      <MapPin className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                      <div>
                        <p className="text-sm text-gray-500">Location</p>
                        <p className="font-medium">{selectedPost.location}</p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {selectedPost.instructor && (
                      <div className="flex items-start">
                        <Users className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                        <div>
                          <p className="text-sm text-gray-500">Instructor</p>
                          <p className="font-medium">{selectedPost.instructor}</p>
                        </div>
                      </div>
                    )}
                    {selectedPost.spots !== undefined && (
                      <div className="flex items-start">
                        <Users className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                        <div>
                          <p className="text-sm text-gray-500">Availability</p>
                          <p className="font-medium">
                            {selectedPost.spotsAvailable} of {selectedPost.spots} spots available
                          </p>
                        </div>
                      </div>
                    )}
                    {selectedPost.fee && (
                      <div className="flex items-start">
                        <Tag className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                        <div>
                          <p className="text-sm text-gray-500">Fee</p>
                          <p className="font-medium text-lg">{selectedPost.fee}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tags */}
                <div>
                  <p className="text-sm text-gray-500 mb-2">Tags</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedPost.tags.map((tag, idx) => (
                      <Badge key={idx} variant="outline">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-4 border-t">
                  <Button className="flex-1">
                    Register Now
                  </Button>
                  <Button variant="outline" className="flex-1">
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
