import React from 'react';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';

export const BOOKING_RULE_SWITCH_CLASS =
  'data-[state=checked]:bg-emerald-600 data-[state=checked]:hover:bg-emerald-600/90';

interface BookingRuleToggleInputProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  value: string | number;
  onChange: (value: string) => void;
  disabled?: boolean;
  inputClassName?: string;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  type?: React.HTMLInputTypeAttribute;
}

export function BookingRuleToggleInput({
  checked,
  onCheckedChange,
  value,
  onChange,
  disabled = false,
  inputClassName = 'w-24 h-8',
  min,
  max,
  step,
  type = 'number',
}: BookingRuleToggleInputProps) {
  return (
    <div className="flex items-center gap-2">
      <Switch
        className={BOOKING_RULE_SWITCH_CLASS}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
      <Input
        type={type}
        className={cn(inputClassName, !checked && 'bg-muted text-muted-foreground')}
        min={min}
        max={max}
        step={step}
        value={checked ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || !checked}
      />
    </div>
  );
}

export function BookingRuleSwitch({
  checked,
  onCheckedChange,
  disabled = false,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Switch
      className={cn(BOOKING_RULE_SWITCH_CLASS, className)}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
    />
  );
}
