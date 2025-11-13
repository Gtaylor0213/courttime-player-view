import React from 'react';
import { Avatar, AvatarFallback } from './ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from './ui/dropdown-menu';
import { Button } from './ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import { User, LogOut, ChevronDown, ChevronLeft, ChevronRight, Calendar, Building2, LayoutDashboard, UserSearch, Settings, Users, BarChart3, BookOpen, UserCog } from 'lucide-react';
import logoImage from 'figma:asset/8775e46e6be583b8cd937eefe50d395e0a3fcf52.png';

interface Facility {
  id: string;
  name: string;
  type: string;
}

interface UnifiedSidebarProps {
  userType: 'player' | 'admin' | null;
  onNavigateToProfile: () => void;
  onNavigateToPlayerDashboard: () => void;
  onNavigateToCalendar: () => void;
  onNavigateToClub?: (clubId: string) => void;
  onNavigateToHittingPartner?: () => void;
  onNavigateToAdminDashboard?: () => void;
  onNavigateToFacilityManagement?: () => void;
  onNavigateToCourtManagement?: () => void;
  onNavigateToBookingManagement?: () => void;
  onNavigateToAdminBooking?: () => void;
  onNavigateToMemberManagement?: () => void;
  onNavigateToAnalytics?: () => void;
  onLogout: () => void;
  facilities?: Facility[];
  selectedFacilityId?: string;
  onFacilityChange?: (facilityId: string) => void;
  showFacilityOptions?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  currentPage?: string;
}

export function UnifiedSidebar({
  userType,
  onNavigateToProfile,
  onNavigateToPlayerDashboard,
  onNavigateToCalendar,
  onNavigateToClub,
  onNavigateToHittingPartner = () => {},
  onNavigateToAdminDashboard = () => {},
  onNavigateToFacilityManagement = () => {},
  onNavigateToCourtManagement = () => {},
  onNavigateToBookingManagement = () => {},
  onNavigateToAdminBooking = () => {},
  onNavigateToMemberManagement = () => {},
  onNavigateToAnalytics = () => {},
  onLogout,
  facilities = [],
  selectedFacilityId,
  onFacilityChange,
  showFacilityOptions = false,
  isCollapsed = false,
  onToggleCollapse,
  currentPage
}: UnifiedSidebarProps) {
  
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
              <img src={logoImage} alt="CourtTime" className="h-8 w-auto" />
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
          {userType === 'admin' && (
            <div>
              {!isCollapsed && <h3 className="text-sm font-medium text-gray-900 mb-3">Admin</h3>}
              <div className="space-y-1">
                <SidebarButton
                  onClick={onNavigateToAdminDashboard}
                  icon={LayoutDashboard}
                  label="Admin Dashboard"
                  isActive={currentPage === 'admin-dashboard'}
                />
                <SidebarButton
                  onClick={onNavigateToFacilityManagement}
                  icon={Building2}
                  label="Facility Management"
                  isActive={currentPage === 'facility-management'}
                />
                <SidebarButton
                  onClick={onNavigateToCourtManagement}
                  icon={Settings}
                  label="Court Details"
                  isActive={currentPage === 'court-management'}
                />
                <SidebarButton
                  onClick={onNavigateToBookingManagement}
                  icon={BookOpen}
                  label="Booking Management"
                  isActive={currentPage === 'booking-management'}
                />
                <SidebarButton
                  onClick={onNavigateToAdminBooking}
                  icon={Calendar}
                  label="Admin Booking"
                  isActive={currentPage === 'admin-booking'}
                />
                <SidebarButton
                  onClick={onNavigateToMemberManagement}
                  icon={UserCog}
                  label="Member Management"
                  isActive={currentPage === 'member-management'}
                />
                <SidebarButton
                  onClick={onNavigateToAnalytics}
                  icon={BarChart3}
                  label="Analytics & Reports"
                  isActive={currentPage === 'analytics'}
                />
              </div>
            </div>
          )}

          {/* Main Navigation Section */}
          <div>
            {!isCollapsed && <h3 className="text-sm font-medium text-gray-900 mb-3">{userType === 'admin' ? 'Player Features' : 'Navigation'}</h3>}
            <div className="space-y-1">
              <SidebarButton
                onClick={onNavigateToCalendar}
                icon={Calendar}
                label="Court Calendar"
                isActive={currentPage === 'court-calendar'}
              />
              <SidebarButton
                onClick={onNavigateToPlayerDashboard}
                icon={LayoutDashboard}
                label="Dashboard"
                isActive={currentPage === 'player-dashboard'}
              />
              <SidebarButton
                onClick={onNavigateToHittingPartner}
                icon={UserSearch}
                label="Find Hitting Partner"
                isActive={currentPage === 'hitting-partner'}
              />
            </div>
          </div>

          {/* My Clubs Section */}
          <div>
            {!isCollapsed && <h3 className="text-sm font-medium text-gray-900 mb-3">My Clubs</h3>}
            <div className="space-y-1">
              {isCollapsed ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="w-full rounded-lg px-3 py-2 text-left hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center justify-center">
                          <Building2 className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuItem onClick={() => onNavigateToClub?.('riverside-tennis')}>
                            <Building2 className="h-4 w-4 mr-2" />
                            Riverside Tennis Club
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onNavigateToClub?.('downtown-racquet')}>
                            <Building2 className="h-4 w-4 mr-2" />
                            Downtown Racquet Club
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p>My Clubs</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <DropdownMenu>
                  <DropdownMenuTrigger className="w-full rounded-lg px-3 py-2 text-left hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 flex items-center justify-between">
                    <div className="flex items-center">
                      <Building2 className="h-4 w-4 mr-3" />
                      My Clubs
                    </div>
                    <ChevronDown className="h-4 w-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => onNavigateToClub?.('riverside-tennis')}>
                      <Building2 className="h-4 w-4 mr-2" />
                      Riverside Tennis Club
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onNavigateToClub?.('downtown-racquet')}>
                      <Building2 className="h-4 w-4 mr-2" />
                      Downtown Racquet Club
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
          </div>


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
                        <AvatarFallback>JD</AvatarFallback>
                      </Avatar>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <div className="px-3 py-2 border-b">
                        <p className="text-sm font-medium">John Doe</p>
                        <p className="text-xs text-gray-600 capitalize">{userType || 'Player'}</p>
                      </div>
                      <DropdownMenuItem onClick={onNavigateToProfile}>
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
                  <AvatarFallback>JD</AvatarFallback>
                </Avatar>
                <div className="text-left flex-1">
                  <p className="text-sm font-medium">John Doe</p>
                  <p className="text-xs text-gray-600 capitalize">{userType || 'Player'}</p>
                </div>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={onNavigateToProfile}>
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