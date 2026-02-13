import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Plus, Edit, Trash2, Save, X } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { useAuth } from '../../contexts/AuthContext';
import { facilitiesApi, adminApi } from '../../api/client';
import { toast } from 'sonner';

interface Court {
  id: string;
  name: string;
  courtNumber: number;
  courtType: string;
  surfaceType: string;
  isIndoor: boolean;
  hasLights: boolean;
  status: 'active' | 'maintenance' | 'inactive';
}

export function CourtManagement() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [courts, setCourts] = useState<Court[]>([]);
  const [editingCourt, setEditingCourt] = useState<Court | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const currentFacilityId = user?.memberFacilities?.[0];

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
        setCourts(response.data.courts);
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

  const handleAddNew = () => {
    setEditingCourt({
      id: '',
      name: '',
      courtNumber: courts.length + 1,
      courtType: 'Tennis',
      surfaceType: 'Hard Court',
      isIndoor: false,
      hasLights: false,
      status: 'active',
    });
    setIsAddingNew(true);
  };

  const handleEdit = (court: Court) => {
    setEditingCourt({ ...court });
    setIsAddingNew(false);
  };

  const handleSave = async () => {
    if (!editingCourt || !currentFacilityId) return;

    try {
      setSaving(true);
      const response = await adminApi.updateCourt(editingCourt.id, {
        name: editingCourt.name,
        courtNumber: editingCourt.courtNumber,
        surfaceType: editingCourt.surfaceType,
        courtType: editingCourt.courtType,
        isIndoor: editingCourt.isIndoor,
        hasLights: editingCourt.hasLights,
        status: editingCourt.status,
      });

      if (response.success) {
        toast.success('Court updated successfully');
        setEditingCourt(null);
        setIsAddingNew(false);
        await loadCourts();
      } else {
        toast.error(response.error || 'Failed to update court');
      }
    } catch (error: any) {
      console.error('Error saving court:', error);
      toast.error('Failed to update court');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditingCourt(null);
    setIsAddingNew(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this court?')) return;

    try {
      const response = await adminApi.updateCourt(id, { status: 'inactive' });
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

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'maintenance': return 'bg-yellow-100 text-yellow-800';
      case 'inactive': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatStatus = (status: string) => {
    return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
      <div className="p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-medium text-gray-900">Court Management</h1>
            <Button onClick={handleAddNew} disabled={editingCourt !== null || isAddingNew}>
              <Plus className="h-4 w-4 mr-2" />
              Add New Court
            </Button>
          </div>

          {/* Edit/Add Form */}
          {editingCourt && (
            <Card className="mb-6 border-blue-200 bg-blue-50">
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
                      placeholder="e.g., Court 1"
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
                  <div className="space-y-2">
                    <Label htmlFor="courtStatus">Status</Label>
                    <Select
                      value={editingCourt.status}
                      onValueChange={(value: 'active' | 'maintenance' | 'inactive') => setEditingCourt({ ...editingCourt, status: value })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                        <SelectItem value="inactive">Inactive</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
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
                    {saving ? 'Saving...' : 'Save Court'}
                  </Button>
                  <Button variant="outline" onClick={handleCancel} disabled={saving}>
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
              <Card key={court.id}>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
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
                    <div className="flex gap-2">
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
            ))}
          </div>

          {courts.length === 0 && (
            <Card>
              <CardContent className="p-12 text-center">
                <p className="text-gray-500">No courts configured. Click "Add New Court" to get started.</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
  );
}
