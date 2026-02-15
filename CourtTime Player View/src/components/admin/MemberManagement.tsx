import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Search, UserPlus, Mail, Shield, ShieldOff, Edit, Trash2, CheckCircle, XCircle, Home, Plus, X, Settings, AlertTriangle } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { membersApi, addressWhitelistApi, tiersApi, strikesApi } from '../../api/client';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useAppContext } from '../../contexts/AppContext';

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
  phone?: string;
  createdAt: string;
}

export function MemberManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterMembership, setFilterMembership] = useState<string>('all');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Address whitelist management
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [whitelistAddresses, setWhitelistAddresses] = useState<Array<{id: string; address: string; accountsLimit: number}>>([]);
  const [newAddress, setNewAddress] = useState('');
  const [accountsPerAddress, setAccountsPerAddress] = useState(4);

  // Tier management
  const [facilityTiers, setFacilityTiers] = useState<any[]>([]);
  const [memberTiers, setMemberTiers] = useState<Record<string, string>>({}); // userId -> tierId

  // Strike management
  const [strikeDialogUserId, setStrikeDialogUserId] = useState<string | null>(null);
  const [strikeDialogName, setStrikeDialogName] = useState('');
  const [userStrikes, setUserStrikes] = useState<any[]>([]);
  const [strikesLoading, setStrikesLoading] = useState(false);
  const [newStrikeType, setNewStrikeType] = useState<string>('manual');
  const [newStrikeReason, setNewStrikeReason] = useState('');

  const { selectedFacilityId: currentFacilityId } = useAppContext();

  useEffect(() => {
    if (currentFacilityId) {
      loadMembers();
      loadWhitelistAddresses();
      loadFacilityTiers();
    }
  }, [currentFacilityId]);

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
        if (facilityTiers.length > 0) {
          loadMemberTiers(response.data.members);
        }
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

  const loadWhitelistAddresses = async () => {
    if (!currentFacilityId) return;

    try {
      const response = await addressWhitelistApi.getAll(currentFacilityId);

      if (response.success && response.data?.addresses) {
        setWhitelistAddresses(response.data.addresses);
      }
    } catch (error) {
      console.error('Error loading whitelist addresses:', error);
    }
  };

  const loadFacilityTiers = async () => {
    if (!currentFacilityId) return;
    try {
      const response = await tiersApi.getByFacility(currentFacilityId);
      if (response.success && response.data?.tiers) {
        setFacilityTiers(response.data.tiers);
      }
    } catch (error) {
      console.error('Error loading facility tiers:', error);
    }
  };

  const loadMemberTiers = async (memberList: Member[]) => {
    if (!currentFacilityId) return;
    const tierMap: Record<string, string> = {};
    for (const member of memberList) {
      try {
        const response = await tiersApi.getUserTier(member.userId, currentFacilityId);
        if (response.success && response.data?.tiers?.length > 0) {
          tierMap[member.userId] = response.data.tiers[0].tier_id;
        }
      } catch {
        // ignore
      }
    }
    setMemberTiers(tierMap);
  };

  const handleTierChange = async (userId: string, tierId: string) => {
    if (!currentFacilityId) return;
    try {
      if (tierId === 'none') {
        await tiersApi.unassignUser(userId, currentFacilityId);
        setMemberTiers(prev => {
          const next = { ...prev };
          delete next[userId];
          return next;
        });
        toast.success('Tier removed');
      } else {
        await tiersApi.assignTier(tierId, {
          userId,
          facilityId: currentFacilityId,
          assignedBy: user?.id,
        });
        setMemberTiers(prev => ({ ...prev, [userId]: tierId }));
        toast.success('Tier assigned');
      }
    } catch (error) {
      console.error('Error changing tier:', error);
      toast.error('Failed to change tier');
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
      const response = await membersApi.updateMember(currentFacilityId, userId, { status });

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

  const handleAddAddress = async () => {
    if (!currentFacilityId) return;

    if (!newAddress.trim()) {
      toast.error('Please enter an address');
      return;
    }

    if (whitelistAddresses.some(a => a.address === newAddress.trim())) {
      toast.error('Address already in whitelist');
      return;
    }

    try {
      const response = await addressWhitelistApi.add(currentFacilityId, newAddress.trim(), accountsPerAddress);

      if (response.success) {
        setNewAddress('');
        toast.success('Address added to whitelist');
        loadWhitelistAddresses();
      } else {
        toast.error(response.error || 'Failed to add address');
      }
    } catch (error) {
      console.error('Error adding address:', error);
      toast.error('Failed to add address');
    }
  };

  const handleRemoveAddress = async (addressId: string) => {
    if (!currentFacilityId) return;

    try {
      const response = await addressWhitelistApi.remove(currentFacilityId, addressId);

      if (response.success) {
        toast.success('Address removed from whitelist');
        loadWhitelistAddresses();
      } else {
        toast.error(response.error || 'Failed to remove address');
      }
    } catch (error) {
      console.error('Error removing address:', error);
      toast.error('Failed to remove address');
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
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-medium text-gray-900">Member Management</h1>
            <div className="flex gap-2">
              <Button onClick={() => setShowAddressDialog(true)} variant="outline">
                <Home className="h-4 w-4 mr-2" />
                Address Whitelist
              </Button>
              <Button onClick={loadMembers} variant="outline">
                Refresh
              </Button>
            </div>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Filter Members</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                <div className="space-y-2">
                  <Label htmlFor="filterMembership" className="text-sm">Membership Type</Label>
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
                        className="flex items-center justify-between px-4 py-2 border rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Avatar className="h-8 w-8 flex-shrink-0">
                            <AvatarFallback className="text-xs">{getInitials(member.fullName)}</AvatarFallback>
                          </Avatar>
                          <div className="flex items-center gap-6 flex-1 min-w-0">
                            <div className="min-w-[180px]">
                              <div className="font-medium text-sm flex items-center gap-2">
                                <span className="truncate">{member.fullName}</span>
                                {member.isFacilityAdmin && (
                                  <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-600 px-1.5 py-0">
                                    Admin
                                  </Badge>
                                )}
                              </div>
                              <div className="text-xs text-gray-500 truncate">{member.email}</div>
                            </div>
                            <div className="hidden md:flex items-center gap-6 text-xs text-gray-600">
                              <span className="w-16 text-center font-medium">{member.membershipType}</span>
                              <span className="w-20 text-center">{member.skillLevel || '—'}</span>
                              <span className="w-20 text-center">
                                {new Date(member.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' })}
                              </span>
                            </div>
                            <Badge className={`${getStatusColor(member.status)} text-xs px-2 py-0`}>
                              {member.status.charAt(0).toUpperCase() + member.status.slice(1)}
                            </Badge>
                            {facilityTiers.length > 0 && (
                              <Select
                                value={memberTiers[member.userId] || 'none'}
                                onValueChange={(value) => handleTierChange(member.userId, value)}
                              >
                                <SelectTrigger className="w-28 h-6 text-xs">
                                  <SelectValue placeholder="No tier" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">No tier</SelectItem>
                                  {facilityTiers.map((tier) => (
                                    <SelectItem key={tier.id} value={tier.id}>{tier.tier_name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-1 ml-3">
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
                              onClick={() => handleUpdateStatus(member.userId, 'suspended')}
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
                            className={`${member.isFacilityAdmin ? 'text-orange-600 hover:text-orange-700' : 'text-blue-600 hover:text-blue-700'} h-7 w-7 p-0`}
                            title={member.isFacilityAdmin ? 'Remove admin' : 'Make admin'}
                          >
                            {member.isFacilityAdmin ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
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
                      </div>
                    ))
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Address Whitelist Dialog */}
      <Dialog open={showAddressDialog} onOpenChange={setShowAddressDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Address Whitelist Management</DialogTitle>
            <DialogDescription>
              Manage approved addresses for auto-approval of new members. Members from these addresses will be automatically approved.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Account Limit Setting */}
            <div className="border-b pb-4">
              <Label htmlFor="accountLimit" className="text-sm font-medium">Accounts Per Address Limit</Label>
              <div className="flex items-center gap-4 mt-2">
                <Input
                  id="accountLimit"
                  type="number"
                  min="1"
                  max="10"
                  value={accountsPerAddress}
                  onChange={(e) => setAccountsPerAddress(parseInt(e.target.value) || 1)}
                  className="w-24"
                />
                <span className="text-sm text-gray-600">
                  Maximum number of member accounts allowed per address
                </span>
              </div>
            </div>

            {/* Add New Address */}
            <div>
              <Label htmlFor="newAddress" className="text-sm font-medium">Add New Address</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  id="newAddress"
                  placeholder="Enter full address..."
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAddress();
                    }
                  }}
                />
                <Button onClick={handleAddAddress}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>

            {/* Address List */}
            <div>
              <Label className="text-sm font-medium">Whitelisted Addresses ({whitelistAddresses.length})</Label>
              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                {whitelistAddresses.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    No addresses in whitelist. Add addresses to enable auto-approval.
                  </div>
                ) : (
                  whitelistAddresses.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2">
                        <Home className="h-4 w-4 text-gray-400" />
                        <div className="flex flex-col">
                          <span className="text-sm">{item.address}</span>
                          <span className="text-xs text-gray-500">Limit: {item.accountsLimit} accounts</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAddress(item.id)}
                        className="text-red-600 hover:text-red-700 h-8 w-8 p-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowAddressDialog(false)}>
                Cancel
              </Button>
              <Button onClick={() => {
                toast.success('Whitelist settings saved');
                setShowAddressDialog(false);
              }}>
                Save Changes
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
              <div className="grid grid-cols-2 gap-3">
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
    </>
  );
}
