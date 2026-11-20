/**
 * Glen Abbey Pickleball Gate Code flag: pops up the club's gate code right after
 * a booking, before the add-to-calendar prompt. Opened imperatively from
 * offerAddBookingToCalendar (utils/bookingCalendar.ts) via showGateCodeDialog.
 */
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { KeyRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';

type GateCodeDialogProps = {
  gateCode: string;
  onClosed: () => void;
};

export function GateCodeDialog({ gateCode, onClosed }: GateCodeDialogProps) {
  const [open, setOpen] = useState(true);

  const close = () => {
    setOpen(false);
    onClosed();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-green-600" />
            Your Gate Code
          </DialogTitle>
          <DialogDescription>Use this code to open the gate to the courts.</DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border-2 border-green-200 bg-green-50 px-4 py-5 text-center">
          <p className="text-xs font-medium uppercase tracking-wide text-green-800">Gate code</p>
          <p className="mt-1 font-mono text-4xl font-bold tracking-[0.2em] text-green-900 break-all">
            {gateCode}
          </p>
        </div>
        <p className="text-sm text-gray-600">It's also in your confirmation email.</p>
        <DialogFooter>
          <Button onClick={close} className="w-full bg-green-600 hover:bg-green-700">
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Mounts the dialog on its own root; `onClosed` runs once the member dismisses it. */
export function showGateCodeDialog(gateCode: string, onClosed?: () => void): void {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  let done = false;
  const handleClosed = () => {
    if (done) return;
    done = true;
    // Let the close animation finish before unmounting.
    setTimeout(() => {
      root.unmount();
      host.remove();
    }, 300);
    onClosed?.();
  };
  root.render(<GateCodeDialog gateCode={gateCode} onClosed={handleClosed} />);
}
