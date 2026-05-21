import React, { useEffect, useRef, useState } from 'react';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  COURT_TYPE_CUSTOM_SELECT,
  STANDARD_COURT_TYPE_VALUES,
  courtTypeCustomLabel,
  courtTypeSelectValue,
  isStandardCourtType,
} from '../../../shared/constants/courtTypes';

export interface CourtTypeFieldProps {
  /** Stored court_type (preset or custom label). */
  value: string;
  onChange: (courtType: string) => void;
  id?: string;
  label?: string;
  /** Bulk edit: empty value means "leave unchanged". */
  allowEmpty?: boolean;
  emptyPlaceholder?: string;
}

const COURT_TYPE_UNCHANGED_SELECT = '__unchanged__';

export function CourtTypeField({
  value,
  onChange,
  id = 'courtType',
  label = 'Court Type',
  allowEmpty = false,
  emptyPlaceholder = 'Court Type',
}: CourtTypeFieldProps) {
  const customInputRef = useRef<HTMLInputElement>(null);
  const [customMode, setCustomMode] = useState(
    () => !allowEmpty && courtTypeSelectValue(value) === COURT_TYPE_CUSTOM_SELECT
  );

  useEffect(() => {
    setCustomMode(courtTypeSelectValue(value) === COURT_TYPE_CUSTOM_SELECT);
  }, [value]);

  const hasValue = value != null && String(value).trim() !== '';
  const customLabel = courtTypeCustomLabel(value);

  const displaySelectValue = customMode
    ? COURT_TYPE_CUSTOM_SELECT
    : allowEmpty && !hasValue
      ? COURT_TYPE_UNCHANGED_SELECT
      : hasValue
        ? courtTypeSelectValue(value)
        : 'Tennis';

  const handleSelectChange = (next: string) => {
    if (allowEmpty && next === COURT_TYPE_UNCHANGED_SELECT) {
      setCustomMode(false);
      onChange('');
      return;
    }
    if (next === COURT_TYPE_CUSTOM_SELECT) {
      setCustomMode(true);
      if (!isStandardCourtType(value)) {
        onChange(customLabel || value);
      } else {
        onChange('');
      }
      setTimeout(() => customInputRef.current?.focus(), 0);
      return;
    }
    setCustomMode(false);
    onChange(next);
  };

  const handleCustomLabelChange = (nextLabel: string) => {
    onChange(nextLabel);
  };

  return (
    <div className="space-y-2">
      {label ? <Label htmlFor={id}>{label}</Label> : null}
      <Select value={displaySelectValue} onValueChange={handleSelectChange}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={allowEmpty ? emptyPlaceholder : undefined} />
        </SelectTrigger>
        <SelectContent>
          {allowEmpty ? (
            <SelectItem value={COURT_TYPE_UNCHANGED_SELECT}>— No change —</SelectItem>
          ) : null}
          {STANDARD_COURT_TYPE_VALUES.map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
          <SelectItem value={COURT_TYPE_CUSTOM_SELECT}>Custom…</SelectItem>
        </SelectContent>
      </Select>
      {customMode ? (
        <div className="space-y-1 rounded-md border border-dashed border-gray-300 bg-gray-50/80 p-3">
          <Label htmlFor={`${id}-custom`} className="text-sm font-medium">
            Type name
          </Label>
          <Input
            ref={customInputRef}
            id={`${id}-custom`}
            value={customLabel}
            onChange={(e) => handleCustomLabelChange(e.target.value)}
            placeholder="e.g. Clubhouse, Volleyball Court"
            maxLength={80}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            This replaces Tennis, Pickleball, or Dual Purpose on the calendar and court list.
          </p>
        </div>
      ) : null}
    </div>
  );
}
