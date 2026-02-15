import React, { useEffect, useState, useMemo } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  Download,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  ArrowUpDown,
  ArrowUp,
  ArrowDown
} from 'lucide-react';
import {
  getRecords,
  getTableSchema,
  deleteRecord,
  exportTable
} from '../../api/developerClient';
import { DeveloperRecordForm } from './DeveloperRecordForm';

interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  foreignTable?: string;
  foreignColumn?: string;
}

interface DeveloperTableViewProps {
  tableName: string;
  onBack: () => void;
}

export function DeveloperTableView({ tableName, onBack }: DeveloperTableViewProps) {
  const [records, setRecords] = useState<any[]>([]);
  const [schema, setSchema] = useState<ColumnInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Pagination
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);

  // Search & Sort
  const [searchQuery, setSearchQuery] = useState('');
  const [orderBy, setOrderBy] = useState('created_at');
  const [orderDir, setOrderDir] = useState<'asc' | 'desc'>('desc');

  // Modals
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<any | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; record: any } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Load schema
  useEffect(() => {
    const loadSchema = async () => {
      const result = await getTableSchema(tableName);
      if (result.success && result.data) {
        setSchema(result.data.schema);
        // Set default orderBy to first column if created_at doesn't exist
        const hasCreatedAt = result.data.schema.some((c: ColumnInfo) => c.name === 'created_at');
        if (!hasCreatedAt && result.data.schema.length > 0) {
          setOrderBy(result.data.schema[0].name);
        }
      }
    };
    loadSchema();
  }, [tableName]);

  // Load records
  const loadRecords = async () => {
    setIsLoading(true);
    setError('');

    try {
      const result = await getRecords(tableName, page, limit, searchQuery || undefined, orderBy, orderDir);

      if (result.success && result.data) {
        setRecords(result.data.data);
        setTotal(result.data.total);
        setTotalPages(result.data.totalPages);
      } else {
        setError(result.error || 'Failed to load records');
      }
    } catch (err) {
      setError('Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, [tableName, page, limit, searchQuery, orderBy, orderDir]);

  // Get primary key column
  const pkColumn = useMemo(() => {
    return schema.find(c => c.isPrimaryKey)?.name || 'id';
  }, [schema]);

  // Get display columns (exclude large text fields for table view)
  const displayColumns = useMemo(() => {
    return schema.filter(c => {
      // Always show primary key
      if (c.isPrimaryKey) return true;
      // Hide large text fields in list view
      if (c.type === 'text' || c.type === 'json' || c.type === 'jsonb') return false;
      return true;
    }).slice(0, 8); // Limit to 8 columns for readability
  }, [schema]);

  // Handle sort
  const handleSort = (column: string) => {
    if (orderBy === column) {
      setOrderDir(orderDir === 'asc' ? 'desc' : 'asc');
    } else {
      setOrderBy(column);
      setOrderDir('desc');
    }
    setPage(1);
  };

  // Handle search
  const handleSearch = (value: string) => {
    setSearchQuery(value);
    setPage(1);
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteConfirm) return;

    setIsDeleting(true);
    try {
      const result = await deleteRecord(tableName, deleteConfirm.id);

      if (result.success) {
        setDeleteConfirm(null);
        loadRecords();
      } else {
        setError(result.error || 'Failed to delete record');
      }
    } catch (err) {
      setError('Failed to delete record');
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle export
  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const data = await exportTable(tableName, format);
      const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableName}_export.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError('Failed to export table');
    }
  };

  // Format cell value for display
  const formatCellValue = (value: any, column: ColumnInfo): string => {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (column.type === 'timestamp' || column.type.includes('timestamp')) {
      return new Date(value).toLocaleString();
    }
    if (typeof value === 'object') return JSON.stringify(value).slice(0, 50);
    const str = String(value);
    return str.length > 50 ? str.slice(0, 47) + '...' : str;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white font-mono">{tableName}</h1>
          <p className="text-zinc-400 text-sm mt-1">
            {total.toLocaleString()} records · {schema.length} columns
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => handleExport('csv')} variant="outline" size="sm" className="border-zinc-600 text-white hover:bg-zinc-800">
            <Download className="h-4 w-4 mr-2" />
            CSV
          </Button>
          <Button onClick={() => handleExport('json')} variant="outline" size="sm" className="border-zinc-600 text-white hover:bg-zinc-800">
            <Download className="h-4 w-4 mr-2" />
            JSON
          </Button>
          <Button onClick={() => setShowCreateForm(true)} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Add Record
          </Button>
        </div>
      </div>

      {/* Search & Controls */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-10 bg-black border-zinc-600 text-white placeholder-zinc-500"
          />
        </div>
        <Select value={limit.toString()} onValueChange={(v) => { setLimit(parseInt(v)); setPage(1); }}>
          <SelectTrigger className="w-32 bg-black border-zinc-600 text-white">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 rows</SelectItem>
            <SelectItem value="25">25 rows</SelectItem>
            <SelectItem value="50">50 rows</SelectItem>
            <SelectItem value="100">100 rows</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={loadRecords} variant="outline" size="sm" className="border-zinc-600 text-white hover:bg-zinc-800">
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/30 p-3 rounded-md border border-red-700">
          <AlertCircle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-green-500" />
          </div>
        ) : records.length === 0 ? (
          <div className="text-center py-20 text-zinc-400">
            No records found
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-zinc-700 hover:bg-zinc-800">
                  {displayColumns.map((column) => (
                    <TableHead
                      key={column.name}
                      className="text-zinc-300 cursor-pointer hover:text-white"
                      onClick={() => handleSort(column.name)}
                    >
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-xs">{column.name}</span>
                        {orderBy === column.name ? (
                          orderDir === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                        ) : (
                          <ArrowUpDown className="h-3 w-3 opacity-30" />
                        )}
                      </div>
                    </TableHead>
                  ))}
                  <TableHead className="text-zinc-300 w-24">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((record, idx) => (
                  <TableRow key={record[pkColumn] || idx} className="border-zinc-700 hover:bg-zinc-800">
                    {displayColumns.map((column) => (
                      <TableCell key={column.name} className="text-white font-mono text-xs">
                        {formatCellValue(record[column.name], column)}
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingRecord(record)}
                          className="h-8 w-8 p-0 text-zinc-300 hover:text-white"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteConfirm({ id: record[pkColumn], record })}
                          className="h-8 w-8 p-0 text-zinc-300 hover:text-red-400"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-zinc-400">
            Showing {((page - 1) * limit) + 1} to {Math.min(page * limit, total)} of {total.toLocaleString()}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="border-zinc-600 text-white hover:bg-zinc-800"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-zinc-400 px-2">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="border-zinc-600 text-white hover:bg-zinc-800"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Create Form Dialog */}
      {showCreateForm && (
        <DeveloperRecordForm
          tableName={tableName}
          schema={schema}
          onClose={() => setShowCreateForm(false)}
          onSuccess={() => {
            setShowCreateForm(false);
            loadRecords();
          }}
        />
      )}

      {/* Edit Form Dialog */}
      {editingRecord && (
        <DeveloperRecordForm
          tableName={tableName}
          schema={schema}
          record={editingRecord}
          onClose={() => setEditingRecord(null)}
          onSuccess={() => {
            setEditingRecord(null);
            loadRecords();
          }}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteConfirm} onOpenChange={() => setDeleteConfirm(null)}>
        <DialogContent className="bg-zinc-900 border-zinc-700 text-white">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertCircle className="h-5 w-5" />
              Delete Record?
            </DialogTitle>
            <DialogDescription className="text-zinc-400">
              Are you sure you want to delete this record? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {deleteConfirm && (
            <div className="bg-black p-3 rounded-md font-mono text-xs overflow-auto max-h-40">
              <pre className="text-white">
                {JSON.stringify(deleteConfirm.record, null, 2)}
              </pre>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm(null)}
              disabled={isDeleting}
              className="border-zinc-600 text-white hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Record'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
