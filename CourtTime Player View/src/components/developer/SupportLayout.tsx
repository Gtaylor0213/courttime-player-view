import React, { useState, useEffect, useCallback } from 'react';
import {
  LayoutDashboard, Users, Building2, UserCheck, CalendarDays, Columns3, LogOut, Menu, X,
  CreditCard, Tag, Search, Command,
} from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { cn } from '../ui/utils';
import { globalSearch } from '../../api/supportClient';
import type { SupportView } from './SupportConsole';

interface SupportLayoutProps {
  currentView: SupportView;
  onNavigate: (view: SupportView, facilityId?: string, userId?: string) => void;
  onLogout: () => void;
  children: React.ReactNode;
}

const navItems: { view: SupportView; label: string; icon: React.ElementType; section?: string }[] = [
  { view: 'dashboard', label: 'Command Center', icon: LayoutDashboard, section: 'overview' },
  { view: 'users', label: 'Accounts', icon: Users, section: 'customers' },
  { view: 'members', label: 'Members', icon: UserCheck, section: 'customers' },
  { view: 'subscriptions', label: 'Subscriptions', icon: CreditCard, section: 'billing' },
  { view: 'promos', label: 'Promo Codes', icon: Tag, section: 'billing' },
  { view: 'facilities', label: 'Facilities', icon: Building2, section: 'operations' },
  { view: 'courts', label: 'Courts', icon: Columns3, section: 'operations' },
  { view: 'bookings', label: 'Bookings', icon: CalendarDays, section: 'operations' },
];

const sections = [
  { id: 'overview', label: 'Overview' },
  { id: 'customers', label: 'Customers' },
  { id: 'billing', label: 'Billing' },
  { id: 'operations', label: 'Operations' },
];

export function SupportLayout({ currentView, onNavigate, onLogout, children }: SupportLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const handleNav = (view: SupportView) => {
    onNavigate(view);
    setSidebarOpen(false);
  };

  const runSearch = useCallback(async (q: string) => {
    if (q.length < 2) {
      setSearchResults(null);
      return;
    }
    const res = await globalSearch(q);
    if (res.success) setSearchResults(res.data);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => runSearch(searchQuery), 300);
    return () => clearTimeout(timer);
  }, [searchQuery, runSearch]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={cn(
        'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r flex flex-col transition-transform duration-300',
        sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        'md:translate-x-0 md:static md:z-auto'
      )}>
        <div className="flex items-center justify-between h-14 px-4 border-b">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <Command className="h-4 w-4 text-white" />
            </div>
            <div>
              <span className="font-semibold text-sm block leading-tight">CourtTime</span>
              <span className="text-[10px] text-gray-500 leading-tight">Business Console</span>
            </div>
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden p-1 rounded-md hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 overflow-y-auto">
          {sections.map((section) => (
            <div key={section.id} className="mb-4">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-1">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {navItems.filter((item) => item.section === section.id).map(({ view, label, icon: Icon }) => (
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
                    <Icon className="h-4 w-4" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>

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

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 flex items-center gap-3 h-14 px-4 bg-white border-b">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-md hover:bg-gray-100 md:hidden"
          >
            <Menu className="h-6 w-6" />
          </button>

          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search users, facilities, emails..."
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              onBlur={() => setTimeout(() => setSearchOpen(false), 200)}
              className="pl-9 h-9"
            />
            {searchOpen && searchResults && (searchResults.users?.length > 0 || searchResults.facilities?.length > 0) && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
                {searchResults.users?.length > 0 && (
                  <div className="p-2">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase px-2 mb-1">Users</p>
                    {searchResults.users.map((u: any) => (
                      <button
                        key={u.id}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm"
                        onMouseDown={() => { onNavigate('users', undefined, u.id); setSearchQuery(''); setSearchOpen(false); }}
                      >
                        <p className="font-medium">{u.fullName}</p>
                        <p className="text-xs text-gray-500">{u.email}</p>
                      </button>
                    ))}
                  </div>
                )}
                {searchResults.facilities?.length > 0 && (
                  <div className="p-2 border-t">
                    <p className="text-[10px] font-semibold text-gray-400 uppercase px-2 mb-1">Facilities</p>
                    {searchResults.facilities.map((f: any) => (
                      <button
                        key={f.id}
                        className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm"
                        onMouseDown={() => { onNavigate('facilities', f.id); setSearchQuery(''); setSearchOpen(false); }}
                      >
                        <p className="font-medium">{f.name}</p>
                        <p className="text-xs text-gray-500">{[f.city, f.state].filter(Boolean).join(', ')}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
