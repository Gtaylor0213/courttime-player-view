import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Calendar, Search, X, ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import { useAuth } from '../../contexts/AuthContext';
import { useAppContext } from '../../contexts/AppContext';
import { adminApi, facilitiesApi } from '../../api/client';
import { toast } from 'sonner';
import { AdminBooking } from './AdminBooking';
import { parseLocalDate } from '../../utils/dateUtils';

type SortField = 'bookingDate' | 'userName' | 'courtName' | 'status' | 'startTime';
type SortDirection = 'asc' | 'desc';

interface Booking {
  id: string;
  seriesId?: string | null;
  courtName: string;
  courtNumber: number;
  userName: string;
  userEmail: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed';
  bookingType: string;
  notes?: string;
}

interface BookingSeriesGroup {
  groupId: string;
  seriesId?: string | null;
  userName: string;
  userEmail: string;
  bookingType?: string;
  notes?: string;
  status: string;
  bookings: Booking[];
}

type SeriesEditMode = 'all' | 'selected';

export function BookingManagement() {
  const { user } = useAuth();
  const { selectedFacilityId: currentFacilityId } = useAppContext();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('bookings');
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
  const [expandedSeries, setExpandedSeries] = useState<Record<string, boolean>>({});
  const [selectedSeriesDates, setSelectedSeriesDates] = useState<Record<string, string[]>>({});
  const [seriesEditOpen, setSeriesEditOpen] = useState(false);
  const [seriesEditMode, setSeriesEditMode] = useState<SeriesEditMode>('all');
  const [seriesEditSeriesId, setSeriesEditSeriesId] = useState<string | null>(null);
  const [seriesEditBookingIds, setSeriesEditBookingIds] = useState<string[]>([]);
  const [seriesEditStartTime, setSeriesEditStartTime] = useState('');
  const [seriesEditEndTime, setSeriesEditEndTime] = useState('');
  const [seriesEditDurationMinutes, setSeriesEditDurationMinutes] = useState('60');
  const [seriesEditBookingType, setSeriesEditBookingType] = useState('');
  const [seriesEditNotes, setSeriesEditNotes] = useState('');
  const [seriesEditSubmitting, setSeriesEditSubmitting] = useState(false);

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
  const groupedBookings = useMemo<BookingSeriesGroup[]>(() => {
    const groups = new Map<string, BookingSeriesGroup>();
    for (const booking of bookings) {
      const key = booking.seriesId || booking.id;
      const existing = groups.get(key);
      if (existing) {
        existing.bookings.push(booking);
      } else {
        groups.set(key, {
          groupId: key,
          seriesId: booking.seriesId || null,
          userName: booking.userName,
          userEmail: booking.userEmail,
          bookingType: booking.bookingType,
          notes: booking.notes,
          status: booking.status,
          bookings: [booking]
        });
      }
    }
    return Array.from(groups.values()).map((group) => ({
      ...group,
      bookings: [...group.bookings].sort((a, b) => `${a.bookingDate} ${a.startTime}`.localeCompare(`${b.bookingDate} ${b.startTime}`))
    }));
  }, [bookings]);

  const filteredBookings = useMemo(() => {
    let result = groupedBookings.filter((group) => {
      // If no search term, show all bookings
      if (!searchTerm.trim()) return true;

      const searchLower = searchTerm.toLowerCase().trim();
      return (
        (group.userName?.toLowerCase() || '').includes(searchLower) ||
        (group.userEmail?.toLowerCase() || '').includes(searchLower) ||
        (group.bookingType?.toLowerCase() || '').includes(searchLower) ||
        (group.notes?.toLowerCase() || '').includes(searchLower) ||
        group.bookings.some((booking) => (booking.courtName?.toLowerCase() || '').includes(searchLower))
      );
    });

    // Sort
    result.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortField) {
        case 'bookingDate':
          aVal = `${a.bookings[0]?.bookingDate || ''} ${a.bookings[0]?.startTime || ''}`;
          bVal = `${b.bookings[0]?.bookingDate || ''} ${b.bookings[0]?.startTime || ''}`;
          break;
        case 'userName':
          aVal = a.userName.toLowerCase() || '';
          bVal = b.userName.toLowerCase() || '';
          break;
        case 'courtName':
          aVal = a.bookings[0]?.courtName?.toLowerCase() || '';
          bVal = b.bookings[0]?.courtName?.toLowerCase() || '';
          break;
        case 'status':
          aVal = a.status || '';
          bVal = b.status || '';
          break;
        case 'startTime':
          aVal = a.bookings[0]?.startTime || '';
          bVal = b.bookings[0]?.startTime || '';
          break;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [groupedBookings, searchTerm, sortField, sortDirection]);

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
    const date = parseLocalDate(dateString);
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

  const toggleSeriesExpanded = (groupId: string) => {
    setExpandedSeries((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const toggleSeriesDateSelection = (seriesId: string, bookingId: string) => {
    setSelectedSeriesDates((prev) => {
      const existing = prev[seriesId] || [];
      const next = existing.includes(bookingId)
        ? existing.filter((id) => id !== bookingId)
        : [...existing, bookingId];
      return { ...prev, [seriesId]: next };
    });
  };

  const setSeriesSelection = (seriesId: string, bookingIds: string[]) => {
    setSelectedSeriesDates((prev) => ({ ...prev, [seriesId]: bookingIds }));
  };

  const toggleSeriesSelectAll = (seriesId: string, groupBookings: Booking[]) => {
    const allIds = groupBookings.map((booking) => booking.id);
    const existing = selectedSeriesDates[seriesId] || [];
    const hasAll = allIds.length > 0 && allIds.every((id) => existing.includes(id));
    setSeriesSelection(seriesId, hasAll ? [] : allIds);
  };

  const openSeriesEditDialog = (
    mode: SeriesEditMode,
    seriesId: string,
    seed: Booking,
    bookingIds: string[] = []
  ) => {
    setSeriesEditMode(mode);
    setSeriesEditSeriesId(seriesId);
    setSeriesEditBookingIds(bookingIds);
    setSeriesEditStartTime(seed.startTime || '');
    setSeriesEditEndTime(seed.endTime || '');
    setSeriesEditDurationMinutes(String(seed.durationMinutes || 60));
    setSeriesEditBookingType(seed.bookingType || '');
    setSeriesEditNotes(seed.notes || '');
    setSeriesEditOpen(true);
  };

  const handleDeleteSeries = async (seriesId: string) => {
    if (!confirm('Delete all bookings in this recurring series?')) return;
    const response = await adminApi.deleteBookingSeries(seriesId);
    if (response.success) {
      toast.success('Recurring series deleted');
      await loadBookings();
    } else {
      toast.error(response.error || 'Failed to delete recurring series');
    }
  };

  const handleEditSeriesAll = async (seriesId: string, seed: Booking) => {
    openSeriesEditDialog('all', seriesId, seed);
  };

  const handleDeleteSeriesSelected = async (seriesId: string) => {
    const bookingIds = selectedSeriesDates[seriesId] || [];
    if (bookingIds.length === 0) {
      toast.error('Select at least one date first');
      return;
    }
    if (!confirm(`Delete ${bookingIds.length} selected date(s)?`)) return;
    const response = await adminApi.deleteBookingSeriesInstances(seriesId, bookingIds);
    if (response.success) {
      toast.success('Selected dates deleted');
      setSelectedSeriesDates((prev) => ({ ...prev, [seriesId]: [] }));
      await loadBookings();
    } else {
      toast.error(response.error || 'Failed to delete selected dates');
    }
  };

  const handleEditSeriesSelected = async (seriesId: string, seed: Booking) => {
    const bookingIds = selectedSeriesDates[seriesId] || [];
    if (bookingIds.length === 0) {
      toast.error('Select at least one date first');
      return;
    }
    openSeriesEditDialog('selected', seriesId, seed, bookingIds);
  };

  const handleSubmitSeriesEdit = async () => {
    if (!seriesEditSeriesId) return;
    const parsedDuration = Number(seriesEditDurationMinutes);
    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      toast.error('Duration must be a positive number');
      return;
    }

    setSeriesEditSubmitting(true);
    try {
      const payload = {
        startTime: seriesEditStartTime,
        endTime: seriesEditEndTime,
        durationMinutes: parsedDuration,
        bookingType: seriesEditBookingType.trim() || undefined,
        notes: seriesEditNotes.trim() || undefined
      };

      const response = seriesEditMode === 'all'
        ? await adminApi.updateBookingSeries(seriesEditSeriesId, payload)
        : await adminApi.updateBookingSeriesInstances(seriesEditSeriesId, {
            bookingIds: seriesEditBookingIds,
            ...payload
          });

      if (!response.success) {
        toast.error(response.error || 'Failed to update recurring booking');
        return;
      }

      toast.success(seriesEditMode === 'all' ? 'Recurring series updated' : 'Selected dates updated');
      if (seriesEditMode === 'selected') {
        setSeriesSelection(seriesEditSeriesId, []);
      }
      setSeriesEditOpen(false);
      await loadBookings();
    } finally {
      setSeriesEditSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <>
      <div className="p-4 md:p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-medium text-gray-900">Booking Management</h1>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="flex">
              <TabsTrigger value="bookings" className="px-4">Bookings</TabsTrigger>
              <TabsTrigger value="admin-booking" className="px-4">Create Booking</TabsTrigger>
            </TabsList>

            <TabsContent value="bookings" className="space-y-6">

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
              <div className="relative">
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
                      paginatedBookings.map((group: BookingSeriesGroup) => {
                        const head = group.bookings[0];
                        const isSeries = !!group.seriesId;
                        const isExpanded = expandedSeries[group.groupId];
                        const selectedCount = isSeries ? (selectedSeriesDates[group.seriesId!] || []).length : 0;
                        const allSelected = isSeries
                          ? group.bookings.length > 0 && selectedCount === group.bookings.length
                          : false;
                        return (
                          <React.Fragment key={group.groupId}>
                            <tr className={`hover:bg-gray-50 ${isSeries ? 'bg-emerald-50/40' : ''}`}>
                              <td className="px-4 py-2">
                                <div className="font-medium flex items-center gap-2">
                                  {isSeries && (
                                    <button
                                      type="button"
                                      onClick={() => toggleSeriesExpanded(group.groupId)}
                                      className="text-gray-500 hover:text-gray-800"
                                    >
                                      {isExpanded ? '▾' : '▸'}
                                    </button>
                                  )}
                                  {formatDateShort(head.bookingDate)}
                                  {isSeries && <Badge className="bg-emerald-100 text-emerald-800">Recurring ({group.bookings.length})</Badge>}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {formatTime(head.startTime)} - {formatTime(head.endTime)}
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <div className="font-medium truncate max-w-[150px]" title={group.userName}>
                                  {group.userName}
                                </div>
                                <div className="text-xs text-gray-500 truncate max-w-[150px]" title={group.userEmail}>
                                  {group.userEmail}
                                </div>
                              </td>
                              <td className="px-4 py-2">
                                <span className="font-medium">{head.courtName}</span>
                                <span className="text-gray-400 text-xs ml-1">#{head.courtNumber}</span>
                              </td>
                              <td className="px-4 py-2 capitalize">{group.bookingType}</td>
                              <td className="px-4 py-2">
                                <Badge className={`${getStatusColor(group.status)} text-xs`}>
                                  {formatStatus(group.status)}
                                </Badge>
                              </td>
                              <td className="px-4 py-2">
                                {!isSeries ? (
                                  <div className="flex justify-end gap-1">
                                    {head.status === 'confirmed' && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleCompleteBooking(head.id)}
                                        className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                                      >
                                        Complete
                                      </Button>
                                    )}
                                    {head.status !== 'cancelled' && head.status !== 'completed' && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleCancelBooking(head.id)}
                                        className="h-7 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </div>
                                ) : (
                                  <div className="flex justify-end gap-2 items-center">
                                    {selectedCount > 0 && (
                                      <span className="text-xs text-emerald-700">{selectedCount} selected</span>
                                    )}
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-7 px-2">
                                          Actions {isExpanded ? '▴' : '▾'}
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => toggleSeriesExpanded(group.groupId)}>
                                          {isExpanded ? 'Hide Dates' : 'Show Dates'}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleEditSeriesAll(group.seriesId!, head)}>
                                          Edit All Dates
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => handleDeleteSeries(group.seriesId!)} className="text-red-600">
                                          Delete All Dates
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleEditSeriesSelected(group.seriesId!, head)}
                                          disabled={selectedCount === 0}
                                        >
                                          Edit Selected Dates
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          onClick={() => handleDeleteSeriesSelected(group.seriesId!)}
                                          disabled={selectedCount === 0}
                                          className="text-red-600"
                                        >
                                          Delete Selected Dates
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                )}
                              </td>
                            </tr>
                            {isSeries && isExpanded && (
                              <tr className="bg-emerald-50/20">
                                <td colSpan={6} className="px-4 py-2">
                                  <div className="flex items-center justify-between text-xs">
                                    <button
                                      type="button"
                                      onClick={() => toggleSeriesSelectAll(group.seriesId!, group.bookings)}
                                      className="text-emerald-700 hover:text-emerald-900"
                                    >
                                      {allSelected ? 'Clear all selected dates' : 'Select all dates'}
                                    </button>
                                    {selectedCount > 0 && (
                                      <span className="text-emerald-700">{selectedCount} date(s) selected</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            )}
                            {isSeries && isExpanded && group.bookings.map((booking) => (
                              <tr key={booking.id} className="bg-emerald-50/20">
                                <td className="px-4 py-2 pl-10">
                                  <div className="font-medium">{formatDateShort(booking.bookingDate)}</div>
                                  <div className="text-xs text-gray-500">
                                    {formatTime(booking.startTime)} - {formatTime(booking.endTime)}
                                  </div>
                                </td>
                                <td className="px-4 py-2 text-xs text-gray-500">Instance</td>
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
                                <td className="px-4 py-2 text-right">
                                  <label className="text-xs inline-flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={(selectedSeriesDates[group.seriesId!] || []).includes(booking.id)}
                                      onChange={() => toggleSeriesDateSelection(group.seriesId!, booking.id)}
                                    />
                                    Select date
                                  </label>
                                </td>
                              </tr>
                            ))}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                  </table>
                </div>
                <div className="absolute top-0 right-0 bottom-0 w-8 bg-gradient-to-l from-white pointer-events-none md:hidden" />
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
            </TabsContent>

            <TabsContent value="admin-booking">
              <AdminBooking />
            </TabsContent>
          </Tabs>
        </div>
      </div>
      <Dialog open={seriesEditOpen} onOpenChange={setSeriesEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{seriesEditMode === 'all' ? 'Edit Entire Recurring Series' : 'Edit Selected Dates'}</DialogTitle>
            <DialogDescription>
              {seriesEditMode === 'all'
                ? 'These changes will apply to every booking in this recurring series.'
                : `These changes will apply to ${seriesEditBookingIds.length} selected booking date(s).`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="series-start">Start Time</Label>
              <Input id="series-start" value={seriesEditStartTime} onChange={(e) => setSeriesEditStartTime(e.target.value)} placeholder="HH:MM:SS" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="series-end">End Time</Label>
              <Input id="series-end" value={seriesEditEndTime} onChange={(e) => setSeriesEditEndTime(e.target.value)} placeholder="HH:MM:SS" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="series-duration">Duration (minutes)</Label>
              <Input id="series-duration" type="number" min={1} value={seriesEditDurationMinutes} onChange={(e) => setSeriesEditDurationMinutes(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="series-type">Booking Type (optional)</Label>
              <Input id="series-type" value={seriesEditBookingType} onChange={(e) => setSeriesEditBookingType(e.target.value)} />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="series-notes">Notes (optional)</Label>
              <Input id="series-notes" value={seriesEditNotes} onChange={(e) => setSeriesEditNotes(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSeriesEditOpen(false)} disabled={seriesEditSubmitting}>Cancel</Button>
            <Button onClick={handleSubmitSeriesEdit} disabled={seriesEditSubmitting}>
              {seriesEditSubmitting ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
