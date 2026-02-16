import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Loader2, Save, RotateCcw, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react';
import { adminApi } from '../../api/client';
import { toast } from 'sonner';
import { useAppContext } from '../../contexts/AppContext';

interface TemplateVariable {
  key: string;
  description: string;
  sampleValue: string;
}

interface EmailTemplate {
  id: string | null;
  templateType: string;
  subject: string;
  bodyHtml: string;
  isEnabled: boolean;
  isCustom: boolean;
  label: string;
  description: string;
  availableVariables: TemplateVariable[];
}

export function EmailTemplateEditor() {
  const { selectedFacilityId } = useAppContext();
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedType, setExpandedType] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState('');
  const [editBody, setEditBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewSubject, setPreviewSubject] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (selectedFacilityId) {
      loadTemplates();
    }
  }, [selectedFacilityId]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await adminApi.getEmailTemplates(selectedFacilityId);
      if (response.success && response.data?.templates) {
        setTemplates(response.data.templates);
      } else {
        toast.error('Failed to load email templates');
      }
    } catch {
      toast.error('Error loading templates');
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = (templateType: string) => {
    if (expandedType === templateType) {
      setExpandedType(null);
      setShowPreview(false);
      return;
    }
    const template = templates.find(t => t.templateType === templateType);
    if (template) {
      setEditSubject(template.subject);
      setEditBody(template.bodyHtml);
      setExpandedType(templateType);
      setShowPreview(false);
      setPreviewHtml('');
    }
  };

  const handleToggleEnabled = async (templateType: string, enabled: boolean) => {
    const template = templates.find(t => t.templateType === templateType);
    if (!template) return;

    try {
      const response = await adminApi.upsertEmailTemplate(selectedFacilityId, templateType, {
        subject: template.subject,
        bodyHtml: template.bodyHtml,
        isEnabled: enabled,
      });

      if (response.success) {
        setTemplates(prev => prev.map(t =>
          t.templateType === templateType ? { ...t, isEnabled: enabled, isCustom: true } : t
        ));
        toast.success(`${template.label} ${enabled ? 'enabled' : 'disabled'}`);
      } else {
        toast.error('Failed to update template');
      }
    } catch {
      toast.error('Error updating template');
    }
  };

  const handleSave = async () => {
    if (!expandedType) return;

    if (!editSubject.trim() || !editBody.trim()) {
      toast.error('Subject and body are required');
      return;
    }

    try {
      setSaving(true);
      const template = templates.find(t => t.templateType === expandedType);
      const response = await adminApi.upsertEmailTemplate(selectedFacilityId, expandedType, {
        subject: editSubject,
        bodyHtml: editBody,
        isEnabled: template?.isEnabled !== false,
      });

      if (response.success) {
        setTemplates(prev => prev.map(t =>
          t.templateType === expandedType
            ? { ...t, subject: editSubject, bodyHtml: editBody, isCustom: true }
            : t
        ));
        toast.success('Template saved');
      } else {
        toast.error('Failed to save template');
      }
    } catch {
      toast.error('Error saving template');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async (templateType: string) => {
    const confirmed = window.confirm('Reset this template to the default? Your customizations will be lost.');
    if (!confirmed) return;

    try {
      const response = await adminApi.resetEmailTemplate(selectedFacilityId, templateType);
      if (response.success) {
        await loadTemplates();
        // Re-expand with fresh default data
        const freshTemplate = templates.find(t => t.templateType === templateType);
        if (freshTemplate && expandedType === templateType) {
          setEditSubject(freshTemplate.subject);
          setEditBody(freshTemplate.bodyHtml);
        }
        toast.success('Template reset to default');
      } else {
        toast.error('Failed to reset template');
      }
    } catch {
      toast.error('Error resetting template');
    }
  };

  const handlePreview = async () => {
    if (!expandedType) return;

    try {
      setLoadingPreview(true);
      const response = await adminApi.previewEmailTemplate(selectedFacilityId, expandedType, {
        subject: editSubject,
        bodyHtml: editBody,
      });

      if (response.success && response.data) {
        setPreviewSubject(response.data.renderedSubject);
        setPreviewHtml(response.data.renderedHtml);
        setShowPreview(true);
      } else {
        toast.error('Failed to generate preview');
      }
    } catch {
      toast.error('Error generating preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  const insertVariable = (variable: string) => {
    const textarea = bodyRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const newBody = editBody.substring(0, start) + variable + editBody.substring(end);
    setEditBody(newBody);

    // Restore cursor position after the inserted variable
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-green-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        Customize the automated emails sent to members. Toggle emails on/off or edit the content and subject lines.
      </p>

      {templates.map(template => (
        <Card key={template.templateType} className={expandedType === template.templateType ? 'ring-2 ring-green-500' : ''}>
          <CardHeader
            className="cursor-pointer hover:bg-gray-50 transition-colors"
            onClick={() => handleExpand(template.templateType)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {template.label}
                    {template.isCustom && (
                      <Badge variant="secondary" className="text-xs">Custom</Badge>
                    )}
                    {!template.isCustom && (
                      <Badge variant="outline" className="text-xs">Default</Badge>
                    )}
                  </CardTitle>
                  <p className="text-sm text-gray-500 mt-1">{template.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
                  <Label htmlFor={`toggle-${template.templateType}`} className="text-xs text-gray-500">
                    {template.isEnabled ? 'On' : 'Off'}
                  </Label>
                  <Switch
                    id={`toggle-${template.templateType}`}
                    checked={template.isEnabled}
                    onCheckedChange={(checked) => handleToggleEnabled(template.templateType, checked)}
                  />
                </div>
                {expandedType === template.templateType
                  ? <ChevronUp className="h-4 w-4 text-gray-400" />
                  : <ChevronDown className="h-4 w-4 text-gray-400" />
                }
              </div>
            </div>
          </CardHeader>

          {expandedType === template.templateType && (
            <CardContent className="border-t pt-4 space-y-4">
              {/* Subject */}
              <div className="space-y-2">
                <Label htmlFor="template-subject">Subject Line</Label>
                <Input
                  id="template-subject"
                  value={editSubject}
                  onChange={e => setEditSubject(e.target.value)}
                  placeholder="Email subject..."
                />
              </div>

              {/* Available Variables */}
              <div className="space-y-2">
                <Label>Available Variables <span className="text-gray-400 font-normal">(click to insert)</span></Label>
                <div className="flex flex-wrap gap-2">
                  {template.availableVariables.map(v => (
                    <button
                      key={v.key}
                      onClick={() => insertVariable(v.key)}
                      className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-mono bg-gray-100 hover:bg-green-100 hover:text-green-700 border border-gray-200 hover:border-green-300 transition-colors"
                      title={v.description}
                    >
                      {v.key}
                    </button>
                  ))}
                </div>
              </div>

              {/* Body Editor */}
              <div className="space-y-2">
                <Label htmlFor="template-body">Email Body (HTML)</Label>
                <textarea
                  ref={bodyRef}
                  id="template-body"
                  className="flex min-h-[250px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  value={editBody}
                  onChange={e => setEditBody(e.target.value)}
                  placeholder="Email HTML body..."
                />
                <p className="text-xs text-gray-500">
                  Use HTML for formatting. Variables like {'{{playerName}}'} will be replaced with actual values.
                </p>
              </div>

              {/* Preview */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (showPreview) {
                      setShowPreview(false);
                    } else {
                      handlePreview();
                    }
                  }}
                  disabled={loadingPreview}
                  className="gap-2"
                >
                  {loadingPreview ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : showPreview ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                  {showPreview ? 'Hide Preview' : 'Preview with Sample Data'}
                </Button>
              </div>

              {showPreview && previewHtml && (
                <Card className="bg-gray-50">
                  <CardContent className="pt-4">
                    <p className="text-xs text-gray-500 mb-1">Subject: <strong>{previewSubject}</strong></p>
                    <div
                      className="bg-white rounded-lg border overflow-hidden"
                      dangerouslySetInnerHTML={{ __html: previewHtml }}
                    />
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="flex items-center gap-3 pt-2">
                <Button
                  onClick={handleSave}
                  disabled={saving}
                  className="gap-2 bg-green-600 hover:bg-green-700"
                >
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? 'Saving...' : 'Save Template'}
                </Button>
                {template.isCustom && (
                  <Button
                    variant="outline"
                    onClick={() => handleReset(template.templateType)}
                    className="gap-2"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Reset to Default
                  </Button>
                )}
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
