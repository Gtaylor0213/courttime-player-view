import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Alert, AlertDescription } from '../ui/alert';
import { Trash2, Mail } from 'lucide-react';
import { useRegistration } from './RegistrationContext';

export function AdminsStep() {
  const {
    formData,
    addAdminInvite, updateAdminInvite, removeAdminInvite,
  } = useRegistration();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">Additional Administrators (Optional)</h3>
        <p className="text-sm text-gray-600 mb-6">
          Invite other administrators to help manage your facility. You can also do this later from the admin dashboard.
        </p>
      </div>

      <Button
        type="button"
        onClick={addAdminInvite}
        variant="outline"
        className="w-full"
      >
        <Mail className="h-4 w-4 mr-2" />
        Add Admin Invitation
      </Button>

      {formData.adminInvites.length > 0 && (
        <div className="space-y-3 mt-6">
          <h4 className="font-semibold">Admin Invitations ({formData.adminInvites.length})</h4>
          {formData.adminInvites.map((invite) => (
            <div key={invite.id} className="flex gap-2">
              <div className="flex-1">
                <Input
                  type="email"
                  value={invite.email}
                  onChange={(e) => updateAdminInvite(invite.id, e.target.value)}
                  placeholder="admin@email.com"
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => removeAdminInvite(invite.id)}
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {formData.adminInvites.length === 0 && (
        <Alert>
          <AlertDescription>
            You can skip this step and invite administrators later from your facility dashboard.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
