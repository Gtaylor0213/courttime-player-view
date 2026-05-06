import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Label } from '../ui/label';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Switch } from '../ui/switch';
import {
  Info, ShieldCheck, Clock, Calendar, Sun, Users
} from 'lucide-react';
import {
  RulesConfig,
  RuleEntry,
  RuleMeta,
  RULE_METADATA,
} from './rule-defaults';

interface RulesStepProps {
  rulesConfig: RulesConfig;
  onRulesChange: (updates: Partial<RulesConfig>) => void;
  onRuleEntryChange: (ruleCode: string, updates: Partial<RuleEntry>) => void;
  onRuleConfigFieldChange: (ruleCode: string, field: string, value: any) => void;
  // Peak hours handlers
  onAddPeakHourSlot: (day: string) => void;
  onRemovePeakHourSlot: (day: string, slotId: string) => void;
  onUpdatePeakHourSlot: (day: string, slotId: string, field: 'startTime' | 'endTime', value: string) => void;
  errors: Record<string, string>;
}

const DAYS_OF_WEEK = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

function InstructionCard({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-start gap-3 mb-4">
      <Icon className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-green-800">{text}</p>
    </div>
  );
}

function RuleCard({
  meta,
  entry,
  onToggle,
  onConfigChange,
}: {
  meta: RuleMeta;
  entry: RuleEntry;
  onToggle: (enabled: boolean) => void;
  onConfigChange: (field: string, value: any) => void;
}) {
  return (
    <div className="p-3 border rounded-lg space-y-2">
      <div className="flex justify-between items-center">
        <div className="flex-1 mr-3">
          <Label className="font-medium text-sm">{meta.name}</Label>
          <p className="text-xs text-gray-500 mt-0.5">{meta.description}</p>
        </div>
        <Switch
          checked={entry.enabled}
          onCheckedChange={onToggle}
        />
      </div>
      {entry.enabled && meta.fields.length > 0 && (
        <div className="flex flex-wrap gap-3 pt-1">
          {meta.fields.map((field) => (
            <div key={field.key} className="flex items-center gap-2">
              <Label className="text-xs text-gray-600 whitespace-nowrap">{field.label}:</Label>
              {field.type === 'time' ? (
                <Input
                  type="time"
                  className="w-28 h-8 text-sm"
                  value={entry.config[field.key] || ''}
                  onChange={(e) => onConfigChange(field.key, e.target.value)}
                />
              ) : field.type === 'select' ? (
                <select
                  className="h-8 text-sm border rounded px-2"
                  value={String(entry.config[field.key] ?? '')}
                  onChange={(e) => onConfigChange(field.key, e.target.value === 'true')}
                >
                  {field.options?.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              ) : (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    className="w-20 h-8 text-sm"
                    min={field.min}
                    max={field.max}
                    step={field.step || 1}
                    value={field.key === 'max_minutes_per_week'
                      ? (entry.config[field.key] || 0) / 60
                      : entry.config[field.key] ?? ''
                    }
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (field.key === 'max_minutes_per_week') {
                        onConfigChange(field.key, val * 60);
                      } else {
                        onConfigChange(field.key, val);
                      }
                    }}
                  />
                  {field.suffix && (
                    <span className="text-xs text-gray-500">{field.suffix}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
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
  errors,
}: RulesStepProps) {
  const { rules } = rulesConfig;
  const daysInAdvanceMeta = RULE_METADATA.find((meta) => meta.code === 'ACC-005');
  const cancellationPolicyMeta = RULE_METADATA.find((meta) => meta.code === 'ACC-008');

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
            text="Set general facility policies and choose whether to restrict bookings by individual account or by household address."
          />
          <div>
            <Label>General Usage Rules *</Label>
            <Textarea
              placeholder="Enter your facility's general rules (e.g., dress code, equipment, guest policy, cleanup expectations...)"
              value={rulesConfig.generalRules}
              onChange={(e) => onRulesChange({ generalRules: e.target.value })}
              className="mt-1 min-h-[100px]"
            />
            {errors.generalRules && (
              <p className="text-sm text-red-500 mt-1">{errors.generalRules}</p>
            )}
          </div>

          <div>
            <Label className="mb-2 block">Restriction Type</Label>
            <div className="flex gap-4">
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
          </div>
        </CardContent>
      </Card>

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
            <RuleCard
              meta={daysInAdvanceMeta}
              entry={rules['ACC-005'] || { enabled: false, config: {} }}
              onToggle={(enabled) => onRuleEntryChange('ACC-005', { enabled })}
              onConfigChange={(field, value) => onRuleConfigFieldChange('ACC-005', field, value)}
            />
          )}
        </CardContent>
      </Card>

      {/* Cancellation Policy */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Cancellation Policy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <InstructionCard
            icon={Info}
            text="Set the late-cancellation cutoff window before reservation start."
          />
          {cancellationPolicyMeta && (
            <RuleCard
              meta={cancellationPolicyMeta}
              entry={rules['ACC-008'] || { enabled: false, config: {} }}
              onToggle={(enabled) => onRuleEntryChange('ACC-008', { enabled })}
              onConfigChange={(field, value) => onRuleConfigFieldChange('ACC-008', field, value)}
            />
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
            <div className="flex justify-between items-center">
              <div className="flex-1 mr-3">
                <Label className="font-medium text-sm">Max Reservation Duration</Label>
                <p className="text-xs text-gray-500 mt-0.5">Maximum booking duration for a single reservation.</p>
              </div>
              <Switch
                checked={!!rules['CRT-005']?.enabled}
                onCheckedChange={(enabled) => onRuleEntryChange('CRT-005', { enabled })}
              />
            </div>
            {!!rules['CRT-005']?.enabled && (
              <div className="flex items-center gap-2">
                <Label className="text-xs text-gray-600 whitespace-nowrap">Max Duration:</Label>
                <Input
                  type="number"
                  className="w-24 h-8 text-sm"
                  min={15}
                  max={480}
                  step={15}
                  value={rules['CRT-005']?.config?.max_duration_minutes ?? ''}
                  onChange={(e) => onRuleConfigFieldChange('CRT-005', 'max_duration_minutes', parseFloat(e.target.value))}
                />
                <span className="text-xs text-gray-500">minutes</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* User-Based Limits */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            User-Based Limits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <InstructionCard
            icon={Info}
            text="Configure how many courts can be booked by individuals and households across daily and weekly limits."
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Courts Per Week (Individual)</Label>
              <div className="flex gap-2 items-center">
                <Switch
                  checked={!!rules['ACC-002']?.enabled}
                  onCheckedChange={(enabled) => onRuleEntryChange('ACC-002', { enabled })}
                />
                <Input
                  type="number"
                  min={1}
                  value={rules['ACC-002']?.config?.max_per_week ?? ''}
                  onChange={(e) => onRuleConfigFieldChange('ACC-002', 'max_per_week', parseInt(e.target.value, 10) || 1)}
                  disabled={!rules['ACC-002']?.enabled}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Courts Per Day (Individual)</Label>
              <div className="flex gap-2 items-center">
                <Switch
                  checked={!!rules['ACC-002']?.config?.max_per_day_enabled}
                  onCheckedChange={(enabled) => onRuleConfigFieldChange('ACC-002', 'max_per_day_enabled', enabled)}
                />
                <Input
                  type="number"
                  min={1}
                  value={rules['ACC-002']?.config?.max_per_day ?? ''}
                  onChange={(e) => onRuleConfigFieldChange('ACC-002', 'max_per_day', parseInt(e.target.value, 10) || 1)}
                  disabled={!rules['ACC-002']?.config?.max_per_day_enabled}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Courts Per Week (Household)</Label>
              <div className="flex gap-2 items-center">
                <Switch
                  checked={!!rules['HH-003']?.enabled}
                  onCheckedChange={(enabled) => onRuleEntryChange('HH-003', { enabled })}
                />
                <Input
                  type="number"
                  min={1}
                  value={rules['HH-003']?.config?.max_per_week_household ?? rules['HH-003']?.config?.max_prime_per_week_household ?? ''}
                  onChange={(e) => onRuleConfigFieldChange('HH-003', 'max_per_week_household', parseInt(e.target.value, 10) || 1)}
                  disabled={!rules['HH-003']?.enabled}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Courts Per Day (Household)</Label>
              <div className="flex gap-2 items-center">
                <Switch
                  checked={!!rules['HH-003']?.config?.max_per_day_household_enabled}
                  onCheckedChange={(enabled) => onRuleConfigFieldChange('HH-003', 'max_per_day_household_enabled', enabled)}
                />
                <Input
                  type="number"
                  min={1}
                  value={rules['HH-003']?.config?.max_per_day_household ?? ''}
                  onChange={(e) => onRuleConfigFieldChange('HH-003', 'max_per_day_household', parseInt(e.target.value, 10) || 1)}
                  disabled={!rules['HH-003']?.config?.max_per_day_household_enabled}
                />
              </div>
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
            <Switch
              checked={rulesConfig.hasPeakHours}
              onCheckedChange={(checked) => onRulesChange({ hasPeakHours: checked })}
            />
            <Label>Enable Peak Hours Restrictions</Label>
          </div>

          {rulesConfig.hasPeakHours && (
            <div className="space-y-4 pl-4 border-l-2 border-gray-200">
              <div className="flex items-center gap-3">
                <Switch
                  checked={rulesConfig.peakHoursApplyToAdmins}
                  onCheckedChange={(checked) => onRulesChange({ peakHoursApplyToAdmins: checked })}
                />
                <Label className="text-sm">Apply to admins</Label>
              </div>

              {/* Per-day peak hour slots */}
              <div>
                <Label className="mb-2 block text-sm font-medium">Peak Hour Schedule</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {DAYS_OF_WEEK.map((day) => (
                    <div key={day} className="border rounded-lg p-2">
                      <div className="flex justify-between items-center mb-1">
                        <span className="text-sm font-medium capitalize">{day}</span>
                        <button
                          type="button"
                          className="text-xs text-green-600 hover:text-green-800"
                          onClick={() => onAddPeakHourSlot(day)}
                        >
                          + Add Slot
                        </button>
                      </div>
                      {(rulesConfig.peakHoursSlots[day] || []).map((slot) => (
                        <div key={slot.id} className="flex items-center gap-1 mt-1">
                          <Input
                            type="time"
                            className="flex-1 h-7 text-xs"
                            value={slot.startTime}
                            onChange={(e) => onUpdatePeakHourSlot(day, slot.id, 'startTime', e.target.value)}
                          />
                          <span className="text-xs">-</span>
                          <Input
                            type="time"
                            className="flex-1 h-7 text-xs"
                            value={slot.endTime}
                            onChange={(e) => onUpdatePeakHourSlot(day, slot.id, 'endTime', e.target.value)}
                          />
                          <button
                            type="button"
                            className="text-red-500 hover:text-red-700 text-xs px-1"
                            onClick={() => onRemovePeakHourSlot(day, slot.id)}
                          >
                            x
                          </button>
                        </div>
                      ))}
                      {(!rulesConfig.peakHoursSlots[day] || rulesConfig.peakHoursSlots[day].length === 0) && (
                        <p className="text-xs text-gray-400 mt-1">No peak hours set</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Peak hours booking limits */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm">Max Duration (Peak Hours)</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Switch
                      checked={rulesConfig.peakHoursRestrictions.maxDurationUnlimited}
                      onCheckedChange={(checked) =>
                        onRulesChange({
                          peakHoursRestrictions: { ...rulesConfig.peakHoursRestrictions, maxDurationUnlimited: checked }
                        })
                      }
                    />
                    <span className="text-xs text-gray-500">Unlimited</span>
                    {!rulesConfig.peakHoursRestrictions.maxDurationUnlimited && (
                      <Input
                        type="number"
                        className="w-20 h-8 text-sm"
                        min={0.5}
                        step={0.5}
                        value={rulesConfig.peakHoursRestrictions.maxDurationHours}
                        onChange={(e) =>
                          onRulesChange({
                            peakHoursRestrictions: { ...rulesConfig.peakHoursRestrictions, maxDurationHours: e.target.value }
                          })
                        }
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
