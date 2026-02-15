import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { AlertCircle, Loader2 } from 'lucide-react';
import { createRecord, updateRecord, getForeignKeyOptions } from '../../api/developerClient';

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

interface DeveloperRecordFormProps {
  tableName: string;
  schema: ColumnInfo[];
  record?: Record<string, any>;
  onClose: () => void;
  onSuccess: () => void;
}

export function DeveloperRecordForm({
  tableName,
  schema,
  record,
  onClose,
  onSuccess
}: DeveloperRecordFormProps) {
  const isEditing = !!record;
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [fkOptions, setFkOptions] = useState<Record<string, Array<{ value: string; label: string }>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Initialize form data
  useEffect(() => {
    if (record) {
      setFormData({ ...record });
    } else {
      // Set defaults for new record
      const defaults: Record<string, any> = {};
      schema.forEach(col => {
        if (col.defaultValue && !col.isPrimaryKey) {
          // Parse common defaults
          if (col.defaultValue.includes('uuid_generate')) {
            // Let server generate UUID
          } else if (col.defaultValue === 'true') {
            defaults[col.name] = true;
          } else if (col.defaultValue === 'false') {
            defaults[col.name] = false;
          } else if (col.defaultValue.includes('CURRENT_TIMESTAMP')) {
            // Let server set timestamp
          } else {
            defaults[col.name] = col.defaultValue.replace(/^'|'$/g, '');
          }
        }
      });
      setFormData(defaults);
    }
  }, [record, schema]);

  // Load foreign key options
  useEffect(() => {
    const loadFkOptions = async () => {
      const fkColumns = schema.filter(c => c.isForeignKey && c.foreignTable);

      for (const col of fkColumns) {
        if (col.foreignTable && col.foreignColumn) {
          const result = await getForeignKeyOptions(col.foreignTable, col.foreignColumn);
          if (result.success && result.data) {
            setFkOptions(prev => ({
              ...prev,
              [col.name]: result.data!.options
            }));
          }
        }
      }
    };

    loadFkOptions();
  }, [schema]);

  // Get editable columns (exclude auto-generated)
  const editableColumns = schema.filter(col => {
    // Always exclude primary key when creating
    if (!isEditing && col.isPrimaryKey) return false;
    // Exclude auto-timestamps when creating
    if (!isEditing && (col.name === 'created_at' || col.name === 'updated_at')) return false;
    // When editing, exclude primary key and created_at
    if (isEditing && col.isPrimaryKey) return false;
    if (isEditing && col.name === 'created_at') return false;
    return true;
  });

  // Handle field change
  const handleChange = (name: string, value: any) => {
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    try {
      // Clean up form data - remove undefined/null for create
      const cleanData: Record<string, any> = {};
      for (const [key, value] of Object.entries(formData)) {
        if (value !== undefined && value !== '' && value !== null) {
          cleanData[key] = value;
        } else if (isEditing) {
          // For editing, explicitly set null for cleared fields
          const col = schema.find(c => c.name === key);
          if (col && col.nullable) {
            cleanData[key] = null;
          }
        }
      }

      const pkColumn = schema.find(c => c.isPrimaryKey)?.name || 'id';

      let result;
      if (isEditing) {
        result = await updateRecord(tableName, record[pkColumn], cleanData);
      } else {
        result = await createRecord(tableName, cleanData);
      }

      if (result.success) {
        onSuccess();
      } else {
        setError(result.error || 'Failed to save record');
      }
    } catch (err) {
      setError('Failed to save record');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Render field based on column type
  const renderField = (column: ColumnInfo) => {
    const value = formData[column.name];

    // Foreign key dropdown
    if (column.isForeignKey && fkOptions[column.name]) {
      return (
        <Select
          value={value || ''}
          onValueChange={(v) => handleChange(column.name, v || null)}
        >
          <SelectTrigger className="bg-black border-zinc-600 text-white">
            <SelectValue placeholder="Select..." />
          </SelectTrigger>
          <SelectContent>
            {column.nullable && (
              <SelectItem value="">None</SelectItem>
            )}
            {fkOptions[column.name].map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    // Boolean field
    if (column.type === 'boolean') {
      return (
        <div className="flex items-center gap-2">
          <Switch
            checked={value || false}
            onCheckedChange={(checked) => handleChange(column.name, checked)}
          />
          <span className="text-sm text-zinc-300">{value ? 'Yes' : 'No'}</span>
        </div>
      );
    }

    // JSON field
    if (column.type === 'json' || column.type === 'jsonb') {
      return (
        <Textarea
          value={typeof value === 'object' ? JSON.stringify(value, null, 2) : value || ''}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value);
              handleChange(column.name, parsed);
            } catch {
              handleChange(column.name, e.target.value);
            }
          }}
          className="bg-black border-zinc-600 text-white font-mono text-xs"
          rows={4}
        />
      );
    }

    // Text/long text field
    if (column.type === 'text') {
      return (
        <Textarea
          value={value || ''}
          onChange={(e) => handleChange(column.name, e.target.value)}
          className="bg-black border-zinc-600 text-white"
          rows={3}
        />
      );
    }

    // Number fields
    if (column.type === 'integer' || column.type === 'bigint' || column.type === 'smallint') {
      return (
        <Input
          type="number"
          value={value ?? ''}
          onChange={(e) => handleChange(column.name, e.target.value ? parseInt(e.target.value) : null)}
          className="bg-black border-zinc-600 text-white"
        />
      );
    }

    if (column.type === 'numeric' || column.type === 'decimal' || column.type === 'real' || column.type === 'double precision') {
      return (
        <Input
          type="number"
          step="any"
          value={value ?? ''}
          onChange={(e) => handleChange(column.name, e.target.value ? parseFloat(e.target.value) : null)}
          className="bg-black border-zinc-600 text-white"
        />
      );
    }

    // Date/time fields
    if (column.type === 'date') {
      return (
        <Input
          type="date"
          value={value ? value.split('T')[0] : ''}
          onChange={(e) => handleChange(column.name, e.target.value)}
          className="bg-black border-zinc-600 text-white"
        />
      );
    }

    if (column.type === 'time' || column.type.includes('time without')) {
      return (
        <Input
          type="time"
          value={value || ''}
          onChange={(e) => handleChange(column.name, e.target.value)}
          className="bg-black border-zinc-600 text-white"
        />
      );
    }

    if (column.type.includes('timestamp')) {
      return (
        <Input
          type="datetime-local"
          value={value ? new Date(value).toISOString().slice(0, 16) : ''}
          onChange={(e) => handleChange(column.name, e.target.value ? new Date(e.target.value).toISOString() : null)}
          className="bg-black border-zinc-600 text-white"
        />
      );
    }

    // Default text input
    return (
      <Input
        type="text"
        value={value || ''}
        onChange={(e) => handleChange(column.name, e.target.value)}
        className="bg-black border-zinc-600 text-white"
      />
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="bg-zinc-900 border-zinc-700 text-white max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Record' : 'Create Record'}
          </DialogTitle>
          <DialogDescription className="text-zinc-400">
            {isEditing
              ? `Update record in ${tableName}`
              : `Add a new record to ${tableName}`
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {editableColumns.map((column) => (
            <div key={column.name} className="space-y-2">
              <Label className="text-white flex items-center gap-2">
                <span className="font-mono text-sm">{column.name}</span>
                <span className="text-xs text-zinc-400">
                  ({column.type})
                  {column.nullable && ' • optional'}
                  {column.isForeignKey && column.foreignTable && ` • → ${column.foreignTable}`}
                </span>
              </Label>
              {renderField(column)}
            </div>
          ))}

          {error && (
            <div className="flex items-center gap-2 text-red-400 text-sm bg-red-900/30 p-3 rounded-md border border-red-700">
              <AlertCircle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
              className="border-zinc-600 text-white hover:bg-zinc-800"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : isEditing ? (
                'Update Record'
              ) : (
                'Create Record'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
