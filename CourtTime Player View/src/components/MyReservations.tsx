import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Clock, MapPin, Filter, Search, X, RefreshCw } from 'lucide-react';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ReservationManagementModal } from './ReservationManagementModal';
import { useAuth } from '../contexts/AuthContext';
import { bookingApi } from '../api/client';
import { toast } from 'sonner';

interface Reservation {
  id: string;
  courtId: string;
  userId: string;
  facilityId: string;
  bookingDate: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  status: 'confirmed' | 'pending' | 'cancelled' | 'completed';
  bookingType?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
  courtName?: string;
  facilityName?: string;
  userName?: string;
  userEmail?: string;
}

type TabType = 'upcoming' | 'past';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

function formatDate(dateStr: string) {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(time: string) {
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  return `${hours12}:${minutes.toString().padStart(2, '0')} ${period}`;
}

function getStatusColor(status: string) {
  switch (status) {
    case 'confirmed': return 'bg-green-100 text-green-800 border-green-300';
    case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'cancelled': return 'bg-red-100 text-red-800 border-red-300';
    case 'completed': return 'bg-gray-100 text-gray-800 border-gray-300';
    default: return 'bg-gray-100 text-gray-800 border-gray-300';
  }
}

export function MyReservations() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('upcoming');
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [facilityFilter, setFacilityFilter] = useState('all');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Modal
  const [selectedReservation, setSelectedReservation] = useState<Reservation | null>(null);
  const [showModal, setShowModal] = useState(false);

  const fetchReservations = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const response = await bookingApi.getByUser(user.id, activeTab === 'upcoming');
      if (response.success) {
        const data = response.data as any;
        const bookings: Reservation[] = data?.bookings ?? data ?? [];
        setReservations(Array.isArray(bookings) ? bookings : []);
      } else {
        toast.error('Failed to load reservations');
      }
    } catch {
      toast.error('Failed to load reservations');
    } finally {
      setLoading(false);
    }
  }, [user?.id, activeTab]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  // Derive unique facilities for the facility filter
  const facilityOptions = React.useMemo(() => {
    const seen = new Map<string, string>();
    reservations.forEach((r) => {
      if (r.facilityId && r.facilityName) seen.set(r.facilityId, r.facilityName);
    });
    return Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
  }, [reservations]);

  const filtered = React.useMemo(() => {
    return reservations.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (facilityFilter !== 'all' && r.facilityId !== facilityFilter) return false;
      if (startDateFilter && r.bookingDate < startDateFilter) return false;
      if (endDateFilter && r.bookingDate > endDateFilter) return false;
      if (searchText) {
        const q = searchText.toLowerCase();
        const matchesCourt = r.courtName?.toLowerCase().includes(q);
        const matchesFacility = r.facilityName?.toLowerCase().includes(q);
        const matchesDate = formatDate(r.bookingDate).toLowerCase().includes(q);
        if (!matchesCourt && !matchesFacility && !matchesDate) return false;
      }
      return true;
    });
  }, [reservations, statusFilter, facilityFilter, startDateFilter, endDateFilter, searchText]);

  const hasActiveFilters =
    statusFilter !== 'all' ||
    facilityFilter !== 'all' ||
    startDateFilter !== '' ||
    endDateFilter !== '' ||
    searchText !== '';

  const clearFilters = () => {
    setStatusFilter('all');
    setFacilityFilter('all');
    setStartDateFilter('');
    setEndDateFilter('');
    setSearchText('');
  };

  const handleOpenReservation = (r: Reservation) => {
    setSelectedReservation(r);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setSelectedReservation(null);
  };

  const handleModalUpdate = () => {
    fetchReservations();
  };

  return (
    <div className="flex-1 overflow-auto bg-gray-50">
      <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">My Reservations</h1>
            <p className="text-sm text-gray-500 mt-0.5">View, edit, or cancel your court bookings</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchReservations}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1 w-fit">
          {(['upcoming', 'past'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                clearFilters();
              }}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${
                activeTab === tab
                  ? 'bg-green-600 text-white shadow-sm'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Search + Filter Row */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by court or facility..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => setShowFilters((v) => !v)}
            className={showFilters || hasActiveFilters ? 'border-green-500 text-green-700' : ''}
          >
            <Filter className="h-4 w-4 mr-1.5" />
            Filters
            {hasActiveFilters && (
              <span className="ml-1.5 bg-green-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center">
                !
              </span>
            )}
          </Button>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500">
              <X className="h-4 w-4 mr-1" />
              Clear
            </Button>
          )}
        </div>

        {/* Expanded Filters */}
        {showFilters && (
          <div className="bg-white border border-gray-200 rounded-lg p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Status</label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Facility</label>
              <Select value={facilityFilter} onValueChange={setFacilityFilter}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="All Facilities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Facilities</SelectItem>
                  {facilityOptions.map((f) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">From Date</label>
              <input
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">To Date</label>
              <input
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
                className="w-full h-8 px-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
          </div>
        )}

        {/* Results count */}
        {!loading && (
          <p className="text-sm text-gray-500">
            {filtered.length} {filtered.length === 1 ? 'reservation' : 'reservations'}
            {hasActiveFilters ? ' matching filters' : ''}
          </p>
        )}

        {/* List */}
        {loading ? (
          <div className="space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-lg border border-gray-200 p-4 animate-pulse">
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-3 bg-gray-200 rounded w-1/2" />
                    <div className="h-3 bg-gray-200 rounded w-1/4" />
                  </div>
                  <div className="h-5 w-20 bg-gray-200 rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <Calendar className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">
              {hasActiveFilters
                ? 'No reservations match your filters'
                : activeTab === 'upcoming'
                ? 'No upcoming reservations'
                : 'No past reservations'}
            </p>
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-2 text-green-600">
                Clear filters
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((r) => (
              <button
                key={r.id}
                onClick={() => handleOpenReservation(r)}
                className="w-full bg-white rounded-lg border border-gray-200 p-4 text-left hover:border-green-400 hover:shadow-sm transition-all group"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900 text-sm">
                        {r.courtName || 'Court'}
                      </span>
                      {r.facilityName && (
                        <span className="text-xs text-gray-500 flex items-center gap-0.5">
                          <MapPin className="h-3 w-3" />
                          {r.facilityName}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-wrap text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        {formatDate(r.bookingDate)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5 text-gray-400" />
                        {formatTime(r.startTime)} – {formatTime(r.endTime)}
                        <span className="text-xs text-gray-400">({r.durationMinutes} min)</span>
                      </span>
                    </div>

                    {r.notes && (
                      <p className="text-xs text-gray-500 truncate max-w-sm">{r.notes}</p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge className={`text-xs ${getStatusColor(r.status)}`}>
                      {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                    </Badge>
                    <span className="text-xs text-green-600 opacity-0 group-hover:opacity-100 transition-opacity">
                      View details →
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <ReservationManagementModal
        isOpen={showModal}
        onClose={handleModalClose}
        reservation={selectedReservation}
        onUpdate={handleModalUpdate}
      />
    </div>
  );
}
