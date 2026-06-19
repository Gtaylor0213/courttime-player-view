import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import {
  BookingRuleSwitch,
  BookingRuleToggleInput,
} from '../booking-rules/BookingRuleToggleInput';
import { MaxAccountsAndUserLimitsSection } from '../booking-rules/MaxAccountsAndUserLimitsSection';
import {
  Info, ShieldCheck, Clock, Calendar, Sun, Users
} from 'lucide-react';
import {
  RulesConfig,
  RuleEntry,
  RULE_METADATA,
} from './rule-defaults';

interface RulesStepProps {
  rulesConfig: RulesConfig;
  onRulesChange: (updates: Partial<RulesConfig>) => void;
  onRuleEntryChange: (ruleCode: string, updates: Partial<RuleEntry>) => void;
  onRuleConfigFieldChange: (ruleCode: string, field: string, value: any) => void;
  // Peak hours handlers
  onAddPeakHourSlot: () => void;
  onRemovePeakHourSlot: (slotId: string) => void;
  onUpdatePeakHourSlot: (slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  onTogglePeakHourSlotDay: (slotId: string, day: number) => void;
  onUpdatePeakHourSlotRule: (
    slotId: string,
    field:
      | 'maxBookingsPerDay'
      | 'maxBookingsPerDayUnlimited'
      | 'maxBookingsPerDayHousehold'
      | 'maxBookingsPerDayHouseholdUnlimited'
      | 'maxBookingsPerWeek'
      | 'maxBookingsPerWeekUnlimited'
      | 'maxBookingsPerWeekHousehold'
      | 'maxBookingsPerWeekHouseholdUnlimited'
      | 'maxDurationHours'
      | 'maxDurationUnlimited',
    value: string | boolean
  ) => void;
  errors: Record<string, string>;
}

function InstructionCard({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3 mb-4">
      <Icon className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-green-800">{text}</p>
    </div>
  );
}

export function RulesStep({
  rulesConfig,
  onRulesChange,
  onRuleEntryChange,
  onRuleConfigFieldChange,
  onAddPeakHourSlot,
  onRemovePeakHourSlot,
  onUpdatePeakHourSlot,
  onTogglePeakHourSlotDay,
  onUpdatePeakHourSlotRule,
  errors,
}: RulesStepProps) {
  const { rules } = rulesConfig;
  const daysInAdvanceMeta = RULE_METADATA.find((meta) => meta.code === 'ACC-005');
  const maxAccountsPerAddressMeta = RULE_METADATA.find((meta) => meta.code === 'HH-001');

  return (
    <div className="space-y-6">
      {/* Category 1: General Rules */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            General Rules
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InstructionCard
            icon={Info}
            text="Set general facility policies and member expectations shown to users during booking."
          />
          <div>
            <Label htmlFor="generalRules">General Usage Rules *</Label>
            <Textarea
              id="generalRules"
              placeholder="Enter your facility's general rules (e.g., dress code, equipment, guest policy, cleanup expectations...)"
              value={rulesConfig.generalRules}
              onChange={(e) => onRulesChange({ generalRules: e.target.value })}
              className={`mt-1 min-h-[100px] ${
                errors.generalRules ? 'border-red-500 focus-visible:ring-red-500' : ''
              }`}
            />
            {errors.generalRules && (
              <p className="text-sm text-red-500 mt-1">{errors.generalRules}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            Restriction Type
          </CardTitle>
          <CardDescription>Controls whether household limits are enforced</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <InstructionCard
            icon={Info}
            text="Choose whether booking limits apply per individual account or are shared by household."
          />
          <div
            id="restrictionTypeGroup"
            className={`rounded-lg border p-3 ${
              errors.restrictionType ? 'border-red-500 bg-red-50/50' : 'border-transparent'
            }`}
          >
            <Label className="mb-2 block">Restriction Type</Label>
            <div className="flex flex-col gap-2 sm:flex-row sm:gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="restrictionType"
                  value="account"
                  checked={rulesConfig.restrictionType === 'account'}
                  onChange={() => onRulesChange({ restrictionType: 'account' })}
                  className="accent-green-600"
                />
                <span className="text-sm font-medium">Per Account</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="restrictionType"
                  value="address"
                  checked={rulesConfig.restrictionType === 'address'}
                  onChange={() => onRulesChange({ restrictionType: 'address' })}
                  className="accent-green-600"
                />
                <span className="text-sm font-medium">Per Address</span>
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {rulesConfig.restrictionType === 'account'
                ? 'Each user account has independent booking limits.'
                : 'Booking limits are shared across all accounts at the same address.'}
            </p>
            {errors.restrictionType && (
              <p className="text-sm text-red-500 mt-2">{errors.restrictionType}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {maxAccountsPerAddressMeta && (
        <MaxAccountsAndUserLimitsSection
          maxAccountsDescription={`${maxAccountsPerAddressMeta.description} This rule is separate from the address whitelist.`}
          maxAccountsEnabled={!!rules['HH-001']?.enabled}
          maxAccountsValue={rules['HH-001']?.config?.max_members ?? ''}
          onMaxAccountsEnabledChange={(enabled) => onRuleEntryChange('HH-001', { enabled })}
          onMaxAccountsValueChange={(value) =>
            onRuleConfigFieldChange('HH-001', 'max_members', parseInt(value, 10) || '')
          }
          userLimits={{
            courtsPerWeekUserEnabled: !!rules['ACC-002']?.enabled,
            courtsPerWeekUser: rules['ACC-002']?.config?.max_per_week ?? '',
            courtsPerDayUserEnabled: !!rules['ACC-002']?.config?.max_per_day_enabled,
            courtsPerDayUser: rules['ACC-002']?.config?.max_per_day ?? '',
            courtsPerWeekHouseholdEnabled: !!rules['HH-003']?.enabled,
            courtsPerWeekHousehold:
              rules['HH-003']?.config?.max_per_week_household ??
              rules['HH-003']?.config?.max_prime_per_week_household ??
              '',
            courtsPerDayHouseholdEnabled: !!rules['HH-003']?.config?.max_per_day_household_enabled,
            courtsPerDayHousehold: rules['HH-003']?.config?.max_per_day_household ?? '',
          }}
          onUserLimitChange={(field, value) => {
            switch (field) {
              case 'courtsPerWeekUserEnabled':
                onRuleEntryChange('ACC-002', { enabled: value as boolean });
                break;
              case 'courtsPerWeekUser':
                onRuleConfigFieldChange('ACC-002', 'max_per_week', parseInt(value as string, 10) || 1);
                break;
              case 'courtsPerDayUserEnabled':
                onRuleConfigFieldChange('ACC-002', 'max_per_day_enabled', value as boolean);
                break;
              case 'courtsPerDayUser':
                onRuleConfigFieldChange('ACC-002', 'max_per_day', parseInt(value as string, 10) || 1);
                break;
              case 'courtsPerWeekHouseholdEnabled':
                onRuleEntryChange('HH-003', { enabled: value as boolean });
                break;
              case 'courtsPerWeekHousehold':
                onRuleConfigFieldChange('HH-003', 'max_per_week_household', parseInt(value as string, 10) || 1);
                break;
              case 'courtsPerDayHouseholdEnabled':
                onRuleConfigFieldChange('HH-003', 'max_per_day_household_enabled', value as boolean);
                break;
              case 'courtsPerDayHousehold':
                onRuleConfigFieldChange('HH-003', 'max_per_day_household', parseInt(value as string, 10) || 1);
                break;
              default:
                break;
            }
          }}
        />
      )}

      {/* Days in Advance */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Calendar className="h-5 w-5" />
            Days in Advance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InstructionCard
            icon={Info}
            text="Control how many days ahead members can reserve courts."
          />
          {daysInAdvanceMeta && (
            <div className="p-3 border rounded-lg space-y-2">
              <div>
                <Label className="font-medium text-sm">{daysInAdvanceMeta.name}</Label>
                <p className="text-xs text-gray-500 mt-0.5">{daysInAdvanceMeta.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <BookingRuleToggleInput
                  checked={!!rules['ACC-005']?.enabled}
                  onCheckedChange={(enabled) => onRuleEntryChange('ACC-005', { enabled })}
                  value={rules['ACC-005']?.config?.max_days_ahead ?? ''}
                  onChange={(value) => onRuleConfigFieldChange('ACC-005', 'max_days_ahead', parseInt(value, 10) || '')}
                  min={1}
                  max={365}
                />
                <span className="text-xs text-gray-500">days</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Max Reservation Duration */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Max Reservation Duration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InstructionCard
            icon={Info}
            text="Set the maximum allowed reservation length."
          />
          <div className="p-3 border rounded-lg space-y-2">
            <div>
              <Label className="font-medium text-sm">Max Reservation Duration</Label>
              <p className="text-xs text-gray-500 mt-0.5">Maximum booking duration for a single reservation.</p>
            </div>
            <div className="flex items-center gap-2">
              <BookingRuleToggleInput
                checked={!!rules['CRT-005']?.enabled}
                onCheckedChange={(enabled) => onRuleEntryChange('CRT-005', { enabled })}
                value={(() => {
                  const rawMinutes = rules['CRT-005']?.config?.max_duration_minutes;
                  const minutes = Number(rawMinutes);
                  if (!Number.isFinite(minutes) || minutes <= 0) {
                    return '';
                  }
                  const hours = minutes / 60;
                  return String(hours);
                })()}
                onChange={(rawHours) => {
                  if (rawHours === '') {
                    onRuleConfigFieldChange('CRT-005', 'max_duration_minutes', '');
                    return;
                  }
                  const hours = parseFloat(rawHours);
                  onRuleConfigFieldChange(
                    'CRT-005',
                    'max_duration_minutes',
                    Number.isFinite(hours) ? Math.round(hours * 60) : ''
                  );
                }}
                min={0.25}
                max={8}
                step={0.25}
              />
              <span className="text-xs text-gray-500">hours</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Peak Hours Policy */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sun className="h-5 w-5" />
            Peak Hours Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InstructionCard
            icon={Info}
            text="Define specific hours as peak time with separate booking limits. This is optional and can be configured later from the admin dashboard."
          />
          <div className="flex items-center gap-3">
            <BookingRuleSwitch
              checked={rulesConfig.hasPeakHours}
              onCheckedChange={(checked) => onRulesChange({ hasPeakHours: checked })}
            />
            <Label>Enable Peak Hours Restrictions</Label>
          </div>

          {rulesConfig.hasPeakHours && (
            <div className="space-y-4 pl-4 border-l-2 border-gray-200">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Peak Hour Slots</Label>
                  <button
                    type="button"
                    className="text-sm text-green-600 hover:text-green-800"
                    onClick={onAddPeakHourSlot}
                  >
                    + Add Slot
                  </button>
                </div>
                {rulesConfig.peakHoursSlots.length > 0 ? (
                  <div className="space-y-2">
                    {rulesConfig.peakHoursSlots.map((slot) => (
                      <div key={slot.id} className="border rounded-md p-2 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Input
                            type="time"
                            value={slot.startTime}
                            onChange={(e) => onUpdatePeakHourSlot(slot.id, 'startTime', e.target.value)}
                            className="w-full min-w-[7rem] flex-1 sm:w-32 sm:flex-none"
                          />
                          <span className="text-sm text-gray-500">to</span>
                          <Input
                            type="time"
                            value={slot.endTime}
                            onChange={(e) => onUpdatePeakHourSlot(slot.id, 'endTime', e.target.value)}
                            className="w-full min-w-[7rem] flex-1 sm:w-32 sm:flex-none"
                          />
                          <button
                            type="button"
                            className="text-red-500 hover:text-red-700 text-xs px-1"
                            onClick={() => onRemovePeakHourSlot(slot.id)}
                          >
                            x
                          </button>
                        </div>

                        <div className="space-y-2 p-3 bg-gray-50 rounded-md">
                          <Label className="text-sm">Applies To Days</Label>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 border rounded p-2 bg-white">
                            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, day) => (
                              <label key={label} className="inline-flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={slot.days.includes(day)}
                                  onChange={() => onTogglePeakHourSlotDay(slot.id, day)}
                                />
                                {label}
                              </label>
                            ))}
                          </div>

                          <div className="space-y-2 pt-1">
                            <Label className="text-sm">Max Reservation Duration</Label>
                            <div className="flex items-center gap-2">
                              <BookingRuleToggleInput
                                checked={!slot.rules.maxDurationUnlimited}
                                onCheckedChange={(checked) =>
                                  onUpdatePeakHourSlotRule(slot.id, 'maxDurationUnlimited', !checked)
                                }
                                value={slot.rules.maxDurationHours}
                                onChange={(value) => onUpdatePeakHourSlotRule(slot.id, 'maxDurationHours', value)}
                                min="0.5"
                                step="0.5"
                              />
                              <span className="text-xs text-gray-500 whitespace-nowrap">hours</span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                            <Label className="text-sm md:col-span-2">User-Based Limits</Label>
                            <div className="space-y-1">
                              <Label className="text-xs">Courts Per Day (Individual)</Label>
                              <BookingRuleToggleInput
                                checked={!slot.rules.maxBookingsPerDayUnlimited}
                                onCheckedChange={(checked) =>
                                  onUpdatePeakHourSlotRule(slot.id, 'maxBookingsPerDayUnlimited', !checked)
                                }
                                value={slot.rules.maxBookingsPerDay}
                                onChange={(value) => onUpdatePeakHourSlotRule(slot.id, 'maxBookingsPerDay', value)}
                                min="1"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Courts Per Week (Individual)</Label>
                              <BookingRuleToggleInput
                                checked={!slot.rules.maxBookingsPerWeekUnlimited}
                                onCheckedChange={(checked) =>
                                  onUpdatePeakHourSlotRule(slot.id, 'maxBookingsPerWeekUnlimited', !checked)
                                }
                                value={slot.rules.maxBookingsPerWeek}
                                onChange={(value) => onUpdatePeakHourSlotRule(slot.id, 'maxBookingsPerWeek', value)}
                                min="1"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Courts Per Week (Household)</Label>
                              <BookingRuleToggleInput
                                checked={!slot.rules.maxBookingsPerWeekHouseholdUnlimited}
                                onCheckedChange={(checked) =>
                                  onUpdatePeakHourSlotRule(slot.id, 'maxBookingsPerWeekHouseholdUnlimited', !checked)
                                }
                                value={slot.rules.maxBookingsPerWeekHousehold}
                                onChange={(value) => onUpdatePeakHourSlotRule(slot.id, 'maxBookingsPerWeekHousehold', value)}
                                min="1"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Courts Per Day (Household)</Label>
                              <BookingRuleToggleInput
                                checked={!slot.rules.maxBookingsPerDayHouseholdUnlimited}
                                onCheckedChange={(checked) =>
                                  onUpdatePeakHourSlotRule(slot.id, 'maxBookingsPerDayHouseholdUnlimited', !checked)
                                }
                                value={slot.rules.maxBookingsPerDayHousehold}
                                onChange={(value) => onUpdatePeakHourSlotRule(slot.id, 'maxBookingsPerDayHousehold', value)}
                                min="1"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">No peak hours slots configured.</p>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
