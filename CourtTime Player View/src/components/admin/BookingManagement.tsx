import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Calendar, Search, X, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { useAuth } from '../../contexts/AuthContext';
import { useAppContext } from '../../contexts/AppContext';
import { adminApi, facilitiesApi } from '../../api/client';
import { toast } from 'sonner';

type SortField = 'bookingDate' | 'userName' | 'courtName' | 'status' | 'startTime';
type SortDirection = 'asc' | 'desc';

interface Booking {
  id: string;
  courtName: string;
  courtNumber: number;
  userName: string;
  userEmail: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed';
  bookingType: string;
  notes?: string;
}

export function BookingManagement() {
  const { user } = useAuth();
  const { selectedFacilityId: currentFacilityId } = useAppContext();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterCourt, setFilterCourt] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [courts, setCourts] = useState<Array<{ id: string; name: string; courtNumber: number }>>([]);
  const [loading, setLoading] = useState(true);

  // Sorting and pagination state
  const [sortField, setSortField] = useState<SortField>('bookingDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(15);

  useEffect(() => {
    if (currentFacilityId) {
      // Set default date range (current week)
      const today = new Date();
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAhead = new Date(today);
      weekAhead.setDate(weekAhead.getDate() + 7);

      // Use local date components to avoid timezone issues
      const formatLocalDate = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };

      setStartDate(formatLocalDate(weekAgo));
      setEndDate(formatLocalDate(weekAhead));

      // Load courts for the facility
      loadCourts();
    }
  }, [currentFacilityId]);

  const loadCourts = async () => {
    if (!currentFacilityId) return;

    try {
      const response = await facilitiesApi.getCourts(currentFacilityId);
      if (response.success && response.data?.courts) {
        setCourts(response.data.courts);
      }
    } catch (error) {
      console.error('Error loading courts:', error);
    }
  };

  useEffect(() => {
    if (currentFacilityId && startDate && endDate) {
      loadBookings();
    }
  }, [currentFacilityId, startDate, endDate, filterStatus, filterCourt]);

  const loadBookings = async () => {
    if (!currentFacilityId) {
      toast.error('No facility selected');
      return;
    }

    try {
      setLoading(true);
      const filters = {
        status: filterStatus,
        startDate,
        endDate,
        courtId: filterCourt,
      };

      const response = await adminApi.getBookings(currentFacilityId, filters);
      console.log('Bookings API response:', JSON.stringify(response, null, 2));

      if (response.success) {
        // Handle different response structures
        let bookingsData: Booking[] = [];

        if (response.data?.data?.bookings) {
          bookingsData = response.data.data.bookings;
        } else if (response.data?.bookings) {
          bookingsData = response.data.bookings;
        } else if (Array.isArray(response.data)) {
          bookingsData = response.data;
        }

        console.log(`Loaded ${bookingsData.length} bookings`);
        setBookings(bookingsData);
      } else {
        console.error('Failed to load bookings:', response.error);
        toast.error(response.error || 'Failed to load bookings');
      }
    } catch (error: any) {
      console.error('Error loading bookings:', error);
      toast.error('Failed to load bookings');
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBooking = async (id: string) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;

    try {
      const response = await adminApi.updateBookingStatus(id, 'cancelled');
      if (response.success) {
        toast.success('Booking cancelled successfully');
        await loadBookings();
      } else {
        toast.error(response.error || 'Failed to cancel booking');
      }
    } catch (error: any) {
      console.error('Error cancelling booking:', error);
      toast.error('Failed to cancel booking');
    }
  };

  const handleCompleteBooking = async (id: string) => {
    try {
      const response = await adminApi.updateBookingStatus(id, 'completed');
      if (response.success) {
        toast.success('Booking marked as completed');
        await loadBookings();
      } else {
        toast.error(response.error || 'Failed to update booking');
      }
    } catch (error: any) {
      console.error('Error updating booking:', error);
      toast.error('Failed to update booking');
    }
  };

  // Filter, sort, and paginate bookings
  const filteredBookings = useMemo(() => {
    let result = bookings.filter((booking: Booking) => {
      // If no search term, show all bookings
      if (!searchTerm.trim()) return true;

      const searchLower = searchTerm.toLowerCase().trim();
      return (
        (booking.userName?.toLowerCase() || '').includes(searchLower) ||
        (booking.courtName?.toLowerCase() || '').includes(searchLower) ||
        (booking.userEmail?.toLowerCase() || '').includes(searchLower) ||
        (booking.bookingType?.toLowerCase() || '').includes(searchLower) ||
        (booking.notes?.toLowerCase() || '').includes(searchLower)
      );
    });

    // Sort
    result.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortField) {
        case 'bookingDate':
          aVal = `${a.bookingDate} ${a.startTime}`;
          bVal = `${b.bookingDate} ${b.startTime}`;
          break;
        case 'userName':
          aVal = a.userName?.toLowerCase() || '';
          bVal = b.userName?.toLowerCase() || '';
          break;
        case 'courtName':
          aVal = a.courtName?.toLowerCase() || '';
          bVal = b.courtName?.toLowerCase() || '';
          break;
        case 'status':
          aVal = a.status;
          bVal = b.status;
          break;
        case 'startTime':
          aVal = a.startTime;
          bVal = b.startTime;
          break;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [bookings, searchTerm, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(filteredBookings.length / itemsPerPage);
  const paginatedBookings = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredBookings.slice(start, start + itemsPerPage);
  }, [filteredBookings, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterStatus, filterCourt, startDate, endDate]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <ChevronsUpDown className="h-4 w-4 ml-1 opacity-50" />;
    return sortDirection === 'asc'
      ? <ChevronUp className="h-4 w-4 ml-1" />
      : <ChevronDown className="h-4 w-4 ml-1" />;
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'confirmed': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      case 'completed': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  const formatDateShort = (dateString: string) => {
    // Handle both ISO timestamp (2025-12-08T05:00:00.000Z) and date-only (2025-12-08) formats
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return 'Invalid date';
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatTime = (timeStr: string) => {
    const [hours, minutes] = timeStr.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-medium text-gray-900">Booking Management</h1>
            <Button onClick={() => navigate('/admin/booking')}>
              <Calendar className="h-4 w-4 mr-2" />
              Create New Booking
            </Button>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Filter Bookings</CardTitle>
              <CardDescription>Search and filter bookings by member, court, date, or status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="search">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      id="search"
                      placeholder="Name, email, court, type, notes..."
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
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filterCourt">Court</Label>
                  <Select value={filterCourt} onValueChange={setFilterCourt}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Courts</SelectItem>
                      {courts.map((court) => (
                        <SelectItem key={court.id} value={court.id}>
                          {court.name} (Court #{court.courtNumber})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Bookings Table */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">
                  Bookings ({filteredBookings.length})
                </CardTitle>
                <div className="flex items-center gap-2">
                  <Label className="text-sm text-gray-500">Show:</Label>
                  <Select value={itemsPerPage.toString()} onValueChange={(v) => setItemsPerPage(Number(v))}>
                    <SelectTrigger className="w-20 h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="15">15</SelectItem>
                      <SelectItem value="25">25</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-y">
                    <tr>
                      <th
                        className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('bookingDate')}
                      >
                        <div className="flex items-center">
                          Date/Time
                          <SortIcon field="bookingDate" />
                        </div>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('userName')}
                      >
                        <div className="flex items-center">
                          Member
                          <SortIcon field="userName" />
                        </div>
                      </th>
                      <th
                        className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('courtName')}
                      >
                        <div className="flex items-center">
                          Court
                          <SortIcon field="courtName" />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-left font-medium text-gray-600">Type</th>
                      <th
                        className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('status')}
                      >
                        <div className="flex items-center">
                          Status
                          <SortIcon field="status" />
                        </div>
                      </th>
                      <th className="px-4 py-3 text-right font-medium text-gray-600">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {paginatedBookings.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                          No bookings found matching your filters.
                        </td>
                      </tr>
                    ) : (
                      paginatedBookings.map((booking: Booking) => (
                        <tr key={booking.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2">
                            <div className="font-medium">{formatDateShort(booking.bookingDate)}</div>
                            <div className="text-xs text-gray-500">
                              {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <div className="font-medium truncate max-w-[150px]" title={booking.userName}>
                              {booking.userName}
                            </div>
                            <div className="text-xs text-gray-500 truncate max-w-[150px]" title={booking.userEmail}>
                              {booking.userEmail}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <span className="font-medium">{booking.courtName}</span>
                            <span className="text-gray-400 text-xs ml-1">#{booking.courtNumber}</span>
                          </td>
                          <td className="px-4 py-2 capitalize">{booking.bookingType}</td>
                          <td className="px-4 py-2">
                            <Badge className={`${getStatusColor(booking.status)} text-xs`}>
                              {formatStatus(booking.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex justify-end gap-1">
                              {booking.status === 'confirmed' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCompleteBooking(booking.id)}
                                  className="h-7 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                >
                                  Complete
                                </Button>
                              )}
                              {booking.status !== 'cancelled' && booking.status !== 'completed' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleCancelBooking(booking.id)}
                                  className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
                  <div className="text-sm text-gray-500">
                    Showing {((currentPage - 1) * itemsPerPage) + 1} - {Math.min(currentPage * itemsPerPage, filteredBookings.length)} of {filteredBookings.length}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="h-8 px-2"
                    >
                      <ChevronLeft className="h-4 w-4" />
                      <ChevronLeft className="h-4 w-4 -ml-2" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="h-8 px-2"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="px-3 text-sm">
                      Page {currentPage} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="h-8 px-2"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="h-8 px-2"
                    >
                      <ChevronRight className="h-4 w-4" />
                      <ChevronRight className="h-4 w-4 -ml-2" />
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
  );
}
