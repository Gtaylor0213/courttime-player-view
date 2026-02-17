import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Plus, Edit, Trash2, Save, X, Settings, Layers, CheckSquare } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Checkbox } from '../ui/checkbox';
import { useAuth } from '../../contexts/AuthContext';
import { useAppContext } from '../../contexts/AppContext';
import { facilitiesApi, adminApi, courtConfigApi } from '../../api/client';
import { toast } from 'sonner';

interface Court {
  id: string;
  name: string;
  courtNumber: number;
  courtType: string;
  surfaceType: string;
  isIndoor: boolean;
  hasLights: boolean;
  status: 'available' | 'maintenance' | 'closed';
}

interface BulkAddForm {
  count: number;
  startingNumber: number;
  courtType: string;
  surfaceType: string;
  isIndoor: boolean;
  hasLights: boolean;
}

interface BulkEditForm {
  courtType: string;
  surfaceType: string;
  status: string;
  isIndoor: string; // 'true' | 'false' | '' (unchanged)
  hasLights: string;
}

export function CourtManagement() {
  const { user } = useAuth();
  const { selectedFacilityId: currentFacilityId } = useAppContext();
  const navigate = useNavigate();
  const [courts, setCourts] = useState<Court[]>([]);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Bulk add state
  const [bulkAddMode, setBulkAddMode] = useState(false);
  const [bulkAddForm, setBulkAddForm] = useState<BulkAddForm>({
    count: 4,
    startingNumber: 1,
    courtType: 'Tennis',
    surfaceType: 'Hard Court',
    isIndoor: false,
    hasLights: false,
  });
  const [bulkAdding, setBulkAdding] = useState(false);

  // Bulk edit state
  const [selectedCourts, setSelectedCourts] = useState<Set<string>>(new Set());
  const [bulkEditForm, setBulkEditForm] = useState<BulkEditForm>({
    courtType: '',
    surfaceType: '',
    status: '',
    isIndoor: '',
    hasLights: '',
  });
  const [bulkEditing, setBulkEditing] = useState(false);

  // Court schedule config state
  const [configuringCourtId, setConfiguringCourtId] = useState<string | null>(null);
  const [courtSchedule, setCourtSchedule] = useState<any[]>([]);
  const [courtScheduleLoading, setCourtScheduleLoading] = useState(false);
  const [courtScheduleSaving, setCourtScheduleSaving] = useState(false);

  useEffect(() => {
    if (currentFacilityId) {
      loadCourts();
    }
  }, [currentFacilityId]);

  const loadCourts = async () => {
    if (!currentFacilityId) {
      toast.error('No facility selected');
      return;
    }

    try {
      setLoading(true);
      const response = await facilitiesApi.getCourts(currentFacilityId);

      if (response.success && response.data?.courts) {
        // Normalize legacy status values to match DB constraint
        const normalized = response.data.courts.map((c: any) => ({
          ...c,
          status: c.status === 'active' ? 'available' : c.status === 'inactive' ? 'closed' : c.status,
        }));
        setCourts(normalized);
      } else {
        toast.error(response.error || 'Failed to load courts');
      }
    } catch (error: any) {
      console.error('Error loading courts:', error);
      toast.error('Failed to load courts');
    } finally {
      setLoading(false);
    }
  };

  // --- Single Add/Edit ---

  const handleAddNew = () => {
    const maxNumber = courts.length > 0 ? Math.max(...courts.map(c => c.courtNumber)) : 0;
    setEditingCourt({
      id: '',
      name: '',
      courtNumber: maxNumber + 1,
      courtType: 'Tennis',
      surfaceType: 'Hard Court',
      isIndoor: false,
      hasLights: false,
      status: 'available',
    });
    setIsAddingNew(true);
    setBulkAddMode(false);
  };

  const handleEdit = (court: Court) => {
    setEditingCourt({ ...court });
    setIsAddingNew(false);
  };

  const handleSave = async () => {
    if (!editingCourt || !currentFacilityId) return;

    try {
      setSaving(true);

      let response;
      if (isAddingNew) {
        // Create new court
        response = await adminApi.createCourt(currentFacilityId, {
          name: editingCourt.name || `Court ${editingCourt.courtNumber}`,
          courtNumber: editingCourt.courtNumber,
          surfaceType: editingCourt.surfaceType,
          courtType: editingCourt.courtType,
          isIndoor: editingCourt.isIndoor,
          hasLights: editingCourt.hasLights,
        });
      } else {
        // Update existing court
        response = await adminApi.updateCourt(editingCourt.id, {
          name: editingCourt.name,
          courtNumber: editingCourt.courtNumber,
          surfaceType: editingCourt.surfaceType,
          courtType: editingCourt.courtType,
          isIndoor: editingCourt.isIndoor,
          hasLights: editingCourt.hasLights,
          status: editingCourt.status,
        });
      }

      if (response.success) {
        toast.success(isAddingNew ? 'Court created successfully' : 'Court updated successfully');
        setEditingCourt(null);
        setIsAddingNew(false);
        await loadCourts();
      } else {
        toast.error(response.error || 'Failed to save court');
      }
    } catch (error: any) {
      console.error('Error saving court:', error);
      toast.error('Failed to save court');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingCourt(null);
    setIsAddingNew(false);
    setBulkAddMode(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this court?')) return;

    try {
      const response = await adminApi.updateCourt(id, { status: 'closed' });
      if (response.success) {
        toast.success('Court deactivated successfully');
        await loadCourts();
      } else {
        toast.error(response.error || 'Failed to deactivate court');
      }
    } catch (error: any) {
      console.error('Error deactivating court:', error);
      toast.error('Failed to deactivate court');
    }
  };

  // --- Bulk Add ---

  const handleBulkAddToggle = () => {
    setBulkAddMode(true);
    setEditingCourt(null);
    setIsAddingNew(false);
    const maxNumber = courts.length > 0 ? Math.max(...courts.map(c => c.courtNumber)) : 0;
    setBulkAddForm(prev => ({ ...prev, startingNumber: maxNumber + 1 }));
  };

  const handleBulkAdd = async () => {
    if (!currentFacilityId) return;

    try {
      setBulkAdding(true);
      const response = await adminApi.createCourtsBulk(currentFacilityId, {
        count: bulkAddForm.count,
        startingNumber: bulkAddForm.startingNumber,
        surfaceType: bulkAddForm.surfaceType,
        courtType: bulkAddForm.courtType,
        isIndoor: bulkAddForm.isIndoor,
        hasLights: bulkAddForm.hasLights,
      });

      if (response.success) {
        toast.success(`${bulkAddForm.count} courts created successfully`);
        setBulkAddMode(false);
        await loadCourts();
      } else {
        toast.error(response.error || 'Failed to create courts');
      }
    } catch (error: any) {
      console.error('Error bulk creating courts:', error);
      toast.error('Failed to create courts');
    } finally {
      setBulkAdding(false);
    }
  };

  // --- Bulk Edit / Selection ---

  const toggleCourtSelection = (courtId: string) => {
    setSelectedCourts(prev => {
      const next = new Set(prev);
      if (next.has(courtId)) {
        next.delete(courtId);
      } else {
        next.add(courtId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCourts.size === courts.length) {
      setSelectedCourts(new Set());
    } else {
      setSelectedCourts(new Set(courts.map(c => c.id)));
    }
  };

  const handleBulkEdit = async () => {
    if (selectedCourts.size === 0) return;

    const updates: Record<string, any> = {};
    if (bulkEditForm.courtType) updates.courtType = bulkEditForm.courtType;
    if (bulkEditForm.surfaceType) updates.surfaceType = bulkEditForm.surfaceType;
    if (bulkEditForm.status) updates.status = bulkEditForm.status;
    if (bulkEditForm.isIndoor) updates.isIndoor = bulkEditForm.isIndoor === 'true';
    if (bulkEditForm.hasLights) updates.hasLights = bulkEditForm.hasLights === 'true';

    if (Object.keys(updates).length === 0) {
      toast.error('Select at least one property to change');
      return;
    }

    try {
      setBulkEditing(true);
      const response = await adminApi.bulkUpdateCourts(
        Array.from(selectedCourts),
        updates
      );

      if (response.success) {
        toast.success(`${selectedCourts.size} courts updated successfully`);
        setSelectedCourts(new Set());
        setBulkEditForm({ courtType: '', surfaceType: '', status: '', isIndoor: '', hasLights: '' });
        await loadCourts();
      } else {
        toast.error(response.error || 'Failed to update courts');
      }
    } catch (error: any) {
      console.error('Error bulk updating courts:', error);
      toast.error('Failed to update courts');
    } finally {
      setBulkEditing(false);
    }
  };

  const cancelBulkEdit = () => {
    setSelectedCourts(new Set());
    setBulkEditForm({ courtType: '', surfaceType: '', status: '', isIndoor: '', hasLights: '' });
  };

  // --- Court Schedule Config ---

  const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const loadCourtSchedule = async (courtId: string) => {
    try {
      setCourtScheduleLoading(true);
      const response = await courtConfigApi.getSchedule(courtId);
      if (response.success && response.data?.schedule) {
        setCourtSchedule(response.data.schedule);
      }
    } catch (error) {
      console.error('Error loading court schedule:', error);
      toast.error('Failed to load court schedule');
    } finally {
      setCourtScheduleLoading(false);
    }
  };

  const handleToggleCourtConfig = async (courtId: string) => {
    if (configuringCourtId === courtId) {
      setConfiguringCourtId(null);
      setCourtSchedule([]);
      return;
    }
    setConfiguringCourtId(courtId);
    await loadCourtSchedule(courtId);
  };

  const updateCourtScheduleDay = (dayOfWeek: number, field: string, value: any) => {
    setCourtSchedule(prev => prev.map(day =>
      day.day_of_week === dayOfWeek ? { ...day, [field]: value } : day
    ));
  };

  const updateAllScheduleDays = (field: string, value: any) => {
    setCourtSchedule(prev => prev.map(day => ({ ...day, [field]: value })));
  };

  const saveCourtSchedule = async () => {
    if (!configuringCourtId) return;
    try {
      setCourtScheduleSaving(true);
      const response = await courtConfigApi.updateSchedule(configuringCourtId, courtSchedule);
      if (response.success) {
        toast.success('Court schedule saved');
      } else {
        toast.error(response.error || 'Failed to save schedule');
      }
    } catch (error) {
      console.error('Error saving court schedule:', error);
      toast.error('Failed to save court schedule');
    } finally {
      setCourtScheduleSaving(false);
    }
  };

  // --- Helpers ---

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'available': return 'bg-green-100 text-green-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'closed': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  const isFormOpen = editingCourt !== null || bulkAddMode;

  return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div>
              <h1 className="text-2xl font-medium text-gray-900">Court Management</h1>
              {selectedCourts.size > 0 && (
                <p className="text-sm text-green-600 mt-1">{selectedCourts.size} court{selectedCourts.size !== 1 ? 's' : ''} selected</p>
              )}
            </div>
            <div className="flex gap-2">
              {courts.length > 0 && (
                <Button
                  variant="outline"
                  onClick={toggleSelectAll}
                  disabled={isFormOpen}
                >
                  <CheckSquare className="h-4 w-4 mr-2" />
                  {selectedCourts.size === courts.length ? 'Deselect All' : 'Select All'}
                </Button>
              )}
              <Button variant="outline" onClick={handleBulkAddToggle} disabled={isFormOpen}>
                <Layers className="h-4 w-4 mr-2" />
                Bulk Add
              </Button>
              <Button onClick={handleAddNew} disabled={isFormOpen}>
                <Plus className="h-4 w-4 mr-2" />
                Add Court
              </Button>
            </div>
          </div>

          {/* Single Add/Edit Form */}
          {editingCourt && (
            <Card className="mb-6 border-green-200 bg-green-50">
              <CardHeader>
                <CardTitle>{isAddingNew ? 'Add New Court' : `Edit ${editingCourt.name}`}</CardTitle>
                <CardDescription>Configure court details and settings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="courtName">Court Name</Label>
                    <Input
                      id="courtName"
                      value={editingCourt.name}
                      onChange={(e) => setEditingCourt({ ...editingCourt, name: e.target.value })}
                      placeholder={`Court ${editingCourt.courtNumber}`}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="courtNumber">Court Number</Label>
                    <Input
                      id="courtNumber"
                      type="number"
                      value={editingCourt.courtNumber}
                      onChange={(e) => setEditingCourt({ ...editingCourt, courtNumber: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="courtType">Court Type</Label>
                    <Select
                      value={editingCourt.courtType}
                      onValueChange={(value) => setEditingCourt({ ...editingCourt, courtType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Tennis">Tennis</SelectItem>
                        <SelectItem value="Pickleball">Pickleball</SelectItem>
                        <SelectItem value="Dual Purpose">Dual Purpose</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="courtSurface">Surface Type</Label>
                    <Select
                      value={editingCourt.surfaceType}
                      onValueChange={(value) => setEditingCourt({ ...editingCourt, surfaceType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Hard Court">Hard Court</SelectItem>
                        <SelectItem value="Clay Court">Clay Court</SelectItem>
                        <SelectItem value="Grass Court">Grass Court</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {!isAddingNew && (
                    <div className="space-y-2">
                      <Label htmlFor="courtStatus">Status</Label>
                      <Select
                        value={editingCourt.status}
                        onValueChange={(value: 'available' | 'maintenance' | 'closed') => setEditingCourt({ ...editingCourt, status: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="available">Available</SelectItem>
                          <SelectItem value="maintenance">Maintenance</SelectItem>
                          <SelectItem value="closed">Closed</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="indoor"
                      checked={editingCourt.isIndoor}
                      onCheckedChange={(checked) => setEditingCourt({ ...editingCourt, isIndoor: checked })}
                    />
                    <Label htmlFor="indoor">Indoor Court</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="lights"
                      checked={editingCourt.hasLights}
                      onCheckedChange={(checked) => setEditingCourt({ ...editingCourt, hasLights: checked })}
                    />
                    <Label htmlFor="lights">Has Lights</Label>
                  </div>
                </div>
                <div className="flex gap-2 mt-6">
                  <Button onClick={handleSave} disabled={saving}>
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : (isAddingNew ? 'Create Court' : 'Save Court')}
                  </Button>
                  <Button variant="outline" onClick={handleCancel} disabled={saving}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bulk Add Form */}
          {bulkAddMode && (
            <Card className="mb-6 border-blue-200 bg-blue-50">
              <CardHeader>
                <CardTitle>Bulk Add Courts</CardTitle>
                <CardDescription>Create multiple courts with shared properties</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="bulkCount">Number of Courts</Label>
                    <Input
                      id="bulkCount"
                      type="number"
                      min={1}
                      max={50}
                      value={bulkAddForm.count}
                      onChange={(e) => setBulkAddForm({ ...bulkAddForm, count: Math.max(1, Math.min(50, parseInt(e.target.value) || 1)) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startingNumber">Starting Number</Label>
                    <Input
                      id="startingNumber"
                      type="number"
                      min={1}
                      value={bulkAddForm.startingNumber}
                      onChange={(e) => setBulkAddForm({ ...bulkAddForm, startingNumber: parseInt(e.target.value) || 1 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bulkCourtType">Court Type</Label>
                    <Select
                      value={bulkAddForm.courtType}
                      onValueChange={(value) => setBulkAddForm({ ...bulkAddForm, courtType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Tennis">Tennis</SelectItem>
                        <SelectItem value="Pickleball">Pickleball</SelectItem>
                        <SelectItem value="Dual Purpose">Dual Purpose</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bulkSurfaceType">Surface Type</Label>
                    <Select
                      value={bulkAddForm.surfaceType}
                      onValueChange={(value) => setBulkAddForm({ ...bulkAddForm, surfaceType: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Hard Court">Hard Court</SelectItem>
                        <SelectItem value="Clay Court">Clay Court</SelectItem>
                        <SelectItem value="Grass Court">Grass Court</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center space-x-2 pt-6">
                    <Switch
                      id="bulkIndoor"
                      checked={bulkAddForm.isIndoor}
                      onCheckedChange={(checked) => setBulkAddForm({ ...bulkAddForm, isIndoor: checked })}
                    />
                    <Label htmlFor="bulkIndoor">Indoor</Label>
                  </div>
                  <div className="flex items-center space-x-2 pt-6">
                    <Switch
                      id="bulkLights"
                      checked={bulkAddForm.hasLights}
                      onCheckedChange={(checked) => setBulkAddForm({ ...bulkAddForm, hasLights: checked })}
                    />
                    <Label htmlFor="bulkLights">Has Lights</Label>
                  </div>
                </div>
                <p className="text-sm text-gray-500 mt-3">
                  This will create Court {bulkAddForm.startingNumber} through Court {bulkAddForm.startingNumber + bulkAddForm.count - 1}.
                </p>
                <div className="flex gap-2 mt-4">
                  <Button onClick={handleBulkAdd} disabled={bulkAdding}>
                    <Layers className="h-4 w-4 mr-2" />
                    {bulkAdding ? 'Creating...' : `Create ${bulkAddForm.count} Courts`}
                  </Button>
                  <Button variant="outline" onClick={handleCancel} disabled={bulkAdding}>
                    <X className="h-4 w-4 mr-2" />
                    Cancel
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Courts List */}
          <div className="grid grid-cols-1 gap-4">
            {courts.map((court) => (
              <React.Fragment key={court.id}>
                <Card className={selectedCourts.has(court.id) ? 'ring-2 ring-green-400 bg-green-50/30' : ''}>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 flex-1">
                        <Checkbox
                          checked={selectedCourts.has(court.id)}
                          onCheckedChange={() => toggleCourtSelection(court.id)}
                          className="h-5 w-5"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-semibold">{court.name}</h3>
                            <Badge className={getStatusColor(court.status)}>{formatStatus(court.status)}</Badge>
                          </div>
                          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                            <span>Court #: <strong>{court.courtNumber}</strong></span>
                            <span>Type: <strong>{court.courtType}</strong></span>
                            <span>Surface: <strong>{court.surfaceType}</strong></span>
                            <span>{court.isIndoor ? 'Indoor' : 'Outdoor'}</span>
                            <span>{court.hasLights ? 'With Lights' : 'No Lights'}</span>
                          </div>
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
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleEdit(court)}
                          disabled={editingCourt !== null}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(court.id)}
                          disabled={editingCourt !== null}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Court Schedule Config Panel */}
                {configuringCourtId === court.id && (
                  <Card className="border-green-200 bg-green-50/50">
                    <CardHeader>
                      <CardTitle className="text-base">Operating Schedule — {court.name}</CardTitle>
                      <CardDescription>Configure hours, prime time, and slot settings per day</CardDescription>
                    </CardHeader>
                    <CardContent>
                      {courtScheduleLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-green-600"></div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b">
                                  <th className="text-left p-2">Day</th>
                                  <th className="text-center p-2">Open</th>
                                  <th className="text-center p-2">Open Time</th>
                                  <th className="text-center p-2">Close Time</th>
                                  <th className="text-center p-2">Prime Start</th>
                                  <th className="text-center p-2">Prime End</th>
                                </tr>
                              </thead>
                              <tbody>
                                {courtSchedule.map((day: any) => (
                                  <tr key={day.day_of_week} className="border-b">
                                    <td className="p-2 font-medium">{DAY_NAMES[day.day_of_week]}</td>
                                    <td className="p-2 text-center">
                                      <Switch
                                        checked={day.is_open}
                                        onCheckedChange={(checked: boolean) => updateCourtScheduleDay(day.day_of_week, 'is_open', checked)}
                                      />
                                    </td>
                                    <td className="p-2">
                                      <Input
                                        type="time"
                                        value={day.open_time || '06:00'}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCourtScheduleDay(day.day_of_week, 'open_time', e.target.value)}
                                        disabled={!day.is_open}
                                        className="w-28"
                                      />
                                    </td>
                                    <td className="p-2">
                                      <Input
                                        type="time"
                                        value={day.close_time || '22:00'}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCourtScheduleDay(day.day_of_week, 'close_time', e.target.value)}
                                        disabled={!day.is_open}
                                        className="w-28"
                                      />
                                    </td>
                                    <td className="p-2">
                                      <Input
                                        type="time"
                                        value={day.prime_time_start || ''}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCourtScheduleDay(day.day_of_week, 'prime_time_start', e.target.value || null)}
                                        disabled={!day.is_open}
                                        className="w-28"
                                      />
                                    </td>
                                    <td className="p-2">
                                      <Input
                                        type="time"
                                        value={day.prime_time_end || ''}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateCourtScheduleDay(day.day_of_week, 'prime_time_end', e.target.value || null)}
                                        disabled={!day.is_open}
                                        className="w-28"
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 border-t">
                            <div className="space-y-1">
                              <Label className="text-sm">Slot Duration (min)</Label>
                              <Select
                                value={String(courtSchedule[0]?.slot_duration || 30)}
                                onValueChange={(val: string) => updateAllScheduleDays('slot_duration', parseInt(val))}
                              >
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="15">15 min</SelectItem>
                                  <SelectItem value="30">30 min</SelectItem>
                                  <SelectItem value="60">60 min</SelectItem>
                                  <SelectItem value="90">90 min</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-sm">Buffer Before (min)</Label>
                              <Input
                                type="number"
                                value={courtSchedule[0]?.buffer_before || 0}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAllScheduleDays('buffer_before', parseInt(e.target.value) || 0)}
                                min="0"
                                max="30"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-sm">Buffer After (min)</Label>
                              <Input
                                type="number"
                                value={courtSchedule[0]?.buffer_after || 0}
                                onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateAllScheduleDays('buffer_after', parseInt(e.target.value) || 0)}
                                min="0"
                                max="30"
                              />
                            </div>
                          </div>

                          <div className="flex gap-2 pt-4">
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
            ))}
          </div>

          {courts.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-gray-500">No courts configured. Click "Add Court" or "Bulk Add" to get started.</p>
              </CardContent>
            </Card>
          )}

          {/* Floating Bulk Edit Bar */}
          {selectedCourts.size > 0 && (
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-50 p-4">
              <div className="max-w-7xl mx-auto">
                <div className="flex items-center gap-4 flex-wrap">
                  <span className="font-medium text-sm whitespace-nowrap">
                    {selectedCourts.size} court{selectedCourts.size !== 1 ? 's' : ''} selected
                  </span>
                  <div className="flex items-center gap-3 flex-wrap flex-1">
                    <Select value={bulkEditForm.courtType} onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, courtType: v })}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Court Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Tennis">Tennis</SelectItem>
                        <SelectItem value="Pickleball">Pickleball</SelectItem>
                        <SelectItem value="Dual Purpose">Dual Purpose</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={bulkEditForm.surfaceType} onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, surfaceType: v })}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue placeholder="Surface" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Hard Court">Hard Court</SelectItem>
                        <SelectItem value="Clay Court">Clay Court</SelectItem>
                        <SelectItem value="Grass Court">Grass Court</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={bulkEditForm.status} onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, status: v })}>
                      <SelectTrigger className="w-[130px]">
                        <SelectValue placeholder="Status" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="available">Available</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={bulkEditForm.isIndoor} onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, isIndoor: v })}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Indoor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Indoor</SelectItem>
                        <SelectItem value="false">Outdoor</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={bulkEditForm.hasLights} onValueChange={(v) => setBulkEditForm({ ...bulkEditForm, hasLights: v })}>
                      <SelectTrigger className="w-[120px]">
                        <SelectValue placeholder="Lights" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Has Lights</SelectItem>
                        <SelectItem value="false">No Lights</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={handleBulkEdit} disabled={bulkEditing}>
                      <Save className="h-4 w-4 mr-2" />
                      {bulkEditing ? 'Applying...' : 'Apply Changes'}
                    </Button>
                    <Button variant="outline" onClick={cancelBulkEdit} disabled={bulkEditing}>
                      <X className="h-4 w-4 mr-2" />
                      Cancel
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
  );
}
