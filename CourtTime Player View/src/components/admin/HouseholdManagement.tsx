import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import {
  Search, Home, ChevronDown, ChevronUp, Users, RefreshCw
} from 'lucide-react';
import { addressWhitelistApi } from '../../api/client';
import { useAppContext } from '../../contexts/AppContext';
import { toast } from 'sonner';

interface WhitelistMember {
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  status: 'active' | 'pending' | 'suspended';
  membershipType: string;
}

interface WhitelistHousehold {
  id: string;
  address: string;
  lastName: string;
  accountsLimit: number;
  members: WhitelistMember[];
}

export function HouseholdManagement() {
  const [households, setHouseholds] = useState<WhitelistHousehold[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
      const response = await addressWhitelistApi.getWithMembers(currentFacilityId);
      if (response.success && response.data?.entries) {
        setHouseholds(Array.isArray(response.data.entries) ? response.data.entries : []);
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

  const filteredHouseholds = households.filter(h => {
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    return (
      h.address?.toLowerCase().includes(term) ||
      h.lastName?.toLowerCase().includes(term) ||
      h.members.some(m =>
        m.fullName?.toLowerCase().includes(term) ||
        m.email?.toLowerCase().includes(term)
      )
    );
  });

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active': return <Badge className="bg-green-100 text-green-800 text-[10px] px-1.5 py-0">Active</Badge>;
      case 'pending': return <Badge className="bg-yellow-100 text-yellow-800 text-[10px] px-1.5 py-0">Pending</Badge>;
      case 'suspended': return <Badge className="bg-red-100 text-red-800 text-[10px] px-1.5 py-0">Suspended</Badge>;
      default: return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status}</Badge>;
    }
  };

  const totalMembers = households.reduce((sum, h) => sum + h.members.length, 0);

  if (!currentFacilityId) {
    return (
      <div className="flex items-center justify-center h-64">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Facility Selected</CardTitle>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-medium text-gray-900">Households</h1>
            <p className="text-sm text-gray-500 mt-1">
              {households.length} whitelist {households.length === 1 ? 'entry' : 'entries'} · {totalMembers} matched {totalMembers === 1 ? 'account' : 'accounts'}
            </p>
          </div>
          <Button onClick={loadHouseholds} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Search */}
        <div className="relative max-w-md mb-6">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by address, last name, or member..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Household List */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">
              All Households ({filteredHouseholds.length})
            </CardTitle>
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
                    ? 'Households are created from your address whitelist. Add addresses in the Court Management tab.'
                    : 'No households match your search.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredHouseholds.map((household) => {
                  const isExpanded = expandedId === household.id;
                  const memberCount = household.members.length;
                  const atLimit = memberCount >= household.accountsLimit;

                  return (
                    <div key={household.id} className="border rounded-lg overflow-hidden">
                      {/* Household Row */}
                      <div
                        className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : household.id)}
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="flex-shrink-0 h-9 w-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center">
                            <Home className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-sm truncate">
                                {household.address}
                              </span>
                              {household.lastName && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {household.lastName}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Limit: {household.accountsLimit} accounts
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 ml-2">
                            <Users className="h-3.5 w-3.5 text-gray-400" />
                            <span className={`text-sm font-medium ${atLimit ? 'text-red-600' : 'text-gray-700'}`}>
                              {memberCount}/{household.accountsLimit}
                            </span>
                          </div>
                        </div>
                        <div className="ml-3">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                      </div>

                      {/* Expanded Members */}
                      {isExpanded && (
                        <div className="border-t bg-gray-50 px-4 py-3">
                          {memberCount === 0 ? (
                            <div className="text-center py-4">
                              <p className="text-sm text-gray-500">No member accounts match this address and last name yet.</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-gray-500 mb-2">
                                Matched Accounts ({memberCount})
                              </div>
                              {household.members.map((member) => {
                                const displayName = member.fullName ||
                                  [member.firstName, member.lastName].filter(Boolean).join(' ') ||
                                  member.email || 'Unknown';
                                return (
                                  <div
                                    key={member.userId}
                                    className="flex items-center justify-between p-2 bg-white rounded-lg border"
                                  >
                                    <div className="flex items-center gap-3">
                                      <Avatar className="h-7 w-7">
                                        <AvatarFallback className="text-[10px]">
                                          {getInitials(displayName)}
                                        </AvatarFallback>
                                      </Avatar>
                                      <div>
                                        <span className="text-sm font-medium">{displayName}</span>
                                        <div className="text-xs text-gray-500">{member.email}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {getStatusBadge(member.status)}
                                      {member.membershipType && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                                          {member.membershipType}
                                        </Badge>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
