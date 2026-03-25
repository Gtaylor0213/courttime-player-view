import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import { Switch } from '../ui/switch';
import { getFacilities, getFacility, updateFacility, getFacilityRules, updateFacilityRule } from '../../api/supportClient';
import { toast } from 'sonner';

interface Props {
  selectedFacilityId: string | null;
  onSelectFacility: (id: string | null) => void;
}

export function SupportFacilityManagement({ selectedFacilityId, onSelectFacility }: Props) {
  const [facilities, setFacilities] = useState<any[]>([]);
  const [facility, setFacility] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editData, setEditData] = useState<any>({});
  const [facilitySearch, setFacilitySearch] = useState('');
  const [rules, setRules] = useState<any[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const [ruleSaving, setRuleSaving] = useState<string | null>(null);

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

  const loadRules = async () => {
    if (!selectedFacilityId) return;
    setRulesLoading(true);
    const res = await getFacilityRules(selectedFacilityId);
    if (res.success && res.rules) {
      setRules(res.rules);
    }
    setRulesLoading(false);
  };

  const handleToggleRule = async (rule: any) => {
    if (!selectedFacilityId) return;
    setRuleSaving(rule.rule_code);
    const res = await updateFacilityRule(selectedFacilityId, rule.rule_code, {
      is_enabled: !rule.isEnabled,
      rule_config: rule.effectiveConfig || rule.default_config,
    });
    if (res.success) {
      toast.success(`${rule.rule_name} ${!rule.isEnabled ? 'enabled' : 'disabled'}`);
      await loadRules();
    } else {
      toast.error(res.error || 'Failed to update rule');
    }
    setRuleSaving(null);
  };

  const handleUpdateRuleConfig = async (rule: any, newConfig: any) => {
    if (!selectedFacilityId) return;
    setRuleSaving(rule.rule_code);
    const res = await updateFacilityRule(selectedFacilityId, rule.rule_code, {
      is_enabled: rule.isEnabled,
      rule_config: newConfig,
    });
    if (res.success) {
      toast.success(`${rule.rule_name} updated`);
      await loadRules();
    } else {
      toast.error(res.error || 'Failed to update rule');
    }
    setRuleSaving(null);
  };

  const rulesByCategory = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    for (const rule of rules) {
      const cat = rule.rule_category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(rule);
    }
    return grouped;
  }, [rules]);

  const categoryLabels: Record<string, string> = {
    account: 'Account Rules',
    court: 'Court Rules',
    household: 'Household Rules',
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-gray-900">Facility Management</h1>

      {/* Facility selector with search */}
      {!selectedFacilityId ? (
        <div className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search facilities by name or location..."
              value={facilitySearch}
              onChange={(e) => setFacilitySearch(e.target.value)}
              className="pl-9"
            />
          </div>
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {facilities
                .filter((f: any) => {
                  if (!facilitySearch.trim()) return true;
                  const q = facilitySearch.toLowerCase();
                  return (
                    f.name?.toLowerCase().includes(q) ||
                    f.city?.toLowerCase().includes(q) ||
                    f.state?.toLowerCase().includes(q) ||
                    f.id?.toLowerCase().includes(q)
                  );
                })
                .map((f: any) => (
                  <Card
                    key={f.id}
                    className="cursor-pointer hover:border-indigo-400 hover:shadow-sm transition-all"
                    onClick={() => { onSelectFacility(f.id); setFacilitySearch(''); }}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-sm">{f.name}</p>
                          {(f.city || f.state) && (
                            <p className="text-xs text-gray-500">{[f.city, f.state].filter(Boolean).join(', ')}</p>
                          )}
                        </div>
                        <Badge variant={f.status === 'active' ? 'default' : 'secondary'} className="text-xs ml-2">
                          {f.status || 'active'}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              {facilitySearch.trim() && facilities.filter((f: any) => {
                const q = facilitySearch.toLowerCase();
                return f.name?.toLowerCase().includes(q) || f.city?.toLowerCase().includes(q) || f.state?.toLowerCase().includes(q) || f.id?.toLowerCase().includes(q);
              }).length === 0 && (
                <p className="text-sm text-gray-400 col-span-full text-center py-6">No facilities match "{facilitySearch}"</p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-sm py-1 px-3">
            {facility?.name || selectedFacilityId}
          </Badge>
          <Button variant="ghost" size="sm" onClick={() => { onSelectFacility(null); setFacility(null); }}>
            <X className="h-4 w-4 mr-1" /> Change
          </Button>
        </div>
      )}

      {loading && selectedFacilityId && (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
        </div>
      )}

      {facility && !loading && (
        <Tabs defaultValue="general" className="space-y-4">
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList>
              <TabsTrigger value="general" className="px-4">General Info</TabsTrigger>
              <TabsTrigger value="contacts" className="px-4">Contacts</TabsTrigger>
              <TabsTrigger value="rules" className="px-4" onClick={() => { if (rules.length === 0) loadRules(); }}>Rules</TabsTrigger>
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

          <TabsContent value="rules">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Booking Rules Configuration</CardTitle>
              </CardHeader>
              <CardContent>
                {rulesLoading ? (
                  <div className="flex justify-center py-10">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                  </div>
                ) : rules.length === 0 ? (
                  <p className="text-sm text-gray-400">No rules configured. Click the tab to load.</p>
                ) : (
                  <div className="space-y-6">
                    {Object.entries(rulesByCategory).map(([category, catRules]) => (
                      <div key={category}>
                        <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide">
                          {categoryLabels[category] || category}
                        </h3>
                        <div className="space-y-2">
                          {catRules.map((rule: any) => (
                            <div key={rule.rule_code} className="border rounded-lg">
                              <div className="flex items-center justify-between p-3">
                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                  <Switch
                                    checked={rule.isEnabled}
                                    onCheckedChange={() => handleToggleRule(rule)}
                                    disabled={ruleSaving === rule.rule_code}
                                  />
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs font-mono text-gray-400">{rule.rule_code}</span>
                                      <span className="text-sm font-medium truncate">{rule.rule_name}</span>
                                    </div>
                                    <p className="text-xs text-gray-500 truncate">{rule.description}</p>
                                  </div>
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setExpandedRule(expandedRule === rule.rule_code ? null : rule.rule_code)}
                                >
                                  {expandedRule === rule.rule_code ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </Button>
                              </div>

                              {expandedRule === rule.rule_code && (
                                <div className="px-3 pb-3 border-t pt-3">
                                  <div className="space-y-3">
                                    <div>
                                      <Label className="text-xs text-gray-500">Configuration</Label>
                                      <textarea
                                        className="w-full mt-1 min-h-[100px] rounded-md border border-input bg-input-background px-3 py-2 text-xs font-mono"
                                        value={JSON.stringify(rule.effectiveConfig || rule.default_config, null, 2)}
                                        onChange={(e) => {
                                          try {
                                            const parsed = JSON.parse(e.target.value);
                                            // Update local state for editing
                                            setRules(prev => prev.map(r =>
                                              r.rule_code === rule.rule_code
                                                ? { ...r, effective_config: parsed }
                                                : r
                                            ));
                                          } catch {
                                            // Invalid JSON, just update the text
                                          }
                                        }}
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        size="sm"
                                        onClick={() => handleUpdateRuleConfig(rule, rule.effectiveConfig || rule.default_config)}
                                        disabled={ruleSaving === rule.rule_code}
                                      >
                                        {ruleSaving === rule.rule_code ? 'Saving...' : 'Save Config'}
                                      </Button>
                                      <span className="text-xs text-gray-400">
                                        {rule.facilityConfig ? 'Custom config' : 'Using defaults'}
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
