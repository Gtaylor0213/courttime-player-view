import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Separator } from '../ui/separator';
import { Label } from '../ui/label';
import { Info, Users } from 'lucide-react';
import { BookingRuleToggleInput } from './BookingRuleToggleInput';

export type UserLimitField =
  | 'courtsPerWeekUserEnabled'
  | 'courtsPerWeekUser'
  | 'courtsPerDayUserEnabled'
  | 'courtsPerDayUser'
  | 'courtsPerWeekHouseholdEnabled'
  | 'courtsPerWeekHousehold'
  | 'courtsPerDayHouseholdEnabled'
  | 'courtsPerDayHousehold';

export type UserLimitsState = {
  courtsPerWeekUserEnabled: boolean;
  courtsPerWeekUser: string | number;
  courtsPerDayUserEnabled: boolean;
  courtsPerDayUser: string | number;
  courtsPerWeekHouseholdEnabled: boolean;
  courtsPerWeekHousehold: string | number;
  courtsPerDayHouseholdEnabled: boolean;
  courtsPerDayHousehold: string | number;
};

type Props = {
  maxAccountsDescription: string;
  maxAccountsEnabled: boolean;
  maxAccountsValue: string | number;
  onMaxAccountsEnabledChange: (enabled: boolean) => void;
  onMaxAccountsValueChange: (value: string) => void;
  userLimits: UserLimitsState;
  onUserLimitChange: (field: UserLimitField, value: boolean | string) => void;
  disabled?: boolean;
  maxAccountsMin?: string;
  maxAccountsMax?: string;
  footer?: React.ReactNode;
};

function InstructionCard({ text }: { text: string }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3">
      <Info className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-green-800">{text}</p>
    </div>
  );
}

/** Shared max-accounts + user-based limits block for registration and admin rules. */
export function MaxAccountsAndUserLimitsSection({
  maxAccountsDescription,
  maxAccountsEnabled,
  maxAccountsValue,
  onMaxAccountsEnabledChange,
  onMaxAccountsValueChange,
  userLimits,
  onUserLimitChange,
  disabled = false,
  maxAccountsMin = '1',
  maxAccountsMax,
  footer,
}: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5" />
          Max Accounts Per Address
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <InstructionCard text={maxAccountsDescription} />
        <div className="space-y-2">
          <Label className="text-sm text-gray-600">Max Accounts</Label>
          <BookingRuleToggleInput
            checked={maxAccountsEnabled}
            onCheckedChange={onMaxAccountsEnabledChange}
            value={maxAccountsValue}
            onChange={onMaxAccountsValueChange}
            disabled={disabled}
            min={maxAccountsMin}
            max={maxAccountsMax}
          />
        </div>

        <Separator className="my-6" />

        <div className="space-y-4">
          <div>
            <Label className="text-base font-medium">User-Based Limits</Label>
            <p className="text-xs text-gray-500 mt-1">
              Configure how many courts can be booked by individuals and households across daily and weekly limits.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Courts Per Week (Individual)</Label>
              <BookingRuleToggleInput
                checked={userLimits.courtsPerWeekUserEnabled}
                onCheckedChange={(enabled) => onUserLimitChange('courtsPerWeekUserEnabled', enabled)}
                value={userLimits.courtsPerWeekUser}
                onChange={(value) => onUserLimitChange('courtsPerWeekUser', value)}
                disabled={disabled}
                min="1"
              />
            </div>
            <div className="space-y-2">
              <Label>Courts Per Day (Individual)</Label>
              <BookingRuleToggleInput
                checked={userLimits.courtsPerDayUserEnabled}
                onCheckedChange={(enabled) => onUserLimitChange('courtsPerDayUserEnabled', enabled)}
                value={userLimits.courtsPerDayUser}
                onChange={(value) => onUserLimitChange('courtsPerDayUser', value)}
                disabled={disabled}
                min="1"
              />
            </div>
            <div className="space-y-2">
              <Label>Courts Per Week (Household)</Label>
              <BookingRuleToggleInput
                checked={userLimits.courtsPerWeekHouseholdEnabled}
                onCheckedChange={(enabled) => onUserLimitChange('courtsPerWeekHouseholdEnabled', enabled)}
                value={userLimits.courtsPerWeekHousehold}
                onChange={(value) => onUserLimitChange('courtsPerWeekHousehold', value)}
                disabled={disabled}
                min="1"
              />
            </div>
            <div className="space-y-2">
              <Label>Courts Per Day (Household)</Label>
              <BookingRuleToggleInput
                checked={userLimits.courtsPerDayHouseholdEnabled}
                onCheckedChange={(enabled) => onUserLimitChange('courtsPerDayHouseholdEnabled', enabled)}
                value={userLimits.courtsPerDayHousehold}
                onChange={(value) => onUserLimitChange('courtsPerDayHousehold', value)}
                disabled={disabled}
                min="1"
              />
            </div>
          </div>
        </div>
      </CardContent>
      {footer}
    </Card>
  );
}
