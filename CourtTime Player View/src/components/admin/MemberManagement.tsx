import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Search, UserPlus, Mail, Shield, ShieldOff, Edit, Trash2, CheckCircle, XCircle, X, Settings, AlertTriangle, Clock, MapPin, Phone, User, MoreVertical, Eye, EyeOff, Lock, LockOpen } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '../ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { membersApi, strikesApi, stripeConnectApi, isStripeConnectReadyFromResponse } from '../../api/client';
import { LockMemberPaymentDialog, type LockMemberTarget } from './LockMemberPaymentDialog';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { isSessionAuthError } from '../../../shared/utils/sessionAuth';
import { useAppContext } from '../../contexts/AppContext';
import { HouseholdManagement } from './HouseholdManagement';
import { AddressWhitelistPanel } from './AddressWhitelistPanel';

interface Member {
  userId: string;
  email: string;
  fullName: string;
  membershipId: string;
  membershipType: string;
  status: 'active' | 'pending' | 'expired' | 'suspended';
  isFacilityAdmin: boolean;
  isViewOnly: boolean;
  isPaymentLocked: boolean;
  paymentLockedAt?: string;
  lockoutAmountCents?: number | null;
  lockoutDescription?: string | null;
  startDate: string;
  endDate?: string;
  suspendedUntil?: string;
  skillLevel?: string;
  phone?: string;
  streetAddress?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  createdAt: string;
}

export function MemberManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>(() => {
    const status = searchParams.get('status');
    return status === 'pending' ? 'pending' : 'all';
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Strike management
  const [strikeDialogUserId, setStrikeDialogUserId] = useState<string | null>(null);
  const [strikeDialogName, setStrikeDialogName] = useState('');
  const [userStrikes, setUserStrikes] = useState<any[]>([]);
  const [strikesLoading, setStrikesLoading] = useState(false);
  const [newStrikeType, setNewStrikeType] = useState<string>('manual');
  const [newStrikeReason, setNewStrikeReason] = useState('');

  // Member detail dialog
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // Suspension dialog
  const [suspendDialogUserId, setSuspendDialogUserId] = useState<string | null>(null);
  const [suspendDialogName, setSuspendDialogName] = useState('');
  const [suspendDuration, setSuspendDuration] = useState<string>('7d');

  // Payment lockout dialog
  const [lockPaymentMember, setLockPaymentMember] = useState<LockMemberTarget | null>(null);
  const [stripeConnected, setStripeConnected] = useState(true);

  const { selectedFacilityId: currentFacilityId } = useAppContext();

  useEffect(() => {
    const status = searchParams.get('status');
    if (status === 'pending') {
      setFilterStatus('pending');
    }
  }, [searchParams]);

  useEffect(() => {
    if (currentFacilityId) {
      loadMembers();
      void loadStripeStatus();
    }
  }, [currentFacilityId]);

  const loadStripeStatus = async () => {
    if (!currentFacilityId) return;
    try {
      const res = await stripeConnectApi.getStatus(currentFacilityId);
      setStripeConnected(isStripeConnectReadyFromResponse(res));
    } catch {
      setStripeConnected(false);
    }
  };

  const loadMembers = async () => {
    if (!currentFacilityId) {
      toast.error('No facility selected');
      return;
    }

    try {
      setLoading(true);
      const response = await membersApi.getFacilityMembers(currentFacilityId, searchTerm);

      if (response.success && response.data?.members) {
        setMembers(response.data.members);
      } else if (!isSessionAuthError(response.error)) {
        toast.error(response.error || 'Failed to load members');
      }
    } catch (error) {
      console.error('Error loading members:', error);
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const openStrikeDialog = async (userId: string, name: string) => {
    setStrikeDialogUserId(userId);
    setStrikeDialogName(name);
    setNewStrikeType('manual');
    setNewStrikeReason('');
    await loadUserStrikes(userId);
  };

  const loadUserStrikes = async (userId: string) => {
    if (!currentFacilityId) return;
    try {
      setStrikesLoading(true);
      const response = await strikesApi.getByFacility(currentFacilityId, { userId });
      if (response.success && response.data?.strikes) {
        setUserStrikes(response.data.strikes);
      }
    } catch (error) {
      console.error('Error loading strikes:', error);
    } finally {
      setStrikesLoading(false);
    }
  };

  const handleIssueStrike = async () => {
    if (!currentFacilityId || !strikeDialogUserId) return;
    if (!newStrikeReason.trim()) {
      toast.error('Please provide a reason for the strike');
      return;
    }
    try {
      const response = await strikesApi.issue({
        userId: strikeDialogUserId,
        facilityId: currentFacilityId,
        strikeType: newStrikeType as 'no_show' | 'late_cancel' | 'manual',
        strikeReason: newStrikeReason,
        issuedBy: user?.id,
      });
      if (response.success) {
        toast.success('Strike issued');
        setNewStrikeReason('');
        loadUserStrikes(strikeDialogUserId);
      } else {
        toast.error(response.error || 'Failed to issue strike');
      }
    } catch (error) {
      console.error('Error issuing strike:', error);
      toast.error('Failed to issue strike');
    }
  };

  const handleRevokeStrike = async (strikeId: string) => {
    if (!strikeDialogUserId) return;
    try {
      const response = await strikesApi.revoke(strikeId, {
        revokedBy: user?.id || '',
        revokeReason: 'Revoked by admin',
      });
      if (response.success) {
        toast.success('Strike revoked');
        loadUserStrikes(strikeDialogUserId);
      } else {
        toast.error(response.error || 'Failed to revoke strike');
      }
    } catch (error) {
      console.error('Error revoking strike:', error);
      toast.error('Failed to revoke strike');
    }
  };

  const handleUpdateStatus = async (userId: string, status: 'active' | 'pending' | 'suspended') => {
    if (!currentFacilityId) return;

    try {
      const updates: any = { status };
      // Clear suspension date when reactivating
      if (status === 'active') {
        updates.suspendedUntil = null;
      }

      const response = await membersApi.updateMember(currentFacilityId, userId, updates);

      if (response.success) {
        toast.success(`Member status updated to ${status}`);
        loadMembers();
      } else {
        toast.error(response.error || 'Failed to update member status');
      }
    } catch (error) {
      console.error('Error updating member status:', error);
      toast.error('Failed to update member status');
    }
  };

  const handleSuspendWithDuration = async () => {
    if (!currentFacilityId || !suspendDialogUserId) return;

    let suspendedUntil: string | null = null;

    if (suspendDuration !== 'indefinite') {
      const now = new Date();
      const durationMap: Record<string, number> = {
        '1d': 1, '3d': 3, '7d': 7, '14d': 14, '30d': 30, '90d': 90,
      };
      const days = durationMap[suspendDuration];
      if (days) {
        now.setDate(now.getDate() + days);
        suspendedUntil = now.toISOString();
      }
    }

    try {
      const response = await membersApi.updateMember(currentFacilityId, suspendDialogUserId, {
        status: 'suspended',
        suspendedUntil,
      });

      if (response.success) {
        const durationLabel = suspendDuration === 'indefinite' ? 'indefinitely' : `for ${suspendDuration.replace('d', ' day(s)')}`;
        toast.success(`Member suspended ${durationLabel}`);
        setSuspendDialogUserId(null);
        loadMembers();
      } else {
        toast.error(response.error || 'Failed to suspend member');
      }
    } catch (error) {
      console.error('Error suspending member:', error);
      toast.error('Failed to suspend member');
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
        loadMembers();
      } else {
        toast.error(response.error || 'Failed to update admin status');
      }
    } catch (error) {
      console.error('Error updating admin status:', error);
      toast.error('Failed to update admin status');
    }
  };

  const handleToggleViewOnly = async (userId: string, currentIsViewOnly: boolean) => {
    if (!currentFacilityId) return;

    try {
      const response = await membersApi.updateMember(currentFacilityId, userId, { isViewOnly: !currentIsViewOnly });

      if (response.success) {
        toast.success(currentIsViewOnly ? 'View-only removed' : 'Member set to view-only');
        loadMembers();
      } else {
        toast.error(response.error || 'Failed to update view-only status');
      }
    } catch (error) {
      console.error('Error updating view-only status:', error);
      toast.error('Failed to update view-only status');
    }
  };

  const openLockPaymentDialog = (member: Member) => {
    if (!stripeConnected) {
      toast.error('Complete Stripe Connect setup under Member Payments first');
      return;
    }
    setLockPaymentMember({
      userId: member.userId,
      fullName: member.fullName,
      email: member.email,
    });
  };

  const handleClearPaymentLockout = async (userId: string, memberName: string) => {
    if (!currentFacilityId) return;
    if (!confirm(`Clear payment lockout for ${memberName}? They will regain app access immediately.`)) {
      return;
    }

    try {
      const response = await membersApi.setPaymentLockout(currentFacilityId, userId, false);

      if (response.success) {
        toast.success('Lockout cleared — member can now access the app');
        loadMembers();
      } else {
        toast.error(response.error || 'Failed to clear payment lockout');
      }
    } catch (error) {
      console.error('Error clearing payment lockout:', error);
      toast.error('Failed to clear payment lockout');
    }
  };

  const handlePaymentLockAction = (member: Member) => {
    if (member.isPaymentLocked) {
      void handleClearPaymentLockout(member.userId, member.fullName);
    } else {
      openLockPaymentDialog(member);
    }
  };

  const handleRemoveMember = async (userId: string, memberName: string) => {
    if (!currentFacilityId) return;

    if (!confirm(`Are you sure you want to remove ${memberName} from this facility?`)) {
      return;
    }

    try {
      const response = await membersApi.removeMember(currentFacilityId, userId);

      if (response.success) {
        toast.success('Member removed from facility');
        loadMembers();
      } else {
        toast.error(response.error || 'Failed to remove member');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Failed to remove member');
    }
  };

  const filteredMembers = members.filter(member => {
    const term = searchTerm.trim().toLowerCase();
    const searchableText = [
      member.fullName,
      member.email,
      member.streetAddress,
      member.city,
      member.state,
      member.zipCode,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    const matchesSearch = !term || searchableText.includes(term);
    const matchesStatus = filterStatus === 'all' || member.status === filterStatus;
    return matchesSearch && matchesStatus;
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
      <div className="flex items-center justify-center h-64">
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
    <>
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-medium text-gray-900">Member Management</h1>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="flex flex-wrap">
              <TabsTrigger value="members" className="px-4">Members</TabsTrigger>
              <TabsTrigger value="whitelist" className="px-4">Add New Member</TabsTrigger>
              <TabsTrigger value="households" className="px-4">Households</TabsTrigger>
            </TabsList>

            <TabsContent value="members" className="space-y-6">
          <div className="flex justify-end gap-2 mb-4">
              <Button onClick={loadMembers} variant="outline">
                Refresh
              </Button>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Filter Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="search" className="text-sm">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="search"
                      placeholder="Name, email, or address..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filterStatus" className="text-sm">Status</Label>
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
              </div>
            </CardContent>
          </Card>

          {/* Members List - Compact Design */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">All Members ({filteredMembers.length})</CardTitle>
                <span className="text-sm text-gray-500">
                  {filteredMembers.filter(m => m.status === 'pending').length} pending approval
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">
                  Loading members...
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredMembers.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      No members found matching your filters.
                    </div>
                  ) : (
                    filteredMembers.map((member) => (
                      <div
                        key={member.userId}
                        className="flex items-center justify-between px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setSelectedMember(member)}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-8 w-8 flex-shrink-0 hidden md:flex">
                            <AvatarFallback className="text-xs">{getInitials(member.fullName)}</AvatarFallback>
                          </Avatar>
                          <div className="flex items-center gap-2 md:gap-6 flex-1 min-w-0">
                            <div className="min-w-0 flex-1 md:flex-none md:min-w-[180px]">
                              <div className="font-medium text-sm flex items-center gap-2">
                                <span className="truncate">{member.fullName}</span>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 flex-shrink-0 ${
                                  member.isFacilityAdmin
                                    ? 'text-green-600 border-green-600'
                                    : 'text-gray-500 border-gray-300'
                                }`}>
                                  {member.isFacilityAdmin ? 'Admin' : 'Regular'}
                                </Badge>
                                {member.isViewOnly && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0 text-blue-600 border-blue-400">
                                    View Only
                                  </Badge>
                                )}
                                {member.isPaymentLocked && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 flex-shrink-0 text-red-600 border-red-400">
                                    {member.lockoutAmountCents
                                      ? `Payment Locked · $${(member.lockoutAmountCents / 100).toFixed(2)}`
                                      : 'Payment Locked'}
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 truncate">{member.email}</div>
                            </div>
                            <div className="hidden md:flex items-center gap-6 text-xs text-gray-600">
                              <span className="w-20 text-center">{member.skillLevel || '—'}</span>
                              <span className="w-20 text-center">
                                {new Date(member.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                              </span>
                            </div>
                            <Badge className={`${getStatusColor(member.status)} text-xs px-2 py-0 flex-shrink-0`}>
                              {member.status === 'suspended' && member.suspendedUntil
                                ? `Suspended until ${new Date(member.suspendedUntil).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
                                : member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                            </Badge>
                          </div>
                        </div>
                        {/* Desktop action buttons */}
                        <div className="hidden md:flex gap-1 ml-3" onClick={(e) => e.stopPropagation()}>
                          {member.status === 'pending' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateStatus(member.userId, 'active')}
                              className="text-green-600 hover:text-green-700 h-7 w-7 p-0"
                              title="Approve member"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {member.status === 'active' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setSuspendDialogUserId(member.userId);
                                setSuspendDialogName(member.fullName);
                                setSuspendDuration('7d');
                              }}
                              className="text-orange-600 hover:text-orange-700 h-7 w-7 p-0"
                              title="Suspend member"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {member.status === 'suspended' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleUpdateStatus(member.userId, 'active')}
                              className="text-green-600 hover:text-green-700 h-7 w-7 p-0"
                              title="Reactivate member"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleAdmin(member.userId, member.isFacilityAdmin)}
                            className={`${member.isFacilityAdmin ? 'text-orange-600 hover:text-orange-700' : 'text-green-600 hover:text-green-700'} h-7 w-7 p-0`}
                            title={member.isFacilityAdmin ? 'Remove admin' : 'Make admin'}
                          >
                            {member.isFacilityAdmin ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleToggleViewOnly(member.userId, member.isViewOnly)}
                            className={`${member.isViewOnly ? 'text-blue-600 hover:text-blue-700' : 'text-gray-500 hover:text-gray-700'} h-7 w-7 p-0`}
                            title={member.isViewOnly ? 'Remove view-only' : 'Set view-only'}
                          >
                            {member.isViewOnly ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handlePaymentLockAction(member)}
                            className={`${member.isPaymentLocked ? 'text-red-600 hover:text-red-700' : 'text-gray-500 hover:text-gray-700'} h-7 w-7 p-0`}
                            title={member.isPaymentLocked ? 'Clear payment lockout' : 'Lock & require payment'}
                          >
                            {member.isPaymentLocked ? <LockOpen className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openStrikeDialog(member.userId, member.fullName)}
                            className="text-amber-600 hover:text-amber-700 h-7 w-7 p-0"
                            title="Manage strikes"
                          >
                            <AlertTriangle className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveMember(member.userId, member.fullName)}
                            className="text-red-600 hover:text-red-700 h-7 w-7 p-0"
                            title="Remove member"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        {/* Mobile action dropdown */}
                        <div className="md:hidden ml-3" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="sm" className="h-9 w-9 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {member.status === 'pending' && (
                                <DropdownMenuItem onClick={() => handleUpdateStatus(member.userId, 'active')} className="text-green-600">
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Approve
                                </DropdownMenuItem>
                              )}
                              {member.status === 'active' && (
                                <DropdownMenuItem onClick={() => {
                                  setSuspendDialogUserId(member.userId);
                                  setSuspendDialogName(member.fullName);
                                  setSuspendDuration('7d');
                                }} className="text-orange-600">
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Suspend
                                </DropdownMenuItem>
                              )}
                              {member.status === 'suspended' && (
                                <DropdownMenuItem onClick={() => handleUpdateStatus(member.userId, 'active')} className="text-green-600">
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Reactivate
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem onClick={() => handleToggleAdmin(member.userId, member.isFacilityAdmin)}>
                                {member.isFacilityAdmin ? <ShieldOff className="h-4 w-4 mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                                {member.isFacilityAdmin ? 'Remove Admin' : 'Make Admin'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleToggleViewOnly(member.userId, member.isViewOnly)} className={member.isViewOnly ? 'text-blue-600' : ''}>
                                {member.isViewOnly ? <EyeOff className="h-4 w-4 mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                                {member.isViewOnly ? 'Remove View-Only' : 'Set View-Only'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handlePaymentLockAction(member)} className={member.isPaymentLocked ? 'text-red-600' : ''}>
                                {member.isPaymentLocked ? <LockOpen className="h-4 w-4 mr-2" /> : <Lock className="h-4 w-4 mr-2" />}
                                {member.isPaymentLocked ? 'Clear Payment Lockout' : 'Lock & Require Payment'}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => openStrikeDialog(member.userId, member.fullName)} className="text-amber-600">
                                <AlertTriangle className="h-4 w-4 mr-2" />
                                Manage Strikes
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleRemoveMember(member.userId, member.fullName)} className="text-red-600">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
            </TabsContent>

            <TabsContent value="whitelist" className="space-y-6">
              <AddressWhitelistPanel facilityId={currentFacilityId} />
            </TabsContent>

            <TabsContent value="households">
              <HouseholdManagement />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Strike Management Dialog */}
      <Dialog open={strikeDialogUserId !== null} onOpenChange={(open) => { if (!open) setStrikeDialogUserId(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Strikes - {strikeDialogName}
            </DialogTitle>
            <DialogDescription>
              View, issue, and revoke strikes for this member.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Issue New Strike */}
            <div className="p-4 border rounded-lg bg-amber-50 space-y-3">
              <h4 className="font-medium text-sm">Issue New Strike</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Strike Type</Label>
                  <Select value={newStrikeType} onValueChange={setNewStrikeType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no_show">No Show</SelectItem>
                      <SelectItem value="late_cancel">Late Cancellation</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reason</Label>
                  <Input
                    value={newStrikeReason}
                    onChange={(e) => setNewStrikeReason(e.target.value)}
                    placeholder="Reason for strike..."
                  />
                </div>
              </div>
              <Button size="sm" onClick={handleIssueStrike}>
                Issue Strike
              </Button>
            </div>

            {/* Strike History */}
            <div>
              <Label className="text-sm font-medium">Strike History ({userStrikes.length})</Label>
              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                {strikesLoading ? (
                  <div className="text-center py-4 text-gray-500 text-sm">Loading strikes...</div>
                ) : userStrikes.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-sm">No strikes on record.</div>
                ) : (
                  userStrikes.map((strike) => (
                    <div
                      key={strike.id}
                      className={`flex items-center justify-between p-3 border rounded-lg ${
                        strike.revoked ? 'bg-gray-50 opacity-60' : 'hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Badge className={
                          strike.revoked ? 'bg-gray-100 text-gray-500' :
                          strike.strike_type === 'no_show' ? 'bg-red-100 text-red-700' :
                          strike.strike_type === 'late_cancel' ? 'bg-orange-100 text-orange-700' :
                          'bg-amber-100 text-amber-700'
                        }>
                          {strike.strike_type === 'no_show' ? 'No Show' :
                           strike.strike_type === 'late_cancel' ? 'Late Cancel' : 'Manual'}
                        </Badge>
                        <div>
                          <div className="text-sm">{strike.strike_reason || 'No reason provided'}</div>
                          <div className="text-xs text-gray-500">
                            {new Date(strike.issued_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            {strike.revoked && ' (Revoked)'}
                          </div>
                        </div>
                      </div>
                      {!strike.revoked && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevokeStrike(strike.id)}
                          className="text-xs h-7"
                        >
                          Revoke
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setStrikeDialogUserId(null)}>
                Close
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Suspension Dialog */}
      <Dialog open={suspendDialogUserId !== null} onOpenChange={(open) => { if (!open) setSuspendDialogUserId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-orange-600" />
              Suspend Member
            </DialogTitle>
            <DialogDescription>
              Choose how long to suspend <span className="font-medium">{suspendDialogName}</span>. The member will be automatically reactivated when the suspension expires.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-sm font-medium">Suspension Duration</Label>
              <Select value={suspendDuration} onValueChange={setSuspendDuration}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1d">1 Day</SelectItem>
                  <SelectItem value="3d">3 Days</SelectItem>
                  <SelectItem value="7d">1 Week</SelectItem>
                  <SelectItem value="14d">2 Weeks</SelectItem>
                  <SelectItem value="30d">1 Month</SelectItem>
                  <SelectItem value="90d">3 Months</SelectItem>
                  <SelectItem value="indefinite">Indefinite</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {suspendDuration !== 'indefinite' && (
              <p className="text-sm text-gray-600">
                Suspension will expire on{' '}
                <span className="font-medium">
                  {(() => {
                    const d = new Date();
                    const days: Record<string, number> = { '1d': 1, '3d': 3, '7d': 7, '14d': 14, '30d': 30, '90d': 90 };
                    d.setDate(d.getDate() + (days[suspendDuration] || 0));
                    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                  })()}
                </span>
              </p>
            )}
            {suspendDuration === 'indefinite' && (
              <p className="text-sm text-gray-600">
                The member will remain suspended until manually reactivated by an admin.
              </p>
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setSuspendDialogUserId(null)}>
                Cancel
              </Button>
              <Button
                onClick={handleSuspendWithDuration}
                className="bg-orange-600 hover:bg-orange-700 text-white"
              >
                Suspend Member
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Member Detail Dialog */}
      <Dialog open={selectedMember !== null} onOpenChange={(open) => { if (!open) setSelectedMember(null); }}>
        <DialogContent className="max-w-lg">
          {selectedMember && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarFallback>{getInitials(selectedMember.fullName)}</AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {selectedMember.fullName}
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                        selectedMember.isFacilityAdmin
                          ? 'text-green-600 border-green-600'
                          : 'text-gray-500 border-gray-300'
                      }`}>
                        {selectedMember.isFacilityAdmin ? 'Admin' : 'Regular'}
                      </Badge>
                      {selectedMember.isViewOnly && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-blue-600 border-blue-400">
                          View Only
                        </Badge>
                      )}
                      {selectedMember.isPaymentLocked && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-red-600 border-red-400">
                          {selectedMember.lockoutAmountCents
                            ? `Payment Locked · $${(selectedMember.lockoutAmountCents / 100).toFixed(2)}`
                            : 'Payment Locked'}
                        </Badge>
                      )}
                      <Badge className={`${getStatusColor(selectedMember.status)} text-[10px] px-1.5 py-0`}>
                        {selectedMember.status.charAt(0).toUpperCase() + selectedMember.status.slice(1)}
                      </Badge>
                    </div>
                  </div>
                </DialogTitle>
              </DialogHeader>

              <div className="space-y-4 pt-2">
                {/* Contact Info */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700">Contact Information</h4>
                  <div className="grid gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span>{selectedMember.email}</span>
                    </div>
                    {selectedMember.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <span>{selectedMember.phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Address */}
                {selectedMember.streetAddress && (
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium text-gray-700">Address</h4>
                    <div className="flex items-start gap-2 text-sm">
                      <MapPin className="h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div>
                        <div>{selectedMember.streetAddress}</div>
                        {(selectedMember.city || selectedMember.state || selectedMember.zipCode) && (
                          <div>
                            {[selectedMember.city, selectedMember.state].filter(Boolean).join(', ')}
                            {selectedMember.zipCode && ` ${selectedMember.zipCode}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Membership Details */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-gray-700">Membership Details</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Member Since</span>
                      <div className="font-medium">
                        {new Date(selectedMember.startDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                      </div>
                    </div>
                    {selectedMember.skillLevel && (
                      <div>
                        <span className="text-gray-500">Skill Level</span>
                        <div className="font-medium">{selectedMember.skillLevel}</div>
                      </div>
                    )}
                    {selectedMember.suspendedUntil && selectedMember.status === 'suspended' && (
                      <div>
                        <span className="text-gray-500">Suspended Until</span>
                        <div className="font-medium text-red-600">
                          {new Date(selectedMember.suspendedUntil).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2 pt-3 border-t">
                  {selectedMember.status === 'pending' && (
                    <Button
                      size="sm"
                      onClick={() => { handleUpdateStatus(selectedMember.userId, 'active'); setSelectedMember(null); }}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  )}
                  {selectedMember.status === 'active' && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSuspendDialogUserId(selectedMember.userId);
                        setSuspendDialogName(selectedMember.fullName);
                        setSuspendDuration('7d');
                        setSelectedMember(null);
                      }}
                      className="text-orange-600 hover:text-orange-700"
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Suspend
                    </Button>
                  )}
                  {selectedMember.status === 'suspended' && (
                    <Button
                      size="sm"
                      onClick={() => { handleUpdateStatus(selectedMember.userId, 'active'); setSelectedMember(null); }}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Reactivate
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { handleToggleAdmin(selectedMember.userId, selectedMember.isFacilityAdmin); setSelectedMember(null); }}
                  >
                    {selectedMember.isFacilityAdmin ? <ShieldOff className="h-4 w-4 mr-1" /> : <Shield className="h-4 w-4 mr-1" />}
                    {selectedMember.isFacilityAdmin ? 'Remove Admin' : 'Make Admin'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { handleToggleViewOnly(selectedMember.userId, selectedMember.isViewOnly); setSelectedMember(null); }}
                    className={selectedMember.isViewOnly ? 'text-blue-600 hover:text-blue-700' : ''}
                  >
                    {selectedMember.isViewOnly ? <EyeOff className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                    {selectedMember.isViewOnly ? 'Remove View-Only' : 'Set View-Only'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      handlePaymentLockAction(selectedMember);
                      if (selectedMember.isPaymentLocked) setSelectedMember(null);
                    }}
                    className={selectedMember.isPaymentLocked ? 'text-red-600 hover:text-red-700' : ''}
                  >
                    {selectedMember.isPaymentLocked ? <LockOpen className="h-4 w-4 mr-1" /> : <Lock className="h-4 w-4 mr-1" />}
                    {selectedMember.isPaymentLocked ? 'Clear Payment Lockout' : 'Lock & Require Payment'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { openStrikeDialog(selectedMember.userId, selectedMember.fullName); setSelectedMember(null); }}
                    className="text-amber-600 hover:text-amber-700"
                  >
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    Strikes
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { handleRemoveMember(selectedMember.userId, selectedMember.fullName); setSelectedMember(null); }}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <LockMemberPaymentDialog
        open={lockPaymentMember !== null}
        onOpenChange={(open) => { if (!open) setLockPaymentMember(null); }}
        facilityId={currentFacilityId}
        member={lockPaymentMember}
        stripeConnected={stripeConnected}
        onSuccess={() => {
          setLockPaymentMember(null);
          setSelectedMember(null);
          loadMembers();
        }}
      />
    </>
  );
}
