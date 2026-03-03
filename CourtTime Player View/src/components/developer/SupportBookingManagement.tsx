import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Label } from '../ui/label';
import { getFacilities, getFacilityBookings, updateBookingStatus, getFacilityViolations } from '../../api/supportClient';
import { toast } from 'sonner';

interface Props {
  selectedFacilityId: string | null;
  onSelectFacility: (id: string) => void;
}

export function SupportBookingManagement({ selectedFacilityId, onSelectFacility }: Props) {
  const [facilities, setFacilities] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [violations, setViolations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    (async () => {
      const res = await getFacilities();
      if (res.success) setFacilities(res.data);
    })();
  }, []);

  const loadBookings = async () => {
    if (!selectedFacilityId) return;
    setLoading(true);
    const res = await getFacilityBookings(selectedFacilityId, {
      status: statusFilter !== 'all' ? statusFilter : undefined,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    if (res.success) setBookings(res.data);
    setLoading(false);
  };

  const loadViolations = async () => {
    if (!selectedFacilityId) return;
    const res = await getFacilityViolations(selectedFacilityId);
    if (res.success) setViolations(res.data);
  };

  useEffect(() => {
    loadBookings();
    loadViolations();
  }, [selectedFacilityId, statusFilter, startDate, endDate]);

  const handleCancel = async (bookingId: string) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    const res = await updateBookingStatus(bookingId, 'cancelled');
    if (res.success) { toast.success('Booking cancelled'); loadBookings(); }
    else toast.error(res.error || 'Failed to cancel');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'confirmed': return 'bg-green-100 text-green-700';
      case 'cancelled': return 'bg-red-100 text-red-700';
      case 'completed': return 'bg-blue-100 text-blue-700';
      case 'pending': return 'bg-yellow-100 text-yellow-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Booking Management</h1>

      {/* Facility selector */}
      <Select value={selectedFacilityId || ''} onValueChange={onSelectFacility}>
        <SelectTrigger className="w-full max-w-xs">
          <SelectValue placeholder="Select a facility..." />
        </SelectTrigger>
        <SelectContent>
          {facilities.map((f: any) => (
            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!selectedFacilityId && (
        <p className="text-sm text-gray-400 text-center py-10">Select a facility to view bookings.</p>
      )}

      {selectedFacilityId && (
        <Tabs defaultValue="bookings" className="space-y-4">
          <TabsList>
            <TabsTrigger value="bookings" className="px-4">Bookings</TabsTrigger>
            <TabsTrigger value="violations" className="px-4">
              Violations {violations.length > 0 && `(${violations.length})`}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bookings" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full sm:w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Label className="text-sm shrink-0">From</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-auto" />
              </div>
              <div className="flex items-center gap-2">
                <Label className="text-sm shrink-0">To</Label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-auto" />
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500">{bookings.length} booking{bookings.length !== 1 ? 's' : ''}</p>
                <div className="space-y-2">
                  {bookings.map((b: any) => (
                    <Card key={b.id}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm">{b.player_name}</p>
                              <Badge className={`text-xs ${getStatusColor(b.status)}`}>{b.status}</Badge>
                            </div>
                            <p className="text-xs text-gray-500 mt-0.5">
                              {new Date(b.booking_date).toLocaleDateString()} &middot; {b.start_time}–{b.end_time} &middot; {b.court_name}
                            </p>
                            <p className="text-xs text-gray-400">{b.player_email}</p>
                          </div>
                          {b.status === 'confirmed' && (
                            <Button variant="outline" size="sm" className="text-red-600 shrink-0" onClick={() => handleCancel(b.id)}>
                              Cancel
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {bookings.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-10">No bookings found.</p>
                  )}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="violations">
            {violations.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No violations recorded.</p>
            ) : (
              <div className="space-y-2">
                {violations.map((v: any, i: number) => (
                  <Card key={i}>
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{v.user_name}</p>
                          <p className="text-xs text-gray-500">{v.user_email}</p>
                        </div>
                        <div className="text-right">
                          <Badge variant="secondary" className="text-xs">{v.violation_type || v.type}</Badge>
                          <p className="text-xs text-gray-400 mt-0.5">{new Date(v.created_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
