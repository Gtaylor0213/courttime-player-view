import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Mail, FileText } from 'lucide-react';
import { AdminEmailBlast } from './AdminEmailBlast';
import { EmailTemplateEditor } from './EmailTemplateEditor';

export function AdminCommunication() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Mail className="h-7 w-7 text-green-600" />
        <h1 className="text-2xl font-bold text-gray-900">Communication</h1>
      </div>

      <Tabs defaultValue="email-blast">
        <TabsList>
          <TabsTrigger value="email-blast" className="gap-2">
            <Mail className="h-4 w-4" /> Email Blast
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="h-4 w-4" /> Email Templates
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email-blast" className="mt-4">
          <AdminEmailBlast />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <EmailTemplateEditor />
        </TabsContent>
      </Tabs>
    </div>
  );
}
