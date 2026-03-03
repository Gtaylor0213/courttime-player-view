import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Input } from '../ui/input';
import { getFacilities, getFacilityCourts, updateCourt } from '../../api/supportClient';
import { toast } from 'sonner';

interface Props {
  selectedFacilityId: string | null;
  onSelectFacility: (id: string) => void;
}

export function SupportCourtManagement({ selectedFacilityId, onSelectFacility }: Props) {
  const [facilities, setFacilities] = useState<any[]>([]);
  const [courts, setCourts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editCourt, setEditCourt] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await getFacilities();
      if (res.success) setFacilities(res.data);
    })();
  }, []);

  const loadCourts = async () => {
    if (!selectedFacilityId) return;
    setLoading(true);
    const res = await getFacilityCourts(selectedFacilityId);
    if (res.success) setCourts(res.data);
    setLoading(false);
  };

  useEffect(() => { loadCourts(); }, [selectedFacilityId]);

  const handleSave = async () => {
    if (!editCourt) return;
    setSaving(true);
    const res = await updateCourt(editCourt.id, {
      name: editCourt.name,
      status: editCourt.status,
      type: editCourt.type,
      surface_type: editCourt.surface_type,
      is_indoor: editCourt.is_indoor,
      has_lights: editCourt.has_lights,
    });
    if (res.success) {
      toast.success('Court updated');
      setEditCourt(null);
      loadCourts();
    } else {
      toast.error(res.error || 'Failed to update');
    }
    setSaving(false);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available': return 'bg-green-100 text-green-700';
      case 'maintenance': return 'bg-yellow-100 text-yellow-700';
      case 'closed': return 'bg-red-100 text-red-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Court Management</h1>

      <Select value={selectedFacilityId || ''} onValueChange={onSelectFacility}>
        <SelectTrigger className="w-full max-w-xs">
          <SelectValue placeholder="Select a facility..." />
        </SelectTrigger>
        <SelectContent>
          {facilities.map((f: any) => (
            <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!selectedFacilityId && (
        <p className="text-sm text-gray-400 text-center py-10">Select a facility to view courts.</p>
      )}

      {loading && (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
        </div>
      )}

      {selectedFacilityId && !loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {courts.map((court: any) => (
            <Card key={court.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-sm">{court.name}</h3>
                  <Badge className={`text-xs ${getStatusColor(court.status)}`}>{court.status}</Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                  <div>
                    <span className="text-gray-400">Type: </span>
                    <span className="capitalize">{court.type}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Surface: </span>
                    <span>{court.surface_type || '—'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Indoor: </span>
                    <span>{court.is_indoor ? 'Yes' : 'No'}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Lights: </span>
                    <span>{court.has_lights ? 'Yes' : 'No'}</span>
                  </div>
                </div>
                <Button variant="outline" size="sm" className="w-full" onClick={() => setEditCourt({ ...court })}>
                  Edit Court
                </Button>
              </CardContent>
            </Card>
          ))}
          {courts.length === 0 && (
            <p className="text-sm text-gray-400 col-span-full text-center py-10">No courts found.</p>
          )}
        </div>
      )}

      {/* Edit Court Dialog */}
      <Dialog open={!!editCourt} onOpenChange={() => setEditCourt(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Court</DialogTitle>
          </DialogHeader>
          {editCourt && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={editCourt.name} onChange={(e) => setEditCourt({ ...editCourt, name: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={editCourt.status} onValueChange={(v) => setEditCourt({ ...editCourt, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="available">Available</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={editCourt.type} onValueChange={(v) => setEditCourt({ ...editCourt, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tennis">Tennis</SelectItem>
                    <SelectItem value="pickleball">Pickleball</SelectItem>
                    <SelectItem value="dual purpose">Dual Purpose</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Surface Type</Label>
                <Select value={editCourt.surface_type || ''} onValueChange={(v) => setEditCourt({ ...editCourt, surface_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Hard Court">Hard Court</SelectItem>
                    <SelectItem value="Clay Court">Clay Court</SelectItem>
                    <SelectItem value="Grass Court">Grass Court</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between">
                <Label>Indoor</Label>
                <Switch checked={editCourt.is_indoor} onCheckedChange={(v) => setEditCourt({ ...editCourt, is_indoor: v })} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Has Lights</Label>
                <Switch checked={editCourt.has_lights} onCheckedChange={(v) => setEditCourt({ ...editCourt, has_lights: v })} />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditCourt(null)}>Cancel</Button>
                <Button onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
