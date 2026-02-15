import React, { useEffect, useRef, useState } from 'react';
import { Button } from '../ui/button';
import { Calendar, Clock } from 'lucide-react';

interface DragConfirmPopoverProps {
  courtName: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  dateFormatted: string;
  anchorX: number;
  anchorY: number;
  onBook: () => void;
  onCancel: () => void;
}

export function DragConfirmPopover({
  courtName,
  startTime,
  endTime,
  durationMinutes,
  dateFormatted,
  anchorX,
  anchorY,
  onBook,
  onCancel,
}: DragConfirmPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchorY + 8, left: anchorX - 120 });

  // Adjust position to stay within viewport
  useEffect(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    let top = anchorY + 8;
    let left = anchorX - rect.width / 2;

    // Keep within viewport bounds
    if (left < 8) left = 8;
    if (left + rect.width > window.innerWidth - 8) left = window.innerWidth - rect.width - 8;
    if (top + rect.height > window.innerHeight - 8) top = anchorY - rect.height - 8;
    if (top < 8) top = 8;

    setPos({ top, left });
  }, [anchorX, anchorY]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onCancel]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-64 animate-in fade-in zoom-in-95 duration-150"
      style={{ top: pos.top, left: pos.left }}
    >
      <div className="font-semibold text-sm text-gray-900 mb-2">{courtName}</div>
      <div className="space-y-1.5 text-xs text-gray-600">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5 text-gray-400" />
          {dateFormatted}
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5 text-gray-400" />
          {startTime} &ndash; {endTime}
        </div>
        <div className="text-gray-500">{durationMinutes} minutes</div>
      </div>
      <div className="flex gap-2 mt-3">
        <Button size="sm" onClick={onBook} className="flex-1">
          Book
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
      </div>
    </div>
  );
}
