import React, { useState } from 'react';
import { LayoutDashboard, Users, Building2, UserCheck, CalendarDays, Columns3, LogOut, Menu, X } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../ui/utils';
import type { SupportView } from './SupportConsole';

interface SupportLayoutProps {
  currentView: SupportView;
  onNavigate: (view: SupportView) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const navItems: { view: SupportView; label: string; icon: React.ElementType }[] = [
  { view: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { view: 'users', label: 'Users', icon: Users },
  { view: 'facilities', label: 'Facilities', icon: Building2 },
  { view: 'members', label: 'Members', icon: UserCheck },
  { view: 'bookings', label: 'Bookings', icon: CalendarDays },
  { view: 'courts', label: 'Courts', icon: Columns3 },
];

export function SupportLayout({ currentView, onNavigate, onLogout, children }: SupportLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleNav = (view: SupportView) => {
    onNavigate(view);
    setSidebarOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r flex flex-col transition-transform duration-300',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'md:translate-x-0 md:static md:z-auto'
      )}>
        {/* Header */}
        <div className="flex items-center justify-between h-14 px-4 border-b">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <span className="text-white text-sm font-bold">SC</span>
            </div>
            <span className="font-semibold text-sm">Support Console</span>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1 rounded-md hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ view, label, icon: Icon }) => (
            <button
              key={view}
              onClick={() => handleNav(view)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                currentView === view
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
              )}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-3 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={onLogout}
            className="w-full justify-start text-gray-600 hover:text-red-600"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <header className="sticky top-0 z-30 flex items-center h-14 px-4 bg-white border-b md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-md hover:bg-gray-100"
          >
            <Menu className="h-6 w-6" />
          </button>
          <span className="ml-3 font-semibold text-sm">Support Console</span>
        </header>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
