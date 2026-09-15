import React from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Mail, FileText, ScrollText } from 'lucide-react';
import { AdminEmailBlast } from './AdminEmailBlast';
import { EmailTemplateEditor } from './EmailTemplateEditor';
import { TermsConditionsManager } from './TermsConditionsManager';

export function AdminCommunication() {
  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex items-center gap-3">
        <Mail className="h-7 w-7 text-green-600 shrink-0" />
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Communication</h1>
      </div>

      <Tabs defaultValue="email-blast">
        <TabsList className="w-full grid grid-cols-3 h-auto">
          <TabsTrigger
            value="email-blast"
            className="flex-col gap-1 px-1 py-2 text-xs leading-tight whitespace-normal sm:flex-row sm:gap-2 sm:px-2 sm:py-1 sm:text-sm sm:whitespace-nowrap"
            aria-label="Email Blast"
          >
            <Mail className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">Blast</span>
            <span className="hidden sm:inline">Email Blast</span>
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="flex-col gap-1 px-1 py-2 text-xs leading-tight whitespace-normal sm:flex-row sm:gap-2 sm:px-2 sm:py-1 sm:text-sm sm:whitespace-nowrap"
            aria-label="Email Templates"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">Templates</span>
            <span className="hidden sm:inline">Email Templates</span>
          </TabsTrigger>
          <TabsTrigger
            value="terms"
            className="flex-col gap-1 px-1 py-2 text-xs leading-tight whitespace-normal sm:flex-row sm:gap-2 sm:px-2 sm:py-1 sm:text-sm sm:whitespace-nowrap"
            aria-label="Terms and Conditions"
          >
            <ScrollText className="h-4 w-4 shrink-0" />
            <span className="sm:hidden">Terms</span>
            <span className="hidden sm:inline">Terms & Conditions</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="email-blast" className="mt-4">
          <AdminEmailBlast />
        </TabsContent>

        <TabsContent value="templates" className="mt-4">
          <EmailTemplateEditor />
        </TabsContent>

        <TabsContent value="terms" className="mt-4">
          <TermsConditionsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}
