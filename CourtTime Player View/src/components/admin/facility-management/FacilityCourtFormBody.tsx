import React from 'react';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import { Save, X } from 'lucide-react';
import { PaidCourtBookingFields } from '../PaidCourtBookingFields';
import { CourtTypeField } from '../CourtTypeField';
import {
  courtFieldsAfterNameChange,
  courtFieldsAfterNumberInputChange,
  courtNumberInputDisplayValue,
} from '../../../../shared/utils/courtNaming';
import type { Court } from './facilityManagementTypes';
import { CourtAddPromoSection } from '../CourtAddPromoSection';
import { CourtWaiverSection } from '../CourtWaiverSection';
import type { useCourtAddPromo } from '../useCourtAddPromo';

export function FacilityCourtFormBody({
  editingCourt,
  setEditingCourt,
  idPrefix,
  courtSaving,
  onSave,
  onCancel,
  stripeOnboarded,
  stripeStatusLoading,
  isAddingNew = false,
  courtAddPromo,
}: {
  editingCourt: Court;
  setEditingCourt: React.Dispatch<React.SetStateAction<Court | null>>;
  idPrefix: string;
  courtSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
  stripeOnboarded: boolean | null;
  stripeStatusLoading: boolean;
  isAddingNew?: boolean;
  courtAddPromo?: ReturnType<typeof useCourtAddPromo>;
}) {
  const id = (suffix: string) => `${idPrefix}-${suffix}`;
  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={id('courtName')}>Court Name</Label>
          <p className="text-xs text-gray-500">Shown on the calendar — any label you want (not tied to court number).</p>
          <Input
            id={id('courtName')}
            value={editingCourt.name}
            onChange={(e) =>
              setEditingCourt((prev) =>
                prev
                  ? { ...prev, ...courtFieldsAfterNameChange(e.target.value, prev.courtNumber) }
                  : prev
              )
            }
            placeholder="e.g. Center Court"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={id('courtNumber')}>Court Number</Label>
          <Input
            id={id('courtNumber')}
            type="text"
            inputMode="numeric"
            value={courtNumberInputDisplayValue(editingCourt.courtNumber)}
            onChange={(e) =>
              setEditingCourt((prev) =>
                prev
                  ? {
                      ...prev,
                      ...courtFieldsAfterNumberInputChange(e.target.value, prev.name),
                    }
                  : prev
              )
            }
          />
        </div>
        <CourtTypeField
          id={id('courtType')}
          value={editingCourt.courtType}
          onChange={(courtType) =>
            setEditingCourt((prev) => (prev ? { ...prev, courtType } : prev))
          }
        />
        <div className="space-y-2">
          <Label htmlFor={id('courtSurface')}>Surface Type</Label>
          <Select
            value={editingCourt.surfaceType}
            onValueChange={(value) =>
              setEditingCourt((prev) => (prev ? { ...prev, surfaceType: value } : prev))
            }
          >
            <SelectTrigger id={id('courtSurface')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Hard Court">Hard Court</SelectItem>
              <SelectItem value="Clay Court">Clay Court</SelectItem>
              <SelectItem value="Grass Court">Grass Court</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor={id('courtStatus')}>Status</Label>
          <Select
            value={editingCourt.status}
            onValueChange={(value: 'available' | 'maintenance' | 'closed') =>
              setEditingCourt((prev) => (prev ? { ...prev, status: value } : prev))
            }
          >
            <SelectTrigger id={id('courtStatus')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="available">Available</SelectItem>
              <SelectItem value="maintenance">Maintenance</SelectItem>
              <SelectItem value="closed">Closed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id={id('indoor')}
            checked={editingCourt.isIndoor}
            onCheckedChange={(checked) =>
              setEditingCourt((prev) => (prev ? { ...prev, isIndoor: checked } : prev))
            }
          />
          <Label htmlFor={id('indoor')}>Indoor Court</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id={id('lights')}
            checked={editingCourt.hasLights}
            onCheckedChange={(checked) =>
              setEditingCourt((prev) => (prev ? { ...prev, hasLights: checked } : prev))
            }
          />
          <Label htmlFor={id('lights')}>Has Lights</Label>
        </div>
        <div className="flex items-center space-x-2">
          <Switch
            id={id('walkUp')}
            checked={editingCourt.isWalkUp === true}
            onCheckedChange={(checked) =>
              setEditingCourt((prev) => (prev ? { ...prev, isWalkUp: checked } : prev))
            }
          />
          <Label htmlFor={id('walkUp')}>Walk-up Court (no online booking)</Label>
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-center space-x-2 mb-2">
          <Switch
            id={id('canSplit')}
            checked={editingCourt.canSplit || false}
            onCheckedChange={(checked) =>
              setEditingCourt((prev) =>
                prev
                  ? {
                      ...prev,
                      canSplit: checked,
                      splitConfig:
                        checked && !prev.splitConfig
                          ? { splitNames: [], splitType: 'Pickleball' }
                          : prev.splitConfig,
                    }
                  : prev
              )
            }
          />
          <Label htmlFor={id('canSplit')}>Can be split into multiple courts</Label>
        </div>

        {editingCourt.canSplit && (
          <div className="ml-6 mt-3 p-4 bg-gray-50 rounded-lg">
            <Label className="text-sm mb-2 block">Split Configuration</Label>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Split Names (comma-separated)</Label>
                <Input
                  placeholder="3a, 3b"
                  defaultValue={editingCourt.splitConfig?.splitNames.join(', ') || ''}
                  key={idPrefix + '-splitnames'}
                  onBlur={(e) => {
                    const names = e.target.value.split(',').map((n) => n.trim()).filter(Boolean);
                    setEditingCourt((prev) =>
                      prev
                        ? {
                            ...prev,
                            splitConfig: {
                              ...prev.splitConfig,
                              splitNames: names,
                              splitType: prev.splitConfig?.splitType || 'Pickleball',
                            },
                          }
                        : prev
                    );
                  }}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Split Type</Label>
                <Select
                  value={editingCourt.splitConfig?.splitType || 'Pickleball'}
                  onValueChange={(value: 'Tennis' | 'Pickleball') => {
                    setEditingCourt((prev) =>
                      prev
                        ? {
                            ...prev,
                            splitConfig: {
                              ...prev.splitConfig,
                              splitType: value,
                              splitNames: prev.splitConfig?.splitNames || [],
                            },
                          }
                        : prev
                    );
                  }}
                >
                  <SelectTrigger className="text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Tennis">Tennis</SelectItem>
                    <SelectItem value="Pickleball">Pickleball</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Split courts share booking conflicts with the parent court
            </p>
          </div>
        )}
      </div>

      <PaidCourtBookingFields
        court={editingCourt}
        onChange={(patch) => setEditingCourt((prev) => (prev ? { ...prev, ...patch } : prev))}
        stripeOnboarded={stripeOnboarded}
        stripeStatusLoading={stripeStatusLoading}
        paymentsTabHint="Member Payments in the sidebar"
      />

      <CourtWaiverSection
        courtId={isAddingNew ? null : editingCourt.id || null}
        idPrefix={idPrefix}
        draftContent={editingCourt.waiverContent || ''}
        onDraftChange={(waiverContent) =>
          setEditingCourt((prev) => (prev ? { ...prev, waiverContent } : prev))
        }
      />

      {isAddingNew && courtAddPromo && (
        <CourtAddPromoSection
          courtsToAdd={1}
          baseAmountCents={courtAddPromo.baseAmountCents}
          finalAmountCents={courtAddPromo.finalAmountCents}
          paymentRequired={courtAddPromo.paymentRequired}
          perCourtLabel={courtAddPromo.perCourtLabel}
          promoCode={courtAddPromo.promoCode}
          setPromoCode={courtAddPromo.setPromoCode}
          promoValidation={courtAddPromo.promoValidation}
          setPromoValidation={courtAddPromo.setPromoValidation}
          isValidatingPromo={courtAddPromo.isValidatingPromo}
          onValidate={courtAddPromo.handleValidatePromo}
          onClear={courtAddPromo.handleClearPromo}
        />
      )}

      <div className="flex gap-2 mt-6">
        <Button onClick={onSave} disabled={courtSaving}>
          <Save className="h-4 w-4 mr-2" />
          {courtSaving ? 'Saving...' : 'Save Court'}
        </Button>
        <Button variant="outline" onClick={onCancel} disabled={courtSaving}>
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      </div>
    </>
  );
}
