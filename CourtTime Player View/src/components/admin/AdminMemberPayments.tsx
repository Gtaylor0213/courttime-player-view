import React from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { useAppContext } from '../../contexts/AppContext';
import { PaymentsTab } from './PaymentsTab';

export function AdminMemberPayments() {
  const { selectedFacilityId: currentFacilityId } = useAppContext();

  if (!currentFacilityId) {
    return (
      <div className="flex items-center justify-center h-64 p-4 md:p-8">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>No Facility Selected</CardTitle>
            <CardDescription>
              Select a facility to manage member payments.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-green-800">Member Payments</h1>
        <PaymentsTab clubId={currentFacilityId} />
      </div>
    </div>
  );
}
