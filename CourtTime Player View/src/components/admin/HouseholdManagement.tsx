import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import {
  Search, Plus, Home, ChevronDown, ChevronUp, Users, Star, StarOff,
  CheckCircle, XCircle, Clock, Trash2, UserPlus, Settings, Zap, RefreshCw
} from 'lucide-react';
import { householdsApi, membersApi } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { useAppContext } from '../../contexts/AppContext';
import { toast } from 'sonner';

interface Household {
  id: string;
  facility_id: string;
  hoa_address_id: string | null;
  street_address: string;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  household_name: string | null;
  max_members: number;
  max_active_reservations: number;
  prime_time_max_per_week: number;
  created_at: string;
  updated_at: string;
  member_count?: number;
  members?: HouseholdMember[];
}

interface HouseholdMember {
  id: string;
  household_id: string;
  user_id: string;
  is_primary: boolean;
  verification_status: 'pending' | 'verified' | 'rejected';
  added_at: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  full_name?: string;
}

interface FacilityMember {
  userId: string;
  email: string;
  fullName: string;
  status: string;
}

export function HouseholdManagement() {
  const { user } = useAuth();
  const [households, setHouseholds] = useState<Household[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedMembers, setExpandedMembers] = useState<HouseholdMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  // Create household dialog
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [createData, setCreateData] = useState({
    streetAddress: '',
    city: '',
    state: '',
    zipCode: '',
    householdName: '',
    maxMembers: 6,
    maxActiveReservations: 4,
    primeTimeMaxPerWeek: 3,
  });
  const [creating, setCreating] = useState(false);

  // Edit household dialog
  const [editingHousehold, setEditingHousehold] = useState<Household | null>(null);
  const [editData, setEditData] = useState({
    householdName: '',
    maxMembers: 6,
    maxActiveReservations: 4,
    primeTimeMaxPerWeek: 3,
  });

  // Add member dialog
  const [addMemberHouseholdId, setAddMemberHouseholdId] = useState<string | null>(null);
  const [facilityMembers, setFacilityMembers] = useState<FacilityMember[]>([]);
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [membersSearchLoading, setMembersSearchLoading] = useState(false);
  const [addingAsPrimary, setAddingAsPrimary] = useState(false);

  const { selectedFacilityId: currentFacilityId } = useAppContext();

  useEffect(() => {
    if (currentFacilityId) {
      loadHouseholds();
    }
  }, [currentFacilityId]);

  const loadHouseholds = async () => {
    if (!currentFacilityId) return;
    try {
      setLoading(true);
      const response = await householdsApi.getByFacility(currentFacilityId);
      if (response.success && response.data) {
        const data = response.data.households || response.data;
        setHouseholds(Array.isArray(data) ? data : []);
      } else {
        setHouseholds([]);
      }
    } catch (error) {
      console.error('Error loading households:', error);
      toast.error('Failed to load households');
    } finally {
      setLoading(false);
    }
  };

  const loadHouseholdMembers = async (householdId: string) => {
    try {
      setMembersLoading(true);
      const response = await householdsApi.getById(householdId);
      if (response.success && response.data) {
        const members = response.data.members || response.data.household?.members || [];
        setExpandedMembers(Array.isArray(members) ? members : []);
      }
    } catch (error) {
      console.error('Error loading household members:', error);
      toast.error('Failed to load members');
    } finally {
      setMembersLoading(false);
    }
  };

  const handleExpandToggle = async (householdId: string) => {
    if (expandedId === householdId) {
      setExpandedId(null);
      setExpandedMembers([]);
    } else {
      setExpandedId(householdId);
      await loadHouseholdMembers(householdId);
    }
  };

  const handleAutoCreate = async () => {
    if (!currentFacilityId) return;
    try {
      const response = await householdsApi.autoCreate(currentFacilityId);
      if (response.success) {
        const count = response.data?.created || response.data?.count || 0;
        toast.success(`Created ${count} household${count !== 1 ? 's' : ''} from HOA addresses`);
        loadHouseholds();
      } else {
        toast.error(response.error || 'Failed to auto-create households');
      }
    } catch (error) {
      console.error('Error auto-creating households:', error);
      toast.error('Failed to auto-create households');
    }
  };

  const handleCreate = async () => {
    if (!currentFacilityId) return;
    if (!createData.streetAddress.trim()) {
      toast.error('Street address is required');
      return;
    }
    try {
      setCreating(true);
      const response = await householdsApi.create({
        facilityId: currentFacilityId,
        streetAddress: createData.streetAddress.trim(),
        city: createData.city.trim() || undefined,
        state: createData.state.trim() || undefined,
        zipCode: createData.zipCode.trim() || undefined,
        householdName: createData.householdName.trim() || undefined,
        maxMembers: createData.maxMembers,
        maxActiveReservations: createData.maxActiveReservations,
        primeTimeMaxPerWeek: createData.primeTimeMaxPerWeek,
      });
      if (response.success) {
        toast.success('Household created');
        setShowCreateDialog(false);
        setCreateData({
          streetAddress: '', city: '', state: '', zipCode: '',
          householdName: '', maxMembers: 6, maxActiveReservations: 4, primeTimeMaxPerWeek: 3,
        });
        loadHouseholds();
      } else {
        toast.error(response.error || 'Failed to create household');
      }
    } catch (error) {
      console.error('Error creating household:', error);
      toast.error('Failed to create household');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEdit = (household: Household) => {
    setEditingHousehold(household);
    setEditData({
      householdName: household.household_name || '',
      maxMembers: household.max_members,
      maxActiveReservations: household.max_active_reservations,
      primeTimeMaxPerWeek: household.prime_time_max_per_week,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingHousehold) return;
    try {
      const response = await householdsApi.update(editingHousehold.id, {
        householdName: editData.householdName.trim() || undefined,
        maxMembers: editData.maxMembers,
        maxActiveReservations: editData.maxActiveReservations,
        primeTimeMaxPerWeek: editData.primeTimeMaxPerWeek,
      });
      if (response.success) {
        toast.success('Household updated');
        setEditingHousehold(null);
        loadHouseholds();
      } else {
        toast.error(response.error || 'Failed to update household');
      }
    } catch (error) {
      console.error('Error updating household:', error);
      toast.error('Failed to update household');
    }
  };

  const handleDelete = async (householdId: string, address: string) => {
    if (!confirm(`Are you sure you want to delete the household at "${address}"? This will remove all member associations.`)) {
      return;
    }
    try {
      const response = await householdsApi.delete(householdId, true);
      if (response.success) {
        toast.success('Household deleted');
        if (expandedId === householdId) {
          setExpandedId(null);
          setExpandedMembers([]);
        }
        loadHouseholds();
      } else {
        toast.error(response.error || 'Failed to delete household');
      }
    } catch (error) {
      console.error('Error deleting household:', error);
      toast.error('Failed to delete household');
    }
  };

  // Add member flow
  const handleOpenAddMember = async (householdId: string) => {
    setAddMemberHouseholdId(householdId);
    setMemberSearchTerm('');
    setFacilityMembers([]);
    setAddingAsPrimary(false);
    await searchFacilityMembers('');
  };

  const searchFacilityMembers = async (term: string) => {
    if (!currentFacilityId) return;
    try {
      setMembersSearchLoading(true);
      const response = await membersApi.getFacilityMembers(currentFacilityId, term);
      if (response.success && response.data?.members) {
        setFacilityMembers(response.data.members);
      }
    } catch (error) {
      console.error('Error searching members:', error);
    } finally {
      setMembersSearchLoading(false);
    }
  };

  const handleAddMember = async (userId: string) => {
    if (!addMemberHouseholdId) return;
    try {
      const response = await householdsApi.addMember(addMemberHouseholdId, {
        userId,
        isPrimary: addingAsPrimary,
        addedBy: user?.id,
      });
      if (response.success) {
        toast.success('Member added to household');
        setAddMemberHouseholdId(null);
        loadHouseholds();
        if (expandedId === addMemberHouseholdId) {
          loadHouseholdMembers(addMemberHouseholdId);
        }
      } else {
        toast.error(response.error || 'Failed to add member');
      }
    } catch (error) {
      console.error('Error adding member:', error);
      toast.error('Failed to add member');
    }
  };

  const handleVerifyMember = async (householdId: string, userId: string, status: 'verified' | 'rejected') => {
    try {
      const response = await householdsApi.updateMember(householdId, userId, {
        verificationStatus: status,
        verifiedBy: user?.id,
      });
      if (response.success) {
        toast.success(`Member ${status}`);
        loadHouseholdMembers(householdId);
      } else {
        toast.error(response.error || `Failed to ${status === 'verified' ? 'verify' : 'reject'} member`);
      }
    } catch (error) {
      console.error('Error updating member:', error);
      toast.error('Failed to update member');
    }
  };

  const handleSetPrimary = async (householdId: string, userId: string) => {
    try {
      const response = await householdsApi.updateMember(householdId, userId, {
        isPrimary: true,
      });
      if (response.success) {
        toast.success('Primary member updated');
        loadHouseholdMembers(householdId);
      } else {
        toast.error(response.error || 'Failed to set primary');
      }
    } catch (error) {
      console.error('Error setting primary:', error);
      toast.error('Failed to set primary');
    }
  };

  const handleRemoveMember = async (householdId: string, userId: string, name: string) => {
    if (!confirm(`Remove ${name} from this household?`)) return;
    try {
      const response = await householdsApi.removeMember(householdId, userId);
      if (response.success) {
        toast.success('Member removed');
        loadHouseholds();
        loadHouseholdMembers(householdId);
      } else {
        toast.error(response.error || 'Failed to remove member');
      }
    } catch (error) {
      console.error('Error removing member:', error);
      toast.error('Failed to remove member');
    }
  };

  // Filtering
  const filteredHouseholds = households.filter(h => {
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    return (
      h.street_address?.toLowerCase().includes(term) ||
      h.city?.toLowerCase().includes(term) ||
      h.household_name?.toLowerCase().includes(term) ||
      h.zip_code?.toLowerCase().includes(term)
    );
  });

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getVerificationColor = (status: string) => {
    switch (status) {
      case 'verified': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-yellow-100 text-yellow-800';
    }
  };

  if (!currentFacilityId) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Facility Selected</CardTitle>
            <CardDescription>You need to be associated with a facility to manage households.</CardDescription>
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
            <h1 className="text-2xl font-medium text-gray-900">Household Management</h1>
            <div className="flex gap-2">
              <Button onClick={handleAutoCreate} variant="outline">
                <Zap className="h-4 w-4 mr-2" />
                Auto-Create from HOA
              </Button>
              <Button onClick={() => setShowCreateDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Create Household
              </Button>
              <Button onClick={loadHouseholds} variant="outline">
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>

          {/* Search */}
          <Card className="mb-6">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">Search Households</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by address, name, or zip..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </CardContent>
          </Card>

          {/* Household List */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">
                  All Households ({filteredHouseholds.length})
                </CardTitle>
                <span className="text-sm text-gray-500">
                  {households.length} total
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">Loading households...</div>
              ) : filteredHouseholds.length === 0 ? (
                <div className="text-center py-12">
                  <Home className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 font-medium">No households found</p>
                  <p className="text-sm text-gray-400 mt-1">
                    {households.length === 0
                      ? 'Create households manually or auto-create from HOA addresses.'
                      : 'No households match your search.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredHouseholds.map((household) => (
                    <div key={household.id} className="border rounded-lg overflow-hidden">
                      {/* Household Row */}
                      <div
                        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => handleExpandToggle(household.id)}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex-shrink-0 h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center">
                            <Home className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm truncate">
                                {household.street_address}
                              </span>
                              {household.household_name && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {household.household_name}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-gray-500">
                              {[household.city, household.state, household.zip_code].filter(Boolean).join(', ')}
                            </div>
                          </div>
                          <div className="hidden md:flex items-center gap-4 text-xs text-gray-600">
                            <div className="flex items-center gap-1">
                              <Users className="h-3.5 w-3.5" />
                              <span className={`font-medium ${
                                (household.member_count || 0) >= household.max_members
                                  ? 'text-red-600' : 'text-gray-700'
                              }`}>
                                {household.member_count || 0}/{household.max_members}
                              </span>
                            </div>
                            <span className="text-gray-400">|</span>
                            <span>Max {household.max_active_reservations} res.</span>
                            <span className="text-gray-400">|</span>
                            <span>Prime {household.prime_time_max_per_week}/wk</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-3">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleOpenEdit(household); }}
                            className="h-7 w-7 p-0"
                            title="Edit settings"
                          >
                            <Settings className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleOpenAddMember(household.id); }}
                            className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700"
                            title="Add member"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); handleDelete(household.id, household.street_address); }}
                            className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                            title="Delete household"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                          {expandedId === household.id ? (
                            <ChevronUp className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </div>

                      {/* Expanded Members */}
                      {expandedId === household.id && (
                        <div className="border-t bg-gray-50 px-4 py-3">
                          {membersLoading ? (
                            <div className="text-center py-4 text-sm text-gray-500">Loading members...</div>
                          ) : expandedMembers.length === 0 ? (
                            <div className="text-center py-4">
                              <p className="text-sm text-gray-500">No members in this household.</p>
                              <Button
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={() => handleOpenAddMember(household.id)}
                              >
                                <UserPlus className="h-3.5 w-3.5 mr-1" />
                                Add First Member
                              </Button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-gray-500 mb-2">
                                Members ({expandedMembers.length})
                              </div>
                              {expandedMembers.map((member) => {
                                const displayName = member.full_name ||
                                  [member.first_name, member.last_name].filter(Boolean).join(' ') ||
                                  member.email || 'Unknown';
                                return (
                                  <div
                                    key={member.id}
                                    className="flex items-center justify-between p-2 bg-white rounded-lg border"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Avatar className="h-7 w-7">
                                        <AvatarFallback className="text-[10px]">
                                          {getInitials(displayName)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div>
                                        <div className="flex items-center gap-1.5">
                                          <span className="text-sm font-medium">{displayName}</span>
                                          {member.is_primary && (
                                            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                                          )}
                                        </div>
                                        <div className="text-xs text-gray-500">{member.email}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Badge className={`${getVerificationColor(member.verification_status)} text-[10px] px-1.5 py-0`}>
                                        {member.verification_status === 'verified' ? 'Verified' :
                                         member.verification_status === 'rejected' ? 'Rejected' : 'Pending'}
                                      </Badge>
                                      <div className="flex gap-1">
                                        {member.verification_status === 'pending' && (
                                          <>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleVerifyMember(household.id, member.user_id, 'verified')}
                                              className="h-6 w-6 p-0 text-green-600 hover:text-green-700"
                                              title="Verify"
                                            >
                                              <CheckCircle className="h-3 w-3" />
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              onClick={() => handleVerifyMember(household.id, member.user_id, 'rejected')}
                                              className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                                              title="Reject"
                                            >
                                              <XCircle className="h-3 w-3" />
                                            </Button>
                                          </>
                                        )}
                                        {!member.is_primary && (
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => handleSetPrimary(household.id, member.user_id)}
                                            className="h-6 w-6 p-0 text-amber-600 hover:text-amber-700"
                                            title="Set as primary"
                                          >
                                            <Star className="h-3 w-3" />
                                          </Button>
                                        )}
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => handleRemoveMember(household.id, member.user_id, displayName)}
                                          className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                                          title="Remove member"
                                        >
                                          <Trash2 className="h-3 w-3" />
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Create Household Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create Household</DialogTitle>
            <DialogDescription>
              Add a new household group for address-based booking limits.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Street Address *</Label>
              <Input
                value={createData.streetAddress}
                onChange={(e) => setCreateData(prev => ({ ...prev, streetAddress: e.target.value }))}
                placeholder="123 Main Street"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={createData.city}
                  onChange={(e) => setCreateData(prev => ({ ...prev, city: e.target.value }))}
                  placeholder="City"
                />
              </div>
              <div className="space-y-2">
                <Label>State</Label>
                <Input
                  value={createData.state}
                  onChange={(e) => setCreateData(prev => ({ ...prev, state: e.target.value }))}
                  placeholder="State"
                />
              </div>
              <div className="space-y-2">
                <Label>Zip Code</Label>
                <Input
                  value={createData.zipCode}
                  onChange={(e) => setCreateData(prev => ({ ...prev, zipCode: e.target.value }))}
                  placeholder="12345"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Household Name (optional)</Label>
              <Input
                value={createData.householdName}
                onChange={(e) => setCreateData(prev => ({ ...prev, householdName: e.target.value }))}
                placeholder="e.g., The Smith Family"
              />
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2 border-t">
              <div className="space-y-2">
                <Label className="text-xs">Max Members</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={createData.maxMembers}
                  onChange={(e) => setCreateData(prev => ({ ...prev, maxMembers: parseInt(e.target.value) || 6 }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Max Reservations</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={createData.maxActiveReservations}
                  onChange={(e) => setCreateData(prev => ({ ...prev, maxActiveReservations: parseInt(e.target.value) || 4 }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Prime-Time/Week</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={createData.primeTimeMaxPerWeek}
                  onChange={(e) => setCreateData(prev => ({ ...prev, primeTimeMaxPerWeek: parseInt(e.target.value) || 3 }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating...' : 'Create Household'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Household Dialog */}
      <Dialog open={editingHousehold !== null} onOpenChange={(open) => { if (!open) setEditingHousehold(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Household Settings</DialogTitle>
            <DialogDescription>
              {editingHousehold?.street_address}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Household Name</Label>
              <Input
                value={editData.householdName}
                onChange={(e) => setEditData(prev => ({ ...prev, householdName: e.target.value }))}
                placeholder="e.g., The Smith Family"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Max Members</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={editData.maxMembers}
                  onChange={(e) => setEditData(prev => ({ ...prev, maxMembers: parseInt(e.target.value) || 6 }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Max Reservations</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={editData.maxActiveReservations}
                  onChange={(e) => setEditData(prev => ({ ...prev, maxActiveReservations: parseInt(e.target.value) || 4 }))}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Prime-Time/Week</Label>
                <Input
                  type="number"
                  min={0}
                  max={20}
                  value={editData.primeTimeMaxPerWeek}
                  onChange={(e) => setEditData(prev => ({ ...prev, primeTimeMaxPerWeek: parseInt(e.target.value) || 3 }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => setEditingHousehold(null)}>Cancel</Button>
              <Button onClick={handleSaveEdit}>Save Changes</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Member Dialog */}
      <Dialog open={addMemberHouseholdId !== null} onOpenChange={(open) => { if (!open) setAddMemberHouseholdId(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Member to Household</DialogTitle>
            <DialogDescription>
              Search for a facility member to add to this household.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search members by name or email..."
                value={memberSearchTerm}
                onChange={(e) => {
                  setMemberSearchTerm(e.target.value);
                  searchFacilityMembers(e.target.value);
                }}
                className="pl-10"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={addingAsPrimary}
                onCheckedChange={setAddingAsPrimary}
              />
              <Label className="text-sm">Set as primary account holder</Label>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1">
              {membersSearchLoading ? (
                <div className="text-center py-4 text-sm text-gray-500">Searching...</div>
              ) : facilityMembers.length === 0 ? (
                <div className="text-center py-4 text-sm text-gray-500">
                  {memberSearchTerm ? 'No members found.' : 'Type to search for members.'}
                </div>
              ) : (
                facilityMembers
                  .filter(m => m.status === 'active')
                  .map((member) => (
                    <div
                      key={member.userId}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-gray-50 border cursor-pointer"
                      onClick={() => handleAddMember(member.userId)}
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="text-[10px]">
                            {getInitials(member.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium">{member.fullName}</div>
                          <div className="text-xs text-gray-500">{member.email}</div>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="h-6 text-xs">
                        Add
                      </Button>
                    </div>
                  ))
              )}
            </div>
            <div className="flex justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setAddMemberHouseholdId(null)}>Close</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
