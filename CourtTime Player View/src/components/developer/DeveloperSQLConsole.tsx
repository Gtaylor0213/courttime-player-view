import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import {
  Play,
  Download,
  Trash2,
  Clock,
  AlertCircle,
  Loader2,
  History
} from 'lucide-react';
import { executeSQL } from '../../api/developerClient';

interface QueryHistoryItem {
  sql: string;
  timestamp: number;
  success: boolean;
  rowCount?: number;
}

// Pre-built query templates
const QUERY_TEMPLATES = [
  { name: 'All users', sql: 'SELECT * FROM users LIMIT 50' },
  { name: 'All facilities', sql: 'SELECT * FROM facilities' },
  { name: 'Recent bookings', sql: 'SELECT b.*, u.email, c.name as court_name\nFROM bookings b\nJOIN users u ON b.user_id = u.id\nJOIN courts c ON b.court_id = c.id\nORDER BY b.created_at DESC\nLIMIT 20' },
  { name: 'Facility memberships', sql: 'SELECT fm.*, u.email, f.name as facility_name\nFROM facility_memberships fm\nJOIN users u ON fm.user_id = u.id\nJOIN facilities f ON fm.facility_id = f.id\nLIMIT 50' },
  { name: 'Booking counts by date', sql: 'SELECT booking_date, COUNT(*) as count\nFROM bookings\nGROUP BY booking_date\nORDER BY booking_date DESC\nLIMIT 30' },
  { name: 'Users by facility', sql: 'SELECT f.name, COUNT(fm.user_id) as member_count\nFROM facilities f\nLEFT JOIN facility_memberships fm ON f.id = fm.facility_id\nGROUP BY f.id, f.name\nORDER BY member_count DESC' },
  { name: 'Table sizes', sql: 'SELECT schemaname, relname as table_name, n_live_tup as row_count\nFROM pg_stat_user_tables\nORDER BY n_live_tup DESC' },
];

const HISTORY_KEY = 'developer_sql_history';
const MAX_HISTORY = 20;

export function DeveloperSQLConsole() {
  const [sql, setSQL] = useState('SELECT * FROM users LIMIT 10');
  const [results, setResults] = useState<any[] | null>(null);
  const [fields, setFields] = useState<string[]>([]);
  const [rowCount, setRowCount] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState('');
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [history, setHistory] = useState<QueryHistoryItem[]>([]);

  // Load history from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch {
        setHistory([]);
      }
    }
  }, []);

  // Save history to localStorage
  const saveHistory = (items: QueryHistoryItem[]) => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
    setHistory(items);
  };

  // Add to history
  const addToHistory = (query: string, success: boolean, count?: number) => {
    const item: QueryHistoryItem = {
      sql: query,
      timestamp: Date.now(),
      success,
      rowCount: count
    };

    // Remove duplicates and limit history
    const filtered = history.filter(h => h.sql !== query);
    const updated = [item, ...filtered].slice(0, MAX_HISTORY);
    saveHistory(updated);
  };

  // Execute query
  const handleExecute = async () => {
    if (!sql.trim()) return;

    setError('');
    setResults(null);
    setIsExecuting(true);
    const startTime = Date.now();

    try {
      const result = await executeSQL(sql);

      setExecutionTime(Date.now() - startTime);

      if (result.success && result.data) {
        setResults(result.data.rows);
        setFields(result.data.fields);
        setRowCount(result.data.rowCount);
        addToHistory(sql, true, result.data.rowCount);
      } else {
        setError(result.error || 'Query execution failed');
        addToHistory(sql, false);
      }
    } catch (err) {
      setError('Failed to execute query');
      addToHistory(sql, false);
    } finally {
      setIsExecuting(false);
    }
  };

  // Export results
  const handleExport = (format: 'json' | 'csv') => {
    if (!results || results.length === 0) return;

    let data: string;
    let contentType: string;

    if (format === 'json') {
      data = JSON.stringify(results, null, 2);
      contentType = 'application/json';
    } else {
      const headers = fields.join(',');
      const rows = results.map(row =>
        fields.map(f => {
          const value = row[f];
          if (value === null || value === undefined) return '';
          const str = String(value);
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        }).join(',')
      );
      data = [headers, ...rows].join('\n');
      contentType = 'text/csv';
    }

    const blob = new Blob([data], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `query_results.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Clear history
  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  // Format cell value
  const formatCellValue = (value: any): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'object') return JSON.stringify(value);
    const str = String(value);
    return str.length > 100 ? str.slice(0, 97) + '...' : str;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">SQL Console</h1>
          <p className="text-zinc-400 text-sm mt-1">
            Execute SELECT queries against the database
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Query Editor */}
        <div className="lg:col-span-3 space-y-3">
          {/* Templates */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-300">Templates:</span>
            <Select onValueChange={(sql) => setSQL(sql)}>
              <SelectTrigger className="w-48 bg-black border-zinc-600 text-white">
                <SelectValue placeholder="Select template..." />
              </SelectTrigger>
              <SelectContent>
                {QUERY_TEMPLATES.map((t, i) => (
                  <SelectItem key={i} value={t.sql}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* SQL Input */}
          <Textarea
            value={sql}
            onChange={(e) => setSQL(e.target.value)}
            placeholder="Enter your SELECT query..."
            className="bg-black border-zinc-600 text-white font-mono text-sm min-h-[150px]"
            onKeyDown={(e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                handleExecute();
              }
            }}
          />

          {/* Execute Button */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                onClick={handleExecute}
                disabled={isExecuting || !sql.trim()}
              >
                {isExecuting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Execute
                  </>
                )}
              </Button>
              <span className="text-xs text-zinc-400">Ctrl+Enter to run</span>
            </div>

            {executionTime !== null && !error && (
              <div className="flex items-center gap-2 text-sm text-zinc-400">
                <Clock className="h-4 w-4" />
                <span>{executionTime}ms</span>
                <span>·</span>
                <span>{rowCount} rows</span>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/30 p-3 rounded-md border border-red-700">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Results */}
          {results && results.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-400">
                  {results.length} results
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => handleExport('csv')}
                    variant="outline"
                    size="sm"
                    className="border-zinc-600 text-white hover:bg-zinc-800"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    CSV
                  </Button>
                  <Button
                    onClick={() => handleExport('json')}
                    variant="outline"
                    size="sm"
                    className="border-zinc-600 text-white hover:bg-zinc-800"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    JSON
                  </Button>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden">
                <div className="overflow-x-auto max-h-[400px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-zinc-900">
                      <TableRow className="border-zinc-700">
                        {fields.map((field) => (
                          <TableHead key={field} className="text-zinc-300 font-mono text-xs">
                            {field}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((row, idx) => (
                        <TableRow key={idx} className="border-zinc-700 hover:bg-zinc-800">
                          {fields.map((field) => (
                            <TableCell key={field} className="text-white font-mono text-xs">
                              {formatCellValue(row[field])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}

          {results && results.length === 0 && (
            <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-8 text-center text-zinc-400">
              Query executed successfully but returned no results
            </div>
          )}
        </div>

        {/* History Sidebar */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-sm font-medium text-zinc-300">
              <History className="h-4 w-4" />
              Query History
            </h2>
            {history.length > 0 && (
              <Button
                onClick={clearHistory}
                variant="ghost"
                size="sm"
                className="h-6 text-xs text-zinc-400 hover:text-white"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>

          {history.length === 0 ? (
            <div className="text-sm text-zinc-500 text-center py-8">
              No query history yet
            </div>
          ) : (
            <div className="space-y-2">
              {history.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => setSQL(item.sql)}
                  className={`w-full text-left p-2 rounded-md text-xs font-mono bg-zinc-900 border hover:border-green-600 transition-colors ${
                    item.success ? 'border-zinc-700' : 'border-red-700'
                  }`}
                >
                  <div className="truncate text-white">
                    {item.sql.slice(0, 50)}...
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-zinc-400">
                    <span>{new Date(item.timestamp).toLocaleTimeString()}</span>
                    {item.rowCount !== undefined && (
                      <>
                        <span>·</span>
                        <span>{item.rowCount} rows</span>
                      </>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
