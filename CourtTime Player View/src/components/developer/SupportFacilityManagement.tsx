import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { getFacilities, getFacility, updateFacility } from '../../api/supportClient';
import { toast } from 'sonner';

interface Props {
  selectedFacilityId: string | null;
  onSelectFacility: (id: string) => void;
}

export function SupportFacilityManagement({ selectedFacilityId, onSelectFacility }: Props) {
  const [facilities, setFacilities] = useState<any[]>([]);
  const [facility, setFacility] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<any>({});

  useEffect(() => {
    (async () => {
      const res = await getFacilities();
      if (res.success) setFacilities(res.data);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!selectedFacilityId) { setFacility(null); return; }
    (async () => {
      setLoading(true);
      const res = await getFacility(selectedFacilityId);
      if (res.success) {
        setFacility(res.data);
        setEditData(res.data);
      }
      setLoading(false);
    })();
  }, [selectedFacilityId]);

  const handleSave = async () => {
    if (!selectedFacilityId) return;
    setSaving(true);
    const res = await updateFacility(selectedFacilityId, {
      name: editData.name,
      type: editData.type,
      description: editData.description,
      street_address: editData.street_address,
      city: editData.city,
      state: editData.state,
      zip_code: editData.zip_code,
      phone: editData.phone,
      email: editData.email,
      status: editData.status,
    });
    if (res.success) {
      toast.success('Facility updated');
      setFacility(res.data);
    } else {
      toast.error(res.error || 'Failed to update');
    }
    setSaving(false);
  };

  const updateField = (field: string, value: any) => {
    setEditData((prev: any) => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Facility Management</h1>

      {/* Facility selector */}
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

      {loading && selectedFacilityId && (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
        </div>
      )}

      {!selectedFacilityId && !loading && (
        <p className="text-sm text-gray-400 text-center py-10">Select a facility to manage.</p>
      )}

      {facility && !loading && (
        <Tabs defaultValue="general" className="space-y-4">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList>
              <TabsTrigger value="general" className="px-4">General Info</TabsTrigger>
              <TabsTrigger value="contacts" className="px-4">Contacts</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="general">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Facility Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input value={editData.name || ''} onChange={(e) => updateField('name', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <Input value={editData.type || ''} onChange={(e) => updateField('type', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select value={editData.status || ''} onValueChange={(v) => updateField('status', v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="suspended">Suspended</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={editData.phone || ''} onChange={(e) => updateField('phone', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={editData.email || ''} onChange={(e) => updateField('email', e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Street Address</Label>
                  <Input value={editData.street_address || ''} onChange={(e) => updateField('street_address', e.target.value)} />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input value={editData.city || ''} onChange={(e) => updateField('city', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>State</Label>
                    <Input value={editData.state || ''} onChange={(e) => updateField('state', e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label>ZIP Code</Label>
                    <Input value={editData.zip_code || ''} onChange={(e) => updateField('zip_code', e.target.value)} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Description</Label>
                  <textarea
                    className="w-full min-h-[80px] rounded-md border border-input bg-input-background px-3 py-2 text-sm"
                    value={editData.description || ''}
                    onChange={(e) => updateField('description', e.target.value)}
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleSave} disabled={saving}>
                    {saving ? 'Saving...' : 'Save Changes'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contacts">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Facility Contacts</CardTitle>
              </CardHeader>
              <CardContent>
                {facility.contacts && facility.contacts.length > 0 ? (
                  <div className="space-y-3">
                    {facility.contacts.map((c: any, i: number) => (
                      <div key={i} className="p-3 bg-gray-50 rounded-lg text-sm">
                        <p className="font-medium">{c.contact_name || c.name || 'Contact'}</p>
                        {c.email && <p className="text-gray-500">{c.email}</p>}
                        {c.phone && <p className="text-gray-500">{c.phone}</p>}
                        {c.role && <p className="text-gray-500 text-xs capitalize">{c.role}</p>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400">No contacts on file.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
