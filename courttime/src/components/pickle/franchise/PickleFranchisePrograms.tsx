import React from 'react';
import { useParams } from 'react-router-dom';
import { PickleProgramBrowser } from '../programs/PickleProgramBrowser';

/** Renders program browser scoped to the franchise location route param. */
export function PickleFranchisePrograms() {
  const { facilityId } = useParams<{ facilityId: string }>();
  if (!facilityId) return null;
  return <PickleProgramBrowser />;
}
