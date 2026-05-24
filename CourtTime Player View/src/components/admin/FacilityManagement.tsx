import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { BillingTab } from './BillingTab';
import { useFacilityManagement } from './facility-management/useFacilityManagement';
import { FacilityDetailsTab } from './facility-management/FacilityDetailsTab';
import { FacilityRulesTab } from './facility-management/FacilityRulesTab';
import { FacilityCourtsTab } from './facility-management/FacilityCourtsTab';

export function FacilityManagement() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const initialTab = tabParam === 'payments' ? 'details' : tabParam || 'details';
  const [activeTab, setActiveTab] = useState(initialTab);

  useEffect(() => {
    if (tabParam !== 'payments') return;
    const next = new URLSearchParams(searchParams);
    next.delete('tab');
    const query = next.toString();
    navigate(`/admin/member-payments${query ? `?${query}` : ''}`, { replace: true });
  }, [tabParam, searchParams, navigate]);

  const fm = useFacilityManagement(activeTab);

  if (fm.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <h1 className="text-2xl font-bold text-green-800 shrink-0">Facility Management</h1>
            <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
              <TabsList>
                <TabsTrigger value="details" className="px-4">Facility Details</TabsTrigger>
                <TabsTrigger value="rules" className="px-4">Booking Rules</TabsTrigger>
                <TabsTrigger value="courts" className="px-4">Court Management</TabsTrigger>
                <TabsTrigger value="billing" className="px-4">Subscription</TabsTrigger>
              </TabsList>
            </div>
          </div>

          <FacilityDetailsTab {...fm} />
          <FacilityRulesTab {...fm} />
          <FacilityCourtsTab {...fm} />
          <TabsContent value="billing" className="space-y-6">
            {fm.currentFacilityId && <BillingTab facilityId={fm.currentFacilityId} />}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
