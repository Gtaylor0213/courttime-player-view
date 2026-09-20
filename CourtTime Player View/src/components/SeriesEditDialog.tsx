import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Checkbox } from './ui/checkbox';
import { Textarea } from './ui/textarea';
import { Badge } from './ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { RadioGroup, RadioGroupItem } from './ui/radio-group';
import { CalendarClock, Loader2, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { bookingApi, facilitiesApi } from '../api/client';
import type {
  BookingSeriesDetail,
  BookingSeriesScope,
  RecurringSeriesConflict,
} from '../api/client';
import {
  WEEKDAY_NAMES,
  describeRecurrence,
  expandWeeklyDates,
  isSingleDateRule,
  normalizeWeekdays,
  parseYmd,
  weekdayOf,
} from '../../shared/utils/recurrence';
import { describeRecurringConflict } from '../utils/recurringConflicts';
import { courtTypeLabel } from '../../shared/constants/courtTypes';

interface SeriesEditDialogProps {
  isOpen: boolean;
  onClose: () => void;
  seriesId: string;
  /** The instance the person clicked; anchors "this date" and "this and later". */
  focusDate: string;
  focusBookingId: string;
  /** Several dates ticked in a list; "this reservation only" then covers all of them. */
  focusBookingIds?: string[];
  facilityId: string;
  /** Reservation-type options, matching the single-reservation edit form. */
  reservationTypes: Array<{ value: string; label: string }>;
  /** Staff see the member picker and the past-dates switch. */
  isFacilityAdmin: boolean;
  onUpdated?: () => void;
  /** Open straight into the delete flow instead of the edit form. */
  mode?: 'edit' | 'cancel';
  /** Scope the person already chose in the calendar's prompt. */
  initialScope?: BookingSeriesScope;
}

const SCOPE_LABELS: Record<BookingSeriesScope, string> = {
  instance: 'This reservation only',
  following: 'This and all future dates',
  all: 'Every date in the series',
};

/**
 * A one-date group is several courts booked at once, so "future dates" is
 * meaningless and "every date" reads wrong -- it is every court.
 */
const GROUP_SCOPE_LABELS: Partial<Record<BookingSeriesScope, string>> = {
  instance: 'This court only',
  all: 'All courts in this booking',
};

function toTimeInput(value: string): string {
  const match = String(value ?? '').match(/(\d{1,2}):(\d{2})/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : '';
}

function toApiTime(value: string): string {
  const match = String(value ?? '').match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  return match ? `${match[1].padStart(2, '0')}:${match[2]}:${match[3] ?? '00'}` : '';
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = toTimeInput(time).split(':').map(Number);
  const total = h * 60 + m + minutes;
  const hh = Math.floor(total / 60) % 24;
  return `${String(hh).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`;
}

function formatDateLabel(ymd: string): string {
  const date = parseYmd(ymd);
  return date
    ? date.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : ymd;
}

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/**
 * Edit a recurring reservation from wherever it was clicked.
 *
 * Every field the create form collects is editable here -- courts, weekdays,
 * date range, time, duration, who it is for, type and notes -- plus the date
 * list, so individual dates can be dropped without abandoning the rule.
 */
export function SeriesEditDialog({
  isOpen,
  onClose,
  seriesId,
  focusDate,
  focusBookingId,
  focusBookingIds,
  facilityId,
  reservationTypes,
  isFacilityAdmin,
  onUpdated,
  mode = 'edit',
  initialScope = 'all',
}: SeriesEditDialogProps) {
  const [series, setSeries] = useState<BookingSeriesDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [scope, setScope] = useState<BookingSeriesScope>(initialScope);
  const [courts, setCourts] = useState<Array<{ id: string; name: string; type?: string }>>([]);
  const [conflicts, setConflicts] = useState<RecurringSeriesConflict[] | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  // Form state -- everything the create form offers.
  const [courtIds, setCourtIds] = useState<string[]>([]);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [bookingType, setBookingType] = useState('');
  const [notes, setNotes] = useState('');
  const [walkInName, setWalkInName] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const [memberResults, setMemberResults] = useState<Array<{ userId: string; fullName: string; email: string }>>([]);
  const [excludedDates, setExcludedDates] = useState<string[]>([]);
  const [includePast, setIncludePast] = useState(false);

  const resetFromSeries = useCallback((detail: BookingSeriesDetail) => {
    const { rule } = detail;
    setCourtIds(rule.courtIds);
    setWeekdays(normalizeWeekdays(rule.weekdays));
    setStartDate(rule.startDate);
    setEndDate(rule.endDate);
    setStartTime(toTimeInput(rule.startTime));
    setEndTime(toTimeInput(rule.endTime));
    setBookingType(rule.bookingType || '');
    setNotes(rule.notes || '');
    setWalkInName(rule.walkInName || '');
    setOwnerId(rule.userId);
    setOwnerName(detail.ownerName || '');
    setExcludedDates([]);
    setIncludePast(false);
  }, []);

  useEffect(() => {
    if (!isOpen || !seriesId) return;
    let cancelled = false;
    setIsLoading(true);
    setConflicts(null);
    setConfirmCancel(mode === 'cancel');
    setScope(initialScope);
    (async () => {
      try {
        const [seriesRes, courtsRes] = await Promise.all([
          bookingApi.getSeries(seriesId),
          facilitiesApi.getCourts(facilityId),
        ]);
        if (cancelled) return;
        if (!seriesRes.success || !seriesRes.series) {
          toast.error(seriesRes.error || 'Could not load this recurring reservation');
          onClose();
          return;
        }
        setSeries(seriesRes.series);
        resetFromSeries(seriesRes.series);
        const list = (courtsRes as any)?.data?.courts || (courtsRes as any)?.courts || [];
        setCourts(
          Array.isArray(list) ? list.map((c: any) => ({ id: c.id, name: c.name, type: c.type })) : []
        );
      } catch {
        if (!cancelled) {
          toast.error('Could not load this recurring reservation');
          onClose();
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, seriesId, facilityId, mode, initialScope, onClose, resetFromSeries]);

  // Member search, staff only -- moving a series to another member.
  useEffect(() => {
    if (!isFacilityAdmin || memberSearch.trim().length < 2) {
      setMemberResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await bookingApi.lookupFacilityMembers(facilityId, memberSearch.trim());
        const rows = (res as any)?.data?.members || (res as any)?.members || [];
        setMemberResults(Array.isArray(rows) ? rows.slice(0, 8) : []);
      } catch {
        setMemberResults([]);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [memberSearch, facilityId, isFacilityAdmin]);

  const durationMinutes = useMemo(() => {
    if (!startTime || !endTime) return 0;
    const [sh, sm] = startTime.split(':').map(Number);
    const [eh, em] = endTime.split(':').map(Number);
    return eh * 60 + em - (sh * 60 + sm);
  }, [startTime, endTime]);

  const today = todayYmd();

  // What kind of thing this is: a repeat, or several courts on one date.
  // Declared before the memos that read it -- a `const` is in the temporal dead
  // zone until this line, and a memo body runs during the same render.
  const isGroup = series ? isSingleDateRule(series.rule) : false;
  const scopeOptions: BookingSeriesScope[] = isGroup
    ? ['instance', 'all']
    : ['instance', 'following', 'all'];
  const scopeLabel = (option: BookingSeriesScope) =>
    (isGroup ? GROUP_SCOPE_LABELS[option] : undefined) ?? SCOPE_LABELS[option];

  const selectedBookingIds = focusBookingIds?.length ? focusBookingIds : [focusBookingId];
  const isMultiInstance = selectedBookingIds.length > 1;

  /** Dates the edited rule produces, within the chosen scope. */
  const previewDates = useMemo(() => {
    if (scope === 'instance' || isGroup) return [startDate || focusDate];
    const all = expandWeeklyDates(startDate, endDate, weekdays);
    return scope === 'following' ? all.filter((d) => d >= focusDate) : all;
  }, [scope, startDate, endDate, weekdays, focusDate, isGroup]);

  // Switching to "this reservation only" puts the clicked date in the date field,
  // so it can be moved to another day without touching the rest of the series.
  useEffect(() => {
    if (scope === 'instance' && !isMultiInstance) setStartDate(focusDate);
  }, [scope, isMultiInstance, focusDate]);

  const toggleWeekday = (index: number) =>
    setWeekdays((prev) =>
      prev.includes(index) ? prev.filter((d) => d !== index) : [...prev, index].sort((a, b) => a - b)
    );

  // Facilities really do run a tennis "Court 1" and a pickleball "Court 1";
  // an ambiguous checkbox would have people picking the wrong one.
  const duplicateCourtNames = useMemo(() => {
    const seen = new Map<string, number>();
    for (const court of courts) seen.set(court.name, (seen.get(court.name) || 0) + 1);
    return new Set([...seen.entries()].filter(([, n]) => n > 1).map(([name]) => name));
  }, [courts]);

  const courtLabel = (court: { name: string; type?: string }) =>
    duplicateCourtNames.has(court.name) ? `${court.name} (${courtTypeLabel(court.type)})` : court.name;

  const toggleCourt = (id: string) =>
    setCourtIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));

  const toggleDate = (date: string) =>
    setExcludedDates((prev) =>
      prev.includes(date) ? prev.filter((d) => d !== date) : [...prev, date]
    );

  const validate = (): string | null => {
    if (courtIds.length === 0) return 'Select at least one court';
    if (!isGroup && scope !== 'instance' && weekdays.length === 0) {
      return 'Select at least one day of the week';
    }
    if (!startDate || !endDate) return 'Choose a start and end date';
    if (endDate < startDate) return 'The end date must be on or after the start date';
    if (!startTime || !endTime) return 'Choose a start and end time';
    if (durationMinutes <= 0) return 'The end time must be after the start time';
    if (previewDates.every((d) => excludedDates.includes(d))) {
      return 'Keep at least one date, or cancel the series instead';
    }
    return null;
  };

  const buildRule = () => ({
    userId: ownerId,
    courtIds,
    // Instance edits carry the target date in startDate; the rule itself is not
    // rewritten server-side, so these values only describe the one occurrence.
    weekdays:
      scope === 'instance' || isGroup
        ? normalizeWeekdays([weekdayOf(startDate || focusDate)])
        : weekdays,
    startDate: scope === 'following' ? (focusDate > startDate ? focusDate : startDate) : startDate,
    endDate: scope === 'instance' || isGroup ? startDate || focusDate : endDate,
    startTime: toApiTime(startTime),
    endTime: toApiTime(endTime),
    durationMinutes,
    bookingType: bookingType || null,
    notes: notes || null,
    walkInName: walkInName || null,
    maxPlayers: series?.rule.maxPlayers ?? null,
  });

  const submit = async (skipConflicts = false) => {
    const problem = validate();
    if (problem) {
      toast.error(problem);
      return;
    }
    setIsSaving(true);
    try {
      const res = await bookingApi.updateSeries(seriesId, {
        scope,
        fromDate: scope === 'following' ? focusDate : undefined,
        bookingIds: scope === 'instance' ? selectedBookingIds : undefined,
        rule: buildRule(),
        excludeDates: excludedDates,
        skipConflicts,
        includePast: isFacilityAdmin ? includePast : undefined,
      });

      if (!res.success) {
        if (res.conflicts?.length) {
          setConflicts(res.conflicts);
          return;
        }
        toast.error(res.error || 'Could not update this recurring reservation');
        return;
      }

      const parts = [
        res.updated ? `${res.updated} updated` : null,
        res.created ? `${res.created} added` : null,
        res.cancelled ? `${res.cancelled} cancelled` : null,
      ].filter(Boolean);
      toast.success(
        parts.length ? `Recurring reservation saved — ${parts.join(', ')}.` : 'Recurring reservation saved.'
      );
      if (res.skippedPast) {
        toast.info(`${res.skippedPast} past date(s) were left as they are.`);
      }
      onUpdated?.();
      onClose();
    } catch {
      toast.error('Could not update this recurring reservation');
    } finally {
      setIsSaving(false);
    }
  };

  const doCancel = async () => {
    setIsSaving(true);
    try {
      const res = await bookingApi.cancelSeries(seriesId, {
        scope,
        fromDate: scope === 'following' ? focusDate : undefined,
        bookingIds: scope === 'instance' ? selectedBookingIds : undefined,
        includePast: isFacilityAdmin ? includePast : undefined,
      });
      if (!res.success) {
        toast.error(res.error || 'Could not cancel this recurring reservation');
        return;
      }
      const count = (res as any).cancelled ?? 0;
      toast.success(
        count === 1 ? 'Reservation cancelled.' : `${count} reservations cancelled.`
      );
      onUpdated?.();
      onClose();
    } catch {
      toast.error('Could not cancel this recurring reservation');
    } finally {
      setIsSaving(false);
    }
  };

  const scopeChooser = (
    <div className="space-y-2">
      <Label className="text-sm font-medium">Apply to</Label>
      <RadioGroup
        value={scope}
        onValueChange={(value) => setScope(value as BookingSeriesScope)}
        className="gap-2"
      >
        {scopeOptions.map((option) => (
          <div key={option} className="flex items-center gap-2">
            <RadioGroupItem value={option} id={`scope-${option}`} />
            <Label htmlFor={`scope-${option}`} className="font-normal cursor-pointer">
              {option === 'instance' && isMultiInstance
                ? `The ${selectedBookingIds.length} selected dates only`
                : scopeLabel(option)}
              {option === 'instance' && !isMultiInstance && !isGroup && (
                <span className="text-muted-foreground"> — {formatDateLabel(focusDate)}</span>
              )}
              {option === 'all' && isGroup && courtIds.length > 0 && (
                <span className="text-muted-foreground"> — {courtIds.length} court(s)</span>
              )}
            </Label>
          </div>
        ))}
      </RadioGroup>
    </div>
  );

  if (conflicts) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Some dates are already taken</DialogTitle>
            <DialogDescription>
              Nothing has been changed yet. Apply the change to the other dates and leave these
              as they are, or go back and pick a different time.
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-56 overflow-y-auto space-y-1 text-sm">
            {conflicts.map((conflict, index) => (
              <li key={`${conflict.courtId}-${conflict.bookingDate}-${index}`}>
                • {describeRecurringConflict(conflict)}
              </li>
            ))}
          </ul>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConflicts(null)} disabled={isSaving}>
              Go back
            </Button>
            <Button onClick={() => { setConflicts(null); void submit(true); }} disabled={isSaving}>
              Apply to the other dates
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  if (confirmCancel) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{isGroup ? 'Cancel grouped reservation' : 'Cancel recurring reservation'}</DialogTitle>
            <DialogDescription>
              {series ? describeRecurrence(series.rule) : 'Loading…'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {scopeChooser}
            <p className="text-sm text-muted-foreground">
              {scope === 'instance'
                ? isGroup
                  ? 'One court will be cancelled; the rest of the booking stays.'
                  : 'One date will be cancelled.'
                : isGroup
                ? `All ${courtIds.length} court(s) in this booking will be cancelled.`
                : `${previewDates.filter((d) => d >= today).length} upcoming date(s) will be cancelled. Past dates stay in the member's history.`}
            </p>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => (mode === 'cancel' ? onClose() : setConfirmCancel(false))}
              disabled={isSaving}
            >
              Keep it
            </Button>
            <Button variant="destructive" onClick={doCancel} disabled={isSaving}>
              {isSaving ? 'Cancelling…' : 'Cancel reservation(s)'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-5 w-5" />
            {isGroup ? 'Edit grouped reservation' : 'Edit recurring reservation'}
          </DialogTitle>
          <DialogDescription>
            {series ? describeRecurrence(series.rule) : 'Loading…'}
          </DialogDescription>
        </DialogHeader>

        {isLoading || !series ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading the series…
          </div>
        ) : (
          <div className="space-y-5 py-2">
            {scopeChooser}

            {scope === 'instance' && (
              <p className="text-sm text-muted-foreground">
                {isMultiInstance
                  ? `Only the ${selectedBookingIds.length} selected dates change. `
                  : isGroup
                  ? 'Only this one court changes. '
                  : `Only ${formatDateLabel(focusDate)} changes. `}
                {isGroup
                  ? 'The other courts in this booking keep their current time.'
                  : 'The series itself keeps its current courts, days and time.'}
              </p>
            )}

            <div className="space-y-2">
              <Label className="text-sm font-medium">
                Courts
                {isGroup && (
                  <span className="font-normal text-muted-foreground">
                    {' '}— unticking one cancels that court
                  </span>
                )}
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {courts.map((court) => (
                  <label key={court.id} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={courtIds.includes(court.id)}
                      onCheckedChange={() => toggleCourt(court.id)}
                    />
                    {courtLabel(court)}
                  </label>
                ))}
              </div>
            </div>

            {scope !== 'instance' && !isGroup && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Repeats on</Label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {WEEKDAY_NAMES.map((day, index) => (
                    <label key={day} className="flex items-center gap-2 text-sm cursor-pointer">
                      <Checkbox
                        checked={weekdays.includes(index)}
                        onCheckedChange={() => toggleWeekday(index)}
                      />
                      {day.slice(0, 3)}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="series-start-date" className="text-sm font-medium">
                  {scope === 'instance' || isGroup ? 'Date' : 'First date'}
                </Label>
                <Input
                  id="series-start-date"
                  type="date"
                  value={startDate}
                  // 'following' is anchored to the date that was clicked, and several
                  // selected dates cannot all move to one new date.
                  disabled={scope === 'following' || (scope === 'instance' && isMultiInstance)}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              {scope !== 'instance' && !isGroup && (
                <div className="space-y-1">
                  <Label htmlFor="series-end-date" className="text-sm font-medium">
                    Last date
                  </Label>
                  <Input
                    id="series-end-date"
                    type="date"
                    value={endDate}
                    min={startDate}
                    onChange={(e) => setEndDate(e.target.value)}
                  />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="series-start-time" className="text-sm font-medium">
                  Start time
                </Label>
                <Input
                  id="series-start-time"
                  type="time"
                  value={startTime}
                  onChange={(e) => {
                    const next = e.target.value;
                    // Keep the length the person already chose when the start moves.
                    if (durationMinutes > 0) setEndTime(toTimeInput(addMinutes(next, durationMinutes)));
                    setStartTime(next);
                  }}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="series-end-time" className="text-sm font-medium">
                  End time
                </Label>
                <Input
                  id="series-end-time"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                />
                {durationMinutes > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {Math.floor(durationMinutes / 60)} hr {durationMinutes % 60} min
                  </p>
                )}
              </div>
            </div>

            {isFacilityAdmin && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Reserved for</Label>
                <div className="flex items-center gap-2 text-sm">
                  <Badge variant="secondary">{walkInName || ownerName || 'Member'}</Badge>
                </div>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Search members to move this series…"
                    value={memberSearch}
                    onChange={(e) => setMemberSearch(e.target.value)}
                  />
                </div>
                {memberResults.length > 0 && (
                  <div className="border rounded-md divide-y max-h-40 overflow-y-auto">
                    {memberResults.map((member) => (
                      <button
                        key={member.userId}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                        onClick={() => {
                          setOwnerId(member.userId);
                          setOwnerName(member.fullName);
                          setWalkInName('');
                          setMemberSearch('');
                          setMemberResults([]);
                        }}
                      >
                        {member.fullName}
                        <span className="text-muted-foreground"> · {member.email}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="space-y-1">
                  <Label htmlFor="series-walk-in" className="text-sm font-medium">
                    Or a walk-in guest name
                  </Label>
                  <Input
                    id="series-walk-in"
                    value={walkInName}
                    placeholder="Guest name"
                    onChange={(e) => setWalkInName(e.target.value)}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-sm font-medium">Reservation type</Label>
              <Select value={bookingType || 'none'} onValueChange={(v) => setBookingType(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="No type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No type</SelectItem>
                  {reservationTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="series-notes" className="text-sm font-medium">
                Notes
              </Label>
              <Textarea
                id="series-notes"
                value={notes}
                rows={2}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {scope !== 'instance' && !isGroup && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Dates ({previewDates.length - excludedDates.filter((d) => previewDates.includes(d)).length} of{' '}
                    {previewDates.length})
                  </Label>
                  <span className="text-xs text-muted-foreground">Uncheck a date to drop it</span>
                </div>
                <div className="border rounded-md max-h-48 overflow-y-auto divide-y">
                  {previewDates.length === 0 && (
                    <p className="px-3 py-3 text-sm text-muted-foreground">
                      No dates match these days and this range.
                    </p>
                  )}
                  {previewDates.map((date) => (
                    <label
                      key={date}
                      className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer"
                    >
                      <Checkbox
                        checked={!excludedDates.includes(date)}
                        onCheckedChange={() => toggleDate(date)}
                      />
                      <span className={excludedDates.includes(date) ? 'line-through text-muted-foreground' : ''}>
                        {formatDateLabel(date)}
                      </span>
                      {date < today && (
                        <Badge variant="secondary" className="ml-auto text-xs">
                          past
                        </Badge>
                      )}
                    </label>
                  ))}
                </div>
                {isFacilityAdmin && previewDates.some((d) => d < today) && (
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox
                      checked={includePast}
                      onCheckedChange={() => setIncludePast((prev) => !prev)}
                    />
                    Also change dates that have already happened
                  </label>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 flex-wrap">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Close
          </Button>
          <Button
            variant="destructive"
            onClick={() => setConfirmCancel(true)}
            disabled={isSaving || isLoading}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Cancel dates…
          </Button>
          <Button onClick={() => submit(false)} disabled={isSaving || isLoading}>
            {isSaving ? 'Saving…' : 'Save changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
