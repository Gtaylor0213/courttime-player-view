import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { User, LogOut, ChevronLeft, ChevronRight, ChevronDown, Calendar, Building2, LayoutDashboard, UserSearch, BookOpen, UserCog, MessageSquare, MessageCircle, Mail, X, CreditCard, Plus, ShoppingBag, ShoppingCart, DollarSign, BarChart2, CalendarDays } from 'lucide-react';
import logoImage from 'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png';
import { useAuth } from '../contexts/AuthContext';
import { useAppContext } from '../contexts/AppContext';
import { facilitiesApi } from '../api/client';
import { safeDisplayText } from '../../shared/utils/safeDisplayText';
import { sortFacilitiesByName } from '../../shared/utils/facilitySort';
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from './ui/select';
import { cn } from './ui/utils';

interface Club {
  id: string;
  name: string;
}

const CLUB_ACTION_REQUEST = '__request_club__';
const CLUB_ACTION_CREATE = '__create_facility__';

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
  const { selectedFacilityId, setSelectedFacilityId, sidebarOpen, setSidebarOpen, enabledFeatures } = useAppContext();
  const proShopEnabled = enabledFeatures.includes('pro_shop');
  const annualFeesEnabled = enabledFeatures.includes('annual_membership_fees');
  const location = useLocation();
  const navigate = useNavigate();
  const [memberFacilities, setMemberFacilities] = React.useState<Club[]>([]);
  const [loadingFacilities, setLoadingFacilities] = React.useState(true);

  // Use the actual user's type from AuthContext, or fall back to the prop
  const actualUserType = user?.userType || userType;

  // Fetch only facilities the user is a member of
  React.useEffect(() => {
    const fetchMemberFacilities = async () => {
      const allFacilityIds = Array.from(new Set([
        ...(user?.memberFacilities || []),
        ...(user?.adminFacilities || []),
      ]));

      if (allFacilityIds.length === 0) {
        setMemberFacilities([]);
        setLoadingFacilities(false);
        return;
      }

      try {
        const facilitiesData: Club[] = [];

        for (const facilityId of allFacilityIds) {
          const response = await facilitiesApi.getById(facilityId);
          if (response.success && response.data?.facility) {
            facilitiesData.push({
              id: response.data.facility.id,
              name: safeDisplayText(response.data.facility.name) || 'Club',
            });
          }
        }

        setMemberFacilities(sortFacilitiesByName(facilitiesData));
      } catch (error) {
        console.error('Error fetching member facilities:', error);
      } finally {
        setLoadingFacilities(false);
      }
    };

    fetchMemberFacilities();
  }, [user?.memberFacilities, user?.adminFacilities]);

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

  // Navigate and auto-close sidebar on mobile
  const handleNav = (path: string) => {
    navigate(path);
    setSidebarOpen(false);
  };

  const handleClubSelectChange = (value: string) => {
    if (value === CLUB_ACTION_REQUEST) {
      handleNav('/profile');
      return;
    }
    if (value === CLUB_ACTION_CREATE) {
      handleNav('/register/facility');
      return;
    }
    handleFacilityChange(value);
  };

  const selectedClubName =
    safeDisplayText(memberFacilities.find((f) => f.id === selectedFacilityId)?.name) || 'Your clubs';

  const clubDropdownItems = (
    <>
      {memberFacilities.map((facility) => (
        <SelectItem key={facility.id} value={facility.id}>
          {safeDisplayText(facility.name) || 'Club'}
        </SelectItem>
      ))}
      <SelectSeparator />
      <SelectItem value={CLUB_ACTION_REQUEST} className="text-green-700">
        <span className="flex items-center gap-2">
          <UserSearch className="h-3.5 w-3.5" />
          Request a club
        </span>
      </SelectItem>
      <SelectItem value={CLUB_ACTION_CREATE} className="text-green-700">
        <span className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5" />
          Create a facility
        </span>
      </SelectItem>
    </>
  );

  const clubMenuItems = (
    <>
      {memberFacilities.map((facility) => (
        <DropdownMenuItem
          key={facility.id}
          onClick={() => handleFacilityChange(facility.id)}
          className={facility.id === selectedFacilityId ? 'bg-green-50 text-green-700' : undefined}
        >
          <Building2 className="h-4 w-4 mr-2" />
          {safeDisplayText(facility.name) || 'Club'}
        </DropdownMenuItem>
      ))}
      {memberFacilities.length > 0 && <DropdownMenuSeparator />}
      <DropdownMenuItem onClick={() => handleNav('/profile')}>
        <UserSearch className="h-4 w-4 mr-2" />
        Request a club
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => handleNav('/register/facility')}>
        <Plus className="h-4 w-4 mr-2" />
        Create a facility
      </DropdownMenuItem>
    </>
  );

  const handleFacilityChange = (nextFacilityId: string) => {
    if (!nextFacilityId || nextFacilityId === selectedFacilityId) {
      setSidebarOpen(false);
      return;
    }

    setSelectedFacilityId(nextFacilityId);

    if (location.pathname !== '/calendar') {
      handleNav('/calendar');
      return;
    }

    setSidebarOpen(false);
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
        className={`w-full rounded-lg px-3 py-2 text-left hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring flex items-center transition-colors ${
          isActive ? 'bg-green-50 text-green-700 border-l-4 border-green-600' : ''
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
    <>
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={cn(
        'fixed inset-y-0 left-0 bg-card border-r border-border transition-all duration-300 ease-in-out flex flex-col',
        // Mobile: slide in/out with translate, always w-64
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'w-64 z-50',
        // Desktop: always visible, width varies by collapse state
        'md:translate-x-0 md:z-10',
        isCollapsed ? 'md:w-16' : 'md:w-64',
      )}>
        {/* Logo and Toggle */}
        <div className={`${isCollapsed ? 'md:p-3' : ''} p-6 bg-gradient-to-b from-green-700 to-green-800 flex items-center ${isCollapsed ? 'md:justify-center' : 'justify-between'}`}>
          {/* Show logo when expanded OR on mobile */}
          <div className={cn('flex items-center', isCollapsed && 'md:hidden')}>
            <img src={logoImage} alt="CourtTime" className="h-10 w-auto brightness-0 invert" />
          </div>
          {/* Mobile close button */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="p-2 rounded-md hover:bg-white/20 text-white md:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
          {/* Desktop collapse toggle */}
          {onToggleCollapse && (
            <div className="hidden md:block">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onToggleCollapse}
                      className={`${isCollapsed ? 'w-10 h-10 p-0' : ''} hover:bg-white/20 text-white`}
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right">
                    <p>{isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          )}
        </div>

        {/* Navigation */}
        <nav className={cn('flex-1 p-4 space-y-6 overflow-y-auto', isCollapsed && 'md:p-2')}>
          {/* Club selector dropdown */}
          {!loadingFacilities && (
            isCollapsed ? (
              <div className="hidden md:block">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            className="w-full rounded-lg px-3 py-2 flex items-center justify-center transition-colors hover:bg-accent"
                            aria-label={selectedClubName}
                          >
                            <Building2 className="h-4 w-4 text-gray-500" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start" className="w-56">
                          {clubMenuItems}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>{selectedClubName}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            ) : (
              <div className={cn(isCollapsed && 'md:hidden')}>
                <Select
                  value={selectedFacilityId || undefined}
                  onValueChange={handleClubSelectChange}
                >
                  <SelectTrigger className="w-full h-9 text-sm bg-green-50 border-green-200">
                    <Building2 className="h-3.5 w-3.5 mr-2 text-green-600 flex-shrink-0" />
                    <SelectValue placeholder="Your clubs" />
                  </SelectTrigger>
                  <SelectContent>
                    {clubDropdownItems}
                  </SelectContent>
                </Select>
              </div>
            )
          )}

          {/* Admin Navigation Section — only if user is admin of the selected facility */}
          {user?.adminFacilities?.includes(selectedFacilityId) && (
            <div>
              {!isCollapsed && <h3 className="text-sm font-medium text-gray-900 mb-3">Admin</h3>}
              {/* Mobile always shows labels */}
              <h3 className={cn('text-sm font-medium text-gray-900 mb-3 md:hidden', !isCollapsed && 'hidden')}>Admin</h3>
              <div className="space-y-1">
                <SidebarButton
                  onClick={() => handleNav('/admin')}
                  icon={LayoutDashboard}
                  label="Admin Dashboard"
                  isActive={currentPage === 'admin-dashboard'}
                />
                <SidebarButton
                  onClick={() => handleNav('/admin/facilities')}
                  icon={Building2}
                  label="Facility Management"
                  isActive={currentPage === 'facility-management' || currentPage === 'court-management'}
                />
                <SidebarButton
                  onClick={() => handleNav('/admin/members')}
                  icon={UserCog}
                  label="Member Management"
                  isActive={currentPage === 'member-management' || currentPage === 'household-management'}
                />
                <SidebarButton
                  onClick={() => handleNav('/admin/bookings')}
                  icon={BookOpen}
                  label="Reservations"
                  isActive={currentPage === 'booking-management' || currentPage === 'admin-booking'}
                />
                <SidebarButton
                  onClick={() => handleNav('/admin/member-payments')}
                  icon={CreditCard}
                  label="Member Payments"
                  isActive={currentPage === 'member-payments'}
                />
                <SidebarButton
                  onClick={() => handleNav('/admin/communication')}
                  icon={Mail}
                  label="Communication"
                  isActive={currentPage === 'communication'}
                />
                <SidebarButton
                  onClick={() => handleNav('/bulletin-board')}
                  icon={MessageSquare}
                  label="Bulletin Board"
                  isActive={currentPage === 'bulletin-board'}
                />
                {proShopEnabled && (
                  <SidebarButton
                    onClick={() => handleNav('/admin/pro-shop')}
                    icon={ShoppingBag}
                    label="Pro Shop"
                    isActive={currentPage === 'pro-shop-admin'}
                  />
                )}
                {annualFeesEnabled && (
                  <SidebarButton
                    onClick={() => handleNav('/admin/annual-fees')}
                    icon={DollarSign}
                    label="Annual Fees"
                    isActive={currentPage === 'annual-fees'}
                  />
                )}
                {(proShopEnabled || annualFeesEnabled) && (
                  <SidebarButton
                    onClick={() => handleNav('/admin/reports')}
                    icon={BarChart2}
                    label="Reports"
                    isActive={currentPage === 'reports'}
                  />
                )}
              </div>
            </div>
          )}

          {/* Player Navigation Section */}
          <div>
            {!isCollapsed && <h3 className="text-sm font-medium text-gray-900 mb-3">Player</h3>}
            <h3 className={cn('text-sm font-medium text-gray-900 mb-3 md:hidden', !isCollapsed && 'hidden')}>Player</h3>
            <div className="space-y-1">
              <SidebarButton
                onClick={() => handleNav('/calendar')}
                icon={Calendar}
                label="Court Calendar"
                isActive={currentPage === 'court-calendar'}
              />
              <SidebarButton
                onClick={() => handleNav('/my-reservations')}
                icon={CalendarDays}
                label="My Reservations"
                isActive={currentPage === 'my-reservations'}
              />
              <SidebarButton
                onClick={() => handleNav('/hitting-partner')}
                icon={UserSearch}
                label="Find Hitting Partner"
                isActive={currentPage === 'hitting-partner'}
              />
              <SidebarButton
                onClick={() => handleNav('/messages')}
                icon={MessageCircle}
                label="Messages"
                isActive={currentPage === 'messages'}
              />
              <SidebarButton
                onClick={() => handleNav('/payments')}
                icon={CreditCard}
                label="Payments"
                isActive={currentPage === 'payments'}
              />
              {proShopEnabled && (
                <SidebarButton
                  onClick={() => handleNav('/shop')}
                  icon={ShoppingCart}
                  label="Shop"
                  isActive={currentPage === 'shop'}
                />
              )}
              {!user?.adminFacilities?.includes(selectedFacilityId) && (
                <SidebarButton
                  onClick={() => handleNav('/bulletin-board')}
                  icon={MessageSquare}
                  label="Bulletin Board"
                  isActive={currentPage === 'bulletin-board'}
                />
              )}
              {/* Selected Club Info */}
              {!loadingFacilities && (() => {
                const selectedClub = memberFacilities.find(f => f.id === selectedFacilityId);
                if (!selectedClub) return null;
                return (
                  <SidebarButton
                    onClick={() => handleNav(`/club/${selectedClub.id}`)}
                    icon={Building2}
                    label={safeDisplayText(selectedClub.name) || 'Club'}
                    isActive={currentPage === 'club-info'}
                  />
                );
              })()}
            </div>
          </div>


        </nav>

        {/* User Profile */}
        <div className={cn('p-4 border-t border-gray-200', isCollapsed && 'md:p-2')}>
          {isCollapsed ? (
            <>
              {/* Collapsed profile - desktop only */}
              <div className="hidden md:block">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="w-full flex items-center justify-center rounded-lg py-2 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring">
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
                          <DropdownMenuItem onClick={() => handleNav('/profile')}>
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
              </div>
              {/* Expanded profile shown on mobile even when desktop is collapsed */}
              <div className="md:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger className="w-full flex items-center rounded-lg px-3 py-2 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring">
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
                    <DropdownMenuItem onClick={() => handleNav('/profile')}>
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
              </div>
            </>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger className="w-full flex items-center rounded-lg px-3 py-2 hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring">
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
                <DropdownMenuItem onClick={() => handleNav('/profile')}>
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
    </>
  );
}
