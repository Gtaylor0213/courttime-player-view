import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { User, LogOut, ChevronLeft, ChevronRight, ChevronDown, Calendar, Building2, LayoutDashboard, UserSearch, BookOpen, UserCog, MessageSquare, MessageCircle, Home } from 'lucide-react';
import logoImage from 'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png';
import { useAuth } from '../contexts/AuthContext';
import { facilitiesApi } from '../api/client';

interface Club {
  id: string;
  name: string;
}

interface UnifiedSidebarProps {
  userType: 'player' | 'admin' | null;
  onLogout: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  currentPage?: string;
}

export function UnifiedSidebar({
  userType,
  onLogout,
  isCollapsed = false,
  onToggleCollapse,
  currentPage,
}: UnifiedSidebarProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [memberFacilities, setMemberFacilities] = React.useState<Club[]>([]);
  const [loadingFacilities, setLoadingFacilities] = React.useState(true);

  // Use the actual user's type from AuthContext, or fall back to the prop
  const actualUserType = user?.userType || userType;

  // Fetch user's member facilities
  React.useEffect(() => {
    const fetchMemberFacilities = async () => {
      if (!user?.memberFacilities || user.memberFacilities.length === 0) {
        setMemberFacilities([]);
        setLoadingFacilities(false);
        return;
      }

      try {
        const facilitiesData: Club[] = [];

        for (const facilityId of user.memberFacilities) {
          const response = await facilitiesApi.getById(facilityId);
          if (response.success && response.data?.facility) {
            facilitiesData.push({
              id: response.data.facility.id,
              name: response.data.facility.name
            });
          }
        }

        setMemberFacilities(facilitiesData);
      } catch (error) {
        console.error('Error fetching member facilities:', error);
      } finally {
        setLoadingFacilities(false);
      }
    };

    fetchMemberFacilities();
  }, [user?.memberFacilities]);

  // Get user initials
  const getUserInitials = () => {
    if (!user?.fullName) return 'U';
    return user.fullName
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  const SidebarButton = ({
    onClick,
    icon: Icon,
    label,
    isActive = false
  }: {
    onClick: () => void;
    icon: any;
    label: string;
    isActive?: boolean;
  }) => {
    const button = (
      <button
        onClick={onClick}
        className={`w-full rounded-lg px-3 py-2 text-left hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center transition-colors ${
          isActive ? 'bg-blue-50 text-blue-700' : ''
        } ${isCollapsed ? 'justify-center' : ''}`}
      >
        <Icon className={`h-4 w-4 ${isCollapsed ? '' : 'mr-3'}`} />
        {!isCollapsed && label}
      </button>
    );

    if (isCollapsed) {
      return (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              {button}
            </TooltipTrigger>
            <TooltipContent side="right">
              <p>{label}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return button;
  };

  return (
    <div className={`fixed inset-y-0 left-0 ${isCollapsed ? 'w-16' : 'w-64'} bg-white border-r border-gray-200 z-10 transition-all duration-300 ease-in-out`}>
      <div className="flex flex-col h-full">
        {/* Logo and Toggle */}
        <div className={`${isCollapsed ? 'p-3' : 'p-6'} border-b border-gray-200 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          {!isCollapsed && (
            <div className="flex items-center">
              <img src={logoImage} alt="CourtTime" className="h-10 w-auto" />
            </div>
          )}
          {onToggleCollapse && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleCollapse}
                    className={`${isCollapsed ? 'w-10 h-10 p-0' : ''} hover:bg-gray-100`}
                  >
                    {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {/* Navigation */}
        <nav className={`flex-1 ${isCollapsed ? 'p-2' : 'p-4'} space-y-6 overflow-y-auto`}>
          {/* Admin Navigation Section */}
          {actualUserType === 'admin' && (
            <div>
              {!isCollapsed && <h3 className="text-sm font-medium text-gray-900 mb-3">Admin</h3>}
              <div className="space-y-1">
                <SidebarButton
                  onClick={() => navigate('/admin')}
                  icon={LayoutDashboard}
                  label="Admin Dashboard"
                  isActive={currentPage === 'admin-dashboard'}
                />
                <SidebarButton
                  onClick={() => navigate('/admin/facilities')}
                  icon={Building2}
                  label="Facility Management"
                  isActive={currentPage === 'facility-management' || currentPage === 'court-management'}
                />
                <SidebarButton
                  onClick={() => navigate('/admin/bookings')}
                  icon={BookOpen}
                  label="Booking Management"
                  isActive={currentPage === 'booking-management'}
                />
                <SidebarButton
                  onClick={() => navigate('/admin/booking')}
                  icon={Calendar}
                  label="Admin Booking"
                  isActive={currentPage === 'admin-booking'}
                />
                <SidebarButton
                  onClick={() => navigate('/admin/members')}
                  icon={UserCog}
                  label="Member Management"
                  isActive={currentPage === 'member-management'}
                />
                <SidebarButton
                  onClick={() => navigate('/admin/households')}
                  icon={Home}
                  label="Households"
                  isActive={currentPage === 'household-management'}
                />
              </div>
            </div>
          )}

          {/* Main Navigation Section */}
          <div>
            {!isCollapsed && <h3 className="text-sm font-medium text-gray-900 mb-3">{actualUserType === 'admin' ? 'Player Features' : 'Navigation'}</h3>}
            <div className="space-y-1">
              <SidebarButton
                onClick={() => navigate('/calendar')}
                icon={Calendar}
                label="Court Calendar"
                isActive={currentPage === 'court-calendar'}
              />
              <SidebarButton
                onClick={() => navigate('/hitting-partner')}
                icon={UserSearch}
                label="Find Hitting Partner"
                isActive={currentPage === 'hitting-partner'}
              />
              <SidebarButton
                onClick={() => navigate('/messages')}
                icon={MessageCircle}
                label="Messages"
                isActive={currentPage === 'messages'}
              />
            </div>
          </div>

          {/* My Clubs Section - Only show if user has facilities */}
          {memberFacilities.length > 0 && (
          <div>
            {!isCollapsed && <h3 className="text-sm font-medium text-gray-900 mb-3">My Clubs</h3>}
            <div className="space-y-1">
              {/* Bulletin Board */}
              <SidebarButton
                onClick={() => navigate('/bulletin-board')}
                icon={MessageSquare}
                label="Bulletin Board"
                isActive={currentPage === 'bulletin-board'}
              />

              {/* Loading state */}
              {loadingFacilities && !isCollapsed && (
                <div className="px-3 py-2 text-sm text-gray-500">
                  Loading facilities...
                </div>
              )}

              {/* No facilities message */}
              {!loadingFacilities && memberFacilities.length === 0 && !isCollapsed && (
                <div className="px-3 py-2 text-sm text-gray-500">
                  No facility memberships
                </div>
              )}

              {/* Individual Club Listings */}
              {!loadingFacilities && memberFacilities.map((club) => (
                <div key={club.id}>
                  <SidebarButton
                    onClick={() => navigate(`/club/${club.id}`)}
                    icon={Building2}
                    label={club.name}
                    isActive={currentPage === 'club-info'}
                  />
                </div>
              ))}
            </div>
          </div>
          )}


        </nav>

        {/* User Profile */}
        <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t border-gray-200`}>
          {isCollapsed ? (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="w-full flex items-center justify-center py-2 hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                      <Avatar className="h-8 w-8">
                        {user?.profileImageUrl && (
                          <AvatarImage src={user.profileImageUrl} alt={user.fullName || 'User'} />
                        )}
                        <AvatarFallback>{getUserInitials()}</AvatarFallback>
                      </Avatar>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <div className="px-3 py-2 border-b">
                        <p className="text-sm font-medium">{user?.fullName || 'User'}</p>
                        <p className="text-xs text-gray-600 capitalize">{actualUserType || 'Player'}</p>
                      </div>
                      <DropdownMenuItem onClick={() => navigate('/profile')}>
                        <User className="h-4 w-4 mr-2" />
                        View Profile
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={onLogout} className="text-red-600">
                        <LogOut className="h-4 w-4 mr-2" />
                        Log Out
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>User Menu</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full flex items-center px-3 py-2 hover:bg-gray-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500">
                <Avatar className="h-8 w-8 mr-3">
                  {user?.profileImageUrl && (
                    <AvatarImage src={user.profileImageUrl} alt={user.fullName || 'User'} />
                  )}
                  <AvatarFallback>{getUserInitials()}</AvatarFallback>
                </Avatar>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium">{user?.fullName || 'User'}</p>
                  <p className="text-xs text-gray-600 capitalize">{actualUserType || 'Player'}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => navigate('/profile')}>
                  <User className="h-4 w-4 mr-2" />
                  View Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onLogout} className="text-red-600">
                  <LogOut className="h-4 w-4 mr-2" />
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
