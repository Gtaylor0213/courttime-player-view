import React, { useState, useEffect } from 'react';
import { Search, MoreVertical, Shield, ShieldOff, UserX, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { Label } from '../ui/label';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { getFacilities, getFacilityMembers, updateMember, toggleMemberAdmin } from '../../api/supportClient';
import { toast } from 'sonner';

interface Props {
  selectedFacilityId: string | null;
  onSelectFacility: (id: string) => void;
  onViewUser: (userId: string) => void;
}

export function SupportMemberManagement({ selectedFacilityId, onSelectFacility, onViewUser }: Props) {
  const [facilities, setFacilities] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [suspendDialog, setSuspendDialog] = useState<{ userId: string; name: string } | null>(null);
  const [suspendDuration, setSuspendDuration] = useState('7d');

  useEffect(() => {
    (async () => {
      const res = await getFacilities();
      if (res.success) setFacilities(res.data);
    })();
  }, []);

  const loadMembers = async () => {
    if (!selectedFacilityId) return;
    setLoading(true);
    const res = await getFacilityMembers(selectedFacilityId, search || undefined, statusFilter !== 'all' ? statusFilter : undefined);
    if (res.success) setMembers(res.data);
    setLoading(false);
  };

  useEffect(() => { loadMembers(); }, [selectedFacilityId, statusFilter]);

  useEffect(() => {
    if (!selectedFacilityId) return;
    const timer = setTimeout(loadMembers, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const handleSuspend = async () => {
    if (!suspendDialog || !selectedFacilityId) return;
    const days = suspendDuration === '7d' ? 7 : suspendDuration === '14d' ? 14 : suspendDuration === '30d' ? 30 : 90;
    const until = new Date(Date.now() + days * 86400000).toISOString();
    const res = await updateMember(selectedFacilityId, suspendDialog.userId, { status: 'suspended', suspendedUntil: until });
    if (res.success) {
      toast.success(`${suspendDialog.name} suspended for ${days} days`);
      setSuspendDialog(null);
      loadMembers();
    } else {
      toast.error(res.error || 'Failed to suspend');
    }
  };

  const handleReactivate = async (userId: string) => {
    if (!selectedFacilityId) return;
    const res = await updateMember(selectedFacilityId, userId, { status: 'active', suspendedUntil: null });
    if (res.success) { toast.success('Member reactivated'); loadMembers(); }
    else toast.error(res.error || 'Failed to reactivate');
  };

  const handleToggleAdmin = async (userId: string, currentlyAdmin: boolean) => {
    if (!selectedFacilityId) return;
    const res = await toggleMemberAdmin(selectedFacilityId, userId, !currentlyAdmin);
    if (res.success) { toast.success(currentlyAdmin ? 'Admin removed' : 'Admin granted'); loadMembers(); }
    else toast.error(res.error || 'Failed to toggle admin');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      case 'suspended': return 'bg-red-100 text-red-700';
      case 'expired': return 'bg-gray-100 text-gray-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Member Management</h1>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <Select value={selectedFacilityId || ''} onValueChange={onSelectFacility}>
          <SelectTrigger className="w-full sm:w-64">
            <SelectValue placeholder="Select a facility..." />
          </SelectTrigger>
          <SelectContent>
            {facilities.map((f: any) => (
              <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input placeholder="Search members..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
        </div>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-36">
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

      {!selectedFacilityId && (
        <p className="text-sm text-gray-400 text-center py-10">Select a facility to view members.</p>
      )}

      {loading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
        </div>
      )}

      {selectedFacilityId && !loading && (
        <>
          <p className="text-sm text-gray-500">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          <div className="space-y-2">
            {members.map((m: any) => (
              <Card key={m.membership_id}>
                <CardContent className="p-3 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0 text-sm font-medium text-gray-600">
                    {m.full_name?.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{m.full_name}</p>
                      {m.is_facility_admin && <Badge className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0">Admin</Badge>}
                    </div>
                    <p className="text-xs text-gray-500 truncate">{m.email}</p>
                  </div>
                  <Badge className={`text-xs ${getStatusColor(m.status)}`}>{m.status}</Badge>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 w-8 p-0 shrink-0">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onViewUser(m.user_id)}>
                        View Profile
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {m.status === 'active' && (
                        <DropdownMenuItem onClick={() => setSuspendDialog({ userId: m.user_id, name: m.full_name })} className="text-orange-600">
                          <XCircle className="h-4 w-4 mr-2" />
                          Suspend
                        </DropdownMenuItem>
                      )}
                      {(m.status === 'suspended' || m.status === 'pending') && (
                        <DropdownMenuItem onClick={() => handleReactivate(m.user_id)} className="text-green-600">
                          <CheckCircle className="h-4 w-4 mr-2" />
                          {m.status === 'pending' ? 'Approve' : 'Reactivate'}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem onClick={() => handleToggleAdmin(m.user_id, m.is_facility_admin)}>
                        {m.is_facility_admin ? <ShieldOff className="h-4 w-4 mr-2" /> : <Shield className="h-4 w-4 mr-2" />}
                        {m.is_facility_admin ? 'Remove Admin' : 'Make Admin'}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </CardContent>
              </Card>
            ))}
            {members.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-10">No members found.</p>
            )}
          </div>
        </>
      )}

      {/* Suspend Dialog */}
      <Dialog open={!!suspendDialog} onOpenChange={() => setSuspendDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend Member</DialogTitle>
            <DialogDescription>Suspend {suspendDialog?.name} from this facility.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Duration</Label>
              <Select value={suspendDuration} onValueChange={setSuspendDuration}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">7 days</SelectItem>
                  <SelectItem value="14d">14 days</SelectItem>
                  <SelectItem value="30d">30 days</SelectItem>
                  <SelectItem value="90d">90 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setSuspendDialog(null)}>Cancel</Button>
              <Button onClick={handleSuspend} variant="destructive">Suspend</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
