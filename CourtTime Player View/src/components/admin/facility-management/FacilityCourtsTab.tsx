import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import {
  Building2, Clock, MapPin, Phone, Mail, Save, Edit, X, Plus, Trash2, Image, User, Users,
  Upload, Shield, AlertTriangle, Zap, Home, FileText, Calendar, ChevronDown, ChevronRight, Info,
} from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { TabsContent } from '../../ui/tabs';
import { Badge } from '../../ui/badge';
import { Switch } from '../../ui/switch';
import { toast } from 'sonner';
import { RULE_METADATA, CATEGORIES } from '../../facility-registration/rule-defaults';
import { getFacilityTypeSelectOptions } from '../../../../shared/constants/facilityTypes';
import { CourtScheduleEditor } from '../CourtScheduleEditor';
import { FacilityCourtFormBody } from './FacilityCourtFormBody';
import { US_STATES } from './usStates';
import type { UseFacilityManagementReturn } from './useFacilityManagement';
import {
  parseLocalDate,
  toDatetimeLocalInput,
} from '../../../utils/dateUtils';
import { formatGroupedOperatingHoursSummary } from '../../../../shared/utils/operatingHours';

type Props = UseFacilityManagementReturn;

export function FacilityCourtsTab(props: Props) {
  const {
    isEditing, setIsEditing, saving, facilityData, setFacilityData,
    handleSave, handleCancel, getHoursDisplay, handleOperatingHoursChange,
    handlePrimaryContactChange, addSecondaryContact, updateSecondaryContact,
    removeSecondaryContact, renderSectionSaveFooter, renderTabFooterSaveBar,
    secondaryLocations, addingSecondaryLocation, setAddingSecondaryLocation,
    newSecondaryLocation, setNewSecondaryLocation, savingSecondaryLocation,
    editingSecondaryLocationId, editingSecondaryLocation, setEditingSecondaryLocation,
    cancelEditingSecondaryLocation, handleAddSecondaryLocation, handleRemoveSecondaryLocation,
    startEditingSecondaryLocation, handleUpdateSecondaryLocation,
    handleBookingRulesChange, handleWeekendPolicyChange, addPeakHourSlot, removePeakHourSlot,
    updatePeakHourSlotTime, updatePeakHourSlotRule, togglePeakHourSlotExpanded,
    setPeakHourSlotCourtMode, togglePeakHourSlotCourt, togglePeakHourSlotDay,
    expandedPeakHourSlots, courts, courtsLoading, editingCourt, setEditingCourt,
    isAddingNewCourt, courtSaving, stripeOnboarded, stripeStatusLoading,
    configuringCourtId, setConfiguringCourtId, courtSchedule, courtScheduleLoading, courtScheduleSaving,
    courtOperatingHours, courtHoursLoading, facilityCourtEditPanelRef,
    blackouts, blackoutsLoading, editingBlackout, setEditingBlackout,
    isAddingBlackout, setIsAddingBlackout, blackoutSaving, handleAddNewCourt, handleEditCourt,
    handleSaveCourt, handleCancelCourtEdit, handleDeleteCourt, handleToggleCourtConfig,
    updateCourtScheduleDay, updateAllScheduleDays, saveCourtSchedule,
    handleAddBlackout, handleSaveBlackout, handleDeleteBlackout,
    renderRuleCategoryCard, getCourtStatusColor, formatCourtStatus, performSave,
  } = props;

  return (
<TabsContent value="courts" className="space-y-6">
  <Card className="border-green-100 bg-green-50/40">
    <CardContent className="pt-6 text-sm text-gray-600">
      Add courts here with paid booking and guest fees. Use the clock icon on each court for
      operating hours — the same editor as Admin → Court Management.
      Fees and schedules saved here can be updated anytime from Court Management.
    </CardContent>
  </Card>
  <div className="flex justify-end">
    <Button onClick={handleAddNewCourt} disabled={editingCourt !== null || isAddingNewCourt}>
      <Plus className="h-4 w-4 mr-2" />
      Add New Court
    </Button>
  </div>

  {/* Add Court Form — editing an existing court opens inline below that row */}
  {editingCourt && isAddingNewCourt && (
    <Card className="border-green-200 bg-green-50">
      <CardHeader>
        <CardTitle>Add New Court</CardTitle>
        <CardDescription>Configure court details and settings</CardDescription>
      </CardHeader>
      <CardContent>
        <FacilityCourtFormBody
          editingCourt={editingCourt}
          setEditingCourt={setEditingCourt}
          idPrefix="new-court"
          courtSaving={courtSaving}
          onSave={handleSaveCourt}
          onCancel={handleCancelCourtEdit}
          stripeOnboarded={stripeOnboarded}
          stripeStatusLoading={stripeStatusLoading}
        />
      </CardContent>
    </Card>
  )}

  {/* Courts List */}
  {courtsLoading ? (
    <div className="flex items-center justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600"></div>
    </div>
  ) : (
    <div className="grid grid-cols-1 gap-4">
      {courts.map((court) => {
        const isEditingThis =
          editingCourt !== null && !isAddingNewCourt && editingCourt.id === court.id;
        const hoursSummary = courtHoursLoading
          ? null
          : formatGroupedOperatingHoursSummary(courtOperatingHours[court.id] || {});
        return (
        <React.Fragment key={court.id}>
          <Card className={isEditingThis ? 'border-green-200' : ''}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">{court.name}</h3>
                    <Badge className={getCourtStatusColor(court.status)}>{formatCourtStatus(court.status)}</Badge>
                    {courtHoursLoading ? (
                      <span className="text-xs text-gray-400">Loading hours…</span>
                    ) : hoursSummary ? (
                      <span className="text-xs text-gray-600 font-normal">{hoursSummary}</span>
                    ) : null}
                    {court.isWalkUp && <Badge variant="secondary">Walk-up</Badge>}
                    {court.requirePayment && court.bookingAmountCents && (
                      <Badge className="bg-amber-100 text-amber-900 border-amber-200">
                        Paid · ${(court.bookingAmountCents / 100).toFixed(2)}
                      </Badge>
                    )}
                    {court.guestFeeCents && (
                      <Badge className="bg-blue-100 text-blue-900 border-blue-200">
                        Guest fee · ${(court.guestFeeCents / 100).toFixed(2)}
                      </Badge>
                    )}
                    {isEditingThis && (
                      <Badge className="bg-green-100 text-green-800 border-green-200">Editing</Badge>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                    <span>Court #: <strong>{court.courtNumber}</strong></span>
                    <span>Type: <strong>{court.courtType}</strong></span>
                    <span>Surface: <strong>{court.surfaceType}</strong></span>
                    <span>{court.isIndoor ? 'Indoor' : 'Outdoor'}</span>
                    <span>{court.hasLights ? 'With Lights' : 'No Lights'}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleCourtConfig(court.id)}
                    disabled={editingCourt !== null}
                    className={configuringCourtId === court.id ? 'bg-green-100 border-green-300' : ''}
                    title="Schedule Settings"
                  >
                    <Clock className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleEditCourt(court)}
                    disabled={editingCourt !== null}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDeleteCourt(court.id)}
                    disabled={editingCourt !== null}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
            {isEditingThis && editingCourt && (
              <div
                ref={facilityCourtEditPanelRef}
                className="border-t border-green-200 px-6 pb-6 pt-4 bg-green-50 scroll-mt-6"
              >
                <h4 className="text-base font-semibold text-gray-900">Edit {court.name}</h4>
                <p className="text-sm text-gray-600 mt-1 mb-4">Configure court details and settings</p>
                <FacilityCourtFormBody
                  editingCourt={editingCourt}
                  setEditingCourt={setEditingCourt}
                  idPrefix={court.id}
                  courtSaving={courtSaving}
                  onSave={handleSaveCourt}
                  onCancel={handleCancelCourtEdit}
                  stripeOnboarded={stripeOnboarded}
                  stripeStatusLoading={stripeStatusLoading}
                />
              </div>
            )}
          </Card>

          {/* Court Schedule Config Panel */}
          {configuringCourtId === court.id && (
            <Card className="border-green-200 bg-green-50/50">
              <CardHeader>
                <CardTitle className="text-base">Operating Schedule — {court.name}</CardTitle>
                <CardDescription>Configure available and unavailable hours for each day</CardDescription>
              </CardHeader>
              <CardContent>
                {courtScheduleLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <CourtScheduleEditor
                      schedule={courtSchedule}
                      onUpdateDay={updateCourtScheduleDay}
                    />

                    <div className="flex flex-wrap gap-2 pt-4">
                      <Button onClick={saveCourtSchedule} disabled={courtScheduleSaving}>
                        <Save className="h-4 w-4 mr-2" />
                        {courtScheduleSaving ? 'Saving...' : 'Save Schedule'}
                      </Button>
                      <Button variant="outline" onClick={() => setConfiguringCourtId(null)}>
                        <X className="h-4 w-4 mr-2" />
                        Close
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </React.Fragment>
        );
      })}
    </div>
  )}

  {!courtsLoading && courts.length === 0 && (
    <Card>
      <CardContent className="p-12 text-center">
        <p className="text-gray-500">No courts configured. Click "Add New Court" to get started.</p>
      </CardContent>
    </Card>
  )}

  {/* Blackout Periods */}
  <Card>
    <CardHeader>
      <CardTitle className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <Clock className="h-5 w-5" />
          Blackout Periods
        </span>
        <Button size="sm" onClick={handleAddBlackout} disabled={!!editingBlackout}>
          <Plus className="h-4 w-4 mr-2" />
          Add Blackout
        </Button>
      </CardTitle>
      <CardDescription>Court closures for maintenance, events, or weather</CardDescription>
    </CardHeader>
    <CardContent>
      {editingBlackout && (
        <div className="p-4 mb-4 border rounded-lg bg-green-50 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Title</Label>
              <Input
                value={editingBlackout.title || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBlackout({ ...editingBlackout, title: e.target.value })}
                placeholder="e.g., Court Resurfacing"
              />
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select
                value={editingBlackout.blackoutType || 'maintenance'}
                onValueChange={(val: string) => setEditingBlackout({ ...editingBlackout, blackoutType: val })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="tournament">Tournament</SelectItem>
                  <SelectItem value="holiday">Holiday</SelectItem>
                  <SelectItem value="weather">Weather</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Court</Label>
              <Select
                value={editingBlackout.courtId || 'all'}
                onValueChange={(val: string) => setEditingBlackout({ ...editingBlackout, courtId: val === 'all' ? null : val })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Courts</SelectItem>
                  {courts.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={editingBlackout.description || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBlackout({ ...editingBlackout, description: e.target.value })}
                placeholder="Optional details"
              />
            </div>
            <div className="space-y-2">
              <Label>Start Date/Time</Label>
              <Input
                type="datetime-local"
                value={editingBlackout.startDatetime || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBlackout({ ...editingBlackout, startDatetime: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>End Date/Time</Label>
              <Input
                type="datetime-local"
                value={editingBlackout.endDatetime || ''}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEditingBlackout({ ...editingBlackout, endDatetime: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSaveBlackout} disabled={blackoutSaving}>
              <Save className="h-4 w-4 mr-2" />
              {blackoutSaving ? 'Saving...' : 'Save Blackout'}
            </Button>
            <Button variant="outline" onClick={() => { setEditingBlackout(null); setIsAddingBlackout(false); }}>
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
          </div>
        </div>
      )}

      {blackoutsLoading ? (
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
        </div>
      ) : blackouts.length === 0 && !editingBlackout ? (
        <p className="text-sm text-gray-500 text-center py-4">No blackout periods configured.</p>
      ) : (
        <div className="space-y-2">
          {blackouts.map((b: any) => (
            <div key={b.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{b.title || 'Untitled'}</span>
                  <Badge variant="outline">{b.blackout_type || 'maintenance'}</Badge>
                  {b.court_name && <Badge variant="secondary">{b.court_name}</Badge>}
                </div>
                <p className="text-sm text-gray-500">
                  {parseLocalDate(b.start_datetime).toLocaleString()} — {parseLocalDate(b.end_datetime).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingBlackout({
                  id: b.id,
                  courtId: b.court_id,
                  blackoutType: b.blackout_type,
                  title: b.title,
                  description: b.description,
                  startDatetime: toDatetimeLocalInput(b.start_datetime),
                  endDatetime: toDatetimeLocalInput(b.end_datetime),
                })}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDeleteBlackout(b.id)} className="text-red-600 hover:text-red-700">
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
</TabsContent>

  );
}
