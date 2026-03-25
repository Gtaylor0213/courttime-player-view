import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { AlertCircle, ShieldAlert, X } from 'lucide-react';

interface RuleViolation {
  ruleCode: string;
  ruleName: string;
  message: string;
  severity: string;
}

interface RuleViolationDialogProps {
  open: boolean;
  onClose: () => void;
  violations: RuleViolation[];
}

export function RuleViolationDialog({ open, onClose, violations }: RuleViolationDialogProps) {
  if (violations.length === 0) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => { if (!isOpen) onClose(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
              <ShieldAlert className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <DialogTitle className="text-lg text-red-900">Booking Restricted</DialogTitle>
              <DialogDescription className="text-red-600">
                {violations.length === 1 ? 'A booking rule is preventing this reservation.' : `${violations.length} booking rules are preventing this reservation.`}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {violations.map((v, i) => (
            <div key={i} className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  {v.ruleName && (
                    <p className="text-sm font-semibold text-red-800 mb-1">{v.ruleName}</p>
                  )}
                  <p className="text-sm text-red-700">{v.message}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-end mt-4">
          <Button onClick={onClose} variant="outline">
            Got it
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
