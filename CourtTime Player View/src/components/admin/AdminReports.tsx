import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Badge } from '../ui/badge';
import { BarChart2, Download, TrendingUp } from 'lucide-react';
import { reportingApi } from '../../api/client';
import { useAppContext } from '../../contexts/AppContext';
import { toast } from 'sonner';

type TransactionType =
  | 'court_booking' | 'guest_fee' | 'bulletin_signup'
  | 'payment_item' | 'annual_fee' | 'pro_shop';

interface Transaction {
  id: string;
  date: string;
  member_name: string | null;
  member_email: string | null;
  type: TransactionType;
  description: string;
  amount_cents: number;
  status: string;
}

interface SummaryRow {
  type: TransactionType;
  total_cents: number;
  count: number;
}

const TYPE_LABELS: Record<string, string> = {
  court_booking:    'Court Booking',
  guest_fee:        'Guest Fee',
  bulletin_signup:  'Bulletin Signup',
  payment_item:     'Payment Item',
  annual_fee:       'Annual Fee',
  pro_shop:         'Pro Shop',
};

const TYPE_COLORS: Record<string, string> = {
  court_booking:   'bg-blue-100 text-blue-700',
  guest_fee:       'bg-teal-100 text-teal-700',
  bulletin_signup: 'bg-purple-100 text-purple-700',
  payment_item:    'bg-orange-100 text-orange-700',
  annual_fee:      'bg-green-100 text-green-700',
  pro_shop:        'bg-indigo-100 text-indigo-700',
};

function fmt(cents: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}

function exportCsv(transactions: Transaction[], start: string, end: string) {
  const header = ['Date', 'Member', 'Email', 'Type', 'Description', 'Amount', 'Status'];
  const rows = transactions.map(t => [
    new Date(t.date).toLocaleDateString(),
    t.member_name ?? '',
    t.member_email ?? '',
    TYPE_LABELS[t.type] ?? t.type,
    `"${(t.description ?? '').replace(/"/g, '""')}"`,
    (t.amount_cents / 100).toFixed(2),
    t.status,
  ]);
  const csv = [header, ...rows].map(r => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `transactions-${start}-to-${end}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AdminReports() {
  const { selectedFacilityId: facilityId } = useAppContext();
  const [startDate, setStartDate] = useState(firstOfMonthStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [typeFilter, setTypeFilter] = useState('all');
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [grandTotal, setGrandTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const loadReport = useCallback(async () => {
    if (!facilityId) return;
    setLoading(true);
    const res = await reportingApi.getTransactions(facilityId, { start: startDate, end: endDate, type: typeFilter });
    if (res.success) {
      const d = (res.data as any)?.data;
      setTransactions(d?.transactions ?? []);
      setSummary(d?.summary ?? []);
      setGrandTotal(d?.grand_total_cents ?? 0);
    } else {
      toast.error((res.error as string) || 'Failed to load report');
    }
    setLoading(false);
  }, [facilityId, startDate, endDate, typeFilter]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  if (!facilityId) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-gray-400">
          Select a facility to view reports.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <BarChart2 className="h-6 w-6 text-indigo-600" />
        <h1 className="text-2xl font-semibold text-gray-900">Reports</h1>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">From</label>
              <Input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">To</label>
              <Input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-40"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="court_booking">Court Booking</SelectItem>
                  <SelectItem value="guest_fee">Guest Fee</SelectItem>
                  <SelectItem value="payment_item">Payment Item</SelectItem>
                  <SelectItem value="bulletin_signup">Bulletin Signup</SelectItem>
                  <SelectItem value="annual_fee">Annual Fee</SelectItem>
                  <SelectItem value="pro_shop">Pro Shop</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 ml-auto">
              <Button variant="outline" size="sm"
                onClick={() => exportCsv(transactions, startDate, endDate)}
                disabled={transactions.length === 0}
              >
                <Download className="h-4 w-4 mr-1" /> Export CSV
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          {summary.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {summary.map(s => (
                <Card key={s.type}>
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${TYPE_COLORS[s.type] || 'bg-gray-100 text-gray-600'}`}>
                        {TYPE_LABELS[s.type] ?? s.type}
                      </span>
                      <span className="text-xs text-gray-400">{s.count} txn{s.count !== 1 ? 's' : ''}</span>
                    </div>
                    <p className="text-xl font-bold text-gray-900 mt-1">{fmt(s.total_cents)}</p>
                  </CardContent>
                </Card>
              ))}
              {/* Grand total */}
              <Card className="border-indigo-200 bg-indigo-50">
                <CardContent className="pt-4 pb-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-indigo-700 flex items-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Total
                    </span>
                    <span className="text-xs text-indigo-400">{transactions.length} txn{transactions.length !== 1 ? 's' : ''}</span>
                  </div>
                  <p className="text-xl font-bold text-indigo-900 mt-1">{fmt(grandTotal)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Transaction table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Transactions
                {transactions.length > 0 && (
                  <span className="ml-2 text-sm font-normal text-gray-400">({transactions.length})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {transactions.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-12">
                  No transactions found for this period.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                        <th className="text-left px-4 py-3 font-medium">Date</th>
                        <th className="text-left px-4 py-3 font-medium">Member</th>
                        <th className="text-left px-4 py-3 font-medium">Type</th>
                        <th className="text-left px-4 py-3 font-medium">Description</th>
                        <th className="text-right px-4 py-3 font-medium">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {transactions.map(t => (
                        <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                            {new Date(t.date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900">{t.member_name ?? '—'}</div>
                            {t.member_email && (
                              <div className="text-xs text-gray-400">{t.member_email}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <Badge
                              variant="secondary"
                              className={`text-xs ${TYPE_COLORS[t.type] || 'bg-gray-100 text-gray-600'}`}
                            >
                              {TYPE_LABELS[t.type] ?? t.type}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-gray-600 max-w-xs truncate">
                            {t.description}
                          </td>
                          <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                            {fmt(t.amount_cents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-gray-50">
                        <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-700">Total</td>
                        <td className="px-4 py-3 text-right text-base font-bold text-indigo-700">
                          {fmt(grandTotal)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
