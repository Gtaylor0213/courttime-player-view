import React from 'react';
import { Switch } from './ui/switch';
import { Label } from './ui/label';
import { User, Shield } from 'lucide-react';

interface ViewSwitcherProps {
  viewMode: 'player' | 'admin';
  onViewModeChange: (mode: 'player' | 'admin') => void;
}

export function ViewSwitcher({ viewMode, onViewModeChange }: ViewSwitcherProps) {
  return (
    <div className="fixed top-4 right-4 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-gray-600" />
          <Label htmlFor="view-mode" className="text-sm font-medium cursor-pointer">
            Player View
          </Label>
        </div>
        <Switch
          id="view-mode"
          checked={viewMode === 'admin'}
          onCheckedChange={(checked) => onViewModeChange(checked ? 'admin' : 'player')}
        />
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-blue-600" />
          <Label htmlFor="view-mode" className="text-sm font-medium cursor-pointer">
            Admin View
          </Label>
        </div>
      </div>
      <p className="text-xs text-gray-500 mt-2">Development mode only</p>
    </div>
  );
}
