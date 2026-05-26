import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Avatar, AvatarFallback } from '../ui/avatar';
import {
  Search, Home, ChevronDown, ChevronUp, Users, RefreshCw
} from 'lucide-react';
import { membersApi } from '../../api/client';
import { useAppContext } from '../../contexts/AppContext';
import { toast } from 'sonner';

interface HouseholdMember {
  userId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  status?: 'active' | 'pending' | 'expired' | 'suspended';
  membershipType?: string;
  isFacilityAdmin?: boolean;
}

interface HouseholdRecord {
  id: string;
  address: string;
  lastNames: string[];
  members: HouseholdMember[];
  /** One member per row — missing address or last name for address-based grouping */
  isUngrouped?: boolean;
}

export function HouseholdManagement() {
  const [households, setHouseholds] = useState<HouseholdRecord[]>([]);
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
      const response = await membersApi.getFacilityMembers(currentFacilityId);
      if (response.success && Array.isArray(response.data?.members)) {
        const groupedHouseholds = new Map<string, HouseholdRecord>();
        for (const member of response.data.members as any[]) {
          const address = (member.streetAddress || '').trim();
          const fullName = (member.fullName || '').trim();
          const parsedLastName = fullName.split(' ').slice(1).join(' ').trim();
          const canGroupByAddress = Boolean(address);

          let householdKey: string;
          let recordAddress: string;
          let isUngrouped: boolean;

          if (canGroupByAddress) {
            householdKey = address.toLowerCase();
            recordAddress = address;
            isUngrouped = false;
          } else {
            householdKey = `__ungrouped:${member.userId}`;
            recordAddress = address || 'No address on file';
            isUngrouped = true;
          }

          if (!groupedHouseholds.has(householdKey)) {
            groupedHouseholds.set(householdKey, {
              id: householdKey,
              address: recordAddress,
              lastNames: [],
              members: [],
              isUngrouped,
            });
          }

          const household = groupedHouseholds.get(householdKey);
          if (parsedLastName && household && !household.lastNames.includes(parsedLastName)) {
            household.lastNames.push(parsedLastName);
          }

          household?.members.push({
            userId: member.userId,
            firstName: fullName.split(' ')[0] || '',
            lastName: parsedLastName,
            fullName: member.fullName || '',
            email: member.email || '',
            status: member.status,
            membershipType: member.membershipType,
            isFacilityAdmin: Boolean(member.isFacilityAdmin),
          });
        }

        const householdsList = Array.from(groupedHouseholds.values()).sort((a, b) => {
          if (a.isUngrouped !== b.isUngrouped) {
            return a.isUngrouped ? 1 : -1;
          }
          if (a.isUngrouped && b.isUngrouped) {
            const na = a.members[0]?.fullName || a.members[0]?.email || '';
            const nb = b.members[0]?.fullName || b.members[0]?.email || '';
            return na.localeCompare(nb);
          }
          const addr = a.address.localeCompare(b.address);
          if (addr !== 0) return addr;
          return (a.lastNames[0] || '').localeCompare(b.lastNames[0] || '');
        });
        setHouseholds(householdsList);
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
      h.lastNames.some(lastName => lastName.toLowerCase().includes(term)) ||
      h.members.some(m =>
        m.fullName?.toLowerCase().includes(term) ||
        m.email?.toLowerCase().includes(term)
      )
    );
  });

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
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
              {households.length} household {households.length === 1 ? 'record' : 'records'} · {totalMembers} registered {totalMembers === 1 ? 'member' : 'members'}
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
            placeholder="Search by address, last name, or household member..."
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
                    ? 'No household records have been created for this facility yet.'
                    : 'No households match your search.'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredHouseholds.map((household) => {
                  const isExpanded = expandedId === household.id;
                  const memberCount = household.members.length;

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
                              {household.lastNames.length > 0 && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {household.lastNames.slice(0, 2).join(', ')}
                                  {household.lastNames.length > 2 ? ` +${household.lastNames.length - 2}` : ''}
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              {household.isUngrouped
                                ? 'Add street address to include in address-based households'
                                : 'All accounts at this address'}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 ml-2">
                            <Users className="h-3.5 w-3.5 text-gray-400" />
                            <span className="text-sm font-medium text-gray-700">
                              {memberCount}
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
                              <p className="text-sm text-gray-500">No registered members found for this household yet.</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <div className="text-xs font-medium text-gray-500 mb-2">
                                Registered Individuals ({memberCount})
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
                                      {member.isFacilityAdmin && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 text-green-700 border-green-600">
                                          Admin
                                        </Badge>
                                      )}
                                      {member.status && (
                                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 capitalize">
                                          {member.status}
                                        </Badge>
                                      )}
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
