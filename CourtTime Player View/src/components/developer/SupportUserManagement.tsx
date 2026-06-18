import React, { useState, useEffect } from 'react';
import { Search, Mail, Key, User, Building2, Pencil, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../ui/dialog';
import { searchUsers, getUserProfile, sendPasswordResetEmail, setTemporaryPassword, updateUserAccount } from '../../api/supportClient';
import { toast } from 'sonner';

interface Props {
  selectedUserId: string | null;
  onSelectUser: (id: string | null) => void;
}

export function SupportUserManagement({ selectedUserId, onSelectUser }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [settingPassword, setSettingPassword] = useState(false);
  const [editingAccount, setEditingAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({ fullName: '', email: '', phone: '', userType: 'player' });
  const [savingAccount, setSavingAccount] = useState(false);

  // Debounced search
  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(async () => {
      setLoading(true);
      const res = await searchUsers(query);
      if (res.success) setResults(res.data);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Load profile when user selected
  useEffect(() => {
    if (!selectedUserId) { setProfile(null); return; }
    (async () => {
      setProfileLoading(true);
      const res = await getUserProfile(selectedUserId);
      if (res.success) {
        setProfile(res.data);
        setAccountForm({
          fullName: res.data.fullName || '',
          email: res.data.email || '',
          phone: res.data.phone || '',
          userType: res.data.userType || 'player',
        });
      }
      setProfileLoading(false);
    })();
  }, [selectedUserId]);

  const handleSendResetEmail = async () => {
    if (!selectedUserId) return;
    const res = await sendPasswordResetEmail(selectedUserId);
    if (res.success) toast.success('Password reset email sent');
    else toast.error(res.error || 'Failed to send email');
  };

  const handleSetTempPassword = async () => {
    if (!selectedUserId || !tempPassword) return;
    setSettingPassword(true);
    const res = await setTemporaryPassword(selectedUserId, tempPassword);
    if (res.success) {
      toast.success('Temporary password set successfully');
      setShowPasswordDialog(false);
      setTempPassword('');
    } else {
      toast.error(res.error || 'Failed to set password');
    }
    setSettingPassword(false);
  };

  const handleSaveAccount = async () => {
    if (!selectedUserId) return;
    setSavingAccount(true);
    const res = await updateUserAccount(selectedUserId, accountForm);
    if (res.success) {
      toast.success('Account updated');
      setEditingAccount(false);
      const refreshed = await getUserProfile(selectedUserId);
      if (refreshed.success) setProfile(refreshed.data);
    } else {
      toast.error(res.error || 'Failed to update account');
    }
    setSavingAccount(false);
  };

  const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#';
    let pwd = '';
    for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    setTempPassword(pwd);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Account Management</h1>
        <p className="text-sm text-gray-500 mt-1">Search users, edit accounts, reset passwords, and view memberships</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          placeholder="Search by name or email..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
          autoFocus
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Results list */}
        <div className="space-y-2">
          {loading && <p className="text-sm text-gray-500 py-4 text-center">Searching...</p>}
          {!loading && query.length >= 2 && results.length === 0 && (
            <p className="text-sm text-gray-500 py-4 text-center">No users found.</p>
          )}
          {results.map((user: any) => (
            <Card
              key={user.id}
              className={`cursor-pointer transition-colors ${selectedUserId === user.id ? 'ring-2 ring-indigo-500' : 'hover:bg-gray-50'}`}
              onClick={() => onSelectUser(user.id)}
            >
              <CardContent className="p-3 flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                  <User className="h-5 w-5 text-gray-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{user.fullName}</p>
                  <p className="text-xs text-gray-500 truncate">{user.email}</p>
                </div>
                <Badge variant="outline" className="text-xs shrink-0">
                  {user.facilityCount} {user.facilityCount === 1 ? 'facility' : 'facilities'}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Profile panel */}
        <div>
          {!selectedUserId && (
            <div className="text-center py-10 text-gray-400">
              <User className="h-12 w-12 mx-auto mb-2" />
              <p className="text-sm">Select a user to view their profile</p>
            </div>
          )}

          {profileLoading && (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
            </div>
          )}

          {profile && !profileLoading && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">{profile.fullName}</CardTitle>
                    <p className="text-sm text-gray-500">{profile.email}</p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setEditingAccount(!editingAccount)}>
                    {editingAccount ? 'Cancel' : <><Pencil className="h-4 w-4 mr-1" /> Edit</>}
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {editingAccount ? (
                  <div className="space-y-3 border rounded-lg p-3 bg-gray-50">
                    <div className="space-y-1">
                      <Label className="text-xs">Full Name</Label>
                      <Input value={accountForm.fullName} onChange={(e) => setAccountForm((p) => ({ ...p, fullName: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Email</Label>
                      <Input type="email" value={accountForm.email} onChange={(e) => setAccountForm((p) => ({ ...p, email: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Phone</Label>
                      <Input value={accountForm.phone} onChange={(e) => setAccountForm((p) => ({ ...p, phone: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">User Type</Label>
                      <Select value={accountForm.userType} onValueChange={(v) => setAccountForm((p) => ({ ...p, userType: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="player">Player</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button onClick={handleSaveAccount} disabled={savingAccount} size="sm">
                      <Save className="h-4 w-4 mr-1" />
                      {savingAccount ? 'Saving...' : 'Save Account'}
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <p className="text-gray-500 text-xs">Phone</p>
                      <p>{profile.phone || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Type</p>
                      <p className="capitalize">{profile.userType}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-gray-500 text-xs">Address</p>
                      <p>{[profile.streetAddress, profile.city, profile.state, profile.zipCode].filter(Boolean).join(', ') || '—'}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">Account Created</p>
                      <p>{new Date(profile.createdAt).toLocaleDateString()}</p>
                    </div>
                    <div>
                      <p className="text-gray-500 text-xs">User ID</p>
                      <p className="font-mono text-xs truncate">{profile.id}</p>
                    </div>
                  </div>
                )}

                {/* Memberships */}
                {profile.memberships.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Facility Memberships</p>
                    <div className="space-y-2">
                      {profile.memberships.map((m: any) => (
                        <div key={m.membershipId} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-sm">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-gray-400" />
                            <span>{m.facilityName}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {m.isFacilityAdmin && <Badge className="text-xs bg-green-100 text-green-700">Admin</Badge>}
                            <Badge variant={m.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                              {m.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="border-t pt-4 space-y-2">
                  <p className="text-sm font-medium">Password Management</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={handleSendResetEmail}>
                      <Mail className="h-4 w-4 mr-2" />
                      Send Reset Email
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => { setShowPasswordDialog(true); generateTempPassword(); }}>
                      <Key className="h-4 w-4 mr-2" />
                      Set Temporary Password
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Temporary Password Dialog */}
      <Dialog open={showPasswordDialog} onOpenChange={setShowPasswordDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Temporary Password</DialogTitle>
            <DialogDescription>
              Set a temporary password for {profile?.fullName}. The user should change it after logging in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder="Minimum 8 characters"
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                  className="font-mono"
                />
                <Button type="button" variant="outline" onClick={generateTempPassword}>Generate</Button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowPasswordDialog(false)}>Cancel</Button>
              <Button onClick={handleSetTempPassword} disabled={tempPassword.length < 8 || settingPassword}>
                {settingPassword ? 'Setting...' : 'Set Password'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
