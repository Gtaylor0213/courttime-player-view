import { useState, useCallback, useEffect, useRef } from 'react';
import { generate15MinSlots, format12hTime, START_HOUR } from './calendarConstants';

// ── Types ──

export interface DragState {
  isDragging: boolean;
  courtName: string | null;
  courtId: string | null;
  startSlotIndex: number;
  endSlotIndex: number;
  slotCount: number;
  durationMinutes: number;
  startTimeLabel: string;
  endTimeLabel: string;
}

export interface DragConfirmationData {
  courtName: string;
  courtId: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  slotCount: number;
  anchorX: number;
  anchorY: number;
}

const INITIAL_DRAG: DragState = {
  isDragging: false,
  courtName: null,
  courtId: null,
  startSlotIndex: -1,
  endSlotIndex: -1,
  slotCount: 0,
  durationMinutes: 0,
  startTimeLabel: '',
  endTimeLabel: '',
};

// ── Hook ──

export function useCalendarDrag(
  isSlotBooked: (courtName: string, time: string) => boolean,
  isPastSlot: (time: string) => boolean,
  onSlotClick: (courtName: string, courtId: string, slotIndex: number) => void,
) {
  const allSlots = generate15MinSlots();
  const [drag, setDrag] = useState<DragState>(INITIAL_DRAG);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [confirmationData, setConfirmationData] = useState<DragConfirmationData | null>(null);

  // Refs for tracking drag intent (refs avoid stale closure issues)
  const isDraggingRef = useRef(false);
  const hasMovedRef = useRef(false);
  const startInfoRef = useRef<{ courtName: string; courtId: string; slotIndex: number } | null>(null);
  const lastPointerPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const computeEndTimeLabel = useCallback((endIdx: number) => {
    const endHour24 = START_HOUR + Math.floor((endIdx + 1) * 15 / 60);
    const endMinute = ((endIdx + 1) * 15) % 60;
    return format12hTime(endHour24, endMinute);
  }, []);

  const handleMouseDown = useCallback(
    (courtName: string, courtId: string, slotIndex: number, e: React.MouseEvent) => {
      const slotTime = allSlots[slotIndex];
      if (!slotTime || isPastSlot(slotTime) || isSlotBooked(courtName, slotTime)) return;

      e.preventDefault();
      isDraggingRef.current = true;
      hasMovedRef.current = false;
      startInfoRef.current = { courtName, courtId, slotIndex };
      lastPointerPos.current = { x: e.clientX, y: e.clientY };

      setDrag({
        isDragging: true,
        courtName,
        courtId,
        startSlotIndex: slotIndex,
        endSlotIndex: slotIndex,
        slotCount: 1,
        durationMinutes: 15,
        startTimeLabel: slotTime,
        endTimeLabel: computeEndTimeLabel(slotIndex),
      });
      setShowConfirmation(false);
      setConfirmationData(null);
    },
    [allSlots, isPastSlot, isSlotBooked, computeEndTimeLabel],
  );

  const expandSelection = useCallback(
    (slotIndex: number) => {
      if (!isDraggingRef.current || !startInfoRef.current) return;

      const courtName = startInfoRef.current.courtName;
      const startIdx = startInfoRef.current.slotIndex;

      // Mark as moved if slot changed
      if (slotIndex !== startIdx) {
        hasMovedRef.current = true;
      }

      const slotTime = allSlots[slotIndex];
      if (!slotTime) return;

      // Constrain range: can't include booked or past slots
      let effectiveEnd = startIdx;
      if (slotIndex >= startIdx) {
        for (let i = startIdx; i <= slotIndex; i++) {
          const t = allSlots[i];
          if (isSlotBooked(courtName, t) || isPastSlot(t)) break;
          effectiveEnd = i;
        }
      } else {
        for (let i = startIdx; i >= slotIndex; i--) {
          const t = allSlots[i];
          if (isSlotBooked(courtName, t) || isPastSlot(t)) break;
          effectiveEnd = i;
        }
      }

      const actualMin = Math.min(startIdx, effectiveEnd);
      const actualMax = Math.max(startIdx, effectiveEnd);
      const count = actualMax - actualMin + 1;

      setDrag(prev => ({
        ...prev,
        endSlotIndex: effectiveEnd,
        slotCount: count,
        durationMinutes: count * 15,
        startTimeLabel: allSlots[actualMin],
        endTimeLabel: computeEndTimeLabel(actualMax),
      }));
    },
    [allSlots, isSlotBooked, isPastSlot, computeEndTimeLabel],
  );

  const handleMouseEnter = useCallback(
    (courtName: string, slotIndex: number) => {
      if (!isDraggingRef.current || !startInfoRef.current) return;
      // Only allow dragging within the same court
      if (courtName !== startInfoRef.current.courtName) return;
      expandSelection(slotIndex);
    },
    [expandSelection],
  );

  const finishDrag = useCallback(() => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    const start = startInfoRef.current;
    if (!start) {
      setDrag(INITIAL_DRAG);
      return;
    }

    if (!hasMovedRef.current) {
      // Single click — open booking wizard directly
      setDrag(INITIAL_DRAG);
      onSlotClick(start.courtName, start.courtId, start.slotIndex);
    } else {
      // Drag completed — show confirmation
      setDrag(prev => ({ ...prev, isDragging: false }));
      setConfirmationData({
        courtName: start.courtName,
        courtId: start.courtId,
        startTime: drag.startTimeLabel || allSlots[Math.min(start.slotIndex, drag.endSlotIndex)],
        endTime: drag.endTimeLabel || computeEndTimeLabel(Math.max(start.slotIndex, drag.endSlotIndex)),
        durationMinutes: drag.durationMinutes || 15,
        slotCount: drag.slotCount || 1,
        anchorX: lastPointerPos.current.x,
        anchorY: lastPointerPos.current.y,
      });
      setShowConfirmation(true);
    }
  }, [onSlotClick, drag, allSlots, computeEndTimeLabel]);

  const clearDrag = useCallback(() => {
    isDraggingRef.current = false;
    hasMovedRef.current = false;
    startInfoRef.current = null;
    setDrag(INITIAL_DRAG);
    setShowConfirmation(false);
    setConfirmationData(null);
  }, []);

  const isSlotInDragRange = useCallback(
    (courtName: string, slotIndex: number): boolean => {
      if (drag.courtName !== courtName) return false;
      if (drag.slotCount === 0) return false;
      const minIdx = Math.min(drag.startSlotIndex, drag.endSlotIndex);
      const maxIdx = Math.max(drag.startSlotIndex, drag.endSlotIndex);
      return slotIndex >= minIdx && slotIndex <= maxIdx;
    },
    [drag],
  );

  // Global mouseup listener for drag end outside grid
  useEffect(() => {
    if (!isDraggingRef.current && !drag.isDragging) return;
    const onUp = (e: MouseEvent) => {
      lastPointerPos.current = { x: e.clientX, y: e.clientY };
      finishDrag();
    };
    document.addEventListener('mouseup', onUp);
    return () => document.removeEventListener('mouseup', onUp);
  }, [drag.isDragging, finishDrag]);

  return {
    drag,
    showConfirmation,
    confirmationData,
    setShowConfirmation,
    handleMouseDown,
    handleMouseEnter,
    finishDrag,
    clearDrag,
    isSlotInDragRange,
    allSlots,
  };
}
