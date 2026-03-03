import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Search, UserPlus, Mail, Shield, ShieldOff, Edit, Trash2, CheckCircle, XCircle, Home, Plus, X, Settings, AlertTriangle, Clock, MapPin, Phone, User, MoreVertical, Upload } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '../ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { membersApi, addressWhitelistApi, strikesApi } from '../../api/client';
import { Switch } from '../ui/switch';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
import { useAppContext } from '../../contexts/AppContext';
import { HouseholdManagement } from './HouseholdManagement';

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
  const [activeTab, setActiveTab] = useState('members');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  // Address whitelist management
  const [showAddressDialog, setShowAddressDialog] = useState(false);
  const [whitelistAddresses, setWhitelistAddresses] = useState<Array<{id: string; address: string; lastName: string; accountsLimit: number}>>([]);
  const [newAddress, setNewAddress] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [accountsPerAddress, setAccountsPerAddress] = useState(4);
  const [whitelistUploading, setWhitelistUploading] = useState(false);
  const whitelistFileRef = useRef<HTMLInputElement>(null);

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

  const { selectedFacilityId: currentFacilityId } = useAppContext();

  useEffect(() => {
    if (currentFacilityId) {
      loadMembers();
      loadWhitelistAddresses();
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

    try {
      const response = await addressWhitelistApi.add(currentFacilityId, newAddress.trim(), accountsPerAddress, newLastName.trim());

      if (response.success) {
        setNewAddress('');
        setNewLastName('');
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

  const handleWhitelistFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentFacilityId) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      toast.error('Please select a CSV or Excel (.xlsx, .xls) file');
      return;
    }

    setWhitelistUploading(true);

    try {
      let addresses: Array<{ address: string; lastName?: string; accountsLimit?: number }> = [];

      if (ext === 'csv') {
        const text = await file.text();
        const lines = text.split(/\r?\n/).filter(line => line.trim());
        if (lines.length > 0) {
          const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/[\s_-]+/g, ''));
          const addressCol = headers.findIndex(h => h.includes('address') || h.includes('street'));
          const lastNameCol = headers.findIndex(h => /^(lastname|surname|familyname)$/.test(h));
          const limitCol = headers.findIndex(h => h.includes('limit') || h.includes('max') || h.includes('account'));

          if (addressCol >= 0) {
            addresses = lines.slice(1).map(line => {
              const cols = line.split(',').map(c => c.trim());
              return {
                address: cols[addressCol] || '',
                lastName: lastNameCol >= 0 ? cols[lastNameCol] : undefined,
                accountsLimit: limitCol >= 0 ? parseInt(cols[limitCol]) || undefined : undefined,
              };
            }).filter(a => a.address);
          } else {
            addresses = lines.slice(1).map(line => ({ address: line.trim() })).filter(a => a.address);
          }
        }
      } else {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (rows.length > 0) {
          const hdrs = Object.keys(rows[0]);
          const addressKey = hdrs.find(h => /^(street|address|street.?address|full.?address)$/i.test(h.trim())) || hdrs[0];
          const lastNameKey = hdrs.find(h => /^(last.?name|lastname|surname|family.?name)$/i.test(h.trim()));
          const limitKey = hdrs.find(h => /^(limit|max|accounts?.?limit)$/i.test(h.trim()));

          addresses = rows.map(row => ({
            address: String(row[addressKey] || '').trim(),
            lastName: lastNameKey ? String(row[lastNameKey] || '').trim() || undefined : undefined,
            accountsLimit: limitKey ? parseInt(row[limitKey]) || undefined : undefined,
          })).filter(a => a.address);
        }
      }

      if (addresses.length === 0) {
        toast.error('No addresses found in file');
        return;
      }

      const payload = addresses.map(a => ({
        address: a.address,
        lastName: a.lastName,
        accountsLimit: a.accountsLimit || accountsPerAddress,
      }));

      const response = await addressWhitelistApi.bulkAdd(currentFacilityId, payload);
      if (response.success) {
        toast.success(`Imported ${response.data?.added || addresses.length} addresses`);
        loadWhitelistAddresses();
      } else {
        toast.error(response.error || 'Failed to import addresses');
      }
    } catch (error) {
      console.error('Error importing whitelist file:', error);
      toast.error('Failed to read file. Check the format and try again.');
    } finally {
      setWhitelistUploading(false);
      if (whitelistFileRef.current) whitelistFileRef.current.value = '';
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
            <TabsList className="flex">
              <TabsTrigger value="members" className="px-4">Members</TabsTrigger>
              <TabsTrigger value="households" className="px-4">Households</TabsTrigger>
            </TabsList>

            <TabsContent value="members" className="space-y-6">
          <div className="flex justify-end gap-2 mb-4">
              <Button onClick={() => setShowAddressDialog(true)} variant="outline">
                <Home className="h-4 w-4 mr-2" />
                Address Whitelist
              </Button>
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

            <TabsContent value="households">
              <HouseholdManagement />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Address Whitelist Dialog */}
      <Dialog open={showAddressDialog} onOpenChange={setShowAddressDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Address Whitelist Management</DialogTitle>
            <DialogDescription>
              Manage approved addresses and last names for auto-approval of new members.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Account Limit Setting */}
            <div className="border-b pb-4">
              <Label htmlFor="accountLimit" className="text-sm font-medium">Default Accounts Per Address Limit</Label>
              <div className="flex items-center gap-4 mt-2">
                <Input
                  id="accountLimit"
                  type="number"
                  min="1"
                  max="20"
                  value={accountsPerAddress}
                  onChange={(e) => setAccountsPerAddress(parseInt(e.target.value) || 1)}
                  className="w-24"
                />
                <span className="text-sm text-gray-600">
                  Maximum accounts allowed per address + last name combo
                </span>
              </div>
            </div>

            {/* Add New Address */}
            <div>
              <Label className="text-sm font-medium">Add New Entry</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  placeholder="Enter full address..."
                  value={newAddress}
                  onChange={(e) => setNewAddress(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAddress();
                    }
                  }}
                  className="flex-1"
                />
                <Input
                  placeholder="Last name..."
                  value={newLastName}
                  onChange={(e) => setNewLastName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddAddress();
                    }
                  }}
                  className="w-40"
                />
                <Button onClick={handleAddAddress}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add
                </Button>
              </div>
            </div>

            {/* File Upload */}
            <div>
              <Label className="text-sm font-medium">Import from File</Label>
              <div className="flex items-center gap-2 mt-2">
                <input
                  ref={whitelistFileRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleWhitelistFileUpload}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => whitelistFileRef.current?.click()}
                  disabled={whitelistUploading}
                >
                  <Upload className="h-4 w-4 mr-1" />
                  {whitelistUploading ? 'Importing...' : 'Import from Excel/CSV'}
                </Button>
                <span className="text-xs text-gray-500">
                  File should have "Address" and "Last Name" columns. Optional "Limit" column.
                </span>
              </div>
            </div>

            {/* Address List */}
            <div>
              <Label className="text-sm font-medium">Whitelisted Entries ({whitelistAddresses.length})</Label>
              <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                {whitelistAddresses.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    No entries in whitelist. Add addresses to enable auto-approval.
                  </div>
                ) : (
                  whitelistAddresses.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Home className="h-4 w-4 text-gray-400 flex-shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-sm truncate">
                            {item.address}
                            {item.lastName && <span className="text-gray-500"> — {item.lastName}</span>}
                          </span>
                          <span className="text-xs text-gray-500">Limit: {item.accountsLimit} accounts</span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveAddress(item.id)}
                        className="text-red-600 hover:text-red-700 h-8 w-8 p-0 flex-shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Close Button */}
            <div className="flex justify-end pt-4 border-t">
              <Button variant="outline" onClick={() => setShowAddressDialog(false)}>
                Close
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
                    <div className="flex items-center gap-2">
                      {selectedMember.fullName}
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                        selectedMember.isFacilityAdmin
                          ? 'text-green-600 border-green-600'
                          : 'text-gray-500 border-gray-300'
                      }`}>
                        {selectedMember.isFacilityAdmin ? 'Admin' : 'Regular'}
                      </Badge>
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
    </>
  );
}
