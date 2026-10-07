import { CheckCircle2, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from './ui/utils';
import {
  type BookingCalendarDetails,
  isAppleCalendarDevice,
} from '../../shared/utils/bookingCalendar';

type BookingCalendarToastProps = {
  toastId: string | number;
  title: string;
  message: string;
  details: BookingCalendarDetails;
  bookingId?: string;
  onGoogle: (details: BookingCalendarDetails) => void;
  onApple: (details: BookingCalendarDetails, bookingId?: string) => void;
  onDownloadIcs: (details: BookingCalendarDetails) => void;
};

const calendarButtonClass = cn(
  'flex-1 min-w-0 rounded-md border border-border bg-background px-2 py-1.5',
  'text-xs font-medium text-foreground hover:bg-accent transition-colors'
);

export function BookingCalendarToast({
  toastId,
  title,
  message,
  details,
  bookingId,
  onGoogle,
  onApple,
  onDownloadIcs,
}: BookingCalendarToastProps) {
  const showApple = isAppleCalendarDevice();

  const handleGoogle = () => {
    toast.dismiss(toastId);
    onGoogle(details);
  };

  const handleSecondary = () => {
    toast.dismiss(toastId);
    if (showApple) {
      onApple(details, bookingId);
    } else {
      onDownloadIcs(details);
    }
  };

  return (
    <div
      className={cn(
        'flex w-[min(100vw-2rem,22rem)] gap-2.5 rounded-lg border border-border bg-background p-3 shadow-lg',
        'ring-1 ring-black/5'
      )}
      role="status"
      aria-live="polite"
    >
      <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600 mt-0.5" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold leading-snug text-foreground">{title}</p>
        <p className="mt-0.5 text-sm leading-snug text-muted-foreground line-clamp-3">
          {message}
        </p>
        <p className="mt-2 text-xs text-muted-foreground">Add to calendar</p>
        <div className="mt-1.5 flex gap-2">
          <button type="button" className={calendarButtonClass} onClick={handleGoogle}>
            Google
          </button>
          <button type="button" className={calendarButtonClass} onClick={handleSecondary}>
            {showApple ? 'Apple' : '.ics'}
          </button>
        </div>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-md p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground self-start"
        onClick={() => toast.dismiss(toastId)}
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
