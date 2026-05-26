import React, { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Home, Plus, Upload, X } from 'lucide-react';
import { addressWhitelistApi } from '../../api/client';
import {
  parseWhitelistCsv,
  parseWhitelistWorkbook,
  toWhitelistImportEntries,
} from '../../../shared/utils/parseWhitelistSpreadsheet';
import { toast } from 'sonner';

interface WhitelistEntry {
  id: string;
  address: string;
  lastName: string;
  email: string | null;
  accountsLimit: number;
  setupInviteSentAt: string | null;
  setupInviteAcceptedAt: string | null;
}

interface AddressWhitelistPanelProps {
  facilityId: string | null;
}

export function AddressWhitelistPanel({ facilityId }: AddressWhitelistPanelProps) {
  const [whitelistAddresses, setWhitelistAddresses] = useState<WhitelistEntry[]>([]);
  const [newAddress, setNewAddress] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newWhitelistEmail, setNewWhitelistEmail] = useState('');
  const [whitelistUploading, setWhitelistUploading] = useState(false);
  const whitelistFileRef = useRef<HTMLInputElement>(null);

  const loadWhitelistAddresses = async () => {
    if (!facilityId) return;

    try {
      const response = await addressWhitelistApi.getAll(facilityId);
      if (response.success && response.data?.addresses) {
        setWhitelistAddresses(response.data.addresses);
      }
    } catch (error) {
      console.error('Error loading whitelist addresses:', error);
    }
  };

  useEffect(() => {
    if (facilityId) {
      loadWhitelistAddresses();
    } else {
      setWhitelistAddresses([]);
    }
  }, [facilityId]);

  const handleAddAddress = async () => {
    if (!facilityId) return;

    if (!newAddress.trim()) {
      toast.error('Please enter an address');
      return;
    }

    try {
      const response = await addressWhitelistApi.add(
        facilityId,
        newAddress.trim(),
        999,
        newLastName.trim(),
        newWhitelistEmail.trim() || undefined
      );

      if (response.success) {
        setNewAddress('');
        setNewLastName('');
        setNewWhitelistEmail('');
        toast.success(
          newWhitelistEmail.trim()
            ? 'Address added and setup invite sent'
            : 'Address added to whitelist'
        );
        loadWhitelistAddresses();
      } else {
        toast.error(response.error || 'Failed to add address');
      }
    } catch (error) {
      console.error('Error adding address:', error);
      toast.error('Failed to add address');
    }
  };

  const handleWhitelistFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !facilityId) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'xlsx', 'xls'].includes(ext || '')) {
      toast.error('Please select a CSV or Excel (.xlsx, .xls) file');
      return;
    }

    setWhitelistUploading(true);

    try {
      const parsed =
        ext === 'csv'
          ? parseWhitelistCsv(await file.text())
          : parseWhitelistWorkbook(await file.arrayBuffer());
      const addresses = toWhitelistImportEntries(parsed);

      if (addresses.length === 0) {
        toast.error('No addresses found in file');
        return;
      }

      const payload = addresses.map((a) => ({
        address: a.address,
        lastName: a.lastName,
        email: a.email,
        accountsLimit: a.accountsLimit || 999,
      }));

      const response = await addressWhitelistApi.bulkAdd(facilityId, payload);
      if (response.success) {
        const added = response.data?.added ?? 0;
        const skipped = response.data?.skipped ?? 0;
        const msg =
          skipped > 0
            ? `Imported ${added} of ${addresses.length} rows (${skipped} duplicate${skipped === 1 ? '' : 's'} skipped)`
            : `Imported ${added} address${added === 1 ? '' : 'es'}`;
        toast.success(msg);
        loadWhitelistAddresses();
      } else {
        toast.error(response.error || 'Failed to import addresses');
      }
    } catch (error) {
      console.error('Error importing whitelist file:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to read file. Check the format and try again.');
    } finally {
      setWhitelistUploading(false);
      if (whitelistFileRef.current) whitelistFileRef.current.value = '';
    }
  };

  const handleRemoveAddress = async (addressId: string) => {
    if (!facilityId) return;

    try {
      const response = await addressWhitelistApi.remove(facilityId, addressId);

      if (response.success) {
        toast.success('Address removed from whitelist');
        loadWhitelistAddresses();
      } else {
        toast.error(response.error || 'Failed to remove address');
      }
    } catch (error) {
      console.error('Error removing address:', error);
      toast.error('Failed to remove address');
    }
  };

  if (!facilityId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-gray-500 text-sm">
          Select a facility to add new members.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Home className="h-5 w-5" />
          Add New Member
        </CardTitle>
        <CardDescription>
          Approved addresses and last names auto-approve new members. Optional email sends a setup invite link.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div>
          <Label className="text-sm font-medium">Add New Entry</Label>
          <div className="flex flex-col gap-2 mt-2 sm:flex-row sm:flex-wrap">
            <Input
              placeholder="Enter full address..."
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddAddress();
                }
              }}
              className="flex-1 min-w-[200px]"
            />
            <Input
              placeholder="Last name..."
              value={newLastName}
              onChange={(e) => setNewLastName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddAddress();
                }
              }}
              className="w-40"
            />
            <Input
              type="email"
              placeholder="Email (optional)"
              value={newWhitelistEmail}
              onChange={(e) => setNewWhitelistEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddAddress();
                }
              }}
              className="w-48"
            />
            <Button onClick={handleAddAddress}>
              <Plus className="h-4 w-4 mr-2" />
              Add
            </Button>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">Import from File</Label>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <input
              ref={whitelistFileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleWhitelistFileUpload}
              className="hidden"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => whitelistFileRef.current?.click()}
              disabled={whitelistUploading}
            >
              <Upload className="h-4 w-4 mr-1" />
              {whitelistUploading ? 'Importing...' : 'Import from Excel/CSV'}
            </Button>
            <span className="text-xs text-gray-500">
              File should have &quot;Address&quot; and &quot;Last Name&quot; columns. Optional &quot;Email&quot; sends a setup invite.
            </span>
          </div>
        </div>

        <div>
          <Label className="text-sm font-medium">Whitelisted Entries ({whitelistAddresses.length})</Label>
          <div className="mt-2 space-y-2 max-h-[28rem] overflow-y-auto">
            {whitelistAddresses.length === 0 ? (
              <p className="text-center py-4 text-gray-500 text-sm">
                No entries in whitelist. Add addresses to enable auto-approval.
              </p>
            ) : (
              whitelistAddresses.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Home className="h-4 w-4 text-gray-400 flex-shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm truncate">
                        {item.address}
                        {item.lastName && <span className="text-gray-500"> — {item.lastName}</span>}
                      </span>
                      {item.email && (
                        <span className="text-xs text-gray-500 truncate">{item.email}</span>
                      )}
                      {item.email && (
                        <span className="text-xs text-gray-400">
                          {item.setupInviteAcceptedAt
                            ? 'Joined'
                            : item.setupInviteSentAt
                              ? `Invite sent ${new Date(item.setupInviteSentAt).toLocaleDateString()}`
                              : 'Invite pending'}
                        </span>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveAddress(item.id)}
                    className="text-red-600 hover:text-red-700 h-8 w-8 p-0 flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
