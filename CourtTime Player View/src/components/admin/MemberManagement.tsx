import React, { useState, useEffect } from 'react';
import { UnifiedSidebar } from '../UnifiedSidebar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Search, UserPlus, Mail, Shield, ShieldOff, Edit, Trash2, CheckCircle, XCircle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { membersApi } from '../../api/client';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';

interface MemberManagementProps {
  onBack: () => void;
  onLogout: () => void;
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
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
  facilityId?: string;
}

interface Member {
  userId: string;
  email: string;
  fullName: string;
  membershipId: string;
  membershipType: string;
  status: 'active' | 'pending' | 'expired' | 'suspended';
  isFacilityAdmin: boolean;
  startDate: string;
  endDate?: string;
  skillLevel?: string;
  ntrpRating?: number;
  createdAt: string;
}

export function MemberManagement({
  onLogout,
  onNavigateToProfile,
  onNavigateToPlayerDashboard,
  onNavigateToCalendar,
  onNavigateToClub = () => {},
  onNavigateToHittingPartner = () => {},
  onNavigateToAdminDashboard = () => {},
  onNavigateToFacilityManagement = () => {},
  onNavigateToCourtManagement = () => {},
  onNavigateToBookingManagement = () => {},
  onNavigateToAdminBooking = () => {},
  onNavigateToMemberManagement = () => {},
  onNavigateToAnalytics = () => {},
  sidebarCollapsed = false,
  onToggleSidebar,
  facilityId
}: MemberManagementProps) {
  const { user } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMembership, setFilterMembership] = useState<string>('all');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingMember, setEditingMember] = useState<string | null>(null);

  // Use the first facility from user's memberships if facilityId not provided
  const currentFacilityId = facilityId || user?.memberFacilities?.[0];

  useEffect(() => {
    if (currentFacilityId) {
      loadMembers();
    }
  }, [currentFacilityId]);

  const loadMembers = async () => {
    if (!currentFacilityId) {
      toast.error('No facility selected');
      return;
    }

    try {
      setLoading(true);
      const response = await membersApi.getFacilityMembers(currentFacilityId);

      if (response.success && response.data?.members) {
        setMembers(response.data.members);
      } else {
        toast.error(response.error || 'Failed to load members');
      }
    } catch (error) {
      console.error('Error loading members:', error);
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (userId: string, status: 'active' | 'pending' | 'suspended') => {
    if (!currentFacilityId) return;

    try {
      const response = await membersApi.updateMember(currentFacilityId, userId, { status });

      if (response.success) {
        toast.success(`Member status updated to ${status}`);
        loadMembers(); // Reload members
      } else {
        toast.error(response.error || 'Failed to update member status');
      }
    } catch (error) {
      console.error('Error updating member status:', error);
      toast.error('Failed to update member status');
    }
  };

  const handleUpdateMembershipType = async (userId: string, membershipType: string) => {
    if (!currentFacilityId) return;

    try {
      const response = await membersApi.updateMember(currentFacilityId, userId, { membershipType });

      if (response.success) {
        toast.success('Membership type updated');
        loadMembers(); // Reload members
      } else {
        toast.error(response.error || 'Failed to update membership type');
      }
    } catch (error) {
      console.error('Error updating membership type:', error);
      toast.error('Failed to update membership type');
    }
  };

  const handleToggleAdmin = async (userId: string, currentIsAdmin: boolean) => {
    if (!currentFacilityId) return;

    const action = currentIsAdmin ? 'remove admin privileges from' : 'grant admin privileges to';

    if (!confirm(`Are you sure you want to ${action} this member?`)) {
      return;
    }

    try {
      const response = await membersApi.setAdmin(currentFacilityId, userId, !currentIsAdmin);

      if (response.success) {
        toast.success(`Admin privileges ${currentIsAdmin ? 'removed' : 'granted'}`);
        loadMembers(); // Reload members
      } else {
        toast.error(response.error || 'Failed to update admin status');
      }
    } catch (error) {
      console.error('Error updating admin status:', error);
      toast.error('Failed to update admin status');
    }
  };

  const handleRemoveMember = async (userId: string, memberName: string) => {
    if (!currentFacilityId) return;

    if (!confirm(`Are you sure you want to remove ${memberName} from this facility? This will NOT delete their user account, only their membership to this facility.`)) {
      return;
    }

    try {
      const response = await membersApi.removeMember(currentFacilityId, userId);

      if (response.success) {
        toast.success('Member removed from facility');
        loadMembers(); // Reload members
      } else {
        toast.error(response.error || 'Failed to remove member');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Failed to remove member');
    }
  };

  const filteredMembers = members.filter(member => {
    const matchesSearch = member.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         member.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'all' || member.status === filterStatus;
    const matchesMembership = filterMembership === 'all' || member.membershipType === filterMembership;
    return matchesSearch && matchesStatus && matchesMembership;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'suspended': return 'bg-red-100 text-red-800';
      case 'expired': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  };

  if (!currentFacilityId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Facility Selected</CardTitle>
            <CardDescription>You need to be associated with a facility to manage members.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <UnifiedSidebar
        userType="admin"
        onNavigateToProfile={onNavigateToProfile}
        onNavigateToPlayerDashboard={onNavigateToPlayerDashboard}
        onNavigateToCalendar={onNavigateToCalendar}
        onNavigateToClub={onNavigateToClub}
        onNavigateToHittingPartner={onNavigateToHittingPartner}
        onNavigateToAdminDashboard={onNavigateToAdminDashboard}
        onNavigateToFacilityManagement={onNavigateToFacilityManagement}
        onNavigateToCourtManagement={onNavigateToCourtManagement}
        onNavigateToBookingManagement={onNavigateToBookingManagement}
        onNavigateToAdminBooking={onNavigateToAdminBooking}
        onNavigateToMemberManagement={onNavigateToMemberManagement}
        onNavigateToAnalytics={onNavigateToAnalytics}
        onLogout={onLogout}
        isCollapsed={sidebarCollapsed}
        onToggleCollapse={onToggleSidebar}
        currentPage="member-management"
      />

      <div className={`${sidebarCollapsed ? 'ml-16' : 'ml-64'} transition-all duration-300 ease-in-out p-8`}>
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Member Management</h1>
            <Button onClick={loadMembers} variant="outline">
              Refresh
            </Button>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Filter Members</CardTitle>
              <CardDescription>Search and filter members by name, status, or membership type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="search">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="search"
                      placeholder="Name or email..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filterStatus">Status</Label>
                  <Select value={filterStatus} onValueChange={setFilterStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="suspended">Suspended</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filterMembership">Membership Type</Label>
                  <Select value={filterMembership} onValueChange={setFilterMembership}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="Full">Full</SelectItem>
                      <SelectItem value="Social">Social</SelectItem>
                      <SelectItem value="Junior">Junior</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Members List */}
          <Card>
            <CardHeader>
              <CardTitle>All Members ({filteredMembers.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-12 text-gray-500">
                  Loading members...
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredMembers.length === 0 ? (
                    <div className="text-center py-12 text-gray-500">
                      No members found matching your filters.
                    </div>
                  ) : (
                    filteredMembers.map((member) => (
                      <div
                        key={member.userId}
                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <Avatar className="h-12 w-12">
                            <AvatarFallback>{getInitials(member.fullName)}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-4">
                            <div>
                              <div className="font-medium flex items-center gap-2">
                                {member.fullName}
                                {member.isFacilityAdmin && (
                                  <Badge variant="outline" className="text-blue-600 border-blue-600">
                                    <Shield className="h-3 w-3 mr-1" />
                                    Admin
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-gray-500 flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {member.email}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-500">Membership</div>
                              <div className="text-sm font-medium">{member.membershipType}</div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-500">Skill Level</div>
                              <div className="text-sm font-medium">
                                {member.ntrpRating ? `${member.ntrpRating} NTRP` : member.skillLevel || 'N/A'}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-500">Join Date</div>
                              <div className="text-sm font-medium">
                                {new Date(member.startDate).toLocaleDateString()}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-500">Status</div>
                              <Badge className={getStatusColor(member.status)}>
                                {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                              </Badge>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-2 ml-4">
                          {member.status === 'pending' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateStatus(member.userId, 'active')}
                              className="text-green-600 hover:text-green-700"
                              title="Approve member"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {member.status === 'active' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateStatus(member.userId, 'suspended')}
                              className="text-orange-600 hover:text-orange-700"
                              title="Suspend member"
                            >
                              <XCircle className="h-4 w-4" />
                            </Button>
                          )}
                          {member.status === 'suspended' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateStatus(member.userId, 'active')}
                              className="text-green-600 hover:text-green-700"
                              title="Reactivate member"
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleAdmin(member.userId, member.isFacilityAdmin)}
                            className={member.isFacilityAdmin ? 'text-orange-600 hover:text-orange-700' : 'text-blue-600 hover:text-blue-700'}
                            title={member.isFacilityAdmin ? 'Remove admin privileges' : 'Grant admin privileges'}
                          >
                            {member.isFacilityAdmin ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveMember(member.userId, member.fullName)}
                            className="text-red-600 hover:text-red-700"
                            title="Remove member from facility"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
