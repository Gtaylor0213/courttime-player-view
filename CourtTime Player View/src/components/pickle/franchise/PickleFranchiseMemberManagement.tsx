import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '../../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Badge } from '../../ui/badge';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '../../ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '../../ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../ui/select';
import { CreditCard, RefreshCw, UserPlus, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { pickleApi, unwrapApiPayload } from '../../../api/client';
import { useAuth } from '../../../contexts/AuthContext';

interface FacilityMemberRow {
  userId: string;
  email: string;
  fullName: string;
  membershipStatus: string;
  membershipType: string;
  tierLabel: string;
  productName: string | null;
  subscriptionStatus: string | null;
  subscriptionId: string | null;
}

interface MembershipProduct {
  id: string;
  name: string;
  tier: string;
  priceCents: number;
}

const TIER_COLORS: Record<string, string> = {
  non_member: 'bg-gray-100 text-gray-700',
  trial: 'bg-amber-100 text-amber-800',
  play: 'bg-blue-100 text-blue-800',
  unlimited: 'bg-green-100 text-green-800',
  pro: 'bg-purple-100 text-purple-800',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  suspended: 'bg-orange-100 text-orange-800',
  expired: 'bg-gray-100 text-gray-700',
};

function formatTierLabel(tier: string, productName: string | null): string {
  if (tier === 'non_member') return 'Non-member';
  if (productName) return productName;
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function formatPrice(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function PickleFranchiseMemberManagement() {
  const { facilityId } = useParams<{ facilityId: string }>();
  const { user } = useAuth();
  const [members, setMembers] = useState<FacilityMemberRow[]>([]);
  const [products, setProducts] = useState<MembershipProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellTarget, setSellTarget] = useState<FacilityMemberRow | null>(null);
  const [sellProductId, setSellProductId] = useState('');
  const [selling, setSelling] = useState(false);

  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addFullName, setAddFullName] = useState('');
  const [addProductId, setAddProductId] = useState('');
  const [adding, setAdding] = useState(false);

  const [cancelingUserId, setCancelingUserId] = useState<string | null>(null);

  const isFacilityAdmin = Boolean(facilityId && user?.adminFacilities?.includes(facilityId));

  useEffect(() => {
    if (!facilityId || !isFacilityAdmin) {
      setLoading(false);
      return;
    }
    loadMembers();
  }, [facilityId, isFacilityAdmin]);

  const loadMembers = async () => {
    if (!facilityId) return;
    setLoading(true);
    try {
      const res = await pickleApi.listFacilityMembersWithTiers(facilityId);
      if (res.success && res.data) {
        const payload = unwrapApiPayload<{ members: FacilityMemberRow[]; products: MembershipProduct[] }>(res.data);
        if (payload?.members) setMembers(payload.members);
        if (payload?.products) setProducts(payload.products);
      } else {
        toast.error(res.error || 'Failed to load members');
      }
    } catch {
      toast.error('Failed to load members');
    } finally {
      setLoading(false);
    }
  };

  const filteredMembers = members.filter((member) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      member.fullName.toLowerCase().includes(q)
      || member.email.toLowerCase().includes(q)
      || member.tierLabel.toLowerCase().includes(q)
    );
  });

  const openSellModal = (member: FacilityMemberRow) => {
    setSellTarget(member);
    setSellProductId(products[0]?.id ?? '');
    setSellModalOpen(true);
  };

  const handleSellMembership = async () => {
    if (!facilityId || !sellTarget || !sellProductId) return;
    setSelling(true);
    try {
      const res = await pickleApi.assignFacilityMembership(facilityId, {
        userId: sellTarget.userId,
        productId: sellProductId,
      });
      if (res.success) {
        toast.success(`Membership assigned to ${sellTarget.fullName}`);
        setSellModalOpen(false);
        setSellTarget(null);
        await loadMembers();
      } else {
        toast.error(res.error || 'Failed to assign membership');
      }
    } catch {
      toast.error('Failed to assign membership');
    } finally {
      setSelling(false);
    }
  };

  const handleCancelMembership = async (member: FacilityMemberRow) => {
    if (!facilityId) return;
    if (member.tierLabel === 'non_member') {
      toast.error('This member has no active membership');
      return;
    }
    setCancelingUserId(member.userId);
    try {
      const res = await pickleApi.cancelFacilityMembership(facilityId, { userId: member.userId });
      if (res.success) {
        toast.success(`Membership canceled for ${member.fullName}`);
        await loadMembers();
      } else {
        toast.error(res.error || 'Failed to cancel membership');
      }
    } catch {
      toast.error('Failed to cancel membership');
    } finally {
      setCancelingUserId(null);
    }
  };

  const handleAddMember = async () => {
    if (!facilityId) return;
    if (!addEmail.trim() || !addFullName.trim()) {
      toast.error('Email and name are required');
      return;
    }
    setAdding(true);
    try {
      const res = await pickleApi.addFacilityMember(facilityId, {
        email: addEmail.trim(),
        fullName: addFullName.trim(),
        productId: addProductId || undefined,
      });
      if (res.success) {
        toast.success('Member added');
        setAddModalOpen(false);
        setAddEmail('');
        setAddFullName('');
        setAddProductId('');
        await loadMembers();
      } else {
        toast.error(res.error || 'Failed to add member');
      }
    } catch {
      toast.error('Failed to add member');
    } finally {
      setAdding(false);
    }
  };

  if (!isFacilityAdmin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500">
          Facility admin access is required to manage members.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Members</h2>
          <p className="text-sm text-gray-500">
            Manage location members and sell CourtTime-Pickle memberships
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadMembers} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button className="bg-green-700 hover:bg-green-800" onClick={() => setAddModalOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Member
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Member roster</CardTitle>
          <CardDescription>
            Tier reflects org subscription; non-member means no active subscription
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Search by name, email, or tier…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />

          {loading ? (
            <p className="text-sm text-gray-500 py-8 text-center">Loading members…</p>
          ) : filteredMembers.length === 0 ? (
            <p className="text-sm text-gray-500 py-8 text-center">No members found.</p>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredMembers.map((member) => (
                    <TableRow key={member.userId}>
                      <TableCell className="font-medium">{member.fullName}</TableCell>
                      <TableCell>{member.email}</TableCell>
                      <TableCell>
                        <Badge className={TIER_COLORS[member.tierLabel] ?? TIER_COLORS.non_member}>
                          {formatTierLabel(member.tierLabel, member.productName)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={STATUS_COLORS[member.membershipStatus] ?? STATUS_COLORS.active}>
                          {member.membershipStatus}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => openSellModal(member)}
                            disabled={products.length === 0}
                          >
                            <CreditCard className="h-3.5 w-3.5 mr-1" />
                            Sell
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => handleCancelMembership(member)}
                            disabled={
                              member.tierLabel === 'non_member'
                              || cancelingUserId === member.userId
                            }
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" />
                            Cancel
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={sellModalOpen} onOpenChange={setSellModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sell membership</DialogTitle>
            <DialogDescription>
              Assign a membership product to {sellTarget?.fullName ?? 'member'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="sell-product">Membership product</Label>
            <Select value={sellProductId} onValueChange={setSellProductId}>
              <SelectTrigger id="sell-product">
                <SelectValue placeholder="Select product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id}>
                    {product.name} — {formatPrice(product.priceCents)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSellModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-green-700 hover:bg-green-800"
              onClick={handleSellMembership}
              disabled={selling || !sellProductId}
            >
              {selling ? 'Assigning…' : 'Assign membership'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member</DialogTitle>
            <DialogDescription>
              Create or link a player account and optionally sell a membership
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="add-email">Email</Label>
              <Input
                id="add-email"
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="player@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-name">Full name</Label>
              <Input
                id="add-name"
                value={addFullName}
                onChange={(e) => setAddFullName(e.target.value)}
                placeholder="Jane Player"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-product">Membership (optional)</Label>
              <Select value={addProductId || '__none__'} onValueChange={(v) => setAddProductId(v === '__none__' ? '' : v)}>
                <SelectTrigger id="add-product">
                  <SelectValue placeholder="No membership" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No membership</SelectItem>
                  {products.map((product) => (
                    <SelectItem key={product.id} value={product.id}>
                      {product.name} — {formatPrice(product.priceCents)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-green-700 hover:bg-green-800"
              onClick={handleAddMember}
              disabled={adding}
            >
              {adding ? 'Adding…' : 'Add member'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
